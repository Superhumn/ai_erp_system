// Module-level helpers that the routers in this directory share: role
// procedures, Google token refresh, Drive/sheet import, production planning
// maths, recurring-invoice dates. Moved here verbatim from the top and bottom
// of the former server/routers.ts by scripts/split-legacy-router.mjs.
//
// This file is a holding pen, not a destination. Each helper belongs in a
// service module (or already duplicates one — see ./middleware.ts for the
// role procedures). Dissolve it one helper at a time; do not add to it.

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { zonedWallTimeToUtcMs } from "../autoScheduleService";
import { type QuickAddIntent, type QuickAddResult } from "@shared/planner";
import * as db from "../db";
import { PLAN_UNITS, PlanUnitError, bomBatchMultiplier, componentRequiredQuantity, computeMaterialShortage, computePlanTargets, convertPlanQuantity, isOrderUrgent, latestOrderDate, normalizePlanUnit, toGrams, type PlanUnit, type UnitContext } from "../productionPlanning";
import { resolveScopeFromAccess } from "../_core/scope";
import * as manufacturingDb from "../db/manufacturing";
import { parseFormulationSheet, type ColumnKey } from "../recipeSheetImport";
import { decrypt } from "../_core/crypto";
import { ENV } from "../_core/env";
import { createDecipheriv, createHash, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// Promisified scrypt, created once at module scope so the (hot) share-link auth
// helpers below don't re-require modules or re-wrap scrypt on every call.
export const scryptAsync = promisify(scrypt);

/**
 * Expose a lightweight `hasStoredContent` flag the UI uses to decide whether the
 * View / Download / Parse actions are available for an email attachment. Content
 * lives in object storage (R2), keyed by `storageKey`.
 */
export function sanitizeAttachments(attachments: any[]): any[] {
  return (attachments || []).map((a) => ({
    ...a,
    hasStoredContent: !!a.storageKey,
  }));
}

// Decrypts a stored password supporting both the current AES-256-GCM format
// (iv:authTag:ciphertext) and the legacy AES-256-CBC format (plain hex ciphertext).
export function decryptPassword(encryptedText: string): string {
  if (encryptedText.split(":").length === 3) {
    return decrypt(encryptedText);
  }
  // Legacy CBC fallback for passwords stored before the GCM migration.
  // Uses ENV.cookieSecret which is validated at startup (no insecure fallback).
  const key = ENV.cookieSecret;
  const decipher = createDecipheriv(
    "aes-256-cbc",
    createHash("sha256").update(key).digest().slice(0, 32),
    Buffer.alloc(16, 0),
  );
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Role-based access middleware
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const financeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'finance', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Finance access required' });
  }
  return next({ ctx });
});

export const opsProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operations access required' });
  }
  return next({ ctx });
});

export const execProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Executive access required' });
  }
  return next({ ctx });
});

// Region/entity data-scoping middleware. Resolves the caller's visible entity set and attaches
// `ctx.scope`, which scoped DB helpers consume. Multi-entity (STEP 3): the set is the union of the
// user's user_entity_access memberships expanded to descendants; a user with no memberships falls
// back to their single home company + regionScope; exec (regionScope 'global') sees everything.
// See docs/MULTI_REGION_PHASE_1_2_SPEC.md.
// Resolve a request's entity scope. Reusable so role-gated handlers (opsProcedure etc.) can also
// enforce scope on by-id reads/writes without losing their role gate.
export async function resolveRequestScope(user: { id: number; companyId: number | null; regionScope: 'entity' | 'region' | 'global' }) {
  const accessEntityIds = await db.getUserEntityAccessCompanyIds(user.id);
  return resolveScopeFromAccess(
    { companyId: user.companyId, regionScope: user.regionScope },
    accessEntityIds,
    {
      getCompanyRegionId: async (id) => (await db.getCompanyById(id))?.regionId ?? null,
      getCompanyIdsInRegion: (regionId) => db.getCompanyIdsInRegion(regionId),
      getEntityAndDescendants: (id) => db.getEntityAndDescendantCompanyIds(id),
    },
  );
}

export const scopedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const scope = await resolveRequestScope(ctx.user);
  if (scope.companyIds !== 'all' && scope.companyIds.length === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No entity scope assigned' });
  }
  return next({ ctx: { ...ctx, scope } });
});

export const legalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'legal', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Legal access required' });
  }
  return next({ ctx });
});

// Copacker can only access their assigned warehouse inventory
export const copackerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'copacker'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Copacker access required' });
  }
  return next({ ctx });
});

// Vendor can access their own purchase orders and shipments
export const vendorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'vendor'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Vendor access required' });
  }
  return next({ ctx });
});

// External / outside-the-org roles. These users are confined to their portal
// and must never reach internal-only features (AI assistant, global search,
// cross-module agent tasks) that read company-wide data.
export const EXTERNAL_ROLES = ['copacker', 'vendor', 'investor', 'contractor'];

// Upper bound on a single RFQ blast. Each vendor costs an LLM draft plus an
// email send, so an unbounded list would hold the request open for minutes.
export const MAX_RFQ_VENDORS_PER_SEND = 50;

// Internal-staff-only. Allows every internal role (including the basic "user"
// role, which has AI-query access) but blocks the external/portal roles.
export const internalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (EXTERNAL_ROLES.includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not available for external accounts' });
  }
  return next({ ctx });
});

// Contractor can access documents (data-room folders) granted to them.
// admin/ops included so staff can preview/manage the contractor experience.
export const contractorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'contractor'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Contractor access required' });
  }
  return next({ ctx });
});

// Plant User can only access Work Orders, Receiving, Inventory, and Transfers
export const plantProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'plant', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Plant user access required' });
  }
  return next({ ctx });
});

// Procurement-specific (separate from general finance)
export const procurementProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'procurement', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Procurement access required' });
  }
  return next({ ctx });
});

// Helper to create audit log
export async function createAuditLog(userId: number, action: 'create' | 'update' | 'delete' | 'view' | 'export' | 'approve' | 'reject', entityType: string, entityId: number, entityName?: string, oldValues?: any, newValues?: any) {
  await db.createAuditLog({
    userId,
    action,
    entityType,
    entityId,
    entityName,
    oldValues,
    newValues,
  });
}

/**
 * Raise a low-stock notification when a quantity change leaves a product at or
 * below its reorder level. Called from every ledger-backed stock movement so
 * the alert does not depend on someone editing the row by hand.
 */
