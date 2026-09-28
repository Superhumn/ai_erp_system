import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers/index";
import { importDriveFiles } from "./routers/_shared";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Regression coverage for a batch of router-level access / data-integrity fixes:
//   ai.getConversation / ai.chat        — conversation must belong to the caller
//   customers.create/update/delete     — entity-scoped like list/get
//   crm.contacts.deleteAll/deletePlaceholders, aiAgent.tasks.bulkDelete, capTable.* mutations — admin only
//   aiAgent.tasks.execute create_product — products.sku is NOT NULL
//   importDriveFiles                    — imported rows carry the importer's companyId
//   customs.clearances.update           — PO lines with no product are skipped on receipt
//   copackerPortal.createInvoice/uploadShippingDocument — admin/ops fall back to a warehouse
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  // scopedProcedure deps (global users need none of the lookups; entity users hit the first one)
  getUserEntityAccessCompanyIds: vi.fn().mockResolvedValue([]),
  getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
  getCompanyById: vi.fn().mockResolvedValue(undefined),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
  // ai
  getAiConversationById: vi.fn(),
  getAiMessages: vi.fn().mockResolvedValue([]),
  createAiMessage: vi.fn().mockResolvedValue({ id: 1 }),
  getDashboardMetrics: vi.fn().mockResolvedValue({}),
  updateAiConversation: vi.fn(),
  // customers
  getCustomerById: vi.fn(),
  createCustomer: vi.fn().mockResolvedValue({ id: 11 }),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  // crm / aiAgent / capTable admin gates
  deleteAllCrmContacts: vi.fn().mockResolvedValue(3),
  bulkDeleteAiAgentTasks: vi.fn().mockResolvedValue(3),
  createShareClass: vi.fn().mockResolvedValue({ id: 1 }),
  createStakeholder: vi.fn().mockResolvedValue({ id: 1 }),
  createValuation: vi.fn().mockResolvedValue({ id: 1 }),
  // aiAgent.tasks.execute
  getAiAgentTaskById: vi.fn(),
  updateAiAgentTask: vi.fn(),
  createAiAgentLog: vi.fn(),
  createProduct: vi.fn().mockResolvedValue({ id: 5 }),
  // importDriveFiles
  createVendor: vi.fn().mockResolvedValue({ id: 1 }),
  createEmployee: vi.fn().mockResolvedValue({ id: 1 }),
  createRawMaterial: vi.fn().mockResolvedValue({ id: 1 }),
  // customs
  getCustomsClearanceById: vi.fn(),
  getShipmentById: vi.fn(),
  getPurchaseOrderItems: vi.fn(),
  getInventory: vi.fn().mockResolvedValue([]),
  createInventory: vi.fn().mockResolvedValue({ id: 1 }),
  updateInventory: vi.fn(),
  createInventoryTransaction: vi.fn().mockResolvedValue({ id: 1 }),
  updatePurchaseOrderItem: vi.fn(),
  updateShipment: vi.fn(),
  updateCustomsClearance: vi.fn(),
  // copackerPortal
  getWarehouses: vi.fn().mockResolvedValue([{ id: 42, name: "Main" }]),
  createCopackerInvoice: vi.fn().mockResolvedValue({ id: 1 }),
  createCopackerInvoiceItem: vi.fn().mockResolvedValue({ id: 1 }),
  getInventoryCostLayers: vi.fn().mockResolvedValue([]),
  createCopackerShippingDocument: vi.fn().mockResolvedValue({ id: 2 }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "k", url: "https://storage.example/k" }),
}));

