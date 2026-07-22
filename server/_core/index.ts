import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "./localAuth";
import { registerAttachmentRoutes } from "./attachmentRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
// serveStatic is inlined here to avoid importing vite.ts (which pulls in vite devDependencies)
import path from "path";
import fs from "fs";
function serveStatic(app: import("express").Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "..", "public");
  if (!fs.existsSync(distPath)) {
    const message = `Could not find the build directory: ${distPath}, make sure to build the client first`;
    if (ENV.isProduction) {
      throw new Error(message);
    }
    console.error(message);
  }
  // Hashed assets (JS/CSS) — cache forever (filename changes on rebuild)
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));
  // Everything else — no cache (index.html must always be fresh)
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));
  app.use("*", (_req: any, res: any) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

async function runMigrationsAtStartup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // In production validateRequiredSecrets() already throws; this guard only
    // applies to local dev where DATABASE_URL may legitimately be absent.
    console.warn("[migrate] DATABASE_URL is not set, skipping auto-migration");
    return;
  }
  // Resolve the migrations folder relative to this file so it works both in
  // development (server/_core/index.ts → ../../drizzle) and in production
  // (dist/_core/index.js → ../../drizzle, since the Dockerfile copies drizzle/).
  const migrationsFolder = path.resolve(import.meta.dirname, "../../drizzle");
  if (!fs.existsSync(migrationsFolder)) {
    console.warn(`[migrate] Migrations folder not found at ${migrationsFolder}, skipping auto-migration`);
    return;
  }
  try {
    console.log("[migrate] Running pending database migrations...");
    const pool = mysql.createPool(url);
    const migrationDb = drizzle(pool);
    try {
      await migrate(migrationDb, { migrationsFolder });
      console.log("[migrate] Migrations completed successfully");
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error(
      `[migrate] Migration failed at ${migrationsFolder} — continuing without applying. ` +
      "Verify journal vs files in drizzle/meta/_journal.json. " +
      "Set STRICT_MIGRATIONS=1 in production to make this fatal.",
      error
    );
    if (process.env.NODE_ENV === "production" && process.env.STRICT_MIGRATIONS === "1") {
      throw error;
    }
  }
}

async function verifyDatabaseReadiness() {
  const database = await db.getDb();
  if (!database) {
    throw new Error("Database is not available. Check DATABASE_URL and database connectivity.");
  }

  await database.execute(sql`SELECT 1`);

  const productStageColumnResult = await database.execute(sql`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'manufacturingStage'
    LIMIT 1
  `);

  const rows = Array.isArray((productStageColumnResult as any)?.rows)
    ? (productStageColumnResult as any).rows
    : (productStageColumnResult as any);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      "Database schema is missing `products.manufacturingStage`. Run migrations before starting the server."
    );
  }
}
import { ENV, validateEmailConfig, validateCriticalConfig, validateRequiredSecrets } from "./env";
import { registerTwilioWebhooks } from "./twilioWebhooks";
import * as sendgridProvider from "./sendgridProvider";
import * as emailService from "./emailService";
import * as db from "../db";
import { getValidGoogleToken } from "../routers/middleware";
import { startEmailQueueWorker } from "../emailQueueWorker";
import { startOrchestrator } from "../supplyChainOrchestrator";
import { startScheduler } from "../aiAgentScheduler";
import { createLogger } from "./logger";
import { initErrorTracking, captureException } from "./errorTracking";

const logger = createLogger("Server");

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many OAuth callback requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

