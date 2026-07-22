import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(userOverrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "vendor",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    linkedVendorId: 1,
    ...userOverrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("vendorPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCustomsClearances", () => {
    it("should return customs clearances for vendor's shipments", async () => {
      const ctx = createMockContext({ role: "vendor", linkedVendorId: 1 });
      const caller = appRouter.createCaller(ctx);

      // Mock database calls
      vi.spyOn(db, "getCustomsClearances").mockResolvedValue([
        {
          id: 1,
          clearanceNumber: "CC-2026-00001",
          shipmentId: 1,
          type: "import" as const,
          status: "pending_documents" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          id: 2,
          clearanceNumber: "CC-2026-00002",
          shipmentId: 2,
          type: "import" as const,
          status: "cleared" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      vi.spyOn(db, "getPurchaseOrders").mockResolvedValue([
        { id: 1, vendorId: 1 } as any,
        { id: 2, vendorId: 2 } as any,
      ]);

      vi.spyOn(db, "getShipments").mockResolvedValue([
        { id: 1, purchaseOrderId: 1 } as any,
        { id: 2, purchaseOrderId: 2 } as any,
        { id: 3, purchaseOrderId: 1 } as any,
      ]);

      const result = await caller.vendorPortal.getCustomsClearances();

      // Vendor should only see clearances for shipments related to their POs
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);
      expect(result[0]?.shipmentId).toBe(1);
    });

    it("should return all customs clearances for admin users", async () => {
      const ctx = createMockContext({ role: "admin", linkedVendorId: undefined });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearances").mockResolvedValue([
        {
          id: 1,
          clearanceNumber: "CC-2026-00001",
          shipmentId: 1,
          type: "import" as const,
          status: "pending_documents" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          id: 2,
          clearanceNumber: "CC-2026-00002",
          shipmentId: 2,
          type: "export" as const,
          status: "cleared" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      const result = await caller.vendorPortal.getCustomsClearances();

      // Admin should see all clearances
      expect(result).toHaveLength(2);
    });
  });

  describe("getCustomsDocuments", () => {
    it("should allow vendor to view documents for their clearances", async () => {
      const ctx = createMockContext({ role: "vendor", linkedVendorId: 1 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
        id: 1,
        clearanceNumber: "CC-2026-00001",
        shipmentId: 1,
        type: "import" as const,
        status: "pending_documents" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(db, "getShipmentById").mockResolvedValue({
        id: 1,
        purchaseOrderId: 1,
      } as any);

      vi.spyOn(db, "getPurchaseOrderById").mockResolvedValue({
        id: 1,
        vendorId: 1,
      } as any);

      vi.spyOn(db, "getCustomsDocuments").mockResolvedValue([
        {
          id: 1,
          clearanceId: 1,
          documentType: "commercial_invoice" as const,
          name: "invoice.pdf",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      const result = await caller.vendorPortal.getCustomsDocuments({ clearanceId: 1 });

      expect(result).toHaveLength(1);
      expect(result[0]?.documentType).toBe("commercial_invoice");
    });

    it("should deny vendor access to other vendors' clearances", async () => {
      const ctx = createMockContext({ role: "vendor", linkedVendorId: 1 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
        id: 2,
        clearanceNumber: "CC-2026-00002",
        shipmentId: 2,
        type: "import" as const,
        status: "pending_documents" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(db, "getShipmentById").mockResolvedValue({
        id: 2,
        purchaseOrderId: 2,
      } as any);

      vi.spyOn(db, "getPurchaseOrderById").mockResolvedValue({
        id: 2,
        vendorId: 2, // Different vendor
      } as any);

      await expect(
        caller.vendorPortal.getCustomsDocuments({ clearanceId: 2 })
      ).rejects.toThrow("You do not have access to this customs clearance");
    });

    it("should deny vendor access to clearances without shipmentId", async () => {
      const ctx = createMockContext({ role: "vendor", linkedVendorId: 1 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
        id: 3,
        clearanceNumber: "CC-2026-00003",
        shipmentId: null, // No shipment
        type: "import" as const,
        status: "pending_documents" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await expect(
        caller.vendorPortal.getCustomsDocuments({ clearanceId: 3 })
      ).rejects.toThrow("You do not have access to this customs clearance");
    });

    it("should deny vendor access to clearances with shipments without purchase orders", async () => {
      const ctx = createMockContext({ role: "vendor", linkedVendorId: 1 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
        id: 4,
        clearanceNumber: "CC-2026-00004",
        shipmentId: 4,
        type: "import" as const,
        status: "pending_documents" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(db, "getShipmentById").mockResolvedValue({
        id: 4,
        purchaseOrderId: null, // No purchase order
      } as any);

      await expect(
        caller.vendorPortal.getCustomsDocuments({ clearanceId: 4 })
      ).rejects.toThrow("You do not have access to this customs clearance");
    });
  });
});

describe("copackerPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCustomsClearances", () => {
    it("should return customs clearances for copacker's warehouse", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: 1 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearances").mockResolvedValue([
        {
          id: 1,
          clearanceNumber: "CC-2026-00001",
          shipmentId: 1,
          type: "import" as const,
          status: "pending_documents" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          id: 2,
          clearanceNumber: "CC-2026-00002",
          shipmentId: 2,
          type: "import" as const,
          status: "cleared" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      vi.spyOn(db, "getShipments").mockResolvedValue([
        { id: 1, type: "inbound", purchaseOrderId: 101 } as any,
        { id: 2, type: "inbound", purchaseOrderId: 102 } as any,
      ]);

      const result = await caller.copackerPortal.getCustomsClearances();

      // Copacker should see clearances for available shipments
      expect(result).toHaveLength(2);
    });

    it("should return all customs clearances for admin users", async () => {
      const ctx = createMockContext({ role: "admin", linkedWarehouseId: undefined });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearances").mockResolvedValue([
        {
          id: 1,
          clearanceNumber: "CC-2026-00001",
          shipmentId: 1,
          type: "import" as const,
          status: "pending_documents" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      const result = await caller.copackerPortal.getCustomsClearances();

      expect(result).toHaveLength(1);
    });
  });

  describe("getCustomsDocuments", () => {
    it("should allow copacker to view documents for accessible clearances", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: 1 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
        id: 1,
        clearanceNumber: "CC-2026-00001",
        shipmentId: 1,
        type: "import" as const,
        status: "pending_documents" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(db, "getShipmentById").mockResolvedValue({
        id: 1,
      } as any);

      vi.spyOn(db, "getCustomsDocuments").mockResolvedValue([
        {
          id: 1,
          clearanceId: 1,
          documentType: "commercial_invoice" as const,
          name: "invoice.pdf",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      const result = await caller.copackerPortal.getCustomsDocuments({ clearanceId: 1 });

      expect(result).toHaveLength(1);
      expect(result[0]?.documentType).toBe("commercial_invoice");
    });

    it("should deny copacker access to non-existent shipment clearances", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: 1 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
        id: 2,
        clearanceNumber: "CC-2026-00002",
        shipmentId: 99, // Shipment not accessible
        type: "import" as const,
        status: "pending_documents" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(db, "getShipmentById").mockResolvedValue(undefined);

      await expect(
        caller.copackerPortal.getCustomsDocuments({ clearanceId: 2 })
      ).rejects.toThrow("You do not have access to this customs clearance");
    });
  });

  describe("getInventory", () => {
    it("should return only the copacker's assigned warehouse inventory", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: 5 });
      const caller = appRouter.createCaller(ctx);

      const byWarehouse = vi.spyOn(db, "getInventoryByWarehouse").mockResolvedValue([
        { inventory: { id: 10, productId: 100, warehouseId: 5, quantity: "25" } } as any,
      ]);
      const all = vi.spyOn(db, "getInventory").mockResolvedValue([]);

      const result = await caller.copackerPortal.getInventory();

      expect(byWarehouse).toHaveBeenCalledWith(5);
      expect(all).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect((result[0] as any).inventory.warehouseId).toBe(5);
    });

    it("should reject a copacker with no warehouse assigned", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: undefined });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.copackerPortal.getInventory()).rejects.toThrow(
        "No warehouse assigned to this account"
      );
    });
  });

  describe("biweekly inventory update lifecycle", () => {
    it("should create a draft update with its line items", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: 5 });
      const caller = appRouter.createCaller(ctx);

      const createUpdate = vi
        .spyOn(db, "createCopackerInventoryUpdate")
        .mockResolvedValue({ id: 77 } as any);
      const createItem = vi
        .spyOn(db, "createCopackerInventoryUpdateItem")
        .mockResolvedValue({ id: 1 } as any);
      vi.spyOn(db, "createAuditLog").mockResolvedValue({ id: 1 } as any);

      const result = await caller.copackerPortal.createInventoryUpdate({
        periodStart: "2026-06-01",
        periodEnd: "2026-06-15",
        items: [
          { productId: 100, newQuantity: "30", quantityReceived: "10" },
          { productId: 101, newQuantity: "5" },
        ],
      });

      expect(result.id).toBe(77);
      expect(createUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ warehouseId: 5, status: "draft", submittedBy: 1 })
      );
      expect(createItem).toHaveBeenCalledTimes(2);
      // Optional quantity fields default to "0"
      expect(createItem).toHaveBeenCalledWith(
        expect.objectContaining({ updateId: 77, productId: 101, quantityReceived: "0" })
      );
    });

    it("should submit a draft and apply quantities to live inventory", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: 5 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCopackerInventoryUpdateById").mockResolvedValue({
        id: 77,
        warehouseId: 5,
        status: "draft",
      } as any);
      const markSubmitted = vi
        .spyOn(db, "updateCopackerInventoryUpdate")
        .mockResolvedValue({ success: true } as any);
      vi.spyOn(db, "getCopackerInventoryUpdateItems").mockResolvedValue([
        { productId: 100, newQuantity: "30" } as any,
      ]);
      vi.spyOn(db, "getInventoryByWarehouse").mockResolvedValue([
        { inventory: { id: 10, productId: 100, warehouseId: 5 } } as any,
      ]);
      const applyQty = vi
        .spyOn(db, "updateInventoryQuantityById")
        .mockResolvedValue(undefined as any);
      vi.spyOn(db, "createAuditLog").mockResolvedValue({ id: 1 } as any);

      const result = await caller.copackerPortal.submitInventoryUpdate({ id: 77 });

      expect(result.success).toBe(true);
      expect(markSubmitted).toHaveBeenCalledWith(77, { status: "submitted" });
      expect(applyQty).toHaveBeenCalledWith(10, 30, 1, expect.stringContaining("Biweekly update"));
    });

    it("should deny submitting an update belonging to another warehouse", async () => {
      const ctx = createMockContext({ role: "copacker", linkedWarehouseId: 5 });
      const caller = appRouter.createCaller(ctx);

      vi.spyOn(db, "getCopackerInventoryUpdateById").mockResolvedValue({
        id: 88,
        warehouseId: 6, // different warehouse
        status: "draft",
      } as any);
      const markSubmitted = vi.spyOn(db, "updateCopackerInventoryUpdate");

      await expect(
        caller.copackerPortal.submitInventoryUpdate({ id: 88 })
      ).rejects.toThrow();
      expect(markSubmitted).not.toHaveBeenCalled();
    });
  });
});

