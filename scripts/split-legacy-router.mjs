#!/usr/bin/env node
// One-shot migration: split `server/routers.ts` (the live tRPC monolith) into
// one file per top-level `appRouter` key under `server/routers/`, plus
// `server/routers/_shared.ts` for the module-level helpers those routers share.
//
// Router bodies are copied VERBATIM (whitespace included, so multi-line
// template literals such as email bodies and LLM prompts are byte-identical).
// Only the import lists are recomputed: each generated file imports exactly the
// header bindings and shared helpers its body references.
//
// Verification is external and mechanical: `pnpm exec tsx scripts/dump-trpc-paths.ts`
// must print the same procedure list before and after.
//
// The script only writes. It prints the `git rm` for the monolith and for the
// never-wired files of the old partial extraction; the operator runs that.
// Refuses to run when `server/routers.ts` is gone. Kept in the repo so the
// migration is reviewable / reproducible on the parent commit.
//
//   node scripts/split-legacy-router.mjs
import ts from "typescript";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "server/routers.ts");
const OUT = join(ROOT, "server/routers");
// Files in server/routers/ that live code already imports. Everything else in
// that directory is the stale, never-wired partial extraction and is replaced.
const KEEP = new Set(["middleware.ts", "employeePortal.ts", "code.ts"]);
const SHARED = "_shared";

if (!existsSync(SRC)) {
  console.error("server/routers.ts not found — already split.");
  process.exit(1);
}

const src = readFileSync(SRC, "utf8");
const sf = ts.createSourceFile("routers.ts", src, ts.ScriptTarget.ES2022, true);
const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

// ─── Partition top-level statements ─────────────────────────────────────────

const imports = [];
const shared = [];
let appRouterStmt = null;
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) { imports.push(st); continue; }
  if (ts.isVariableStatement(st) &&
      st.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === "appRouter")) {
    appRouterStmt = st; continue;
  }
  if (ts.isTypeAliasDeclaration(st) && st.name.text === "AppRouter") continue; // re-declared in index.ts
  if (ts.isVariableStatement(st) || ts.isFunctionDeclaration(st) || ts.isTypeAliasDeclaration(st) ||
      ts.isInterfaceDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) {
    shared.push(st); continue;
  }
  throw new Error(`Unexpected top-level statement at L${lineOf(st)}: ${ts.SyntaxKind[st.kind]}`);
}
if (!appRouterStmt) throw new Error("appRouter not found");

const appInit = appRouterStmt.declarationList.declarations[0].initializer;
if (!ts.isCallExpression(appInit) || appInit.expression.getText() !== "router" || appInit.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(appInit.arguments[0])) {
  throw new Error("appRouter is not `router({ ... })`");
}
const appObj = appInit.arguments[0];

// ─── Helpers ────────────────────────────────────────────────────────────────

// Specifiers were relative to server/; generated files live in server/routers/.
function rewriteSpecifier(spec) {
  if (spec.startsWith("./routers/")) return "./" + spec.slice("./routers/".length);
  if (spec.startsWith("./")) return "../" + spec.slice(2);
  if (spec.startsWith("../")) return "../" + spec;
  return spec;
}

function importBindings(decl) {
  const c = decl.importClause;
  const out = [];
  if (!c) return out;
  if (c.name) out.push({ kind: "default", local: c.name.text });
  if (c.namedBindings) {
    if (ts.isNamespaceImport(c.namedBindings)) out.push({ kind: "ns", local: c.namedBindings.name.text });
    else for (const s of c.namedBindings.elements) {
      out.push({ kind: "named", local: s.name.text, imported: s.propertyName?.text, typeOnly: s.isTypeOnly });
    }
  }
  return out;
}

function renderImport(decl, used) {
  const b = importBindings(decl).filter((x) => used.has(x.local));
  if (b.length === 0) return null;
  const parts = [];
  const def = b.find((x) => x.kind === "default");
  if (def) parts.push(def.local);
  const ns = b.find((x) => x.kind === "ns");
  if (ns) parts.push(`* as ${ns.local}`);
  const named = b.filter((x) => x.kind === "named");
  if (named.length) {
    parts.push(`{ ${named.map((x) => `${x.typeOnly ? "type " : ""}${x.imported ? `${x.imported} as ` : ""}${x.local}`).join(", ")} }`);
  }
  const typeOnly = decl.importClause.isTypeOnly ? "type " : "";
  return `import ${typeOnly}${parts.join(", ")} from "${rewriteSpecifier(decl.moduleSpecifier.text)}";`;
}

