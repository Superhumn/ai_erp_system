import { describe, expect, it } from "vitest";
import {
  MATCH_WINDOW_DAYS,
  candidateWindow,
  daysBetween,
  directionForAmount,
  manualMatchProblem,
  planAutoMatch,
  rankCandidates,
  scoreCandidate,
  signedBankAmount,
  summarizeReconciliation,
  toCents,
  tokenize,
  type MatchSuggestion,
  type PaymentCandidate,
} from "./bankReconciliation";

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

const payment = (overrides: Partial<PaymentCandidate> = {}): PaymentCandidate => ({
  id: 1,
  type: "made",
  amount: "1200.00",
  paymentDate: d("2026-09-10"),
  referenceNumber: null,
  paymentNumber: null,
  status: "completed",
  vendorName: null,
  customerName: null,
  ...overrides,
});

const outflow = { amount: -1200, date: d("2026-09-10"), description: "ACH DEBIT", counterpartyName: null };

describe("helpers", () => {
  it("toCents rounds decimals and float noise to integer cents", () => {
    expect(toCents("1200.00")).toBe(120000);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1199.999999)).toBe(120000);
    expect(toCents("-45.5")).toBe(-4550);
    expect(Number.isNaN(toCents("abc"))).toBe(true);
  });

  it("maps the bank sign to a payment direction", () => {
    expect(directionForAmount(-1)).toBe("made");
    expect(directionForAmount(0.01)).toBe("received");
    expect(directionForAmount(0)).toBeNull();
  });

  it("signs stored bank lines from their type", () => {
    expect(signedBankAmount({ amount: "1200", type: "debit" })).toBe(-1200);
    expect(signedBankAmount({ amount: "75.25", type: "credit" })).toBe(75.25);
    expect(signedBankAmount({ amount: -5, type: "credit" })).toBe(5);
  });

  it("counts whole UTC calendar days between dates regardless of order or time of day", () => {
    expect(daysBetween(new Date("2026-09-10T00:00:01Z"), new Date("2026-09-10T23:59:59Z"))).toBe(0);
    expect(daysBetween(d("2026-09-12"), d("2026-09-10"))).toBe(2);
    expect(daysBetween(d("2026-09-10"), d("2026-09-15"))).toBe(5);
  });

  it("builds a ±5 day window covering whole days", () => {
    const { from, to } = candidateWindow(d("2026-09-10"));
    expect(from.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-15T23:59:59.999Z");
    expect(MATCH_WINDOW_DAYS).toBe(5);
  });

  it("tokenizes on non-alphanumerics and drops short and generic words", () => {
    expect(tokenize("ACH Payment to ACME Mills, Inc. #77")).toEqual(["acme", "mills"]);
    expect(tokenize(null)).toEqual([]);
  });
});

describe("scoreCandidate hard rules", () => {
  it("requires the exact amount to the cent", () => {
    expect(scoreCandidate(outflow, payment({ amount: "1200.01" }))).toBeNull();
    expect(scoreCandidate(outflow, payment({ amount: "1199.99" }))).toBeNull();
    expect(scoreCandidate(outflow, payment({ amount: 1200 }))).not.toBeNull();
    expect(scoreCandidate({ ...outflow, amount: -1200.004 }, payment())).not.toBeNull();
  });

  it("maps outflow to payments made and inflow to payments received", () => {
    expect(scoreCandidate(outflow, payment({ type: "received" }))).toBeNull();
    expect(scoreCandidate({ ...outflow, amount: 1200 }, payment({ type: "made" }))).toBeNull();
    expect(scoreCandidate({ ...outflow, amount: 1200 }, payment({ type: "received" }))).not.toBeNull();
  });

  it("rejects a zero-amount bank line", () => {
    expect(scoreCandidate({ ...outflow, amount: 0 }, payment({ amount: "0.00" }))).toBeNull();
  });

  it("keeps the payment date within ±5 days", () => {
    expect(scoreCandidate(outflow, payment({ paymentDate: d("2026-09-15") }))).not.toBeNull();
    expect(scoreCandidate(outflow, payment({ paymentDate: d("2026-09-05") }))).not.toBeNull();
    expect(scoreCandidate(outflow, payment({ paymentDate: d("2026-09-16") }))).toBeNull();
    expect(scoreCandidate(outflow, payment({ paymentDate: d("2026-09-04") }))).toBeNull();
  });

  it("never suggests failed or cancelled payments", () => {
    expect(scoreCandidate(outflow, payment({ status: "failed" }))).toBeNull();
    expect(scoreCandidate(outflow, payment({ status: "cancelled" }))).toBeNull();
    expect(scoreCandidate(outflow, payment({ status: "pending" }))).not.toBeNull();
  });
});

