import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ────────────────────────────────────────────────────────────────
const mockGetVendorSpendingHistory = vi.fn();
const mockGetProductById = vi.fn();
const mockGetPurchaseOrders = vi.fn();
const mockGetVendorNegotiationById = vi.fn();
const mockGetNextRoundNumber = vi.fn();
const mockCreateNegotiationRound = vi.fn();
const mockUpdateVendorNegotiation = vi.fn();
const mockGetVendorById = vi.fn();
const mockGetNegotiationRounds = vi.fn();

vi.mock("./db", () => ({
  getVendorSpendingHistory: (...a: any[]) => mockGetVendorSpendingHistory(...a),
  getProductById: (...a: any[]) => mockGetProductById(...a),
  getPurchaseOrders: (...a: any[]) => mockGetPurchaseOrders(...a),
  getVendorNegotiationById: (...a: any[]) => mockGetVendorNegotiationById(...a),
  getNextRoundNumber: (...a: any[]) => mockGetNextRoundNumber(...a),
  createNegotiationRound: (...a: any[]) => mockCreateNegotiationRound(...a),
  updateVendorNegotiation: (...a: any[]) => mockUpdateVendorNegotiation(...a),
  getVendorById: (...a: any[]) => mockGetVendorById(...a),
  getNegotiationRounds: (...a: any[]) => mockGetNegotiationRounds(...a),
}));

// ─── LLM mock – always throws to trigger the rule-based fallback ─────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
  invokeAnthropic: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
}));

import {
  analyzeNegotiationOpportunity,
  addNegotiationRound,
} from "./vendorNegotiationService";

// ────────────────────────────────────────────────────────────────────────────

