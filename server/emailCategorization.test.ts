import { describe, it, expect, vi } from "vitest";
import { quickCategorize, getCategoryDisplayInfo, type EmailCategory } from "./_core/emailParser";

describe("Email Categorization", () => {
  describe("quickCategorize", () => {
    it("should categorize shipping confirmation emails", () => {
      // Use "tracking" which matches shipping but not delivery
      const result = quickCategorize("Tracking Update - Package in transit", "noreply@usps.com");
      expect(result.category).toBe("shipping_confirmation");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.priority).toBe("medium");
    });

    it("should categorize delivery notification emails", () => {
      const result = quickCategorize("Your package was delivered", "notifications@fedex.com");
      expect(result.category).toBe("delivery_notification");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      // delivery_notification has high priority
      expect(result.priority).toBe("high");
    });

    it("should categorize invoice emails", () => {
      const result = quickCategorize("Invoice #INV-2025-001 - Payment Due", "billing@vendor.com");
      expect(result.category).toBe("invoice");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.priority).toBe("high");
    });

    it("should categorize receipt emails", () => {
      const result = quickCategorize("Receipt for your purchase", "noreply@store.com");
      expect(result.category).toBe("receipt");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      // Receipt matches both subject and email pattern (noreply), so priority is low
      expect(result.priority).toBe("low");
    });

    it("should categorize purchase order emails", () => {
      const result = quickCategorize("Purchase Order #PO-12345", "procurement@company.com");
      expect(result.category).toBe("purchase_order");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      // Purchase orders have high priority
      expect(result.priority).toBe("high");
    });

    it("should categorize freight quote emails", () => {
      // "Quote" and "rate" match freight_quote, avoid "shipment" which matches shipping
      const result = quickCategorize("Freight Rate Quote for Container", "sales@freightco.com");
      expect(result.category).toBe("freight_quote");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.priority).toBe("medium");
    });

    it("should categorize order confirmation emails", () => {
      // "order confirm" matches order_confirmation pattern
      const result = quickCategorize("Order Confirmed - Your order has been placed", "orders@shop.com");
      expect(result.category).toBe("order_confirmation");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.priority).toBe("low");
    });

    it("should categorize payment confirmation emails", () => {
      const result = quickCategorize("Payment Confirmed - Wire Transfer Received", "bank@payments.com");
      expect(result.category).toBe("payment_confirmation");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.priority).toBe("medium");
    });

    it("should return general for unrecognized emails", () => {
      const result = quickCategorize("Hello, how are you?", "friend@personal.com");
      expect(result.category).toBe("general");
      expect(result.confidence).toBe(50);
      expect(result.priority).toBe("low");
    });

    it("should boost confidence when both subject and email match", () => {
      // Use "tracking" which matches shipping_confirmation
      const result = quickCategorize("Tracking Update - Package dispatched", "tracking@usps.com");
      expect(result.category).toBe("shipping_confirmation");
      expect(result.confidence).toBe(85);
    });

    it("should extract keywords from subject", () => {
      const result = quickCategorize("Invoice for services rendered", "billing@company.com");
      expect(result.keywords).toContain("invoice");
    });
  });

  describe("vendor_quote vs freight_quote", () => {
    it("categorizes a supplier's reply to our RFQ as a vendor quote", () => {
      const result = quickCategorize(
        "Re: RFQ-20260112-AB12 - our quotation",
        "sales@shandongfoods.cn",
      );
      expect(result.category).toBe("vendor_quote");
      expect(result.priority).toBe("high");
    });

    it("categorizes a body with supplier pricing signals as a vendor quote", () => {
      const result = quickCategorize(
        "Pricing for dried shiitake",
        "sales@supplier.com",
        "Unit price USD 4.20/kg. MOQ 5000 kg. Tooling charge USD 800 one-time.",
      );
      expect(result.category).toBe("vendor_quote");
    });

    it("still routes a carrier rate sheet to freight_quote", () => {
      const result = quickCategorize(
        "Freight quotation Ningbo - Long Beach",
        "rates@flexport.com",
        "FCL 40HQ rate, transit 22 days, includes drayage.",
      );
      expect(result.category).toBe("freight_quote");
    });

    it("keeps a carrier's message away from the vendor-quote parser", () => {
      // Lands on shipping_confirmation via the maersk.com sender pattern, which
      // is pre-existing behaviour; what matters here is that it is not claimed
      // as a supplier quotation.
      const result = quickCategorize("Ocean freight quote for Q3", "quotes@maersk.com");
      expect(result.category).not.toBe("vendor_quote");
    });

    it("does not let transport language in the body turn a carrier note into a vendor quote", () => {
      const result = quickCategorize(
        "Quotation for your shipment",
        "ops@somebroker.com",
        "Transit time 22 days, demurrage free for 7 days.",
      );
      expect(result.category).not.toBe("vendor_quote");
    });

    it("has display info for the vendor_quote category", () => {
      const info = getCategoryDisplayInfo("vendor_quote");
      expect(info.label).toBe("Vendor Quote");
      expect(info.color).toBeTruthy();
    });
  });

  describe("getCategoryDisplayInfo", () => {
    it("should return correct info for receipt category", () => {
      const info = getCategoryDisplayInfo("receipt");
      expect(info.label).toBe("Receipt");
      expect(info.color).toBe("green");
    });

    it("should return correct info for purchase_order category", () => {
      const info = getCategoryDisplayInfo("purchase_order");
      expect(info.label).toBe("Purchase Order");
      expect(info.color).toBe("blue");
    });

    it("should return correct info for invoice category", () => {
      const info = getCategoryDisplayInfo("invoice");
      expect(info.label).toBe("Invoice");
      expect(info.color).toBe("orange");
    });

    it("should return correct info for shipping_confirmation category", () => {
      const info = getCategoryDisplayInfo("shipping_confirmation");
      expect(info.label).toBe("Shipping");
      expect(info.color).toBe("purple");
    });

    it("should return correct info for freight_quote category", () => {
      const info = getCategoryDisplayInfo("freight_quote");
      expect(info.label).toBe("Freight Quote");
      expect(info.color).toBe("cyan");
    });

    it("should return correct info for delivery_notification category", () => {
      const info = getCategoryDisplayInfo("delivery_notification");
      expect(info.label).toBe("Delivery");
      expect(info.color).toBe("emerald");
    });

    it("should return correct info for order_confirmation category", () => {
      const info = getCategoryDisplayInfo("order_confirmation");
      expect(info.label).toBe("Order Confirmation");
      expect(info.color).toBe("indigo");
    });

    it("should return correct info for payment_confirmation category", () => {
      const info = getCategoryDisplayInfo("payment_confirmation");
      expect(info.label).toBe("Payment");
      expect(info.color).toBe("teal");
    });

    it("should return general info for unknown category", () => {
      const info = getCategoryDisplayInfo("general");
      expect(info.label).toBe("General");
      expect(info.color).toBe("gray");
    });

    it("should return general info for invalid category", () => {
      const info = getCategoryDisplayInfo("invalid_category" as EmailCategory);
      expect(info.label).toBe("General");
      expect(info.color).toBe("gray");
    });
  });

  describe("Category priority assignment", () => {
    it("should assign high priority to invoices", () => {
      const result = quickCategorize("Invoice #123 - Payment Due", "billing@vendor.com");
      expect(result.priority).toBe("high");
    });

    it("should assign high priority to delivery notifications", () => {
      // "arrived" matches delivery_notification pattern which has high priority
      const result = quickCategorize("Your package has arrived", "delivery@fedex.com");
      expect(result.category).toBe("delivery_notification");
      expect(result.priority).toBe("high");
    });

    it("should assign high priority to purchase orders", () => {
      // PO pattern matches purchase_order which has high priority
      const result = quickCategorize("Purchase Order #PO-12345", "purchasing@company.com");
      expect(result.category).toBe("purchase_order");
      expect(result.priority).toBe("high");
    });

    it("should assign medium priority to shipping confirmations", () => {
      const result = quickCategorize("Your order has shipped", "shipping@store.com");
      expect(result.priority).toBe("medium");
    });

    it("should assign low priority to receipts", () => {
      const result = quickCategorize("Receipt for your purchase", "noreply@store.com");
      expect(result.priority).toBe("low");
    });

    it("should assign low priority to general emails", () => {
      const result = quickCategorize("General inquiry", "contact@company.com");
      expect(result.priority).toBe("low");
    });
  });

  describe("Suggested actions", () => {
    it("should suggest updating shipment tracking for shipping confirmations", () => {
      // Use "tracking" which matches shipping_confirmation
      const result = quickCategorize("Tracking Update - Package dispatched", "tracking@usps.com");
      expect(result.suggestedAction).toBe("Update shipment tracking");
    });

    it("should suggest confirming receipt for delivery notifications", () => {
      // "arrived" matches delivery_notification
      const result = quickCategorize("Your package has arrived", "delivery@fedex.com");
      expect(result.category).toBe("delivery_notification");
      expect(result.suggestedAction).toBe("Confirm receipt and update inventory");
    });

    it("should suggest reviewing and scheduling payment for invoices", () => {
      const result = quickCategorize("Invoice #123", "billing@vendor.com");
      expect(result.suggestedAction).toBe("Review and schedule payment");
    });

    it("should suggest filing for records for receipts", () => {
      const result = quickCategorize("Receipt for your purchase", "noreply@store.com");
      expect(result.suggestedAction).toBe("File for records");
    });

    it("should suggest processing for purchase orders", () => {
      const result = quickCategorize("Purchase Order #PO-001", "procurement@company.com");
      expect(result.suggestedAction).toBe("Process purchase order");
    });

    it("should suggest comparing quotes for freight quotes", () => {
      // "quote" and "freight" match freight_quote pattern
      const result = quickCategorize("Freight Rate Quote Request", "sales@logistics.com");
      expect(result.category).toBe("freight_quote");
      expect(result.suggestedAction).toBe("Compare quotes and select carrier");
    });
  });
});
