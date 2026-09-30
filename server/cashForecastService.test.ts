import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getInvoices: vi.fn(),
  getBills: vi.fn(),
  getOpenPurchaseOrdersForForecast: vi.fn(),
  getRecurringInvoices: vi.fn(),
  getEmployeePayments: vi.fn(),
}));
vi.mock("./mercuryService", () => ({ getMercuryAccounts: vi.fn() }));

import * as db from "./db";
import * as mercury from "./mercuryService";
import { getCashForecast } from "./cashForecastService";
import type { Scope } from "./_core/scope";

const asOf = new Date("2026-09-30T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const entityScope: Scope = { mode: "entity", companyIds: [1] };
const globalScope: Scope = { mode: "global", companyIds: "all" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getInvoices).mockResolvedValue([
    { id: 1, companyId: 1, invoiceNumber: "INV-1", type: "invoice", status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000", paidAmount: "0", customer: { name: "A" } },
  ] as any);
  vi.mocked(db.getBills).mockResolvedValue([
    { id: 1, companyId: 1, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-08"), totalAmount: "400", amountPaid: "0", purchaseOrderId: 7, vendorName: "V" },
    { id: 3, companyId: 1, status: "paid", billDate: d("2026-09-01"), dueDate: d("2026-09-20"), totalAmount: "250", amountPaid: "250", purchaseOrderId: 8, vendorName: "V" },
  ] as any);
  vi.mocked(db.getOpenPurchaseOrdersForForecast).mockResolvedValue([
    { id: 7, companyId: 1, status: "confirmed", orderDate: d("2026-09-01"), totalAmount: "400", vendor: { paymentTerms: 30 } },
    { id: 8, companyId: 1, status: "confirmed", orderDate: d("2026-09-01"), totalAmount: "250", vendor: { paymentTerms: 30 } },
    { id: 9, companyId: 1, status: "confirmed", orderDate: d("2026-09-01"), expectedDate: d("2026-10-01"), totalAmount: "100", vendor: { paymentTerms: 10 } },
  ] as any);
  vi.mocked(db.getRecurringInvoices).mockResolvedValue([] as any);
  vi.mocked(db.getEmployeePayments).mockResolvedValue([] as any);
  vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: true, accounts: [{ name: "Ops", currentBalance: 5000 }] });
});

describe("getCashForecast", () => {
  it("uses the Mercury balance for global scope and skips POs that are billed or paid", async () => {
    const f = await getCashForecast({ scope: globalScope, asOf });
    expect(f.cashSource).toBe("mercury");
    expect(f.startingCash).toBe(5000);
    expect(f.totalIn).toBe(1000);
    expect(f.totalOut).toBe(500); // open bill 400 + unbilled PO 100; PO 7 (billed) and PO 8 (paid) skipped
    expect(f.endingCash).toBe(5500);
  });

  it("reads open rows only, scoped in SQL", async () => {
    await getCashForecast({ scope: entityScope, asOf });
    expect(db.getInvoices).toHaveBeenCalledWith(entityScope, { statuses: ["sent", "partial", "overdue"] });
    expect(db.getBills).toHaveBeenCalledWith({ companyIds: [1], statuses: ["pending_approval", "approved", "scheduled", "partially_paid", "overdue", "paid"] });
    expect(db.getOpenPurchaseOrdersForForecast).toHaveBeenCalledWith(entityScope, ["sent", "confirmed", "partial"]);
  });

  it("does not expose the org-wide bank balance to an entity-scoped caller", async () => {
    const f = await getCashForecast({ scope: entityScope, asOf });
    expect(mercury.getMercuryAccounts).not.toHaveBeenCalled();
    expect(f.cashSource).toBe("none");
    expect(f.bankAccounts).toEqual([]);
    expect(f.notes.join(" ")).toMatch(/global-scope/);
  });

  it("prefers a manual starting cash override", async () => {
    const f = await getCashForecast({ scope: entityScope, asOf, startingCashOverride: 100 });
    expect(f.cashSource).toBe("manual");
    expect(f.startingCash).toBe(100);
    expect(mercury.getMercuryAccounts).not.toHaveBeenCalled();
  });

  it("notes when Mercury is not connected", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: false, accounts: [] });
    const f = await getCashForecast({ scope: globalScope, asOf });
    expect(f.cashSource).toBe("none");
    expect(f.notes.join(" ")).toMatch(/not connected/);
  });
});
