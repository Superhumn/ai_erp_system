import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Mock storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "documents/1/test-key", url: "https://s3.example.com/documents/1/test-key" }),
}));

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  // Dashboard
  getDashboardMetrics: vi.fn().mockResolvedValue({
    revenueThisMonth: "50000",
    invoicesPaid: "35000",
    pendingInvoices: 5,
    openDisputes: 2,
    customers: 25,
    vendors: 10,
    products: 100,
    activeEmployees: 15,
    activeProjects: 8,
    pendingPurchaseOrders: 3,
    activeContracts: 12,
  }),
  // Finance
  getAccounts: vi.fn().mockResolvedValue([
    { id: 1, accountNumber: "ACC-001", name: "Operating Account", type: "asset", balance: "10000", currency: "USD", status: "active", createdAt: new Date() },
  ]),
  createAccount: vi.fn().mockResolvedValue({ id: 1 }),
  getInvoices: vi.fn().mockResolvedValue([
    { id: 1, invoiceNumber: "INV-001", customerId: 1, amount: "1000", status: "pending", dueDate: new Date(), createdAt: new Date() },
  ]),
  createInvoice: vi.fn().mockResolvedValue({ id: 1 }),
  getPayments: vi.fn().mockResolvedValue([]),
  createPayment: vi.fn().mockResolvedValue({ id: 1 }),
  getTransactions: vi.fn().mockResolvedValue([]),
  createTransaction: vi.fn().mockResolvedValue({ id: 1 }),
  // Sales
  getOrders: vi.fn().mockResolvedValue([
    { id: 1, orderNumber: "ORD-001", customerId: 1, total: "500", status: "pending", createdAt: new Date() },
  ]),
  createOrder: vi.fn().mockResolvedValue({ id: 1 }),
  getCustomers: vi.fn().mockResolvedValue([
    { id: 1, customerNumber: "CUST-001", name: "Test Customer", email: "test@example.com", status: "active", createdAt: new Date() },
  ]),
  createCustomer: vi.fn().mockResolvedValue({ id: 1 }),
  // Operations
  getProducts: vi.fn().mockResolvedValue([
    { id: 1, sku: "PROD-001", name: "Test Product", price: "99.99", status: "active", createdAt: new Date() },
  ]),
  createProduct: vi.fn().mockResolvedValue({ id: 1 }),
  getInventory: vi.fn().mockResolvedValue([]),
  createInventoryItem: vi.fn().mockResolvedValue({ id: 1 }),
  getVendors: vi.fn().mockResolvedValue([
    { id: 1, vendorNumber: "VEND-001", name: "Test Vendor", status: "active", createdAt: new Date() },
  ]),
  createVendor: vi.fn().mockResolvedValue({ id: 1 }),
  getPurchaseOrders: vi.fn().mockResolvedValue([]),
  createPurchaseOrder: vi.fn().mockResolvedValue({ id: 1 }),
  getShipments: vi.fn().mockResolvedValue([]),
  createShipment: vi.fn().mockResolvedValue({ id: 1 }),
  // HR
  getEmployees: vi.fn().mockResolvedValue([
    { id: 1, employeeNumber: "EMP-001", firstName: "John", lastName: "Doe", email: "john@example.com", status: "active", createdAt: new Date() },
  ]),
  createEmployee: vi.fn().mockResolvedValue({ id: 1 }),
  // Legal
  getContracts: vi.fn().mockResolvedValue([]),
  createContract: vi.fn().mockResolvedValue({ id: 1 }),
  getDisputes: vi.fn().mockResolvedValue([]),
  createDispute: vi.fn().mockResolvedValue({ id: 1 }),
  getDocuments: vi.fn().mockResolvedValue([]),
  createDocument: vi.fn().mockResolvedValue({ id: 1 }),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  // Projects
  getProjects: vi.fn().mockResolvedValue([
    { id: 1, projectNumber: "PROJ-001", name: "Test Project", status: "active", priority: "medium", createdAt: new Date() },
  ]),
  createProject: vi.fn().mockResolvedValue({ id: 1 }),
  // Audit
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  // AI
  createAIConversation: vi.fn().mockResolvedValue({ id: 1 }),
  getAIConversations: vi.fn().mockResolvedValue([]),
  addAIMessage: vi.fn().mockResolvedValue({ id: 1 }),
  getAIMessages: vi.fn().mockResolvedValue([]),
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