describe("Vendor Negotiation Service – rule-based fallback analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no purchase orders
    mockGetPurchaseOrders.mockResolvedValue([]);
  });

  it("returns standard defaults when spend and order count are low and no products", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 10000, orderCount: 5 });
    mockGetProductById.mockResolvedValue(null);

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.leveragePoints).toEqual(["Standard business relationship"]);
    expect(result.vendorDependency).toBe("medium");
    expect(result.targetPriceReduction).toBe(5);
    expect(result.marketBenchmark).toBeNull();
    expect(result.risks).toHaveLength(2);
    expect(result.alternativeVendors).toEqual([]);
  });

  it("adds high-volume leverage point and sets 10% target when totalSpend > 100,000", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 150000, orderCount: 5 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.leveragePoints).toContain(
      "High-volume buyer - significant revenue source for vendor"
    );
    expect(result.leveragePoints).toContain("Consistent purchasing relationship");
    expect(result.targetPriceReduction).toBe(10);
  });

  it("adds consistent-purchasing leverage point (but not high-volume) when 50,000 < totalSpend ≤ 100,000", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 75000, orderCount: 5 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.leveragePoints).toContain("Consistent purchasing relationship");
    expect(result.leveragePoints).not.toContain(
      "High-volume buyer - significant revenue source for vendor"
    );
    // targetReduction starts at 5; no >100k rule applies
    expect(result.targetPriceReduction).toBe(5);
  });

  it("adds frequent-ordering leverage and increments target by 2 when orderCount > 20", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 10000, orderCount: 25 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.leveragePoints).toContain("Frequent, reliable ordering pattern");
    // base is 5 (low spend), +2 for order count = 7
    expect(result.targetPriceReduction).toBe(7);
  });

  it("caps target reduction at 15 even when both high-spend and high-order-count rules apply", async () => {
    // totalSpend > 100k → targetReduction = 10; orderCount > 20 → +2 → 12 (≤ 15 cap, so stays 12)
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 200000, orderCount: 30 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.targetPriceReduction).toBe(12);
  });

  it("sets vendorDependency to high and adds bundling leverage when more than 3 products", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 10000, orderCount: 5 });
    mockGetProductById
      .mockResolvedValueOnce({ id: 1, name: "P1" })
      .mockResolvedValueOnce({ id: 2, name: "P2" })
      .mockResolvedValueOnce({ id: 3, name: "P3" })
      .mockResolvedValueOnce({ id: 4, name: "P4" });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      productIds: [1, 2, 3, 4],
      negotiationType: "price_reduction",
    });

    expect(result.vendorDependency).toBe("high");
    expect(result.leveragePoints).toContain(
      "Multi-product relationship creates bundling opportunities"
    );
  });

  it("returns medium vendorDependency when exactly 3 products are provided", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 10000, orderCount: 5 });
    mockGetProductById
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      productIds: [1, 2, 3],
      negotiationType: "price_reduction",
    });

    // ≤ 3 products → no high-dependency rule
    expect(result.vendorDependency).toBe("medium");
  });

  it("uses volume-commitment recommended strategy when totalSpend > 50,000", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 60000, orderCount: 5 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.recommendedStrategy).toContain("Leverage volume commitment");
  });

  it("uses competitive-pricing recommended strategy when totalSpend ≤ 50,000", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 30000, orderCount: 5 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.recommendedStrategy).toContain("competitive pricing review");
  });

  it("calculates confidence score correctly", async () => {
    // confidenceScore = Math.min(40 + orderCount*2 + (totalSpend>50000 ? 20 : 0), 85)
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 60000, orderCount: 10 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    // 40 + 10*2 + 20 = 80
    expect(result.confidenceScore).toBe(80);
  });

  it("caps confidence score at 85", async () => {
    // 40 + 30*2 + 20 = 100 → capped at 85
    mockGetVendorSpendingHistory.mockResolvedValue({ totalSpend: 60000, orderCount: 30 });

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.confidenceScore).toBe(85);
  });

  it("handles null spending history (treats spend and orderCount as 0)", async () => {
    mockGetVendorSpendingHistory.mockResolvedValue(null);

    const result = await analyzeNegotiationOpportunity({
      vendorId: 1,
      negotiationType: "price_reduction",
    });

    expect(result.targetPriceReduction).toBe(5);
    expect(result.confidenceScore).toBe(40);
    expect(result.leveragePoints).toEqual(["Standard business relationship"]);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("Vendor Negotiation Service – round-driven status transitions", () => {
  const baseNegotiation = {
    id: 10,
    status: "ready",
    title: "Test Negotiation",
    type: "price_reduction",
    targetUnitPrice: "9.5000",
    targetPaymentTerms: 30,
    targetLeadTimeDays: 14,
    vendorId: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVendorNegotiationById.mockResolvedValue(baseNegotiation);
    mockGetNextRoundNumber.mockResolvedValue(1);
    mockCreateNegotiationRound.mockResolvedValue({ id: 100 });
    mockUpdateVendorNegotiation.mockResolvedValue({});
    mockGetVendorById.mockResolvedValue({ id: 1, name: "Acme Corp", email: "acme@example.com" });
    mockGetNegotiationRounds.mockResolvedValue([]);
  });

  it("transitions status to in_progress for initial_offer outbound", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "outbound",
      messageType: "initial_offer",
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "in_progress" })
    );
  });

  it("transitions status to counter_offered for counter_offer inbound", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "inbound",
      messageType: "counter_offer",
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "counter_offered" })
    );
  });

  it("transitions status to accepted for acceptance message (outbound)", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "outbound",
      messageType: "acceptance",
      proposedUnitPrice: 9.0,
      proposedPaymentTerms: 30,
      proposedLeadTimeDays: 14,
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "accepted" })
    );
  });

  it("transitions status to accepted for acceptance message (inbound)", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "inbound",
      messageType: "acceptance",
      proposedUnitPrice: 9.0,
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "accepted" })
    );
  });

  it("transitions status to rejected for rejection message", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "inbound",
      messageType: "rejection",
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "rejected" })
    );
  });

  it("does not change status for info_request message", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "outbound",
      messageType: "info_request",
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "ready" })
    );
  });

  it("does not change status for outbound counter_offer", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "outbound",
      messageType: "counter_offer",
      generateAiDraft: false,
    });

    // counter_offer outbound does not match any status-change rule
    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "ready" })
    );
  });

  it("does not change status for final_offer outbound", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "outbound",
      messageType: "final_offer",
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "ready" })
    );
  });

  it("records agreed terms when message type is acceptance", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "inbound",
      messageType: "acceptance",
      proposedUnitPrice: 8.75,
      proposedPaymentTerms: 45,
      proposedLeadTimeDays: 10,
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalled();
    const updateCall = mockUpdateVendorNegotiation.mock.calls[0][1];
    expect(updateCall.agreedUnitPrice).toBe("8.7500");
    expect(updateCall.agreedPaymentTerms).toBe(45);
    expect(updateCall.agreedLeadTimeDays).toBe(10);
    expect(updateCall.completedAt).toBeDefined();
  });

  it("falls back to target terms when acceptance proposes no price", async () => {
    await addNegotiationRound({
      negotiationId: 10,
      direction: "inbound",
      messageType: "acceptance",
      // no proposedUnitPrice – should fall back to negotiation.targetUnitPrice
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalled();
    const updateCall = mockUpdateVendorNegotiation.mock.calls[0][1];
    expect(updateCall.agreedUnitPrice).toBe(baseNegotiation.targetUnitPrice);
    expect(updateCall.agreedPaymentTerms).toBe(baseNegotiation.targetPaymentTerms);
    expect(updateCall.agreedLeadTimeDays).toBe(baseNegotiation.targetLeadTimeDays);
  });

  it("updates round number on the negotiation record", async () => {
    mockGetNextRoundNumber.mockResolvedValue(3);

    await addNegotiationRound({
      negotiationId: 10,
      direction: "inbound",
      messageType: "counter_offer",
      generateAiDraft: false,
    });

    expect(mockUpdateVendorNegotiation).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ negotiationRounds: 3 })
    );
  });

  it("throws when negotiation is not found", async () => {
    mockGetVendorNegotiationById.mockResolvedValue(null);

    await expect(
      addNegotiationRound({
        negotiationId: 999,
        direction: "outbound",
        messageType: "initial_offer",
        generateAiDraft: false,
      })
    ).rejects.toThrow("Negotiation not found");
  });
});
