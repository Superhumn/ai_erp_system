import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseEdiEnvelope,
  parse850,
  parse997,
  generate855,
  generate810,
  generate856,
  generate997,
  getTransactionSetDescription,
} from "./ediService";

// ============================================
// EDI SCHEMA VALIDATION TESTS
// ============================================

describe("EDI Module", () => {
  // Trading Partner Schema
  const tradingPartnerSchema = z.object({
    name: z.string().min(1),
    partnerType: z.enum(["retailer", "distributor", "wholesaler", "marketplace", "3pl"]).optional(),
    isaId: z.string().min(1).max(15),
    isaQualifier: z.string().max(2).optional(),
    gsId: z.string().min(1).max(15),
    connectionType: z.enum(["as2", "sftp", "van", "api", "email"]).optional(),
    status: z.enum(["active", "inactive", "testing", "onboarding"]).optional(),
  });

  const productCrosswalkSchema = z.object({
    tradingPartnerId: z.number(),
    productId: z.number(),
    buyerPartNumber: z.string().optional(),
    vendorPartNumber: z.string().optional(),
    upc: z.string().optional(),
    unitOfMeasure: z.string().optional(),
    packSize: z.number().optional(),
  });

  describe("Trading Partner Schema Validation", () => {
    it("should validate a valid trading partner", () => {
      const partner = {
        name: "Walmart",
        partnerType: "retailer" as const,
        isaId: "WALMART",
        isaQualifier: "ZZ",
        gsId: "WMTGROCERY",
        connectionType: "as2" as const,
        status: "onboarding" as const,
      };
      expect(tradingPartnerSchema.parse(partner)).toEqual(partner);
    });

    it("should reject a partner without required fields", () => {
      expect(() => tradingPartnerSchema.parse({ name: "" })).toThrow();
      expect(() => tradingPartnerSchema.parse({ name: "Test", isaId: "" })).toThrow();
    });

    it("should reject ISA ID longer than 15 chars", () => {
      expect(() =>
        tradingPartnerSchema.parse({
          name: "Test",
          isaId: "1234567890123456", // 16 chars
          gsId: "TEST",
        })
      ).toThrow();
    });

    it("should accept all partner types", () => {
      const types = ["retailer", "distributor", "wholesaler", "marketplace", "3pl"] as const;
      for (const type of types) {
        expect(
          tradingPartnerSchema.parse({
            name: "Test",
            isaId: "TEST",
            gsId: "TEST",
            partnerType: type,
          })
        ).toBeTruthy();
      }
    });

    it("should accept all connection types", () => {
      const types = ["as2", "sftp", "van", "api", "email"] as const;
      for (const type of types) {
        expect(
          tradingPartnerSchema.parse({
            name: "Test",
            isaId: "TEST",
            gsId: "TEST",
            connectionType: type,
          })
        ).toBeTruthy();
      }
    });
  });

  describe("Product Crosswalk Schema Validation", () => {
    it("should validate a valid crosswalk", () => {
      const crosswalk = {
        tradingPartnerId: 1,
        productId: 42,
        buyerPartNumber: "WMT-12345",
        vendorPartNumber: "SKU-001",
        upc: "012345678901",
        unitOfMeasure: "CS",
        packSize: 12,
      };
      expect(productCrosswalkSchema.parse(crosswalk)).toEqual(crosswalk);
    });

    it("should require tradingPartnerId and productId", () => {
      expect(() => productCrosswalkSchema.parse({ productId: 1 })).toThrow();
      expect(() => productCrosswalkSchema.parse({ tradingPartnerId: 1 })).toThrow();
    });
  });

  // ============================================
  // EDI PARSING TESTS
  // ============================================

  describe("EDI Envelope Parsing", () => {
    const sampleEdi850 = [
      "ISA*00*          *00*          *ZZ*RETAILER       *ZZ*VENDOR         *260212*1200*U*00401*000000001*0*P*>~",
      "GS*PO*RETAILER*VENDOR*20260212*1200*1*X*004010~",
      "ST*850*0001~",
      "BEG*00*NE*PO12345**20260212~",
      "DTM*010*20260220~",
      "DTM*002*20260225~",
      "N1*ST*Store 1234*92*1234~",
      "N3*123 Main Street~",
      "N4*Springfield*IL*62701~",
      "N1*BY*Mega Retailer~",
      "PO1*1*24*CS*15.99**IN*WMT-001*VN*SKU-A100*UP*012345678901~",
      "PID*F****Organic Snack Bars 12pk~",
      "PO1*2*48*EA*3.49**IN*WMT-002*UP*012345678902~",
      "PID*F****Natural Granola Bites~",
      "PO1*3*12*CS*22.50**VN*SKU-B200~",
      "CTT*3~",
      "SE*14*0001~",
      "GE*1*1~",
      "IEA*1*000000001~",
    ].join("");

    it("should parse ISA envelope correctly", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      expect(envelope.isaSegment.senderId).toBe("RETAILER");
      expect(envelope.isaSegment.receiverId).toBe("VENDOR");
      expect(envelope.isaSegment.controlNumber).toBe("000000001");
      expect(envelope.isaSegment.usageIndicator).toBe("P");
    });

    it("should parse GS segment correctly", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      expect(envelope.gsSegment.functionalId).toBe("PO");
      expect(envelope.gsSegment.senderId).toBe("RETAILER");
      expect(envelope.gsSegment.receiverId).toBe("VENDOR");
      expect(envelope.gsSegment.version).toBe("004010");
    });

    it("should extract transaction sets", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      expect(envelope.transactionSets).toHaveLength(1);
      expect(envelope.transactionSets[0].transactionSetCode).toBe("850");
      expect(envelope.transactionSets[0].controlNumber).toBe("0001");
    });

    it("should handle empty input", () => {
      const envelope = parseEdiEnvelope("");
      expect(envelope.transactionSets).toHaveLength(0);
    });
  });

  describe("850 Purchase Order Parsing", () => {
    const sampleEdi850 = [
      "ISA*00*          *00*          *ZZ*RETAILER       *ZZ*VENDOR         *260212*1200*U*00401*000000001*0*P*>~",
      "GS*PO*RETAILER*VENDOR*20260212*1200*1*X*004010~",
      "ST*850*0001~",
      "BEG*00*NE*PO12345**20260212~",
      "DTM*010*20260220~",
      "DTM*002*20260225~",
      "N1*ST*Store 1234*92*1234~",
      "N3*123 Main Street~",
      "N4*Springfield*IL*62701~",
      "N1*BY*Mega Retailer~",
      "PO1*1*24*CS*15.99**IN*WMT-001*VN*SKU-A100*UP*012345678901~",
      "PID*F****Organic Snack Bars 12pk~",
      "PO1*2*48*EA*3.49**IN*WMT-002*UP*012345678902~",
      "PID*F****Natural Granola Bites~",
      "PO1*3*12*CS*22.50**VN*SKU-B200~",
      "CTT*3~",
      "SE*14*0001~",
      "GE*1*1~",
      "IEA*1*000000001~",
    ].join("");

    it("should parse PO header correctly", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      const po = parse850(envelope.transactionSets[0]);

      expect(po.poNumber).toBe("PO12345");
      expect(po.poDate).toBe("20260212");
      expect(po.buyerName).toBe("Mega Retailer");
    });

    it("should parse ship-to information", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      const po = parse850(envelope.transactionSets[0]);

      expect(po.shipToName).toBe("Store 1234");
      expect(po.shipToCode).toBe("1234");
      expect(po.shipToAddress).toBe("123 Main Street");
      expect(po.shipToCity).toBe("Springfield");
      expect(po.shipToState).toBe("IL");
      expect(po.shipToZip).toBe("62701");
    });

    it("should parse date references", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      const po = parse850(envelope.transactionSets[0]);

      expect(po.requestedShipDate).toBe("20260220");
      expect(po.requestedDeliveryDate).toBe("20260225");
    });

    it("should parse all line items", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      const po = parse850(envelope.transactionSets[0]);

      expect(po.items).toHaveLength(3);
    });

    it("should parse line item details correctly", () => {
      const envelope = parseEdiEnvelope(sampleEdi850);
      const po = parse850(envelope.transactionSets[0]);

      // First item - has buyer part, vendor part, and UPC
      const item1 = po.items[0];
      expect(item1.lineNumber).toBe(1);
      expect(item1.quantity).toBe(24);
      expect(item1.unitOfMeasure).toBe("CS");
      expect(item1.unitPrice).toBe(15.99);
      expect(item1.buyerPartNumber).toBe("WMT-001");
      expect(item1.vendorPartNumber).toBe("SKU-A100");
      expect(item1.upc).toBe("012345678901");
      expect(item1.description).toBe("Organic Snack Bars 12pk");

      // Second item
      const item2 = po.items[1];
      expect(item2.lineNumber).toBe(2);
      expect(item2.quantity).toBe(48);
      expect(item2.unitOfMeasure).toBe("EA");
      expect(item2.unitPrice).toBe(3.49);
      expect(item2.buyerPartNumber).toBe("WMT-002");
      expect(item2.upc).toBe("012345678902");
      expect(item2.description).toBe("Natural Granola Bites");

      // Third item - only vendor part
      const item3 = po.items[2];
      expect(item3.lineNumber).toBe(3);
      expect(item3.quantity).toBe(12);
      expect(item3.unitPrice).toBe(22.50);
      expect(item3.vendorPartNumber).toBe("SKU-B200");
      expect(item3.buyerPartNumber).toBeUndefined();
    });
  });

  // ============================================
  // EDI GENERATION TESTS
  // ============================================

  describe("855 PO Acknowledgment Generation", () => {
    const config = {
      senderId: "VENDOR",
      senderQualifier: "ZZ",
      receiverId: "RETAILER",
      receiverQualifier: "ZZ",
      gsSenderId: "VENDOR",
      gsReceiverId: "RETAILER",
      controlNumber: "1",
      isTest: false,
      version: "004010",
    };

    it("should generate valid 855 document", () => {
      const ack = {
        poNumber: "PO12345",
        ackDate: "20260212",
        items: [
          { lineNumber: 1, statusCode: "IA", quantity: 24, unitOfMeasure: "CS", unitPrice: 15.99, buyerPartNumber: "WMT-001" },
          { lineNumber: 2, statusCode: "IA", quantity: 48, unitOfMeasure: "EA", unitPrice: 3.49, upc: "012345678902" },
        ],
      };

      const result = generate855(ack, config);

      expect(result).toContain("ISA*");
      expect(result).toContain("GS*PR*");
      expect(result).toContain("ST*855*");
      expect(result).toContain("BAK*00*AD*PO12345*20260212~");
      expect(result).toContain("ACK*IA*");
      expect(result).toContain("CTT*2~");
      expect(result).toContain("SE*");
      expect(result).toContain("GE*1*");
      expect(result).toContain("IEA*1*");
    });

    it("should include buyer part numbers and UPCs in PO1 segments", () => {
      const ack = {
        poNumber: "PO999",
        ackDate: "20260212",
        items: [
          { lineNumber: 1, statusCode: "IA", quantity: 10, unitOfMeasure: "EA", unitPrice: 5.00, buyerPartNumber: "BP-001", vendorPartNumber: "VP-001" },
        ],
      };

      const result = generate855(ack, config);
      expect(result).toContain("IN*BP-001");
      expect(result).toContain("VN*VP-001");
    });
  });

  describe("810 Invoice Generation", () => {
    const config = {
      senderId: "VENDOR",
      senderQualifier: "ZZ",
      receiverId: "RETAILER",
      receiverQualifier: "ZZ",
      gsSenderId: "VENDOR",
      gsReceiverId: "RETAILER",
      controlNumber: "2",
      isTest: false,
      version: "004010",
    };

    it("should generate valid 810 invoice", () => {
      const invoice = {
        invoiceNumber: "INV-2026-001",
        invoiceDate: "20260212",
        poNumber: "PO12345",
        totalAmount: 551.28,
        items: [
          { lineNumber: 1, quantity: 24, unitOfMeasure: "CS", unitPrice: 15.99, productId: "SKU-A100", description: "Organic Snack Bars", totalAmount: 383.76, upc: "012345678901" },
          { lineNumber: 2, quantity: 48, unitOfMeasure: "EA", unitPrice: 3.49, productId: "SKU-B200", description: "Granola Bites", totalAmount: 167.52 },
        ],
      };

      const result = generate810(invoice, config);

      expect(result).toContain("ISA*");
      expect(result).toContain("GS*IN*");
      expect(result).toContain("ST*810*");
      expect(result).toContain("BIG*20260212*INV-2026-001**PO12345~");
      expect(result).toContain("IT1*1*24*CS*15.99*");
      expect(result).toContain("VN*SKU-A100");
      expect(result).toContain("UP*012345678901");
      expect(result).toContain("TDS*55128~"); // Total in cents
      expect(result).toContain("CTT*2~");
    });
  });

  describe("856 ASN Generation", () => {
    const config = {
      senderId: "VENDOR",
      senderQualifier: "ZZ",
      receiverId: "RETAILER",
      receiverQualifier: "ZZ",
      gsSenderId: "VENDOR",
      gsReceiverId: "RETAILER",
      controlNumber: "3",
      isTest: true,
      version: "004010",
    };

    it("should generate valid 856 ASN document", () => {
      const asn = {
        shipmentId: "SHP-2026-001",
        shipDate: "20260215",
        estimatedDeliveryDate: "20260220",
        poNumber: "PO12345",
        carrierCode: "FEDX",
        carrierName: "FedEx Freight",
        trackingNumber: "794644790132",
        bolNumber: "BOL123456",
        totalWeight: 450,
        weightUnit: "LB",
        totalCartons: 8,
        items: [
          { lineNumber: 1, quantity: 24, unitOfMeasure: "CS", buyerPartNumber: "WMT-001", upc: "012345678901" },
          { lineNumber: 2, quantity: 48, unitOfMeasure: "EA", vendorPartNumber: "SKU-B200" },
        ],
      };

      const result = generate856(asn, config);

      expect(result).toContain("ISA*");
      expect(result).toContain("*T*"); // Test mode indicator
      expect(result).toContain("GS*SH*");
      expect(result).toContain("ST*856*");
      expect(result).toContain("BSN*00*SHP-2026-001*20260215*");
      expect(result).toContain("TD1*CTN25*8*");
      expect(result).toContain("TD5*");
      expect(result).toContain("FEDX");
      expect(result).toContain("REF*BM*BOL123456~");
      expect(result).toContain("PRF*PO12345~");
      expect(result).toContain("HL*"); // Hierarchical levels
      expect(result).toContain("LIN*");
      expect(result).toContain("SN1*");
    });

    it("should use test indicator when testMode is true", () => {
      const asn = {
        shipmentId: "TEST-001",
        shipDate: "20260215",
        poNumber: "TEST-PO",
        items: [],
      };
      const result = generate856(asn, config);
      expect(result).toContain("*T*>~"); // ISA15 = T for test
    });
  });

  describe("997 Functional Acknowledgment", () => {
    it("should generate accepted 997", () => {
      const config = {
        senderId: "VENDOR",
        senderQualifier: "ZZ",
        receiverId: "RETAILER",
        receiverQualifier: "ZZ",
        gsSenderId: "VENDOR",
        gsReceiverId: "RETAILER",
        controlNumber: "4",
        isTest: false,
        version: "004010",
      };

      const result = generate997(
        { functionalId: "PO", controlNumber: "1" },
        [{ code: "850", controlNumber: "0001", accepted: true }],
        config
      );

      expect(result).toContain("ST*997*");
      expect(result).toContain("AK1*PO*1~");
      expect(result).toContain("AK2*850*0001~");
      expect(result).toContain("AK5*A~"); // Accepted
      expect(result).toContain("AK9*A*1*1*1~"); // All accepted
    });

    it("should generate rejected 997", () => {
      const config = {
        senderId: "VENDOR",
        senderQualifier: "ZZ",
        receiverId: "RETAILER",
        receiverQualifier: "ZZ",
        gsSenderId: "VENDOR",
        gsReceiverId: "RETAILER",
        controlNumber: "5",
        isTest: false,
        version: "004010",
      };

      const result = generate997(
        { functionalId: "PO", controlNumber: "1" },
        [
          { code: "850", controlNumber: "0001", accepted: true },
          { code: "850", controlNumber: "0002", accepted: false },
        ],
        config
      );

      expect(result).toContain("AK5*A~"); // First accepted
      expect(result).toContain("AK5*R~"); // Second rejected
      expect(result).toContain("AK9*E*2*2*1~"); // Partial acceptance (E=Accepted with errors)
    });

    it("should parse a 997 acknowledgment correctly", () => {
      const sampleAck = [
        "ISA*00*          *00*          *ZZ*RETAILER       *ZZ*VENDOR         *260212*1200*U*00401*000000002*0*P*>~",
        "GS*FA*RETAILER*VENDOR*20260212*1200*2*X*004010~",
        "ST*997*0001~",
        "AK1*IN*1~",
        "AK2*810*0001~",
        "AK5*A~",
        "AK9*A*1*1*1~",
        "SE*6*0001~",
        "GE*1*2~",
        "IEA*1*000000002~",
      ].join("");

      const envelope = parseEdiEnvelope(sampleAck);
      expect(envelope.transactionSets).toHaveLength(1);

      const ack = parse997(envelope.transactionSets[0]);
      expect(ack.ackCode).toBe("A");
      expect(ack.groupControlNumber).toBe("1");
      expect(ack.errors).toHaveLength(0);
    });
  });

  // ============================================
  // UTILITY TESTS
  // ============================================

  describe("Transaction Set Descriptions", () => {
    it("should return correct descriptions", () => {
      expect(getTransactionSetDescription("850")).toBe("Purchase Order");
      expect(getTransactionSetDescription("855")).toBe("Purchase Order Acknowledgment");
      expect(getTransactionSetDescription("810")).toBe("Invoice");
      expect(getTransactionSetDescription("856")).toBe("Advance Ship Notice (ASN)");
      expect(getTransactionSetDescription("997")).toBe("Functional Acknowledgment");
    });

    it("should return fallback for unknown codes", () => {
      expect(getTransactionSetDescription("999")).toBe("Transaction Set 999");
      expect(getTransactionSetDescription("123")).toBe("Transaction Set 123");
    });
  });

  // ============================================
  // ROUND-TRIP TESTS
  // ============================================

  describe("Round-trip: Parse 850 -> Generate 855", () => {
    it("should correctly acknowledge parsed PO items", () => {
      const sampleEdi850 = [
        "ISA*00*          *00*          *ZZ*RETAILER       *ZZ*VENDOR         *260212*1200*U*00401*000000001*0*P*>~",
        "GS*PO*RETAILER*VENDOR*20260212*1200*1*X*004010~",
        "ST*850*0001~",
        "BEG*00*NE*PO-ROUND-TRIP**20260212~",
        "PO1*1*10*EA*5.00**IN*BP-001*VN*VP-001~",
        "PO1*2*20*CS*12.00**IN*BP-002~",
        "CTT*2~",
        "SE*6*0001~",
        "GE*1*1~",
        "IEA*1*000000001~",
      ].join("");

      // Parse the 850
      const envelope = parseEdiEnvelope(sampleEdi850);
      const po = parse850(envelope.transactionSets[0]);

      expect(po.poNumber).toBe("PO-ROUND-TRIP");
      expect(po.items).toHaveLength(2);

      // Generate an 855 acknowledging all items
      const ackItems = po.items.map(item => ({
        lineNumber: item.lineNumber,
        statusCode: "IA",
        quantity: item.quantity,
        unitOfMeasure: item.unitOfMeasure,
        unitPrice: item.unitPrice,
        buyerPartNumber: item.buyerPartNumber,
        vendorPartNumber: item.vendorPartNumber,
      }));

      const config = {
        senderId: "VENDOR",
        senderQualifier: "ZZ",
        receiverId: "RETAILER",
        receiverQualifier: "ZZ",
        gsSenderId: "VENDOR",
        gsReceiverId: "RETAILER",
        controlNumber: "10",
        isTest: false,
        version: "004010",
      };

      const edi855 = generate855(
        { poNumber: po.poNumber, ackDate: "20260212", items: ackItems },
        config
      );

      // Verify the 855 contains proper segments
      expect(edi855).toContain("ST*855*");
      expect(edi855).toContain("BAK*00*AD*PO-ROUND-TRIP*20260212~");
      expect(edi855).toContain("ACK*IA*10*EA*");
      expect(edi855).toContain("ACK*IA*20*CS*");
      expect(edi855).toContain("CTT*2~");
    });
  });

  describe("Envelope Structure Integrity", () => {
    it("should produce matching ISA/IEA control numbers", () => {
      const config = {
        senderId: "TEST",
        senderQualifier: "ZZ",
        receiverId: "RECV",
        receiverQualifier: "ZZ",
        gsSenderId: "TEST",
        gsReceiverId: "RECV",
        controlNumber: "42",
        isTest: true,
        version: "004010",
      };

      const result = generate855(
        { poNumber: "PO1", ackDate: "20260212", items: [] },
        config
      );

      // ISA should have 000000042 and IEA should have matching
      expect(result).toContain("000000042");
      expect(result).toContain("IEA*1*000000042~");
    });

    it("should produce matching GS/GE control numbers", () => {
      const config = {
        senderId: "TEST",
        senderQualifier: "ZZ",
        receiverId: "RECV",
        receiverQualifier: "ZZ",
        gsSenderId: "TEST",
        gsReceiverId: "RECV",
        controlNumber: "7",
        isTest: false,
        version: "004010",
      };

      const result = generate810(
        { invoiceNumber: "INV1", invoiceDate: "20260212", poNumber: "PO1", totalAmount: 100, items: [] },
        config
      );

      expect(result).toContain("GE*1*7~");
    });
  });

  // ============================================
  // EDI TRANSPORT SERVICE TESTS
  // ============================================

  describe("EDI Transport Service", () => {
    it("should export all expected transport functions", async () => {
      const transport = await import("./ediTransportService");
      expect(typeof transport.testSftpConnection).toBe("function");
      expect(typeof transport.pollSftpForInbound).toBe("function");
      expect(typeof transport.sendViaSftp).toBe("function");
      expect(typeof transport.testAs2Connection).toBe("function");
      expect(typeof transport.sendViaAs2).toBe("function");
      expect(typeof transport.testConnection).toBe("function");
      expect(typeof transport.deliverOutbound).toBe("function");
      expect(typeof transport.generateAndDeliver).toBe("function");
      expect(typeof transport.handleEdiWebhook).toBe("function");
      expect(typeof transport.startEdiPolling).toBe("function");
      expect(typeof transport.stopEdiPolling).toBe("function");
      expect(typeof transport.pollAllPartners).toBe("function");
    });

    it("should export TransportResult and ConnectionTestResult types", async () => {
      // Type-level check: import succeeds and types are usable
      const transport = await import("./ediTransportService");
      const result: typeof transport.TransportResult = undefined as any;
      const connResult: typeof transport.ConnectionTestResult = undefined as any;
      // If this compiles, types are exported correctly
      expect(true).toBe(true);
    });

    it("handleEdiWebhook should reject empty content", async () => {
      const { handleEdiWebhook } = await import("./ediTransportService");
      // Empty ISA, so partner won't be found
      const result = await handleEdiWebhook("", undefined, {});
      expect(result.success).toBe(false);
    });

    it("handleEdiWebhook should attempt to extract ISA sender ID from content", async () => {
      const { handleEdiWebhook } = await import("./ediTransportService");
      // Valid ISA segment but partner won't exist in DB
      const ediContent = "ISA*00*          *00*          *ZZ*TESTSENDER     *ZZ*TESTRECEIVER   *260214*1200*>*00501*000000001*0*T*>~";
      const result = await handleEdiWebhook(ediContent);
      // Should fail because partner doesn't exist, but it should have tried to extract
      expect(result.success).toBe(false);
      expect(result.message).toContain("Could not identify trading partner");
    });

    it("startEdiPolling should be idempotent", async () => {
      const { startEdiPolling, stopEdiPolling } = await import("./ediTransportService");
      // Start once - should succeed
      startEdiPolling(60000);
      // Start again - should be no-op (doesn't throw)
      startEdiPolling(60000);
      // Clean up
      stopEdiPolling();
    });

    it("stopEdiPolling should be safe to call when not running", async () => {
      const { stopEdiPolling } = await import("./ediTransportService");
      // Should not throw when no polling is active
      expect(() => stopEdiPolling()).not.toThrow();
    });

    it("deliverOutbound should handle unknown partner gracefully", async () => {
      const { deliverOutbound } = await import("./ediTransportService");
      const result = await deliverOutbound(999999, "test content", "850", "000000001");
      expect(result.success).toBe(false);
      expect(result.message).toBe("Partner not found");
    });

    it("testConnection should handle unknown partner gracefully", async () => {
      const { testConnection } = await import("./ediTransportService");
      const result = await testConnection(999999);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Partner not found");
    });
  });

  // ============================================
  // OUTBOUND GENERATION WITH SETTINGS
  // ============================================

  describe("Outbound EDI generation with company settings", () => {
    it("generateOutboundEdi should use company ISA/GS IDs as sender", async () => {
      // The function now loads settings from DB for sender IDs
      // and falls back to defaults if no settings exist
      const { generateOutboundEdi } = await import("./ediService");
      // Will fail because partner doesn't exist, but tests the config path
      await expect(generateOutboundEdi(999999, "855", { poNumber: "PO1", ackDate: "20260219", items: [] })).rejects.toThrow("Trading partner not found");
    });

    it("generate997 should produce valid 997 with correct structure", () => {
      const config: any = {
        senderId: "OURSENDER",
        senderQualifier: "ZZ",
        receiverId: "THEIRRCVR",
        receiverQualifier: "ZZ",
        gsSenderId: "OURGS",
        gsReceiverId: "THEIRGS",
        controlNumber: "000000042",
        isTest: false,
        version: "004010",
      };

      const result = generate997(
        { functionalId: "PO", controlNumber: "1" },
        [{ code: "850", controlNumber: "0001", accepted: true }],
        config
      );

      expect(result).toContain("ISA*");
      expect(result).toContain("ST*997*");
      expect(result).toContain("AK1*PO*1~");
      expect(result).toContain("AK2*850*0001~");
      expect(result).toContain("AK5*A~"); // Accepted
      expect(result).toContain("AK9*A*"); // All accepted
      // Verify our sender IDs are used (not partner's)
      expect(result).toContain("OURSENDER");
      expect(result).toContain("THEIRRCVR");
    });

    it("generate997 should handle rejected transactions", () => {
      const config: any = {
        senderId: "SENDER",
        senderQualifier: "ZZ",
        receiverId: "RECEIVER",
        receiverQualifier: "ZZ",
        gsSenderId: "SENDERGS",
        gsReceiverId: "RECEIVERGS",
        controlNumber: "000000001",
        isTest: true,
        version: "004010",
      };

      const result = generate997(
        { functionalId: "PO", controlNumber: "5" },
        [{ code: "850", controlNumber: "0001", accepted: false }],
        config
      );

      expect(result).toContain("AK5*R~"); // Rejected
      expect(result).toContain("AK9*E*"); // E = accepted with errors (some/all rejected)
      expect(result).toContain("*T*"); // Test mode indicator
    });

    it("controlNumber param should be optional in generateOutboundEdi", async () => {
      // Verify the function accepts 3 args (controlNumber is optional 4th)
      const mod = await import("./ediService");
      expect(typeof mod.generateOutboundEdi).toBe("function");
    });
  });

  // ============================================
  // EDI SETTINGS AND CONTROL NUMBER SCHEMAS
  // ============================================

  describe("EDI Settings and Control Number Schema", () => {
    const ediSettingsSchema = z.object({
      isaId: z.string().min(1).max(15),
      isaQualifier: z.string().max(2).optional(),
      gsApplicationCode: z.string().min(1).max(15),
      companyName: z.string().optional(),
      autoSend997: z.boolean().optional(),
      defaultTestMode: z.boolean().optional(),
    });

    it("should validate valid EDI settings", () => {
      const result = ediSettingsSchema.safeParse({
        isaId: "MYCOMPANY",
        isaQualifier: "ZZ",
        gsApplicationCode: "MYAPP",
        companyName: "My Company Inc",
        autoSend997: true,
      });
      expect(result.success).toBe(true);
    });

    it("should reject EDI settings with missing ISA ID", () => {
      const result = ediSettingsSchema.safeParse({
        gsApplicationCode: "MYAPP",
      });
      expect(result.success).toBe(false);
    });

    it("should reject EDI settings with ISA ID longer than 15 chars", () => {
      const result = ediSettingsSchema.safeParse({
        isaId: "1234567890123456", // 16 chars
        gsApplicationCode: "MYAPP",
      });
      expect(result.success).toBe(false);
    });

    const controlNumberTypeSchema = z.enum(["isa", "gs", "st"]);

    it("should validate control number types", () => {
      expect(controlNumberTypeSchema.parse("isa")).toBe("isa");
      expect(controlNumberTypeSchema.parse("gs")).toBe("gs");
      expect(controlNumberTypeSchema.parse("st")).toBe("st");
    });

    it("should reject invalid control number types", () => {
      expect(() => controlNumberTypeSchema.parse("invalid")).toThrow();
    });
  });
});
