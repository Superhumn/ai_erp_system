#!/usr/bin/env node
// Curate the raw gap list from docs/UI_INVENTORY.md into a prioritized,
// actionable punch list of likely-missing UI features.
//
// Strategy: re-run the extraction logic (so we have structured data, not
// markdown) and apply heuristics:
//   - Skip pages that are public/read-only by intent.
//   - For each remaining page, score each uncovered mutation:
//       HIGH    standard CRUD verb missing on a primary entity
//               (create/update/delete) and the page's name suggests it
//               owns that entity.
//       MED     state-transition or lifecycle verbs (approve/reject/
//               archive/activate/cancel/restore/send/publish/...).
//       LOW     bulk-X, sync, internal helpers, upserts.
//   - Group output by sidebar section, then by page, with HIGH-only at top
//     of each page entry and a collapsed MED list below.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PAGES = join(ROOT, "client/src/pages");
const APP = join(ROOT, "client/src/App.tsx");
const LAYOUT = join(ROOT, "client/src/components/DashboardLayout.tsx");

function listTsx(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listTsx(p));
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function buildRouteMap() {
  const src = readFileSync(APP, "utf8");
  const stemToImport = new Map();
  for (const m of src.matchAll(/^import\s+(\w+)\s+from\s+["']([^"']+)["']/gm))
    if (m[2].includes("/pages/")) stemToImport.set(m[1], m[2]);
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(["']([^"']+)["']\)\)/g))
    if (m[2].includes("/pages/")) stemToImport.set(m[1], m[2]);
  const compToPaths = new Map();
  for (const m of src.matchAll(/<Route\s+path=["']([^"']+)["']\s+component=\{(\w+)\}/g)) {
    const arr = compToPaths.get(m[2]) || [];
    arr.push(m[1]); compToPaths.set(m[2], arr);
  }
  const fileToRoutes = new Map();
  for (const [comp, importPath] of stemToImport) {
    let resolved = importPath;
    if (resolved.startsWith("@/pages/")) resolved = "client/src/" + resolved.slice(2);
    else if (resolved.startsWith("./pages/")) resolved = "client/src" + resolved.slice(1);
    else if (resolved.includes("/pages/")) resolved = "client/src" + resolved.slice(resolved.indexOf("/pages/"));
    fileToRoutes.set(resolved + ".tsx", compToPaths.get(comp) || []);
  }
  return fileToRoutes;
}

function buildSidebarMap() {
  const src = readFileSync(LAYOUT, "utf8");
  const out = new Map();
  const labelRe = /label:\s*["']([^"']+)["']/g;
  const positions = [];
  let m;
  while ((m = labelRe.exec(src)) !== null) {
    const after = src.slice(m.index + m[0].length).replace(/^[\s,]+/, "");
    if (after.startsWith("items:")) positions.push({ label: m[1], idx: m.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const slice = src.slice(positions[i].idx, i + 1 < positions.length ? positions[i + 1].idx : src.length);
    for (const p of slice.matchAll(/path:\s*["']([^"']+)["']/g))
      if (!out.has(p[1])) out.set(p[1], positions[i].label);
  }
  return out;
}

function buildServerProcMap() {
  const out = new Map();
  let src;
  try { src = readFileSync("/tmp/server-procs.txt", "utf8"); } catch { return out; }
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
  for (const m of src.matchAll(/trpc(?:\.[a-zA-Z0-9_]+)+\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)/g))
    set.add(m[0].replace("trpc.", "").replace(/\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)$/, ""));
  return set;
}

// Heuristics: skip pages that are read-only by design.
function isReadOnlyByDesign(rel, compHint) {
  const r = rel.toLowerCase();
  // Public-facing data room: external investors only see read views.
  if (r.includes("public")) return "public read-only view";
  // Generator/Reports pages render PDFs / aggregated views; writes belong elsewhere.
  if (/(generator|reports?)\.tsx$/i.test(rel)) return "report/generator view";
  // Dashboard pages aggregate KPIs; CTAs live on the linked feature pages.
  if (/dashboard\.tsx$/i.test(rel)) return "aggregate dashboard";
  // Top-level hubs route to sub-features; they don't own writes themselves.
  if (/hub\.tsx$/i.test(rel)) return "navigation hub";
  return null;
}

