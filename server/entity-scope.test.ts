import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Entity-scope CI guard (multi-entity STEP 2, per spec RULES).
// Every table must carry a company column (companyId or ownerCompanyId) UNLESS it is on the
// baseline exemption list (global reference data, join/audit/log tables, children that inherit
// their parent's scope). A NEW entity-scoped table added without the column — and not consciously
// exempted — fails here, preventing silent multi-entity data leaks.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tablesWithoutCompanyColumn(src: string): string[] {
  const lines = src.split("\n");
  const without: string[] = [];
  let current: string | null = null;
  let hasCol = false;
  const declRe = /^export const (\w+) = mysqlTable\(/;
  for (const line of lines) {
    const m = declRe.exec(line);
    if (m) { current = m[1]; hasCol = false; continue; }
    if (current) {
      if (line.includes('companyId: int("companyId")') || line.includes('ownerCompanyId: int("ownerCompanyId")')) hasCol = true;
      // Tables end with `});` or, when they have an index/config callback, `}));` (any paren depth).
      if (/^\}\)*;/.test(line)) { if (!hasCol) without.push(current); current = null; }
    }
  }
  return without;
}

describe("entity-scope guard", () => {
  const schema = readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
  const exempt = new Set(
    readFileSync(path.join(root, "drizzle/entity-scope-exempt.txt"), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );

  it("every non-exempt table carries a company column (companyId/ownerCompanyId)", () => {
    const missing = tablesWithoutCompanyColumn(schema).filter((t) => !exempt.has(t));
    expect(
      missing,
      `These tables lack companyId/ownerCompanyId and are not exempt. Add a companyId column to ` +
        `scope them to an entity, or (only for genuinely global/reference/child tables) add them to ` +
        `drizzle/entity-scope-exempt.txt with justification:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("exemption list has no stale entries (exempt tables really do lack the column)", () => {
    const withoutCol = new Set(tablesWithoutCompanyColumn(schema));
    const stale = [...exempt].filter((t) => !withoutCol.has(t));
    expect(stale, `These are on the exempt list but now HAVE a company column — remove them from ` +
      `drizzle/entity-scope-exempt.txt:\n  ${stale.join("\n  ")}`).toEqual([]);
  });
});
