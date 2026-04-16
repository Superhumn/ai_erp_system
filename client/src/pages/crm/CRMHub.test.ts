/**
 * Tests for CRMHub page types and logic.
 * Functions tested: ContactType, ContactSource, PipelineStage validation,
 * deal pipeline stage ordering
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from CRMHub.tsx ──

const contactTypes = [
  "lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other",
] as const;

const contactSources = [
  "iphone_bump", "whatsapp", "linkedin_scan", "business_card",
  "website", "referral", "event", "cold_outreach", "import", "manual",
] as const;

const pipelineStages = [
  "new", "contacted", "qualified", "proposal", "negotiation", "won", "lost",
] as const;

function isValidContactType(type: string): boolean {
  return (contactTypes as readonly string[]).includes(type);
}

function isValidContactSource(source: string): boolean {
  return (contactSources as readonly string[]).includes(source);
}

function isValidPipelineStage(stage: string): boolean {
  return (pipelineStages as readonly string[]).includes(stage);
}

function getActivePipelineStages(): string[] {
  return pipelineStages.filter(s => s !== "won" && s !== "lost");
}

// ── Tests ──

describe("CRMHub — contactTypes", () => {
  it("has 8 types", () => {
    expect(contactTypes).toHaveLength(8);
  });

  it("includes core customer types", () => {
    expect(contactTypes).toContain("lead");
    expect(contactTypes).toContain("prospect");
    expect(contactTypes).toContain("customer");
  });

  it("includes special types", () => {
    expect(contactTypes).toContain("investor");
    expect(contactTypes).toContain("donor");
    expect(contactTypes).toContain("partner");
  });
});

describe("CRMHub — contactSources", () => {
  it("has 10 sources", () => {
    expect(contactSources).toHaveLength(10);
  });

  it("includes digital sources", () => {
    expect(contactSources).toContain("website");
    expect(contactSources).toContain("linkedin_scan");
    expect(contactSources).toContain("whatsapp");
  });

  it("includes offline sources", () => {
    expect(contactSources).toContain("business_card");
    expect(contactSources).toContain("event");
    expect(contactSources).toContain("referral");
  });

  it("includes import/manual sources", () => {
    expect(contactSources).toContain("import");
    expect(contactSources).toContain("manual");
  });
});

describe("CRMHub — pipelineStages", () => {
  it("has 7 stages", () => {
    expect(pipelineStages).toHaveLength(7);
  });

  it("starts with 'new'", () => {
    expect(pipelineStages[0]).toBe("new");
  });

  it("ends with 'lost'", () => {
    expect(pipelineStages[pipelineStages.length - 1]).toBe("lost");
  });

  it("has 'won' before 'lost'", () => {
    const wonIdx = pipelineStages.indexOf("won");
    const lostIdx = pipelineStages.indexOf("lost");
    expect(wonIdx).toBeLessThan(lostIdx);
  });

  it("follows logical pipeline order", () => {
    expect([...pipelineStages]).toEqual([
      "new", "contacted", "qualified", "proposal", "negotiation", "won", "lost",
    ]);
  });
});

describe("CRMHub — isValidContactType", () => {
  it("accepts valid types", () => {
    expect(isValidContactType("customer")).toBe(true);
    expect(isValidContactType("lead")).toBe(true);
  });

  it("rejects invalid types", () => {
    expect(isValidContactType("unknown")).toBe(false);
    expect(isValidContactType("")).toBe(false);
  });
});

describe("CRMHub — isValidContactSource", () => {
  it("accepts valid sources", () => {
    expect(isValidContactSource("referral")).toBe(true);
    expect(isValidContactSource("iphone_bump")).toBe(true);
  });

  it("rejects invalid sources", () => {
    expect(isValidContactSource("twitter")).toBe(false);
  });
});

describe("CRMHub — isValidPipelineStage", () => {
  it("accepts valid stages", () => {
    expect(isValidPipelineStage("new")).toBe(true);
    expect(isValidPipelineStage("won")).toBe(true);
  });

  it("rejects invalid stages", () => {
    expect(isValidPipelineStage("closed")).toBe(false);
  });
});

describe("CRMHub — getActivePipelineStages", () => {
  it("returns stages without won and lost", () => {
    const active = getActivePipelineStages();
    expect(active).not.toContain("won");
    expect(active).not.toContain("lost");
    expect(active).toHaveLength(5);
  });

  it("includes all negotiation stages", () => {
    const active = getActivePipelineStages();
    expect(active).toContain("new");
    expect(active).toContain("contacted");
    expect(active).toContain("qualified");
    expect(active).toContain("proposal");
    expect(active).toContain("negotiation");
  });
});
