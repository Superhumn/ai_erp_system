import { describe, it, expect } from "vitest";
import { reconcileThreeWayMatch, resolveApprovalPolicy } from "./purchaseOrderMatching";

const poItem = (over: Partial<Parameters<typeof reconcileThreeWayMatch>[0][number]> = {}) => ({
  id: 1,
  description: "Widget",
  quantity: "10",
  receivedQuantity: "10",
  unitPrice: "5",
  totalAmount: "50",
  sku: null,
  ...over,
});

const invLine = (over: Partial<Parameters<typeof reconcileThreeWayMatch>[2][number]> = {}) => ({
  documentId: 1,
  description: "Widget",
  sku: null,
  quantity: "10",
  unitPrice: "5",
  totalPrice: "50",
  ...over,
});

describe("reconcileThreeWayMatch", () => {
  it("marks a line matched when ordered, received and invoiced agree", () => {
    const r = reconcileThreeWayMatch([poItem()], [{ id: 1, totalAmount: "50" }], [invLine()]);
    expect(r.matchStatus).toBe("matched");
    expect(r.lines[0].matched).toBe(true);
    expect(r.lines[0].issues).toEqual([]);
  });

  it("flags a short receipt", () => {
    const r = reconcileThreeWayMatch(
      [poItem({ receivedQuantity: "7" })],
      [{ id: 1, totalAmount: "50" }],
      [invLine({ quantity: "7", totalPrice: "35" })],
    );
    expect(r.lines[0].issues).toContain("under_received");
    expect(r.matchStatus).toBe("variance");
  });

  it("flags an over-receipt", () => {
    const r = reconcileThreeWayMatch(
      [poItem({ receivedQuantity: "12" })],
      [{ id: 1, totalAmount: "60" }],
      [invLine({ quantity: "12", totalPrice: "60" })],
    );
    expect(r.lines[0].issues).toContain("over_received");
  });

  it("flags a price variance beyond the tolerance but not inside it", () => {
    // 5.05 on a 5.00 line is 1% — inside the 2% band, so not a variance.
    const inside = reconcileThreeWayMatch(
      [poItem()],
      [{ id: 1, totalAmount: "50.5" }],
      [invLine({ totalPrice: "50.5" })],
    );
    expect(inside.lines[0].issues).not.toContain("price_variance");

    // 6.00 on a 5.00 line is 20% — well outside.
    const outside = reconcileThreeWayMatch(
      [poItem()],
      [{ id: 1, totalAmount: "60" }],
      [invLine({ totalPrice: "60" })],
    );
    expect(outside.lines[0].issues).toContain("price_variance");
    expect(outside.lines[0].invoicedUnitPrice).toBeCloseTo(6);
  });

  it("flags a quantity billed above what was received", () => {
    const r = reconcileThreeWayMatch(
      [poItem()],
      [{ id: 1, totalAmount: "60" }],
      [invLine({ quantity: "12", totalPrice: "60" })],
    );
    expect(r.lines[0].issues).toContain("invoice_qty_variance");
  });

  it("reports invoice lines that match no PO line instead of absorbing them", () => {
    const r = reconcileThreeWayMatch(
      [poItem()],
      [{ id: 1, totalAmount: "120" }],
      [invLine(), invLine({ description: "Rush freight surcharge", quantity: "1", totalPrice: "70" })],
    );
    expect(r.unmatchedInvoiceLines).toHaveLength(1);
    expect(r.unmatchedInvoiceLines[0].description).toBe("Rush freight surcharge");
    expect(r.matchStatus).toBe("variance");
  });

  it("does not let two PO lines claim the same invoice line", () => {
    const r = reconcileThreeWayMatch(
      [poItem({ id: 1 }), poItem({ id: 2 })],
      [{ id: 1, totalAmount: "50" }],
      [invLine()],
    );
    const invoiced = r.lines.filter((l) => !l.issues.includes("not_invoiced"));
    expect(invoiced).toHaveLength(1);
    expect(r.lines.find((l) => l.purchaseOrderItemId === 2)?.issues).toContain("not_invoiced");
  });

  it("matches on SKU ahead of description when both sides carry one", () => {
    const r = reconcileThreeWayMatch(
      [poItem({ description: "Blue widget", sku: "W-1" })],
      [{ id: 1, totalAmount: "50" }],
      [invLine({ description: "WIDGET, BLUE (rev B)", sku: "w-1" })],
    );
    expect(r.lines[0].matched).toBe(true);
  });

  it("matches descriptions case- and whitespace-insensitively", () => {
    const r = reconcileThreeWayMatch(
      [poItem({ description: "Steel  Bolt" })],
      [{ id: 1, totalAmount: "50" }],
      [invLine({ description: "steel bolt" })],
    );
    expect(r.lines[0].matched).toBe(true);
  });

  it("counts header charges billed outside the line items", () => {
    // Lines total 50, invoice totals 65 — the extra 15 is tax/freight the
    // vendor billed at header level.
    const r = reconcileThreeWayMatch([poItem()], [{ id: 1, totalAmount: "65" }], [invLine()]);
    expect(r.header.invoicedTotal).toBe("65.00");
    expect(r.header.totalVariance).toBe("15.00");
    expect(r.header.totalVariancePct).toBe("30.00");
  });

  it("reports awaiting_receipt before awaiting_invoice", () => {
    const r = reconcileThreeWayMatch([poItem({ receivedQuantity: "0" })], [], []);
    expect(r.matchStatus).toBe("awaiting_receipt");
  });

  it("reports awaiting_invoice once goods have arrived but nothing is billed", () => {
    const r = reconcileThreeWayMatch([poItem()], [], []);
    expect(r.matchStatus).toBe("awaiting_invoice");
  });

  it("handles a PO with no line items", () => {
    const r = reconcileThreeWayMatch([], [], []);
    expect(r.matchStatus).toBe("no_lines");
    expect(r.header.totalVariancePct).toBe("0.00");
  });

  it("treats unparseable amounts as zero rather than NaN", () => {
    const r = reconcileThreeWayMatch(
      [poItem({ unitPrice: "n/a", totalAmount: "" })],
      [{ id: 1, totalAmount: undefined }],
      [],
    );
    expect(r.header.orderedTotal).toBe("0.00");
    expect(Number.isNaN(Number(r.header.totalVariance))).toBe(false);
  });
});

