#!/usr/bin/env node
// Extract a per-page inventory of buttons, dialog triggers, menu items,
// nav links, and tRPC calls from client/src/pages/. Pure regex — fast,
// deterministic, no token cap.

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

// --- Route map from App.tsx -------------------------------------------------
function buildRouteMap() {
  const src = readFileSync(APP, "utf8");
  const importRe = /^import\s+(\w+)\s+from\s+["']([^"']+)["']/gm;
  const stemToImport = new Map();
  let m;
  while ((m = importRe.exec(src)) !== null) {
    if (m[2].startsWith("./pages/") || m[2].includes("/pages/")) {
      stemToImport.set(m[1], m[2]);
    }
  }
  const lazyRe = /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(["']([^"']+)["']\)\)/g;
  while ((m = lazyRe.exec(src)) !== null) {
    if (m[2].includes("/pages/")) stemToImport.set(m[1], m[2]);
  }
  // path → component name
  const routeRe = /<Route\s+path=["']([^"']+)["']\s+component=\{(\w+)\}/g;
  const compToPaths = new Map();
  while ((m = routeRe.exec(src)) !== null) {
    const arr = compToPaths.get(m[2]) || [];
    arr.push(m[1]);
    compToPaths.set(m[2], arr);
  }
  // Also handle element-style routes: <Route path="..."><X /></Route>
  const altRe = /<Route\s+path=["']([^"']+)["']>\s*<(\w+)\s*\/>\s*<\/Route>/g;
  while ((m = altRe.exec(src)) !== null) {
    const arr = compToPaths.get(m[2]) || [];
    arr.push(m[1]);
    compToPaths.set(m[2], arr);
  }
  // file path → routes
  const fileToRoutes = new Map();
  for (const [comp, importPath] of stemToImport) {
    const routes = compToPaths.get(comp) || [];
    // Resolve relative import to an absolute path
    let resolved = importPath;
    if (resolved.startsWith("@/pages/")) resolved = "client/src/" + resolved.slice(2);
    else if (resolved.startsWith("./pages/")) resolved = "client/src" + resolved.slice(1);
    else if (resolved.includes("/pages/")) resolved = "client/src" + resolved.slice(resolved.indexOf("/pages/"));
    fileToRoutes.set(resolved + ".tsx", routes);
  }
  return fileToRoutes;
}

