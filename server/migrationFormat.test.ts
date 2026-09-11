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

// Count top-level statements in a chunk by their `;` terminators, ignoring
// comments, string literals, backtick identifiers, and everything inside a
// BEGIN … END block (procedure bodies). Same-line statements such as
// `SET x=1; CREATE TABLE …` therefore count as two.
function topLevelStatements(chunk: string): number {
  // Strip line comments and quoted strings / identifiers so their contents
  // cannot be mistaken for keywords or terminators.
  const stripped = chunk
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"|`[^`]*`/g, " x ");
  const tokens = stripped.match(/[A-Za-z_][A-Za-z0-9_]*|;|[^\sA-Za-z_;]+/g) ?? [];
  let count = 0;
  let depth = 0;
  let sawText = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const up = t.toUpperCase();
    if (up === "BEGIN" || up === "CASE") {
      depth++;
    } else if (up === "END") {
      const next = (tokens[i + 1] ?? "").toUpperCase();
      if (next === "CASE") { depth--; i++; }
      else if (next === "IF" || next === "WHILE" || next === "LOOP" || next === "REPEAT") { i++; }
      else depth--;
    }
    if (t === ";") {
      if (depth <= 0 && sawText) count++;
      if (depth <= 0) sawText = false;
      continue;
    }
    sawText = true;
  }
  if (sawText && depth <= 0) count++; // trailing statement without `;`
  return count;
}

describe("drizzle migrations are runnable by the Drizzle migrator", () => {
  it.each(files)("%s", (file) => {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    expect(sql, "DELIMITER is a mysql-CLI directive; the server rejects it").not.toMatch(/^\s*DELIMITER\b/im);
    // The migrator splits on the marker text wherever it occurs, comments
    // included. drizzle-kit writes it either on its own line or right after
    // the statement's `;`; anything else (e.g. quoting it in a comment) leaves
    // half a comment at the top of the next chunk, which MySQL rejects.
    for (const line of sql.split("\n")) {
      if (!line.includes("statement-breakpoint")) continue;
      const t = line.trim();
      expect(
        t === "--> statement-breakpoint" || t.endsWith(";--> statement-breakpoint"),
        `breakpoint marker may only end a line: ${t.slice(0, 80)}`,
      ).toBe(true);
    }
    for (const chunk of sql.split("--> statement-breakpoint")) {
      expect(
        topLevelStatements(chunk),
        `chunk holds more than one statement; add --> statement-breakpoint:\n${chunk.slice(0, 200)}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe("topLevelStatements", () => {
  it("counts statements on the same line", () => {
    expect(topLevelStatements("SET FOREIGN_KEY_CHECKS = 0; CREATE TABLE t (id int)")).toBe(2);
    expect(topLevelStatements("CREATE TABLE a (id int);CREATE TABLE b (id int);")).toBe(2);
  });

  it("treats a procedure body as one statement", () => {
    const proc = `CREATE PROCEDURE p()
BEGIN
  IF NOT EXISTS (SELECT 1) THEN
    ALTER TABLE t ADD COLUMN c int;
  END IF;
  SET @x = CASE WHEN 1 = 1 THEN 'a' ELSE 'b' END;
END;`;
    expect(topLevelStatements(proc)).toBe(1);
  });

  it("ignores comments and string contents", () => {
    expect(topLevelStatements("-- one; two; three\n")).toBe(0);
    expect(topLevelStatements("INSERT INTO t (v) VALUES ('a; b', \"c; d\");")).toBe(1);
  });
});
