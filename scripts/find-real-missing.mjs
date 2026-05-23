#!/usr/bin/env node
// Refined gap finder: for each page, identify mutations on its primary
// domain that aren't called anywhere in client/src/pages — not just on
// this page. Anything already wired on a sibling page is filtered out,
// since the user can already reach it.
//
// Outputs a tight per-page list ranked by gap count.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PAGES = join(ROOT, "client/src/pages");

function listTsx(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listTsx(p));
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function buildServerProcMap() {
  const out = new Map();
  const src = readFileSync("/tmp/server-procs.txt", "utf8");
  for (const line of src.split("\n")) {
    if (!line.trim()) continue;
    const [path, type] = line.split("\t");
    if (!path) continue;
    const top = path.split(".")[0];
    if (!out.has(top)) out.set(top, { mutations: new Set() });
    if (type === "mutation") out.get(top).mutations.add(path);
  }
  return out;
}

function extractTrpc(src) {
  const set = new Set();
  // Pattern 1: trpc.foo.bar.useQuery  (standard typed path)
  for (const m of src.matchAll(/trpc(?:\.[a-zA-Z0-9_]+)+\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)/g))
    set.add(m[0].replace("trpc.", "").replace(/\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)$/, ""));
  // Pattern 2: (trpc.foo as any).bar.useQuery  (escape hatch when proc isn't yet on the typed router)
  for (const m of src.matchAll(/\(\s*trpc((?:\.[a-zA-Z0-9_]+)+)\s+as\s+any\s*\)((?:\.[a-zA-Z0-9_]+)+)\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)/g)) {
    const prefix = m[1].replace(/^\./, "");
    const tail = m[2].replace(/^\./, "").replace(/\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)$/, "");
    set.add(`${prefix}.${tail}`);
  }
  return set;
}

function bucket(mutPath) {
  const leaf = mutPath.split(".").pop().toLowerCase();
  if (/^bulk/.test(leaf) || /(many|all)$/.test(leaf)) return "LOW";
  if (/(sync|seed|backfill|recompute|reconcile|upsert|materialize|refresh)/.test(leaf)) return "LOW";
  if (["create", "update", "delete", "remove", "add", "edit"].includes(leaf)) return "HIGH";
  if (/^(create|update|delete|remove|add|edit)[A-Z]/.test(mutPath.split(".").pop())) return "HIGH";
  if (/(approve|reject|cancel|archive|restore|activate|deactivate|enable|disable|publish|unpublish|send|resend|submit|complete|close|reopen|assign|unassign|invite|revoke|share|process|generate|import|export|merge|split|duplicate|clone|convert|fulfill|ship|deliver|pay|refund|void|post|run|start|stop|pause|resume|retry|kick|trigger|attach|detach|tag|untag)/.test(leaf)) return "MED";
  return "LOW";
}

function isReadOnlyByDesign(rel) {
  const r = rel.toLowerCase();
  if (r.includes("public")) return true;
  if (/(generator|reports?)\.tsx$/i.test(rel)) return true;
  if (/dashboard\.tsx$/i.test(rel)) return true;
  if (/hub\.tsx$/i.test(rel)) return true;
  return false;
}

const serverProcs = buildServerProcMap();
const files = listTsx(PAGES).sort();

// First pass: collect every mutation called anywhere in pages/.
const calledAnywhere = new Set();
const perFileCalls = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const calls = extractTrpc(src);
  perFileCalls.set(f, calls);
  for (const c of calls) calledAnywhere.add(c);
}

// Second pass: per-page gap = mutations on primary domain(s) NOT called anywhere.
const results = [];
for (const f of files) {
  const rel = relative(ROOT, f);
  if (isReadOnlyByDesign(rel)) continue;
  const calls = perFileCalls.get(f);
  if (!calls || calls.size === 0) continue;
  const src = readFileSync(f, "utf8");
  if (src.length < 200 || !/return\s*[(<]/.test(src)) continue;

  const domainCounts = new Map();
  for (const c of calls) {
    const top = c.split(".")[0];
    domainCounts.set(top, (domainCounts.get(top) || 0) + 1);
  }
  const ranked = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = ranked[0][1];
  const primary = ranked.filter((r) => r[1] >= Math.max(2, maxCount / 2)).slice(0, 3).map((r) => r[0]);

  const buckets = { HIGH: [], MED: [] };
  for (const dom of primary) {
    const info = serverProcs.get(dom);
    if (!info) continue;
    for (const mut of info.mutations) {
      // Real gap = not called by ANY page (not just this one).
      if (calledAnywhere.has(mut)) continue;
      const b = bucket(mut);
      if (b === "HIGH" || b === "MED") buckets[b].push(mut);
    }
  }
  buckets.HIGH.sort(); buckets.MED.sort();
  if (buckets.HIGH.length === 0 && buckets.MED.length === 0) continue;
  results.push({ rel, primary, buckets });
}

results.sort((a, b) =>
  b.buckets.HIGH.length - a.buckets.HIGH.length ||
  b.buckets.MED.length - a.buckets.MED.length
);

// Emit
const out = [];
out.push("# Real missing UI features (cross-page filtered)");
out.push("");
out.push("Stricter pass than `UI_MISSING_FEATURES.md`: a mutation is only listed here if **no page anywhere in `client/src/pages/` calls it**. This eliminates the most common false positive — gap mutations that already live on a sibling page (e.g. `customers.update` was flagged on `Customers.tsx`'s list view but is actually wired on `CustomerDetail.tsx`).");
out.push("");
out.push("Buckets unchanged from the parent doc:");
out.push("- **HIGH** — bare CRUD verbs on the page's primary domain.");
out.push("- **MED** — lifecycle / state transitions.");
out.push("");
out.push(`Pages with one or more truly-missing mutations: **${results.length}**.`);
out.push("");
out.push("## Top 20");
out.push("");
out.push("| # | Page | HIGH | MED |");
out.push("|---|------|------|-----|");
results.slice(0, 20).forEach((r, i) => {
  out.push(`| ${i + 1} | \`${r.rel}\` | ${r.buckets.HIGH.length} | ${r.buckets.MED.length} |`);
});
out.push("");

for (const r of results) {
  out.push(`### \`${r.rel}\``);
  out.push(`- **Primary domain(s)**: ${r.primary.map((d) => `\`${d}\``).join(", ")}`);
  if (r.buckets.HIGH.length) {
    out.push(`- **HIGH (${r.buckets.HIGH.length})** — not wired anywhere:`);
    for (const m of r.buckets.HIGH) out.push(`  - \`${m}\``);
  }
  if (r.buckets.MED.length) {
    out.push(`- **MED (${r.buckets.MED.length})** — not wired anywhere:`);
    for (const m of r.buckets.MED) out.push(`  - \`${m}\``);
  }
  out.push("");
}

writeFileSync("/tmp/real-missing.md", out.join("\n"));
console.error(`Wrote /tmp/real-missing.md — ${results.length} pages with truly-missing mutations`);
