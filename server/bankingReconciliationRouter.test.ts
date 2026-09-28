import { describe, expect, it, vi, beforeEach } from "vitest";

// appRouter.banking.reconciliation — bank-to-payment reconciliation. The db layer is mocked at
// module level; the pure matcher (bankReconciliation.ts) runs for real on top of it.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  getUserEntityAccessCompanyIds: vi.fn().mockResolvedValue([]),
  getCompanyById: vi.fn().mockResolvedValue(null),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
  getEntityAndDescendantCompanyIds: vi.fn().mockResolvedValue([]),
  getBankTransactionById: vi.fn(),
  getUnreconciledBankTransactions: vi.fn().mockResolvedValue([]),
  getPaymentMatchCandidates: vi.fn().mockResolvedValue([]),
  getBankTransactionsMatchedToPayment: vi.fn().mockResolvedValue([]),
  setBankTransactionReconciliation: vi.fn().mockResolvedValue(undefined),
  getBankReconciliationSummary: vi.fn().mockResolvedValue([]),
  getPaymentById: vi.fn(),
}));

import * as db from "./db";
import { appRouter } from "./routers";
import { ctxFor } from "./flows/_harness";

type BankLine = NonNullable<Awaited<ReturnType<typeof db.getBankTransactionById>>>;
type Payment = NonNullable<Awaited<ReturnType<typeof db.getPaymentById>>>;
type Candidate = Awaited<ReturnType<typeof db.getPaymentMatchCandidates>>[number];

const DATE = new Date("2026-09-10T15:00:00Z");

const line = (o: Partial<BankLine> = {}): BankLine => ({
  id: 7, companyId: 1, externalId: "txn_1", accountName: "Operating", accountId: "acct", date: DATE,
  amount: "1200.00", type: "debit", description: "ACH ACME MILLS ACH-777", counterpartyName: "Acme Mills",
  status: "sent", category: null, accountCode: null, categorizationStatus: "uncategorized", aiConfidence: null,
  matchedInvoiceId: null, matchedPurchaseOrderId: null, matchedVendorId: null, matchedCustomerId: null,
  matchedPaymentId: null, reconciliationStatus: "unreconciled", reconciledAt: null, reconciledBy: null,
  syncedToQuickbooks: false, source: "mercury", notes: null, createdAt: DATE, updatedAt: DATE,
  ...o,
});

const payment = (o: Partial<Payment> = {}): Payment => ({
  id: 50, companyId: 1, paymentNumber: "PAY-2609-0050", type: "made", invoiceId: null, vendorId: 4, customerId: null,
  accountId: null, amount: "1200.00", currency: "USD", amountFunc: null, amountGroup: null, fxRateUsed: null, fxRateDate: null,
  paymentMethod: "ach", paymentDate: DATE, referenceNumber: "ACH-777", status: "completed", purchaseOrderId: null,
  notes: null, quickbooksPaymentId: null, createdBy: 2, createdAt: DATE, updatedAt: DATE,
  ...o,
});

const candidate = (o: Partial<Candidate> = {}): Candidate => ({
  id: 50, companyId: 1, paymentNumber: "PAY-2609-0050", type: "made", amount: "1200.00", currency: "USD",
  paymentDate: DATE, paymentMethod: "ach", referenceNumber: "ACH-777", status: "completed", vendorId: 4,
  customerId: null, invoiceId: null, vendorName: "Acme Mills", customerName: null,
  ...o,
});

const finance = () => appRouter.createCaller(ctxFor("finance", { id: 2, companyId: 1, regionScope: "entity" }));