// --- Sidebar section map from DashboardLayout.tsx --------------------------
function buildSidebarMap() {
  const src = readFileSync(LAYOUT, "utf8");
  // Pattern: groups.push({ label: "Section", items: [ { ..., path: "/..." }, ... ] })
  const out = new Map(); // path → section label
  // Find each `label: "Section"` followed by an items array.
  const labelRe = /label:\s*["']([^"']+)["']/g;
  const positions = [];
  let m;
  while ((m = labelRe.exec(src)) !== null) {
    // Only treat as a section if next non-whitespace is an `items:` array start.
    const after = src.slice(m.index + m[0].length).replace(/^[\s,]+/, "");
    if (after.startsWith("items:")) positions.push({ label: m[1], idx: m.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const slice = src.slice(positions[i].idx, i + 1 < positions.length ? positions[i + 1].idx : src.length);
    const pathRe = /path:\s*["']([^"']+)["']/g;
    let p;
    while ((p = pathRe.exec(slice)) !== null) {
      if (!out.has(p[1])) out.set(p[1], positions[i].label);
    }
  }
  return out;
}

// --- Per-page extraction ---------------------------------------------------
function extract(file, src) {
  // Strip block comments to reduce noise
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "");

  // Component name = default export OR `export default function X` OR `export default X`
  const compName = (() => {
    let m = /export\s+default\s+function\s+(\w+)/.exec(clean);
    if (m) return m[1];
    m = /function\s+(\w+)\s*\([^)]*\)[\s\S]*?export\s+default\s+\1/.exec(clean);
    if (m) return m[1];
    m = /export\s+default\s+(\w+)/.exec(clean);
    if (m) return m[1];
    return "(anonymous)";
  })();

  // Roles: useUser() role checks
  const roleHits = new Set();
  for (const r of clean.matchAll(/role\s*[=!]==\s*["'](\w+)["']/g)) roleHits.add(r[1]);
  for (const r of clean.matchAll(/\.includes\(["'](\w+)["']\)/g)) {
    if (["admin", "ops", "finance", "sales", "exec", "legal", "hr", "investor", "vendor", "copacker", "contractor"].includes(r[1])) {
      roleHits.add(r[1]);
    }
  }

  // tRPC calls
  const trpcCalls = new Set();
  for (const m of clean.matchAll(/trpc(?:\.[a-zA-Z0-9_]+)+\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)/g)) {
    trpcCalls.add(m[0].replace("trpc.", ""));
  }

  // Buttons: <Button ...> ... </Button> or self-closing. Capture label and nearby onClick/asChild context.
  const buttons = [];
  const btnRe = /<Button\b([^>]*)>([\s\S]*?)<\/Button>|<Button\b([^/>]*)\/>/g;
  let m;
  while ((m = btnRe.exec(clean)) !== null) {
    const attrs = (m[1] || m[3] || "").trim();
    const inner = (m[2] || "").trim();
    // Extract a label: visible text or aria-label
    let label = "";
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();
    if (text) label = text;
    else {
      const aria = /aria-label=["']([^"']+)["']/.exec(attrs);
      if (aria) label = aria[1];
    }
    if (!label) {
      // Icon-only: find Icon component name
      const icon = /<(\w+)\b[^/]*\/>/.exec(inner);
      if (icon) label = `(icon: ${icon[1]})`;
      else label = "(no label)";
    }
    const hasOnClick = /\bonClick\s*=/.test(attrs);
    const disabled = /\bdisabled\b/.test(attrs);
    const variant = /\bvariant=["'](\w+)["']/.exec(attrs)?.[1];
    buttons.push({ label, hasOnClick, disabled, variant, line: src.slice(0, m.index).split("\n").length });
  }

  // DialogTrigger asChild — typically wraps a Button
  const dialogTriggers = [];
  for (const dt of clean.matchAll(/<DialogTrigger\s+asChild\s*>\s*<Button\b[^>]*>([\s\S]*?)<\/Button>/g)) {
    const text = dt[1].replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();
    dialogTriggers.push(text || "(no label)");
  }

  // DropdownMenuItem / ContextMenuItem / CommandItem entries
  const menuItems = [];
  const menuRe = /<(?:DropdownMenuItem|ContextMenuItem|CommandItem)\b[^>]*>([\s\S]*?)<\/(?:DropdownMenuItem|ContextMenuItem|CommandItem)>/g;
  while ((m = menuRe.exec(clean)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();
    if (text) menuItems.push(text);
  }

  // Nav links: <Link href="...">label</Link> and setLocation("...")
  const navLinks = [];
  for (const ln of clean.matchAll(/<Link\s+(?:[^>]*?\s)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/Link>/g)) {
    const text = ln[2].replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();
    navLinks.push({ target: ln[1], label: text || "(no label)" });
  }
  // setLocation("/path") with literal string
  for (const sl of clean.matchAll(/setLocation\(["']([^"']+)["']\)/g)) {
    navLinks.push({ target: sl[1], label: "(programmatic)" });
  }

  // Form submits: <form onSubmit={X}> — count and capture nearby submit button text
  const formSubmits = [...clean.matchAll(/<form\b[^>]*onSubmit\s*=/g)].length;

  return { compName, roleHits: [...roleHits], trpcCalls: [...trpcCalls], buttons, dialogTriggers, menuItems, navLinks, formSubmits };
}

// --- Server procedure map (for gap analysis) -------------------------------
function buildServerProcMap() {
  // Reads /tmp/server-procs.txt (path<TAB>type) produced by dump-trpc-paths.ts
  // Returns: top-level-namespace -> { queries: Set, mutations: Set, all: Set }
  const out = new Map();
  let src;
  try { src = readFileSync("/tmp/server-procs.txt", "utf8"); }
  catch { return out; }
  for (const line of src.split("\n")) {
    if (!line.trim()) continue;
    const [path, type] = line.split("\t");
    if (!path) continue;
    const top = path.split(".")[0];
    if (!out.has(top)) out.set(top, { queries: new Set(), mutations: new Set(), all: new Set() });
    const entry = out.get(top);
    entry.all.add(path);
    if (type === "mutation") entry.mutations.add(path);
    else if (type === "query") entry.queries.add(path);
  }
  return out;
}

// --- Main ------------------------------------------------------------------
const fileToRoutes = buildRouteMap();
const hrefToSection = buildSidebarMap();
const serverProcs = buildServerProcMap();
const files = listTsx(PAGES).sort();

const bySection = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // Skip files that don't look like full pages (no JSX return, very small)
  if (src.length < 200) continue;
  if (!/return\s*\(/.test(src) && !/return\s*</.test(src)) continue;

  const rel = relative(ROOT, f);
  const routes = fileToRoutes.get(rel) || [];
  const data = extract(f, src);

  // Determine sidebar section by matching routes to hrefToSection
  let section = "Not in sidebar";
  for (const r of routes) {
    if (hrefToSection.has(r)) { section = hrefToSection.get(r); break; }
    // Prefix match (e.g. /orders/123 matches /orders)
    for (const [href, sec] of hrefToSection) {
      if (r === href || r.startsWith(href + "/")) { section = sec; break; }
    }
    if (section !== "Not in sidebar") break;
  }
  if (routes.length === 0) section = "Not routed";

  const arr = bySection.get(section) || [];
  arr.push({ rel, routes, ...data });
  bySection.set(section, arr);
}

// Emit markdown
const SECTION_ORDER = ["Command Center", "Sales", "Finance", "Operations", "People", "Tools", "Not in sidebar", "Not routed"];
const known = new Set(SECTION_ORDER);
const sections = [...SECTION_ORDER, ...[...bySection.keys()].filter((s) => !known.has(s)).sort()];

let totalPages = 0, totalButtons = 0, totalDialogs = 0, totalMenuItems = 0, totalLinks = 0, totalSubmits = 0, totalTrpc = 0;
const gapRanking = []; // { rel, count } for top-N summary

const out = [];
out.push("# UI Inventory");
out.push("");
out.push("Per-page map of current buttons, links, tRPC calls, and gap-analysis of mutations the page could plausibly expose but doesn't.");
out.push("");
out.push("Auto-generated by `scripts/extract-ui-inventory.mjs`. Re-run after UI changes.");
out.push("");
out.push("## How to read this");
out.push("");
out.push("For every page under `client/src/pages/`, this document lists:");
out.push("- **Component**, **Route(s)**, **Sidebar section** (from `client/src/App.tsx` + `DashboardLayout.tsx` per CLAUDE.md's canonical structure).");
out.push("- **tRPC calls** — every `trpc.X.Y.useQuery/useMutation/...` invoked from the page.");
out.push("- **Buttons** — every `<Button>` with label, line number, and flags: `no onClick` (no inline handler — likely fine if wrapped by DialogTrigger), `disabled-attr` (renders disabled in some state), variant.");
out.push("- **Dialog triggers / Menu items / Nav links / Form submits** — other action surfaces.");
out.push("- **Primary domain(s)** — the most-frequent tRPC top-level namespace(s) on the page.");
out.push("- **Mutations available but NOT called from this page** — candidate missing buttons.");
out.push("");
out.push("### Honest caveats");
out.push("");
out.push("- The gap analysis is a **signal, not a directive**. Many \"missing\" mutations are by-design absent — e.g. a public read-only page shouldn't expose `*.update` / `*.delete`. Use the list as a starting checklist, not a backlog.");
out.push("- The button-label regex is naive: when a button's contents include `{expr}` interpolations, the label captured may include surrounding code fragments. Treat labels as identifiers, not pixel-perfect text.");
out.push("- A page that calls `customers.create` but not `customers.update` may be intentional if updates happen on a sibling detail page. Cross-reference with related pages (e.g. `Customers.tsx` and `CustomerDetail.tsx`) before concluding a gap.");
out.push("");

for (const section of sections) {
  const pages = bySection.get(section);
  if (!pages || pages.length === 0) continue;
  out.push(`## ${section}`);
  out.push("");
  for (const p of pages.sort((a, b) => a.rel.localeCompare(b.rel))) {
    totalPages++;
    totalButtons += p.buttons.length;
    totalDialogs += p.dialogTriggers.length;
    totalMenuItems += p.menuItems.length;
    totalLinks += p.navLinks.length;
    totalSubmits += p.formSubmits;
    totalTrpc += p.trpcCalls.length;

    out.push(`### \`${p.rel}\``);
    out.push(`- **Component**: \`${p.compName}\``);
    out.push(`- **Route(s)**: ${p.routes.length ? p.routes.map((r) => `\`${r}\``).join(", ") : "(not routed)"}`);
    if (p.roleHits.length) out.push(`- **Role refs in code**: ${p.roleHits.join(", ")}`);
    out.push(`- **tRPC calls (${p.trpcCalls.length})**: ${p.trpcCalls.length ? p.trpcCalls.sort().map((c) => `\`${c}\``).join(", ") : "_none_"}`);
    if (p.buttons.length) {
      out.push(`- **Buttons (${p.buttons.length})**:`);
      for (const b of p.buttons) {
        const flags = [];
        if (!b.hasOnClick) flags.push("no onClick");
        if (b.disabled) flags.push("disabled-attr");
        if (b.variant) flags.push(`variant=${b.variant}`);
        out.push(`  - L${b.line}: \`${b.label}\`${flags.length ? "  _(" + flags.join(", ") + ")_" : ""}`);
      }
    }
    if (p.dialogTriggers.length) {
      out.push(`- **Dialog triggers (${p.dialogTriggers.length})**: ${p.dialogTriggers.map((d) => `\`${d}\``).join(", ")}`);
    }
    if (p.menuItems.length) {
      out.push(`- **Menu items (${p.menuItems.length})**: ${p.menuItems.map((d) => `\`${d}\``).join(", ")}`);
    }
    if (p.navLinks.length) {
      out.push(`- **Nav links (${p.navLinks.length})**: ${p.navLinks.map((l) => `${l.target} → \`${l.label}\``).join("; ")}`);
    }
    if (p.formSubmits) out.push(`- **Form submits**: ${p.formSubmits}`);

    // --- Gap analysis: what mutations on this page's domain(s) aren't being called?
    if (p.trpcCalls.length > 0 && serverProcs.size > 0) {
      // Identify primary domains by top-level namespace frequency.
      const domainCounts = new Map();
      for (const call of p.trpcCalls) {
        const top = call.split(".")[0];
        domainCounts.set(top, (domainCounts.get(top) || 0) + 1);
      }
      const ranked = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]);
      const max = ranked[0][1];
      // "Primary domains" = those whose call count is at least half of max, capped at 3.
      const primary = ranked.filter((r) => r[1] >= Math.max(2, max / 2)).slice(0, 3).map((r) => r[0]);

      const calledPaths = new Set();
      for (const c of p.trpcCalls) {
        calledPaths.add(c.replace(/\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|query|mutate)$/, ""));
      }

      const missing = [];
      for (const dom of primary) {
        const info = serverProcs.get(dom);
        if (!info) continue;
        for (const mut of [...info.mutations].sort()) {
          if (!calledPaths.has(mut)) missing.push(mut);
        }
      }

      out.push(`- **Primary domain(s)**: ${primary.map((d) => `\`${d}\``).join(", ")}`);
      if (missing.length) gapRanking.push({ rel: p.rel, count: missing.length, primary });
      if (missing.length) {
        out.push(`- **Mutations available but NOT called from this page (${missing.length})** — candidates for missing buttons:`);
        for (const m of missing.slice(0, 40)) {
          out.push(`  - \`${m}\``);
        }
        if (missing.length > 40) out.push(`  - … and ${missing.length - 40} more`);
      } else {
        out.push(`- **Mutations available but NOT called**: _none — page covers its domain's write surface_`);
      }
    }

    out.push("");
  }
}

