/**
 * Email Polling Worker
 *
 * Background worker that automatically polls configured IMAP accounts
 * for new emails at their configured intervals. Uses the existing
 * emailInboxScanner and database infrastructure.
 */

import * as crypto from "crypto";
import * as db from "./db";
import { scanInbox, type EmailInboxConfig } from "./_core/emailInboxScanner";
import { quickCategorize } from "./_core/emailParser";

// Worker configuration
interface PollingWorkerConfig {
  tickIntervalMs: number; // How often to check for due polls
  enabled: boolean;
}

const defaultConfig: PollingWorkerConfig = {
  tickIntervalMs: 60000, // Check every 60 seconds for accounts due to poll
  enabled: true,
};

let workerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;
let config: PollingWorkerConfig = { ...defaultConfig };

/**
 * Start the email polling worker
 */
export function startEmailPollingWorker(
  customConfig?: Partial<PollingWorkerConfig>
): void {
  if (workerInterval) {
    console.log("[EmailPollingWorker] Already running");
    return;
  }

  config = { ...defaultConfig, ...customConfig };

  if (!config.enabled) {
    console.log("[EmailPollingWorker] Worker disabled in config");
    return;
  }

  console.log(
    `[EmailPollingWorker] Starting with tick interval: ${config.tickIntervalMs}ms`
  );

  // Initial run after a short delay to let other services initialize
  setTimeout(pollDueAccounts, 5000);

  // Set up interval
  workerInterval = setInterval(pollDueAccounts, config.tickIntervalMs);

  console.log("[EmailPollingWorker] Started successfully");
}

/**
 * Stop the email polling worker
 */
export function stopEmailPollingWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[EmailPollingWorker] Stopped");
  }
}

/**
 * Get worker status
 */
export function getPollingWorkerStatus(): {
  running: boolean;
  isProcessing: boolean;
  config: PollingWorkerConfig;
} {
  return {
    running: workerInterval !== null,
    isProcessing,
    config,
  };
}

/**
 * Decrypt an IMAP password stored in the database
 */
