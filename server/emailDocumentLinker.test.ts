import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getPurchaseOrders: vi.fn(),
  getShipments: vi.fn(),
  getInvoices: vi.fn(),
  getVendors: vi.fn(),
}));

import * as db from "./db";
import { linkParsedEmailToEntities } from "./emailDocumentLinker";

const mockDb = vi.mocked(db);

describe("Email Document Linker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getPurchaseOrders.mockResolvedValue([]);
    mockDb.getShipments.mockResolvedValue([]);
    mockDb.getInvoices.mockResolvedValue([]);
    mockDb.getVendors.mockResolvedValue([]);
  });

  describe("linkParsedEmailToEntities", () => {
    it("should match by PO number", async () => {
      mockDb.getPurchaseOrders.mockResolvedValue([
        { id: 42, poNumber: "PO-2601-1234", status: "sent", vendorId: 1, createdAt: new Date() } as any,
      ]);

      const result = await linkParsedEmailToEntities({
        documentNumber: "PO-2601-1234",
      });

      expect(result.linkedPurchaseOrderId).toBe(42);
      expect(result.matchConfidence).toBe(95);
      expect(result.matchMethod).toBe("po_number");
    });

    it("should match by tracking number to shipment", async () => {
      mockDb.getShipments.mockResolvedValue([
        { id: 10, trackingNumber: "1Z999AA10123456784", purchaseOrderId: 42, shipmentNumber: "SHIP-001" } as any,
      ]);

      const result = await linkParsedEmailToEntities({
        trackingNumber: "1Z999AA10123456784",
      });

      expect(result.linkedShipmentId).toBe(10);
      expect(result.linkedPurchaseOrderId).toBe(42);
      expect(result.matchConfidence).toBe(90);
      expect(result.matchMethod).toBe("tracking_number");
    });

    it("should match by vendor email with single open PO", async () => {
      mockDb.getVendors.mockResolvedValue([
        { id: 5, name: "Fresh Farms", email: "sales@freshfarms.com" } as any,
      ]);

      mockDb.getPurchaseOrders.mockResolvedValue([
        { id: 20, poNumber: "PO-001", status: "sent", vendorId: 5, createdAt: new Date() } as any,
      ]);

      const result = await linkParsedEmailToEntities({
        fromEmail: "sales@freshfarms.com",
      });

      expect(result.linkedPurchaseOrderId).toBe(20);
      expect(result.matchConfidence).toBe(80);
      expect(result.matchMethod).toBe("vendor_email_single_po");
    });

    it("should match by vendor email + amount when multiple POs", async () => {
      mockDb.getVendors.mockResolvedValue([
        { id: 5, name: "Fresh Farms", email: "billing@freshfarms.com" } as any,
      ]);

      mockDb.getPurchaseOrders.mockResolvedValue([
        { id: 20, poNumber: "PO-001", status: "sent", vendorId: 5, totalAmount: "1500.00", createdAt: new Date() } as any,
        { id: 21, poNumber: "PO-002", status: "confirmed", vendorId: 5, totalAmount: "3200.50", createdAt: new Date() } as any,
      ]);

      const result = await linkParsedEmailToEntities({
        fromEmail: "billing@freshfarms.com",
        totalAmount: 3200.50,
      });

      expect(result.linkedPurchaseOrderId).toBe(21);
      expect(result.matchConfidence).toBe(75);
      expect(result.matchMethod).toBe("vendor_email_amount_match");
    });

    it("should match by invoice number", async () => {
      mockDb.getPurchaseOrders.mockResolvedValue([]); // No PO match

      mockDb.getInvoices.mockResolvedValue([
        { id: 30, invoiceNumber: "INV-2601-5678" } as any,
      ]);

      const result = await linkParsedEmailToEntities({
        documentNumber: "INV-2601-5678",
      });

      expect(result.linkedInvoiceId).toBe(30);
      expect(result.matchConfidence).toBe(95);
      expect(result.matchMethod).toBe("invoice_number");
    });

    it("should match by vendor name fuzzy match", async () => {
      mockDb.getVendors.mockResolvedValue([
        { id: 7, name: "Global Supply Corp", email: "other@global.com" } as any,
      ]);

      mockDb.getPurchaseOrders.mockResolvedValue([
        { id: 25, poNumber: "PO-003", status: "sent", vendorId: 7, createdAt: new Date() } as any,
      ]);

      const result = await linkParsedEmailToEntities({
        vendorName: "Global Supply",
      });

      expect(result.linkedPurchaseOrderId).toBe(25);
      expect(result.matchConfidence).toBe(45);
      expect(result.matchMethod).toBe("vendor_name_fuzzy");
    });

    it("should return no match for unrecognized email", async () => {
      const result = await linkParsedEmailToEntities({
        fromEmail: "unknown@nobody.com",
        vendorName: "Unknown Company",
      });

      expect(result.linkedPurchaseOrderId).toBeNull();
      expect(result.linkedShipmentId).toBeNull();
      expect(result.linkedInvoiceId).toBeNull();
      expect(result.matchConfidence).toBe(0);
      expect(result.matchMethod).toBe("none");
    });

    it("should prefer PO number match over vendor email match", async () => {
      mockDb.getPurchaseOrders.mockResolvedValue([
        { id: 42, poNumber: "PO-100", status: "sent", vendorId: 5, createdAt: new Date() } as any,
        { id: 43, poNumber: "PO-200", status: "sent", vendorId: 5, createdAt: new Date() } as any,
      ]);

      mockDb.getVendors.mockResolvedValue([
        { id: 5, name: "Vendor A", email: "sales@vendor.com" } as any,
      ]);

      const result = await linkParsedEmailToEntities({
        documentNumber: "PO-100",
        fromEmail: "sales@vendor.com",
      });

      // Should use PO number match (confidence 95) over vendor email
      expect(result.linkedPurchaseOrderId).toBe(42);
      expect(result.matchConfidence).toBe(95);
      expect(result.matchMethod).toBe("po_number");
    });
  });
});
