import "dotenv/config";
import mysql from "mysql2/promise";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Dev-only safety guards: this script is built for local bootstrap, not
// production. Refuse to run against a production environment or a non-local
// host unless explicitly forced with --force.
const force = process.argv.includes("--force");
if (!force) {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run with NODE_ENV=production. Pass --force to override.");
    process.exit(1);
  }
  const host = (() => {
    try { return new URL(url.replace(/^mysql:/, "http:")).hostname; }
    catch { return ""; }
  })();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", ""]);
  if (!localHosts.has(host)) {
    console.error(`Refusing to run against non-local host '${host}'. Pass --force to override.`);
    process.exit(1);
  }
}

const conn = await mysql.createConnection({ uri: url, multipleStatements: true });

await conn.query(`CREATE TABLE IF NOT EXISTS __dev_migrations (
  filename varchar(256) PRIMARY KEY,
  applied_at timestamp DEFAULT CURRENT_TIMESTAMP
)`);

const [applied] = await conn.query("SELECT filename FROM __dev_migrations");
const appliedSet = new Set(applied.map((r) => r.filename));

const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();
let ok = 0, skipped = 0, failed = [];

for (const f of files) {
  if (appliedSet.has(f)) { skipped++; continue; }
  const sql = readFileSync(join("drizzle", f), "utf8");
  const cleaned = sql
    .split(/-->\s*statement-breakpoint/i)
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    for (const stmt of cleaned) {
      await conn.query(stmt);
    }
    await conn.query("INSERT INTO __dev_migrations (filename) VALUES (?)", [f]);
    ok++;
    process.stdout.write(`. ${f}\n`);
  } catch (e) {
    failed.push({ file: f, err: e.message });
    process.stdout.write(`X ${f}: ${e.message.slice(0, 120)}\n`);
  }
}

console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed.length}`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  ${f.file}: ${f.err.slice(0, 200)}`);
  process.exitCode = 1;
}
await conn.end();
if (failed.length) process.exit(1);
