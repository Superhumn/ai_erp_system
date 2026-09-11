/**
 * Re-derives how much of `rawMaterials.quantityReceived` was added by
 * *duplicate* purchase orders, so an inflated stock figure can be corrected.
 *
 * Why this has to re-derive rather than read a ledger
 * ---------------------------------------------------
 * `documentImportService` increments `rawMaterials.quantityReceived` as a
 * running total when it imports an invoice with `markAsReceived`, and it writes
 * no `rawMaterialTransactions` row while doing so. The `rawMaterialId` it used
 * lives only in memory for the duration of that import — it is never persisted
 * on the purchase-order line or in a link table. So nothing in the database
 * records "this receipt added X to material Y".
 *
 * The surviving evidence is the duplicate purchase orders' own line items.
 * Where a line carries a `purchaseOrderRawMaterials` link it is used directly;
 * the invoice importer never writes one, but other paths do. Otherwise this
 * module re-runs the importer's matcher over the description to work out where
 * the redundant receipt landed.
 *
 * What the re-derived half costs in confidence — stated plainly because a stock
 * correction should not be trusted further than its evidence:
 *
 *  - The importer matched on SKU *or* description. Line items don't store a
 *    SKU, so only the description half can be reproduced. A receipt that
 *    originally matched by SKU may not be attributable now.
 *  - The description match is a loose two-way substring test and takes the
 *    first hit. Where more than one material matches, the original import
 *    picked whichever came first in an unordered fetch. Those lines are
 *    reported as `ambiguous`: a number is still produced, but it is a guess.
 *  - Materials created since the original import change the candidate set.
 *
 * Nothing here writes. It produces a report and lets a human decide.
 */

/** DECIMAL(15,4) in the schema — anything under half of the last place is noise. */
export const QTY_EPSILON = 0.00005;

export interface MaterialRef {
  id: number;
  name: string;
  sku?: string | null;
}

/** One line item belonging to a redundant (non-keeper) purchase order. */
export interface RedundantLine {
  purchaseOrderId: number;
  poNumber: string;
  description: string;
  quantity: number;
  /**
   * Material id from the `purchaseOrderRawMaterials` junction, when the line
   * has one. The invoice importer never writes this row, but other code paths
   * do — and a real foreign key beats re-running a substring match, so it wins
   * whenever it is present.
   */
  linkedMaterialId?: number | null;
}

export type MatchConfidence = "linked" | "unique" | "ambiguous" | "unmatched";

export interface LineAttribution extends RedundantLine {
  materialId: number | null;
  materialName: string | null;
  confidence: MatchConfidence;
  /** Every material the description matched, so an ambiguous call can be audited. */
  candidateIds: number[];
}

export interface MaterialInflation {
  materialId: number;
  materialName: string;
  currentReceived: number;
  /** Total quantity the duplicate receipts added on top of the real one. */
  overAdded: number;
  /** What `quantityReceived` becomes if the over-add is backed out. */
  correctedReceived: number;
  lineCount: number;
  /** At least one contributing line matched more than one material. */
  hasAmbiguity: boolean;
  /**
   * `overAdded` exceeds what the material currently holds. The attribution
   * disagrees with reality — usually because stock was consumed after the
   * duplicate import, or because a loose description match landed on the wrong
   * material. Correcting these blind would push the figure to zero and hide a
   * real discrepancy, so they are surfaced instead of clamped silently.
   */
  exceedsCurrent: boolean;
}

export interface UnattributedLine extends RedundantLine {
  reason: "no-match";
}

