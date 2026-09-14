// Functional sweep: calls every wired tRPC procedure in-process as one user,
// with inputs generated from each procedure's zod schema, against a throwaway
// database, and classifies each result. Run it twice: the second pass hits
// rows the first pass created.
//
//   DATABASE_URL=mysql://… JWT_SECRET=… ADMIN_EMAIL=admin@test.local \
//     OUT_DIR=/tmp/sweep pnpm audit:sweep
//
// Optional: ONLY='^(orders|crm)\.' (regex on the path), PER_CALL_MS=8000.
// Buckets: OK, VALIDATION (generator could not satisfy the schema), NOT_FOUND,
// FORBIDDEN, PRECONDITION, FK_MISSING_ROW, DUPLICATE, NEEDS_INTEGRATION, and the
// ones worth reading: SQL_ERROR, SCHEMA_DRIFT, NULL_REQUIRED, DATA_MISMATCH,
// SERVER_ERROR. Never point this at a real database.
import fs from "fs";
import { appRouter } from "../server/routers/index";
import * as db from "../server/db";
import { sql } from "drizzle-orm";

const OUT = process.env.OUT_DIR!;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.local";
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const PER_CALL_MS = Number(process.env.PER_CALL_MS || 15000);

// ---------- zod v4 input generator ----------
function gen(schema: any, depth = 0, path = ""): any {
  if (!schema || depth > 6) return undefined;
  const def = schema._zod?.def ?? schema._def;
  if (!def) return undefined;
  const t: string = def.type ?? def.typeName;
  const key = path.split(".").pop() || "";
  switch (t) {
    case "object": {
      const out: any = {};
      const shape = typeof def.shape === "function" ? def.shape() : def.shape;
      for (const [k, v] of Object.entries<any>(shape)) {
        const val = gen(v, depth + 1, path ? `${path}.${k}` : k);
        if (val !== undefined) out[k] = val;
      }
      return out;
    }
    case "string": {
      const checks = (def.checks || []).map((c: any) => c._zod?.def ?? c.def ?? c);
      const fmt = def.format || checks.find((c: any) => c.format)?.format;
      const min = checks.find((c: any) => c.check === "min_length")?.minimum ?? 0;
      const lk = key.toLowerCase();
      if (fmt === "email" || lk.includes("email")) return "sweep@example.com";
      if (fmt === "url" || lk.endsWith("url") || lk.includes("website")) return "https://example.com";
      if (fmt === "uuid") return "123e4567-e89b-12d3-a456-426614174000";
      if (fmt === "datetime" || lk.endsWith("at") || lk.includes("date")) return new Date().toISOString();
      if (lk.includes("phone")) return "+15555550123";
      if (lk.includes("currency")) return "USD";
      if (lk.includes("color")) return "#3366ff";
      if (lk.includes("password")) return "TestPass123!";
      if (lk === "sku" || lk.endsWith("sku")) return "SKU-SWEEP-1";
      if (lk.includes("json") || lk.includes("payload")) return "{}";
      if (lk.includes("status")) return "active";
      let s = `sweep-${key || "value"}`;
      while (s.length < min) s += "x";
      return s;
    }
    case "number":
    case "int": {
      const checks = (def.checks || []).map((c: any) => c._zod?.def ?? c.def ?? c);
      const gt = checks.find((c: any) => c.check === "greater_than");
      const lk = key.toLowerCase();
      if (lk.endsWith("id") || lk.endsWith("ids")) return 1;
      if (lk.includes("year")) return 2026;
      if (lk.includes("month")) return 1;
      if (lk.includes("day")) return 1;
      if (lk.includes("percent") || lk.includes("rate")) return 10;
      if (gt) return Math.max(1, Number(gt.value) + (gt.inclusive ? 0 : 1));
      return 1;
    }
    case "bigint": return 1n;
    case "boolean": return false;
    case "date": return new Date();
    case "enum": {
      const entries = def.entries ?? def.values;
      const vals = Array.isArray(entries) ? entries : Object.values(entries ?? {});
      return vals[0];
    }
    case "literal": return (def.values ?? [def.value])[0];
    case "array": return [gen(def.element ?? def.type, depth + 1, path)].filter((v) => v !== undefined);
    case "optional":
    case "nullable":
    case "default":
    case "nonoptional":
    case "readonly":
    case "catch":
      return t === "optional" && !/(companyId|id|ids|name|title|type|status)$/i.test(key)
        ? undefined
        : gen(def.innerType, depth, path);
    case "pipe": return gen(def.in, depth, path);
    case "transform":
    case "effects": return gen(def.schema ?? def.innerType, depth, path);
    case "union": return gen(def.options[0], depth, path);
    case "discriminatedUnion": return gen(def.options[0], depth, path);
    case "intersection": return { ...gen(def.left, depth, path), ...gen(def.right, depth, path) };
    case "record": return {};
    case "map": return new Map();
    case "set": return new Set();
    case "tuple": return (def.items || []).map((i: any) => gen(i, depth + 1, path));
    case "lazy": return gen(def.getter(), depth + 1, path);
    case "any":
    case "unknown": return {};
    case "void":
    case "undefined": return undefined;
    case "null": return null;
    default: return undefined;
  }
}