describe("resolveApprovalPolicy", () => {
  const threshold = {
    name: "Standard PO policy",
    autoApproveMaxAmount: "1000",
    level1MaxAmount: "10000",
    level2MaxAmount: "50000",
    level3MaxAmount: "250000",
    level1Roles: '["ops"]',
    level2Roles: '["admin"]',
    level3Roles: '["exec"]',
    execRoles: '["exec"]',
  };

  it("auto-approves below the auto-approve ceiling", () => {
    const p = resolveApprovalPolicy(threshold, 900);
    expect(p.autoApprove).toBe(true);
    expect(p.levels).toEqual([]);
  });

  it("requires only level 1 inside the level-1 band", () => {
    const p = resolveApprovalPolicy(threshold, 5000);
    expect(p.autoApprove).toBe(false);
    expect(p.levels.map((l) => l.level)).toEqual([1]);
    expect(p.levels[0].roles).toEqual(["ops"]);
  });

  it("accumulates every band the amount exceeds", () => {
    // 60k is past level 2, so levels 1, 2 and 3 all have to sign off — not
    // level 3 alone.
    const p = resolveApprovalPolicy(threshold, 60000);
    expect(p.levels.map((l) => l.level)).toEqual([1, 2, 3]);
  });

  it("adds an exec level above every configured band", () => {
    const p = resolveApprovalPolicy(threshold, 1_000_000);
    expect(p.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    expect(p.levels[3].roles).toEqual(["exec"]);
  });

  it("falls back to a single ops approval over 500 with no threshold configured", () => {
    expect(resolveApprovalPolicy(null, 100).autoApprove).toBe(true);
    const p = resolveApprovalPolicy(null, 5000);
    expect(p.autoApprove).toBe(false);
    expect(p.levels).toEqual([{ level: 1, roles: ["ops", "admin", "exec"] }]);
  });

  it("falls back to default roles when the roles column is malformed", () => {
    // A bad JSON blob must not lock approvals out entirely.
    const p = resolveApprovalPolicy({ ...threshold, level1Roles: "{not json" }, 5000);
    expect(p.levels[0].roles).toEqual(["ops"]);
  });

  it("falls back to default roles when the roles column is an empty array", () => {
    const p = resolveApprovalPolicy({ ...threshold, level1Roles: "[]" }, 5000);
    expect(p.levels[0].roles).toEqual(["ops"]);
  });

  it("treats an unset auto-approve ceiling as no auto-approval", () => {
    const p = resolveApprovalPolicy({ ...threshold, autoApproveMaxAmount: null }, 10);
    expect(p.autoApprove).toBe(false);
    expect(p.levels.map((l) => l.level)).toEqual([1]);
  });
});
