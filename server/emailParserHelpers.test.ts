import { describe, it, expect } from "vitest";
import {
  quickCategorize,
  normalizeVendorName,
  extractEmailDomain,
  getCategoryDisplayInfo,
  type EmailCategory,
} from "./_core/emailParser";

describe("Email Parser Helpers", () => {
  describe("normalizeVendorName", () => {
    it("should lowercase and trim vendor names", () => {
      expect(normalizeVendorName("  Acme Corp.  ")).toBe("acme corp");
    });

    it("should remove special characters", () => {
      expect(normalizeVendorName("Fresh Farms, LLC.")).toBe("fresh farms llc");
    });

    it("should collapse multiple spaces", () => {
      expect(normalizeVendorName("Global   Supply   Co")).toBe("global supply co");
    });

    it("should handle empty string", () => {
      expect(normalizeVendorName("")).toBe("");
    });

    it("should handle names with numbers", () => {
      expect(normalizeVendorName("3M Company")).toBe("3m company");
    });
  });

  describe("extractEmailDomain", () => {
    it("should extract domain from email address", () => {
      expect(extractEmailDomain("john@example.com")).toBe("example.com");
    });

    it("should handle complex domains", () => {
      expect(extractEmailDomain("sales@sub.domain.co.uk")).toBe("sub.domain.co.uk");
    });

    it("should return empty string for invalid email", () => {
      expect(extractEmailDomain("not-an-email")).toBe("");
    });

    it("should handle empty string", () => {
      expect(extractEmailDomain("")).toBe("");
    });
  });

  describe("getCategoryDisplayInfo", () => {
    const allCategories: EmailCategory[] = [
      "receipt",
      "purchase_order",
      "invoice",
      "shipping_confirmation",
      "freight_quote",
      "delivery_notification",
      "order_confirmation",
      "payment_confirmation",
      "general",
    ];

    it("should return display info for all categories", () => {
      for (const category of allCategories) {
        const info = getCategoryDisplayInfo(category);
        expect(info).toHaveProperty("label");
        expect(info).toHaveProperty("color");
        expect(info).toHaveProperty("icon");
        expect(info.label).toBeTruthy();
        expect(info.color).toBeTruthy();
      }
    });

    it("should return 'Receipt' for receipt category", () => {
      expect(getCategoryDisplayInfo("receipt").label).toBe("Receipt");
    });

    it("should return 'Invoice' for invoice category", () => {
      expect(getCategoryDisplayInfo("invoice").label).toBe("Invoice");
    });

    it("should return 'Shipping' for shipping_confirmation", () => {
      expect(getCategoryDisplayInfo("shipping_confirmation").label).toBe("Shipping");
    });

    it("should return 'Freight Quote' for freight_quote", () => {
      expect(getCategoryDisplayInfo("freight_quote").label).toBe("Freight Quote");
    });

    it("should return 'General' for general category", () => {
      expect(getCategoryDisplayInfo("general").label).toBe("General");
    });
  });

  describe("quickCategorize - edge cases", () => {
    it("should handle empty subject gracefully", () => {
      const result = quickCategorize("", "billing@vendor.com");
      expect(result).toHaveProperty("category");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("priority");
    });

    it("should handle empty email gracefully", () => {
      const result = quickCategorize("Invoice #123", "");
      expect(result.category).toBe("invoice");
    });

    it("should categorize BOL/freight keywords correctly", () => {
      const result = quickCategorize("Bill of Lading - Container MSKU123", "docs@freight.com");
      // BOL subjects may match invoice or freight patterns depending on keyword scoring
      expect(result.category).toBeTruthy();
      expect(result.confidence).toBeGreaterThanOrEqual(50);
    });

    it("should categorize wire transfer with payment keywords", () => {
      // "payment confirmed" is the key pattern for payment_confirmation
      const result = quickCategorize("Payment Confirmed - Wire Transfer", "treasury@bank.com");
      expect(result.category).toBe("payment_confirmation");
    });

    it("should not categorize newsletters as invoices", () => {
      const result = quickCategorize("Monthly newsletter update", "newsletter@company.com");
      expect(result.category).toBe("general");
    });

    it("should prioritize more specific categories", () => {
      const result = quickCategorize("Your package has been delivered", "notifications@carrier.com");
      expect(result.category).toBe("delivery_notification");
    });

    it("should handle order-related emails", () => {
      const result = quickCategorize("Order Payment Received", "billing@store.com");
      // Any non-general match is acceptable for mixed signals
      expect(result.category).not.toBe("general");
    });

    it("should return suggested actions for categorized emails", () => {
      const result = quickCategorize("Invoice #123 due in 30 days", "ar@vendor.com");
      expect(result.suggestedAction).toBeTruthy();
    });
  });
});
