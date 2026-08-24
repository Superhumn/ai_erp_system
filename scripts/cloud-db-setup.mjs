/**
 * Cloud Agent database schema setup.
 *
 * The drizzle/ migration files are an incomplete history — schema.ts defines
 * ~288 tables but the migrations only create ~188, and several tables (e.g.
 * crm_contacts) are never created by any migration. So a fresh database can't
 * be built from the migration files; drizzle/schema.ts is the real source of
 * truth. `drizzle-kit push` builds from schema.ts, but aborts because six
 * auto-generated foreign-key identifiers exceed MySQL's 64-char limit.
 *
 * This script generates the full DDL from schema.ts (`drizzle-kit export`) and
 * applies it statement-by-statement so those six non-essential FK constraints
 * can be skipped without aborting the whole schema. Referential integrity is
 * enforced in application code, so the skipped DB-level FKs don't affect the
 * running app.
 *
 * Idempotent: CREATE TABLE is rewritten to CREATE TABLE IF NOT EXISTS, and
 * duplicate/already-exists errors on re-runs are ignored.
 */
import { execFileSync } from "node:child_process";
import "dotenv/config";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[db-setup] DATABASE_URL is not set");
  process.exit(1);
}

// Errors that are safe to ignore (already-applied state or the known
// over-long FK identifiers that MySQL rejects).
const IGNORABLE = new Set([
  "ER_TABLE_EXISTS_ERROR", // 1050 table already exists
  "ER_DUP_KEYNAME", // 1061 duplicate index/constraint
  "ER_DUP_FIELDNAME", // 1060 duplicate column
  "ER_FK_DUP_NAME", // duplicate foreign key
  "ER_TOO_LONG_IDENT", // 1059 identifier > 64 chars (6 known long FK names)
  "ER_CANT_CREATE_TABLE", // FK-related create issues (retried table already there)
]);

console.log("[db-setup] Generating DDL from drizzle/schema.ts ...");
const raw = execFileSync(
  "pnpm",
  ["exec", "drizzle-kit", "export", "--sql"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

// Strip the non-SQL header lines drizzle-kit prints before the DDL.
const firstCreate = raw.indexOf("CREATE TABLE");
const ddl = firstCreate >= 0 ? raw.slice(firstCreate) : raw;

const statements = ddl
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"))
  .map((s) => s.replace(/^CREATE TABLE\s+`/, "CREATE TABLE IF NOT EXISTS `"));

const conn = await mysql.createConnection(url);
let ok = 0;
let skipped = 0;
const skippedDetail = [];
try {
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
      ok++;
    } catch (e) {
      if (IGNORABLE.has(e.code)) {
        skipped++;
        const label = /ADD CONSTRAINT `([^`]+)`/.exec(stmt)?.[1] || stmt.slice(0, 60);
        skippedDetail.push(`${e.code}: ${label}`);
      } else {
        console.error("[db-setup] Failed statement:", stmt.slice(0, 200));
        throw e;
      }
    }
  }
  console.log(`[db-setup] Applied ${ok} statements, skipped ${skipped}.`);
  if (skippedDetail.length) {
    console.log("[db-setup] Skipped (safe):");
    for (const d of skippedDetail) console.log("  - " + d);
  }
} finally {
  await conn.end();
}
