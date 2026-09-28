import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// investorUpdates.create, invoices.create and inventory.create stored companyId NULL whenever the
// client omitted it (the client never sends it), so the rows never matched the entity-scoped
// readers (investorPortal.updates, invoices.list, inventory.list). Each now defaults companyId to
// the caller's home entity, and the invoice journal entry no longer hardcodes company 1.

vi.mock("./db", () => ({
  createInvestorUpdate: vi.fn(async () => ({ id: 21 })),
  updateInvestorUpdate: vi.fn(async () => undefined),
  createInvoice: vi.fn(async () => ({ id: 31, invoiceNumber: "INV-1" })),
  createInvoiceItem: vi.fn(async () => ({ id: 1 })),
  createTransaction: vi.fn(async () => ({ id: 41 })),
  createTransactionLine: vi.fn(async () => ({ id: 1 })),
  getAccountByCode: vi.fn(async () => undefined),
  getAccountByName: vi.fn(async () => undefined),
  createInventory: vi.fn(async () => ({ id: 51 })),
  createAuditLog: vi.fn(async () => undefined),
}));

import * as db from "./db";

type Mock = ReturnType<typeof vi.fn>;
const firstArg = (fn: unknown) => (fn as Mock).mock.calls[0][0];

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: 5,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "admin",
      companyId: 7,
      regionScope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("companyId defaults on create", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("investorUpdates", () => {
    it("create defaults companyId to the author's home entity", async () => {
      const caller = appRouter.createCaller(ctxFor({ companyId: 7 }));
      await caller.investorUpdates.create({ title: "Q3 update" });
      expect(firstArg(db.createInvestorUpdate)).toMatchObject({ title: "Q3 update", companyId: 7, createdBy: 5 });
    });

    it("create keeps an explicit companyId", async () => {
      const caller = appRouter.createCaller(ctxFor({ companyId: 7 }));
      await caller.investorUpdates.create({ title: "Q3 update", companyId: 9 });
      expect(firstArg(db.createInvestorUpdate)).toMatchObject({ companyId: 9 });
    });

    it("update accepts companyId so a NULL row can be re-scoped", async () => {
      const caller = appRouter.createCaller(ctxFor({}));
      await caller.investorUpdates.update({ id: 3, companyId: 7, status: "sent" });
      expect(db.updateInvestorUpdate).toHaveBeenCalledWith(3, { companyId: 7, status: "sent" });
    });
  });

  describe("invoices", () => {
    const invoiceInput = { issueDate: new Date("2026-01-01"), subtotal: "100", totalAmount: "100" };

    it("create stores the user's companyId on the invoice and its journal entry", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "finance", companyId: 7 }));
      await caller.invoices.create(invoiceInput);
      expect(firstArg(db.createInvoice)).toMatchObject({ companyId: 7, createdBy: 5 });
      expect(firstArg(db.createTransaction)).toMatchObject({ companyId: 7, referenceId: 31 });
      expect(db.getAccountByCode).toHaveBeenCalledWith("1200", 7);
      expect(db.getAccountByCode).toHaveBeenCalledWith("4000", 7);
    });

    it("create keeps an explicit companyId and never falls back to company 1", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "finance", companyId: null }));
      await caller.invoices.create({ ...invoiceInput, companyId: 9 });
      expect(firstArg(db.createInvoice)).toMatchObject({ companyId: 9 });
      expect(firstArg(db.createTransaction)).toMatchObject({ companyId: 9 });
      expect(db.getAccountByCode).toHaveBeenCalledWith("1200", 9);
    });

    it("create leaves companyId unset (not 1) when neither input nor user has one", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "finance", companyId: null }));
      await caller.invoices.create(invoiceInput);
      expect(firstArg(db.createInvoice).companyId).toBeUndefined();
      expect(firstArg(db.createTransaction).companyId).toBeUndefined();
    });
  });

  describe("inventory", () => {
    it("create defaults companyId to the user's home entity", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "ops", companyId: 7 }));
      await caller.inventory.create({ productId: 1, quantity: "10" });
      expect(firstArg(db.createInventory)).toMatchObject({ productId: 1, quantity: "10", companyId: 7 });
    });

    it("create keeps an explicit companyId", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "ops", companyId: 7 }));
      await caller.inventory.create({ productId: 1, quantity: "10", companyId: 9 });
      expect(firstArg(db.createInventory)).toMatchObject({ companyId: 9 });
    });
  });
});
