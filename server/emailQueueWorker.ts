/**
 * Email Queue Worker
 *
 * Background worker that processes queued transactional emails.
 * Uses a simple interval-based approach for processing.
 */

import * as db from "./db";
import * as emailService from "./_core/emailService";
import { ENV } from "./_core/env";

// Worker configuration
interface WorkerConfig {
  checkIntervalMs: number;    // How often to check for queued emails
  batchSize: number;          // Max emails to process per batch
  maxConcurrent: number;      // Max concurrent sends
  enabled: boolean;           // Whether the worker is enabled
}

const defaultConfig: WorkerConfig = {
  checkIntervalMs: 30000,     // Check every 30 seconds
  batchSize: 10,              // Process up to 10 emails per batch
  maxConcurrent: 5,           // Send up to 5 emails concurrently
  enabled: true,
};

let workerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;
let config: WorkerConfig = { ...defaultConfig };

/**
 * Start the email queue worker
 */
export function startEmailQueueWorker(customConfig?: Partial<WorkerConfig>): void {
  if (workerInterval) {
    console.log("[EmailQueueWorker] Already running");
    return;
  }

  // Check if email is configured
  if (!ENV.sendgridApiKey || !ENV.sendgridFromEmail) {
    console.log("[EmailQueueWorker] SendGrid not configured - worker disabled");
    return;
  }

  config = { ...defaultConfig, ...customConfig };

  if (!config.enabled) {
    console.log("[EmailQueueWorker] Worker disabled in config");
    return;
  }

  console.log(`[EmailQueueWorker] Starting with config:`, {
    checkIntervalMs: config.checkIntervalMs,
    batchSize: config.batchSize,
    maxConcurrent: config.maxConcurrent,
  });

  // Initial run
  processQueuedEmails();

  // Set up interval
  workerInterval = setInterval(processQueuedEmails, config.checkIntervalMs);

  console.log("[EmailQueueWorker] Started successfully");
}

/**
 * Stop the email queue worker
 */
export function stopEmailQueueWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[EmailQueueWorker] Stopped");
  }
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  running: boolean;
  isProcessing: boolean;
  config: WorkerConfig;
} {
  return {
    running: workerInterval !== null,
    isProcessing,
    config,
  };
}

/**
 * Process queued emails
 */
async function processQueuedEmails(): Promise<void> {
  // Prevent overlapping runs
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    // Get queued emails
    const queuedMessages = await db.getQueuedEmailMessages(config.batchSize);

    if (queuedMessages.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`[EmailQueueWorker] Processing ${queuedMessages.length} queued email(s)`);

    // Process in batches to respect maxConcurrent
    const results: Array<{ id: number; success: boolean; error?: string }> = [];

    for (let i = 0; i < queuedMessages.length; i += config.maxConcurrent) {
      const batch = queuedMessages.slice(i, i + config.maxConcurrent);

      const batchResults = await Promise.all(
        batch.map(async (message: any) => {
          const result = await emailService.sendQueuedEmail(message.id);
          return {
            id: message.id,
            success: result.success,
            error: result.error,
          };
        })
      );

      results.push(...batchResults);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(
      `[EmailQueueWorker] Processed ${results.length} emails: ${successful} successful, ${failed} failed`
    );

    // Log any failures
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.warn(`[EmailQueueWorker] Failed to send email ${r.id}: ${r.error}`);
      });
  } catch (error) {
    console.error("[EmailQueueWorker] Error processing queue:", error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Manually trigger queue processing
 */
export async function triggerProcessing(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  if (isProcessing) {
    return { processed: 0, successful: 0, failed: 0 };
  }

  isProcessing = true;

  try {
    const queuedMessages = await db.getQueuedEmailMessages(config.batchSize);

    if (queuedMessages.length === 0) {
      return { processed: 0, successful: 0, failed: 0 };
    }

    const results: Array<{ success: boolean }> = [];

    for (let i = 0; i < queuedMessages.length; i += config.maxConcurrent) {
      const batch = queuedMessages.slice(i, i + config.maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (message: any) => {
          const result = await emailService.sendQueuedEmail(message.id);
          return { success: result.success };
        })
      );
      results.push(...batchResults);
    }

    return {
      processed: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  } finally {
    isProcessing = false;
  }
}
