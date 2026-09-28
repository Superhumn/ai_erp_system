import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: vi.fn() }));
// The AP processors go through the bills helpers in db.ts (never the drizzle
// handle from engine.getDb()), so they are unit-testable behind this mock.
vi.mock("./db", () => ({
  getDb: vi.fn(),
  getBills: vi.fn().mockResolvedValue([]),
  getBillById: vi.fn(),
  updateBill: vi.fn().mockResolvedValue(null),
  getPurchaseOrderById: vi.fn().mockResolvedValue(null),
  getPurchaseOrders: vi.fn().mockResolvedValue([]),
  createPayment: vi.fn().mockResolvedValue({ id: 501 }),
  recordBillPayment: vi.fn(),
}));

import * as db from "./db";
import { workflowProcessors } from "./workflowProcessors";
import type { WorkflowEngine, WorkflowContext } from "./autonomousWorkflowEngine";

function fakeEngine() {
  const recordStep = vi.fn(async (_ctx: unknown, _n: number, _name: string, _type: string, fn: () => Promise<any>) => fn());
  const getDb = vi.fn(() => {
    throw new Error("processor must not touch the drizzle handle (the `invoices` table is customer AR)");
  });
  const engine = {
    recordStep,
    getDb,
    handleException: vi.fn(),
    requestApproval: vi.fn().mockResolvedValue({ approvalId: 900, autoApproved: false }),
  } as unknown as WorkflowEngine;
  return { engine, recordStep, getDb };
}

function contextWith(config: Record<string, any> = {}): WorkflowContext {
  return { workflowId: 1, runId: 10, config, inputData: {}, stepResults: new Map(), decisions: [], exceptions: [] };
}

const yesterday = new Date(Date.now() - 86400000);
const nextWeek = new Date(Date.now() + 7 * 86400000);

function bill(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, companyId: 1, billNumber: "B-1", vendorId: 4, vendorName: "Acme", purchaseOrderId: null,
    totalAmount: "500.00", amountPaid: "0.00", currency: "USD", status: "approved", matchStatus: "matched",
    dueDate: yesterday, billDate: yesterday, notes: null, paidAt: null,
    ...overrides,
  };
}

