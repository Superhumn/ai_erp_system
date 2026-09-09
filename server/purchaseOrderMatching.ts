/**
 * Pure reconciliation logic for purchase orders: the three-way match and the
 * approval-threshold chain.
 *
 * Kept out of db.ts deliberately — these are the parts with real branching
 * (line matching, variance classification, which approval bands apply), and
 * separating them from the queries lets them be unit-tested directly instead of
 * behind a mocked drizzle chain.
 *
 * Lives at the server root rather than in server/db/, which is the orphaned
 * extracted tree; db.ts imports this module directly.
 */

/**
 * Prices are compared with a small percentage band because vendors routinely
 * round unit prices and FX-convert. Quantities get a flat epsilon only: a
 * genuine quantity difference matters however small it is.
 */
export const MATCH_PRICE_TOLERANCE_PCT = 2;
export const MATCH_EPSILON = 0.001;

export const normalizeForMatch = (v: string | null | undefined) =>
  String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export const toNumber = (v: unknown) => {
  const n = Number(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

export type MatchPoItem = {
  id: number;
  description: string | null;
  quantity: unknown;
  receivedQuantity: unknown;
  unitPrice: unknown;
  totalAmount: unknown;
  sku?: string | null;
};

export type MatchInvoiceLine = {
  documentId: number;
  description: string | null;
  sku: string | null;
  quantity: unknown;
  unitPrice: unknown;
  totalPrice: unknown;
};

export type MatchInvoiceDoc = { id: number; totalAmount: unknown };

export type MatchStatus = "matched" | "variance" | "awaiting_receipt" | "awaiting_invoice" | "no_lines";

/**
 * Reconcile what was ordered, what arrived and what was billed.
 *
 * Invoice lines are matched to PO lines on SKU first, then on normalized
 * description. A matched line is consumed, so two PO lines can't both claim it,
 * and whatever is left over is reported as unmatched rather than force-fitted —
 * a surprise line on a vendor invoice is exactly what this check exists to
 * surface.
 */
export function reconcileThreeWayMatch(
  items: MatchPoItem[],
  invoiceDocs: MatchInvoiceDoc[],
  invoiceLines: MatchInvoiceLine[],
) {
  const pool = invoiceLines.map((line) => ({ line, claimed: false }));

  const claimFor = (description: string | null, sku: string | null | undefined) => {
    const wantSku = normalizeForMatch(sku);
    const wantDesc = normalizeForMatch(description);
    const matches = pool.filter((entry) => {
      if (entry.claimed) return false;
      const lineSku = normalizeForMatch(entry.line.sku);
      // SKU is authoritative when both sides have one; description is the
      // fallback for the many parsed invoices that carry no SKU at all.
      if (wantSku && lineSku) return lineSku === wantSku;
      return wantDesc !== "" && normalizeForMatch(entry.line.description) === wantDesc;
    });
    matches.forEach((m) => { m.claimed = true; });
    return matches.map((m) => m.line);
  };

  const lines = items.map((item) => {
    const orderedQty = toNumber(item.quantity);
    const receivedQty = toNumber(item.receivedQuantity);
    const orderedUnitPrice = toNumber(item.unitPrice);

    const matched = claimFor(item.description, item.sku);
    const invoicedQty = matched.reduce((sum, l) => sum + toNumber(l.quantity), 0);
    const invoicedTotal = matched.reduce((sum, l) => sum + toNumber(l.totalPrice), 0);
    // Derived from the billed total rather than a per-line unitPrice the parser
    // may never have captured.
    const invoicedUnitPrice = invoicedQty > MATCH_EPSILON ? invoicedTotal / invoicedQty : 0;

    const receiptVariance = receivedQty - orderedQty;
    const invoiceQtyVariance = matched.length > 0 ? invoicedQty - receivedQty : 0;
    const priceVariance = matched.length > 0 ? invoicedUnitPrice - orderedUnitPrice : 0;
    const priceVariancePct =
      matched.length > 0 && orderedUnitPrice > MATCH_EPSILON
        ? (priceVariance / orderedUnitPrice) * 100
        : 0;

    const issues: string[] = [];
    if (receivedQty <= MATCH_EPSILON) issues.push("not_received");
    else if (receiptVariance > MATCH_EPSILON) issues.push("over_received");
    else if (receiptVariance < -MATCH_EPSILON) issues.push("under_received");

    if (matched.length === 0) issues.push("not_invoiced");
    else {
      if (Math.abs(invoiceQtyVariance) > MATCH_EPSILON) issues.push("invoice_qty_variance");
      if (Math.abs(priceVariancePct) > MATCH_PRICE_TOLERANCE_PCT) issues.push("price_variance");
    }

    return {
      purchaseOrderItemId: item.id,
      description: item.description,
      orderedQty, receivedQty, invoicedQty,
      orderedUnitPrice, invoicedUnitPrice,
      orderedTotal: toNumber(item.totalAmount),
      invoicedTotal,
      receiptVariance, invoiceQtyVariance, priceVariance, priceVariancePct,
      issues,
      matched: issues.length === 0,
    };
  });

  const unmatchedInvoiceLines = pool
    .filter((entry) => !entry.claimed)
    .map((entry) => ({
      documentId: entry.line.documentId,
      description: entry.line.description,
      quantity: toNumber(entry.line.quantity),
      unitPrice: toNumber(entry.line.unitPrice),
      totalPrice: toNumber(entry.line.totalPrice),
    }));

  const orderedTotal = lines.reduce((sum, l) => sum + l.orderedTotal, 0);
  const receivedValue = lines.reduce((sum, l) => sum + l.receivedQty * l.orderedUnitPrice, 0);
  // Header total comes from the invoice documents, not the summed lines, so tax
  // and freight billed outside the line items are still counted.
  const invoicedTotal = invoiceDocs.reduce((sum, d) => sum + toNumber(d.totalAmount), 0);
  const totalVariance = invoicedTotal - orderedTotal;

  const hasReceipt = lines.some((l) => l.receivedQty > MATCH_EPSILON);
  const hasInvoice = invoiceDocs.length > 0;
  const hasVariance = lines.some((l) => !l.matched) || unmatchedInvoiceLines.length > 0;

  // Ordered on purpose: a PO with nothing received yet isn't "in variance", it
  // simply hasn't got far enough to be matched.
  let matchStatus: MatchStatus;
  if (lines.length === 0) matchStatus = "no_lines";
  else if (!hasReceipt) matchStatus = "awaiting_receipt";
  else if (!hasInvoice) matchStatus = "awaiting_invoice";
  else matchStatus = hasVariance ? "variance" : "matched";

  return {
    matchStatus,
    header: {
      orderedTotal: orderedTotal.toFixed(2),
      receivedValue: receivedValue.toFixed(2),
      invoicedTotal: invoicedTotal.toFixed(2),
      totalVariance: totalVariance.toFixed(2),
      totalVariancePct: orderedTotal > MATCH_EPSILON ? ((totalVariance / orderedTotal) * 100).toFixed(2) : "0.00",
      invoiceCount: invoiceDocs.length,
      priceTolerancePct: MATCH_PRICE_TOLERANCE_PCT,
    },
    lines,
    unmatchedInvoiceLines,
  };
}

export type ApprovalThresholdConfig = {
  name: string;
  autoApproveMaxAmount: string | null;
  level1MaxAmount: string | null;
  level2MaxAmount: string | null;
  level3MaxAmount: string | null;
  level1Roles: string | null;
  level2Roles: string | null;
  level3Roles: string | null;
  execRoles: string | null;
};

export type ApprovalPolicy = {
  autoApprove: boolean;
  levels: { level: number; roles: string[] }[];
  thresholdName: string | null;
};

const parseRoles = (raw: string | null, fallbackRoles: string[]) => {
  if (!raw) return fallbackRoles;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.map(String) : fallbackRoles;
  } catch {
    // A malformed roles column must not lock approvals out entirely.
    return fallbackRoles;
  }
};

const parseAmount = (v: string | null) => {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : null;
};

/**
 * Resolve which approval levels a PO of `amount` has to clear.
 *
 * Mirrors AutonomousWorkflowEngine.checkApprovalRequired so a PO approved by
 * hand answers to the same policy as one approved by the workflow engine, and
 * falls back the same way (over 500 needs one approval) when nothing is
 * configured.
 *
 * Every band the amount exceeds must sign off — a PO above the level-2 ceiling
 * needs levels 1, 2 and 3, not level 3 alone.
 */
export function resolveApprovalPolicy(
  threshold: ApprovalThresholdConfig | null | undefined,
  amount: number,
): ApprovalPolicy {
  if (!threshold) {
    return {
      autoApprove: amount <= 500,
      levels: amount <= 500 ? [] : [{ level: 1, roles: ["ops", "admin", "exec"] }],
      thresholdName: null,
    };
  }

  const autoMax = parseAmount(threshold.autoApproveMaxAmount);
  if (autoMax != null && amount <= autoMax) {
    return { autoApprove: true, levels: [], thresholdName: threshold.name };
  }

  const bands = [
    { level: 1, max: parseAmount(threshold.level1MaxAmount), roles: parseRoles(threshold.level1Roles, ["ops"]) },
    { level: 2, max: parseAmount(threshold.level2MaxAmount), roles: parseRoles(threshold.level2Roles, ["admin"]) },
    { level: 3, max: parseAmount(threshold.level3MaxAmount), roles: parseRoles(threshold.level3Roles, ["exec"]) },
  ];

  const levels: { level: number; roles: string[] }[] = [];
  for (const band of bands) {
    levels.push({ level: band.level, roles: band.roles });
    if (band.max != null && amount <= band.max) {
      return { autoApprove: false, levels, thresholdName: threshold.name };
    }
  }

  // Above every configured band: the exec roles are the last word.
  levels.push({ level: 4, roles: parseRoles(threshold.execRoles, ["exec"]) });
  return { autoApprove: false, levels, thresholdName: threshold.name };
}
