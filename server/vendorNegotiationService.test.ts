import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database functions
vi.mock("./db", () => ({
  getVendorSpendingHistory: vi.fn(),
  getProductById: vi.fn(),
  getPurchaseOrders: vi.fn(),
  getVendorNegotiationById: vi.fn(),
  getNegotiationRounds: vi.fn(),
  getVendorById: vi.fn(),
  getNextRoundNumber: vi.fn(),
  createNegotiationRound: vi.fn(),
  updateVendorNegotiation: vi.fn(),
  createVendorNegotiation: vi.fn(),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Import after mocking
import * as db from "./db";
import * as llmModule from "./_core/llm";
import {
  analyzeNegotiationOpportunity,
  generateNegotiationDraft,
  addNegotiationRound,
} from "./vendorNegotiationService";

const mockInvokeLLM = vi.mocked(llmModule.invokeLLM);

/** Helper to build a minimal LLM response with given text content */
function makeLLMResult(content: string) {
  return { choices: [{ message: { content } }] } as any;
}

const VALID_ANALYSIS_JSON = JSON.stringify({
  leveragePoints: ["High volume buyer"],
  marketBenchmark: { low: 5, average: 10, high: 15 },
  vendorDependency: "medium",
  recommendedStrategy: "Push for 10% reduction",
  targetPriceReduction: 10,
  confidenceScore: 75,
  risks: ["Quality may drop"],
  alternativeVendors: ["VendorX"],
});

const VALID_DRAFT_JSON = JSON.stringify({
  subject: "Pricing Review",
  body: "Dear Team,\n\nWe want to discuss pricing.",
  tone: "professional",
  keyPoints: ["Volume commitment", "Long partnership"],
});

describe("Vendor Negotiation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default db stubs
    vi.mocked(db.getVendorSpendingHistory).mockResolvedValue({
      totalSpend: 20000,
      orderCount: 5,
      avgOrderValue: 4000,
    } as any);
    vi.mocked(db.getPurchaseOrders).mockResolvedValue([]);
    vi.mocked(db.getVendorById).mockResolvedValue({
      id: 1,
      name: "Acme Corp",
      contactName: "Alice",
    } as any);
    vi.mocked(db.getVendorNegotiationById).mockResolvedValue({
      id: 42,
      vendorId: 1,
      status: "ready",
      type: "price_reduction",
      title: "Q1 Negotiation",
      currentUnitPrice: "100.0000",
      targetUnitPrice: "90.0000",
      currentPaymentTerms: 30,
      targetPaymentTerms: 45,
      targetLeadTimeDays: 7,
      aiStrategy: "Be firm",
    } as any);
    vi.mocked(db.getNegotiationRounds).mockResolvedValue([]);
    vi.mocked(db.getNextRoundNumber).mockResolvedValue(1);
    vi.mocked(db.createNegotiationRound).mockResolvedValue({ id: 10 } as any);
    vi.mocked(db.updateVendorNegotiation).mockResolvedValue({} as any);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // analyzeNegotiationOpportunity – JSON parsing / coercion
  // ─────────────────────────────────────────────────────────────────────────
  describe("analyzeNegotiationOpportunity – LLM response handling", () => {
    it("returns validated data when LLM returns fully valid JSON", async () => {
      mockInvokeLLM.mockResolvedValue(makeLLMResult(VALID_ANALYSIS_JSON));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      expect(result.leveragePoints).toEqual(["High volume buyer"]);
      expect(result.marketBenchmark).toEqual({ low: 5, average: 10, high: 15 });
      expect(result.vendorDependency).toBe("medium");
      expect(result.recommendedStrategy).toBe("Push for 10% reduction");
      expect(result.targetPriceReduction).toBe(10);
      expect(result.confidenceScore).toBe(75);
      expect(result.risks).toEqual(["Quality may drop"]);
      expect(result.alternativeVendors).toEqual(["VendorX"]);
    });

    it("coerces non-string array items to strings when Zod validation fails", async () => {
      // leveragePoints contains numbers → fails Zod → coercion path runs
      const partial = JSON.stringify({
        leveragePoints: [1, 2],
        marketBenchmark: null,
        vendorDependency: "low",
        recommendedStrategy: "Use leverage",
        targetPriceReduction: 8,
        confidenceScore: 60,
        risks: [42],
        alternativeVendors: [],
      });
      mockInvokeLLM.mockResolvedValue(makeLLMResult(partial));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      expect(result.leveragePoints).toEqual(["1", "2"]);
      expect(result.risks).toEqual(["42"]);
    });

    it("defaults vendorDependency to 'medium' for an unknown value", async () => {
      const partial = JSON.stringify({
        leveragePoints: [],
        marketBenchmark: null,
        vendorDependency: "extreme", // not low/medium/high
        recommendedStrategy: "Strategy",
        targetPriceReduction: 5,
        confidenceScore: 50,
        risks: [],
        alternativeVendors: [],
      });
      mockInvokeLLM.mockResolvedValue(makeLLMResult(partial));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      expect(result.vendorDependency).toBe("medium");
    });

    it("clamps targetPriceReduction to [0, 50] and confidenceScore to [0, 100]", async () => {
      const partial = JSON.stringify({
        leveragePoints: [],
        marketBenchmark: null,
        vendorDependency: "high",
        recommendedStrategy: "Strategy",
        targetPriceReduction: 999, // out of range → clamped to 50
        confidenceScore: -5,       // out of range → clamped to 0
        risks: [],
        alternativeVendors: [],
      });
      mockInvokeLLM.mockResolvedValue(makeLLMResult(partial));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      expect(result.targetPriceReduction).toBe(50);
      expect(result.confidenceScore).toBe(0);
    });

    it("sets marketBenchmark to null in coercion path when the field is absent", async () => {
      // Use an invalid vendorDependency to force Zod failure → coercion path,
      // while omitting marketBenchmark so the coercion block leaves it as null.
      const partial = JSON.stringify({
        leveragePoints: [],
        // marketBenchmark absent
        vendorDependency: "extreme", // invalid → Zod fails → coercion runs
        recommendedStrategy: "Strategy",
        targetPriceReduction: 5,
        confidenceScore: 50,
        risks: [],
        alternativeVendors: [],
      });
      mockInvokeLLM.mockResolvedValue(makeLLMResult(partial));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      // Coercion path initialises marketBenchmark to null when the field is absent
      expect(result.marketBenchmark).toBeNull();
    });

    it("falls back to rule-based analysis when LLM returns non-JSON text", async () => {
      mockInvokeLLM.mockResolvedValue(makeLLMResult("Sorry, I cannot help."));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      // Rule-based result always provides these fields
      expect(Array.isArray(result.leveragePoints)).toBe(true);
      expect(result.leveragePoints.length).toBeGreaterThan(0);
      expect(result.vendorDependency).toMatch(/^(low|medium|high)$/);
      expect(typeof result.targetPriceReduction).toBe("number");
    });

    it("falls back to rule-based analysis when invokeLLM throws", async () => {
      mockInvokeLLM.mockRejectedValue(new Error("LLM unavailable"));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      expect(typeof result.recommendedStrategy).toBe("string");
      expect(result.recommendedStrategy.length).toBeGreaterThan(0);
    });

    it("rule-based fallback uses higher targetPriceReduction for high-spend vendors", async () => {
      vi.mocked(db.getVendorSpendingHistory).mockResolvedValue({
        totalSpend: 150000,
        orderCount: 25,
        avgOrderValue: 6000,
      } as any);
      mockInvokeLLM.mockRejectedValue(new Error("LLM unavailable"));

      const result = await analyzeNegotiationOpportunity({
        vendorId: 1,
        negotiationType: "price_reduction",
      });

      // High spend (>100k) + high order count bumps target reduction above 5
      expect(result.targetPriceReduction).toBeGreaterThan(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // generateNegotiationDraft – fallback behaviour
  // ─────────────────────────────────────────────────────────────────────────
  describe("generateNegotiationDraft – draft generation fallbacks", () => {
    it("returns the LLM draft when JSON is fully valid", async () => {
      mockInvokeLLM.mockResolvedValue(makeLLMResult(VALID_DRAFT_JSON));

      const result = await generateNegotiationDraft({
        negotiationId: 42,
        roundNumber: 1,
        messageType: "initial_offer",
      });

      expect(result.subject).toBe("Pricing Review");
      expect(result.tone).toBe("professional");
      expect(result.keyPoints).toContain("Volume commitment");
    });

    it("falls back to initial_offer template when LLM returns invalid JSON", async () => {
      mockInvokeLLM.mockResolvedValue(makeLLMResult("not-json-at-all"));

      const result = await generateNegotiationDraft({
        negotiationId: 42,
        roundNumber: 1,
        messageType: "initial_offer",
      });

      expect(result.subject).toContain("Pricing Review Request");
      expect(result.tone).toBe("collaborative");
      expect(result.keyPoints).toContain("Long-term partnership");
    });

    it("falls back to initial_offer template when LLM JSON fails Zod validation", async () => {
      // Missing required 'tone' field → Zod fails
      const badDraft = JSON.stringify({
        subject: "Hello",
        body: "Body text",
        // tone missing
        keyPoints: [],
      });
      mockInvokeLLM.mockResolvedValue(makeLLMResult(badDraft));

      const result = await generateNegotiationDraft({
        negotiationId: 42,
        roundNumber: 1,
        messageType: "initial_offer",
      });

      expect(result.tone).toBe("collaborative");
    });

    it("falls back to initial_offer template when invokeLLM throws", async () => {
      mockInvokeLLM.mockRejectedValue(new Error("network error"));

      const result = await generateNegotiationDraft({
        negotiationId: 42,
        roundNumber: 1,
        messageType: "initial_offer",
      });

      expect(result.subject).toContain("Pricing Review Request");
      expect(result.body).toContain("Acme Corp");
    });

    it("uses generic fallback template for non-initial_offer message types", async () => {
      mockInvokeLLM.mockRejectedValue(new Error("network error"));

      const result = await generateNegotiationDraft({
        negotiationId: 42,
        roundNumber: 2,
        messageType: "counter_offer",
      });

      expect(result.subject).toContain("Updated Proposal");
      expect(result.tone).toBe("professional");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addNegotiationRound – status transitions
  // ─────────────────────────────────────────────────────────────────────────
  describe("addNegotiationRound – status transitions", () => {
    it("sets status to 'in_progress' for outbound initial_offer", async () => {
      await addNegotiationRound({
        negotiationId: 42,
        direction: "outbound",
        messageType: "initial_offer",
        proposedUnitPrice: 90,
      });

      expect(db.updateVendorNegotiation).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: "in_progress" }),
      );
    });

    it("sets status to 'counter_offered' for inbound counter_offer", async () => {
      await addNegotiationRound({
        negotiationId: 42,
        direction: "inbound",
        messageType: "counter_offer",
        proposedUnitPrice: 95,
      });

      expect(db.updateVendorNegotiation).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: "counter_offered" }),
      );
    });

    it("sets status to 'accepted' and records completedAt for acceptance", async () => {
      const before = Date.now();

      await addNegotiationRound({
        negotiationId: 42,
        direction: "inbound",
        messageType: "acceptance",
        proposedUnitPrice: 92,
        proposedPaymentTerms: 45,
        proposedLeadTimeDays: 7,
      });

      expect(db.updateVendorNegotiation).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: "accepted" }),
      );

      const updateArg = vi.mocked(db.updateVendorNegotiation).mock.calls[0][1];
      expect(updateArg.completedAt).toBeInstanceOf(Date);
      expect(updateArg.completedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("stores agreed terms from the acceptance round's proposed values", async () => {
      await addNegotiationRound({
        negotiationId: 42,
        direction: "inbound",
        messageType: "acceptance",
        proposedUnitPrice: 92.5,
        proposedPaymentTerms: 45,
        proposedLeadTimeDays: 10,
      });

      const updateArg = vi.mocked(db.updateVendorNegotiation).mock.calls[0][1];
      expect(updateArg.agreedUnitPrice).toBe("92.5000");
      expect(updateArg.agreedPaymentTerms).toBe(45);
      expect(updateArg.agreedLeadTimeDays).toBe(10);
    });

    it("falls back to negotiation target values for agreed terms when not provided in acceptance", async () => {
      await addNegotiationRound({
        negotiationId: 42,
        direction: "inbound",
        messageType: "acceptance",
        // No proposedUnitPrice / proposedPaymentTerms / proposedLeadTimeDays
      });

      const updateArg = vi.mocked(db.updateVendorNegotiation).mock.calls[0][1];
      // Should fall back to negotiation.targetUnitPrice / targetPaymentTerms / targetLeadTimeDays
      expect(updateArg.agreedUnitPrice).toBe("90.0000");
      expect(updateArg.agreedPaymentTerms).toBe(45);
      expect(updateArg.agreedLeadTimeDays).toBe(7);
    });

    it("keeps existing status for outbound counter_offer (no special transition)", async () => {
      await addNegotiationRound({
        negotiationId: 42,
        direction: "outbound",
        messageType: "counter_offer",
        proposedUnitPrice: 88,
      });

      // Status should remain "ready" (the negotiation's current status)
      expect(db.updateVendorNegotiation).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: "ready" }),
      );
    });

    it("sets status to 'rejected' when messageType is rejection", async () => {
      await addNegotiationRound({
        negotiationId: 42,
        direction: "inbound",
        messageType: "rejection",
      });

      expect(db.updateVendorNegotiation).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: "rejected" }),
      );
    });

    it("records roundNumber in the update call", async () => {
      vi.mocked(db.getNextRoundNumber).mockResolvedValue(3);

      const { roundNumber } = await addNegotiationRound({
        negotiationId: 42,
        direction: "outbound",
        messageType: "initial_offer",
      });

      expect(roundNumber).toBe(3);
      expect(db.updateVendorNegotiation).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ negotiationRounds: 3 }),
      );
    });

    it("throws when negotiation is not found", async () => {
      vi.mocked(db.getVendorNegotiationById).mockResolvedValue(undefined as any);

      await expect(
        addNegotiationRound({
          negotiationId: 999,
          direction: "outbound",
          messageType: "initial_offer",
        }),
      ).rejects.toThrow("Negotiation not found");
    });
  });
});
