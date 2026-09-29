import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getInvoices: vi.fn(),
  getBills: vi.fn(),
  getPurchaseOrders: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getInvoices).mockResolvedValue([
    { id: 1, companyId: 1, invoiceNumber: "INV-1", type: "invoice", status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000", paidAmount: "0", customer: { name: "A" } },
  ] as any);
  vi.mocked(db.getBills).mockResolvedValue([
    { id: 1, companyId: 1, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-08"), totalAmount: "400", amountPaid: "0", purchaseOrderId: 7, vendorName: "V" },
    { id: 2, companyId: 2, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-08"), totalAmount: "9999", amountPaid: "0", vendorName: "Other entity" },
  ] as any);
  vi.mocked(db.getPurchaseOrders).mockResolvedValue([
    { id: 7, companyId: 1, status: "confirmed", orderDate: d("2026-09-01"), totalAmount: "400", vendor: { paymentTerms: 30 } },
  ] as any);
  vi.mocked(db.getRecurringInvoices).mockResolvedValue([] as any);
  vi.mocked(db.getEmployeePayments).mockResolvedValue([] as any);
  vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: true, accounts: [{ name: "Ops", currentBalance: 5000 }] });
});

describe("getCashForecast", () => {
  it("uses the Mercury balance, scopes rows, and skips billed POs", async () => {
    const f = await getCashForecast({ scope: entityScope, asOf });
    expect(f.cashSource).toBe("mercury");
    expect(f.startingCash).toBe(5000);
    expect(f.totalIn).toBe(1000);
    expect(f.totalOut).toBe(400); // other-entity bill and billed PO excluded
    expect(f.endingCash).toBe(5600);
  });

  it("prefers a manual starting cash override", async () => {
    const f = await getCashForecast({ scope: entityScope, asOf, startingCashOverride: 100 });
    expect(f.cashSource).toBe("manual");
    expect(f.startingCash).toBe(100);
    expect(mercury.getMercuryAccounts).not.toHaveBeenCalled();
  });

  it("notes when Mercury is not connected", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: false, accounts: [] });
    const f = await getCashForecast({ scope: entityScope, asOf });
    expect(f.cashSource).toBe("none");
    expect(f.notes.join(" ")).toMatch(/not connected/);
  });
});