// Every identifier in reference position. Over-inclusion (an unused import) is
// harmless; under-inclusion fails typecheck, so this errs generous: only
// property names on the right of `.`/`:` are skipped.
function usedNames(node) {
  const set = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isPropName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isMethodDeclaration(p) && p.name === n) ||
        (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isPropertyDeclaration(p) && p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n);
      if (!isPropName) set.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return set;
}

function collectBinding(name, out) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) collectBinding(el.name, out);
}
function declaredNames(st) {
  const names = [];
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) collectBinding(d.name, names);
  else if (st.name) names.push(st.name.text);
  return names;
}

function leadingComments(node) {
  const ranges = ts.getLeadingCommentRanges(src, node.getFullStart()) || [];
  if (ranges.length === 0) return "";
  return ranges.map((r) => src.slice(r.pos, r.end)).join("\n") + "\n";
}

// Node text with `import("./x")` / `typeof import("./x")` specifiers rewritten
// the same way as the static imports. Everything else is byte-identical.
function textWithRewrittenSpecifiers(node) {
  const base = node.getStart();
  const edits = [];
  const visit = (n) => {
    let lit = null;
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword &&
        n.arguments.length > 0 && ts.isStringLiteralLike(n.arguments[0])) lit = n.arguments[0];
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteralLike(n.argument.literal)) lit = n.argument.literal;
    if (lit) edits.push([lit.getStart() - base, lit.getEnd() - base, rewriteSpecifier(lit.text)]);
    ts.forEachChild(n, visit);
  };
  visit(node);
  let text = node.getText();
  for (const [s, e, spec] of edits.sort((a, b) => b[0] - a[0])) {
    const quote = text[s];
    text = text.slice(0, s) + quote + spec + quote + text.slice(e);
  }
  return text;
}

function withExport(st) {
  const text = textWithRewrittenSpecifiers(st);
  const has = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  return leadingComments(st) + (has ? text : `export ${text}`);
}

// ─── _shared.ts ─────────────────────────────────────────────────────────────

const sharedNames = shared.flatMap(declaredNames);
const sharedTypeNames = new Set(shared.filter((s) => ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)).flatMap(declaredNames));
{
  const used = new Set();
  for (const st of shared) for (const n of usedNames(st)) used.add(n);
  const importLines = imports.map((d) => renderImport(d, used)).filter(Boolean);
  const body = shared.map(withExport).join("\n\n");
  const text = [
    "// Module-level helpers that the routers in this directory share: role",
    "// procedures, Google token refresh, Drive/sheet import, production planning",
    "// maths, recurring-invoice dates. Moved here verbatim from the top and bottom",
    "// of the former server/routers.ts by scripts/split-legacy-router.mjs.",
    "//",
    "// This file is a holding pen, not a destination. Each helper belongs in a",
    "// service module (or already duplicates one — see ./middleware.ts for the",
    "// role procedures). Dissolve it one helper at a time; do not add to it.",
    "",
    ...importLines,
    "",
    body,
    "",
  ].join("\n");
  writeFileSync(join(OUT, `${SHARED}.ts`), text);
}

// ─── The stale extracted tree ───────────────────────────────────────────────
// Deleted with `git rm` by the operator (printed at the end), never by this
// script. Same-named files are simply overwritten below.

const stale = readdirSync(OUT).filter((f) => f.endsWith(".ts") && !KEEP.has(f) && f !== `${SHARED}.ts` && f !== "index.ts");

// ─── One file per top-level key ─────────────────────────────────────────────

const entries = []; // { key, varName, from, comment }
const generatedFiles = [join(OUT, `${SHARED}.ts`)];
const headerLocals = new Set(imports.flatMap(importBindings).map((b) => b.local));

for (const prop of appObj.properties) {
  if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
    throw new Error(`Unsupported appRouter member at L${lineOf(prop)}: ${prop.getText().slice(0, 60)}`);
  }
  const key = prop.name.text;
  const init = prop.initializer;
  const comment = leadingComments(prop).replace(/^ +/gm, "");

  if (ts.isIdentifier(init)) {
    // `key: someRouter,` — a router defined elsewhere; index.ts imports it directly.
    const decl = imports.find((d) => importBindings(d).some((b) => b.local === init.text));
    if (!decl) throw new Error(`${key}: ${init.text} is not an import`);
    entries.push({ key, varName: init.text, from: rewriteSpecifier(decl.moduleSpecifier.text), comment });
    continue;
  }

  const varName = `${key}Router`;
  if (headerLocals.has(varName) || sharedNames.includes(varName)) throw new Error(`${key}: name clash on ${varName}`);
  if (KEEP.has(`${key}.ts`)) throw new Error(`${key}: would overwrite kept file ${key}.ts`);

  const used = usedNames(init);
  const importLines = imports.map((d) => renderImport(d, used)).filter(Boolean);
  const sharedUsed = sharedNames.filter((n) => used.has(n));
  if (sharedUsed.length) {
    importLines.push(`import { ${sharedUsed.map((n) => (sharedTypeNames.has(n) ? `type ${n}` : n)).join(", ")} } from "./${SHARED}";`);
  }

  const text = [
    `// appRouter.${key} — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.`,
    ...importLines,
    "",
    `${comment}export const ${varName} = ${textWithRewrittenSpecifiers(init)};`,
    "",
  ].join("\n");
  writeFileSync(join(OUT, `${key}.ts`), text);
  generatedFiles.push(join(OUT, `${key}.ts`));
  entries.push({ key, varName, from: `./${key}`, comment });
}

