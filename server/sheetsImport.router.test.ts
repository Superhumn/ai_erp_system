import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Regression coverage for appRouter.sheetsImport.importData: rows written by the
// spreadsheet importer carry the importer's entity (otherwise the entity-scoped
// list pages never show them), and per-row errors say which row failed.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createCustomer: vi.fn().mockResolvedValue({ id: 1 }),
  createVendor: vi.fn().mockResolvedValue({ id: 2 }),
  createProduct: vi.fn().mockResolvedValue({ id: 3 }),
  createEmployee: vi.fn().mockResolvedValue({ id: 4 }),
  createInvoice: vi.fn().mockResolvedValue({ id: 5 }),
  createContract: vi.fn().mockResolvedValue({ id: 6 }),
}));

import * as db from "./db";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
type Mock = ReturnType<typeof vi.fn>;
const firstArg = (fn: unknown) => (fn as Mock).mock.calls[0][0];

function ctxFor(user: Partial<AuthenticatedUser> = {}): TrpcContext {
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

describe("sheetsImport.importData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps the importer's companyId on customers, vendors, products, employees, invoices and contracts", async () => {
    const caller = appRouter.createCaller(ctxFor({ companyId: 7 }));

    await caller.sheetsImport.importData({ targetModule: "customers", data: [{ Name: "Cust A" }], columnMapping: { Name: "name" } });
    expect(firstArg(db.createCustomer)).toMatchObject({ name: "Cust A", companyId: 7 });

    await caller.sheetsImport.importData({ targetModule: "vendors", data: [{ Vendor: "Vend A", Terms: "45" }], columnMapping: { Vendor: "name", Terms: "paymentTerms" } });
    expect(firstArg(db.createVendor)).toMatchObject({ name: "Vend A", paymentTerms: 45, companyId: 7 });

    await caller.sheetsImport.importData({ targetModule: "products", data: [{ Product: "Prod A", Price: "$1,200.50" }], columnMapping: { Product: "name", Price: "unitPrice" } });
    expect(firstArg(db.createProduct)).toMatchObject({ name: "Prod A", unitPrice: "1200.50", companyId: 7 });
    expect(firstArg(db.createProduct).sku).toMatch(/^PROD/);

    await caller.sheetsImport.importData({ targetModule: "employees", data: [{ First: "Ann", Last: "Lee", Start: "2026-02-01" }], columnMapping: { First: "firstName", Last: "lastName", Start: "hireDate" } });
    expect(firstArg(db.createEmployee)).toMatchObject({ firstName: "Ann", lastName: "Lee", companyId: 7 });
    expect(firstArg(db.createEmployee).hireDate).toBeInstanceOf(Date);

    await caller.sheetsImport.importData({ targetModule: "invoices", data: [{ Cust: "12", Total: "99.5" }], columnMapping: { Cust: "customerId", Total: "amount" } });
    expect(firstArg(db.createInvoice)).toMatchObject({ customerId: 12, subtotal: "99.5", totalAmount: "99.5", companyId: 7, createdBy: 5 });
    expect(firstArg(db.createInvoice)).not.toHaveProperty("amount");

    await caller.sheetsImport.importData({ targetModule: "contracts", data: [{ Title: "MSA" }], columnMapping: { Title: "title" } });
    expect(firstArg(db.createContract)).toMatchObject({ title: "MSA", type: "service", companyId: 7 });
  });

  it("leaves companyId unset for a user with no home entity", async () => {
    const caller = appRouter.createCaller(ctxFor({ companyId: null as unknown as number }));
    await caller.sheetsImport.importData({ targetModule: "customers", data: [{ Name: "Cust A" }], columnMapping: { Name: "name" } });
    expect(firstArg(db.createCustomer).companyId).toBeUndefined();
  });

  it("reports validation and insert failures per spreadsheet row, and keeps importing the rest", async () => {
    vi.mocked(db.createCustomer).mockRejectedValueOnce(new Error("Duplicate entry"));
    const caller = appRouter.createCaller(ctxFor());
    const result = await caller.sheetsImport.importData({
      targetModule: "customers",
      data: [
        { Name: "Dup" },                 // row 2: insert throws
        { Name: "", Terms: "30" },       // row 3: missing required name
        { Name: "Ok", Terms: "soon" },   // row 4: bad int
        { Name: "Good", Terms: "30" },   // row 5: fine
      ],
      columnMapping: { Name: "name", Terms: "paymentTerms" },
    });
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(3);
    expect(result.errors).toEqual([
      "Row 2: Duplicate entry",
      "Row 3: Missing required field: Name",
      expect.stringMatching(/^Row 4: "Payment terms \(days\)" must be a whole number/),
    ]);
  });
});