function createUserContext(role: "admin" | "user" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role,
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

describe("ERP System - Dashboard", () => {
  it("should return dashboard metrics for authenticated users", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const metrics = await caller.dashboard.metrics();

    expect(metrics).toBeDefined();
    expect(metrics.revenueThisMonth).toBe("50000");
    expect(metrics.pendingInvoices).toBe(5);
    expect(metrics.customers).toBe(25);
    expect(metrics.activeProjects).toBe(8);
  });
});

describe("ERP System - Finance Module", () => {
  it("should list accounts", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const accounts = await caller.accounts.list();

    expect(accounts).toBeDefined();
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0].accountNumber).toBe("ACC-001");
  });

  it("should list invoices", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const invoices = await caller.invoices.list();

    expect(invoices).toBeDefined();
    expect(Array.isArray(invoices)).toBe(true);
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices[0].invoiceNumber).toBe("INV-001");
  });
});

describe("ERP System - Sales Module", () => {
  it("should list orders", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const orders = await caller.orders.list();

    expect(orders).toBeDefined();
    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].orderNumber).toBe("ORD-001");
  });

  it("should list customers", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const customers = await caller.customers.list();

    expect(customers).toBeDefined();
    expect(Array.isArray(customers)).toBe(true);
    expect(customers.length).toBeGreaterThan(0);
    expect(customers[0].customerNumber).toBe("CUST-001");
  });
});

describe("ERP System - Operations Module", () => {
  it("should list products", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const products = await caller.products.list();

    expect(products).toBeDefined();
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].sku).toBe("PROD-001");
  });

  it("should list vendors", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const vendors = await caller.vendors.list();

    expect(vendors).toBeDefined();
    expect(Array.isArray(vendors)).toBe(true);
    expect(vendors.length).toBeGreaterThan(0);
    expect(vendors[0].vendorNumber).toBe("VEND-001");
  });
});

describe("ERP System - HR Module", () => {
  it("should list employees", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const employees = await caller.employees.list();

    expect(employees).toBeDefined();
    expect(Array.isArray(employees)).toBe(true);
    expect(employees.length).toBeGreaterThan(0);
    expect(employees[0].employeeNumber).toBe("EMP-001");
  });
});

describe("ERP System - Projects Module", () => {
  it("should list projects", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const projects = await caller.projects.list();

    expect(projects).toBeDefined();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].projectNumber).toBe("PROJ-001");
  });
});

describe("ERP System - Authentication", () => {
  it("should return user info for authenticated users", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const user = await caller.auth.me();

    expect(user).toBeDefined();
    expect(user?.email).toBe("admin@example.com");
    expect(user?.role).toBe("admin");
  });

  it("should handle logout", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
  });
});

describe("ERP System - Document Upload", () => {
  it("should upload an invoice document with valid mimeType", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Simulate a small PDF file as base64
    const fakeBase64 = Buffer.from("fake invoice pdf content").toString("base64");

    const result = await caller.documents.upload({
      name: "Invoice-2024-001.pdf",
      type: "invoice",
      description: "Test invoice upload",
      fileData: fakeBase64,
      mimeType: "application/pdf",
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it("should upload a document with empty mimeType and fallback to application/octet-stream", async () => {
    const { storagePut } = await import("./storage");
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const fakeBase64 = Buffer.from("unknown file content").toString("base64");

    const result = await caller.documents.upload({
      name: "invoice-scan",
      type: "invoice",
      fileData: fakeBase64,
      mimeType: "",
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    // Verify storagePut was called with the fallback content type
    expect(storagePut).toHaveBeenCalledWith(
      expect.stringContaining("documents/"),
      expect.any(Buffer),
      "application/octet-stream",
    );
  });

  it("should list documents", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const documents = await caller.documents.list();

    expect(documents).toBeDefined();
    expect(Array.isArray(documents)).toBe(true);
  });
});