describe("workflowProcessors.paymentProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getBills).mockResolvedValue([]);
    vi.mocked(db.getBillById).mockResolvedValue(null);
    vi.mocked(db.recordBillPayment).mockImplementation(async (id, p) => bill({ id, amountPaid: p.amount.toFixed(2), status: "paid" }) as any);
  });

  it("completes with no work when nothing is due, without touching the drizzle handle", async () => {
    const { engine, recordStep, getDb } = fakeEngine();
    const result = await workflowProcessors.paymentProcessing.execute(engine, contextWith());
    expect(getDb).not.toHaveBeenCalled();
    expect(db.getBills).toHaveBeenCalledWith({ statuses: ["approved", "scheduled"] });
    expect(recordStep.mock.calls[0].slice(1, 4)).toEqual([1, "Fetch Due Payables", "data_fetch"]);
    expect(result).toMatchObject({ success: true, runId: 10, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 });
  });

  it("auto-pays due bills under the threshold as 'made' payments and requests approval above it", async () => {
    const rows = [
      bill({ id: 1, totalAmount: "500.00" }),
      bill({ id: 2, billNumber: "B-2", totalAmount: "5000.00", purchaseOrderId: 33 }),
      bill({ id: 3, billNumber: "B-3", totalAmount: "100.00", dueDate: nextWeek }), // not due yet
      bill({ id: 4, billNumber: "B-4", totalAmount: "100.00", amountPaid: "100.00" }), // nothing outstanding
    ];
    vi.mocked(db.getBills).mockResolvedValue(rows as any);
    vi.mocked(db.getBillById).mockImplementation(async (id) => (rows.find((r) => r.id === id) ?? null) as any);
    const { engine, getDb } = fakeEngine();

    const result = await workflowProcessors.paymentProcessing.execute(engine, contextWith());

    expect(getDb).not.toHaveBeenCalled();
    // Bill 1 (500 <= default 1000 threshold): paid through the shared payBill path.
    expect(db.createPayment).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.createPayment).mock.calls[0][0]).toMatchObject({ type: "made", vendorId: 4, amount: "500.00", status: "completed", paymentMethod: "bank_transfer" });
    expect(vi.mocked(db.createPayment).mock.calls[0][0]).not.toHaveProperty("invoiceId");
    expect(db.recordBillPayment).toHaveBeenCalledWith(1, { amount: 500, paymentId: 501 });
    // Bill 2 (5000): approval requested, parked as pending_approval, never paid.
    expect(engine.requestApproval).toHaveBeenCalledTimes(1);
    expect(vi.mocked(engine.requestApproval).mock.calls[0].slice(1, 7)).toEqual(["payment", "Payment for Bill B-2", "Pay $5000.00 to Acme", 5000, "bill", 2]);
    expect(db.updateBill).toHaveBeenCalledWith(2, { status: "pending_approval" });

    expect(result).toMatchObject({ status: "awaiting_approval", itemsProcessed: 2, itemsSucceeded: 1, itemsFailed: 0, totalValue: 5500, pendingApprovals: 1 });
    expect(result.outputData.processed).toEqual([{ billId: 1, amount: 500, paymentId: 501 }]);
    expect(result.outputData.pendingApproval).toEqual([{ billId: 2, amount: 5000, approvalId: 900 }]);
  });

  it("honours the workflow's threshold / lookahead config and an engine auto-approval", async () => {
    const rows = [bill({ id: 5, totalAmount: "1500.00", dueDate: new Date(Date.now() + 2 * 86400000) })];
    vi.mocked(db.getBills).mockResolvedValue(rows as any);
    vi.mocked(db.getBillById).mockResolvedValue(rows[0] as any);
    const { engine } = fakeEngine();
    vi.mocked(engine.requestApproval).mockResolvedValue({ approvalId: 1, autoApproved: true });

    const result = await workflowProcessors.paymentProcessing.execute(engine, contextWith({ autoPayThreshold: 1000, paymentLookaheadDays: 3, paymentMethod: "ach" }));

    expect(engine.requestApproval).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.createPayment).mock.calls[0][0]).toMatchObject({ amount: "1500.00", paymentMethod: "ach" });
    expect(result).toMatchObject({ status: "completed", itemsSucceeded: 1 });
  });

  it("counts a failed payment without aborting the run", async () => {
    const rows = [bill({ id: 6, totalAmount: "10.00" })];
    vi.mocked(db.getBills).mockResolvedValue(rows as any);
    vi.mocked(db.getBillById).mockResolvedValue(rows[0] as any);
    vi.mocked(db.createPayment).mockRejectedValueOnce(new Error("bank down"));
    const { engine } = fakeEngine();

    const result = await workflowProcessors.paymentProcessing.execute(engine, contextWith());
    expect(result).toMatchObject({ status: "completed", itemsProcessed: 1, itemsSucceeded: 0, itemsFailed: 1 });
    expect(result.outputData.failed).toEqual([{ billId: 6, amount: 10, error: "bank down" }]);
  });
});