export async function notifyIfBelowReorderLevel(productId: number, warehouseId: number, newQuantity: number) {
  const record = await db.getInventoryByProductAndWarehouse(productId, warehouseId);
  if (!record) return;

  const reorderLevel = parseFloat(record.reorderLevel || '0');
  if (!(reorderLevel > 0) || newQuantity > reorderLevel) return;

  const [opsUsers, product] = await Promise.all([
    db.getUsersByRoles(['admin', 'ops', 'exec']),
    db.getProductById(productId),
  ]);

  await db.notifyUsersOfEvent({
    type: 'inventory_low',
    title: `Low Stock Alert: ${product?.name || 'Product'}`,
    message: `Inventory for ${product?.name || 'Product'} is at ${newQuantity} units, below reorder level of ${reorderLevel}`,
    entityType: 'inventory',
    entityId: record.id,
    severity: newQuantity <= 0 ? 'critical' : 'warning',
    link: `/operations/inventory`,
    metadata: { productId, warehouseId, quantity: newQuantity, reorderLevel },
  }, opsUsers.map((u) => u.id));
}

// ---- Planner / quick-add helpers ----
// Convert a wall-clock ISO (no offset) in `tz` to an absolute Date.
export function wallIsoToDate(wallIso: string | null | undefined, tz: string): Date | null {
  if (!wallIso) return null;
  const m = wallIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) { const d = new Date(wallIso); return isNaN(d.getTime()) ? null : d; }
  const ms = zonedWallTimeToUtcMs(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], tz);
  return new Date(ms);
}

// Add minutes to a wall-clock ISO, returning a wall-clock ISO (no offset).
export function addMinutesWall(wallIso: string, minutes: number): string {
  const base = wallIso.endsWith("Z") ? wallIso : wallIso + "Z";
  const d = new Date(base);
  return new Date(d.getTime() + minutes * 60000).toISOString().replace(/\.\d{3}Z$/, "");
}

// Create the right record for a parsed quick-add intent.
export async function commitQuickAdd(userId: number, intent: QuickAddIntent, tz: string): Promise<QuickAddResult> {
  if (intent.kind === "note") {
    await db.createNote({ userId, title: intent.title.slice(0, 255), content: intent.description || intent.title, status: "draft" });
    return { kind: "note", title: intent.title, detail: "Saved to Notes" };
  }
  if (intent.kind === "event") {
    const token = await getValidGoogleToken(userId);
    if (!token.error && intent.datetime) {
      const startWall = intent.datetime;
      const endWall = intent.endDatetime || addMinutesWall(startWall, intent.durationMinutes || 30);
      const { createCalendarEvent } = await import("../calendarService");
      await createCalendarEvent(token.accessToken, {
        summary: intent.title,
        description: intent.description || undefined,
        start: { dateTime: startWall, timeZone: tz },
        end: { dateTime: endWall, timeZone: tz },
        attendees: intent.attendees?.map((email) => ({ email })),
        location: intent.location || undefined,
      });
      return { kind: "event", title: intent.title, detail: "Added to Google Calendar" };
    }
    const projectId = await db.getOrCreateNotesInboxProject(userId);
    await db.createProjectTask({
      projectId, name: intent.title, description: intent.description || null,
      dueDate: wallIsoToDate(intent.datetime, tz), status: "todo",
      priority: intent.priority || "medium", sourceType: "manual", createdBy: userId,
    });
    return { kind: "event", title: intent.title, detail: "Google Calendar not connected — saved as a task", fellBackToTask: true };
  }
  // task or reminder → a project task (optionally with a due date)
  const projectId = await db.getOrCreateNotesInboxProject(userId);
  await db.createProjectTask({
    projectId, name: intent.title, description: intent.description || null,
    dueDate: wallIsoToDate(intent.datetime, tz), status: "todo",
    priority: intent.priority || "medium", sourceType: "manual", createdBy: userId,
  });
  return { kind: intent.kind, title: intent.title, detail: intent.datetime ? "Added to Tasks with a due date" : "Added to Tasks" };
}

// Helper to refresh Google OAuth token
export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken?: string; expiresAt?: Date; error?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return { error: 'Google OAuth not configured' };
  }
  
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[Google OAuth] Failed to refresh token:', error);
      return { error: 'Failed to refresh token' };
    }
    
    const data = await response.json();
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));
    
    return {
      accessToken: data.access_token,
      expiresAt,
    };
  } catch (error: any) {
    console.error('[Google OAuth] Error refreshing token:', error);
    return { error: error.message };
  }
}

// Helper to get valid Google access token (refreshes if needed)
export async function getValidGoogleToken(userId: number): Promise<{ accessToken: string; error?: string }> {
  const token = await db.getGoogleOAuthToken(userId);
  
  if (!token) {
    return { accessToken: '', error: 'Google account not connected' };
  }
  
  // Refresh a bit early so a long-running Drive sync that re-checks the token
  // between folder listings doesn't keep using a token that's about to expire.
  const refreshSkewMs = 5 * 60 * 1000;
  if (token.expiresAt && new Date(token.expiresAt).getTime() - refreshSkewMs < Date.now()) {
    if (!token.refreshToken) {
      return { accessToken: '', error: 'Google token has expired. Please reconnect your Google account.' };
    }
    const refreshed = await refreshGoogleToken(token.refreshToken);
    
    if (refreshed.accessToken && refreshed.expiresAt) {
      // Persist the refreshed token, but never let a DB write failure block the
      // request — the freshly refreshed token is valid whether or not we manage
      // to store it. (Previously a failing upsert here aborted every Drive
      // operation: sync AND the document-viewer proxy.)
      try {
        await db.upsertGoogleOAuthToken({
          userId,
          accessToken: refreshed.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: refreshed.expiresAt,
          googleEmail: token.googleEmail,
        });
      } catch (persistErr) {
        console.error(`[GoogleToken] Failed to persist refreshed token for user ${userId} (using it anyway):`, persistErr);
      }
      return { accessToken: refreshed.accessToken };
    }
    
    return { accessToken: '', error: refreshed.error || 'Failed to refresh token' };
  }
  
  return { accessToken: token.accessToken };
}

