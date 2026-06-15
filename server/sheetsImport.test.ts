import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter, detectSheetType } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createCustomer: vi.fn().mockResolvedValue({ id: 1 }),
  createVendor: vi.fn().mockResolvedValue({ id: 1 }),
  createProduct: vi.fn().mockResolvedValue({ id: 1 }),
  createEmployee: vi.fn().mockResolvedValue({ id: 1 }),
  createInvoice: vi.fn().mockResolvedValue({ id: 1 }),
  createContract: vi.fn().mockResolvedValue({ id: 1 }),
  createProject: vi.fn().mockResolvedValue({ id: 1 }),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
}));

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("detectSheetType (Drive auto-sync detection)", () => {
  // Headers arrive lowercased/trimmed, matching the server read path.
  it("detects supported types from header keywords", () => {
    expect(detectSheetType(["vendor name", "email"])).toBe("vendors");
    expect(detectSheetType(["customer", "phone"])).toBe("customers");
    expect(detectSheetType(["sku", "price"])).toBe("products");
    expect(detectSheetType(["first name", "last name", "employee id"])).toBe("employees");
    expect(detectSheetType(["ingredient", "unit cost"])).toBe("raw_materials");
    expect(detectSheetType(["contact name", "lead source"])).toBe("crm_contacts");
    expect(detectSheetType(["investor", "commitment"])).toBe("fundraising");
  });

  it("returns non-importable markers for ambiguous/unsupported sheets", () => {
    expect(detectSheetType(["random", "columns"])).toBe("unknown");
    expect(detectSheetType(["invoice number", "bill to"])).toBe("invoices");
    expect(detectSheetType(["purchase order", "po number"])).toBe("purchase_orders");
  });
});

describe("Google Sheets Import - Data Import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should import customer data successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "customers",
      data: [
        { "Company Name": "Acme Corp", "Email": "contact@acme.com", "Phone": "555-1234" },
        { "Company Name": "Beta Inc", "Email": "info@beta.com", "Phone": "555-5678" },
      ],
      columnMapping: {
        "Company Name": "name",
        "Email": "email",
        "Phone": "phone",
      },
    });

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when required fields are missing", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "customers",
      data: [
        { "Email": "contact@acme.com" }, // Missing name
      ],
      columnMapping: {
        "Email": "email",
      },
    });

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should import vendor data successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "vendors",
      data: [
        { "Vendor Name": "Supplier Co", "Contact Email": "sales@supplier.com" },
      ],
      columnMapping: {
        "Vendor Name": "name",
        "Contact Email": "email",
      },
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("should import product data successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "products",
      data: [
        { "Product Name": "Widget A", "SKU": "WID-001", "Price": "29.99" },
        { "Product Name": "Widget B", "SKU": "WID-002", "Price": "39.99" },
      ],
      columnMapping: {
        "Product Name": "name",
        "SKU": "sku",
        "Price": "price",
      },
    });

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("should import employee data successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "employees",
      data: [
        { "First": "John", "Last": "Doe", "Email": "john@company.com" },
      ],
      columnMapping: {
        "First": "firstName",
        "Last": "lastName",
        "Email": "email",
      },
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("should fail employee import when firstName or lastName is missing", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "employees",
      data: [
        { "First": "John" }, // Missing lastName
      ],
      columnMapping: {
        "First": "firstName",
      },
    });

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("should import project data successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "projects",
      data: [
        { "Project": "Website Redesign", "Description": "Redesign company website" },
      ],
      columnMapping: {
        "Project": "name",
        "Description": "description",
      },
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("should import contract data successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheetsImport.importData({
      targetModule: "contracts",
      data: [
        { "Contract Title": "Service Agreement", "Party": "Acme Corp" },
      ],
      columnMapping: {
        "Contract Title": "title",
        "Party": "partyName",
      },
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });
});
