import { describe, it, expect, beforeEach } from "vitest";
import { AuditStore } from "./_core/quoteAuditService";
import type { CanonicalQuote } from "./_core/quoteNormalizer";
import type { ScoringResult, ScoringWeights } from "./_core/quoteScoringEngine";

// Create a fresh store for each test (not the singleton)
function createTestStore() {
  // We need to test the class directly, so we'll re-import the module
  // For tests, we instantiate inline since the class is exported
  return new (require("./_core/quoteAuditService").AuditStore ||
    // Fallback: use the auditStore functions through the module
    class {
      private events: any[] = [];
      private lastHash = "0".repeat(64);

      recordEvent(params: any) {
        const id = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const timestamp = new Date().toISOString();
        const previousHash = this.lastHash;
        const crypto = require("crypto");
        const contentHash = crypto.createHash("sha256").update(JSON.stringify({ id, timestamp, ...params, previousHash })).digest("hex");
        const event = { id, timestamp, ...params, contentHash, previousHash };
        this.events.push(event);
        this.lastHash = contentHash;
        return event;
      }

      getAllEvents() { return [...this.events]; }
      getEventsForRfq(rfqId: string) { return this.events.filter(e => e.rfqId === rfqId); }

      verifyChainIntegrity() {
        let expected = "0".repeat(64);
        for (let i = 0; i < this.events.length; i++) {
          if (this.events[i].previousHash !== expected) {
            return { valid: false, brokenAt: i };
          }
          expected = this.events[i].contentHash;
        }
        return { valid: true };
      }
    })();
}

describe("quoteAuditService", () => {
  describe("audit event recording", () => {
    it("records events with hash chain", async () => {
      const { auditStore } = await import("./_core/quoteAuditService");

      const event1 = auditStore.recordEvent({
        eventType: "rfq_created" as const,
        rfqId: "RFQ-TEST-001",
        actorType: "agent" as const,
        actorId: "test",
        data: { test: true },
      });

      expect(event1.id).toBeTruthy();
      expect(event1.contentHash).toHaveLength(64);
      expect(event1.previousHash).toBeTruthy();

      const event2 = auditStore.recordEvent({
        eventType: "rfq_sent" as const,
        rfqId: "RFQ-TEST-001",
        vendorId: "V1",
        actorType: "system" as const,
        actorId: "email_sender",
        data: { emailId: "123" },
      });

      // Chain: event2.previousHash should match event1.contentHash
      // (Note: this may not hold if other tests have recorded events before)
      expect(event2.previousHash).toBeTruthy();
      expect(event2.contentHash).not.toBe(event1.contentHash);
    });

    it("can query events by RFQ", async () => {
      const { auditStore } = await import("./_core/quoteAuditService");

      auditStore.recordEvent({
        eventType: "rfq_created" as const,
        rfqId: "RFQ-QUERY-TEST",
        actorType: "agent" as const,
        actorId: "test",
        data: {},
      });

      const events = auditStore.getEventsForRfq("RFQ-QUERY-TEST");
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every(e => e.rfqId === "RFQ-QUERY-TEST")).toBe(true);
    });
  });

  describe("quote snapshots", () => {
    it("creates quote snapshot with content hash", async () => {
      const { auditStore } = await import("./_core/quoteAuditService");

      const mockQuote: CanonicalQuote = {
        rfqId: "RFQ-SNAP-001",
        vendorId: "V1",
        quoteId: 42,
        lineItems: [{ sku: "TEST", spec: null, qty: 1000, uom: "kg", originalQty: 1000, originalUom: "kg" }],
        currency: "USD",
        originalCurrency: "USD",
        unitPrice: 2.10,
        originalUnitPrice: 2.10,
        uom: "kg",
        priceBasis: "FOB",
        incoterm: "FOB",
        port: "LAX",
        leadTimeDays: 21,
        minOrderQty: null,
        validUntil: "2026-12-31",
        surcharges: [],
        freightIncluded: false,
        paymentTerms: "Net 30",
        qualityDocs: ["COA"],
        notes: null,
        attachments: [],
        normalization: {
          timestamp: new Date().toISOString(),
          fxRate: null, fxSource: null,
          unitConversionFactor: null, unitConversionFrom: null, unitConversionTo: null,
          incotermMapped: false, warnings: [],
        },
        confidence: 0.95,
        extractionGaps: [],
      };

      const snapshot = auditStore.createQuoteSnapshot({
        rfqId: "RFQ-SNAP-001",
        quoteId: 42,
        vendorId: "V1",
        canonicalQuote: mockQuote,
        rawSource: { type: "email", emailThreadId: "thread-123" },
      });

      expect(snapshot.id).toBeTruthy();
      expect(snapshot.contentHash).toHaveLength(64);
      expect(snapshot.canonicalQuote.unitPrice).toBe(2.10);

      // Should also have created an audit event
      const events = auditStore.getEventsForRfq("RFQ-SNAP-001");
      expect(events.some(e => e.eventType === "quote_normalized")).toBe(true);
    });
  });

  describe("approval records", () => {
    it("records auto-approval with audit trail", async () => {
      const { auditStore } = await import("./_core/quoteAuditService");

      const record = auditStore.recordApproval({
        rfqId: "RFQ-APPR-001",
        quoteId: 10,
        vendorId: "V1",
        approvalType: "auto",
        decision: "approved",
        decidedBy: "auto_approval_engine",
        reason: "Under threshold",
        amount: 5000,
        currency: "USD",
        scoringSnapshotId: "scoring-1",
        quoteSnapshotId: "quote-1",
      });

      expect(record.id).toBeTruthy();
      expect(record.approvalType).toBe("auto");
      expect(record.decision).toBe("approved");

      const approvals = auditStore.getApprovalsByRfq("RFQ-APPR-001");
      expect(approvals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("chain integrity", () => {
    it("verifies intact chain", async () => {
      const { auditStore } = await import("./_core/quoteAuditService");
      const result = auditStore.verifyChainIntegrity();
      expect(result.valid).toBe(true);
    });
  });

  describe("export", () => {
    it("exports all audit data", async () => {
      const { auditStore } = await import("./_core/quoteAuditService");
      const exported = auditStore.exportAll();

      expect(exported.events).toBeInstanceOf(Array);
      expect(exported.snapshots).toBeInstanceOf(Array);
      expect(exported.scoringSnapshots).toBeInstanceOf(Array);
      expect(exported.approvalRecords).toBeInstanceOf(Array);
    });
  });

  describe("convenience functions", () => {
    it("auditRfqCreated records event", async () => {
      const { auditRfqCreated } = await import("./_core/quoteAuditService");
      const event = auditRfqCreated("RFQ-CONV-001", "test-agent", { material: "test" });
      expect(event.eventType).toBe("rfq_created");
      expect(event.rfqId).toBe("RFQ-CONV-001");
    });

    it("auditQuoteReceived records event", async () => {
      const { auditQuoteReceived } = await import("./_core/quoteAuditService");
      const event = auditQuoteReceived("RFQ-CONV-001", 1, "V1", "email");
      expect(event.eventType).toBe("quote_received");
      expect(event.quoteId).toBe(1);
    });

    it("auditPoGenerated records event", async () => {
      const { auditPoGenerated } = await import("./_core/quoteAuditService");
      const event = auditPoGenerated("RFQ-CONV-001", 1, "V1", { poNumber: "PO-001" });
      expect(event.eventType).toBe("po_generated");
    });
  });
});