// Build top-20 gap table now that we've collected gapRanking
const topGaps = [...gapRanking].sort((a, b) => b.count - a.count).slice(0, 20);
const topTable = [];
topTable.push("## Top 20 pages with the largest gap-signal");
topTable.push("");
topTable.push("Pages whose primary domain(s) expose mutations they don't call. Read with the caveats above — read-only pages will appear here even when the design is correct.");
topTable.push("");
topTable.push("| # | Page | Primary domain(s) | Mutations not called |");
topTable.push("|---|------|-------------------|----------------------|");
topGaps.forEach((g, i) => {
  topTable.push(`| ${i + 1} | \`${g.rel}\` | ${g.primary.map((d) => `\`${d}\``).join(", ")} | **${g.count}** |`);
});
topTable.push("");

// Splice topTable after the caveats — find the first `## ` after intro and insert before it.
const firstSectionIdx = out.findIndex((l, i) => i > 5 && l.startsWith("## ") && !l.startsWith("## How"));
if (firstSectionIdx > 0) {
  out.splice(firstSectionIdx, 0, ...topTable);
}

out.push("---");
out.push("");
out.push("## Totals");
out.push("");
out.push(`- Pages: **${totalPages}**`);
out.push(`- Buttons: **${totalButtons}**`);
out.push(`- Dialog triggers: **${totalDialogs}**`);
out.push(`- Menu items: **${totalMenuItems}**`);
out.push(`- Nav links / setLocation: **${totalLinks}**`);
out.push(`- Form submit handlers: **${totalSubmits}**`);
out.push(`- Unique tRPC paths invoked: **${totalTrpc}** (with dedup)`);

writeFileSync("/tmp/page-inventory.md", out.join("\n"));
console.error(`wrote /tmp/page-inventory.md — ${totalPages} pages, ${totalButtons} buttons, ${totalLinks} nav links`);