// Bucket a mutation path by likely UX importance.
//  HIGH = obvious user-facing CRUD verb
//  MED  = lifecycle / state transition
//  LOW  = bulk, sync, internal
function bucket(mutPath) {
  const leaf = mutPath.split(".").pop().toLowerCase();
  // LOW first (so they short-circuit MED matches like "bulkApprove")
  if (/^bulk/.test(leaf) || /(many|all)$/.test(leaf)) return "LOW";
  if (/(sync|seed|backfill|recompute|reconcile|upsert|materialize|refresh)/.test(leaf)) return "LOW";
  if (/(setdefault|reorder|markseen|markread|touch|ping|heartbeat)/.test(leaf)) return "LOW";
  // HIGH: classic CRUD
  if (["create", "update", "delete", "remove", "add", "edit"].includes(leaf)) return "HIGH";
  if (/^(create|update|delete|remove|add|edit)[A-Z]/.test(mutPath.split(".").pop())) return "HIGH";
  // MED: lifecycle
  if (/(approve|reject|cancel|archive|restore|activate|deactivate|enable|disable|publish|unpublish|send|resend|submit|complete|close|reopen|assign|unassign|invite|revoke|share|process|generate|import|export|merge|split|duplicate|clone|convert|fulfill|ship|deliver|pay|refund|void|post|run|start|stop|pause|resume|retry|kick|trigger|attach|detach|tag|untag)/.test(leaf)) return "MED";
  // Anything else = LOW (probably a helper)
  return "LOW";
}

// Map mutation leaf to a plausible button label.
function buttonLabelFor(mutPath, primaryDomains) {
  const parts = mutPath.split(".");
  const leaf = parts[parts.length - 1];
  const subjectParts = parts.slice(0, -1);
  // Try to make "noun" from path. Trim shared prefix with primary domain.
  let subject = subjectParts[subjectParts.length - 1] || subjectParts[0];
  if (primaryDomains.includes(subject) && subjectParts.length > 1) {
    subject = subjectParts[subjectParts.length - 1];
  }
  // Humanize
  const verb = leaf.replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/([A-Z])/g, " $1").trim();
  const noun = subject.replace(/([A-Z])/g, " $1").trim();
  return `${verb} ${noun}`.replace(/\s+/g, " ").trim();
}

// --- Main ------------------------------------------------------------------
const fileToRoutes = buildRouteMap();
const hrefToSection = buildSidebarMap();
const serverProcs = buildServerProcMap();
const files = listTsx(PAGES).sort();

const bySection = new Map();
const stats = { totalPages: 0, skippedReadonly: 0, examined: 0, withHigh: 0, withMed: 0, totalHigh: 0, totalMed: 0 };

for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (src.length < 200) continue;
  if (!/return\s*[(<]/.test(src)) continue;
  stats.totalPages++;

  const rel = relative(ROOT, f);
  const routes = fileToRoutes.get(rel) || [];
  let section = "Not in sidebar";
  for (const r of routes) {
    if (hrefToSection.has(r)) { section = hrefToSection.get(r); break; }
    for (const [href, sec] of hrefToSection) {
      if (r === href || r.startsWith(href + "/")) { section = sec; break; }
    }
    if (section !== "Not in sidebar") break;
  }
  if (routes.length === 0) section = "Not routed";

  const skip = isReadOnlyByDesign(rel);
  if (skip) { stats.skippedReadonly++; continue; }

  const calls = extractTrpc(src);
  if (calls.size === 0) continue;
  stats.examined++;

  const domainCounts = new Map();
  for (const c of calls) {
    const top = c.split(".")[0];
    domainCounts.set(top, (domainCounts.get(top) || 0) + 1);
  }
  const ranked = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = ranked[0][1];
  const primary = ranked.filter((r) => r[1] >= Math.max(2, maxCount / 2)).slice(0, 3).map((r) => r[0]);

  const buckets = { HIGH: [], MED: [], LOW: [] };
  for (const dom of primary) {
    const info = serverProcs.get(dom);
    if (!info) continue;
    for (const mut of info.mutations) {
      if (calls.has(mut)) continue;
      const b = bucket(mut);
      buckets[b].push(mut);
    }
  }
  for (const k of ["HIGH", "MED", "LOW"]) buckets[k].sort();

  if (buckets.HIGH.length === 0 && buckets.MED.length === 0) continue;
  if (buckets.HIGH.length) stats.withHigh++;
  if (buckets.MED.length) stats.withMed++;
  stats.totalHigh += buckets.HIGH.length;
  stats.totalMed += buckets.MED.length;

  const arr = bySection.get(section) || [];
  arr.push({ rel, routes, primary, buckets });
  bySection.set(section, arr);
}

// Emit markdown
const SECTION_ORDER = ["Command Center", "Sales", "Finance", "Operations", "People", "Tools", "Not in sidebar", "Not routed"];
const sections = [...SECTION_ORDER, ...[...bySection.keys()].filter((s) => !SECTION_ORDER.includes(s)).sort()];