// Data types the Google Drive auto-sync importer knows how to write. Anything
// else (unknown / invoices / purchase_orders) is surfaced in the preview but
// cannot be imported without manual handling.
export const DRIVE_SUPPORTED_TYPES = [
  'vendors', 'customers', 'products', 'employees',
  'raw_materials', 'crm_contacts', 'crm_deals', 'fundraising',
] as const;

// Detect the destination type for a sheet from its (lowercased) header row.
// Shared by previewGoogleDrive (detect-only) and syncGoogleDrive (detect+import)
// so the suggestion the user confirms is exactly what gets imported.
export function detectSheetType(headers: string[]): string {
  if (headers.some((h) => h.includes('vendor') || h.includes('supplier'))) return 'vendors';
  if (headers.some((h) => h.includes('customer') || h.includes('client') || h.includes('buyer'))) return 'customers';
  if (headers.some((h) => h.includes('sku') || h.includes('product') || h.includes('item'))) return 'products';
  if (headers.some((h) => h.includes('invoice') || h.includes('bill'))) return 'invoices';
  if (headers.some((h) => h.includes('employee') || h.includes('team') || h.includes('staff'))) return 'employees';
  if (headers.some((h) => h.includes('ingredient') || h.includes('raw material') || h.includes('material'))) return 'raw_materials';
  if (headers.some((h) => h.includes('order') || h.includes('po') || h.includes('purchase'))) return 'purchase_orders';
  if (headers.some((h) => h.includes('price') || h.includes('cost') || h.includes('rate'))) return 'products';
  if (headers.some((h) => h.includes('contact') || h.includes('lead') || h.includes('prospect') || h.includes('pipeline'))) return 'crm_contacts';
  if (headers.some((h) => h.includes('investor') || h.includes('fund') || h.includes('commitment') || h.includes('round') || h.includes('series'))) return 'fundraising';
  if (headers.some((h) => h.includes('deal') || h.includes('opportunity') || h.includes('stage'))) return 'crm_deals';
  return 'unknown';
}

export type DriveSyncResult = { sheet: string; type: string; imported: number; errors: string[] };

