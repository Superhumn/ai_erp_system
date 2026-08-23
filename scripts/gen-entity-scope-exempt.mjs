// One-time bootstrap for the entity-scope CI guard. Scans drizzle/schema.ts and writes the
// baseline list of tables that legitimately have NO company column today (global reference data,
// join/log tables, and child tables that inherit their parent's scope). The guard
// (server/entity-scope.test.ts) then fails if any *new* table lacks companyId/ownerCompanyId and
// isn't on this list — forcing a conscious classification. Re-run only to intentionally re-baseline.
import { readFileSync, writeFileSync } from "node:fs";
import { tablesWithoutCompanyColumn } from "./entity-scope-lib.mjs";

const exempt = tablesWithoutCompanyColumn(readFileSync("drizzle/schema.ts", "utf8"));
const header = [
  "# Tables allowed to have NO companyId/ownerCompanyId column (entity-scope CI guard baseline).",
  "# Global reference data, join/audit/log tables, and children that inherit their parent's scope.",
  "# Adding a NEW entity-scoped table? Give it companyId — do NOT add it here.",
  "# Enforced by server/entity-scope.test.ts.",
  "",
];
writeFileSync("drizzle/entity-scope-exempt.txt", header.concat(exempt.sort()).join("\n") + "\n");
console.log(`wrote drizzle/entity-scope-exempt.txt with ${exempt.length} exempt tables`);
