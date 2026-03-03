import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseTextToPO, createPOPreview, findVendorForMaterial } from "./textToPOService";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => ({
  getRawMaterialByNameOrSku: vi.fn(),
  getRawMaterials: vi.fn(),
  getVendors: vi.fn(),
  getVendorById: vi.fn(),
  createPurchaseOrder: vi.fn(),
  createPurchaseOrderItem: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import * as db from "./db";

describe("Text to PO Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseTextToPO", () => {
    it("should parse simple text input correctly", async () => {
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                materialName: "mushrooms",
                quantity: 3,
                unit: "tons",
                shipTo: "alex meats",
                notes: "",
              }),
            },
          },
        ],
      };

      vi.mocked(invokeLLM).mockResolvedValue(mockLLMResponse as any);

      const result = await parseTextToPO("order 3 tons of mushrooms ship to alex meats");

      expect(result).toEqual({
        materialName: "mushrooms",
        quantity: 3,
        unit: "tons",
        shipTo: "alex meats",
        notes: "",
      });
    });

    it("should handle parsing errors", async () => {
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      };

      vi.mocked(invokeLLM).mockResolvedValue(mockLLMResponse as any);

      await expect(parseTextToPO("invalid input")).rejects.toThrow("LLM returned no content");
    });
  });

  describe("findVendorForMaterial", () => {
    it("should find vendor for known material", async () => {
      const mockMaterial = {
        id: 1,
        name: "mushrooms",
        preferredVendorId: 10,
        unitCost: "5.50",
      };

      const mockVendor = {
        id: 10,
        name: "Mushroom Supplier Inc",
      };

      vi.mocked(db.getRawMaterialByNameOrSku).mockResolvedValue(mockMaterial as any);
      vi.mocked(db.getVendorById).mockResolvedValue(mockVendor as any);

      const result = await findVendorForMaterial("mushrooms");

      expect(result).toEqual({
        vendorId: 10,
        vendorName: "Mushroom Supplier Inc",
        rawMaterialId: 1,
        rawMaterialName: "mushrooms",
        unitCost: "5.50",
      });
    });

    it("should return first active vendor when material not found", async () => {
      const mockVendors = [
        { id: 1, name: "Vendor A", status: "active" },
        { id: 2, name: "Vendor B", status: "active" },
      ];

      vi.mocked(db.getRawMaterialByNameOrSku).mockResolvedValue(undefined);
      vi.mocked(db.getRawMaterials).mockResolvedValue([]);
      vi.mocked(db.getVendors).mockResolvedValue(mockVendors as any);

      const result = await findVendorForMaterial("unknown material");

      expect(result).toEqual({
        vendorId: 1,
        vendorName: "Vendor A",
        rawMaterialId: null,
        rawMaterialName: "unknown material",
        unitCost: null,
        suggested: true,
      });
    });
  });

  describe("createPOPreview", () => {
    it("should create preview with valid vendor", async () => {
      const mockVendor = {
        id: 10,
        name: "Mushroom Supplier Inc",
      };

      const mockMaterial = {
        id: 1,
        name: "mushrooms",
        preferredVendorId: 10,
        unitCost: "5.50",
      };

      vi.mocked(db.getRawMaterialByNameOrSku).mockResolvedValue(mockMaterial as any);
      vi.mocked(db.getVendorById).mockResolvedValue(mockVendor as any);

      const parsed = {
        materialName: "mushrooms",
        quantity: 3,
        unit: "tons",
        shipTo: "alex meats",
        notes: "test notes",
      };

      const preview = await createPOPreview(parsed);

      expect(preview.vendorId).toBe(10);
      expect(preview.vendorName).toBe("Mushroom Supplier Inc");
      expect(preview.items).toHaveLength(1);
      expect(preview.items[0].description).toContain("mushrooms");
      expect(preview.items[0].quantity).toBe("3");
      expect(preview.totalAmount).toBe("16.50");
      expect(preview.isPriceEstimated).toBe(false);
    });

    it("should throw error when no vendors exist", async () => {
      vi.mocked(db.getRawMaterialByNameOrSku).mockResolvedValue(undefined);
      vi.mocked(db.getRawMaterials).mockResolvedValue([]);
      vi.mocked(db.getVendors).mockResolvedValue([]);

      const parsed = {
        materialName: "unknown",
        quantity: 1,
        unit: "kg",
      };

      await expect(createPOPreview(parsed)).rejects.toThrow("No vendors found");
    });
  });
});