// ---------- walk router ----------
type Proc = { path: string; type: string; input: any };
function walk(router: any, prefix = ""): Proc[] {
  const out: Proc[] = [];
  const def = router._def;
  if (!def) return out;
  const procs = def.procedures || def.record || {};
  for (const [key, val] of Object.entries<any>(procs)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && val._def && (val._def.procedures || val._def.record)) out.push(...walk(val, path));
    else if (val && val._def) {
      const t = val._def.type || (val._def.mutation ? "mutation" : "query");
      out.push({ path, type: t, input: val._def.inputs?.[0] });
    }
  }
  return out;
}

const verbRank = (name: string) => {
  const n = name.toLowerCase();
  if (/^(create|add|upload|import|register|new|generate|start|sync|bulk|seed|record|log|submit|send|invite|clone|duplicate|schedule|run|process|ingest|connect|save)/.test(n)) return 1;
  if (/^(update|edit|set|assign|approve|reject|toggle|mark|move|archive|unarchive|restore|publish|complete|close|reopen|convert|link|unlink|reorder|rename|change|enable|disable|activate|deactivate|pause|resume|reconcile|match|apply|adjust|transfer|receive|ship|fulfill|pick|pack|count|confirm|accept|decline|verify|resolve|escalate|snooze|dismiss|read|unread|pin|star|favorite|tag|untag|merge|split|renumber|recalculate|refresh|retry|rerun|revoke|rotate|regenerate|reset)/.test(n)) return 2;
  if (/^(delete|remove|cancel|clear|purge|destroy|drop|truncate|wipe|forget)/.test(n)) return 3;
  return 2;
};

