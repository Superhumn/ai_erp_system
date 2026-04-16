/**
 * Tests for Recruiting page utility functions.
 * Functions tested: stages, stageColors, candidate filtering
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from Recruiting.tsx ──

const stages = ["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"] as const;

const stageColors: Record<string, string> = {
  applied: "bg-blue-500/10 text-blue-600",
  screening: "bg-cyan-500/10 text-cyan-600",
  interview: "bg-amber-500/10 text-amber-600",
  assessment: "bg-purple-500/10 text-purple-600",
  offer: "bg-green-500/10 text-green-600",
  hired: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-red-500/10 text-red-600",
};

type Candidate = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  position: string;
  stage: string;
  score: number | null;
  notes: string | null;
  source: string | null;
};

function filterCandidates(
  candidates: Candidate[],
  search: string,
  stageFilter: string,
): Candidate[] {
  let list = candidates;
  if (stageFilter !== "all") {
    list = list.filter(c => c.stage === stageFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.position.toLowerCase().includes(q)
    );
  }
  return list;
}

// ── Tests ──

describe("Recruiting — stages", () => {
  it("has 7 stages", () => {
    expect(stages).toHaveLength(7);
  });

  it("starts with 'applied' and ends with 'rejected'", () => {
    expect(stages[0]).toBe("applied");
    expect(stages[stages.length - 1]).toBe("rejected");
  });

  it("includes 'hired' before 'rejected'", () => {
    const hiredIdx = stages.indexOf("hired");
    const rejectedIdx = stages.indexOf("rejected");
    expect(hiredIdx).toBeLessThan(rejectedIdx);
  });

  it("follows logical pipeline order", () => {
    expect([...stages]).toEqual([
      "applied", "screening", "interview", "assessment", "offer", "hired", "rejected",
    ]);
  });
});

describe("Recruiting — stageColors", () => {
  it("has a color for every stage", () => {
    for (const stage of stages) {
      expect(stageColors[stage]).toBeTruthy();
    }
  });

  it("maps applied to blue", () => {
    expect(stageColors.applied).toContain("blue");
  });

  it("maps hired to emerald", () => {
    expect(stageColors.hired).toContain("emerald");
  });

  it("maps rejected to red", () => {
    expect(stageColors.rejected).toContain("red");
  });

  it("all values are valid CSS class patterns", () => {
    for (const color of Object.values(stageColors)) {
      expect(color).toMatch(/^bg-/);
      expect(color).toMatch(/text-/);
    }
  });
});

describe("Recruiting — filterCandidates", () => {
  const candidates: Candidate[] = [
    { id: 1, name: "Alice Smith", email: "alice@test.com", phone: "+1234", position: "Engineer", stage: "applied", score: 85, notes: null, source: "referral" },
    { id: 2, name: "Bob Jones", email: "bob@test.com", phone: null, position: "Designer", stage: "interview", score: 90, notes: "Great candidate", source: "linkedin" },
    { id: 3, name: "Charlie Brown", email: "charlie@test.com", phone: "+5678", position: "Engineer", stage: "hired", score: 95, notes: null, source: null },
  ];

  it("returns all when no filters", () => {
    expect(filterCandidates(candidates, "", "all")).toHaveLength(3);
  });

  it("filters by stage", () => {
    const result = filterCandidates(candidates, "", "applied");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice Smith");
  });

  it("filters by name", () => {
    const result = filterCandidates(candidates, "bob", "all");
    expect(result).toHaveLength(1);
  });

  it("filters by email", () => {
    const result = filterCandidates(candidates, "charlie@", "all");
    expect(result).toHaveLength(1);
  });

  it("filters by position", () => {
    const result = filterCandidates(candidates, "engineer", "all");
    expect(result).toHaveLength(2);
  });

  it("combines search and stage filter", () => {
    const result = filterCandidates(candidates, "engineer", "applied");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice Smith");
  });

  it("is case insensitive", () => {
    expect(filterCandidates(candidates, "ALICE", "all")).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    expect(filterCandidates(candidates, "zzz", "all")).toHaveLength(0);
  });
});