// Internal-only AI / search endpoints must reject external (portal) roles so an
// outsider can't extract company-wide data, while internal roles keep access.
describe("internalProcedure gating (AI + global search)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["copacker", "vendor", "investor", "contractor"])(
    "blocks %s from dashboard.search",
    async (role) => {
      const ctx = createMockContext({ role: role as any, linkedVendorId: undefined });
      const caller = appRouter.createCaller(ctx);
      const search = vi.spyOn(db, "globalSearch").mockResolvedValue({} as any);

      await expect(caller.dashboard.search({ query: "anything" })).rejects.toThrow(
        "Not available for external accounts"
      );
      expect(search).not.toHaveBeenCalled();
    },
  );

  it.each(["copacker", "vendor", "investor", "contractor"])(
    "blocks %s from ai.query",
    async (role) => {
      const ctx = createMockContext({ role: role as any, linkedVendorId: undefined });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.ai.query({ question: "show me all invoices" })).rejects.toThrow(
        "Not available for external accounts"
      );
    },
  );

  it.each(["admin", "user", "finance", "ops"])(
    "allows internal role %s through dashboard.search",
    async (role) => {
      const ctx = createMockContext({ role: role as any, linkedVendorId: undefined });
      const caller = appRouter.createCaller(ctx);
      const search = vi
        .spyOn(db, "globalSearch")
        .mockResolvedValue({ customers: [], vendors: [] } as any);

      await caller.dashboard.search({ query: "acme" });
      expect(search).toHaveBeenCalledWith("acme");
    },
  );
});

