/**
 * Pure logic for collapsing duplicate inventory rows.
 *
 * `inventory` has no unique key on (productId, warehouseId) and every writer
 * does a read-then-insert, so a race leaves two rows describing the same stock.
 * Anything that counts or sums rows then double-counts — the inventory page's
 * "Total SKUs" is a row count, so the duplicates surface there directly.
 *
 * Kept out of db.ts so the classification and the merge arithmetic — the parts
 * that decide what a stock figure becomes — can be unit-tested without a
 * mocked drizzle chain.
 */

/** Quantities within this are the same number; DECIMAL(15,4) is the stored precision. */
export const QUANTITY_EPSILON = 0.00005;

export const toQuantity = (v: unknown) => {
  const n = Number(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

export type DuplicateRow = {
  id: number;
  quantity: unknown;
  reservedQuantity?: unknown;
};

export type MergeStrategy = "keep_one" | "sum";

/**
 * Classify one duplicate group and suggest how to resolve it.
 *
 * The old updateInventoryQuantity computed a new total from one row and then
 * wrote it to *every* row matching the pair, so identical quantities are that
 * overwrite artifact: one row is real and the copies are echoes, making
 * "keep_one" correct and "sum" a multiplication of real stock.
 *
 * Differing quantities mean the copies were incremented independently and each
 * holds part of the true total, so "sum" is suggested — but it stays a
 * suggestion, because a stale row that stopped being updated would also look
 * like this and summing it would invent stock.
 */
export function classifyDuplicateGroup(rows: DuplicateRow[]) {
  if (rows.length === 0) throw new Error("A duplicate group needs at least one row.");

  // Oldest row survives so ids referenced elsewhere keep resolving.
  const ordered = [...rows].sort((a, b) => a.id - b.id);
  const quantities = ordered.map((r) => toQuantity(r.quantity));
  const allIdentical = quantities.every((q) => Math.abs(q - quantities[0]) < QUANTITY_EPSILON);

  return {
    keepId: ordered[0].id,
    removeIds: ordered.slice(1).map((r) => r.id),
    allIdentical,
    keepQuantity: quantities[0],
    summedQuantity: quantities.reduce((a, b) => a + b, 0),
    suggestedStrategy: (allIdentical ? "keep_one" : "sum") as MergeStrategy,
  };
}

/**
 * The quantities the surviving row ends up with.
 *
 * Reserved quantities are summed regardless of strategy: a reservation is a
 * real claim against stock recorded on whichever row the writer happened to
 * find, so dropping the copies' reservations would release stock nobody freed.
 */
export function resolveMergedQuantities(
  keeper: DuplicateRow,
  removed: DuplicateRow[],
  strategy: MergeStrategy,
) {
  const quantity =
    strategy === "sum"
      ? toQuantity(keeper.quantity) + removed.reduce((sum, r) => sum + toQuantity(r.quantity), 0)
      : toQuantity(keeper.quantity);

  const reservedQuantity =
    toQuantity(keeper.reservedQuantity) +
    removed.reduce((sum, r) => sum + toQuantity(r.reservedQuantity), 0);

  return { quantity, reservedQuantity };
}
