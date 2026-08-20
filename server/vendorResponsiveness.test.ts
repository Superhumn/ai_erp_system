import { describe, it, expect } from "vitest";
import {
  aggregateInvitations,
  responsivenessScoreFromMetrics,
  FAST_RESPONSE_HOURS,
  SLOW_RESPONSE_HOURS,
  type ResponsivenessMetrics,
} from "./vendorResponsiveness";

function inv(
  vendorId: number,
  status: string,
  firstResponseHours: number | null = null,
  respondedBeforeDueDate: boolean | null = null,
) {
  return { vendorId, status, firstResponseHours, respondedBeforeDueDate };
}

function metrics(overrides: Partial<ResponsivenessMetrics> = {}): ResponsivenessMetrics {
  return {
    vendorId: 1,
    invited: 10,
    responded: 10,
    declined: 0,
    noResponse: 0,
    pending: 0,
    closed: 10,
    averageResponseHours: 12,
    medianResponseHours: 12,
    responseRatePct: 100,
    onTimeRatePct: 100,
    ...overrides,
  };
}

describe("aggregateInvitations", () => {
  it("counts each outcome and excludes still-open invitations from the denominator", () => {
    const m = aggregateInvitations(
      [1],
      [
        inv(1, "responded", 10, true),
        inv(1, "responded", 30, false),
        inv(1, "declined"),
        inv(1, "no_response"),
        inv(1, "sent"),
        inv(1, "viewed"),
      ],
    ).get(1)!;

    expect(m.invited).toBe(6);
    expect(m.responded).toBe(2);
    expect(m.declined).toBe(1);
    expect(m.noResponse).toBe(1);
    expect(m.pending).toBe(2);
    expect(m.closed).toBe(4);
    // A prompt decline counts as responsive; only silence does not.
    expect(m.responseRatePct).toBe(75);
    expect(m.averageResponseHours).toBe(20);
    expect(m.onTimeRatePct).toBe(50);
  });

  it("returns a zeroed record for a vendor with no invitations", () => {
    const m = aggregateInvitations([7], []).get(7)!;
    expect(m).toMatchObject({ vendorId: 7, invited: 0, closed: 0 });
    expect(m.responseRatePct).toBeNull();
    expect(m.averageResponseHours).toBeNull();
  });

  it("keeps vendors separate", () => {
    const all = aggregateInvitations([1, 2], [inv(1, "responded", 5, true), inv(2, "no_response")]);
    expect(all.get(1)!.responded).toBe(1);
    expect(all.get(2)!.responded).toBe(0);
    expect(all.get(2)!.noResponse).toBe(1);
  });

  it("ignores unparseable response times rather than skewing the average", () => {
    const m = aggregateInvitations(
      [1],
      [inv(1, "responded", 10, true), { vendorId: 1, status: "responded", firstResponseHours: "n/a", respondedBeforeDueDate: true }],
    ).get(1)!;
    expect(m.averageResponseHours).toBe(10);
  });

  it("computes the median from the response times", () => {
    const m = aggregateInvitations(
      [1],
      [inv(1, "responded", 1), inv(1, "responded", 5), inv(1, "responded", 100)],
    ).get(1)!;
    expect(m.medianResponseHours).toBe(5);
  });
});

describe("responsivenessScoreFromMetrics", () => {
  it("scores a perfect vendor 100", () => {
    expect(responsivenessScoreFromMetrics(metrics()).score).toBe(100);
  });

  it("scores a silent vendor 0", () => {
    const result = responsivenessScoreFromMetrics(
      metrics({
        responded: 0,
        noResponse: 10,
        responseRatePct: 0,
        averageResponseHours: null,
        onTimeRatePct: null,
      }),
    );
    expect(result.score).toBe(0);
  });

  it("returns null — not a flattering default — when there is nothing to measure", () => {
    const result = responsivenessScoreFromMetrics(
      metrics({ invited: 0, responded: 0, closed: 0, responseRatePct: null, averageResponseHours: null, onTimeRatePct: null }),
    );
    expect(result.score).toBeNull();
    expect(result.lowConfidence).toBe(true);
    expect(result.details).toMatch(/No RFQ invitations/);
  });

  it("says so when every invitation is still open", () => {
    const result = responsivenessScoreFromMetrics(
      metrics({ invited: 3, responded: 0, closed: 0, pending: 3, responseRatePct: null, averageResponseHours: null, onTimeRatePct: null }),
    );
    expect(result.score).toBeNull();
    expect(result.details).toMatch(/still open/);
  });

  it("treats anything inside the fast window as full speed marks", () => {
    const fast = responsivenessScoreFromMetrics(metrics({ averageResponseHours: FAST_RESPONSE_HOURS }));
    const instant = responsivenessScoreFromMetrics(metrics({ averageResponseHours: 0.5 }));
    expect(fast.score).toBe(instant.score);
  });

  it("gives no speed credit at or beyond the slow threshold", () => {
    const slow = responsivenessScoreFromMetrics(metrics({ averageResponseHours: SLOW_RESPONSE_HOURS }));
    // 100% response rate and on-time, but zero speed marks: 50 + 0 + 20.
    expect(slow.score).toBe(70);
  });

  it("decays the speed component between the thresholds", () => {
    const midpoint = (FAST_RESPONSE_HOURS + SLOW_RESPONSE_HOURS) / 2;
    const result = responsivenessScoreFromMetrics(metrics({ averageResponseHours: midpoint }));
    // 50 (rate) + 15 (half of 30) + 20 (on time) = 85.
    expect(result.score).toBe(85);
  });

  it("re-weights onto the response rate when no due dates were recorded", () => {
    const result = responsivenessScoreFromMetrics(
      metrics({ onTimeRatePct: null, averageResponseHours: 1 }),
    );
    // 70% weight on a perfect rate + 30% on perfect speed.
    expect(result.score).toBe(100);
  });

  it("does not punish an unknown on-time rate as a failure", () => {
    const unknown = responsivenessScoreFromMetrics(metrics({ onTimeRatePct: null }));
    const failed = responsivenessScoreFromMetrics(metrics({ onTimeRatePct: 0 }));
    expect(unknown.score!).toBeGreaterThan(failed.score!);
  });

  it("flags a small sample as low confidence", () => {
    expect(responsivenessScoreFromMetrics(metrics({ invited: 2, responded: 2, closed: 2 })).lowConfidence).toBe(true);
    expect(responsivenessScoreFromMetrics(metrics({ invited: 8, responded: 8, closed: 8 })).lowConfidence).toBe(false);
  });

  it("explains the score in terms a buyer can check", () => {
    const result = responsivenessScoreFromMetrics(
      metrics({ invited: 5, responded: 3, declined: 1, noResponse: 1, closed: 5, responseRatePct: 80, averageResponseHours: 36.5, onTimeRatePct: 66.7 }),
    );
    expect(result.details).toContain("3/5 answered");
    expect(result.details).toContain("1 declined");
    expect(result.details).toContain("1 no reply");
    expect(result.details).toContain("36.5h");
  });

  it("stays inside 0-100", () => {
    for (const hours of [0, 1, 24, 100, 400, 10000]) {
      for (const rate of [0, 33, 100]) {
        const s = responsivenessScoreFromMetrics(
          metrics({ averageResponseHours: hours, responseRatePct: rate, onTimeRatePct: rate }),
        ).score!;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });
});