import * as db from "./db";

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "admin",
      companyId: null,
      regionScope: "global",
      linkedWarehouseId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const caller = (user: Partial<AuthenticatedUser> = {}) => appRouter.createCaller(ctxFor(user));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ai conversations are private to their owner", () => {
  it("getConversation rejects another user's conversation as NOT_FOUND", async () => {
    vi.mocked(db.getAiConversationById).mockResolvedValue({ id: 7, userId: 99 } as any);
    await expect(caller({ id: 1 }).ai.getConversation({ id: 7 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.getAiMessages).not.toHaveBeenCalled();
  });

  it("getConversation returns the caller's own conversation", async () => {
    vi.mocked(db.getAiConversationById).mockResolvedValue({ id: 7, userId: 1 } as any);
    const result = await caller({ id: 1 }).ai.getConversation({ id: 7 });
    expect(result).toMatchObject({ id: 7, userId: 1, messages: [] });
  });

  it("chat refuses to append to another user's conversation before saving anything", async () => {
    vi.mocked(db.getAiConversationById).mockResolvedValue({ id: 7, userId: 99 } as any);
    await expect(caller({ id: 1 }).ai.chat({ conversationId: 7, message: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.createAiMessage).not.toHaveBeenCalled();
  });
});

describe("customers mutations are entity-scoped", () => {
  const entityUser = { id: 2, role: "sales", companyId: 2, regionScope: "entity" } as Partial<AuthenticatedUser>;

  it("update forwards the caller's scope to the lookup and refuses an out-of-scope customer", async () => {
    vi.mocked(db.getCustomerById).mockResolvedValue(undefined);
    await expect(caller(entityUser).customers.update({ id: 5, name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.getCustomerById).toHaveBeenCalledWith(5, expect.objectContaining({ mode: "entity", companyIds: [2] }));
    expect(db.updateCustomer).not.toHaveBeenCalled();
  });

  it("delete refuses an out-of-scope customer", async () => {
    vi.mocked(db.getCustomerById).mockResolvedValue(undefined);
    await expect(caller(entityUser).customers.delete({ id: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.deleteCustomer).not.toHaveBeenCalled();
  });

  it("update/delete proceed for an in-scope customer", async () => {
    vi.mocked(db.getCustomerById).mockResolvedValue({ id: 5, companyId: 2 } as any);
    await caller(entityUser).customers.update({ id: 5, name: "X" });
    expect(db.updateCustomer).toHaveBeenCalledWith(5, { name: "X" });
    await caller(entityUser).customers.delete({ id: 5 });
    expect(db.deleteCustomer).toHaveBeenCalledWith(5);
  });

  it("create rejects a companyId outside the caller's scope", async () => {
    await expect(caller(entityUser).customers.create({ name: "Acme", companyId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.createCustomer).not.toHaveBeenCalled();
  });

  it("create defaults companyId to the caller's home entity", async () => {
    await caller(entityUser).customers.create({ name: "Acme" });
    expect(db.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme", companyId: 2 }));
  });
});

describe("destructive bulk procedures are admin-only", () => {
  it("crm.contacts.deleteAll / deletePlaceholders reject a non-admin", async () => {
    await expect(caller({ role: "vendor" }).crm.contacts.deleteAll()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller({ role: "sales" }).crm.contacts.deletePlaceholders()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.deleteAllCrmContacts).not.toHaveBeenCalled();
    expect(db.getDb).not.toHaveBeenCalled();
  });

  it("aiAgent.tasks.bulkDelete rejects a non-admin", async () => {
    await expect(caller({ role: "ops" }).aiAgent.tasks.bulkDelete({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.bulkDeleteAiAgentTasks).not.toHaveBeenCalled();
  });

  it("capTable mutations and generateReport reject a non-admin", async () => {
    const investor = caller({ role: "investor" });
    await expect(investor.capTable.shareClasses.create({ name: "Common", type: "common" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(investor.capTable.stakeholders.deletePlaceholders()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(investor.capTable.valuations.create({ valuationDate: new Date(), preMoneyValuation: "1", pricePerShare: "1" } as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(investor.capTable.generateReport({} as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.createShareClass).not.toHaveBeenCalled();
    expect(db.createStakeholder).not.toHaveBeenCalled();
    expect(db.createValuation).not.toHaveBeenCalled();
  });

  it("capTable shareClasses.create still works for an admin", async () => {
    await caller({ role: "admin" }).capTable.shareClasses.create({ name: "Common", type: "common" });
    expect(db.createShareClass).toHaveBeenCalledTimes(1);
  });
});

describe("aiAgent.tasks.execute create_product", () => {
  it("generates a SKU when the task did not supply one (products.sku is NOT NULL)", async () => {
    vi.mocked(db.getAiAgentTaskById).mockResolvedValue({
      id: 3,
      status: "approved",
      taskType: "create_product",
      taskData: JSON.stringify({ name: "Hemp Bar" }),
      retryCount: 0,
    } as any);

    const result = await caller({ role: "admin" }).aiAgent.tasks.execute({ id: 3 });

    expect(result.success).toBe(true);
    const inserted = vi.mocked(db.createProduct).mock.calls[0][0];
    expect(inserted.name).toBe("Hemp Bar");
    expect(typeof inserted.sku).toBe("string");
    expect(inserted.sku).toMatch(/^PROD-/);
  });

  it("keeps a supplied SKU", async () => {
    vi.mocked(db.getAiAgentTaskById).mockResolvedValue({
      id: 3,
      status: "approved",
      taskType: "create_product",
      taskData: JSON.stringify({ name: "Hemp Bar", sku: "HB-1" }),
      retryCount: 0,
    } as any);
    await caller({ role: "admin" }).aiAgent.tasks.execute({ id: 3 });
    expect(db.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: "HB-1" }));
  });
});

describe("importDriveFiles scopes imported rows to the importer's company", () => {
  function mockDrive(sheetName: string, rows: string[][]) {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes("drive/v3/files")) {
        return { ok: true, json: async () => ({ files: [{ id: "f1", name: sheetName, mimeType: "application/vnd.google-apps.spreadsheet" }] }) } as any;
      }
      return { ok: true, json: async () => ({ values: rows }) } as any;
    }) as any;
  }

  const run = () => importDriveFiles({ userId: 1, companyId: 4, accessToken: "tok", forcedTypes: null });

  it("vendors", async () => {
    mockDrive("Vendors", [["Vendor Name", "Email"], ["Pacific Foods", "a@b.c"]]);
    const { results } = await run();
    expect(results[0]).toMatchObject({ type: "vendors", imported: 1 });
    expect(db.createVendor).toHaveBeenCalledWith(expect.objectContaining({ name: "Pacific Foods", companyId: 4 }));
  });

  it("customers", async () => {
    mockDrive("Customers", [["Customer", "Phone"], ["Acme", "555"]]);
    await run();
    expect(db.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme", companyId: 4 }));
  });

  it("products", async () => {
    mockDrive("Products", [["SKU", "Price", "Name"], ["P-1", "9.99", "Bar"]]);
    await run();
    expect(db.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: "P-1", companyId: 4 }));
  });

  it("employees", async () => {
    mockDrive("Staff", [["First Name", "Last Name", "Employee ID"], ["Ada", "Lovelace", "7"]]);
    await run();
    expect(db.createEmployee).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Ada", companyId: 4 }));
  });

  it("raw materials", async () => {
    mockDrive("Ingredients", [["Ingredient", "Unit Cost"], ["Hemp", "2.50"]]);
    await run();
    expect(db.createRawMaterial).toHaveBeenCalledWith(expect.objectContaining({ name: "Hemp", companyId: 4 }));
  });

  it("writes NULL when the importer has no company", async () => {
    mockDrive("Vendors", [["Vendor Name", "Email"], ["Pacific Foods", "a@b.c"]]);
    await importDriveFiles({ userId: 1, accessToken: "tok", forcedTypes: null });
    expect(db.createVendor).toHaveBeenCalledWith(expect.objectContaining({ companyId: null }));
  });
});

describe("customs.clearances.update inventory receipt on 'cleared'", () => {
  it("skips PO lines with no product instead of receiving them against an unrelated row", async () => {
    vi.mocked(db.getCustomsClearanceById).mockResolvedValue({ id: 1, status: "under_review", shipmentId: 5 } as any);
    vi.mocked(db.getShipmentById).mockResolvedValue({ id: 5, purchaseOrderId: 9, companyId: 1 } as any);
    vi.mocked(db.getPurchaseOrderItems).mockResolvedValue([
      { id: 101, productId: null, quantity: "10" },
      { id: 102, productId: 7, quantity: "3" },
    ] as any);
    vi.mocked(db.getInventory).mockResolvedValue([]);

    await caller({ role: "ops" }).customs.clearances.update({ id: 1, status: "cleared", warehouseId: 3 });

    // Only the product line is looked up / received; the productless line never reaches
    // getInventory (which would match every row in the warehouse with productId undefined).
    expect(db.getInventory).toHaveBeenCalledTimes(1);
    expect(db.getInventory).toHaveBeenCalledWith(undefined, { productId: 7, warehouseId: 3 });
    expect(db.createInventoryTransaction).toHaveBeenCalledTimes(1);
    expect(db.createInventoryTransaction).toHaveBeenCalledWith(expect.objectContaining({ productId: 7, quantity: "3" }));
    expect(db.updatePurchaseOrderItem).toHaveBeenCalledTimes(1);
    expect(db.updatePurchaseOrderItem).toHaveBeenCalledWith(102, { receivedQuantity: "3" });
    expect(db.updateShipment).toHaveBeenCalledWith(5, { status: "delivered" });
    expect(db.updateCustomsClearance).toHaveBeenCalledWith(1, { status: "cleared" });
  });
});

describe("copackerPortal warehouse fallback for admin/ops callers", () => {
  it("createInvoice uses the first warehouse when the caller has none linked", async () => {
    const result = await caller({ role: "admin", linkedWarehouseId: null }).copackerPortal.createInvoice({
      invoiceNumber: "INV-1",
      invoiceDate: "2026-09-01",
      items: [{ description: "Packing", quantity: "1", unitPrice: "10", totalAmount: "10" }],
    });
    expect(result).toMatchObject({ id: 1 });
    expect(db.getWarehouses).toHaveBeenCalledTimes(1);
    expect(db.createCopackerInvoice).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: 42, invoiceNumber: "INV-1" }));
  });

  it("uploadShippingDocument uses the first warehouse when the caller has none linked", async () => {
    const result = await caller({ role: "ops", linkedWarehouseId: null }).copackerPortal.uploadShippingDocument({
      documentType: "packing_list",
      name: "pl.pdf",
      fileData: Buffer.from("x").toString("base64"),
      mimeType: "application/pdf",
    });
    expect(result).toMatchObject({ id: 2 });
    expect(db.createCopackerShippingDocument).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: 42, name: "pl.pdf" }));
  });

  it("a copacker with no linked warehouse is still refused", async () => {
    await expect(
      caller({ role: "copacker", linkedWarehouseId: null }).copackerPortal.uploadShippingDocument({
        documentType: "packing_list",
        name: "pl.pdf",
        fileData: Buffer.from("x").toString("base64"),
        mimeType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getWarehouses).not.toHaveBeenCalled();
  });

  it("fails with PRECONDITION_FAILED when no warehouse exists at all", async () => {
    vi.mocked(db.getWarehouses).mockResolvedValueOnce([]);
    await expect(
      caller({ role: "admin", linkedWarehouseId: null }).copackerPortal.createInvoice({
        invoiceNumber: "INV-1",
        invoiceDate: "2026-09-01",
        items: [],
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.createCopackerInvoice).not.toHaveBeenCalled();
  });
});