describe("scoreCandidate confidence", () => {
  it("scores amount + same day at 85, falling 5 per day apart to 60 at the window edge", () => {
    expect(scoreCandidate(outflow, payment())).toMatchObject({ confidence: 85, daysApart: 0, reasons: ["Amount matches exactly ($1,200.00)", "Same day"] });
    expect(scoreCandidate(outflow, payment({ paymentDate: d("2026-09-11") }))).toMatchObject({ confidence: 80, reasons: expect.arrayContaining(["1 day apart"]) });
    expect(scoreCandidate(outflow, payment({ paymentDate: d("2026-09-13") }))!.confidence).toBe(70);
    expect(scoreCandidate(outflow, payment({ paymentDate: d("2026-09-15") }))).toMatchObject({ confidence: 60, reasons: expect.arrayContaining(["5 days apart"]) });
  });

  it("boosts on a reference number found in the description, ignoring punctuation and case", () => {
    const s = scoreCandidate({ ...outflow, description: "ACH ACME MILLS ach777" }, payment({ referenceNumber: "ACH-777" }));
    expect(s!.confidence).toBe(100);
    expect(s!.reasons).toContain("Reference ACH-777 found in bank description");
  });

  it("also recognises the payment number as a reference", () => {
    const s = scoreCandidate({ ...outflow, description: "Wire PAY-2609-0001" }, payment({ paymentNumber: "PAY-2609-0001" }));
    expect(s!.confidence).toBe(100);
  });

  it("ignores references too short to be meaningful", () => {
    expect(scoreCandidate({ ...outflow, description: "ACH 12 DEBIT" }, payment({ referenceNumber: "12" }))!.confidence).toBe(85);
  });

  it("boosts on the vendor name in the counterparty for payments made", () => {
    const s = scoreCandidate({ ...outflow, counterpartyName: "Acme Mills" }, payment({ vendorName: "Acme Mills, Inc.", paymentDate: d("2026-09-11") }));
    expect(s!.confidence).toBe(90);
    expect(s!.reasons).toContain("Vendor name matches (Acme Mills, Inc.)");
  });

  it("gives a smaller boost for a partial name hit", () => {
    const s = scoreCandidate({ ...outflow, description: "ACME FOODS" }, payment({ vendorName: "Acme Mills" }));
    expect(s!.confidence).toBe(90);
    expect(s!.reasons).toContain("Vendor name partly matches (Acme Mills)");
  });

  it("uses the customer name for money received, not the vendor name", () => {
    const inflow = { amount: 500, date: d("2026-09-10"), description: "DEPOSIT GLOBEX CORP", counterpartyName: null };
    expect(scoreCandidate(inflow, payment({ type: "received", amount: "500.00", customerName: "Globex Corp" }))).toMatchObject({
      confidence: 95,
      reasons: expect.arrayContaining(["Customer name matches (Globex Corp)"]),
    });
    expect(scoreCandidate(inflow, payment({ type: "received", amount: "500.00", vendorName: "Globex Corp" }))!.confidence).toBe(85);
  });

  it("caps confidence at 100", () => {
    const s = scoreCandidate({ ...outflow, description: "ACME MILLS ACH-777" }, payment({ referenceNumber: "ACH-777", vendorName: "Acme Mills" }));
    expect(s!.confidence).toBe(100);
    expect(s!.reasons).toHaveLength(4);
  });
});

