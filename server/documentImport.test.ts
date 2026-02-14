import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock fs, child_process, pdf2pic, crypto
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  rmSync: vi.fn(),
}));
vi.mock("pdf2pic", () => ({
  fromBuffer: vi.fn(),
}));

// Mock db module
vi.mock("./db", () => ({
  getVendorByName: vi.fn(),
  createVendor: vi.fn().mockResolvedValue({ id: 1 }),
  getVendorById: vi.fn().mockResolvedValue({ id: 1, name: "Test Carrier" }),
  findPurchaseOrderByNumber: vi.fn().mockResolvedValue(null),
  createFreightHistory: vi.fn().mockResolvedValue(1),
  updatePurchaseOrder: vi.fn(),
  getRawMaterials: vi.fn().mockResolvedValue([]),
}));

import { invokeLLM } from "./_core/llm";
import * as db from "./db";

/** Helper to create the LLM response structure the code expects */
function mockLLMResponse(jsonData: object) {
  return {
    choices: [{
      message: {
        content: JSON.stringify(jsonData),
      },
    }],
  };
}

describe("Document Import - Freight Invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseUploadedDocument - confidence normalization", () => {
    it("should normalize confidence from 0-100 scale to 0-1 and inject into freightInvoice", async () => {
      // Mock fetch for image download
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

      // LLM returns confidence in 0-100 scale (as per prompt example: "confidence": 85)
      vi.mocked(invokeLLM).mockResolvedValue(mockLLMResponse({
        documentType: "freight_invoice",
        confidence: 85,
        freightInvoice: {
          invoiceNumber: "SHJLSP24080068",
          carrierName: "JiLong Shipping (Fuzhou) Co.,Ltd",
          invoiceDate: "2024-08-06",
          shipmentDate: "2024-08-08",
          origin: "SHANGHAI,CHINA",
          destination: "",
          trackingNumber: "SHJLSP24080068",
          freightCharges: 835,
          fuelSurcharge: 0,
          accessorialCharges: 0,
          totalAmount: 835,
          currency: "USD",
        },
      }));

      const { parseUploadedDocument } = await import("./documentImportService");

      const result = await parseUploadedDocument(
        "data:image/png;base64,iVBOR",
        "freight_invoice.png",
        "freight_invoice",
        "image/png"
      );

      expect(result.success).toBe(true);
      expect(result.documentType).toBe("freight_invoice");
      expect(result.freightInvoice).toBeDefined();
      // Confidence should be normalized to 0-1 range
      expect(result.freightInvoice!.confidence).toBe(0.85);
    });

    it("should handle confidence already in 0-1 scale", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

      vi.mocked(invokeLLM).mockResolvedValue(mockLLMResponse({
        documentType: "freight_invoice",
        confidence: 0.92,
        freightInvoice: {
          invoiceNumber: "FI-001",
          carrierName: "Test Carrier",
          invoiceDate: "2024-01-01",
          freightCharges: 500,
          totalAmount: 500,
        },
      }));

      const { parseUploadedDocument } = await import("./documentImportService");

      const result = await parseUploadedDocument(
        "data:image/png;base64,iVBOR",
        "test.png",
        "freight_invoice",
        "image/png"
      );

      expect(result.freightInvoice!.confidence).toBe(0.92);
    });

    it("should default confidence to 0 when missing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

      vi.mocked(invokeLLM).mockResolvedValue(mockLLMResponse({
        documentType: "freight_invoice",
        freightInvoice: {
          invoiceNumber: "FI-002",
          carrierName: "Test Carrier",
          invoiceDate: "2024-01-01",
          freightCharges: 100,
          totalAmount: 100,
        },
      }));

      const { parseUploadedDocument } = await import("./documentImportService");

      const result = await parseUploadedDocument(
        "data:image/png;base64,iVBOR",
        "test.png",
        "freight_invoice",
        "image/png"
      );

      expect(result.freightInvoice!.confidence).toBe(0);
      // Should NOT be NaN
      expect(isNaN(result.freightInvoice!.confidence)).toBe(false);
    });
  });

  describe("importFreightInvoice", () => {
    it("should successfully import a freight invoice", async () => {
      vi.mocked(db.getVendorByName).mockResolvedValue(null);
      vi.mocked(db.createVendor).mockResolvedValue({ id: 10 });
      vi.mocked(db.getVendorById).mockResolvedValue({
        id: 10,
        name: "JiLong Shipping",
        email: "",
        type: "service",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.mocked(db.createFreightHistory).mockResolvedValue(1);

      const { importFreightInvoice } = await import("./documentImportService");

      const result = await importFreightInvoice(
        {
          invoiceNumber: "SHJLSP24080068",
          carrierName: "JiLong Shipping (Fuzhou) Co.,Ltd",
          invoiceDate: "2024-08-06",
          shipmentDate: "2024-08-08",
          origin: "SHANGHAI,CHINA",
          destination: "",
          trackingNumber: "SHJLSP24080068",
          freightCharges: 835,
          fuelSurcharge: 0,
          accessorialCharges: 0,
          totalAmount: 835,
          currency: "USD",
          confidence: 0.85,
        },
        1 // userId
      );

      expect(result.success).toBe(true);
      expect(result.documentType).toBe("freight_invoice");
      expect(result.createdRecords.length).toBeGreaterThan(0);
      // Verify createFreightHistory was called with correct data
      expect(db.createFreightHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceNumber: "SHJLSP24080068",
          carrierId: 10,
          totalAmount: "835",
          freightCharges: "835",
        })
      );
    });

    it("should link to existing PO when relatedPoNumber is provided", async () => {
      vi.mocked(db.getVendorByName).mockResolvedValue({
        id: 5,
        name: "Test Carrier",
      } as any);
      vi.mocked(db.findPurchaseOrderByNumber).mockResolvedValue({
        id: 42,
        poNumber: "PO-12345",
      } as any);
      vi.mocked(db.createFreightHistory).mockResolvedValue(2);

      const { importFreightInvoice } = await import("./documentImportService");

      const result = await importFreightInvoice(
        {
          invoiceNumber: "FI-100",
          carrierName: "Test Carrier",
          invoiceDate: "2024-06-01",
          freightCharges: 500,
          totalAmount: 500,
          relatedPoNumber: "PO-12345",
          confidence: 0.9,
        },
        1
      );

      expect(result.success).toBe(true);
      expect(db.updatePurchaseOrder).toHaveBeenCalledWith(42, expect.objectContaining({
        freightCost: "500",
      }));
      expect(result.updatedRecords).toContainEqual(
        expect.objectContaining({
          type: "purchase_order",
          id: 42,
        })
      );
    });
  });
});