async function ensureTables() {
  try {
    const db = await import("../db");
    const database = await db.getDb();
    if (!database) return;
    const tables = [
      `CREATE TABLE IF NOT EXISTS fireflies_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        apiKey VARCHAR(512) NOT NULL,
        autoCreateContacts BOOLEAN DEFAULT FALSE,
        autoCreateTasks BOOLEAN DEFAULT FALSE,
        autoCreateProjects BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS fireflies_meetings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        firefliesId VARCHAR(128) NOT NULL UNIQUE,
        title VARCHAR(500) NOT NULL,
        date TIMESTAMP NULL,
        duration INT,
        organizerEmail VARCHAR(320),
        organizerName VARCHAR(255),
        participants TEXT,
        summary TEXT,
        shortSummary TEXT,
        keywords TEXT,
        topics TEXT,
        sentimentAnalysis TEXT,
        transcriptUrl TEXT,
        transcriptText TEXT,
        actionItems TEXT,
        processingStatus ENUM('pending','contacts_created','tasks_created','project_created','fully_processed','skipped','error') NOT NULL DEFAULT 'pending',
        processedAt TIMESTAMP NULL,
        processedBy INT,
        processingNotes TEXT,
        autoCreatedProjectId INT,
        autoCreatedTaskCount INT DEFAULT 0,
        autoCreatedContactCount INT DEFAULT 0,
        meetingSource VARCHAR(64),
        calendarEventId VARCHAR(255),
        recordingUrl TEXT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS fireflies_action_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meetingId INT NOT NULL,
        firefliesMeetingId VARCHAR(128) NOT NULL,
        text TEXT NOT NULL,
        assignee VARCHAR(255),
        assigneeEmail VARCHAR(320),
        dueDate TIMESTAMP NULL,
        projectTaskId INT,
        crmContactId INT,
        status ENUM('pending','converted_to_task','skipped','completed') NOT NULL DEFAULT 'pending',
        convertedAt TIMESTAMP NULL,
        convertedBy INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      // Orchestrator tables
      `CREATE TABLE IF NOT EXISTS supplyChainWorkflows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companyId INT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        workflowType ENUM('demand_forecasting','production_planning','material_requirements','procurement','inventory_reorder','inventory_transfer','inventory_optimization','work_order_generation','production_scheduling','freight_procurement','shipment_tracking','order_fulfillment','supplier_management','quality_inspection','invoice_matching','payment_processing','exception_handling','vendor_quote_procurement','vendor_quote_analysis','custom') NOT NULL,
        triggerType ENUM('scheduled','event','threshold','manual','continuous') DEFAULT 'scheduled' NOT NULL,
        cronSchedule VARCHAR(64),
        triggerEvents TEXT,
        thresholdConfig TEXT,
        executionConfig TEXT,
        maxConcurrentRuns INT DEFAULT 1,
        timeoutMinutes INT DEFAULT 60,
        retryAttempts INT DEFAULT 3,
        retryDelayMinutes INT DEFAULT 5,
        requiresApproval BOOLEAN DEFAULT FALSE,
        autoApproveThreshold DECIMAL(14,2),
        approvalRoles TEXT,
        escalationMinutes INT DEFAULT 60,
        escalationRoles TEXT,
        dependsOnWorkflows TEXT,
        isActive BOOLEAN DEFAULT TRUE NOT NULL,
        lastRunAt TIMESTAMP NULL,
        nextScheduledRun TIMESTAMP NULL,
        successCount INT DEFAULT 0,
        failureCount INT DEFAULT 0,
        createdBy INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS workflowRuns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workflowId INT NOT NULL,
        runNumber VARCHAR(64) NOT NULL,
        status ENUM('queued','running','awaiting_approval','approved','rejected','completed','failed','cancelled','timed_out') DEFAULT 'queued' NOT NULL,
        triggeredBy ENUM('schedule','event','threshold','manual','dependency') NOT NULL,
        triggerData TEXT,
        triggeredByUserId INT,
        startedAt TIMESTAMP NULL,
        completedAt TIMESTAMP NULL,
        durationMs INT,
        totalSteps INT DEFAULT 0,
        completedSteps INT DEFAULT 0,
        currentStepName VARCHAR(255),
        progressPercent INT DEFAULT 0,
        inputData TEXT,
        outputData TEXT,
        errorMessage TEXT,
        errorDetails TEXT,
        itemsProcessed INT DEFAULT 0,
        itemsSucceeded INT DEFAULT 0,
        itemsFailed INT DEFAULT 0,
        totalValue DECIMAL(14,2),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS approvalThresholds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companyId INT,
        name VARCHAR(255) NOT NULL,
        entityType ENUM('purchase_order','work_order','inventory_transfer','freight_booking','payment','vendor_rfq','price_override','exception') NOT NULL,
        autoApproveMaxAmount DECIMAL(14,2),
        level1MaxAmount DECIMAL(14,2),
        level2MaxAmount DECIMAL(14,2),
        level3MaxAmount DECIMAL(14,2),
        level1Roles TEXT,
        level2Roles TEXT,
        level3Roles TEXT,
        execRoles TEXT,
        level1EscalationMinutes INT DEFAULT 60,
        level2EscalationMinutes INT DEFAULT 120,
        level3EscalationMinutes INT DEFAULT 240,
        conditions TEXT,
        isActive BOOLEAN DEFAULT TRUE NOT NULL,
        createdBy INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS exceptionRules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companyId INT,
        name VARCHAR(255) NOT NULL,
        ruleType ENUM('price_variance','quantity_variance','delivery_delay','quality_issue','budget_exceeded','inventory_discrepancy','custom') NOT NULL,
        conditions TEXT,
        severity ENUM('low','medium','high','critical') DEFAULT 'medium' NOT NULL,
        autoResolveAction TEXT,
        notifyRoles TEXT,
        isActive BOOLEAN DEFAULT TRUE NOT NULL,
        createdBy INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS fundraising_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companyId INT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        targetAmount DECIMAL(15,2),
        raisedAmount DECIMAL(15,2) DEFAULT 0,
        minimumInvestment DECIMAL(15,2),
        valuation DECIMAL(15,2),
        roundType ENUM('pre_seed','seed','series_a','series_b','series_c','bridge','other') DEFAULT 'seed' NOT NULL,
        equityOffered DECIMAL(5,2),
        startDate TIMESTAMP NULL,
        targetCloseDate TIMESTAMP NULL,
        actualCloseDate TIMESTAMP NULL,
        status ENUM('planning','active','paused','closed','cancelled') DEFAULT 'planning' NOT NULL,
        dataRoomId INT,
        notes TEXT,
        createdBy INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      // ============================================
      // MARKETING — social scheduling, engagement, campaign ROI
      // (canonical schema lives in drizzle/0037_marketing_social.sql; mirrored
      // here so prod boots cleanly even if migrations have drifted.)
      // ============================================
      `CREATE TABLE IF NOT EXISTS social_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform ENUM('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
        handle VARCHAR(255) NOT NULL,
        displayName VARCHAR(255),
        avatarUrl TEXT,
        provider ENUM('ayrshare','direct','manual') NOT NULL DEFAULT 'ayrshare',
        providerProfileKey VARCHAR(255),
        status ENUM('active','disconnected','error') NOT NULL DEFAULT 'active',
        lastSyncedAt TIMESTAMP NULL,
        createdBy INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        goal ENUM('awareness','engagement','leads','conversions','retention') NOT NULL DEFAULT 'engagement',
        status ENUM('draft','active','paused','completed','archived') NOT NULL DEFAULT 'draft',
        startDate TIMESTAMP NULL,
        endDate TIMESTAMP NULL,
        budgetAmount DECIMAL(15,2),
        spendAmount DECIMAL(15,2) DEFAULT '0',
        currency VARCHAR(3) DEFAULT 'USD',
        targetTags TEXT,
        utmSource VARCHAR(128),
        utmMedium VARCHAR(128),
        utmCampaign VARCHAR(128),
        notes TEXT,
        createdBy INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS marketing_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campaignId INT,
        title VARCHAR(255),
        body TEXT NOT NULL,
        mediaUrls TEXT,
        platforms TEXT NOT NULL,
        accountIds TEXT,
        status ENUM('draft','scheduled','queued','posted','failed','cancelled') NOT NULL DEFAULT 'draft',
        scheduledAt TIMESTAMP NULL,
        postedAt TIMESTAMP NULL,
        externalIds TEXT,
        failureReason TEXT,
        aiGenerated BOOLEAN DEFAULT FALSE,
        createdBy INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS marketing_engagements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        postId INT,
        platform ENUM('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
        externalId VARCHAR(255) NOT NULL,
        type ENUM('like','comment','share','mention','dm','reaction') NOT NULL,
        authorHandle VARCHAR(255),
        authorName VARCHAR(255),
        authorAvatarUrl TEXT,
        body TEXT,
        permalink TEXT,
        sentiment ENUM('positive','neutral','negative','unknown') DEFAULT 'unknown',
        contactId INT,
        repliedAt TIMESTAMP NULL,
        fetchedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        occurredAt TIMESTAMP NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS marketing_metrics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        postId INT NOT NULL,
        platform ENUM('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
        impressions INT DEFAULT 0,
        reach INT DEFAULT 0,
        clicks INT DEFAULT 0,
        likes INT DEFAULT 0,
        comments INT DEFAULT 0,
        shares INT DEFAULT 0,
        saves INT DEFAULT 0,
        videoViews INT DEFAULT 0,
        recordedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      // ============================================
      // INFLUENCER CRM — creator relationships, deals, deliverables
      // (canonical schema lives in drizzle/0038_influencer_crm.sql)
      // ============================================
      `CREATE TABLE IF NOT EXISTS influencers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullName VARCHAR(255) NOT NULL,
        primaryHandle VARCHAR(255),
        primaryPlatform ENUM('linkedin','twitter','facebook','instagram','tiktok','youtube','threads'),
        handles TEXT,
        email VARCHAR(320),
        phone VARCHAR(32),
        agentName VARCHAR(255),
        agentEmail VARCHAR(320),
        websiteUrl TEXT,
        avatarUrl TEXT,
        followerCount INT DEFAULT 0,
        engagementRatePct DECIMAL(6,3),
        avgViews INT,
        tier ENUM('nano','micro','mid','macro','mega'),
        niche VARCHAR(128),
        tags TEXT,
        language VARCHAR(16),
        country VARCHAR(64),
        city VARCHAR(128),
        rateCard TEXT,
        currency VARCHAR(3) DEFAULT 'USD',
        preferredPaymentMethod VARCHAR(64),
        status ENUM('prospect','contacted','negotiating','agreed','active','completed','paused','blacklisted') NOT NULL DEFAULT 'prospect',
        leadSource ENUM('search','inbound','referral','agency','engagement_funnel','import','manual') DEFAULT 'manual',
        lastOutreachAt TIMESTAMP NULL,
        notes TEXT,
        crmContactId INT,
        assignedTo INT,
        createdBy INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS influencer_campaign_participations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        influencerId INT NOT NULL,
        campaignId INT NOT NULL,
        status ENUM('invited','negotiating','agreed','in_progress','completed','cancelled') NOT NULL DEFAULT 'invited',
        agreedFee DECIMAL(15,2),
        currency VARCHAR(3) DEFAULT 'USD',
        paymentStatus ENUM('pending','invoiced','paid','refunded') DEFAULT 'pending',
        productGifted BOOLEAN DEFAULT FALSE,
        briefUrl TEXT,
        contractUrl TEXT,
        trackingCode VARCHAR(64),
        notes TEXT,
        startDate TIMESTAMP NULL,
        endDate TIMESTAMP NULL,
        createdBy INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS influencer_deliverables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        participationId INT NOT NULL,
        type ENUM('post','story','reel','video','live','blog','podcast') NOT NULL,
        platform ENUM('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
        status ENUM('planned','submitted','approved','revision_requested','published','rejected') NOT NULL DEFAULT 'planned',
        scheduledAt TIMESTAMP NULL,
        publishedAt TIMESTAMP NULL,
        postUrl TEXT,
        marketingPostId INT,
        impressions INT DEFAULT 0,
        views INT DEFAULT 0,
        likes INT DEFAULT 0,
        comments INT DEFAULT 0,
        shares INT DEFAULT 0,
        saves INT DEFAULT 0,
        notes TEXT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS influencer_outreach (
        id INT AUTO_INCREMENT PRIMARY KEY,
        influencerId INT NOT NULL,
        campaignId INT,
        channel ENUM('email','dm','phone','in_person','agent','platform_message') NOT NULL,
        direction ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
        subject VARCHAR(255),
        body TEXT,
        response ENUM('pending','interested','not_interested','no_response','negotiating') DEFAULT 'pending',
        sentAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        respondedAt TIMESTAMP NULL,
        createdBy INT
      )`,
    ];
    // Add missing columns to existing tables
    const alterColumns = [
      "ALTER TABLE kpi_goals ADD COLUMN status ENUM('not_started','on_track','at_risk','behind','exceeded') DEFAULT 'not_started'",
      "ALTER TABLE kpi_goals ADD COLUMN notes TEXT",
      "ALTER TABLE kpi_goals ADD COLUMN companyId INT",
      "ALTER TABLE fundraising_campaigns ADD COLUMN actualCloseDate TIMESTAMP NULL",
      "ALTER TABLE fundraising_campaigns ADD COLUMN dataRoomId INT",
      "ALTER TABLE fundraising_campaigns ADD COLUMN createdBy INT",
      "ALTER TABLE fundraising_campaigns ADD COLUMN companyId INT",
    ];
    for (const alt of alterColumns) {
      try { await database.execute(require('drizzle-orm/sql').sql.raw(alt)); } catch { /* already exists */ }
    }
    for (const tableSQL of tables) {
      try { await database.execute(sql.raw(tableSQL)); } catch { /* already exists */ }
    }
    // Add missing columns to existing tables
    const alterStatements = [
      "ALTER TABLE fireflies_meetings ADD COLUMN videoUrl TEXT",
      "ALTER TABLE fireflies_meetings ADD COLUMN audioUrl TEXT",
      "ALTER TABLE fireflies_meetings ADD COLUMN crmContactId INT",
      "ALTER TABLE fireflies_meetings ADD COLUMN linkedEntityType VARCHAR(64)",
      "ALTER TABLE fireflies_meetings ADD COLUMN linkedEntityId INT",
    ];
    for (const sql of alterStatements) {
      try { await database.execute(require('drizzle-orm/sql').sql.raw(sql)); } catch { /* column already exists */ }
    }
    console.log("[Startup] Ensured critical tables exist");
  } catch (e) {
    console.warn("[Startup] Table check skipped:", e instanceof Error ? e.message : e);
  }
}

async function cleanupPlaceholders() {
  try {
    const db = await import("../db");
    const database = await db.getDb();
    if (!database) return;
    const schema = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // Delete placeholder stakeholders (Investor 1, 2, 3, etc.)
    const stakeholders = await database.select().from(schema.stakeholders);
    const placeholderSH = stakeholders.filter((s: any) => /^(Investor|Stakeholder|Placeholder)\s*\d+$/i.test(s.name || ""));
    for (const p of placeholderSH) {
      await database.delete(schema.stakeholders).where(eq(schema.stakeholders.id, p.id));
    }
    if (placeholderSH.length > 0) console.log(`[Cleanup] Deleted ${placeholderSH.length} placeholder stakeholders`);

    // Delete placeholder contacts (Contact 1, 2, 3, etc.)
    const contacts = await database.select().from(schema.crmContacts);
    const placeholderContacts = contacts.filter((c: any) => {
      const name = (c.fullName || c.firstName || "").trim();
      const source = (c.source || "").toLowerCase();
      return /^(Contact|Test|Placeholder|Sample)\s*\d*$/i.test(name) ||
        name === "" || name === "-" ||
        source === "contact_form";
    });
    for (const p of placeholderContacts) {
      await database.delete(schema.crmContacts).where(eq(schema.crmContacts.id, p.id));
    }
    if (placeholderContacts.length > 0) console.log(`[Cleanup] Deleted ${placeholderContacts.length} placeholder contacts`);

    // Delete all WhatsApp messages (placeholder/test data)
    try {
      await database.delete(schema.whatsappMessages);
      console.log("[Cleanup] Deleted all WhatsApp messages");
    } catch { /* table may not exist */ }

    // Delete data room ID 1
    try {
      await database.delete(schema.dataRoomChecklistItems).where(eq(schema.dataRoomChecklistItems.dataRoomId, 1));
      await database.delete(schema.dataRoomChecklists).where(eq(schema.dataRoomChecklists.dataRoomId, 1));
      await database.delete(schema.dataRoomDocuments).where(eq(schema.dataRoomDocuments.dataRoomId, 1));
      await database.delete(schema.dataRoomFolders).where(eq(schema.dataRoomFolders.dataRoomId, 1));
      await database.delete(schema.dataRoomLinks).where(eq(schema.dataRoomLinks.dataRoomId, 1));
      await database.delete(schema.dataRooms).where(eq(schema.dataRooms.id, 1));
      console.log("[Cleanup] Deleted data room ID 1");
    } catch (e) {
      // Data room tables may not exist yet
    }
  } catch (e) {
    console.warn("[Cleanup] Skipped:", e instanceof Error ? e.message : e);
  }
}

// Run CRM duplicate merges only when CRM_DEDUP_ON_STARTUP=true.
// Set that env var on the first deploy that includes migration 0035 so
// duplicates are eliminated *before* the UNIQUE indexes are created.
// Unset it after migration 0035 is applied to skip the full table scan
// on subsequent boots.
async function autoMergeCrmContacts() {
  if (!ENV.crmDedupOnStartup) return;
  try {
    const db = await import("../db");
    const groups = await db.findDuplicateCrmContactGroups();
    if (groups.length === 0) return;
    let merged = 0;
    for (const g of groups) {
      const sorted = [...g.contacts].sort((a: any, b: any) => a.id - b.id);
      const primary = sorted[0];
      const dupeIds = sorted.slice(1).map((c: any) => c.id);
      if (dupeIds.length === 0) continue;
      const result = await db.mergeCrmContacts(primary.id, dupeIds);
      merged += result.merged;
    }
    if (merged > 0) console.log(`[Cleanup] Auto-merged ${merged} duplicate CRM contacts across ${groups.length} groups`);
  } catch (e) {
    console.warn("[Cleanup] CRM auto-merge skipped:", e instanceof Error ? e.message : e);
  }
}

async function startServer() {
  await initErrorTracking();

  validateRequiredSecrets();
  validateCriticalConfig();

  // Merge CRM duplicates BEFORE migrations so migration 0035's UNIQUE
  // index creation doesn't fail with ER_DUP_ENTRY on existing rows.
  await autoMergeCrmContacts();

  await runMigrationsAtStartup();
  await verifyDatabaseReadiness();

  // Ensure critical tables exist + cleanup placeholders
  ensureTables()
    .then(() => cleanupPlaceholders())
    .catch(console.warn);

  const emailConfigValidation = validateEmailConfig();
  if (!emailConfigValidation.valid) {
    logger.warn("Some email configuration is missing — email features will be disabled", {
      errors: emailConfigValidation.errors,
    });
  }

  if (!ENV.cookieSecret) {
    console.error("[Security] CRITICAL: JWT_SECRET is not set. All session tokens are trivially forgeable. Set JWT_SECRET before deploying.");  }

  const app = express();

  // Trust exactly one proxy hop in production (Railway/Vercel reverse proxy)
  // so that req.secure / req.ip are derived from X-Forwarded-* headers correctly.
  if (ENV.isProduction) {
    app.set("trust proxy", 1);
  }

  const server = createServer(app);

  // ============================================
  // SECURITY HEADERS
  // ============================================
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self' https://fonts.gstatic.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // ============================================
  // RATE LIMITING
  // ============================================
  const apiLimiter = rateLimit({
    windowMs: 60_000, // 1 minute
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });

  app.use("/api/", apiLimiter);

  // CSRF protection: validate Origin header on state-changing requests
  app.use("/api/", (req, res, next) => {
    // Safe methods don't need CSRF protection
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const origin = req.headers.origin || req.headers.referer;
    if (!origin) {
      return res.status(403).json({ error: "Missing Origin header" });
    }

    // In production, validate origin matches our app URL
    if (ENV.isProduction && ENV.publicAppUrl) {
      try {
        const requestHost = new URL(origin as string).host;
        // Allow both the Railway domain and custom domain
        const allowedHosts = new Set([
          new URL(ENV.publicAppUrl).host,
          "app.superhumn.co",
          "aierpsystem-production.up.railway.app",
        ]);
        if (!allowedHosts.has(requestHost)) {
          return res.status(403).json({ error: "Origin mismatch" });
        }
      } catch {
        return res.status(403).json({ error: "Invalid Origin header" });
      }
    }

    next();
  });

  // OAuth callback rate limiter is defined at module scope above

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Auth routes (login, register)
  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);
  registerAttachmentRoutes(app);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================
  // SENDGRID WEBHOOK ENDPOINT
  // ============================================
  app.post('/webhooks/sendgrid/events', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const rawBody = req.body.toString();
      if (ENV.sendgridWebhookSecret) {
        const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
        const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
        if (!signature || !timestamp) {
          return res.status(401).json({ error: 'Missing signature headers' });
        }
        const isValid = sendgridProvider.verifyWebhookSignature(ENV.sendgridWebhookSecret, rawBody, signature, timestamp);
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
      let events: any[];
      try {
        events = JSON.parse(rawBody);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      if (!Array.isArray(events)) events = [events];
      for (const event of events) {
        try {
          const providerEventType = event.event;
          const providerMessageId = event.sg_message_id?.split('.')[0];
          const email = event.email;
          const timestamp = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
          const metadata = { reason: event.reason || event.response, bounceType: event.type };

          // Look up the linked message first to avoid inserting a bare row then a duplicate linked row
          const message = providerMessageId ? await db.getEmailMessageByProviderMessageId(providerMessageId) : null;

          // Insert a single event row, linking to the message when available
          await db.createEmailEvent({
            providerEventType,
            providerTimestamp: timestamp,
            providerMessageId,
            emailMessageId: message?.id,
            email,
            rawEventJson: metadata,
          } as any);

          if (message) {
            const newStatus = sendgridProvider.mapEventToStatus(providerEventType);
            if (newStatus) await db.updateEmailMessageStatus(message.id, newStatus);
          }
        } catch (eventError) {
          console.error('[SendGrid Webhook] Error processing event:', eventError);
        }
      }
      res.status(200).json({ received: events.length });
    } catch (error) {
      console.error('[SendGrid Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Shopify webhooks
  const handleShopifyWebhook = async (req: any, res: any, _topic?: string) => {
    try {
      const rawBody = req.body.toString();
      const { processShopifyWebhook } = await import('./shopify');
      const result = await processShopifyWebhook(rawBody, {
        hmac: req.headers['x-shopify-hmac-sha256'] as string,
        shopDomain: req.headers['x-shopify-shop-domain'] as string,
        topic: req.headers['x-shopify-topic'] as string,
      });
      if (!result.shouldProcess) {
        if (result.error === 'Already processed') return res.status(200).json({ success: true, message: 'Already processed' });
        return res.status(result.error === 'Invalid signature' ? 401 : 400).json({ error: result.error });
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Shopify Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  app.post('/webhooks/shopify/orders', express.raw({ type: 'application/json' }), (req, res) =>
    handleShopifyWebhook(req, res)
  );

  app.post('/webhooks/shopify/inventory', express.raw({ type: 'application/json' }), (req, res) =>
    handleShopifyWebhook(req, res)
  );

  // ============================================
  // EDI WEBHOOK ENDPOINT
  // ============================================

  // EDI webhook API key authentication middleware
  app.use("/webhooks/edi", (req, res, next) => {
    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    const expectedKey = process.env.EDI_WEBHOOK_SECRET;

    if (!expectedKey) {
      // No secret configured — allow in development, block in production
      if (ENV.isProduction) {
        return res.status(403).json({ error: "EDI webhook secret not configured" });
      }
      return next();
    }

    if (apiKey !== expectedKey) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    next();
  });

  app.post('/webhooks/edi/inbound', express.raw({ type: ['application/edi-x12', 'text/plain', 'application/octet-stream'] }), async (req, res) => {
    try {
      const { handleEdiWebhook } = await import('../ediTransportService');
      const rawContent = req.body.toString();

      if (!rawContent || rawContent.trim().length === 0) {
        return res.status(400).json({ error: 'Empty EDI content' });
      }

      const senderIsaId = req.headers['x-edi-sender-id'] as string | undefined;
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[key] = value;
      }

      const result = await handleEdiWebhook(rawContent, senderIsaId, headers);

      if (result.success) {
        console.log(`[EDI Webhook] Processed inbound document, transaction ID: ${result.transactionId}`);
        res.status(200).json(result);
      } else {
        console.warn(`[EDI Webhook] Processing failed: ${result.message}`);
        res.status(422).json(result);
      }
    } catch (error) {
      console.error('[EDI Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============================================
  // TWILIO WEBHOOK ENDPOINTS (voice + SMS)
  // ============================================
  registerTwilioWebhooks(app);

  // Shared handler for Google OAuth callbacks.
  // `selfRedirectUri` must exactly match the redirect_uri used when the auth URL was generated.
  async function handleGoogleOAuthCallback(req: any, res: any, selfRedirectUri: string) {
    const sanitizeReturnTo = (value: unknown): string => {
      if (typeof value !== 'string') return '/import';
      if (!value.startsWith('/')) return '/import';
      if (value.startsWith('//')) return '/import';
      if (value.includes('\\')) return '/import';
      if (/[\r\n\t]/.test(value)) return '/import';
      return value;
    };

    const { code, state } = req.query;
    let returnTo = '/import';
    if (!code || !state) return res.redirect(`${returnTo}?error=missing_params`);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.redirect(`${returnTo}?error=not_configured`);
    try {
      // Verify HMAC-signed state and authenticate session
      const { verifySignedOAuthState } = await import('./crypto');
      const stateData = verifySignedOAuthState(state as string);
      if (!stateData) return res.redirect(`${returnTo}?error=invalid_state`);
      // Use returnTo from state if the caller encoded one (e.g. Gmail/Workspace pages)
      returnTo = sanitizeReturnTo(stateData.returnTo);
      const { sdk: authSdk } = await import('./sdk');
      let user: any;
      try { user = await authSdk.authenticateRequest(req); } catch { return res.redirect(`${returnTo}?error=not_authenticated`); }
      if (!user) return res.redirect(`${returnTo}?error=not_authenticated`);
      if (stateData.userId !== user.id) return res.redirect(`${returnTo}?error=user_mismatch`);
      const userId = user.id;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: code as string, grant_type: 'authorization_code', redirect_uri: selfRedirectUri }),
      });
      if (!tokenResponse.ok) return res.redirect(`${returnTo}?error=token_exchange_failed`);
      const tokens = await tokenResponse.json();
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      let googleEmail = null;
      if (userInfoResponse.ok) { const userInfo = await userInfoResponse.json(); googleEmail = userInfo.email; }
      const { upsertGoogleOAuthToken } = await import('../db');
      await upsertGoogleOAuthToken({ userId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000), scope: tokens.scope, googleEmail });
      res.redirect(`${returnTo}?success=connected&google_connected=true`);
    } catch (error) {
      logger.error("Google OAuth error", { error: error instanceof Error ? error.message : String(error) });
      res.redirect(`${returnTo}?error=oauth_failed`);
    }
  }

  // Google OAuth callback — legacy path used by sheetsImport.getAuthUrl
  app.get('/api/google/callback', oauthCallbackLimiter, (req, res) => {
    const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/google/callback`;
    return handleGoogleOAuthCallback(req, res, redirectUri);
  });

  // Google OAuth callback — path used by gmail.getAuthUrl and googleWorkspace.getAuthUrl
  // (generated by getGoogleFullAccessAuthUrl in server/_core/googleDrive.ts)
  app.get('/api/oauth/google/callback', oauthCallbackLimiter, (req, res) => {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:3000'}/api/oauth/google/callback`;
    console.log(`[Google OAuth] Token exchange with redirect_uri: ${redirectUri}`);
    return handleGoogleOAuthCallback(req, res, redirectUri);
  });

  // Google Chat OAuth initiation — redirects the authenticated user to
  // Google's consent screen requesting the chat.messages scope. The flow
  // completes via /api/oauth/google/callback (handleGoogleOAuthCallback),
  // which persists the tokens with upsertGoogleOAuthToken.
  app.get('/api/google/chat/auth', oauthCallbackLimiter, async (req, res) => {
    const sanitizeReturnTo = (value: unknown): string => {
      if (typeof value !== 'string') return '/messaging';
      if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n\t]/.test(value)) {
        return '/messaging';
      }
      return value;
    };
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    try {
      if (!process.env.GOOGLE_CLIENT_ID) {
        return res.redirect('/messaging?error=google_oauth_not_configured');
      }
      const { sdk: authSdk } = await import('./sdk');
      let user: Awaited<ReturnType<typeof authSdk.authenticateRequest>> | null = null;
      try { user = await authSdk.authenticateRequest(req); } catch { user = null; }
      if (!user) return res.redirect(`/login?returnTo=${encodeURIComponent(`/api/google/chat/auth?returnTo=${encodeURIComponent(returnTo)}`)}`);

      const { getGoogleChatAuthUrl } = await import('./googleChat');
      return res.redirect(getGoogleChatAuthUrl(user.id, returnTo));
    } catch (error) {
      logger.error('Google Chat OAuth initiation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.redirect('/messaging?error=google_chat_oauth_failed');
    }
  });

  // Google Drive streaming proxy — fetches a Drive file's bytes using the
  // connected account's OAuth token (with service-account fallback) and pipes
  // them straight to the browser. This lets the data room viewer iframe load
  // private Drive files from our own origin, bypassing Google's third-party
  // iframe block, without ever persisting the file to our storage.
  //
  // Access control:
  //   - authenticated user must own the data room, OR
  //   - linkCode query param must resolve to an active share link for the
  //     data room that contains this document.
  app.get('/api/drive/proxy/:documentId', async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId, 10);
      if (!Number.isFinite(documentId)) return res.status(400).send('Invalid document id');

      const doc = await db.getDataRoomDocumentById(documentId);
      if (!doc) return res.status(404).send('Document not found');
      if (!doc.googleDriveFileId) return res.status(400).send('Not a Google Drive document');

      const dataRoom = await db.getDataRoomById(doc.dataRoomId);
      if (!dataRoom) return res.status(404).send('Data room not found');

      // Resolve who the Drive OAuth token should come from and authorize the
      // request. The data room owner's token is always the one used to fetch
      // the file — viewers never need their own Google connection.
      let ownerUserId: number | null = null;
      const linkCode = typeof req.query.linkCode === 'string' ? req.query.linkCode : null;

      if (linkCode) {
        const link = await db.getDataRoomLinkByCode(linkCode);
        if (!link || !link.isActive) return res.status(403).send('Share link is not active');
        if (link.expiresAt && new Date(link.expiresAt) < new Date()) return res.status(403).send('Share link has expired');
        if (link.dataRoomId !== doc.dataRoomId) return res.status(403).send('Document not in this data room');
        if (dataRoom.expiresAt && new Date(dataRoom.expiresAt) < new Date()) return res.status(403).send('Data room has expired');

        // Require a signed visitor session cookie issued by accessByLink.
        // Without this, anyone with the share link could pull file bytes
        // straight from /api/drive/proxy without entering an email or
        // signing the NDA — the gate is otherwise client-side only.
        const { readVisitorSessionCookie, verifyVisitorSession } = await import('./dataRoomVisitorSession');
        const session = await verifyVisitorSession(readVisitorSessionCookie(req));
        if (!session) return res.status(401).send('Visitor session required');
        if (session.linkCode !== linkCode) return res.status(403).send('Visitor session does not match this link');
        if (session.dataRoomId !== doc.dataRoomId) return res.status(403).send('Visitor session does not match this data room');

        // Anonymous sessions (no visitorId) are valid for links that don't
        // gate on email/name/company. Skip visitor-level checks in that case;
        // if the room needs an NDA but no visitor exists, deny — there's no
        // record we could have accepted on.
        if (session.visitorId !== undefined) {
          const visitor = await db.getDataRoomVisitorById(session.visitorId);
          if (!visitor) return res.status(403).send('Visitor not found');
          if (visitor.accessStatus !== 'active') return res.status(403).send(`Visitor access ${visitor.accessStatus}`);
          if (dataRoom.requiresNda && !visitor.ndaAcceptedAt) return res.status(403).send('NDA signature required');
        } else if (dataRoom.requiresNda) {
          return res.status(403).send('NDA signature required');
        }

        // Layered allowDownload: room AND link. When false, only allow
        // iframe loads (where the bytes feed the in-browser preview);
        // direct fetches/curl that would let the visitor save the file
        // get blocked. This is mitigation, not prevention — anything a
        // browser can render can ultimately be captured — but it stops
        // casual scraping and respects the configured policy.
        const effectiveAllowDownload =
          (dataRoom.allowDownload !== false) && (link.allowDownload !== false);
        if (!effectiveAllowDownload) {
          const fetchDest = req.headers['sec-fetch-dest'];
          const isIframe = fetchDest === 'iframe' || fetchDest === 'embed' || fetchDest === 'object';
          if (!isIframe) return res.status(403).send('Download not permitted for this data room');
        }

        ownerUserId = dataRoom.ownerId;
      } else {
        const { sdk } = await import('./sdk');
        let user: any = null;
        try { user = await sdk.authenticateRequest(req); } catch { /* unauthenticated */ }
        if (!user) return res.status(401).send('Not authenticated');
        if (user.id !== dataRoom.ownerId) return res.status(403).send('Forbidden');
        ownerUserId = user.id;
      }

      if (!ownerUserId) return res.status(500).send('Unable to resolve Drive owner');

      const { accessToken, error: tokenError } = await getValidGoogleToken(ownerUserId);
      if (tokenError || !accessToken) {
        return res.status(502).send(`Google Drive not connected: ${tokenError || 'no token'}`);
      }

      const { resolveDriveStreamUrl, driveFetch } = await import('./googleDrive');
      const { url, outMime } = resolveDriveStreamUrl(doc.googleDriveFileId, doc.mimeType || '');

      const driveResponse = await driveFetch(url, accessToken);
      if (!driveResponse.ok || !driveResponse.body) {
        const body = await driveResponse.text().catch(() => '');
        return res.status(driveResponse.status || 502).send(`Drive fetch failed: ${driveResponse.status}. ${body}`);
      }

      res.setHeader('Content-Type', driveResponse.headers.get('content-type') || outMime || 'application/octet-stream');
      const len = driveResponse.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name || 'file')}"`);
      res.setHeader('Cache-Control', 'private, max-age=60');

      // Pipe Drive's response body to the client. Node's fetch returns a web
      // ReadableStream; convert it to a Node stream for res.pipe semantics.
      const { Readable } = await import('node:stream');
      const nodeStream = Readable.fromWeb(driveResponse.body as any);
      nodeStream.pipe(res);
      nodeStream.on('error', (err) => {
        console.error('[DriveProxy] Stream error:', err);
        if (!res.headersSent) res.status(502);
        res.end();
      });
    } catch (err: any) {
      console.error('[DriveProxy] Handler error:', err);
      if (!res.headersSent) res.status(500).send(`Proxy error: ${err.message}`);
      else res.end();
    }
  });

  // Shopify OAuth callback
  app.get('/api/shopify/callback', oauthCallbackLimiter, async (req, res) => {
    const { code, shop, state } = req.query;
    if (!code || !shop || !state) return res.redirect('/settings/integrations?shopify_error=missing_params');
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.redirect('/settings/integrations?shopify_error=not_configured');
    try {
      const { sdk } = await import('./sdk');
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.redirect('/settings/integrations?shopify_error=not_authenticated'); }
      if (!user) return res.redirect('/settings/integrations?shopify_error=not_authenticated');
      const { verifySignedOAuthState } = await import('./crypto');
      const stateData = verifySignedOAuthState(state as string);
      if (!stateData) return res.redirect('/settings/integrations?shopify_error=invalid_state');
      const stateUserId = stateData.userId as number;
      const stateCompanyId = stateData.companyId as number | undefined;
      const stateShop = stateData.shop as string;
      if (stateUserId !== user.id) return res.redirect('/settings/integrations?shopify_error=user_mismatch');
      if (user.companyId && stateCompanyId !== user.companyId) return res.redirect('/settings/integrations?shopify_error=company_mismatch');
      let shopDomain = (shop as string).trim().toLowerCase();
      if (!shopDomain.endsWith('.myshopify.com')) return res.redirect('/settings/integrations?shopify_error=invalid_domain');
      if (stateShop !== shopDomain) return res.redirect('/settings/integrations?shopify_error=shop_mismatch');
      const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code as string }) });
      if (!tokenResponse.ok) return res.redirect('/settings/integrations?shopify_error=token_exchange_failed');
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const shopInfoResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } });
      if (!shopInfoResponse.ok) return res.redirect('/settings/integrations?shopify_error=failed_to_fetch_shop_info');
      const shopInfo = await shopInfoResponse.json();
      const { upsertShopifyStore, createSyncLog } = await import('../db');
      const { encrypt } = await import('../_core/crypto');
      const encryptedToken = encrypt(accessToken);
      await upsertShopifyStore(shopDomain, { storeDomain: shopDomain, storeName: shopInfo.shop.name || shopDomain, accessToken: encryptedToken, apiVersion: '2024-01', isEnabled: true, syncInventory: true, syncOrders: true, inventoryAuthority: 'hybrid' });
      await createSyncLog({ integration: 'shopify', action: 'store_connected', status: 'success', details: `Connected store: ${shopInfo.shop.name} (${shopDomain})` });
      res.redirect('/settings/integrations?shopify_success=connected&shop=' + encodeURIComponent(shopInfo.shop.name));
    } catch (error) {
      logger.error("Shopify OAuth error", { error: error instanceof Error ? error.message : String(error) });
      res.redirect('/settings/integrations?shopify_error=oauth_failed');
    }
  });

  // QuickBooks OAuth callback
  // YouTube (Google) OAuth callback for marketing connections.
  // On success, stores the access + refresh tokens + expiry under the
  // social_platform_credentials table so the publisher can use them.
  app.get('/api/oauth/youtube/callback', oauthCallbackLimiter, async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/marketing?yt_error=${encodeURIComponent(String(error))}`);
    if (!code || !state) return res.redirect('/marketing?yt_error=missing_params');
    try {
      // Match the Shopify callback pattern: re-authenticate the request and
      // verify the logged-in user matches the signed state. Mitigates risk if
      // a state token is exfiltrated.
      const { sdk } = await import('./sdk');
      let user: any;
      try { user = await sdk.authenticateRequest(req); }
      catch { return res.redirect('/marketing?yt_error=not_authenticated'); }
      if (!user) return res.redirect('/marketing?yt_error=not_authenticated');

      const { verifySignedOAuthState, encrypt } = await import('./crypto');
      const statePayload = verifySignedOAuthState(state as string);
      if (!statePayload || statePayload.provider !== 'youtube' || typeof statePayload.userId !== 'number') {
        return res.redirect('/marketing?yt_error=invalid_state');
      }
      if (statePayload.userId !== user.id) {
        return res.redirect('/marketing?yt_error=user_mismatch');
      }
      const userId = user.id;
      const { exchangeYouTubeCode, fetchYouTubeChannel } = await import('./youtube');
      const tokens = await exchangeYouTubeCode(code as string);
      const channel = await fetchYouTubeChannel(tokens.accessToken);
      const dbMod = await import('../db');
      // Encrypt tokens at rest. Decrypted via safeDecryptToken at use-time.
      await dbMod.upsertSocialPlatformCredential({
        platform: 'youtube',
        accountHandle: channel?.handle ?? null,
        externalAccountId: channel?.id ?? null,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        isActive: true,
        createdBy: userId,
      });
      res.redirect('/marketing?yt_success=connected');
    } catch (err: any) {
      logger.error("YouTube OAuth error", { error: err?.message ?? String(err) });
      res.redirect(`/marketing?yt_error=${encodeURIComponent(err?.message ?? 'oauth_failed')}`);
    }
  });

  app.get('/api/oauth/quickbooks/callback', oauthCallbackLimiter, async (req, res) => {
    const { code, state, realmId, error: intuitErrorCode, error_description } = req.query;
    // Intuit redirects back with ?error=... when authorization fails (e.g. user denied, no sandbox company)
    if (intuitErrorCode) {
      const detail = encodeURIComponent(String(error_description || intuitErrorCode));
      return res.redirect(`/settings/integrations?quickbooks_error=intuit_error&detail=${detail}`);
    }
    if (!code || !state || !realmId) return res.redirect('/settings/integrations?quickbooks_error=missing_params');
    try {
      const { sdk } = await import('./sdk');
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.redirect('/settings/integrations?quickbooks_error=not_authenticated'); }
      if (!user) return res.redirect('/settings/integrations?quickbooks_error=not_authenticated');
      const { validateOAuthState, exchangeCodeForToken } = await import('./quickbooks');
      const stateValidation = validateOAuthState(state as string);
      if (stateValidation.error || stateValidation.userId !== user.id) return res.redirect('/settings/integrations?quickbooks_error=invalid_state');
      const tokenResult = await exchangeCodeForToken(code as string);
      if (tokenResult.error) {
        const detail = tokenResult.intuitError ? `&detail=${encodeURIComponent(tokenResult.intuitError)}` : "";
        return res.redirect(`/settings/integrations?quickbooks_error=token_exchange_failed${detail}`);
      }
      const { upsertQuickBooksOAuthToken, createSyncLog } = await import('../db');
      await upsertQuickBooksOAuthToken({ userId: user.id, accessToken: tokenResult.access_token!, refreshToken: tokenResult.refresh_token!, expiresAt: new Date(Date.now() + (tokenResult.expires_in! * 1000)), realmId: realmId as string, scope: 'com.intuit.quickbooks.accounting' });
      await createSyncLog({ integration: 'quickbooks', action: 'connected', status: 'success', details: `QuickBooks connected - Realm ID: ${realmId}` });
      res.redirect('/settings/integrations?quickbooks_success=connected');
    } catch (error) {
      logger.error("QuickBooks OAuth error", { error: error instanceof Error ? error.message : String(error) });
      res.redirect('/settings/integrations?quickbooks_error=oauth_failed');
    }
  });

  // tRPC API
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  
  if (process.env.NODE_ENV === "development") {
    // Use a variable path to prevent esbuild from tracing this import at build time.
    // In development, tsx runs the source directly (no esbuild), so this resolves fine.
    const vitePath = "./vite" + "";
    const { setupVite } = await import(vitePath);
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) logger.info("Preferred port busy, using alternative", { preferredPort, port });

  server.listen(port, "0.0.0.0", () => {
    logger.info("Server started", { url: `http://0.0.0.0:${port}/`, port });

    // Start the email queue worker
    startEmailQueueWorker();

    // One-time cleanup: remove non-food products (equipment, machinery, etc.)
    (async () => {
      try {
        const db = await import("../db");
        const allProducts = await db.getDb().then(async (d) => {
          if (!d) return [];
          const { products } = await import("../../drizzle/schema");
          return d.select().from(products);
        });
        const equipmentKeywords = ["equipment", "machinery", "machine", "tools", "supplies", "office", "furniture", "hardware", "electronics", "forklift", "conveyor", "mixer", "oven", "printer", "computer", "laptop", "monitor", "desk"];
        const toDelete = allProducts.filter((p: any) => {
          const cat = (p.category || "").toLowerCase();
          const name = (p.name || "").toLowerCase();
          return equipmentKeywords.some(kw => cat.includes(kw) || name.includes(kw));
        });
        if (toDelete.length > 0) {
          for (const p of toDelete) {
            try { await db.deleteProduct(p.id); } catch { /* FK constraint, skip */ }
          }
          console.log(`[Startup] Cleaned up ${toDelete.length} non-food products (equipment/machinery)`);
        }
      } catch { /* skip */ }
    })();

    // Start EDI polling scheduler (check every 5 minutes)
    import('../ediTransportService').then(({ startEdiPolling }) => {
      startEdiPolling(5 * 60 * 1000);
    }).catch(err => {
      console.warn('[EDI Polling] Could not start polling scheduler:', err.message);
    });
    logger.info("Starting autonomous supply chain orchestrator");
    startOrchestrator().catch(err => {
      logger.error("Failed to start orchestrator — autonomous workflows disabled", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    logger.info("Starting AI agent scheduler");
    try {
      startScheduler();
    } catch (err) {
      logger.error("Failed to start AI agent scheduler — AI agent automation disabled", {
        error: err instanceof Error ? (err as Error).message : String(err),
      });
    }

    // Start email inbox polling (IMAP) — supports multiple inboxes
    (async () => {
      try {
        const { scanAndCategorizeInbox } = await import("./emailInboxScanner");
        const db = await import("../db");
        const { parseUploadedDocument } = await import("../documentImportService");

        const inboxes = [
          { host: process.env.IMAP_HOST, user: process.env.IMAP_USER, password: process.env.IMAP_PASSWORD, port: parseInt(process.env.IMAP_PORT || "993") },
          { host: process.env.IMAP_HOST_2, user: process.env.IMAP_USER_2, password: process.env.IMAP_PASSWORD_2, port: parseInt(process.env.IMAP_PORT_2 || "993") },
        ].filter(i => i.host && i.user && i.password);

        if (inboxes.length > 0) {
          const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
          console.log(`[Email Polling] Starting inbox scanner for ${inboxes.length} inbox(es) with 5m interval`);
          for (const inbox of inboxes) {
            console.log(`[Email Polling] Monitoring: ${inbox.user}`);
          }

          const processInbox = async (inbox: any) => {
            try {
              const { scanResult, parsedResults } = await scanAndCategorizeInbox(
                { host: inbox.host!, port: inbox.port, secure: true, auth: { user: inbox.user!, pass: inbox.password! } },
                { unseenOnly: true, limit: 50, fullAiParsing: true, markAsSeen: false }
              );

              // Save each email to DB and parse attachments
              for (const { email, parseResult } of parsedResults) {
                try {
                  // Save inbound email record
                  const savedEmail = await db.createInboundEmail?.({
                    messageId: email.messageId,
                    fromEmail: email.from.address,
                    fromName: email.from.name || "",
                    toEmail: email.to.join(", ") || "inbox",
                    subject: email.subject,
                    bodyText: email.bodyText?.substring(0, 10000) || "",
                    receivedAt: email.date,
                    status: "parsed",
                    category: email.categorization?.category || "other",
                  } as any);

                  // Parse attachments and AUTO-IMPORT into correct database tables
                  if ((email as any).attachmentContents?.length > 0) {
                    const { bulkImportDocuments } = await import("../documentImportService");
                    const docs = (email as any).attachmentContents.map((att: any) => ({
                      content: `data:${att.contentType};base64,${att.data.toString("base64")}`,
                      filename: att.filename,
                    }));
                    try {
                      const importResult = await bulkImportDocuments(docs, 1, true);
                      for (const r of importResult.results) {
                        if (r.success) {
                          console.log(`[Email Import] ✓ ${r.documentType}: created ${r.createdRecords.length} records, updated ${r.updatedRecords.length}`);
                          // Also save the raw file as a document for reference
                          const att = (email as any).attachmentContents[importResult.results.indexOf(r)];
                          if (att) {
                            await db.createDocument?.({
                              name: att.filename,
                              type: r.documentType === "customs_document" ? "customs" : r.documentType === "vendor_invoice" ? "invoice" : r.documentType === "purchase_order" ? "po" : "other",
                              referenceType: "email",
                              referenceId: savedEmail?.id,
                              fileData: att.data.toString("base64"),
                              mimeType: att.contentType,
                              description: `Auto-imported ${r.documentType}: ${r.createdRecords.map((cr: any) => cr.id || cr.number || "").join(", ")}`,
                            } as any);
                          }
                        } else {
                          console.warn(`[Email Import] ✗ ${r.documentType}: ${r.error}`);
                        }
                      }
                      if (importResult.successful > 0) {
                        // Create notification for imported documents
                        await db.createNotification({
                          userId: 1,
                          type: "reminder" as const,
                          title: `📧 Auto-imported ${importResult.successful} document(s)`,
                          message: `From: ${email.from.name || email.from.address} — ${importResult.results.filter((r: any) => r.success).map((r: any) => r.documentType.replace(/_/g, " ")).join(", ")}`,
                        });
                      }
                    } catch (e) {
                      console.warn(`[Email Import] Bulk import failed:`, e);
                    }
                  }
                } catch (e) {
                  console.warn(`[Email Polling] Failed to save email:`, e);
                }
              }

              if (scanResult.newEmails > 0) {
                console.log(`[Email Polling] Processed ${scanResult.newEmails} new emails from ${inbox.user}`);
              }
            } catch (e) {
              console.warn(`[Email Polling] Scan failed for ${inbox.user}:`, e);
            }
          };

          // Ongoing polling
          setInterval(async () => {
            for (const inbox of inboxes) await processInbox(inbox);
          }, POLL_INTERVAL);

          // Initial sync after 1 minute
          setTimeout(async () => {
            for (const inbox of inboxes) await processInbox(inbox);
          }, 60 * 1000);
        }
      } catch (e) {
        console.warn("[Email Polling] Could not initialize:", e);
      }
    })();

    // Start recurring invoice scheduler
    (async () => {
      try {
        const RECUR_INTERVAL = 60 * 60 * 1000; // Check every hour
        console.log("[Recurring Invoices] Starting scheduler with 1h interval");
        setInterval(async () => {
          try {
            const templates = await db.getRecurringInvoicesDueForGeneration();
            for (const template of templates) {
              try {
                const recurring = await db.getRecurringInvoiceWithItems(template.id);
                if (!recurring) continue;

                const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
                const issueDate = new Date();
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + (recurring.daysUntilDue || 30));

                const invoiceResult = await db.createInvoice({
                  companyId: recurring.companyId,
                  customerId: recurring.customerId,
                  invoiceNumber,
                  type: 'invoice',
                  status: 'draft',
                  issueDate,
                  dueDate,
                  subtotal: recurring.subtotal,
                  taxAmount: recurring.taxAmount,
                  discountAmount: recurring.discountAmount,
                  totalAmount: recurring.totalAmount,
                  currency: recurring.currency,
                  notes: recurring.notes,
                  terms: recurring.terms,
                });

                for (const item of recurring.items || []) {
                  await db.createInvoiceItem({
                    invoiceId: invoiceResult.id,
                    productId: item.productId,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxRate: item.taxRate,
                    taxAmount: item.taxAmount,
                    totalAmount: item.totalAmount,
                  });
                }

                // Calculate next generation date based on frequency
                const nextDate = new Date(issueDate);
                if (recurring.frequency === 'weekly') {
                  nextDate.setDate(nextDate.getDate() + 7);
                } else if (recurring.frequency === 'biweekly') {
                  nextDate.setDate(nextDate.getDate() + 14);
                } else if (recurring.frequency === 'monthly') {
                  nextDate.setMonth(nextDate.getMonth() + 1);
                } else if (recurring.frequency === 'quarterly') {
                  nextDate.setMonth(nextDate.getMonth() + 3);
                } else if (recurring.frequency === 'annually') {
                  nextDate.setFullYear(nextDate.getFullYear() + 1);
                } else {
                  nextDate.setMonth(nextDate.getMonth() + 1); // default monthly
                }

                await db.updateRecurringInvoice(template.id, {
                  lastGeneratedAt: new Date(),
                  nextGenerationDate: nextDate,
                  generationCount: (recurring.generationCount || 0) + 1,
                });

                await db.createRecurringInvoiceHistory({
                  recurringInvoiceId: template.id,
                  generatedInvoiceId: invoiceResult.id,
                  scheduledFor: issueDate,
                  status: 'generated',
                });

                console.log(`[Recurring Invoices] Generated invoice ${invoiceNumber} from template ${recurring.templateName}`);
              } catch (templateErr) {
                console.warn(`[Recurring Invoices] Failed to generate invoice from template ${template.id}:`, templateErr);
              }
            }
          } catch (e) {
            console.warn("[Recurring Invoices] Generation cycle failed:", e);
          }
        }, RECUR_INTERVAL);
      } catch (e) {
        console.warn("[Recurring Invoices] Could not initialize:", e);
      }
    })();

    // ── Automation #3 & #4: Material shortage background check + PO auto-generation (every 30 min) ──
    (async () => {
      try {
        const SHORTAGE_INTERVAL = 30 * 60 * 1000; // 30 minutes
        console.log("[Material Shortage] Starting background check with 30m interval");
        setInterval(async () => {
          try {
            const { runShortageCheckAndNotify, detectMaterialShortages } = await import("../materialShortageService");
            const result = await runShortageCheckAndNotify();
            if (result.shortageCount > 0) {
              console.log(`[Material Shortage] Found ${result.shortageCount} shortages, notified ${result.notifiedUsers} users`);
            }

            // Automation #4: Auto-suggest PO for materials below reorder point without pending POs
            try {
              const shortages = await detectMaterialShortages();
              const { getPendingOrdersForMaterial, createPurchaseOrder, createPurchaseOrderItem } = await import("../db");
              for (const shortage of shortages) {
                const pendingOrders = await getPendingOrdersForMaterial(shortage.rawMaterialId);
                if (pendingOrders.length === 0 && shortage.preferredVendorId) {
                  const poNumber = `AUTO-PO-${Date.now().toString(36).toUpperCase()}-${shortage.rawMaterialId}`;
                  const po = await createPurchaseOrder({
                    poNumber,
                    vendorId: shortage.preferredVendorId,
                    status: "draft",
                    orderDate: new Date(),
                    totalAmount: "0",
                    notes: `Auto-generated: ${shortage.shortfall.toFixed(1)} ${shortage.unit} shortage of ${shortage.rawMaterialName}`,
                  } as any);
                  await createPurchaseOrderItem({
                    purchaseOrderId: po.id,
                    description: shortage.rawMaterialName,
                    quantity: Math.ceil(shortage.shortfall).toString(),
                    unit: shortage.unit,
                    unitPrice: "0",
                    totalAmount: "0",
                  } as any);
                  console.log(`[Material Shortage→PO] Auto-created draft PO ${poNumber} for ${shortage.rawMaterialName} (shortfall: ${shortage.shortfall.toFixed(1)} ${shortage.unit})`);
                }
              }
            } catch (poErr) {
              console.warn("[Material Shortage→PO] Auto PO generation failed:", poErr);
            }
          } catch (e) {
            console.warn("[Material Shortage] Check failed:", e);
          }
        }, SHORTAGE_INTERVAL);
        // Initial check after 2 minutes
        setTimeout(async () => {
          try {
            const { runShortageCheckAndNotify } = await import("../materialShortageService");
            await runShortageCheckAndNotify();
          } catch (e) {
            console.warn("[Material Shortage] Initial check failed:", e);
          }
        }, 2 * 60 * 1000);
      } catch (e) {
        console.warn("[Material Shortage] Could not initialize:", e);
      }
    })();

    // ── Automation #7: Vendor follow-up emails background schedule (daily) ──
    (async () => {
      try {
        const FOLLOWUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
        console.log("[Vendor Follow-Up] Starting daily PO follow-up scheduler");
        setInterval(async () => {
          try {
            const { checkAndSendPoFollowups } = await import("../vendorEmailAutomation");
            const result = await checkAndSendPoFollowups();
            if (result.followUpsSent > 0) {
              console.log(`[Vendor Follow-Up] Sent ${result.followUpsSent} follow-up emails`);
            }
            if (result.errors.length > 0) {
              console.warn(`[Vendor Follow-Up] ${result.errors.length} errors:`, result.errors.slice(0, 3));
            }
          } catch (e) {
            console.warn("[Vendor Follow-Up] Check failed:", e);
          }
        }, FOLLOWUP_INTERVAL);
        // Initial check after 5 minutes
        setTimeout(async () => {
          try {
            const { checkAndSendPoFollowups } = await import("../vendorEmailAutomation");
            await checkAndSendPoFollowups();
          } catch (e) {
            console.warn("[Vendor Follow-Up] Initial check failed:", e);
          }
        }, 5 * 60 * 1000);
      } catch (e) {
        console.warn("[Vendor Follow-Up] Could not initialize:", e);
      }
    })();

    // ── Data Room follow-up emails (daily check) ──
    (async () => {
      try {
        const DR_FOLLOWUP_INTERVAL = 24 * 60 * 60 * 1000; // Daily
        console.log("[Data Room Follow-Up] Starting daily follow-up scheduler");
        setInterval(async () => {
          try {
            const { sendDataRoomFollowUps } = await import("../dataRoomFollowUp");
            const result = await sendDataRoomFollowUps();
            if (result.sent > 0) {
              console.log(`[Data Room Follow-Up] Sent ${result.sent} follow-up emails`);
            }
          } catch (e) {
            console.warn("[Data Room Follow-Up] Failed:", e);
          }
        }, DR_FOLLOWUP_INTERVAL);
        // Initial check after 10 minutes
        setTimeout(async () => {
          try {
            const { sendDataRoomFollowUps } = await import("../dataRoomFollowUp");
            await sendDataRoomFollowUps();
          } catch {}
        }, 10 * 60 * 1000);
      } catch (e) {
        console.warn("[Data Room Follow-Up] Could not initialize:", e);
      }
    })();

    // ── Task reminder emails for outstanding tasks (daily check) ──
    (async () => {
      try {
        const TASK_REMINDER_INTERVAL = 24 * 60 * 60 * 1000; // Daily
        console.log("[Task Reminder] Starting daily outstanding-task reminder scheduler");
        setInterval(async () => {
          try {
            const { sendTaskReminders } = await import("../taskReminders");
            const result = await sendTaskReminders();
            if (result.sent > 0) {
              console.log(`[Task Reminder] Sent ${result.sent} task reminder emails`);
            }
            if (result.failed > 0) {
              console.warn(`[Task Reminder] ${result.failed} reminder emails failed to send`);
            }
          } catch (e) {
            console.warn("[Task Reminder] Failed:", e);
          }
        }, TASK_REMINDER_INTERVAL);
        // Initial check after 10 minutes
        setTimeout(async () => {
          try {
            const { sendTaskReminders } = await import("../taskReminders");
            await sendTaskReminders();
          } catch {}
        }, 10 * 60 * 1000);
      } catch (e) {
        console.warn("[Task Reminder] Could not initialize:", e);
      }
    })();

    // ── Automation #8: Mercury transaction sync (every 15 minutes) ──
    if (process.env.MERCURY_API_TOKEN) {
      (async () => {
        try {
          const MERCURY_INTERVAL = 24 * 60 * 60 * 1000; // Daily
          console.log("[Mercury Sync] Starting background sync with 15m interval");
          setInterval(async () => {
            try {
              const { getMercuryAccounts, getMercuryTransactions } = await import("../mercuryService");
              const accounts = await getMercuryAccounts();
              let totalImported = 0;
              for (const account of (accounts.accounts || []) as any[]) {
                const txns = await getMercuryTransactions(account.id);
                for (const txn of (txns.transactions || []) as any[]) {
                  const existing = await db.getBankTransactionByExternalId(txn.id);
                  if (existing) continue;
                  await db.createBankTransaction({
                    externalId: txn.id,
                    accountName: account.name,
                    accountId: account.id,
                    date: new Date(txn.postedDate || txn.createdAt),
                    amount: Math.abs(txn.amount).toString(),
                    type: txn.amount < 0 ? "debit" : "credit",
                    description: txn.bankDescription || txn.note || txn.externalMemo || "",
                    counterpartyName: txn.counterpartyName || txn.friendlyDescription || "",
                    status: txn.status,
                    source: "mercury",
                  });
                  totalImported++;
                }
              }
              if (totalImported > 0) {
                console.log(`[Mercury Sync] Imported ${totalImported} new transactions`);
              }
            } catch (e) {
              console.warn("[Mercury Sync] Failed:", e);
            }
          }, MERCURY_INTERVAL);
        } catch (e) {
          console.warn("[Mercury Sync] Could not initialize:", e);
        }
      })();
    }

    // Data Room Google Drive auto-sync (daily). Re-syncs every data room that
    // has a linked Drive folder using the SAME reconcile logic as the manual
    // one-click sync, so new folders and files (incl. nested sub-folders) are
    // picked up automatically. Deletions are NOT propagated here (allowDelete
    // is false): unattended destructive removal is deliberately left to a
    // user-initiated re-sync, which runs with the owner watching.
    (async () => {
      try {
        const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // Daily
        console.log("[Data Room Sync] Starting daily auto-sync");
        const runAutoSync = async () => {
          const { reconcileDataRoomFromDrive } = await import("../googleDriveSyncService");
          const rooms = await db.getDataRooms();
          for (const room of rooms) {
            if (!room.googleDriveFolderId) continue;
            try {
              const { accessToken: roomAccessToken, error: tokenErr } = await getValidGoogleToken(room.ownerId);
              if (!roomAccessToken || tokenErr) continue;
              const recon = await reconcileDataRoomFromDrive({
                dataRoomId: room.id,
                rootFolderId: room.googleDriveFolderId,
                accessToken: roomAccessToken,
                uploadedBy: room.ownerId,
                allowDelete: false,
              });
              if (recon.foldersCreated || recon.filesCreated) {
                console.log(`[Data Room Sync] Room ${room.id}: +${recon.foldersCreated} folders / +${recon.filesCreated} files`);
              }
              await db.updateDataRoom(room.id, { lastSyncedAt: new Date() });
            } catch (roomErr) {
              console.warn(`[Data Room Sync] Failed to sync room ${room.id}:`, roomErr);
            }
          }
        };
        setInterval(() => { runAutoSync().catch((e) => console.warn("[Data Room Sync] Failed:", e)); }, SYNC_INTERVAL);
        // Initial run shortly after startup so a fresh deploy doesn't wait a day.
        setTimeout(() => { runAutoSync().catch((e) => console.warn("[Data Room Sync] Failed:", e)); }, 10 * 60 * 1000);
      } catch (e) {
        console.warn("[Data Room Sync] Could not initialize:", e);
      }
    })();

    // ── Fireflies meeting auto-sync (uses per-user API keys from Settings; no env var required) ──
    (async () => {
      try {
        const FIREFLIES_INTERVAL = 30 * 60 * 1000; // 30 minutes
        console.log("[Fireflies Sync] Starting auto-sync (30m interval) for users with Fireflies connected");
        const runFirefliesSync = async () => {
          try {
            const { syncAllFirefliesMeetings } = await import("../firefliesSyncService");
            const result = await syncAllFirefliesMeetings();
            if (
              result.totalSynced > 0 ||
              result.tasksSuggested > 0 ||
              result.contactsCreated > 0 ||
              result.dealApprovalsQueued > 0
            ) {
              console.log(
                `[Fireflies Sync] Synced ${result.totalSynced} new meetings (${result.totalSkipped} already had), ` +
                  `task suggestions ${result.tasksSuggested}, contacts ${result.contactsCreated}, deal approvals queued ${result.dealApprovalsQueued}`
              );
            }
          } catch (e) {
            console.warn("[Fireflies Sync] Failed:", e);
          }
        };
        setInterval(runFirefliesSync, FIREFLIES_INTERVAL);
        setTimeout(runFirefliesSync, 3 * 60 * 1000);
      } catch (e) {
        console.warn("[Fireflies Sync] Could not initialize:", e);
      }
    })();

    // ── Shopify auto-sync (every 12 hours) ──
    (async () => {
      try {
        const SHOPIFY_SYNC_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
        console.log("[Shopify Sync] Starting auto-sync with 12h interval");
        setInterval(async () => {
          try {
            const { runAllShopifySyncs } = await import("./shopify");
            const result = await runAllShopifySyncs();
            for (const r of result.results) {
              if (r.result) {
                console.log(`[Shopify Sync] ${r.domain}: products=${r.result.products.created}+${r.result.products.updated}, orders=${r.result.orders.created}+${r.result.orders.updated}, customers=${r.result.customers.created}+${r.result.customers.updated} (${(r.result.duration / 1000).toFixed(1)}s)`);
              } else if (r.error) {
                console.warn(`[Shopify Sync] ${r.domain} failed: ${r.error}`);
              }
            }
          } catch (e) {
            console.warn("[Shopify Sync] Auto-sync error:", e);
          }
        }, SHOPIFY_SYNC_INTERVAL);

        // Run initial sync after 2 minutes to let the server warm up
        setTimeout(async () => {
          try {
            const { runAllShopifySyncs } = await import("./shopify");
            const result = await runAllShopifySyncs();
            console.log(`[Shopify Sync] Initial sync complete for ${result.stores} store(s)`);
          } catch (e) {
            console.warn("[Shopify Sync] Initial sync failed:", e);
          }
        }, 2 * 60 * 1000);
      } catch (e) {
        console.warn("[Shopify Sync] Could not initialize:", e);
      }
    })();
  });

  function gracefulShutdown(signal: string) {
    logger.info("Shutdown signal received, closing server", { signal });
    server.close(() => {
      logger.info("Server closed, exiting");
      process.exit(0);
    });
    // Force exit after 10 seconds if connections don't drain
    setTimeout(() => {
      logger.error("Forced exit after timeout");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  captureException(reason, { type: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
  captureException(error, { type: "uncaughtException" });
  process.exit(1);
});

startServer().catch(console.error);
