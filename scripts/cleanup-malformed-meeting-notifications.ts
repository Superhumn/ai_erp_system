/**
 * Remove malformed "Meeting Action Item" notifications.
 *
 * Background: an earlier Fireflies sync created notifications by iterating
 * `summary.action_items` with `for (const item of actionItems)`. Fireflies
 * returns `action_items` as a single markdown STRING, not an array, so the
 * loop iterated over individual CHARACTERS — producing one notification per
 * letter (title "Meeting Action Item: m", "Meeting Action Item: u", ...).
 *
 * The live sync no longer does this (it parses action items via
 * `parseActionItems` and routes them through the task/approval pipeline, not
 * notifications), but the broken rows remain in the DB and clutter the
 * notification panel with single-character entries.
 *
 * This script deletes those leftover rows. It is safe to re-run: the current
 * code path never creates "Meeting Action Item:" notifications, so any match
 * is an artifact of the old bug.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-malformed-meeting-notifications.ts            # preview only
 *   pnpm tsx scripts/cleanup-malformed-meeting-notifications.ts --delete   # actually delete
 */
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, like } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import "dotenv/config";

const db = drizzle(process.env.DATABASE_URL!);

// The old buggy loop always used type "reminder" and this exact title prefix.
const TITLE_PREFIX = "Meeting Action Item:";

async function main() {
  const apply = process.argv.includes("--delete");

  const where = and(
    eq(schema.notifications.type, "reminder"),
    like(schema.notifications.title, `${TITLE_PREFIX}%`),
  );

  const matches = await db
    .select({
      id: schema.notifications.id,
      title: schema.notifications.title,
      message: schema.notifications.message,
    })
    .from(schema.notifications)
    .where(where);

  console.log(`Found ${matches.length} malformed "${TITLE_PREFIX}" notification(s).`);
  if (matches.length === 0) {
    console.log("Nothing to clean up.");
    process.exit(0);
  }

  // Show a small sample so the operator can sanity-check before deleting.
  for (const row of matches.slice(0, 10)) {
    console.log(`  #${row.id}  ${JSON.stringify(row.title)}  (${row.message ?? ""})`);
  }
  if (matches.length > 10) console.log(`  ...and ${matches.length - 10} more.`);

  if (!apply) {
    console.log("\nDry run. Re-run with --delete to remove these rows.");
    process.exit(0);
  }

  await db.delete(schema.notifications).where(where);
  console.log(`\nDeleted ${matches.length} malformed notification(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
