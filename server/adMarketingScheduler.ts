/**
 * Paid-ads automations. One tick every 15 minutes decides what is due:
 *
 *  - after 06:00 UTC, once a day:   yesterday's spend from every platform
 *  - every tick:                    poll platforms that don't push leads
 *  - once a day (after the sync):   cost-per-signup / budget / credit alerts
 *  - Mondays, once:                 weekly summary
 *
 * "Once" is enforced by claiming a row in ad_sync_logs (unique claim key)
 * before any work happens, so two instances or a restart never repeat a run.
 * A failed run is reclaimable and so retried on a later tick.
 *
 * In multi-tenant mode the tick runs once per tenant inside that tenant's
 * context (getDb() refuses tenantless access there).
 */
import * as db from "./db";
import { createLogger } from "./_core/logger";
import { forEachTenant, isMultiTenant } from "./_core/tenancy";
import { addIsoDays, toIsoDate } from "../shared/adMarketing";
import { runAlertChecks, runDailySpendSync, runLeadPoll, runWeeklySummary } from "./adMarketingService";

const logger = createLogger("AdMarketingScheduler");

export const TICK_INTERVAL_MS = 15 * 60 * 1000;
/** Platforms finish yesterday's reports overnight; don't ask before this hour (UTC). */
export const SPEND_SYNC_HOUR_UTC = 6;

/** ISO week key, e.g. 2026-W40. */
export function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface TickResult {
  spendSynced: number;
  leadsPolled: boolean;
  alertsChecked: boolean;
  weeklySent: boolean;
}

/** Claim a run, do it, record the outcome. Returns false when another instance holds it. */
async function claimed(kind: "alert_check" | "weekly_summary", period: string, work: () => Promise<number>): Promise<boolean> {
  const logId = await db.claimAdSyncRun({ kind, period });
  if (!logId) return false;
  try {
    const rows = await work();
    await db.finishAdSyncRun(logId, { status: "success", rowsAffected: rows });
  } catch (e) {
    await db.finishAdSyncRun(logId, { status: "failed", message: e instanceof Error ? e.message : String(e) });
    throw e;
  }
  return true;
}

export async function adMarketingTick(now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { spendSynced: 0, leadsPolled: false, alertsChecked: false, weeklySent: false };
  const today = toIsoDate(now);
  const yesterday = addIsoDays(today, -1);
  const afterReports = now.getUTCHours() >= SPEND_SYNC_HOUR_UTC;

  const platforms = await db.getAdPlatforms(null);
  const connected = platforms.filter((p) => p.accessToken);

  // Each platform/day is claimed inside runDailySpendSync; already-synced platforms are skipped there.
  if (afterReports && connected.length > 0) {
    result.spendSynced = (await runDailySpendSync(yesterday)).length;
  }

  if (connected.some((p) => p.name === "linkedin")) {
    await runLeadPoll(now);
    result.leadsPolled = true;
  }

  if (afterReports) {
    result.alertsChecked = await claimed("alert_check", today, async () => {
      const r = await runAlertChecks(now);
      return r.cpsAlerts + r.budgetAlerts + r.creditAlerts;
    });
  }

  if (now.getUTCDay() === 1 && afterReports) {
    result.weeklySent = await claimed("weekly_summary", isoWeek(now), async () => (await runWeeklySummary(now)).length);
  }

  return result;
}

/** One tick for every tenant (or just once when not multi-tenant). */
export async function runTickForAllTenants(now: Date = new Date()): Promise<void> {
  if (!isMultiTenant()) {
    const r = await adMarketingTick(now);
    if (r.spendSynced || r.alertsChecked || r.weeklySent) logger.info("Tick", { ...r });
    return;
  }
  const failures = await forEachTenant(async (tenant) => {
    const r = await adMarketingTick(now);
    if (r.spendSynced || r.alertsChecked || r.weeklySent) logger.info("Tick", { tenant: tenant.slug, ...r });
  });
  for (const f of failures) logger.warn("Tick failed", { tenant: f.slug, error: f.error instanceof Error ? f.error.message : String(f.error) });
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startAdMarketingScheduler(intervalMs: number = TICK_INTERVAL_MS): void {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runTickForAllTenants();
    } catch (e) {
      logger.warn("Tick failed", { error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 90 * 1000).unref?.();
  logger.info("Started", { intervalMs });
}

export function stopAdMarketingScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