function decryptPassword(encrypted: string): string {
  const key = process.env.JWT_SECRET || "default-key";
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    crypto.createHash("sha256").update(key).digest().slice(0, 32),
    Buffer.alloc(16, 0)
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Check for accounts that are due to be polled and scan them
 */
async function pollDueAccounts(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Strategy 1: Check imapCredentials with pollingEnabled
    const pollingCredentials = await db.getActivePollingCredentials();

    for (const cred of pollingCredentials) {
      const now = Date.now();
      const intervalMs = cred.pollingIntervalMinutes * 60 * 1000;
      const lastPolled = cred.lastPolledAt
        ? new Date(cred.lastPolledAt).getTime()
        : 0;

      // Skip if not yet due
      if (lastPolled > 0 && now - lastPolled < intervalMs) {
        continue;
      }

      await pollImapCredential(cred);
    }

    // Strategy 2: Check scheduledEmailScans that are due
    const dueScans = await db.getDueScheduledScans();

    for (const { scan, credential } of dueScans) {
      if (!scan || !credential) continue;
      await pollScheduledScan(scan, credential);
    }
  } catch (error) {
    console.error("[EmailPollingWorker] Error in poll cycle:", error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Poll a single IMAP credential account
 */
async function pollImapCredential(cred: {
  id: number;
  host: string;
  port: number;
  secure: boolean;
  email: string;
  encryptedPassword: string;
  folder: string;
  unseenOnly: boolean;
  markAsSeen: boolean;
  lastMessageUid: number | null;
}): Promise<void> {
  const logPrefix = `[EmailPollingWorker][${cred.email}]`;

  // Create scan log
  let scanLogId: number | undefined;
  try {
    const logResult = await db.createScanLog({ credentialId: cred.id });
    scanLogId = logResult.id;
  } catch {
    // Non-critical, continue without log
  }

  try {
    console.log(`${logPrefix} Polling for new emails...`);

    const password = decryptPassword(cred.encryptedPassword);

    const imapConfig: EmailInboxConfig = {
      host: cred.host,
      port: cred.port,
      secure: cred.secure,
      auth: {
        user: cred.email,
        pass: password,
      },
    };

    const result = await scanInbox(imapConfig, {
      folder: cred.folder,
      unseenOnly: cred.unseenOnly,
      markAsSeen: cred.markAsSeen,
      limit: 50,
    });

    if (!result.success) {
      const errorMsg = result.errors.join("; ");
      console.warn(`${logPrefix} Scan failed: ${errorMsg}`);
      await db.updateImapCredential(cred.id, {
        lastPolledAt: new Date(),
        lastError: errorMsg,
      });
      if (scanLogId) {
        await db.updateScanLog(scanLogId, {
          completedAt: new Date(),
          status: "failed",
          errorMessage: errorMsg,
        });
      }
      return;
    }

    // Store new emails in the database
    let processed = 0;
    let categorized = 0;
    let maxUid = cred.lastMessageUid || 0;

    for (const email of result.processedEmails) {
      // Skip emails we've already processed
      if (cred.lastMessageUid && email.uid <= cred.lastMessageUid) {
        continue;
      }

      try {
        await db.createInboundEmail({
          messageId: email.messageId,
          fromEmail: email.from.address,
          fromName: email.from.name || null,
          toEmail: email.to[0] || cred.email,
          subject: email.subject,
          bodyText: email.bodyText,
          bodyHtml: email.bodyHtml || null,
          receivedAt: email.date,
          category: email.categorization?.category || null,
          categoryConfidence: email.categorization?.confidence
            ? String(email.categorization.confidence)
            : null,
          priority: email.categorization?.priority || "medium",
          parsingStatus: "pending",
        });
        processed++;
        if (email.categorization) categorized++;
        if (email.uid > maxUid) maxUid = email.uid;
      } catch (insertErr: any) {
        // Duplicate messageId is expected for already-tracked emails
        if (!insertErr.message?.includes("Duplicate")) {
          console.warn(
            `${logPrefix} Failed to store email ${email.messageId}:`,
            insertErr.message
          );
        }
      }
    }

    // Update credential tracking state
    await db.updateImapCredential(cred.id, {
      lastPolledAt: new Date(),
      lastMessageUid: maxUid > 0 ? maxUid : cred.lastMessageUid,
      lastError: null,
      lastSuccessAt: new Date(),
    });

    if (scanLogId) {
      await db.updateScanLog(scanLogId, {
        completedAt: new Date(),
        status: "success",
        emailsFound: result.newEmails,
        emailsProcessed: processed,
        emailsCategorized: categorized,
      });
    }

    if (processed > 0) {
      console.log(
        `${logPrefix} Found ${result.newEmails} emails, stored ${processed} new (${categorized} categorized)`
      );
    }
  } catch (error: any) {
    console.error(`${logPrefix} Error:`, error.message);
    await db.updateImapCredential(cred.id, {
      lastPolledAt: new Date(),
      lastError: error.message,
    });
    if (scanLogId) {
      await db.updateScanLog(scanLogId, {
        completedAt: new Date(),
        status: "failed",
        errorMessage: error.message,
      });
    }
  }
}

/**
 * Poll a scheduled email scan (uses emailCredentials table)
 */
async function pollScheduledScan(
  scan: {
    id: number;
    credentialId: number;
    intervalMinutes: number | null;
    totalRuns: number | null;
    totalEmailsProcessed: number | null;
  },
  credential: {
    id: number;
    imapHost: string | null;
    imapPort: number | null;
    imapSecure: boolean | null;
    imapUsername: string | null;
    imapPassword: string | null;
    scanFolder: string | null;
    scanUnreadOnly: boolean | null;
    markAsRead: boolean | null;
    maxEmailsPerScan: number | null;
    email: string;
  }
): Promise<void> {
  const logPrefix = `[EmailPollingWorker][scheduled:${scan.id}][${credential.email}]`;

  if (!credential.imapHost || !credential.imapPassword) {
    console.warn(`${logPrefix} Missing IMAP config, skipping`);
    await db.updateScheduledScan(scan.id, {
      lastRunAt: new Date(),
      lastRunStatus: "failed",
      lastRunError: "Missing IMAP configuration",
      nextRunAt: new Date(
        Date.now() + (scan.intervalMinutes || 15) * 60 * 1000
      ),
    });
    return;
  }

  // Create scan log
  let scanLogId: number | undefined;
  try {
    const logResult = await db.createScanLog({
      credentialId: credential.id,
      scheduledScanId: scan.id,
    });
    scanLogId = logResult.id;
  } catch {
    // Non-critical
  }

  try {
    console.log(`${logPrefix} Running scheduled scan...`);

    const password = decryptPassword(credential.imapPassword);

    const imapConfig: EmailInboxConfig = {
      host: credential.imapHost,
      port: credential.imapPort || 993,
      secure: credential.imapSecure ?? true,
      auth: {
        user: credential.imapUsername || credential.email,
        pass: password,
      },
    };

    const result = await scanInbox(imapConfig, {
      folder: credential.scanFolder || "INBOX",
      unseenOnly: credential.scanUnreadOnly ?? true,
      markAsSeen: credential.markAsRead ?? false,
      limit: credential.maxEmailsPerScan || 50,
    });

    let processed = 0;
    let categorized = 0;

    if (result.success) {
      for (const email of result.processedEmails) {
        try {
          await db.createInboundEmail({
            messageId: email.messageId,
            fromEmail: email.from.address,
            fromName: email.from.name || null,
            toEmail: email.to[0] || credential.email,
            subject: email.subject,
            bodyText: email.bodyText,
            bodyHtml: email.bodyHtml || null,
            receivedAt: email.date,
            category: email.categorization?.category || null,
            categoryConfidence: email.categorization?.confidence
              ? String(email.categorization.confidence)
              : null,
            priority: email.categorization?.priority || "medium",
            parsingStatus: "pending",
          });
          processed++;
          if (email.categorization) categorized++;
        } catch (insertErr: any) {
          if (!insertErr.message?.includes("Duplicate")) {
            console.warn(
              `${logPrefix} Failed to store email ${email.messageId}:`,
              insertErr.message
            );
          }
        }
      }
    }

    const status = result.success ? "success" : "failed";

    // Update scheduled scan state
    await db.updateScheduledScan(scan.id, {
      lastRunAt: new Date(),
      lastRunStatus: status,
      lastRunError: result.success ? null : result.errors.join("; "),
      lastRunEmailsFound: result.newEmails,
      nextRunAt: new Date(
        Date.now() + (scan.intervalMinutes || 15) * 60 * 1000
      ),
      totalRuns: (scan.totalRuns || 0) + 1,
      totalEmailsProcessed: (scan.totalEmailsProcessed || 0) + processed,
    });

    if (scanLogId) {
      await db.updateScanLog(scanLogId, {
        completedAt: new Date(),
        status,
        emailsFound: result.newEmails,
        emailsProcessed: processed,
        emailsCategorized: categorized,
        errorMessage: result.success ? null : result.errors.join("; "),
      });
    }

    if (processed > 0) {
      console.log(
        `${logPrefix} Stored ${processed} new emails (${categorized} categorized)`
      );
    }
  } catch (error: any) {
    console.error(`${logPrefix} Error:`, error.message);
    await db.updateScheduledScan(scan.id, {
      lastRunAt: new Date(),
      lastRunStatus: "failed",
      lastRunError: error.message,
      nextRunAt: new Date(
        Date.now() + (scan.intervalMinutes || 15) * 60 * 1000
      ),
      totalRuns: (scan.totalRuns || 0) + 1,
    });
    if (scanLogId) {
      await db.updateScanLog(scanLogId, {
        completedAt: new Date(),
        status: "failed",
        errorMessage: error.message,
      });
    }
  }
}
