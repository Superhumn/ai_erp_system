// Which transactions count as cost of goods sold. Shared so the Transactions screen's
// "COGS only" filter and the server query agree.

export const COGS_KEYWORDS = [
  "cogs", "cost of goods", "cost of sales", "raw material", "freight",
  "customs", "duty", "shipping cost", "packaging", "manufacturing",
  "production cost", "ingredient", "landed cost",
] as const;

export const COGS_REFERENCE_TYPES = ["purchase_order", "purchaseorder", "cogs", "inventory"] as const;

export function isCOGSTransaction(tx: { description?: string | null; referenceType?: string | null }): boolean {
  const desc = (tx.description || "").toLowerCase();
  const ref = (tx.referenceType || "").toLowerCase();
  return COGS_KEYWORDS.some((kw) => desc.includes(kw)) || (COGS_REFERENCE_TYPES as readonly string[]).includes(ref);
}