// Read every (selected) spreadsheet from the user's Google Drive and import its
// rows into the matching ERP tables. Extracted from the syncGoogleDrive mutation
// so it can run either inline (awaited) or detached as a background job. The
// optional onProgress callback is invoked after each sheet so a background runner
// can persist partial progress — letting the client reconnect to a running import
// after navigating away from the Import page.
export async function importDriveFiles(opts: {
  userId: number;
  accessToken: string;
  forcedTypes: Map<string, string> | null;
  onProgress?: (p: { results: DriveSyncResult[]; totalSheets: number; processedSheets: number; currentFile?: string }) => Promise<void> | void;
}): Promise<{ results: DriveSyncResult[]; totalSheets: number }> {
  const { accessToken, forcedTypes, onProgress } = opts;
  const results: DriveSyncResult[] = [];

  // 1. List all Google Sheets in Drive
  const sheetsResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=(mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='text/csv')&fields=files(id,name,modifiedTime,mimeType)&orderBy=modifiedTime desc&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!sheetsResponse.ok) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list Google Sheets from Drive' });
  }
  const sheetsData = await sheetsResponse.json();
  let files = sheetsData.files || [];
  // Only import the confirmed files when selections were supplied.
  if (forcedTypes) files = files.filter((f: any) => forcedTypes.has(f.id));

  const totalSheets = files.length;

  // 2. For each spreadsheet, read the first sheet, detect type, and import
  for (const file of files) {
    try {
      const dataResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/Sheet1?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      let data: any;
      if (!dataResponse.ok) {
        // Try without sheet name (default first sheet)
        const fallbackResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/A:ZZ?majorDimension=ROWS`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!fallbackResponse.ok) {
          results.push({ sheet: file.name, type: 'error', imported: 0, errors: ['Could not read sheet data'] });
          await onProgress?.({ results, totalSheets, processedSheets: results.length, currentFile: file.name });
          continue;
        }
        data = await fallbackResponse.json();
      } else {
        data = await dataResponse.json();
      }

      const rows = data.values || [];
      if (rows.length < 2) {
        results.push({ sheet: file.name, type: 'skipped', imported: 0, errors: ['No data rows found'] });
        await onProgress?.({ results, totalSheets, processedSheets: results.length, currentFile: file.name });
        continue;
      }

      const headers: string[] = rows[0].map((h: string) => h.toLowerCase().trim());
      const dataRows: string[][] = rows.slice(1);

      // Use the user-confirmed type when supplied, else auto-detect.
      const type = forcedTypes?.get(file.id) ?? detectSheetType(headers);

      if (!(DRIVE_SUPPORTED_TYPES as readonly string[]).includes(type)) {
        results.push({ sheet: file.name, type, imported: 0, errors: type === 'unknown' ? ['Could not detect data type from headers'] : ['Auto-import not supported for this type'] });
        await onProgress?.({ results, totalSheets, processedSheets: results.length, currentFile: file.name });
        continue;
      }

      let imported = 0;
      const errors: string[] = [];

      for (const row of dataRows) {
        try {
          const record: Record<string, string> = {};
          headers.forEach((h: string, i: number) => { record[h] = row[i] || ''; });

          switch (type) {
            case 'vendors': {
              const name = record.name || record.vendor || record.company || record['vendor name'];
              if (!name) { errors.push(`Row ${imported + 1}: Missing vendor name`); continue; }
              await db.createVendor({
                name,
                email: record.email || record['email address'] || null,
                phone: record.phone || record.telephone || null,
                address: record.address || null,
                city: record.city || null,
                state: record.state || null,
                country: record.country || null,
              });
              imported++;
              break;
            }
            case 'customers': {
              const name = record.name || record.customer || record.company || record['customer name'];
              if (!name) { errors.push(`Row ${imported + 1}: Missing customer name`); continue; }
              await db.createCustomer({
                name,
                email: record.email || null,
                phone: record.phone || null,
                address: record.address || null,
                city: record.city || null,
                state: record.state || null,
              });
              imported++;
              break;
            }
            case 'products': {
              const name = record.name || record.product || record.item || record.description;
              if (!name) { errors.push(`Row ${imported + 1}: Missing product name`); continue; }
              const sku = record.sku || record['product code'] || record.code || generateNumber('PROD');
              await db.createProduct({
                name,
                sku,
                unitPrice: record.price || record['unit price'] || record.cost || record.rate || '0',
                category: record.category || record.type || null,
                description: record.description || record.notes || null,
              });
              imported++;
              break;
            }
            case 'employees': {
              const firstName = record['first name'] || record.firstname || record['first'];
              const lastName = record['last name'] || record.lastname || record['last'];
              if (!firstName || !lastName) { errors.push(`Row ${imported + 1}: Missing first/last name`); continue; }
              const employeeNumber = generateNumber('EMP');
              await db.createEmployee({
                employeeNumber,
                firstName,
                lastName,
                email: record.email || null,
                phone: record.phone || null,
                jobTitle: record.title || record.position || record['job title'] || null,
              });
              imported++;
              break;
            }
            case 'raw_materials': {
              const name = record.name || record.ingredient || record.material || record['material name'];
              if (!name) { errors.push(`Row ${imported + 1}: Missing material name`); continue; }
              await db.createRawMaterial({
                name,
                sku: record.sku || record.code || `RM-${Date.now().toString(36)}-${imported}`,
                unit: record.unit || record.uom || 'kg',
                unitCost: record.cost || record['unit cost'] || record.price || '0',
              });
              imported++;
              break;
            }
            case 'crm_contacts': {
              const name = record.name || record.contact || record['contact name'] || record['full name'] || record.company || `Contact ${imported + 1}`;
              const firstName = name.split(' ')[0] || name;
              const lastName = name.split(' ').slice(1).join(' ') || '';
              const { created } = await db.findOrCreateCrmContact({
                firstName,
                lastName,
                fullName: name,
                email: record.email || record['email address'] || undefined,
                phone: record.phone || record.mobile || undefined,
                organization: record.company || record.organization || record.firm || undefined,
                jobTitle: record.title || record.position || record.role || undefined,
                source: 'import',
                notes: record.notes || record.comments || undefined,
                status: (record.status === 'active' || record.status === 'inactive') ? record.status as any : 'active',
              });
              if (created) imported++;
              break;
            }
            case 'crm_deals': {
              // Find or create default pipeline
              let pipelineId = 1;
              try {
                const pipelines = await db.getCrmPipelines();
                if (!pipelines || pipelines.length === 0) {
                  pipelineId = await db.createCrmPipeline({ name: 'Sales Pipeline', stages: JSON.stringify(['discovery','qualified','proposal','negotiation','closed_won','closed_lost']) });
                } else {
                  pipelineId = pipelines[0].id;
                }
              } catch {}

              // Resolve company name — that's the deal title.
              const company = (record.company || record.organization || record.account || record.client || record.name || record.deal || record.opportunity || '').toString().trim();
              if (!company) { imported++; break; }

              // Skip duplicates — by existing deal or already-pending approval task.
              if (await db.findCrmDealByCompany(company)) { imported++; break; }
              if (await db.hasPendingDealApprovalForCompany(company)) { imported++; break; }

              // Create a placeholder contact tied to that company.
              let contactId: number;
              try {
                const { id } = await db.findOrCreateCrmContact({
                  firstName: company,
                  lastName: '',
                  fullName: company,
                  organization: company,
                  source: 'import',
                  contactType: 'lead',
                });
                contactId = id;
              } catch {
                contactId = 1;
              }

              const taskData = {
                pipelineId,
                contactId,
                company,
                stage: record.stage || record.status || 'discovery',
                amount: record.amount || record.value || record['deal size'] || undefined,
                source: 'google_sheets',
                notes: record.notes || undefined,
              };
              await db.createAiAgentTask({
                taskType: 'create_crm_deal',
                priority: 'medium',
                status: 'pending_approval',
                taskData: JSON.stringify(taskData),
                aiReasoning: `Imported CRM deal for "${company}" from Google Sheets — pending approval.`,
                aiConfidence: '90.00',
              });
              imported++;
              break;
            }
            case 'fundraising': {
              // Create investor stakeholder
              const investorName = record.name || record.investor || record['investor name'] || record.fund || `Investor ${imported + 1}`;
              await db.createStakeholder({
                name: investorName,
                email: record.email || undefined,
                type: 'investor',
                relationship: record.fund || record.firm || record.company || undefined,
                notes: record.notes || record.status || undefined,
                accreditedInvestor: true,
              });

              // If there's an amount, also create an investment commitment
              const rawAmount = record.amount || record.commitment || record['investment amount'] || record.invested;
              if (rawAmount) {
                try {
                  const cleanAmount = String(rawAmount).replace(/[$,]/g, '');
                  const instrumentRaw = (record.instrument || record.type || record['security type'] || 'safe').toLowerCase();
                  await db.createInvestmentCommitment({
                    investorName,
                    investorEmail: record.email || '',
                    investorCompany: record.fund || record.firm || record.company || undefined,
                    investmentAmount: cleanAmount,
                    instrumentType: instrumentRaw.includes('safe') ? 'safe' : 'equity',
                    status: (record.status || '').toLowerCase().includes('close') || (record.status || '').toLowerCase().includes('fund') ? 'funded' : 'interested',
                    notes: record.notes || undefined,
                  });
                } catch {}
              }
              imported++;
              break;
            }
            default:
              break;
          }
        } catch (e: any) {
          errors.push(`Row ${imported + 1}: ${e.message}`);
        }
      }

      results.push({ sheet: file.name, type, imported, errors });
      await onProgress?.({ results, totalSheets, processedSheets: results.length, currentFile: file.name });
    } catch (e: any) {
      results.push({ sheet: file.name, type: 'error', imported: 0, errors: [e.message] });
      await onProgress?.({ results, totalSheets, processedSheets: results.length, currentFile: file.name });
    }
  }

  return { results, totalSheets };
}

/**
 * Enforce per-recipe access. Recipes are private: only the creator (owner) or a
 * user with an explicit grant may view, and edit/manage requires the matching
 * permission. Throws FORBIDDEN otherwise. Returns the resolved access for reuse.
 */
export async function requireRecipeAccess(
  userId: number,
  recipeId: number,
  mode: "view" | "edit" | "own" = "view",
) {
  const access = await manufacturingDb.getRecipeAccess(userId, recipeId);
  const ok = mode === "own" ? access.isOwner : mode === "edit" ? access.canEdit : access.canView;
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        mode === "view"
          ? "You don't have access to this recipe."
          : "You don't have permission to manage this recipe.",
    });
  }
  return access;
}

// Shared persistence for recipe formulation imports. Parses a 2D sheet
// (header row + one row per line) into grouped recipes and writes them to the
// DB, owned by `userId` so they stay private until access is granted. Used by
// both the Google Sheet importer and the CSV/XLSX file-upload importer, so the
// two paths always create recipes, lines, procedures and ingredients the same
// way.
export async function importFormulationRows(
  values: unknown[][],
  userId: number,
  opts?: { defaultRecipeName?: string; columnMapping?: Partial<Record<ColumnKey, number>> },
) {
  const { recipes: parsed, warnings } = parseFormulationSheet(values || [], {
    defaultRecipeName: opts?.defaultRecipeName,
    columnMapping: opts?.columnMapping,
  });
  if (parsed.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: warnings[0] || "No recipes could be parsed from the spreadsheet.",
    });
  }

  // Cache ingredients to avoid repeated lookups across lines.
  const ingredientCache = new Map<string, number>();
  let ingredientsCreated = 0;
  const resolveIngredientId = async (name: string, sku?: string): Promise<number> => {
    const key = (sku?.trim().toLowerCase() || "") + "|" + name.trim().toLowerCase();
    const cached = ingredientCache.get(key);
    if (cached) return cached;
    const existing = await manufacturingDb.findIngredientByNameOrSku(name, sku);
    if (existing) {
      ingredientCache.set(key, existing.id);
      return existing.id;
    }
    const generatedSku =
      sku?.trim() ||
      `ING-${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24)}-${Math.floor(Math.random() * 10000)}`;
    const created = await manufacturingDb.createIngredient({
      name: name.trim(),
      sku: generatedSku,
    });
    ingredientCache.set(key, created.id);
    ingredientsCreated++;
    return created.id;
  };

  let recipesCreated = 0;
  let linesCreated = 0;
  let proceduresCreated = 0;

  for (const rec of parsed) {
    const recipeId = rec.recipeId?.slice(0, 32) || generateNumber("RCP").slice(0, 32);
    const createdRecipe = await manufacturingDb.createRecipe({
      recipeId,
      name: rec.name.slice(0, 255),
      category: rec.category,
      status: "development",
      createdBy: userId,
    });
    recipesCreated++;

    let lineNumber = 1;
    for (const line of rec.lines) {
      const ingredientId = await resolveIngredientId(line.ingredientName, line.ingredientSku);
      await manufacturingDb.createRecipeLine({
        recipeRowId: createdRecipe.id,
        lineNumber: lineNumber++,
        ingredientId,
        quantityGrams: String(line.quantityGrams),
        quantityGramsDry:
          line.quantityGramsDry != null ? String(line.quantityGramsDry) : undefined,
      });
      linesCreated++;
    }

    for (const proc of rec.procedures) {
      await manufacturingDb.createRecipeProcedure({
        recipeRowId: createdRecipe.id,
        stepNumber: proc.stepNumber,
        instruction: proc.instruction,
      });
      proceduresCreated++;
    }

    await createAuditLog(userId, "create", "recipe", createdRecipe.id, `imported: ${rec.name}`);
  }

  return { recipesCreated, linesCreated, proceduresCreated, ingredientsCreated, warnings };
}

// Helper to generate unique reference numbers (e.g. EMP-2606-1234). Uses a
// CSPRNG for the suffix — not because these are secrets, but to satisfy static
// analysis and avoid Math.random()'s modulo bias.
export function generateNumber(prefix: string) {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const crypto = require('crypto');
  const random = crypto.randomInt(10000).toString().padStart(4, '0');
  return `${prefix}-${year}${month}-${random}`;
}

// Secure password hashing helpers using scrypt. Async so the (deliberately slow)
// scrypt work runs on libuv's threadpool instead of blocking the event loop.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64) as Buffer).toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return { valid: false, needsUpgrade: false };
  const computed = await scryptAsync(password, salt, 64) as Buffer;
  const storedBuf = Buffer.from(hash, 'hex');
  const valid = computed.length === storedBuf.length && timingSafeEqual(computed, storedBuf);
  return { valid, needsUpgrade: false };
}

/** Verify that the calling user owns the data room containing the given email access rule. */
export async function assertEmailAccessRuleOwnership(ruleId: number, userId: number, userRole: string) {
  const rule = await db.getEmailAccessRuleById(ruleId);
  if (!rule) throw new TRPCError({ code: 'NOT_FOUND' });
  const room = await db.getDataRoomById(rule.dataRoomId);
  if (!room || (room.ownerId !== userId && userRole !== 'admin')) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return rule;
}

// Resolve which stakeholder + entity an investor-portal call should act on.
// A user can hold positions in multiple entities (parent + JVs), so callers
// pass an optional companyId to select one; if omitted we default to their
// earliest cap-table row. Admins/execs bypass the linkage requirement and
// can scope by companyId for support, or leave it unscoped.
export async function resolveInvestorContext(
  ctx: { user: { id: number; role: string } },
  requestedCompanyId?: number,
) {
  if (ctx.user.role !== "investor" && ctx.user.role !== "admin" && ctx.user.role !== "exec") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Investor portal is for investor-role users" });
  }
  if (ctx.user.role !== "investor") {
    return {
      stakeholder: undefined as Awaited<ReturnType<typeof db.getStakeholderByUserId>> | undefined,
      companyId: requestedCompanyId,
      allStakeholders: [] as Awaited<ReturnType<typeof db.getStakeholdersByUserId>>,
    };
  }
  const allStakeholders = await db.getStakeholdersByUserId(ctx.user.id);
  if (allStakeholders.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No cap-table record is linked to your account. Ask the admin to link your stakeholder row.",
    });
  }
  if (requestedCompanyId != null) {
    const match = allStakeholders.find((s) => s.companyId === requestedCompanyId);
    if (!match) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You don't hold a position in that entity." });
    }
    return { stakeholder: match, companyId: match.companyId ?? undefined, allStakeholders };
  }
  const primary = allStakeholders[0];
  return { stakeholder: primary, companyId: primary.companyId ?? undefined, allStakeholders };
}

export const investorCompanyIdInput = z.object({ companyId: z.number().optional() }).optional();

// ============================================
// PRODUCTION PLANNING
// Shared by the forecast-driven and the manual (recipe/BOM) planning routes.
// ============================================
export const DEFAULT_LEAD_TIME_DAYS = 14;

export const DEFAULT_REQUIRED_BY_DAYS = 30;

/** A material line for a plan, before it's written to materialRequirements. */
export type PlanRequirementDraft = {
  rawMaterialId: number | null;
  ingredientId?: number;
  name: string;
  sku?: string;
  requiredQuantity: number;
  unit: string;
  currentInventory: number;
  onOrderQuantity: number;
  shortageQuantity: number;
  suggestedOrderQuantity: number;
  preferredVendorId?: number;
  vendorName?: string;
  estimatedUnitCost: number;
  /** Cost of everything the run consumes. */
  estimatedRunCost: number;
  /** Cost of what still has to be purchased. */
  estimatedPurchaseCost: number;
  leadTimeDays: number;
  requiredByDate?: Date;
  latestOrderDate?: Date;
  estimatedDeliveryDate?: Date;
  isUrgent: boolean;
  note?: string;
};

export type PlanRequirementsResult = {
  requirements: PlanRequirementDraft[];
  warnings: string[];
  batches: number;
};

/** Net a gross requirement against stock and open POs, and work out order timing. */
export async function netRequirementAgainstStock(args: {
  rawMaterialId: number | null;
  requiredQuantity: number;
  orderBufferPercent: number;
  leadTimeDays: number;
  requiredByDate: Date;
}) {
  let currentInventory = 0;
  let onOrderQuantity = 0;

  if (args.rawMaterialId) {
    const stock = await db.getRawMaterialInventory({ rawMaterialId: args.rawMaterialId });
    currentInventory = stock.reduce((sum, inv) => sum + parseFloat(inv.quantity?.toString() || "0"), 0);

    const pendingOrders = await db.getPendingOrdersForMaterial(args.rawMaterialId);
    onOrderQuantity = pendingOrders.reduce((sum, po) => {
      const ordered = parseFloat(po.quantity?.toString() || "0");
      const received = parseFloat(po.receivedQuantity?.toString() || "0");
      return sum + Math.max(0, ordered - received);
    }, 0);
  }

  const { shortageQuantity, suggestedOrderQuantity } = computeMaterialShortage({
    requiredQuantity: args.requiredQuantity,
    onHand: currentInventory,
    onOrder: onOrderQuantity,
    orderBufferPercent: args.orderBufferPercent,
  });

  const now = new Date();
  return {
    currentInventory,
    onOrderQuantity,
    shortageQuantity,
    suggestedOrderQuantity,
    latestOrderDate: latestOrderDate(args.requiredByDate, args.leadTimeDays),
    estimatedDeliveryDate: new Date(now.getTime() + args.leadTimeDays * 24 * 60 * 60 * 1000),
    isUrgent: isOrderUrgent(now, args.requiredByDate, args.leadTimeDays),
  };
}

/**
 * Explode a BOM into material requirements.
 * Component quantities are stated per BOM batch, so they scale by the number of
 * batches the planned quantity represents — not by the planned quantity itself.
 */
export async function planRequirementsFromBom(args: {
  bomId: number;
  plannedQuantity: number;
  planUnit: PlanUnit;
  unitContext: UnitContext;
  orderBufferPercent: number;
  requiredByDate: Date;
}): Promise<PlanRequirementsResult> {
  const warnings: string[] = [];
  const bom = await db.getBomById(args.bomId);
  if (!bom) throw new TRPCError({ code: "NOT_FOUND", message: "BOM not found" });

  const batchSize = parseFloat(bom.batchSize?.toString() || "1");
  const batchUnit = normalizePlanUnit(bom.batchUnit) ?? "EA";
  if (!normalizePlanUnit(bom.batchUnit)) {
    warnings.push(`BOM batch unit "${bom.batchUnit}" isn't recognised — treating the batch as ${batchSize} EA.`);
  }

  let batches: number;
  try {
    batches = bomBatchMultiplier({
      plannedQuantity: args.plannedQuantity,
      planUnit: args.planUnit,
      batchSize,
      batchUnit,
      ctx: args.unitContext,
    });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof PlanUnitError
        ? `${error.message} The BOM measures a batch in ${batchUnit}.`
        : String(error),
    });
  }

  const components = await db.getBomComponents(args.bomId);
  const requirements: PlanRequirementDraft[] = [];

  for (const comp of components) {
    const requiredQuantity = componentRequiredQuantity({
      componentQuantity: parseFloat(comp.quantity?.toString() || "0"),
      wastagePercent: parseFloat(comp.wastagePercent?.toString() || "0"),
      batchMultiplier: batches,
    });
    if (requiredQuantity <= 0) continue;

    if (!comp.rawMaterialId) {
      warnings.push(`"${comp.name}" isn't linked to a raw material — it can't be purchased from this plan.`);
      continue;
    }

    const rawMaterial = await db.getRawMaterialById(comp.rawMaterialId);
    const leadTimeDays = rawMaterial?.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
    const netted = await netRequirementAgainstStock({
      rawMaterialId: comp.rawMaterialId,
      requiredQuantity,
      orderBufferPercent: args.orderBufferPercent,
      leadTimeDays,
      requiredByDate: args.requiredByDate,
    });

    const unitCost = parseFloat(
      comp.unitCost?.toString() || rawMaterial?.unitCost?.toString() || "0",
    );
    const vendor = rawMaterial?.preferredVendorId
      ? await db.getVendorById(rawMaterial.preferredVendorId)
      : await db.getPreferredVendorForMaterial(comp.rawMaterialId);

    requirements.push({
      rawMaterialId: comp.rawMaterialId,
      name: comp.name,
      sku: comp.sku ?? rawMaterial?.sku ?? undefined,
      requiredQuantity,
      unit: comp.unit || rawMaterial?.unit || "EA",
      preferredVendorId: vendor?.id,
      vendorName: vendor?.name,
      estimatedUnitCost: unitCost,
      estimatedRunCost: requiredQuantity * unitCost,
      estimatedPurchaseCost: netted.suggestedOrderQuantity * unitCost,
      leadTimeDays,
      requiredByDate: args.requiredByDate,
      ...netted,
    });
  }

  return { requirements, warnings, batches };
}

