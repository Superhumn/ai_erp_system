import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module used by documentImportService.
vi.mock("./db", () => ({
  getVendorByName: vi.fn(),
  getVendorById: vi.fn(),
  createVendor: vi.fn(),
  findPurchaseOrderByNumber: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  createFreightHistory: vi.fn(),
  receivePurchaseOrderIntoInventory: vi.fn(),
}));

import * as db from "./db";
import { importFreightInvoice, type ImportedFreightInvoice } from "./documentImportService";

const baseInvoice: ImportedFreightInvoice = {
  invoiceNumber: "FF-1",
  carrierName: "Qingdao Freight Forwarders",
  invoiceDate: "2026-05-01",
  freightCharges: 2400,
  totalAmount: 2700,
  currency: "USD",
  relatedPoNumber: "PO-123",
  confidence: 0.9,
};

describe("importFreightInvoice — receive carried goods into inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getVendorByName).mockResolvedValue({ id: 7, name: "Qingdao Freight Forwarders" } as any);
    vi.mocked(db.createFreightHistory).mockResolvedValue(55 as any);
    vi.mocked(db.findPurchaseOrderByNumber).mockResolvedValue({ id: 42, poNumber: "PO-123" } as any);
    vi.mocked(db.updatePurchaseOrder).mockResolvedValue(undefined as any);
  });

  it("receives the linked PO's goods into inventory when enabled", async () => {
    vi.mocked(db.receivePurchaseOrderIntoInventory).mockResolvedValue({ received: true, warehouseId: 1, itemCount: 3 });

    const result = await importFreightInvoice(baseInvoice, 9, false, true);

    expect(result.success).toBe(true);
    expect(db.receivePurchaseOrderIntoInventory).toHaveBeenCalledWith(42, { warehouseId: undefined, receivedBy: 9 });
    expect(result.updatedRecords.some((r) => /Received 3 line item/.test(r.changes || ""))).toBe(true);
  });

  it("does not receive inventory when the flag is off", async () => {
    const result = await importFreightInvoice(baseInvoice, 9, false, false);
    expect(result.success).toBe(true);
    expect(db.receivePurchaseOrderIntoInventory).not.toHaveBeenCalled();
  });

  it("warns when receiving is requested but no warehouse is available", async () => {
    vi.mocked(db.receivePurchaseOrderIntoInventory).mockResolvedValue({ received: false, reason: "No warehouse configured to receive into" });
    const result = await importFreightInvoice(baseInvoice, 9, false, true);
    expect(result.warnings.some((w) => /No warehouse configured/.test(w))).toBe(true);
  });

  it("warns when receiving is requested but the freight invoice has no linked PO", async () => {
    const result = await importFreightInvoice({ ...baseInvoice, relatedPoNumber: undefined }, 9, false, true);
    expect(db.receivePurchaseOrderIntoInventory).not.toHaveBeenCalled();
    expect(result.warnings.some((w) => /not linked to a purchase order/.test(w))).toBe(true);
  });
});
