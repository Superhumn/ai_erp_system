/**
 * Thread Follow-Up review report.
 *
 * Prints recent workflow activity (nudges sent/skipped, drops, escalations)
 * from thread_followup_logs so a week of dry-run output can be reviewed before
 * enabling live sends.
 *
 *   pnpm tsx scripts/thread-followup-report.ts        # last 7 days
 *   pnpm tsx scripts/thread-followup-report.ts 14     # last N days
 */
import "dotenv/config";
import { desc, gte } from "drizzle-orm";
import { getDb } from "../server/db/connection";
import { threadFollowupLogs } from "../drizzle/schema";

async function main() {
  const days = Number(process.argv[2]) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const db = await getDb();
  if (!db) {
    console.error("Database not available (is DATABASE_URL set?)");
    process.exit(1);
  }

  const rows = await db.select().from(threadFollowupLogs)
    .where(gte(threadFollowupLogs.createdAt, since))
    .orderBy(desc(threadFollowupLogs.createdAt));

  const counts: Record<string, number> = {};
  let dryRun = 0;
  for (const r of rows) {
    counts[r.action] = (counts[r.action] || 0) + 1;
    if (r.dryRun) dryRun++;
  }

  console.log(`\nThread Follow-Up — last ${days} day(s): ${rows.length} log entries (${dryRun} dry-run)\n`);
  console.log("By action:");
  for (const [action, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${action.padEnd(14)} ${n}`);
  }

  console.log("\nMost recent:");
  for (const r of rows.slice(0, 40)) {
    const when = r.createdAt ? new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 16) : "?";
    const flag = r.dryRun ? "[dry] " : "      ";
    const nudge = r.nudgeNumber ? ` #${r.nudgeNumber}` : "";
    const reason = r.reason ? ` (${r.reason})` : "";
    const to = (r.detail as any)?.to ? ` -> ${(r.detail as any).to}` : "";
    console.log(`  ${when} ${flag}${r.action}${nudge}${reason} thread=${r.threadId ?? "?"}${to}`);
  }
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