/**
 * Explode a recipe (sub-recipes included) into material requirements, so
 * purchase orders can be raised for the exact ingredient amounts a run needs.
 * Ingredients are matched to raw materials by SKU/name; when `createMissing`
 * is set, an unmatched ingredient gets a raw material created for it.
 */
export async function planRequirementsFromRecipe(args: {
  recipeId: number;
  formulation: "wet" | "dry";
  grams: number;
  accountForYield: boolean;
  orderBufferPercent: number;
  requiredByDate: Date;
  createMissing: boolean;
}): Promise<PlanRequirementsResult & { totalIngredientCost: number }> {
  const warnings: string[] = [];
  const explosion = await manufacturingDb.explodeRecipeToIngredients({
    recipeId: args.recipeId,
    formulation: args.formulation,
    batchGrams: args.grams,
    accountForYield: args.accountForYield,
  });
  if (!explosion) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });
  if (explosion.ingredients.length === 0) {
    warnings.push("This recipe has no ingredient lines with a quantity — nothing to purchase.");
  }

  const requirements: PlanRequirementDraft[] = [];

  for (const ing of explosion.ingredients) {
    let rawMaterial = await db.getRawMaterialByNameOrSku(ing.name, ing.sku);
    if (!rawMaterial && args.createMissing) {
      await db.createRawMaterial({
        name: ing.name,
        sku: ing.sku,
        unit: ing.unit === "EA" ? "EA" : "g",
        unitCost: ing.costPerUnit.toString(),
        preferredVendorId: ing.supplierId ?? undefined,
        leadTimeDays: ing.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS,
        status: "active",
      });
      rawMaterial = await db.getRawMaterialByNameOrSku(ing.name, ing.sku);
    }
    if (!rawMaterial) {
      warnings.push(`"${ing.name}" has no raw material record yet — it won't appear on a purchase order.`);
    }

    // Requirements are stated in the raw material's stocking unit so stock,
    // open POs and purchase quantities all line up.
    const stockUnit = normalizePlanUnit(rawMaterial?.unit) ?? (ing.unit === "EA" ? "EA" : "G");
    let requiredQuantity = ing.quantity;
    let unitLabel = rawMaterial?.unit || (ing.unit === "EA" ? "EA" : "g");
    if (ing.unit === "g" && stockUnit !== "G") {
      try {
        requiredQuantity = convertPlanQuantity(ing.quantity, "G", stockUnit, {});
      } catch {
        unitLabel = "g";
        warnings.push(
          `"${ing.name}" is stocked in ${rawMaterial?.unit} — the requirement is left in grams, convert before ordering.`,
        );
      }
    } else if (ing.unit === "EA" && stockUnit !== "EA") {
      unitLabel = "EA";
      warnings.push(
        `"${ing.name}" is costed per each but stocked in ${rawMaterial?.unit} — the requirement is left in units.`,
      );
    }

    const leadTimeDays = rawMaterial?.leadTimeDays ?? ing.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
    const netted = await netRequirementAgainstStock({
      rawMaterialId: rawMaterial?.id ?? null,
      requiredQuantity,
      orderBufferPercent: args.orderBufferPercent,
      leadTimeDays,
      requiredByDate: args.requiredByDate,
    });

    const vendorId = rawMaterial?.preferredVendorId ?? ing.supplierId ?? undefined;
    const vendor = vendorId
      ? await db.getVendorById(vendorId)
      : rawMaterial
        ? await db.getPreferredVendorForMaterial(rawMaterial.id)
        : undefined;

    // Cost comes from the recipe's ingredient costing, restated per stocking unit.
    const unitCost = requiredQuantity > 0 ? ing.cost / requiredQuantity : 0;

    requirements.push({
      rawMaterialId: rawMaterial?.id ?? null,
      ingredientId: ing.ingredientId,
      name: ing.name,
      sku: ing.sku,
      requiredQuantity,
      unit: unitLabel,
      preferredVendorId: vendor?.id,
      vendorName: vendor?.name,
      estimatedUnitCost: unitCost,
      estimatedRunCost: ing.cost,
      estimatedPurchaseCost: netted.suggestedOrderQuantity * unitCost,
      leadTimeDays,
      requiredByDate: args.requiredByDate,
      ...netted,
    });
  }

  return {
    requirements,
    warnings,
    batches: explosion.batches,
    totalIngredientCost: explosion.totalCost,
  };
}

