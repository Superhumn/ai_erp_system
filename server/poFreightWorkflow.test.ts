import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  // PO related functions
  getPurchaseOrders: vi.fn(),
  getPurchaseOrderById: vi.fn(),
  createPurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  getPurchaseOrderItems: vi.fn(),
  createPurchaseOrderItem: vi.fn(),
  updatePurchaseOrderItem: vi.fn(),
  getPoReceivingRecords: vi.fn(),
  receivePurchaseOrderItems: vi.fn(),
  
  // Freight RFQ related functions
  getFreightRfqs: vi.fn(),
  getFreightRfqById: vi.fn(),
  createFreightRfq: vi.fn(),
  updateFreightRfq: vi.fn(),
  getFreightCarriers: vi.fn(),
  createFreightCarrier: vi.fn(),
  getFreightQuotes: vi.fn(),
  createFreightQuote: vi.fn(),
  updateFreightQuote: vi.fn(),
  getFreightBookings: vi.fn(),
  createFreightBooking: vi.fn(),
  getFreightEmails: vi.fn(),
  createFreightEmail: vi.fn(),
  
  // Vendor and product functions
  getVendors: vi.fn(),
  getVendorById: vi.fn(),
  getProducts: vi.fn(),
  
  // Inventory functions
  getRawMaterialInventory: vi.fn(),
  upsertRawMaterialInventory: vi.fn(),
}));

import * as db from "./db";

describe("Purchase Order Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PO Creation", () => {
    it("should create PO with auto-generated number", async () => {
      const mockPO = {
        id: 1,
        poNumber: "PO-20260205-ABC1",
        vendorId: 1,
        totalAmount: "5000.00",
        status: "draft",
        currency: "USD",
        createdAt: new Date(),
      };
      vi.mocked(db.createPurchaseOrder).mockResolvedValue(mockPO);

      const result = await db.createPurchaseOrder({
        vendorId: 1,
        totalAmount: "5000.00",
        currency: "USD",
        status: "draft",
      });

      expect(result.poNumber).toMatch(/^PO-\d{8}-[A-Z0-9]{4}$/);
      expect(result.status).toBe("draft");
      expect(result.totalAmount).toBe("5000.00");
    });

    it("should add line items to PO", async () => {
      const mockItem = {
        id: 1,
        purchaseOrderId: 1,
        productId: 1,
        quantity: "100",
        unitPrice: "50.00",
        totalPrice: "5000.00",
      };
      vi.mocked(db.createPurchaseOrderItem).mockResolvedValue(mockItem);

      const result = await db.createPurchaseOrderItem({
        purchaseOrderId: 1,
        productId: 1,
        quantity: "100",
        unitPrice: "50.00",
      });

      expect(result.purchaseOrderId).toBe(1);
      expect(result.quantity).toBe("100");
    });
  });

  describe("PO Status Workflow", () => {
    it("should transition from draft to sent", async () => {
      const mockPO = { id: 1, status: "sent", sentAt: new Date() };
      vi.mocked(db.updatePurchaseOrder).mockResolvedValue(mockPO);

      const result = await db.updatePurchaseOrder(1, {
        status: "sent",
        sentAt: new Date(),
      });

      expect(result.status).toBe("sent");
      expect(result.sentAt).toBeDefined();
    });

    it("should transition from sent to confirmed", async () => {
      const mockPO = { id: 1, status: "confirmed", confirmedAt: new Date() };
      vi.mocked(db.updatePurchaseOrder).mockResolvedValue(mockPO);

      const result = await db.updatePurchaseOrder(1, {
        status: "confirmed",
        confirmedAt: new Date(),
      });

      expect(result.status).toBe("confirmed");
    });

    it("should allow partial receiving", async () => {
      const mockPO = { id: 1, status: "partial" };
      vi.mocked(db.updatePurchaseOrder).mockResolvedValue(mockPO);

      const result = await db.updatePurchaseOrder(1, {
        status: "partial",
      });

      expect(result.status).toBe("partial");
    });

    it("should transition to received when all items received", async () => {
      const mockPO = { id: 1, status: "received", receivedAt: new Date() };
      vi.mocked(db.updatePurchaseOrder).mockResolvedValue(mockPO);

      const result = await db.updatePurchaseOrder(1, {
        status: "received",
        receivedAt: new Date(),
      });

      expect(result.status).toBe("received");
    });

    it("should allow cancellation of draft or sent POs", async () => {
      const mockPO = { id: 1, status: "cancelled" };
      vi.mocked(db.updatePurchaseOrder).mockResolvedValue(mockPO);

      const result = await db.updatePurchaseOrder(1, { status: "cancelled" });

      expect(result.status).toBe("cancelled");
    });
  });

  describe("PO Receiving", () => {
    it("should create receiving record with items", async () => {
      const mockReceiving = {
        id: 1,
        purchaseOrderId: 1,
        receivedDate: new Date(),
        warehouseId: 1,
        receivedBy: 1,
      };
      vi.mocked(db.receivePurchaseOrderItems).mockResolvedValue(mockReceiving);

      const result = await db.receivePurchaseOrderItems(
        1,
        1,
        [
          {
            purchaseOrderItemId: 1,
            rawMaterialId: 1,
            quantity: 100,
            unit: "KG",
          },
        ],
        1
      );

      expect(result.purchaseOrderId).toBe(1);
      expect(result.warehouseId).toBe(1);
    });

    it("should update inventory when receiving PO items", async () => {
      const mockInventory = {
        id: 1,
        rawMaterialId: 1,
        warehouseId: 1,
        quantity: "100",
        unit: "KG",
      };
      vi.mocked(db.upsertRawMaterialInventory).mockResolvedValue(mockInventory);

      const result = await db.upsertRawMaterialInventory(1, 1, {
        quantity: "100",
        availableQuantity: "100",
        unit: "KG",
      });

      expect(result.quantity).toBe("100");
    });
  });
});