function classify(err: any): { bucket: string; msg: string } {
  const code = err?.code || err?.cause?.code;
  let sqlMsg: string | undefined; let sqlCode: string | undefined;
  for (let c = err, n = 0; c && n < 6; c = c.cause, n++) { if (c.sqlMessage) { sqlMsg = c.sqlMessage; sqlCode = c.code; break; } }
  const msg = (sqlMsg ? `${sqlCode}: ${sqlMsg}` : String(err?.message || err)).slice(0, 300);
  if (sqlCode === "ER_NO_REFERENCED_ROW_2" || sqlCode === "ER_NO_REFERENCED_ROW") return { bucket: "FK_MISSING_ROW", msg };
  if (sqlCode === "ER_DUP_ENTRY") return { bucket: "DUPLICATE", msg };
  if (sqlCode === "ER_BAD_FIELD_ERROR" || sqlCode === "ER_NO_SUCH_TABLE") return { bucket: "SCHEMA_DRIFT", msg };
  if (sqlCode === "ER_BAD_NULL_ERROR" || sqlCode === "ER_NO_DEFAULT_FOR_FIELD") return { bucket: "NULL_REQUIRED", msg };
  if (sqlCode === "ER_WARN_DATA_TRUNCATED" || sqlCode === "ER_TRUNCATED_WRONG_VALUE" || sqlCode === "ER_DATA_TOO_LONG" || sqlCode === "WARN_DATA_TRUNCATED") return { bucket: "DATA_MISMATCH", msg };
  if (sqlMsg || /Failed query|ER_|sqlState|Unknown column|doesn't exist|Table '.*' doesn't exist/i.test(msg)) return { bucket: "SQL_ERROR", msg: sqlMsg ? `${sqlMsg}` : msg };
  if (code === "BAD_REQUEST" || /invalid_type|expected|Required|Invalid input|Too small|invalid_value|ZodError|✖/i.test(msg)) return { bucket: "VALIDATION", msg };
  if (code === "NOT_FOUND") return { bucket: "NOT_FOUND", msg };
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return { bucket: "FORBIDDEN", msg };
  if (code === "PRECONDITION_FAILED" || code === "CONFLICT") return { bucket: "PRECONDITION", msg };
  if (code === "TIMEOUT" || /timed out/i.test(msg)) return { bucket: "TIMEOUT", msg };
  if (/not configured|API key|credentials|OAuth|not connected|token|SENDGRID|LLM|Anthropic|Shopify|QuickBooks|Google|Twilio|IMAP|S3|R2|storage|fetch failed|ENOTFOUND|ECONNREFUSED|403 Forbidden|CONNECT tunnel|proxy/i.test(msg)) return { bucket: "NEEDS_INTEGRATION", msg };
  if (code === "INTERNAL_SERVER_ERROR" || /TypeError|ReferenceError|Cannot read|is not a function|undefined/i.test(msg)) return { bucket: "SERVER_ERROR", msg };
  return { bucket: "OTHER_ERROR", msg: `${code ?? ""} ${msg}` };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error("timed out"), { code: "TIMEOUT" })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function main() {
  const user = await db.getUserByEmail(ADMIN_EMAIL);
  if (!user) throw new Error(`admin ${ADMIN_EMAIL} not found`);
  const headers: Record<string, string> = { origin: "http://localhost:3000", host: "localhost:3000", "user-agent": "sweep" };
  const req: any = { headers, cookies: {}, ip: "127.0.0.1", protocol: "http", hostname: "localhost", method: "POST", url: "/api/trpc", body: {}, query: {}, params: {}, get: (h: string) => headers[h.toLowerCase()], header: (h: string) => headers[h.toLowerCase()], socket: { remoteAddress: "127.0.0.1" } };
  const res: any = { cookie() {}, clearCookie() {}, setHeader() {}, getHeader() { return undefined; }, status() { return res; }, json() { return res; }, send() { return res; }, end() {}, headersSent: false };
  const ctx = { req, res, user };
  const caller: any = appRouter.createCaller(ctx as any);

  let procs = walk(appRouter);
  if (ONLY) procs = procs.filter((p) => ONLY.test(p.path));
  procs.sort((a, b) => {
    const ra = a.type === "query" ? 0 : verbRank(a.path.split(".").pop()!);
    const rb = b.type === "query" ? 0 : verbRank(b.path.split(".").pop()!);
    return ra - rb || a.path.localeCompare(b.path);
  });

  const results: any[] = [];
  const counts: Record<string, number> = {};
  let i = 0;
  for (const p of procs) {
    i++;
    const input = p.input ? gen(p.input, 0, "") : undefined;
    const fn = p.path.split(".").reduce((o: any, k: string) => o?.[k], caller);
    const started = Date.now();
    let row: any;
    try {
      const out = await withTimeout(Promise.resolve(fn(input)), PER_CALL_MS);
      row = { path: p.path, type: p.type, bucket: "OK", ms: Date.now() - started, input, sample: JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? String(v) : v))?.slice(0, 160) };
    } catch (err: any) {
      const c = classify(err);
      row = { path: p.path, type: p.type, bucket: c.bucket, ms: Date.now() - started, input, error: c.msg, code: err?.code };
    }
    counts[row.bucket] = (counts[row.bucket] || 0) + 1;
    // Pass 1 showed some mutations rewrite the caller's own role/company; keep the sweep running as admin.
    if (p.type === "mutation") { try { const d = await db.getDb(); await d!.execute(sql`UPDATE users SET role='admin', companyId=1 WHERE id=${user.id}`); } catch {} }
    results.push(row);
    if (i % 50 === 0) console.error(`[sweep] ${i}/${procs.length}`, JSON.stringify(counts));
  }
  fs.writeFileSync(`${OUT}/sweep.json`, JSON.stringify({ counts, results }, (_k, v) => (typeof v === "bigint" ? String(v) : v), 2));
  console.error("[sweep] done", JSON.stringify(counts));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