describe("banking.reconciliation router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getBankTransactionById).mockResolvedValue(line());
    vi.mocked(db.getPaymentById).mockResolvedValue(payment());
    vi.mocked(db.getBankTransactionsMatchedToPayment).mockResolvedValue([]);
    vi.mocked(db.getPaymentMatchCandidates).mockResolvedValue([]);
    vi.mocked(db.getUnreconciledBankTransactions).mockResolvedValue([]);
  });

  describe("role gating", () => {
    it("rejects non-finance roles on every procedure", async () => {
      for (const role of ["ops", "sales", "user"] as const) {
        const caller = appRouter.createCaller(ctxFor(role));
        await expect(caller.banking.reconciliation.suggest()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.banking.reconciliation.summary()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.banking.reconciliation.autoMatch()).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(db.setBankTransactionReconciliation).not.toHaveBeenCalled();
    });

    it("rejects a scoped user with no entity", async () => {
      const caller = appRouter.createCaller(ctxFor("finance", { companyId: null, regionScope: "entity" }));
      await expect(caller.banking.reconciliation.suggest()).rejects.toMatchObject({ code: "FORBIDDEN", message: "No entity scope assigned" });
    });
  });

  describe("suggest", () => {
    it("scopes the open-line query and the candidate search to the caller's entity and ranks suggestions", async () => {
      vi.mocked(db.getUnreconciledBankTransactions).mockResolvedValue([line()]);
      vi.mocked(db.getPaymentMatchCandidates).mockResolvedValue([
        candidate({ id: 51, referenceNumber: null, vendorName: "Other Co", paymentDate: new Date("2026-09-13T00:00:00Z") }),
        candidate(),
      ]);
      const result = await finance().banking.reconciliation.suggest({ limit: 10 });

      expect(db.getUnreconciledBankTransactions).toHaveBeenCalledWith({ companyIds: [1], limit: 10 });
      const call = vi.mocked(db.getPaymentMatchCandidates).mock.calls[0][0];
      expect(call).toMatchObject({ amount: 1200, direction: "made", companyIds: [1], excludeBankTransactionId: 7 });
      expect(call.from.toISOString()).toBe("2026-09-05T00:00:00.000Z");
      expect(call.to.toISOString()).toBe("2026-09-15T23:59:59.999Z");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 7, signedAmount: -1200 });
      expect(result[0].suggestions.map((s) => [s.paymentId, s.confidence])).toEqual([[50, 100], [51, 70]]);
      expect(result[0].suggestions[0].reasons).toContain("Reference ACH-777 found in bank description");
    });

    it("searches received payments for a credit line", async () => {
      vi.mocked(db.getUnreconciledBankTransactions).mockResolvedValue([line({ type: "credit", amount: "80.50" })]);
      await finance().banking.reconciliation.suggest();
      expect(db.getUnreconciledBankTransactions).toHaveBeenCalledWith({ companyIds: [1], limit: 50 });
      expect(db.getPaymentMatchCandidates).toHaveBeenCalledWith(expect.objectContaining({ amount: 80.5, direction: "received" }));
    });

    it("global users search without an entity filter; a line with no entity searches every entity", async () => {
      vi.mocked(db.getUnreconciledBankTransactions).mockResolvedValue([line({ companyId: null })]);
      await appRouter.createCaller(ctxFor("admin")).banking.reconciliation.suggest();
      expect(db.getUnreconciledBankTransactions).toHaveBeenCalledWith({ companyIds: undefined, limit: 50 });
      expect(db.getPaymentMatchCandidates).toHaveBeenCalledWith(expect.objectContaining({ companyIds: undefined }));
    });

    it("returns one line by id, NOT_FOUND outside the caller's entity", async () => {
      const one = await finance().banking.reconciliation.suggest({ bankTransactionId: 7 });
      expect(one.map((l) => l.id)).toEqual([7]);
      expect(db.getUnreconciledBankTransactions).not.toHaveBeenCalled();

      vi.mocked(db.getBankTransactionById).mockResolvedValue(line({ companyId: 2 }));
      await expect(finance().banking.reconciliation.suggest({ bankTransactionId: 7 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("match", () => {
    it("reconciles the line, stamps the user and writes an audit log", async () => {
      vi.mocked(db.getBankTransactionById)
        .mockResolvedValueOnce(line())
        .mockResolvedValueOnce(line({ reconciliationStatus: "reconciled", matchedPaymentId: 50, reconciledBy: 2 }));
      const result = await finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 });

      expect(db.setBankTransactionReconciliation).toHaveBeenCalledWith(7, { matchedPaymentId: 50, status: "reconciled", userId: 2 });
      expect(result).toMatchObject({ reconciliationStatus: "reconciled", matchedPaymentId: 50 });
      expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        userId: 2, action: "update", entityType: "bank_transaction", entityId: 7, entityName: "Acme Mills",
        oldValues: { reconciliationStatus: "unreconciled", matchedPaymentId: null },
        newValues: { reconciliationStatus: "reconciled", matchedPaymentId: 50 },
      }));
    });

    it("rejects a payment with a different amount or direction (BAD_REQUEST)", async () => {
      vi.mocked(db.getPaymentById).mockResolvedValue(payment({ amount: "1199.99" }));
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 }))
        .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Amount differs: bank $1,200.00 vs payment $1,199.99" });

      vi.mocked(db.getPaymentById).mockResolvedValue(payment({ type: "received" }));
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 }))
        .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/money out/) });
      expect(db.setBankTransactionReconciliation).not.toHaveBeenCalled();
    });

    it("rejects a payment already matched to another bank line (CONFLICT)", async () => {
      vi.mocked(db.getBankTransactionsMatchedToPayment).mockResolvedValue([line({ id: 99, matchedPaymentId: 50, reconciliationStatus: "reconciled" })]);
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 }))
        .rejects.toMatchObject({ code: "CONFLICT", message: "Payment PAY-2609-0050 is already matched to bank line #99" });
      expect(db.setBankTransactionReconciliation).not.toHaveBeenCalled();
    });

    it("maps a unique-index race to CONFLICT", async () => {
      vi.mocked(db.setBankTransactionReconciliation).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 })).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("is idempotent for the same payment and CONFLICT for a line reconciled to another one", async () => {
      vi.mocked(db.getBankTransactionById).mockResolvedValue(line({ reconciliationStatus: "reconciled", matchedPaymentId: 50 }));
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 })).resolves.toMatchObject({ matchedPaymentId: 50 });
      vi.mocked(db.getPaymentById).mockResolvedValue(payment({ id: 51 }));
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 51 }))
        .rejects.toMatchObject({ code: "CONFLICT", message: "Bank line is already reconciled to payment #50; unmatch it first" });
      expect(db.setBankTransactionReconciliation).not.toHaveBeenCalled();
    });

    it("hides payments and lines outside the caller's entity (NOT_FOUND) and refuses cross-entity matches", async () => {
      vi.mocked(db.getPaymentById).mockResolvedValue(payment({ companyId: 2 }));
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Payment not found" });

      vi.mocked(db.getPaymentById).mockResolvedValue(undefined);
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 })).rejects.toMatchObject({ code: "NOT_FOUND" });

      vi.mocked(db.getBankTransactionById).mockResolvedValue(undefined);
      await expect(finance().banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Bank transaction not found" });

      vi.mocked(db.getBankTransactionById).mockResolvedValue(line({ companyId: 1 }));
      vi.mocked(db.getPaymentById).mockResolvedValue(payment({ companyId: 2 }));
      await expect(appRouter.createCaller(ctxFor("admin")).banking.reconciliation.match({ bankTransactionId: 7, paymentId: 50 }))
        .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Payment belongs to a different entity than the bank line" });
      expect(db.setBankTransactionReconciliation).not.toHaveBeenCalled();
    });
  });

  describe("unmatch / exclude", () => {
    it("unmatch frees the payment and audits the previous link", async () => {
      vi.mocked(db.getBankTransactionById).mockResolvedValue(line({ reconciliationStatus: "reconciled", matchedPaymentId: 50 }));
      await finance().banking.reconciliation.unmatch({ bankTransactionId: 7 });
      expect(db.setBankTransactionReconciliation).toHaveBeenCalledWith(7, { matchedPaymentId: null, status: "unreconciled", userId: 2 });
      expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        oldValues: { reconciliationStatus: "reconciled", matchedPaymentId: 50 },
        newValues: { reconciliationStatus: "unreconciled", matchedPaymentId: null },
      }));
    });

    it("unmatch on an open line is a no-op", async () => {
      await finance().banking.reconciliation.unmatch({ bankTransactionId: 7 });
      expect(db.setBankTransactionReconciliation).not.toHaveBeenCalled();
      expect(db.createAuditLog).not.toHaveBeenCalled();
    });

    it("exclude records the reason in the notes and requires a reason", async () => {
      vi.mocked(db.getBankTransactionById).mockResolvedValue(line({ notes: "Monthly" }));
      await finance().banking.reconciliation.exclude({ bankTransactionId: 7, reason: "Bank fee" });
      expect(db.setBankTransactionReconciliation).toHaveBeenCalledWith(7, {
        matchedPaymentId: null, status: "excluded", userId: 2, notes: "Monthly\nExcluded from reconciliation: Bank fee",
      });
      await expect(finance().banking.reconciliation.exclude({ bankTransactionId: 7, reason: "  " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("exclude refuses a reconciled line (CONFLICT)", async () => {
      vi.mocked(db.getBankTransactionById).mockResolvedValue(line({ reconciliationStatus: "reconciled", matchedPaymentId: 50 }));
      await expect(finance().banking.reconciliation.exclude({ bankTransactionId: 7, reason: "fee" })).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("autoMatch", () => {
    it("reconciles only lines with exactly one suggestion at/above the threshold and marks the rest for review", async () => {
      vi.mocked(db.getUnreconciledBankTransactions).mockResolvedValue([
        line({ id: 1 }), // one strong candidate → reconciled
        line({ id: 2, description: "ACH", counterpartyName: null, amount: "300.00" }), // two amount-only candidates → review
        line({ id: 3, amount: "5.00", description: "FEE", counterpartyName: null }), // nothing → no candidates
        line({ id: 4, amount: "9.00", reconciliationStatus: "suggested", description: "X", counterpartyName: null }), // was suggested, now nothing
      ]);
      vi.mocked(db.getPaymentMatchCandidates).mockImplementation(async ({ amount }) => {
        if (amount === 1200) return [candidate()];
        if (amount === 300) return [candidate({ id: 60, amount: "300.00", referenceNumber: null }), candidate({ id: 61, amount: "300.00", referenceNumber: null })];
        return [];
      });

      const result = await finance().banking.reconciliation.autoMatch();
      expect(result).toEqual({
        scanned: 4, reconciled: 1, needsReview: 1, noCandidates: 2, minConfidence: 90,
        matches: [{ bankTransactionId: 1, paymentId: 50, confidence: 100 }],
      });
      expect(vi.mocked(db.setBankTransactionReconciliation).mock.calls).toEqual([
        [1, { matchedPaymentId: 50, status: "reconciled", userId: 2 }],
        [2, { matchedPaymentId: null, status: "suggested", userId: 2 }],
        [4, { matchedPaymentId: null, status: "unreconciled", userId: 2 }],
      ]);
      expect(db.createAuditLog).toHaveBeenCalledTimes(1);
      expect(db.getUnreconciledBankTransactions).toHaveBeenCalledWith({ companyIds: [1], limit: 200 });
    });

    it("respects a lower threshold and validates it", async () => {
      vi.mocked(db.getUnreconciledBankTransactions).mockResolvedValue([line({ id: 2, description: "ACH", counterpartyName: null })]);
      vi.mocked(db.getPaymentMatchCandidates).mockResolvedValue([candidate({ referenceNumber: null, vendorName: null })]);
      expect(await finance().banking.reconciliation.autoMatch({ minConfidence: 90 })).toMatchObject({ reconciled: 0, needsReview: 1 });
      expect(await finance().banking.reconciliation.autoMatch({ minConfidence: 85 })).toMatchObject({ reconciled: 1 });
      await expect(finance().banking.reconciliation.autoMatch({ minConfidence: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("summary", () => {
    it("folds the grouped rows for the caller's entities", async () => {
      vi.mocked(db.getBankReconciliationSummary).mockResolvedValue([
        { status: "reconciled", type: "debit", count: 2, total: "1650.00" },
        { status: "unreconciled", type: "credit", count: 1, total: "80.50" },
      ]);
      const summary = await finance().banking.reconciliation.summary();
      expect(db.getBankReconciliationSummary).toHaveBeenCalledWith({ companyIds: [1] });
      expect(summary.reconciled).toEqual({ count: 2, inflow: 0, outflow: 1650, total: 1650 });
      expect(summary.unreconciled).toEqual({ count: 1, inflow: 80.5, outflow: 0, total: 80.5 });
      expect(summary.all.count).toBe(3);
    });
  });
});