const out = [];
out.push("# Missing UI Features — curated punch list");
out.push("");
out.push("Distilled from `docs/UI_INVENTORY.md` by `scripts/curate-missing-features.mjs`.");
out.push("");
out.push("## What this is");
out.push("");
out.push("For every page in `client/src/pages/`, this lists tRPC mutations that exist on the server, fall under the page's primary domain, and aren't currently called from the page. Each missing mutation is bucketed:");
out.push("");
out.push("- **HIGH** — bare CRUD verbs on the page's primary entity (`create`, `update`, `delete`, `add`, `remove`, `edit`). If you can list/view it, you usually should be able to write/edit/delete it.");
out.push("- **MED** — lifecycle / state-transition verbs (approve, archive, cancel, send, publish, assign, share, export, merge, duplicate, restore, …). Often real gaps but sometimes correctly absent.");
out.push("- **LOW** — bulk/sync/upsert helpers and internals. Suppressed from this report; check `docs/UI_INVENTORY.md` if you want the full list.");
out.push("");
out.push("## What was filtered out");
out.push("");
out.push(`Pages skipped as read-only by design (public views, generators, aggregate dashboards, navigation hubs): **${stats.skippedReadonly}**. Examined: **${stats.examined}**. With HIGH-priority gaps: **${stats.withHigh}**. With MED-priority gaps: **${stats.withMed}**.`);
out.push("");
out.push("## Caveats (do read these)");
out.push("");
out.push("- A mutation listed here may already be reachable via a sibling page (e.g. `customers.update` lives on `CustomerDetail.tsx`, not `Customers.tsx`). Cross-reference before opening a ticket.");
out.push("- A mutation marked HIGH may be intentionally absent for permission reasons (e.g. employees shouldn't self-delete).");
out.push("- The button label suggestions are mechanical: \"Verb Noun\" derived from the mutation path. Tighten before shipping.");
out.push("");

// Top-30 page priority table
const flat = [];
for (const [sec, pages] of bySection) for (const p of pages) flat.push({ sec, ...p });
flat.sort((a, b) => b.buckets.HIGH.length - a.buckets.HIGH.length || b.buckets.MED.length - a.buckets.MED.length);
out.push("## Top 30 pages by HIGH-priority gap count");
out.push("");
out.push("| # | Page | Section | HIGH | MED |");
out.push("|---|------|---------|------|-----|");
flat.slice(0, 30).forEach((p, i) => {
  out.push(`| ${i + 1} | \`${p.rel}\` | ${p.sec} | ${p.buckets.HIGH.length} | ${p.buckets.MED.length} |`);
});
out.push("");

for (const section of sections) {
  const pages = bySection.get(section);
  if (!pages || pages.length === 0) continue;
  out.push(`## ${section}`);
  out.push("");
  pages.sort((a, b) => (b.buckets.HIGH.length + b.buckets.MED.length) - (a.buckets.HIGH.length + a.buckets.MED.length) || a.rel.localeCompare(b.rel));
  for (const p of pages) {
    out.push(`### \`${p.rel}\``);
    out.push(`- **Route(s)**: ${p.routes.length ? p.routes.map((r) => `\`${r}\``).join(", ") : "_not routed_"}`);
    out.push(`- **Primary domain(s)**: ${p.primary.map((d) => `\`${d}\``).join(", ")}`);
    if (p.buckets.HIGH.length) {
      out.push(`- **HIGH (${p.buckets.HIGH.length})** — likely missing CRUD buttons:`);
      for (const mut of p.buckets.HIGH) {
        out.push(`  - \`${mut}\` → suggested button: **${buttonLabelFor(mut, p.primary)}**`);
      }
    }
    if (p.buckets.MED.length) {
      out.push(`- **MED (${p.buckets.MED.length})** — likely missing lifecycle actions:`);
      for (const mut of p.buckets.MED) {
        out.push(`  - \`${mut}\` → suggested button: **${buttonLabelFor(mut, p.primary)}**`);
      }
    }
    out.push("");
  }
}

out.push("---");
out.push("");
out.push("## Totals");
out.push(`- Pages with HIGH gaps: **${stats.withHigh}**`);
out.push(`- Pages with MED gaps: **${stats.withMed}**`);
out.push(`- Total HIGH suggestions: **${stats.totalHigh}**`);
out.push(`- Total MED suggestions: **${stats.totalMed}**`);

writeFileSync("docs/UI_MISSING_FEATURES.md", out.join("\n"));
console.error(`Wrote docs/UI_MISSING_FEATURES.md — examined ${stats.examined} pages, ${stats.withHigh} with HIGH gaps, ${stats.totalHigh} HIGH + ${stats.totalMed} MED suggestions`);
