/**
 * Background-task runner.
 *
 * Runs long-running, user-initiated work detached from the HTTP request that
 * started it. The originating tRPC mutation returns a `taskId` immediately; the
 * actual work continues in-process and records progress to the `background_tasks`
 * table (see server/db.ts). The client observes it through the `backgroundTasks`
 * router, so an operation like a Data Room ↔ Google Drive sync keeps running — and
 * stays visible in the global task tray — even after the user navigates away.
 *
 * This is intentionally lightweight (in-process, no external queue). Tasks left
 * running when the server restarts are reconciled to `error` at boot via
 * db.failInterruptedBackgroundTasks().
 */
import { randomUUID } from "node:crypto";
import * as db from "../db";

/** Thrown by report()/checkpoint() when the user has requested cancellation. */
export class BackgroundTaskCancelled extends Error {
  constructor() {
    super("Task cancelled");
    this.name = "BackgroundTaskCancelled";
  }
}

export interface BackgroundTaskProgress {
  /** Explicit 0..100 percentage. If omitted, it is derived from processed/total. */
  progress?: number;
  processed?: number;
  total?: number;
  message?: string;
}

export interface BackgroundTaskHandle {
  readonly taskId: string;
  /**
   * Record progress. Also acts as a cancellation checkpoint: if the user has
   * requested cancellation, this throws BackgroundTaskCancelled so the worker
   * unwinds cleanly. Progress writes are throttled to avoid hammering the DB.
   */
  report(update: BackgroundTaskProgress): Promise<void>;
  /** Non-throwing cancellation check for workers that prefer to branch. */
  isCancelled(): Promise<boolean>;
}

export interface RunBackgroundTaskOptions {
  userId: number;
  type: string;
  title: string;
  description?: string;
  total?: number;
  message?: string;
  entityType?: string;
  entityId?: number;
  /** Deep link the client uses to jump to the result. */
  link?: string;
}

/** Optional final summary a worker returns; stored on the task record. */
export interface BackgroundTaskResult {
  message?: string;
  link?: string;
  result?: unknown;
}

const PROGRESS_WRITE_INTERVAL_MS = 750;

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Start a background task. Resolves with `{ taskId }` as soon as the task row
 * exists — the worker runs detached and this promise does NOT wait for it.
 *
 * If no database is configured the work still runs (so functionality isn't lost),
 * just without persistence/visibility; `taskId` is returned regardless.
 */
export async function runBackgroundTask(
  options: RunBackgroundTaskOptions,
  worker: (handle: BackgroundTaskHandle) => Promise<BackgroundTaskResult | void>,
): Promise<{ taskId: string }> {
  const taskId = randomUUID();

  const created = await db.createBackgroundTask({
    id: taskId,
    userId: options.userId,
    type: options.type,
    title: options.title,
    description: options.description ?? null,
    total: options.total ?? 0,
    message: options.message ?? null,
    entityType: options.entityType ?? null,
    entityId: options.entityId ?? null,
    link: options.link ?? null,
  });

  let lastWrite = 0;
  let lastTotal = options.total ?? 0;
  let lastMessage = options.message ?? null;

  const handle: BackgroundTaskHandle = {
    taskId,
    async isCancelled() {
      if (!created) return false;
      return db.isBackgroundTaskCancelRequested(taskId);
    },
    async report(update) {
      if (!created) return;
      if (await db.isBackgroundTaskCancelRequested(taskId)) {
        throw new BackgroundTaskCancelled();
      }
      if (update.total !== undefined) lastTotal = update.total;

      const now = Date.now();
      const messageChanged = update.message !== undefined && update.message !== lastMessage;
      // Throttle frequent progress writes, but always let a changed status line
      // through so the message feels responsive.
      if (now - lastWrite < PROGRESS_WRITE_INTERVAL_MS && !messageChanged) {
        return;
      }
      lastWrite = now;
      if (update.message !== undefined) lastMessage = update.message;

      const derived = update.progress !== undefined
        ? clampPercent(update.progress)
        : (lastTotal > 0 && update.processed !== undefined
            ? clampPercent((update.processed / lastTotal) * 100)
            : undefined);

      await db.updateBackgroundTask(taskId, {
        status: "running",
        ...(derived !== undefined ? { progress: derived } : {}),
        ...(update.processed !== undefined ? { processed: update.processed } : {}),
        ...(update.total !== undefined ? { total: update.total } : {}),
        ...(update.message !== undefined ? { message: update.message } : {}),
      });
    },
  };

  // Detached execution — deliberately not awaited.
  void (async () => {
    if (created) {
      await db.updateBackgroundTask(taskId, {
        status: "running",
        startedAt: new Date(),
        message: options.message ?? "Starting…",
      });
    }

    try {
      const summary = (await worker(handle)) as BackgroundTaskResult | undefined;
      if (created) {
        await db.updateBackgroundTask(taskId, {
          status: "success",
          progress: 100,
          finishedAt: new Date(),
          ...(summary?.message !== undefined ? { message: summary.message } : {}),
          ...(summary?.link !== undefined ? { link: summary.link } : {}),
          ...(summary?.result !== undefined ? { result: summary.result as any } : {}),
        });
      }
    } catch (err: unknown) {
      // Treat as cancelled either when the worker surfaced our sentinel, or when
      // a cancel was requested but the worker rethrew a generic error (some
      // callees wrap/normalize errors from the progress callback).
      const cancelled =
        err instanceof BackgroundTaskCancelled ||
        (created && (await db.isBackgroundTaskCancelRequested(taskId)));
      if (cancelled) {
        if (created) {
          await db.updateBackgroundTask(taskId, {
            status: "cancelled",
            finishedAt: new Date(),
            message: "Cancelled",
          });
        }
        return;
      }
      const message = err instanceof Error ? err.message : "Task failed";
      console.error(`[BackgroundTask] ${options.type} (${taskId}) failed:`, err);
      if (created) {
        await db.updateBackgroundTask(taskId, {
          status: "error",
          finishedAt: new Date(),
          errorMessage: message.slice(0, 2000),
          message: message.slice(0, 500),
        });
      }
    }
  })();

  return { taskId };
}
