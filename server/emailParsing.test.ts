import { describe, it, expect, vi } from "vitest";
import { quickCategorize, getCategoryDisplayInfo } from "./_core/emailParser";

describe("Email Parsing", () => {
  describe("quickCategorize - Document Type Detection", () => {
    it("should detect invoice from subject line", () => {
      const result = quickCategorize("Invoice #12345 for October Services", "accounts@supplier.com");
      expect(result.category).toBe("invoice");
      expect(result.confidence).toBeGreaterThan(50);
    });

    it("should detect receipt from subject line", () => {
      const result = quickCategorize("Order Receipt - Thank you for your purchase", "noreply@amazon.com");
      expect(result.category).toBe("receipt");
      expect(result.confidence).toBeGreaterThan(50);
    });

    it("should detect purchase order from subject", () => {
      const result = quickCategorize("PO-2026-0045 Confirmation", "orders@rawmaterials.com");
      expect(result.category).toBe("purchase_order");
      expect(result.confidence).toBeGreaterThan(50);
    });

    it("should detect shipping confirmation from carrier domain", () => {
      const result = quickCategorize("Tracking Info for your shipment", "updates@ups.com");
      expect(result.category).toBe("shipping_confirmation");
      expect(result.confidence).toBeGreaterThan(50);
    });

    it("should detect freight quote from subject", () => {
      const result = quickCategorize("Freight Rate Quote: Container from Shanghai", "quotes@forwarder.com");
      expect(result.category).toBe("freight_quote");
      expect(result.confidence).toBeGreaterThan(50);
    });

    it("should default to general for unrecognized emails", () => {
      const result = quickCategorize("Hello, how are you?", "friend@personal.com");
      expect(result.category).toBe("general");
    });
  });

  describe("quickCategorize - Priority Assignment", () => {
    it("should assign high priority to invoices", () => {
      const result = quickCategorize("Invoice Payment Due", "billing@vendor.com");
      expect(result.priority).toBe("high");
    });

    it("should assign high priority to purchase orders", () => {
      const result = quickCategorize("Purchase Order #PO-999", "orders@supplier.com");
      expect(result.priority).toBe("high");
    });

    it("should assign medium priority to shipping confirmations", () => {
      const result = quickCategorize("Tracking update for your order", "no-reply@dhl.com");
      expect(["medium", "high"]).toContain(result.priority);
    });

    it("should assign low priority to general emails", () => {
      const result = quickCategorize("Newsletter: Monthly Updates", "marketing@company.com");
      expect(result.priority).toBe("low");
    });
  });

  describe("quickCategorize - Keyword Extraction", () => {
    it("should extract relevant keywords from invoice emails", () => {
      const result = quickCategorize("Invoice #INV-2026-001 for $5,000", "billing@vendor.com");
      expect(result.keywords).toBeDefined();
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it("should extract tracking keywords from shipping emails", () => {
      const result = quickCategorize("Tracking Number 1Z999AA10123456784", "noreply@ups.com");
      expect(result.keywords).toBeDefined();
    });
  });

  describe("quickCategorize - Edge Cases", () => {
    it("should handle empty subject", () => {
      const result = quickCategorize("", "test@email.com");
      expect(result.category).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    it("should handle very long subjects", () => {
      const longSubject = "Invoice ".repeat(100) + "Important";
      const result = quickCategorize(longSubject, "test@email.com");
      expect(result.category).toBe("invoice");
    });

    it("should be case insensitive", () => {
      const result1 = quickCategorize("INVOICE #123", "test@email.com");
      const result2 = quickCategorize("invoice #123", "test@email.com");
      expect(result1.category).toBe(result2.category);
    });

    it("should handle special characters in subject", () => {
      const result = quickCategorize("Invoice #123 - $$$ Due!!!", "test@email.com");
      expect(result.category).toBe("invoice");
    });
  });

  describe("getCategoryDisplayInfo", () => {
    it("should return display info for invoice category", () => {
      const info = getCategoryDisplayInfo("invoice");
      expect(info.label).toBeDefined();
      expect(info.color).toBeDefined();
      expect(info.label.toLowerCase()).toContain("invoice");
    });

    it("should return display info for receipt category", () => {
      const info = getCategoryDisplayInfo("receipt");
      expect(info.label).toBeDefined();
      expect(info.color).toBeDefined();
    });

    it("should return display info for purchase order category", () => {
      const info = getCategoryDisplayInfo("purchase_order");
      expect(info.label).toBeDefined();
      expect(info.color).toBeDefined();
    });

    it("should return display info for shipping category", () => {
      const info = getCategoryDisplayInfo("shipping_confirmation");
      expect(info.label).toBeDefined();
      expect(info.color).toBeDefined();
    });

    it("should return display info for freight quote category", () => {
      const info = getCategoryDisplayInfo("freight_quote");
      expect(info.label).toBeDefined();
      expect(info.color).toBeDefined();
    });

    it("should return display info for general category", () => {
      const info = getCategoryDisplayInfo("general");
      expect(info.label).toBeDefined();
      expect(info.color).toBeDefined();
    });

    it("should handle unknown categories gracefully", () => {
      const info = getCategoryDisplayInfo("unknown_category" as any);
      expect(info.label).toBeDefined();
    });
  });

  describe("quickCategorize - Suggested Actions", () => {
    it("should suggest review action for invoices", () => {
      const result = quickCategorize("Invoice for services rendered", "billing@vendor.com");
      expect(result.suggestedAction).toBeDefined();
    });

    it("should suggest update action for shipping", () => {
      const result = quickCategorize("Your package tracking update", "noreply@fedex.com");
      expect(result.suggestedAction).toBeDefined();
    });
  });

  describe("Multi-category Disambiguation", () => {
    it("should prefer invoice over receipt when invoice is explicit", () => {
      const result = quickCategorize("Invoice from Vendor - Payment Required", "vendor@company.com");
      expect(result.category).toBe("invoice");
    });

    it("should prefer freight_quote over general for rate requests", () => {
      const result = quickCategorize("Rate Quote for LCL Shipment to US", "freight@forwarder.com");
      expect(result.category).toBe("freight_quote");
    });

    it("should detect delivery over general shipping", () => {
      const result = quickCategorize("Package Delivered Successfully", "noreply@courier.com");
      expect(result.category).toBe("delivery_notification");
    });
  });
});
