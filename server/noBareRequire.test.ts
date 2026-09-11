import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// The server is ESM (package.json "type": "module") and the production bundle
// is built with `esbuild --format=esm`, so `require` is not defined at
// runtime. A bare `require('crypto')` inside a request handler throws
// "require is not defined" and every procedure that reaches it returns a 500.
// generateNumber() in server/routers.ts did exactly that and took down the
// create path of orders, invoices, projects, employees, purchase orders,
// shipments, payments, contracts, disputes and more.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

const serverDir = path.resolve(import.meta.dirname);
const files = walk(serverDir);

describe("server source never calls bare require()", () => {
  it.each(files.map((f) => path.relative(serverDir, f)))("%s", (rel) => {
    const src = fs.readFileSync(path.join(serverDir, rel), "utf8");
    const hits: string[] = [];
    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (/(^|[^.\w])require\s*\(/.test(code) && !/createRequire/.test(code)) hits.push(`${i + 1}: ${line.trim()}`);
    });
    expect(hits, "use a static import or `await import()` instead").toEqual([]);
  });
});
