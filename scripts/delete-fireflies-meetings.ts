/**
 * Wipe all rows from the fireflies_meetings table so a fresh sync
 * picks up the new audio_url, transcriptText, and parsed action items.
 *
 * Downstream rows (tasks, CRM contacts, deals, projects) are intentionally
 * left in place — re-running sync just creates new meeting rows and
 * re-queues any action items it finds.
 *
 * Usage: pnpm tsx scripts/delete-fireflies-meetings.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import "dotenv/config";

const db = drizzle(process.env.DATABASE_URL!);

async function main() {
  const existing = await db.select({ id: schema.firefliesMeetings.id }).from(schema.firefliesMeetings);
  console.log(`Found ${existing.length} fireflies meeting rows.`);

  if (existing.length === 0) {
    console.log("Nothing to delete.");
    process.exit(0);
  }

  await db.delete(schema.firefliesMeetings);
  console.log(`Deleted ${existing.length} rows from fireflies_meetings.`);
  console.log("Run a Sync from the Meetings page to repopulate.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
