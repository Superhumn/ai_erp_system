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
