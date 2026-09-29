/**
 * Paid-ads automations. One tick every 15 minutes decides what is due:
 *
 *  - after 06:00 UTC, once a day:   yesterday's spend from every platform
 *  - every tick:                    poll platforms that don't push leads
 *  - once a day (after the sync):   cost-per-signup / budget / credit alerts
 *  - Mondays, once:                 weekly summary
 *
 * "Once" is enforced by ad_sync_logs (kind + period), so restarts and a
 * second server instance never repeat a run.
 */
import * as db from "./db";
import { createLogger } from "./_core/logger";
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
  spendSynced: boolean;
  leadsPolled: boolean;
  alertsChecked: boolean;
  weeklySent: boolean;
}

export async function adMarketingTick(now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { spendSynced: false, leadsPolled: false, alertsChecked: false, weeklySent: false };
  const today = toIsoDate(now);
  const yesterday = addIsoDays(today, -1);

  // Anything to do at all? No platforms and no campaigns → stay quiet.
  const platforms = await db.getAdPlatforms(null);
  const connected = platforms.filter((p) => p.accessToken);

  if (now.getUTCHours() >= SPEND_SYNC_HOUR_UTC && connected.length > 0) {
    const pending = [];
    for (const p of connected) {
      if (!(await db.hasAdSyncLog("spend_sync", yesterday, p.id))) pending.push(p);
    }
    if (pending.length > 0) {
      await runDailySpendSync(yesterday);
      result.spendSynced = true;
    }
  }

  if (connected.some((p) => p.name === "linkedin")) {
    await runLeadPoll(now);
    result.leadsPolled = true;
  }

  if (now.getUTCHours() >= SPEND_SYNC_HOUR_UTC && !(await db.hasAdSyncLog("alert_check", today))) {
    const r = await runAlertChecks(now);
    await db.createAdSyncLog({ kind: "alert_check", period: today, status: "success", rowsAffected: r.cpsAlerts + r.budgetAlerts + r.creditAlerts });
    result.alertsChecked = true;
  }

  if (now.getUTCDay() === 1 && now.getUTCHours() >= SPEND_SYNC_HOUR_UTC) {
    const week = isoWeek(now);
    if (!(await db.hasAdSyncLog("weekly_summary", week))) {
      await runWeeklySummary(now);
      await db.createAdSyncLog({ kind: "weekly_summary", period: week, status: "success" });
      result.weeklySent = true;
    }
  }

  return result;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startAdMarketingScheduler(intervalMs: number = TICK_INTERVAL_MS): void {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await adMarketingTick();
      if (r.spendSynced || r.alertsChecked || r.weeklySent) logger.info("Tick", { ...r });
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