describe("customs clearance inventory integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update inventory when customs status changes to cleared", async () => {
    const ctx = createMockContext({ role: "ops", linkedVendorId: undefined });
    const caller = appRouter.createCaller(ctx);

    // Mock customs clearance
    vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
      id: 1,
      clearanceNumber: "CC-2026-00001",
      shipmentId: 1,
      type: "import" as const,
      status: "pending_documents" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Mock shipment
    vi.spyOn(db, "getShipmentById").mockResolvedValue({
      id: 1,
      shipmentNumber: "SHP-001",
      purchaseOrderId: 1,
      type: "inbound" as const,
      companyId: 1,
    } as any);

    // Mock PO items
    vi.spyOn(db, "getPurchaseOrderItems").mockResolvedValue([
      {
        id: 1,
        purchaseOrderId: 1,
        productId: 100,
        quantity: "50",
        receivedQuantity: "0",
      } as any,
    ]);

    // Mock inventory
    vi.spyOn(db, "getInventory").mockResolvedValue([]);
    vi.spyOn(db, "createInventory").mockResolvedValue({ id: 1 });
    vi.spyOn(db, "updatePurchaseOrderItem").mockResolvedValue({ success: true });
    vi.spyOn(db, "createInventoryTransaction").mockResolvedValue({ 
      id: 1, 
      transactionNumber: "TXN-001" 
    });
    vi.spyOn(db, "updateShipment").mockResolvedValue(undefined);
    vi.spyOn(db, "getAllUsers").mockResolvedValue([]);
    vi.spyOn(db, "updateCustomsClearance").mockResolvedValue({ success: true });
    vi.spyOn(db, "createAuditLog").mockResolvedValue({ id: 1 });

    const result = await caller.customs.clearances.update({
      id: 1,
      status: "cleared",
      warehouseId: 5,
    });

    expect(result.success).toBe(true);
    expect(db.createInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 100,
        warehouseId: 5,
        quantity: "50",
        companyId: 1,
      })
    );
    expect(db.createInventoryTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: "receive",
        productId: 100,
        toWarehouseId: 5,
        quantity: "50",
      })
    );
    expect(db.updateShipment).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: "delivered",
      })
    );
  });

  it("should require warehouseId when clearing customs with inventory update", async () => {
    const ctx = createMockContext({ role: "ops", linkedVendorId: undefined });
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(db, "getCustomsClearanceById").mockResolvedValue({
      id: 1,
      clearanceNumber: "CC-2026-00001",
      shipmentId: 1,
      type: "import" as const,
      status: "pending_documents" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    await expect(
      caller.customs.clearances.update({
        id: 1,
        status: "cleared",
        // Missing warehouseId
      })
    ).rejects.toThrow("warehouseId is required when clearing customs with inventory update");
  });
});
