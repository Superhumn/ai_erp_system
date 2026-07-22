import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter, detectSheetType } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// In-memory store backing the mocked syncLog helpers so the background-job
// procedures (create → update → poll) behave end-to-end in tests.
const { syncLogStore } = vi.hoisted(() => ({ syncLogStore: [] as any[] }));

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
  // Google Drive background-sync helpers
  getGoogleOAuthToken: vi.fn().mockResolvedValue({
    accessToken: "tok",
    refreshToken: "refresh",
    expiresAt: new Date(Date.now() + 3_600_000),
    googleEmail: "admin@example.com",
  }),
  createSyncLog: vi.fn(async (data: any) => {
    const id = syncLogStore.length + 1;
    syncLogStore.push({ id, createdAt: new Date(), ...data });
    return { id };
  }),
  updateSyncLog: vi.fn(async (id: number, data: any) => {
    const row = syncLogStore.find((r) => r.id === id);
    if (row) Object.assign(row, data);
  }),
  getSyncLog: vi.fn(async (id: number) => syncLogStore.find((r) => r.id === id) ?? null),
  getSyncHistory: vi.fn(async () => [...syncLogStore].reverse()),
  getPendingSyncLogs: vi.fn(async (integration: string, limit = 50) =>
    [...syncLogStore]
      .reverse()
      .filter((r) => r.integration === integration && r.status === "pending")
      .slice(0, limit)),
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

  it("coerces typed customer fields and persists them", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.sheetsImport.importData({
      targetModule: "customers",
      data: [{ Name: "Acme", Kind: "Business", Credit: "$50,000", Terms: "45" }],
      columnMapping: { Name: "name", Kind: "type", Credit: "creditLimit", Terms: "paymentTerms" },
    });

    expect(result.imported).toBe(1);
    expect(db.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme", type: "business", creditLimit: "50000", paymentTerms: 45 }),
    );
  });

  it("maps a Job Title column to the jobTitle column (not a dropped key)", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.sheetsImport.importData({
      targetModule: "employees",
      data: [{ First: "John", Last: "Doe", "Job Title": "Engineer" }],
      columnMapping: { First: "firstName", Last: "lastName", "Job Title": "jobTitle" },
    });

    expect(result.imported).toBe(1);
    expect(db.createEmployee).toHaveBeenCalledWith(expect.objectContaining({ jobTitle: "Engineer" }));
  });

  it("derives invoice subtotal/total from amount and coerces customerId", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.sheetsImport.importData({
      targetModule: "invoices",
      data: [{ Cust: "7", Total: "$1,250.00" }],
      columnMapping: { Cust: "customerId", Total: "amount" },
    });

    expect(result.imported).toBe(1);
    expect(db.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 7, subtotal: "1250.00", totalAmount: "1250.00" }),
    );
    // The synthetic `amount` key must not leak onto the invoice insert.
    expect((db.createInvoice as any).mock.calls[0][0]).not.toHaveProperty("amount");
  });

  it("rejects a row with an invalid enum value", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.sheetsImport.importData({
      targetModule: "customers",
      data: [{ Name: "Acme", Kind: "platinum" }],
      columnMapping: { Name: "name", Kind: "type" },
    });

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
  });
});

describe("Google Drive background import job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncLogStore.length = 0;
    // Drive file-listing returns no spreadsheets, so the job finishes quickly.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [] }),
    }) as any;
  });

  it("starts a job that runs to completion detached from the request", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    const { jobId } = await caller.sheetsImport.startSyncGoogleDrive({});
    expect(typeof jobId).toBe("number");
    // A job row is created up front — this is what the client polls / reconnects to.
    expect(syncLogStore.find((r) => r.id === jobId)).toBeTruthy();

    // The detached runner eventually flips it to a terminal state.
    await vi.waitFor(() => {
      expect(syncLogStore.find((r) => r.id === jobId)?.status).not.toBe("pending");
    });

    const status = await caller.sheetsImport.getSyncStatus({ jobId });
    expect(status?.state).toBe("done");
  });

  it("does not leak another user's job through getSyncStatus", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const { jobId } = await caller.sheetsImport.startSyncGoogleDrive({});
    await vi.waitFor(() => {
      expect(syncLogStore.find((r) => r.id === jobId)?.status).not.toBe("pending");
    });

    // Same procedure, different user id → should not see job owned by user 1.
    const otherCtx = createAdminContext();
    (otherCtx.user as any).id = 999;
    const otherCaller = appRouter.createCaller(otherCtx);
    expect(await otherCaller.sheetsImport.getSyncStatus({ jobId })).toBeNull();
  });

  it("getSyncStatus fails closed for logs that aren't the caller's Drive job", async () => {
    // A log from another integration with no owner in metadata must never leak.
    syncLogStore.push({
      id: 7,
      integration: "shopify",
      action: "product_sync",
      status: "success",
      createdAt: new Date(),
      metadata: { results: [{ sheet: "secret", type: "products", imported: 5, errors: [] }] },
    });

    const caller = appRouter.createCaller(createAdminContext());
    expect(await caller.sheetsImport.getSyncStatus({ jobId: 7 })).toBeNull();
  });

  it("getActiveSync reconnects to a still-running job on page load", async () => {
    // Seed a running job for user 1 (as startSyncGoogleDrive would leave it mid-run).
    syncLogStore.push({
      id: 42,
      integration: "google_drive",
      action: "full_sync",
      status: "pending",
      createdAt: new Date(),
      metadata: { status: "running", userId: 1, results: [], totalSheets: 3, processedSheets: 1, currentFile: "Vendors.csv" },
    });

    const caller = appRouter.createCaller(createAdminContext());
    const active = await caller.sheetsImport.getActiveSync();
    expect(active?.jobId).toBe(42);
    expect(active?.totalSheets).toBe(3);
    expect(active?.currentFile).toBe("Vendors.csv");
  });
});
