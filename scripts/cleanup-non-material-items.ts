/**
 * One-off cleanup: remove rows from the raw-materials catalog that aren't real
 * materials (freight charges, SaaS/usage billing, plan names, etc. that leaked in
 * via the document-import pipeline — see documentImportService.isNonMaterialLineItem).
 *
 * Only the whitelisted materials below are kept; everything else is hard-deleted
 * along with its dependent rows. The underlying purchase orders / invoices / freight
 * records are NOT touched — only the materials catalog and its direct links.
 *
 * Dependent-row rule:
 *   - NOT NULL  rawMaterialId  → delete the dependent row (a null would violate the FK)
 *   - nullable  rawMaterialId  → null the reference (preserve the parent record)
 *
 * Usage:
 *   DATABASE_URL=mysql://... pnpm tsx scripts/cleanup-non-material-items.ts            # dry run (default)
 *   DATABASE_URL=mysql://... pnpm tsx scripts/cleanup-non-material-items.ts --apply    # actually delete
 */
import { drizzle } from "drizzle-orm/mysql2";
import { inArray } from "drizzle-orm";
import {
  rawMaterials,
  // NOT NULL rawMaterialId — dependent rows are deleted
  rawMaterialInventory,
  rawMaterialTransactions,
  purchaseOrderRawMaterials,
  materialRequirements,
  suggestedPoItems,
  // nullable rawMaterialId — references are nulled
  parsedDocumentLineItems,
  bomComponents,
  workOrderMaterials,
  poReceivingItems,
  vendorRfqs,
  vendorNegotiationProducts,
} from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const db = drizzle(DATABASE_URL);

// The only real materials. Everything else is removed.
const KEEP_EXACT = [
  "shiitake mushroom shredded",
  "shiitake mushroom chopped",
  "hemp protein",
  "coconut oil",
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function isKeeper(name: string): boolean {
  const n = norm(name);
  if (/^formula [1-4]\b/.test(n)) return true; // Formula 1..4
  return KEEP_EXACT.some((k) => n === k || n.startsWith(k + " ") || n.startsWith(k));
}

// nullable rawMaterialId tables (reference is nulled)
const NULL_DEPENDENTS = [
  { table: parsedDocumentLineItems, name: "parsedDocumentLineItems" },
  { table: bomComponents, name: "bomComponents" },
  { table: workOrderMaterials, name: "workOrderMaterials" },
  { table: poReceivingItems, name: "poReceivingItems" },
  { table: vendorRfqs, name: "vendorRfqs" },
  { table: vendorNegotiationProducts, name: "vendorNegotiationProducts" },
] as const;

// NOT NULL rawMaterialId tables (dependent row is deleted)
const DELETE_DEPENDENTS = [
  { table: rawMaterialInventory, name: "rawMaterialInventory" },
  { table: rawMaterialTransactions, name: "rawMaterialTransactions" },
  { table: purchaseOrderRawMaterials, name: "purchaseOrderRawMaterials" },
  { table: materialRequirements, name: "materialRequirements" },
  { table: suggestedPoItems, name: "suggestedPoItems" },
] as const;

async function main() {
  const all = await db.select().from(rawMaterials);
  const keep = all.filter((m) => isKeeper(m.name));
  const remove = all.filter((m) => !isKeeper(m.name));
  const removeIds = remove.map((m) => m.id);

  console.log(`\nRaw materials in catalog: ${all.length}`);
  console.log(`\n✅ KEEPING (${keep.length}):`);
  for (const m of keep) console.log(`   [${m.id}] ${m.name}  (${m.sku ?? "no sku"})`);

  console.log(`\n🗑️  DELETING (${remove.length}):`);
  for (const m of remove) console.log(`   [${m.id}] ${m.name}  (${m.sku ?? "no sku"})`);

  if (removeIds.length === 0) {
    console.log("\nNothing to delete.");
    process.exit(0);
  }

  // Report dependent rows that will be affected.
  console.log("\nDependent rows referencing the materials to delete:");
  for (const { table, name } of [...NULL_DEPENDENTS, ...DELETE_DEPENDENTS]) {
    const rows = await db.select().from(table as any).where(inArray((table as any).rawMaterialId, removeIds));
    const verb = (DELETE_DEPENDENTS as readonly { name: string }[]).some((d) => d.name === name) ? "delete" : "null";
    if (rows.length > 0) console.log(`   ${name}: ${rows.length} row(s) → ${verb}`);
  }

  if (!APPLY) {
    console.log("\n[DRY RUN] No changes made. Re-run with --apply to execute.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const { table } of NULL_DEPENDENTS) {
      await tx.update(table as any).set({ rawMaterialId: null }).where(inArray((table as any).rawMaterialId, removeIds));
    }
    for (const { table } of DELETE_DEPENDENTS) {
      await tx.delete(table as any).where(inArray((table as any).rawMaterialId, removeIds));
    }
    await tx.delete(rawMaterials).where(inArray(rawMaterials.id, removeIds));
  });

  console.log(`\n✅ Deleted ${removeIds.length} non-material entries and cleaned up dependents.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
