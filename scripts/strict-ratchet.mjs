#!/usr/bin/env node
/**
 * Strict-mode ratchet.
 *
 * The repo's main tsconfig disables noImplicitAny and strictNullChecks. A second
 * config (tsconfig.strict-full.json) re-enables both across the whole project.
 * Running it produces N errors across M files. We don't gate on N=0 — that
 * would never green up. Instead, we record per-file error counts in a checked-
 * in baseline, and the CI gate enforces "no file may exceed its baseline
 * count". PRs that fix errors lower the baseline; PRs that introduce new
 * strict errors fail CI.
 *
 * Subcommands:
 *   audit    — print current strict-error counts per file
 *   check    — diff current counts against the baseline; exit 1 on regression
 *   update   — overwrite the baseline with the current counts
 *
 * Default subcommand is "check".
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT_CFG = "tsconfig.strict-full.json";
const BASELINE_PATH = join(ROOT, ".strict-baseline.json");

const sub = process.argv[2] ?? "check";

function runStrict() {
  const r = spawnSync("pnpm", ["exec", "tsc", "--noEmit", "--project", STRICT_CFG], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;

  if (r.error) {
    console.error(`Failed to execute strict typecheck: ${r.error.message}`);
    if (output.trim()) console.error(output.trim());
    process.exit(2);
  }
  if (r.status === null) {
    console.error("Strict typecheck terminated before completion.");
    if (output.trim()) console.error(output.trim());
    process.exit(2);
  }
  // tsc's diagnostic exit codes (all mean "ran to completion, diagnostics may
  // be present" — we always parse `output` for the per-file counts):
  //   0 = Success (no errors)
  //   1 = DiagnosticsPresent_OutputsSkipped   (errors, nothing emitted)
  //   2 = DiagnosticsPresent_OutputsGenerated (errors, but an output was still
  //       written — happens here because the base tsconfig sets
  //       `incremental: true`, so a cold run with no cached `.tsbuildinfo`
  //       writes one even under `--noEmit`. A warm run skips the write and
  //       exits 1. CI always runs cold, so it always sees 2.)
  // Anything else (3/4 project-reference errors, etc.) is a real tooling fault.
  if (r.status !== 0 && r.status !== 1 && r.status !== 2) {
    console.error(
      `Strict typecheck failed with exit code ${r.status}. This usually indicates a tooling/config issue (e.g. pnpm not available or invalid TypeScript config).`,
    );
    if (output.trim()) console.error(output.trim());
    process.exit(2);
  }
  return output;
}

function parseErrors(raw) {
  const counts = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^()\s][^()]*?)\((\d+),(\d+)\):\s+error\s/);
    if (!m) continue;
    const file = m[1].replace(/\\/g, "/");
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return { version: 1, totalErrors: 0, files: {} };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sorted = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
  const data = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    totalErrors: total,
    files: sorted,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + "\n");
  return data;
}

function audit() {
  const counts = parseErrors(runStrict());
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
  console.log(`Total strict errors: ${total} across ${entries.length} files\n`);
  for (const [file, n] of entries) console.log(`  ${String(n).padStart(4)}  ${file}`);
}

function check() {
  const baseline = loadBaseline();
  const counts = parseErrors(runStrict());
  const allFiles = new Set([...Object.keys(baseline.files), ...Object.keys(counts)]);

  const regressions = [];
  const improvements = [];
  for (const file of allFiles) {
    const before = baseline.files[file] ?? 0;
    const after = counts[file] ?? 0;
    if (after > before) regressions.push({ file, before, after });
    else if (after < before) improvements.push({ file, before, after });
  }

  if (regressions.length === 0) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`Strict ratchet OK. Total errors: ${total} (baseline ${baseline.totalErrors}).`);
    if (improvements.length) {
      console.log(`\nImprovements detected — run 'pnpm strict:update' to lower the baseline:`);
      for (const { file, before, after } of improvements) {
        console.log(`  ${file}: ${before} -> ${after}`);
      }
    }
    process.exit(0);
  }

  console.error("Strict ratchet FAILED. New errors introduced:\n");
  for (const { file, before, after } of regressions) {
    console.error(`  ${file}: ${before} -> ${after}  (+${after - before})`);
  }
  console.error(
    `\nFix the new errors, or — if intentional — run 'pnpm strict:update' (will need justification in review).`,
  );
  process.exit(1);
}

function update() {
  const counts = parseErrors(runStrict());
  const data = writeBaseline(counts);
  console.log(
    `Wrote ${data.totalErrors} errors across ${Object.keys(data.files).length} files to ${BASELINE_PATH}`,
  );
}

switch (sub) {
  case "audit":
    audit();
    break;
  case "check":
    check();
    break;
  case "update":
    update();
    break;
  default:
    console.error(`Unknown subcommand: ${sub}. Expected: audit | check | update`);
    process.exit(2);
}