/** Write a plan's drafted requirements to materialRequirements. */
export async function persistPlanRequirements(planId: number, requirements: PlanRequirementDraft[]) {
  for (const req of requirements) {
    if (!req.rawMaterialId) continue;
    await db.createMaterialRequirement({
      productionPlanId: planId,
      rawMaterialId: req.rawMaterialId,
      requiredQuantity: req.requiredQuantity.toFixed(4),
      unit: req.unit,
      currentInventory: req.currentInventory.toFixed(4),
      onOrderQuantity: req.onOrderQuantity.toFixed(4),
      shortageQuantity: req.shortageQuantity.toFixed(4),
      suggestedOrderQuantity: req.suggestedOrderQuantity.toFixed(4),
      preferredVendorId: req.preferredVendorId,
      estimatedUnitCost: req.estimatedUnitCost.toFixed(4),
      estimatedTotalCost: req.estimatedPurchaseCost.toFixed(2),
      leadTimeDays: req.leadTimeDays,
      requiredByDate: req.requiredByDate,
      latestOrderDate: req.latestOrderDate,
      estimatedDeliveryDate: req.estimatedDeliveryDate,
      isUrgent: req.isUrgent,
      status: "pending",
    });
  }
}

/** Input shared by the plan preview (query) and plan create (mutation) routes. */
export const manualProductionPlanInput = z.object({
  /** Finished product the plan produces. Optional when the recipe already points at one. */
  productId: z.number().optional(),
  recipeId: z.number().optional(),
  bomId: z.number().optional(),
  formulation: z.enum(["wet", "dry"]).default("wet"),
  quantity: z.number().positive(),
  unit: z.enum(PLAN_UNITS).default("EA"),
  /** Needed to plan in cases. */
  unitsPerCase: z.number().positive().optional(),
  /** Needed to move between counts (EA/CASE) and weights (LB/KG/G/OZ). */
  unitWeightGrams: z.number().positive().optional(),
  safetyMarginPercent: z.number().min(0).max(500).default(0),
  netOffInventory: z.boolean().default(false),
  orderBufferPercent: z.number().min(0).max(100).default(0),
  /** Gross the run up so the finished output matches the target despite yield loss. */
  accountForYield: z.boolean().default(true),
  plannedStartDate: z.date().optional(),
  plannedEndDate: z.date().optional(),
  notes: z.string().optional(),
});