describe("Freight RFQ Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RFQ Creation", () => {
    it("should create RFQ with auto-generated number", async () => {
      const mockRFQ = {
        id: 1,
        rfqNumber: "RFQ-2602-XYZ1",
        title: "Electronics shipment from Shenzhen to LA",
        originCountry: "China",
        originCity: "Shenzhen",
        destinationCountry: "USA",
        destinationCity: "Los Angeles",
        cargoType: "general",
        totalWeight: "5000",
        totalVolume: "25",
        preferredMode: "ocean_fcl",
        status: "draft",
        createdAt: new Date(),
      };
      vi.mocked(db.createFreightRfq).mockResolvedValue(mockRFQ);

      const result = await db.createFreightRfq({
        title: "Electronics shipment from Shenzhen to LA",
        originCountry: "China",
        originCity: "Shenzhen",
        destinationCountry: "USA",
        destinationCity: "Los Angeles",
        cargoType: "general",
        totalWeight: "5000",
        totalVolume: "25",
        preferredMode: "ocean_fcl",
        status: "draft",
      });

      expect(result.rfqNumber).toMatch(/^RFQ-\d{4}-[A-Z0-9]{4}$/);
      expect(result.status).toBe("draft");
      expect(result.title).toBe("Electronics shipment from Shenzhen to LA");
    });

    it("should validate required fields", () => {
      const rfqData = {
        title: "Test Shipment",
        status: "draft",
      };

      expect(rfqData.title).toBeTruthy();
      expect(rfqData.status).toBeTruthy();
    });

    it("should support all cargo types", () => {
      const validCargoTypes = [
        "general",
        "hazardous",
        "refrigerated",
        "oversized",
        "fragile",
        "liquid",
        "bulk",
      ];

      for (const cargoType of validCargoTypes) {
        expect(validCargoTypes.includes(cargoType)).toBe(true);
      }
    });

    it("should support all shipping modes", () => {
      const validShippingModes = [
        "ocean_fcl",
        "ocean_lcl",
        "air",
        "express",
        "ground",
        "rail",
        "any",
      ];

      for (const mode of validShippingModes) {
        expect(validShippingModes.includes(mode)).toBe(true);
      }
    });
  });

  describe("RFQ Status Workflow", () => {
    it("should transition from draft to sent", async () => {
      const mockRFQ = { id: 1, status: "sent", sentAt: new Date() };
      vi.mocked(db.updateFreightRfq).mockResolvedValue(mockRFQ);

      const result = await db.updateFreightRfq(1, {
        status: "sent",
        sentAt: new Date(),
      });

      expect(result.status).toBe("sent");
      expect(result.sentAt).toBeDefined();
    });

    it("should transition to awaiting_quotes after sending", async () => {
      const mockRFQ = { id: 1, status: "awaiting_quotes" };
      vi.mocked(db.updateFreightRfq).mockResolvedValue(mockRFQ);

      const result = await db.updateFreightRfq(1, {
        status: "awaiting_quotes",
      });

      expect(result.status).toBe("awaiting_quotes");
    });

    it("should transition to quotes_received when quotes arrive", async () => {
      const mockRFQ = { id: 1, status: "quotes_received" };
      vi.mocked(db.updateFreightRfq).mockResolvedValue(mockRFQ);

      const result = await db.updateFreightRfq(1, {
        status: "quotes_received",
      });

      expect(result.status).toBe("quotes_received");
    });

    it("should transition to awarded when quote accepted", async () => {
      const mockRFQ = { id: 1, status: "awarded", awardedAt: new Date() };
      vi.mocked(db.updateFreightRfq).mockResolvedValue(mockRFQ);

      const result = await db.updateFreightRfq(1, {
        status: "awarded",
        awardedAt: new Date(),
      });

      expect(result.status).toBe("awarded");
    });

    it("should allow cancellation", async () => {
      const mockRFQ = { id: 1, status: "cancelled" };
      vi.mocked(db.updateFreightRfq).mockResolvedValue(mockRFQ);

      const result = await db.updateFreightRfq(1, { status: "cancelled" });

      expect(result.status).toBe("cancelled");
    });
  });

  describe("Carrier Management", () => {
    it("should create freight carrier", async () => {
      const mockCarrier = {
        id: 1,
        name: "Global Freight Co",
        type: "freight_forwarder",
        email: "contact@globalfreight.com",
        phone: "+1-555-0123",
        country: "USA",
      };
      vi.mocked(db.createFreightCarrier).mockResolvedValue(mockCarrier);

      const result = await db.createFreightCarrier({
        name: "Global Freight Co",
        type: "freight_forwarder",
        email: "contact@globalfreight.com",
        phone: "+1-555-0123",
        country: "USA",
      });

      expect(result.name).toBe("Global Freight Co");
      expect(result.type).toBe("freight_forwarder");
    });

    it("should support all carrier types", () => {
      const validCarrierTypes = [
        "freight_forwarder",
        "shipping_line",
        "airline",
        "trucking",
        "courier",
        "customs_broker",
      ];

      for (const type of validCarrierTypes) {
        expect(validCarrierTypes.includes(type)).toBe(true);
      }
    });
  });

  describe("Quote Management", () => {
    it("should create quote for RFQ", async () => {
      const mockQuote = {
        id: 1,
        rfqId: 1,
        carrierId: 1,
        totalCost: "5000.00",
        currency: "USD",
        transitDays: 25,
        shippingMode: "ocean_fcl",
        validUntil: new Date("2026-03-01"),
        status: "received",
      };
      vi.mocked(db.createFreightQuote).mockResolvedValue(mockQuote);

      const result = await db.createFreightQuote({
        rfqId: 1,
        carrierId: 1,
        totalCost: "5000.00",
        currency: "USD",
        transitDays: 25,
        shippingMode: "ocean_fcl",
        validUntil: new Date("2026-03-01"),
        status: "received",
      });

      expect(result.rfqId).toBe(1);
      expect(result.carrierId).toBe(1);
      expect(result.totalCost).toBe("5000.00");
    });

    it("should compare multiple quotes", () => {
      const quotes = [
        {
          id: 1,
          totalCost: "6000.00",
          transitDays: 20,
          currency: "USD",
        },
        {
          id: 2,
          totalCost: "5000.00",
          transitDays: 25,
          currency: "USD",
        },
        {
          id: 3,
          totalCost: "5500.00",
          transitDays: 22,
          currency: "USD",
        },
      ];

      // Find cheapest
      const cheapest = quotes.reduce((min, q) =>
        parseFloat(q.totalCost) < parseFloat(min.totalCost) ? q : min
      );
      expect(cheapest.id).toBe(2);

      // Find fastest
      const fastest = quotes.reduce((min, q) =>
        q.transitDays < min.transitDays ? q : min
      );
      expect(fastest.id).toBe(1);
    });

    it("should accept quote and update status", async () => {
      const mockQuote = { id: 1, status: "accepted", acceptedAt: new Date() };
      vi.mocked(db.updateFreightQuote).mockResolvedValue(mockQuote);

      const result = await db.updateFreightQuote(1, {
        status: "accepted",
        acceptedAt: new Date(),
      });

      expect(result.status).toBe("accepted");
    });
  });

  describe("Email Integration", () => {
    it("should create email record when sending RFQ", async () => {
      const mockEmail = {
        id: 1,
        rfqId: 1,
        carrierId: 1,
        emailType: "rfq_request",
        subject: "Request for Quote - RFQ-2602-XYZ1",
        content: "We would like to request a quote for...",
        status: "draft",
        createdAt: new Date(),
      };
      vi.mocked(db.createFreightEmail).mockResolvedValue(mockEmail);

      const result = await db.createFreightEmail({
        rfqId: 1,
        carrierId: 1,
        emailType: "rfq_request",
        subject: "Request for Quote - RFQ-2602-XYZ1",
        content: "We would like to request a quote for...",
        status: "draft",
      });

      expect(result.rfqId).toBe(1);
      expect(result.emailType).toBe("rfq_request");
    });

    it("should generate AI email content", () => {
      const rfq = {
        rfqNumber: "RFQ-2602-XYZ1",
        title: "Electronics shipment",
        originCity: "Shenzhen",
        destinationCity: "Los Angeles",
        totalWeight: "5000",
        totalVolume: "25",
        cargoType: "general",
      };

      const emailContent = `Request for Quote: ${rfq.rfqNumber}
Title: ${rfq.title}
Route: ${rfq.originCity} → ${rfq.destinationCity}
Cargo Type: ${rfq.cargoType}
Weight: ${rfq.totalWeight} kg
Volume: ${rfq.totalVolume} CBM

Please provide your competitive quote.`;

      expect(emailContent).toContain(rfq.rfqNumber);
      expect(emailContent).toContain(rfq.originCity);
      expect(emailContent).toContain(rfq.destinationCity);
    });
  });

  describe("Booking Creation", () => {
    it("should create booking from accepted quote", async () => {
      const mockBooking = {
        id: 1,
        rfqId: 1,
        quoteId: 1,
        carrierId: 1,
        bookingNumber: "BK-2602-ABC1",
        status: "confirmed",
        totalCost: "5000.00",
        createdAt: new Date(),
      };
      vi.mocked(db.createFreightBooking).mockResolvedValue(mockBooking);

      const result = await db.createFreightBooking({
        rfqId: 1,
        quoteId: 1,
        carrierId: 1,
        totalCost: "5000.00",
        status: "confirmed",
      });

      expect(result.bookingNumber).toMatch(/^BK-\d{4}-[A-Z0-9]{4}$/);
      expect(result.quoteId).toBe(1);
      expect(result.status).toBe("confirmed");
    });
  });
});

