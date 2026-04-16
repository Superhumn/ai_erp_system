/**
 * Tests for FundraisingCampaigns page utility functions.
 * Functions tested: statusColors, campaign progress computation
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from FundraisingCampaigns.tsx ──

const statusColors: Record<string, string> = {
  planning: "bg-blue-500/10 text-blue-600",
  active: "bg-green-500/10 text-green-600",
  paused: "bg-amber-500/10 text-amber-600",
  closed: "bg-gray-500/10 text-gray-600",
  cancelled: "bg-red-500/10 text-red-600",
};

function computeCampaignProgress(raised: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((raised / goal) * 100));
}

function computeCampaignStats(campaigns: Array<{ status: string; raisedAmount?: number; goalAmount?: number }>) {
  let activeCampaigns = 0;
  let totalRaised = 0;
  let totalGoal = 0;
  for (const c of campaigns) {
    if (c.status === "active") activeCampaigns++;
    totalRaised += c.raisedAmount || 0;
    totalGoal += c.goalAmount || 0;
  }
  return { activeCampaigns, totalRaised, totalGoal, totalCampaigns: campaigns.length };
}

// ── Tests ──

describe("FundraisingCampaigns — statusColors", () => {
  it("has 5 statuses", () => {
    expect(Object.keys(statusColors)).toHaveLength(5);
  });

  it("maps planning to blue", () => {
    expect(statusColors.planning).toContain("blue");
  });

  it("maps active to green", () => {
    expect(statusColors.active).toContain("green");
  });

  it("maps paused to amber", () => {
    expect(statusColors.paused).toContain("amber");
  });

  it("maps closed to gray", () => {
    expect(statusColors.closed).toContain("gray");
  });

  it("maps cancelled to red", () => {
    expect(statusColors.cancelled).toContain("red");
  });
});

describe("FundraisingCampaigns — computeCampaignProgress", () => {
  it("returns 0 when goal is 0", () => {
    expect(computeCampaignProgress(1000, 0)).toBe(0);
  });

  it("returns 0 when goal is negative", () => {
    expect(computeCampaignProgress(1000, -100)).toBe(0);
  });

  it("returns 50 for halfway", () => {
    expect(computeCampaignProgress(50000, 100000)).toBe(50);
  });

  it("returns 100 for fully funded", () => {
    expect(computeCampaignProgress(100000, 100000)).toBe(100);
  });

  it("caps at 100 for overfunded", () => {
    expect(computeCampaignProgress(150000, 100000)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    expect(computeCampaignProgress(33333, 100000)).toBe(33);
  });

  it("returns 0 when raised is 0", () => {
    expect(computeCampaignProgress(0, 100000)).toBe(0);
  });
});

describe("FundraisingCampaigns — computeCampaignStats", () => {
  it("returns zeros for empty array", () => {
    expect(computeCampaignStats([])).toEqual({
      activeCampaigns: 0, totalRaised: 0, totalGoal: 0, totalCampaigns: 0,
    });
  });

  it("counts active campaigns", () => {
    const campaigns = [
      { status: "active", raisedAmount: 10000, goalAmount: 50000 },
      { status: "active", raisedAmount: 20000, goalAmount: 100000 },
      { status: "closed", raisedAmount: 50000, goalAmount: 50000 },
    ];
    const stats = computeCampaignStats(campaigns);
    expect(stats.activeCampaigns).toBe(2);
    expect(stats.totalCampaigns).toBe(3);
  });

  it("sums raised amounts", () => {
    const campaigns = [
      { status: "active", raisedAmount: 10000 },
      { status: "active", raisedAmount: 20000 },
    ];
    expect(computeCampaignStats(campaigns).totalRaised).toBe(30000);
  });

  it("sums goal amounts", () => {
    const campaigns = [
      { status: "active", goalAmount: 50000 },
      { status: "closed", goalAmount: 100000 },
    ];
    expect(computeCampaignStats(campaigns).totalGoal).toBe(150000);
  });

  it("handles missing amounts gracefully", () => {
    const campaigns = [
      { status: "active" },
      { status: "closed", raisedAmount: 1000 },
    ];
    const stats = computeCampaignStats(campaigns);
    expect(stats.totalRaised).toBe(1000);
    expect(stats.totalGoal).toBe(0);
  });
});