describe("workflowProcessors.invoiceMatching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getBills).mockResolvedValue([]);
    vi.mocked(db.getPurchaseOrderById).mockResolvedValue(null as any);
    vi.mocked(db.getPurchaseOrders).mockResolvedValue([]);
  });

  it("reads unmatched bills only and completes when there are none", async () => {
    const { engine, recordStep, getDb } = fakeEngine();
    const result = await workflowProcessors.invoiceMatching.execute(engine, contextWith());
    expect(getDb).not.toHaveBeenCalled();
    expect(db.getBills).toHaveBeenCalledWith({ matchStatus: "unmatched", statuses: ["draft", "pending_approval", "approved"] });
    expect(recordStep.mock.calls[0].slice(1, 4)).toEqual([1, "Fetch Pending Vendor Invoices", "data_fetch"]);
    expect(result).toMatchObject({ status: "completed", itemsProcessed: 0 });
  });

  it("matches within tolerance (flipping drafts to pending_approval), flags variances, and raises an exception with no PO", async () => {
    vi.mocked(db.getBills).mockResolvedValue([
      bill({ id: 1, status: "draft", matchStatus: "unmatched", purchaseOrderId: 33, totalAmount: "101.00" }),
      bill({ id: 2, billNumber: "B-2", status: "approved", matchStatus: "unmatched", purchaseOrderId: null, totalAmount: "250.00" }),
      bill({ id: 3, billNumber: "B-3", status: "draft", matchStatus: "unmatched", purchaseOrderId: null, totalAmount: "999.00" }),
    ] as any);
    vi.mocked(db.getPurchaseOrderById).mockResolvedValue({ id: 33, poNumber: "PO-33", totalAmount: "100.00", status: "received" } as any);
    vi.mocked(db.getPurchaseOrders).mockResolvedValue([
      { id: 40, poNumber: "PO-40", totalAmount: "240.00", status: "received" },
      { id: 41, poNumber: "PO-41", totalAmount: "500.00", status: "confirmed" },
    ] as any);
    const { engine } = fakeEngine();

    const result = await workflowProcessors.invoiceMatching.execute(engine, contextWith({ matchTolerancePercent: 2 }));

    // Bill 1: 1% off its linked PO → matched, and the draft moves to approval.
    expect(db.updateBill).toHaveBeenCalledWith(1, { matchStatus: "matched", purchaseOrderId: 33 });
    expect(db.updateBill).toHaveBeenCalledWith(1, { status: "pending_approval" });
    // Bill 2: no linked PO, nearest vendor PO is 4% off → variance + exception, status untouched.
    expect(db.updateBill).not.toHaveBeenCalledWith(2, expect.objectContaining({ matchStatus: "matched" }));
    expect(db.updateBill).not.toHaveBeenCalledWith(2, expect.objectContaining({ status: expect.anything() }));
    // Bill 3: nothing close → documentation_missing exception.
    expect(engine.handleException).toHaveBeenCalledWith(expect.anything(), "documentation_missing", "No matching PO for bill B-3", expect.any(String), expect.objectContaining({ billId: 3 }), "bill", 3);
    expect(result).toMatchObject({ status: "completed", itemsProcessed: 3, itemsSucceeded: 1, itemsFailed: 2, totalValue: 101 });
    expect(result.outputData.matched).toHaveLength(1);
    expect(result.outputData.discrepancies).toHaveLength(0);
  });

  it("marks a linked PO outside tolerance as a variance and raises price_variance", async () => {
    vi.mocked(db.getBills).mockResolvedValue([bill({ id: 7, status: "draft", matchStatus: "unmatched", purchaseOrderId: 33, totalAmount: "110.00" })] as any);
    vi.mocked(db.getPurchaseOrderById).mockResolvedValue({ id: 33, poNumber: "PO-33", totalAmount: "100.00", status: "received" } as any);
    const { engine } = fakeEngine();

    const result = await workflowProcessors.invoiceMatching.execute(engine, contextWith());

    expect(db.updateBill).toHaveBeenCalledWith(7, { matchStatus: "variance", purchaseOrderId: 33 });
    expect(db.updateBill).not.toHaveBeenCalledWith(7, expect.objectContaining({ status: "pending_approval" }));
    expect(engine.handleException).toHaveBeenCalledWith(expect.anything(), "price_variance", "Bill B-1 price variance", "Variance of $10.00 (10.0%) from PO PO-33", expect.objectContaining({ billId: 7, poId: 33, variance: 10 }), "bill", 7);
    expect(result).toMatchObject({ itemsFailed: 1, itemsSucceeded: 0 });
    expect(result.outputData.discrepancies[0]).toMatchObject({ billId: 7, variancePercent: 10 });
  });
});
