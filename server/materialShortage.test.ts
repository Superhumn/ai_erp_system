import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module before importing the service
vi.mock("./db", () => ({
  getWorkOrders: vi.fn(),
  getWorkOrderMaterials: vi.fn(),
  getRawMaterialById: vi.fn(),
  getRawMaterialInventory: vi.fn(),
  getRawMaterials: vi.fn(),
  getPurchaseOrders: vi.fn(),
  getAllUsers: vi.fn(),
  notifyUsersOfEvent: vi.fn(),
}));

import * as db from "./db";
import { detectMaterialShortages, detectAnomalies } from "./materialShortageService";

const mockDb = vi.mocked(db);

describe("Material Shortage Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectMaterialShortages", () => {
    it("should return empty array when no work orders exist", async () => {
      mockDb.getWorkOrders.mockResolvedValue([]);
      const result = await detectMaterialShortages();
      expect(result).toEqual([]);
    });

    it("should detect shortage when inventory < required", async () => {
      // Work order requiring 100 kg of flour
      mockDb.getWorkOrders
        .mockResolvedValueOnce([
          { id: 1, workOrderNumber: "WO-001", status: "in_progress", quantity: "100", completedQuantity: "0", unit: "EA", bomId: 1, productId: 1 } as any,
        ])
        .mockResolvedValueOnce([]); // scheduled WOs

      mockDb.getWorkOrderMaterials.mockResolvedValue([
        { id: 1, workOrderId: 1, rawMaterialId: 10, name: "Flour", requiredQuantity: "100", consumedQuantity: "0", unit: "kg" } as any,
      ]);

      mockDb.getRawMaterialById.mockResolvedValue({
        id: 10, name: "Flour", sku: "FLR-001", unit: "kg", preferredVendorId: 5,
      } as any);

      mockDb.getRawMaterialInventory.mockResolvedValue([
        { id: 1, rawMaterialId: 10, quantity: "30", availableQuantity: "30", unit: "kg" } as any,
      ]);

      const result = await detectMaterialShortages();

      expect(result).toHaveLength(1);
      expect(result[0].rawMaterialId).toBe(10);
      expect(result[0].rawMaterialName).toBe("Flour");
      expect(result[0].totalRequired).toBe(100);
      expect(result[0].totalAvailable).toBe(30);
      expect(result[0].shortfall).toBe(70);
      expect(result[0].affectedWorkOrders).toHaveLength(1);
      expect(result[0].affectedWorkOrders[0].workOrderNumber).toBe("WO-001");
    });

    it("should not flag materials with sufficient inventory", async () => {
      mockDb.getWorkOrders
        .mockResolvedValueOnce([
          { id: 1, workOrderNumber: "WO-001", status: "in_progress", quantity: "50", completedQuantity: "0", unit: "EA", bomId: 1, productId: 1 } as any,
        ])
        .mockResolvedValueOnce([]);

      mockDb.getWorkOrderMaterials.mockResolvedValue([
        { id: 1, workOrderId: 1, rawMaterialId: 10, name: "Sugar", requiredQuantity: "50", consumedQuantity: "0", unit: "kg" } as any,
      ]);

      mockDb.getRawMaterialById.mockResolvedValue({
        id: 10, name: "Sugar", sku: "SGR-001", unit: "kg", preferredVendorId: null,
      } as any);

      mockDb.getRawMaterialInventory.mockResolvedValue([
        { id: 1, rawMaterialId: 10, quantity: "200", availableQuantity: "200", unit: "kg" } as any,
      ]);

      const result = await detectMaterialShortages();
      expect(result).toHaveLength(0);
    });

    it("should aggregate demand from multiple work orders", async () => {
      mockDb.getWorkOrders
        .mockResolvedValueOnce([
          { id: 1, workOrderNumber: "WO-001", status: "in_progress" } as any,
          { id: 2, workOrderNumber: "WO-002", status: "in_progress" } as any,
        ])
        .mockResolvedValueOnce([]);

      mockDb.getWorkOrderMaterials
        .mockResolvedValueOnce([
          { id: 1, workOrderId: 1, rawMaterialId: 10, name: "Cocoa", requiredQuantity: "60", consumedQuantity: "0", unit: "kg" } as any,
        ])
        .mockResolvedValueOnce([
          { id: 2, workOrderId: 2, rawMaterialId: 10, name: "Cocoa", requiredQuantity: "40", consumedQuantity: "0", unit: "kg" } as any,
        ]);

      mockDb.getRawMaterialById.mockResolvedValue({
        id: 10, name: "Cocoa", sku: "COC-001", unit: "kg", preferredVendorId: null,
      } as any);

      mockDb.getRawMaterialInventory.mockResolvedValue([
        { id: 1, rawMaterialId: 10, quantity: "50", availableQuantity: "50", unit: "kg" } as any,
      ]);

      const result = await detectMaterialShortages();
      expect(result).toHaveLength(1);
      expect(result[0].totalRequired).toBe(100);
      expect(result[0].totalAvailable).toBe(50);
      expect(result[0].shortfall).toBe(50);
      expect(result[0].affectedWorkOrders).toHaveLength(2);
    });

    it("should subtract consumed quantity from required", async () => {
      mockDb.getWorkOrders
        .mockResolvedValueOnce([
          { id: 1, workOrderNumber: "WO-001", status: "in_progress" } as any,
        ])
        .mockResolvedValueOnce([]);

      mockDb.getWorkOrderMaterials.mockResolvedValue([
        { id: 1, workOrderId: 1, rawMaterialId: 10, name: "Butter", requiredQuantity: "80", consumedQuantity: "50", unit: "kg" } as any,
      ]);

      mockDb.getRawMaterialById.mockResolvedValue({
        id: 10, name: "Butter", sku: "BTR-001", unit: "kg", preferredVendorId: null,
      } as any);

      mockDb.getRawMaterialInventory.mockResolvedValue([
        { id: 1, rawMaterialId: 10, quantity: "20", availableQuantity: "20", unit: "kg" } as any,
      ]);

      const result = await detectMaterialShortages();
      // Required remaining = 80 - 50 = 30, Available = 20, Shortfall = 10
      expect(result).toHaveLength(1);
      expect(result[0].totalRequired).toBe(30);
      expect(result[0].shortfall).toBe(10);
    });
  });

  describe("detectAnomalies", () => {
    it("should detect low stock for raw materials below min order qty", async () => {
      mockDb.getRawMaterials.mockResolvedValue([
        { id: 1, name: "Salt", unit: "kg", minOrderQty: "100", status: "active" } as any,
      ]);

      mockDb.getRawMaterialInventory.mockResolvedValue([
        { id: 1, rawMaterialId: 1, quantity: "20", unit: "kg" } as any,
      ]);

      mockDb.getPurchaseOrders.mockResolvedValue([]);
      mockDb.getWorkOrders.mockResolvedValue([]);

      const result = await detectAnomalies();
      const lowStockAlerts = result.filter(a => a.type === "low_stock");
      expect(lowStockAlerts).toHaveLength(1);
      expect(lowStockAlerts[0].title).toContain("Salt");
      expect(lowStockAlerts[0].severity).toBe("warning");
    });

    it("should flag critical when stock is zero", async () => {
      mockDb.getRawMaterials.mockResolvedValue([
        { id: 1, name: "Flour", unit: "kg", minOrderQty: "50", status: "active" } as any,
      ]);

      mockDb.getRawMaterialInventory.mockResolvedValue([
        { id: 1, rawMaterialId: 1, quantity: "0", unit: "kg" } as any,
      ]);

      mockDb.getPurchaseOrders.mockResolvedValue([]);
      mockDb.getWorkOrders.mockResolvedValue([]);

      const result = await detectAnomalies();
      const lowStockAlerts = result.filter(a => a.type === "low_stock");
      expect(lowStockAlerts[0].severity).toBe("critical");
    });

    it("should detect overdue purchase orders", async () => {
      mockDb.getRawMaterials.mockResolvedValue([]);
      mockDb.getRawMaterialInventory.mockResolvedValue([]);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      mockDb.getPurchaseOrders
        .mockResolvedValueOnce([
          { id: 1, poNumber: "PO-001", status: "sent", expectedDeliveryDate: pastDate, vendorId: 1 } as any,
        ])
        .mockResolvedValueOnce([]);

      mockDb.getWorkOrders.mockResolvedValue([]);

      const result = await detectAnomalies();
      const overdueAlerts = result.filter(a => a.type === "po_overdue");
      expect(overdueAlerts).toHaveLength(1);
      expect(overdueAlerts[0].severity).toBe("critical"); // > 7 days
    });

    it("should detect low yield variance in completed work orders", async () => {
      mockDb.getRawMaterials.mockResolvedValue([]);
      mockDb.getRawMaterialInventory.mockResolvedValue([]);
      mockDb.getPurchaseOrders.mockResolvedValue([]);

      mockDb.getWorkOrders.mockResolvedValue([
        { id: 1, workOrderNumber: "WO-001", status: "completed", quantity: "100", completedQuantity: "60", unit: "EA" } as any,
      ]);

      const result = await detectAnomalies();
      const yieldAlerts = result.filter(a => a.type === "yield_variance");
      expect(yieldAlerts).toHaveLength(1);
      expect(yieldAlerts[0].severity).toBe("critical"); // < 70% yield
    });

    it("should return empty when no anomalies exist", async () => {
      mockDb.getRawMaterials.mockResolvedValue([
        { id: 1, name: "Salt", unit: "kg", minOrderQty: "10", status: "active" } as any,
      ]);

      mockDb.getRawMaterialInventory.mockResolvedValue([
        { id: 1, rawMaterialId: 1, quantity: "500", unit: "kg" } as any,
      ]);

      mockDb.getPurchaseOrders.mockResolvedValue([]);
      mockDb.getWorkOrders.mockResolvedValue([]);

      const result = await detectAnomalies();
      expect(result).toHaveLength(0);
    });
  });
});