// ─── index.ts ───────────────────────────────────────────────────────────────

{
  const byFrom = new Map();
  for (const e of entries) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, []);
    byFrom.get(e.from).push(e.varName);
  }
  const importLines = [`import { router } from "../_core/trpc";`];
  for (const [from, names] of byFrom) importLines.push(`import { ${[...new Set(names)].join(", ")} } from "${from}";`);

  const members = entries.map((e) => `${e.comment.replace(/^(?=.)/gm, "  ")}  ${e.key}: ${e.varName},`);

  const exportedShared = shared.filter((s) => s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
  const valueExports = exportedShared.filter((s) => !ts.isTypeAliasDeclaration(s) && !ts.isInterfaceDeclaration(s)).flatMap(declaredNames);
  const typeExports = exportedShared.filter((s) => ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)).flatMap(declaredNames);

  const text = [
    "// The live tRPC router. One file per top-level key; `_shared.ts` holds the",
    "// helpers they have in common. Add a new feature as a new file + one line here.",
    ...importLines,
    "",
    "export const appRouter = router({",
    ...members,
    "});",
    "",
    "export type AppRouter = typeof appRouter;",
    "",
    "// Helpers the former server/routers.ts exported; still importable from this entry point.",
    ...(valueExports.length ? [`export { ${valueExports.join(", ")} } from "./${SHARED}";`] : []),
    ...(typeExports.length ? [`export type { ${typeExports.join(", ")} } from "./${SHARED}";`] : []),
    "",
  ].join("\n");
  writeFileSync(join(OUT, "index.ts"), text);
}

// ─── Prune imports the identifier scan kept but the binder says are unused ──
// The scan above is deliberately generous; its one systematic false positive is
// a body that re-declares a header name locally, e.g.
//   const { parseUploadedDocument } = await import("../documentImportService");
// which shadows the static import and leaves it unused. Ask the TypeScript
// language service, which resolves scopes properly, to remove exactly those.
// RemoveUnused mode neither sorts nor merges, so the diff stays minimal.
{
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
  const parsedCfg = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, ROOT);
  const host = {
    getScriptFileNames: () => generatedFiles,
    getScriptVersion: () => "0",
    getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
    getCurrentDirectory: () => ROOT,
    getCompilationSettings: () => parsedCfg.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
  const format = { ...ts.getDefaultFormatCodeSettings("\n"), insertSpaceAfterCommaDelimiter: true, insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true };
  const pending = [];
  for (const f of generatedFiles) {
    const changes = ls.organizeImports(
      { type: "file", fileName: f, skipDestructiveCodeActions: false, mode: ts.OrganizeImportsMode.RemoveUnused },
      format, {},
    );
    for (const c of changes) if (c.fileName === f && c.textChanges.length) pending.push(c);
  }
  let pruned = 0;
  for (const c of pending) {
    let text = ts.sys.readFile(c.fileName);
    for (const tc of [...c.textChanges].sort((a, b) => b.span.start - a.span.start)) {
      text = text.slice(0, tc.span.start) + tc.newText + text.slice(tc.span.start + tc.span.length);
      pruned++;
    }
    writeFileSync(c.fileName, text);
  }
  console.log(`pruned ${pruned} unused import(s) across ${pending.length} file(s)`);
}

const written = new Set(entries.filter((e) => e.from.startsWith("./")).map((e) => e.from.slice(2) + ".ts"));
const leftover = stale.filter((f) => !written.has(f));
console.log(`split ${entries.length} appRouter keys → ${written.size - [...written].filter((f) => KEEP.has(f)).length} router files + ${SHARED}.ts + index.ts; ${shared.length} shared declarations`);
console.log(`\nNow remove the monolith and the never-wired leftovers:\n  git rm server/routers.ts ${leftover.map((f) => `server/routers/${f}`).join(" ")}`);