export type ManualProductionPlanInput = z.infer<typeof manualProductionPlanInput>;

/**
 * Work out everything a manual production plan needs: how much to make, and
 * what to buy for it. Used unchanged for preview (persist = false) and create.
 */
export async function buildManualProductionPlan(
  input: ManualProductionPlanInput,
  ctx: { userId?: number },
  opts: { persist: boolean },
) {
  const warnings: string[] = [];

  let recipe = input.recipeId ? await manufacturingDb.getRecipeById(input.recipeId) : undefined;
  if (input.recipeId && !recipe) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });
  }
  if (input.recipeId && ctx.userId) {
    await requireRecipeAccess(ctx.userId, input.recipeId, "view");
  }

  const productId = input.productId ?? recipe?.outputProductId ?? undefined;
  if (!productId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Pick the finished product this plan produces (or link the recipe to a product first).",
    });
  }
  const product = await db.getProductById(productId);
  if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

  // Source: an explicit recipe, an explicit BOM, or the product's active BOM.
  let bomId = input.bomId;
  if (!recipe && !bomId) {
    const boms = await db.getBillOfMaterials({ productId });
    const active = boms.find((b) => b.status === "active") ?? boms[0];
    if (!active) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No recipe or BOM for this product — pick a recipe, or build a BOM first.",
      });
    }
    bomId = active.id;
  }

  const unitContext: UnitContext = {
    unitsPerCase: input.unitsPerCase,
    unitWeightGrams: input.unitWeightGrams,
    batchGrams: recipe ? parseFloat(recipe.baseBatchGrams?.toString() || "0") : undefined,
  };

  // Finished goods already on hand, restated in the plan's unit.
  let currentInventory = 0;
  if (input.netOffInventory) {
    const inventoryRecords = await db.getInventory({ productId });
    const onHandEach = inventoryRecords.reduce(
      (sum, inv) => sum + parseFloat(inv.quantity?.toString() || "0"),
      0,
    );
    try {
      currentInventory = convertPlanQuantity(onHandEach, "EA", input.unit, unitContext);
    } catch {
      warnings.push(
        `On-hand stock is counted in units — can't net it off a plan in ${input.unit} without a unit weight.`,
      );
    }
  }

  const targets = computePlanTargets({
    quantity: input.quantity,
    safetyMarginPercent: input.safetyMarginPercent,
    currentInventory,
    netOffInventory: input.netOffInventory,
  });

  const requiredByDate =
    input.plannedStartDate ?? new Date(Date.now() + DEFAULT_REQUIRED_BY_DAYS * 24 * 60 * 60 * 1000);

  let result: PlanRequirementsResult & { totalIngredientCost?: number };
  if (recipe) {
    let grams: number;
    try {
      grams = toGrams(targets.plannedQuantity, input.unit, unitContext);
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof PlanUnitError
          ? `${error.message} Add a unit weight (grams per finished unit) to plan a recipe in ${input.unit}.`
          : String(error),
      });
    }
    result = await planRequirementsFromRecipe({
      recipeId: recipe.id,
      formulation: input.formulation,
      grams,
      accountForYield: input.accountForYield,
      orderBufferPercent: input.orderBufferPercent,
      requiredByDate,
      createMissing: opts.persist,
    });
  } else {
    result = await planRequirementsFromBom({
      bomId: bomId!,
      plannedQuantity: targets.plannedQuantity,
      planUnit: input.unit,
      unitContext,
      orderBufferPercent: input.orderBufferPercent,
      requiredByDate,
    });
  }

  const requirements = result.requirements;
  const summary = {
    productId,
    productName: product.name,
    recipeId: recipe?.id,
    recipeName: recipe?.name,
    bomId,
    unit: input.unit,
    targetQuantity: targets.targetQuantity,
    safetyStock: targets.safetyStock,
    plannedQuantity: targets.plannedQuantity,
    currentInventory,
    batches: result.batches,
    requiredByDate,
    materialCount: requirements.length,
    shortageCount: requirements.filter((r) => r.shortageQuantity > 0).length,
    urgentCount: requirements.filter((r) => r.isUrgent && r.shortageQuantity > 0).length,
    estimatedRunCost: requirements.reduce((sum, r) => sum + r.estimatedRunCost, 0),
    estimatedPurchaseCost: requirements.reduce((sum, r) => sum + r.estimatedPurchaseCost, 0),
  };

  if (!opts.persist) {
    return { plan: null, summary, requirements, warnings: [...warnings, ...result.warnings] };
  }

  if (targets.plannedQuantity <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "On-hand stock already covers this target — nothing to produce.",
    });
  }

  const plan = await db.createProductionPlan({
    productId,
    bomId: bomId ?? recipe?.bomId ?? undefined,
    plannedQuantity: targets.plannedQuantity.toFixed(4),
    unit: input.unit,
    plannedStartDate: input.plannedStartDate,
    plannedEndDate: input.plannedEndDate,
    currentInventory: currentInventory.toFixed(4),
    safetyStock: targets.safetyStock.toFixed(4),
    status: "draft",
    notes: [
      recipe ? `Recipe: ${recipe.name} (${input.formulation})` : `BOM #${bomId}`,
      `Target ${input.quantity} ${input.unit}${input.safetyMarginPercent ? ` + ${input.safetyMarginPercent}% margin` : ""}`,
      input.notes,
    ]
      .filter(Boolean)
      .join(" · "),
    createdBy: ctx.userId,
  });

  await persistPlanRequirements(plan.id, requirements);

  return {
    plan: { ...plan, ...summary },
    summary,
    requirements,
    warnings: [...warnings, ...result.warnings],
  };
}

// Helper function to calculate next generation date for recurring invoices
export function calculateNextGenerationDate(
  frequency: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): Date {
  const now = new Date();
  const next = new Date(now);
  
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      if (dayOfWeek !== undefined && dayOfWeek !== null) {
        const currentDay = next.getDay();
        const daysUntil = (dayOfWeek - currentDay + 7) % 7;
        next.setDate(next.getDate() + daysUntil);
      }
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  
  return next;
}

// Helper function to map Shopify order status to DB enum
export function mapShopifyOrderStatusToDb(financialStatus: string, fulfillmentStatus: string | null): 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' {
  if (financialStatus === 'refunded') return 'refunded';
  if (financialStatus === 'voided') return 'cancelled';
  if (fulfillmentStatus === 'fulfilled') return 'delivered';
  if (fulfillmentStatus === 'partial') return 'shipped';
  if (financialStatus === 'paid') return 'confirmed';
  return 'pending';
}