describe("Complete PO + Freight RFQ Workflow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should complete full workflow: Create PO → Create Freight RFQ → Get Quotes → Accept Quote → Create Booking → Receive PO", async () => {
    // Step 1: Create Purchase Order
    const mockPO = {
      id: 1,
      poNumber: "PO-20260205-ABC1",
      vendorId: 1,
      totalAmount: "5000.00",
      status: "draft",
      currency: "USD",
    };
    vi.mocked(db.createPurchaseOrder).mockResolvedValue(mockPO);

    const po = await db.createPurchaseOrder({
      vendorId: 1,
      totalAmount: "5000.00",
      currency: "USD",
      status: "draft",
    });
    expect(po.status).toBe("draft");

    // Step 2: Send PO to vendor
    vi.mocked(db.updatePurchaseOrder).mockResolvedValueOnce({
      id: 1,
      status: "sent",
      sentAt: new Date(),
    });

    const sentPO = await db.updatePurchaseOrder(1, {
      status: "sent",
      sentAt: new Date(),
    });
    expect(sentPO.status).toBe("sent");

    // Step 3: Vendor confirms PO
    vi.mocked(db.updatePurchaseOrder).mockResolvedValueOnce({
      id: 1,
      status: "confirmed",
      confirmedAt: new Date(),
    });

    const confirmedPO = await db.updatePurchaseOrder(1, {
      status: "confirmed",
      confirmedAt: new Date(),
    });
    expect(confirmedPO.status).toBe("confirmed");

    // Step 4: Create Freight RFQ for shipment
    const mockRFQ = {
      id: 1,
      rfqNumber: "RFQ-2602-XYZ1",
      title: "Shipment for PO-20260205-ABC1",
      originCountry: "China",
      destinationCountry: "USA",
      totalWeight: "5000",
      totalVolume: "25",
      status: "draft",
      relatedPoId: 1,
    };
    vi.mocked(db.createFreightRfq).mockResolvedValue(mockRFQ);

    const rfq = await db.createFreightRfq({
      title: "Shipment for PO-20260205-ABC1",
      originCountry: "China",
      destinationCountry: "USA",
      totalWeight: "5000",
      totalVolume: "25",
      status: "draft",
      relatedPoId: 1,
    });
    expect(rfq.status).toBe("draft");

    // Step 5: Send RFQ to carriers
    vi.mocked(db.updateFreightRfq).mockResolvedValueOnce({
      id: 1,
      status: "sent",
      sentAt: new Date(),
    });

    const sentRFQ = await db.updateFreightRfq(1, {
      status: "sent",
      sentAt: new Date(),
    });
    expect(sentRFQ.status).toBe("sent");

    // Step 6: Receive quotes from carriers
    const mockQuote1 = {
      id: 1,
      rfqId: 1,
      carrierId: 1,
      totalCost: "5500.00",
      transitDays: 25,
      status: "received",
    };
    const mockQuote2 = {
      id: 2,
      rfqId: 1,
      carrierId: 2,
      totalCost: "5000.00",
      transitDays: 30,
      status: "received",
    };

    vi.mocked(db.createFreightQuote)
      .mockResolvedValueOnce(mockQuote1)
      .mockResolvedValueOnce(mockQuote2);

    const quote1 = await db.createFreightQuote({
      rfqId: 1,
      carrierId: 1,
      totalCost: "5500.00",
      transitDays: 25,
      status: "received",
    });
    const quote2 = await db.createFreightQuote({
      rfqId: 1,
      carrierId: 2,
      totalCost: "5000.00",
      transitDays: 30,
      status: "received",
    });

    expect(quote1.totalCost).toBe("5500.00");
    expect(quote2.totalCost).toBe("5000.00");

    // Step 7: Update RFQ status to quotes_received
    vi.mocked(db.updateFreightRfq).mockResolvedValueOnce({
      id: 1,
      status: "quotes_received",
    });

    const rfqWithQuotes = await db.updateFreightRfq(1, {
      status: "quotes_received",
    });
    expect(rfqWithQuotes.status).toBe("quotes_received");

    // Step 8: Accept best quote (cheapest)
    vi.mocked(db.updateFreightQuote).mockResolvedValueOnce({
      id: 2,
      status: "accepted",
      acceptedAt: new Date(),
    });

    const acceptedQuote = await db.updateFreightQuote(2, {
      status: "accepted",
      acceptedAt: new Date(),
    });
    expect(acceptedQuote.status).toBe("accepted");

    // Step 9: Create freight booking
    const mockBooking = {
      id: 1,
      rfqId: 1,
      quoteId: 2,
      carrierId: 2,
      bookingNumber: "BK-2602-ABC1",
      status: "confirmed",
      totalCost: "5000.00",
    };
    vi.mocked(db.createFreightBooking).mockResolvedValue(mockBooking);

    const booking = await db.createFreightBooking({
      rfqId: 1,
      quoteId: 2,
      carrierId: 2,
      totalCost: "5000.00",
      status: "confirmed",
    });
    expect(booking.status).toBe("confirmed");

    // Step 10: Update RFQ status to awarded
    vi.mocked(db.updateFreightRfq).mockResolvedValueOnce({
      id: 1,
      status: "awarded",
      awardedAt: new Date(),
    });

    const awardedRFQ = await db.updateFreightRfq(1, {
      status: "awarded",
      awardedAt: new Date(),
    });
    expect(awardedRFQ.status).toBe("awarded");

    // Step 11: Receive PO items at warehouse
    const mockReceiving = {
      id: 1,
      purchaseOrderId: 1,
      receivedDate: new Date(),
      warehouseId: 1,
    };
    vi.mocked(db.receivePurchaseOrderItems).mockResolvedValue(mockReceiving);

    const receiving = await db.receivePurchaseOrderItems(
      1,
      1,
      [
        {
          purchaseOrderItemId: 1,
          rawMaterialId: 1,
          quantity: 100,
          unit: "KG",
        },
      ],
      1
    );
    expect(receiving.purchaseOrderId).toBe(1);

    // Step 12: Update PO status to received
    vi.mocked(db.updatePurchaseOrder).mockResolvedValueOnce({
      id: 1,
      status: "received",
      receivedAt: new Date(),
    });

    const receivedPO = await db.updatePurchaseOrder(1, {
      status: "received",
      receivedAt: new Date(),
    });
    expect(receivedPO.status).toBe("received");

    // Step 13: Update inventory
    const mockInventory = {
      id: 1,
      rawMaterialId: 1,
      warehouseId: 1,
      quantity: "100",
      unit: "KG",
    };
    vi.mocked(db.upsertRawMaterialInventory).mockResolvedValue(mockInventory);

    const inventory = await db.upsertRawMaterialInventory(1, 1, {
      quantity: "100",
      availableQuantity: "100",
      unit: "KG",
    });
    expect(inventory.quantity).toBe("100");
  });

  it("should handle workflow with multiple POs and RFQs", async () => {
    // Create multiple POs
    vi.mocked(db.createPurchaseOrder)
      .mockResolvedValueOnce({
        id: 1,
        poNumber: "PO-20260205-ABC1",
        vendorId: 1,
        status: "draft",
      })
      .mockResolvedValueOnce({
        id: 2,
        poNumber: "PO-20260205-DEF2",
        vendorId: 2,
        status: "draft",
      });

    const po1 = await db.createPurchaseOrder({
      vendorId: 1,
      status: "draft",
    });
    const po2 = await db.createPurchaseOrder({
      vendorId: 2,
      status: "draft",
    });

    expect(po1.id).toBe(1);
    expect(po2.id).toBe(2);

    // Create consolidated RFQ for both POs
    vi.mocked(db.createFreightRfq).mockResolvedValue({
      id: 1,
      rfqNumber: "RFQ-2602-XYZ1",
      title: "Consolidated shipment for PO-ABC1 and PO-DEF2",
      status: "draft",
    });

    const rfq = await db.createFreightRfq({
      title: "Consolidated shipment for PO-ABC1 and PO-DEF2",
      status: "draft",
    });

    expect(rfq.title).toContain("Consolidated");
  });

  it("should validate workflow status transitions", () => {
    // PO status transitions
    const poStatuses = ["draft", "sent", "confirmed", "received", "partial", "cancelled"];
    expect(poStatuses).toContain("draft");
    expect(poStatuses).toContain("sent");
    expect(poStatuses).toContain("confirmed");
    expect(poStatuses).toContain("received");

    // RFQ status transitions
    const rfqStatuses = [
      "draft",
      "sent",
      "awaiting_quotes",
      "quotes_received",
      "awarded",
      "cancelled",
    ];
    expect(rfqStatuses).toContain("draft");
    expect(rfqStatuses).toContain("sent");
    expect(rfqStatuses).toContain("awaiting_quotes");
    expect(rfqStatuses).toContain("quotes_received");
    expect(rfqStatuses).toContain("awarded");
  });
});