export interface InflationReport {
  perMaterial: MaterialInflation[];
  /** Redundant receipts whose description matched nothing — cannot be corrected automatically. */
  unattributed: UnattributedLine[];
  totals: {
    redundantLines: number;
    attributedLines: number;
    materialsAffected: number;
    materialsNeedingReview: number;
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Replicates `matchLineItemsToMaterials` in documentImportService, minus the
 * SKU half (line items don't persist one) and with the empty-string hole
 * closed: `"".includes("")` is true, so a blank description — or a material
 * with a blank name — would otherwise match everything.
 */
export function findMaterialCandidates(description: string, materials: MaterialRef[]): MaterialRef[] {
  const desc = normalize(description);
  if (!desc) return [];

  return materials.filter((m) => {
    const name = normalize(m.name ?? "");
    if (!name) return false;
    return name.includes(desc) || desc.includes(name);
  });
}

export function attributeLines(lines: RedundantLine[], materials: MaterialRef[]): LineAttribution[] {
  const byId = new Map(materials.map((m) => [m.id, m]));

  return lines.map((line) => {
    // A persisted link is evidence, not inference — take it and skip the guess.
    if (line.linkedMaterialId != null) {
      const linked = byId.get(line.linkedMaterialId);
      if (linked) {
        return {
          ...line,
          materialId: linked.id,
          materialName: linked.name,
          confidence: "linked",
          candidateIds: [linked.id],
        };
      }
      // Link points at a material that no longer exists: fall through and try
      // to re-derive rather than dropping the receipt on the floor.
    }

    const candidates = findMaterialCandidates(line.description, materials);

    if (candidates.length === 0) {
      return { ...line, materialId: null, materialName: null, confidence: "unmatched", candidateIds: [] };
    }

    // The importer used `.find`, so the first candidate is the best available
    // reconstruction of what it actually picked.
    const chosen = candidates[0];
    return {
      ...line,
      materialId: chosen.id,
      materialName: chosen.name,
      confidence: candidates.length === 1 ? "unique" : "ambiguous",
      candidateIds: candidates.map((c) => c.id),
    };
  });
}

export function summarizeInflation(
  attributions: LineAttribution[],
  currentReceivedById: Map<number, number>,
): InflationReport {
  const byMaterial = new Map<number, { name: string; overAdded: number; lineCount: number; ambiguous: boolean }>();
  const unattributed: UnattributedLine[] = [];

  for (const a of attributions) {
    if (a.materialId == null) {
      const { materialId, materialName, confidence, candidateIds, ...line } = a;
      unattributed.push({ ...line, reason: "no-match" });
      continue;
    }

    const entry = byMaterial.get(a.materialId) ?? {
      name: a.materialName ?? `#${a.materialId}`,
      overAdded: 0,
      lineCount: 0,
      ambiguous: false,
    };
    entry.overAdded += a.quantity;
    entry.lineCount += 1;
    entry.ambiguous = entry.ambiguous || a.confidence === "ambiguous";
    byMaterial.set(a.materialId, entry);
  }

  const perMaterial: MaterialInflation[] = [];
  for (const [materialId, entry] of byMaterial) {
    const currentReceived = currentReceivedById.get(materialId) ?? 0;
    const exceedsCurrent = entry.overAdded - currentReceived > QTY_EPSILON;
    perMaterial.push({
      materialId,
      materialName: entry.name,
      currentReceived,
      overAdded: entry.overAdded,
      // Clamped so a corrected figure is never negative, but `exceedsCurrent`
      // marks the clamp so nobody reads the zero as a real answer.
      correctedReceived: Math.max(0, currentReceived - entry.overAdded),
      lineCount: entry.lineCount,
      hasAmbiguity: entry.ambiguous,
      exceedsCurrent,
    });
  }

  // Biggest discrepancy first — that is the order a human wants to review in.
  perMaterial.sort((a, b) => b.overAdded - a.overAdded || a.materialId - b.materialId);

  return {
    perMaterial,
    unattributed,
    totals: {
      redundantLines: attributions.length,
      attributedLines: attributions.length - unattributed.length,
      materialsAffected: perMaterial.length,
      materialsNeedingReview: perMaterial.filter((m) => m.hasAmbiguity || m.exceedsCurrent).length,
    },
  };
}

/** A joined row: one purchase-order line, once per junction link it carries. */
export interface LinkedLineRow {
  itemId: number;
  purchaseOrderId: number;
  poNumber: string;
  description: string;
  quantity: number;
  linkedMaterialId: number | null;
}

/**
 * Collapses the left-joined rows for a purchase order's line items down to one
 * entry per line.
 *
 * `purchaseOrderRawMaterials` permits more than one row per item, and a left
 * join emits one row per link. Without collapsing, a line's quantity is counted
 * once per link and can be attributed to several materials at once — both of
 * which inflate the very report meant to measure inflation.
 *
 * Conflicting links (two different materials claiming one line) resolve to no
 * link rather than a winner. Two materials claiming a line isn't evidence, so
 * it falls through to description matching, where it surfaces as ambiguous or
 * unmatched instead of being quietly resolved in favour of whichever row the
 * database happened to return first.
 */
export function collapseLinkedLines(rows: LinkedLineRow[]): RedundantLine[] {
  const byItem = new Map<number, { line: RedundantLine; links: Set<number> }>();

  for (const row of rows) {
    if (!Number.isFinite(row.quantity) || row.quantity === 0) continue;

    const existing = byItem.get(row.itemId);
    if (existing) {
      if (row.linkedMaterialId != null) existing.links.add(row.linkedMaterialId);
      continue;
    }

    byItem.set(row.itemId, {
      line: {
        purchaseOrderId: row.purchaseOrderId,
        poNumber: row.poNumber,
        description: row.description,
        quantity: row.quantity,
        linkedMaterialId: null,
      },
      links: row.linkedMaterialId != null ? new Set([row.linkedMaterialId]) : new Set(),
    });
  }

  return Array.from(byItem.values()).map(({ line, links }) => ({
    ...line,
    linkedMaterialId: links.size === 1 ? [...links][0] : null,
  }));
}
