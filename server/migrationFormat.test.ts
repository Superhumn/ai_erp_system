import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Drizzle's MySQL migrator splits each .sql file on `--> statement-breakpoint`
// and sends every chunk as a single query. Anything that only the `mysql` CLI
// understands (DELIMITER) or a chunk holding several statements fails with a
// syntax error at deploy time — which is what broke staging on 0063.

const dir = path.resolve(import.meta.dirname, "../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8"));
const files: string[] = journal.entries.map((e: { tag: string }) => `${e.tag}.sql`);

const STATEMENT_START = /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|CALL|RENAME|TRUNCATE)\b/i;

function topLevelStatements(chunk: string): number {
  let depth = 0;
  let count = 0;
  for (const raw of chunk.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (depth === 0 && STATEMENT_START.test(line)) count++;
    if (/^BEGIN\b/i.test(line)) depth++;
    if (/^END\s*(;|$)/i.test(line)) depth--;
  }
  return count;
}

describe("drizzle migrations are runnable by the Drizzle migrator", () => {
  it.each(files)("%s", (file) => {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    expect(sql, "DELIMITER is a mysql-CLI directive; the server rejects it").not.toMatch(/^\s*DELIMITER\b/im);
    for (const chunk of sql.split("--> statement-breakpoint")) {
      expect(
        topLevelStatements(chunk),
        `chunk holds more than one statement; add --> statement-breakpoint:\n${chunk.slice(0, 200)}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