describe("rankCandidates", () => {
  it("drops non-matches and ranks by confidence, then closeness, then id", () => {
    const ranked = rankCandidates({ ...outflow, description: "ACH ACME MILLS" }, [
      payment({ id: 1, paymentDate: d("2026-09-13") }),
      payment({ id: 2, amount: "999.00" }),
      payment({ id: 3, vendorName: "Acme Mills" }),
      payment({ id: 4, paymentDate: d("2026-09-12") }),
      payment({ id: 5, paymentDate: d("2026-09-08") }),
      payment({ id: 6, type: "received" }),
    ]);
    expect(ranked.map((s) => [s.paymentId, s.confidence])).toEqual([[3, 95], [4, 75], [5, 75], [1, 70]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(rankCandidates(outflow, [])).toEqual([]);
    expect(rankCandidates(outflow, [payment({ amount: "1.00" })])).toEqual([]);
  });
});

describe("manualMatchProblem", () => {
  it("accepts an exact match even outside the date window", () => {
    expect(manualMatchProblem(outflow, payment({ paymentDate: d("2026-01-01") }))).toBeNull();
  });

  it("explains amount, direction and status problems", () => {
    expect(manualMatchProblem(outflow, payment({ amount: "1100.00" }))).toBe("Amount differs: bank $1,200.00 vs payment $1,100.00");
    expect(manualMatchProblem(outflow, payment({ type: "received" }))).toMatch(/money out/);
    expect(manualMatchProblem({ ...outflow, amount: 1200 }, payment())).toMatch(/money in/);
    expect(manualMatchProblem(outflow, payment({ status: "cancelled" }))).toBe("Payment is cancelled");
    expect(manualMatchProblem({ ...outflow, amount: 0 }, payment())).toBe("Bank line has a zero amount");
  });
});

describe("planAutoMatch", () => {
  const s = (paymentId: number, confidence: number): MatchSuggestion => ({ paymentId, confidence, daysApart: 0, reasons: [], payment: payment({ id: paymentId }) });

  it("reconciles only lines with exactly one suggestion at or above the threshold", () => {
    const plan = planAutoMatch([
      { bankTransactionId: 1, suggestions: [s(10, 100), s(11, 60)] },
      { bankTransactionId: 2, suggestions: [s(20, 95), s(21, 92)] },
      { bankTransactionId: 3, suggestions: [s(30, 89)] },
      { bankTransactionId: 4, suggestions: [] },
      { bankTransactionId: 5, suggestions: [s(50, 90)] },
    ]);
    expect(plan.matches).toEqual([
      { bankTransactionId: 1, paymentId: 10, confidence: 100 },
      { bankTransactionId: 5, paymentId: 50, confidence: 90 },
    ]);
    expect(plan.needsReview).toEqual([2, 3]);
    expect(plan.noCandidates).toEqual([4]);
  });

  it("honours a custom threshold", () => {
    const plan = planAutoMatch([{ bankTransactionId: 3, suggestions: [s(30, 85)] }], 80);
    expect(plan.matches).toEqual([{ bankTransactionId: 3, paymentId: 30, confidence: 85 }]);
  });

  it("refuses to hand one payment to two lines", () => {
    const plan = planAutoMatch([
      { bankTransactionId: 1, suggestions: [s(10, 100)] },
      { bankTransactionId: 2, suggestions: [s(10, 95)] },
      { bankTransactionId: 3, suggestions: [s(30, 95)] },
    ]);
    expect(plan.matches).toEqual([{ bankTransactionId: 3, paymentId: 30, confidence: 95 }]);
    expect(plan.needsReview).toEqual([1, 2]);
  });
});

describe("summarizeReconciliation", () => {
  it("folds grouped rows into per-status counts, inflow, outflow and totals", () => {
    const summary = summarizeReconciliation([
      { status: "unreconciled", type: "debit", count: 2, total: "300.10" },
      { status: "unreconciled", type: "credit", count: "1", total: "50.20" },
      { status: "reconciled", type: "debit", count: 3, total: "1200.00" },
      { status: null, type: "debit", count: 1, total: "10.00" },
      { status: "excluded", type: "debit", count: 1, total: null },
    ]);
    expect(summary.unreconciled).toEqual({ count: 4, inflow: 50.2, outflow: 310.1, total: 360.3 });
    expect(summary.reconciled).toEqual({ count: 3, inflow: 0, outflow: 1200, total: 1200 });
    expect(summary.suggested).toEqual({ count: 0, inflow: 0, outflow: 0, total: 0 });
    expect(summary.excluded).toEqual({ count: 1, inflow: 0, outflow: 0, total: 0 });
    expect(summary.all).toEqual({ count: 8, inflow: 50.2, outflow: 1510.1, total: 1560.3 });
  });

  it("returns zeroes for no rows", () => {
    expect(summarizeReconciliation([]).all).toEqual({ count: 0, inflow: 0, outflow: 0, total: 0 });
  });
});
