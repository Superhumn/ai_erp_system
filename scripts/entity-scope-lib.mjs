// Shared parsing for the entity-scope guard. Given schema.ts source, returns the const names of
// all tables that have NO companyId and NO ownerCompanyId column.
export function tablesWithoutCompanyColumn(src) {
  const lines = src.split("\n");
  const without = [];
  let current = null;
  let hasCol = false;
  const declRe = /^export const (\w+) = mysqlTable\(/;

  for (const line of lines) {
    const m = declRe.exec(line);
    if (m) {
      current = m[1];
      hasCol = false;
      continue;
    }
    if (current) {
      if (line.includes('companyId: int("companyId")') || line.includes('ownerCompanyId: int("ownerCompanyId")')) {
        hasCol = true;
      }
      // A table ends with `});` OR — when it has an index/config callback — `}));` (any paren depth).
      // Anchored at column 0 so indented closings inside the body don't match.
      if (/^\}\)*;/.test(line)) {
        if (!hasCol) without.push(current);
        current = null;
      }
    }
  }
  return without;
}
