import { describe, expect, it } from "vitest";
import type { Scope } from "./_core/scope";
import {
  closeDealPatch, computeForecast, crmRowVisible, crmScopeCompanyIds, dealAmountFromItems, dealIsRotting, dealItemTotal, filterCrmRows,
  findStage, monthKey, parseStageNames, resolveMoveProbability, scopeIsEmpty, seedStagesFromNames, statusForStage,
  computeLeadScore, computeVelocity, dealStaleReason, groupTasksByAssignee, guessImportMapping, mapImportRow, parseCsv,
  renderTaskReminderText, taskBucket, taskViewFilters,
} from "./crmLogic";

describe("deal items / close", () => {
  it("computes line totals and the deal amount from items", () => {
    expect(dealItemTotal("3", "2.505")).toBe(7.52);
    expect(dealItemTotal(null, 5)).toBe(0);
    expect(dealItemTotal("x", 5)).toBe(0);
    expect(dealAmountFromItems([])).toBeUndefined();
    expect(dealAmountFromItems([{ totalAmount: "10.10" }, { totalAmount: 5 }, { totalAmount: null }])).toBe(15.1);
  });
  it("builds the won / lost patch", () => {
    const now = new Date("2026-09-29T00:00:00Z");
    expect(closeDealPatch("won", { wonStage: "closed_won" }, now)).toEqual({ status: "won", probability: 100, wonAt: now, lossReasonId: null, lostReason: null, wonReason: null, stage: "closed_won" });
    expect(closeDealPatch("lost", { lossReasonId: 3, note: "  too pricey " }, now)).toEqual({ status: "lost", probability: 0, lostAt: now, lossReasonId: 3, lostReason: "too pricey", wonReason: null });
    expect(closeDealPatch("lost", {}, now).stage).toBeUndefined();
  });
});

const global: Scope = { mode: "global", companyIds: "all" };
const entity: Scope = { mode: "entity", companyIds: [2, 3] };
const empty: Scope = { mode: "entity", companyIds: [] };

describe("crmRowVisible", () => {
  it("global scope sees everything, including unassigned rows", () => {
    expect(crmRowVisible(global, 1)).toBe(true);
    expect(crmRowVisible(global, null)).toBe(true);
    expect(crmRowVisible(global, undefined)).toBe(true);
  });

  it("entity scope sees only its own companies", () => {
    expect(crmRowVisible(entity, 2)).toBe(true);
    expect(crmRowVisible(entity, 3)).toBe(true);
    expect(crmRowVisible(entity, 4)).toBe(false);
  });

  it("business rows with no company are hidden from a scoped user", () => {
    expect(crmRowVisible(entity, null)).toBe(false);
    expect(crmRowVisible(entity, undefined)).toBe(false);
  });

  it("reference rows with no company are shared when sharedWhenNull is set", () => {
    expect(crmRowVisible(entity, null, { sharedWhenNull: true })).toBe(true);
    expect(crmRowVisible(entity, 9, { sharedWhenNull: true })).toBe(false);
    expect(crmRowVisible(empty, null, { sharedWhenNull: true })).toBe(true);
  });

  it("an empty entity scope sees nothing", () => {
    expect(crmRowVisible(empty, 2)).toBe(false);
    expect(crmRowVisible(empty, null)).toBe(false);
  });
});

describe("filterCrmRows", () => {
  const rows = [{ id: 1, companyId: 2 }, { id: 2, companyId: 4 }, { id: 3, companyId: null }];
  it("returns the same array for global scope", () => {
    expect(filterCrmRows(rows, global)).toBe(rows);
  });
  it("drops rows outside the scope", () => {
    expect(filterCrmRows(rows, entity).map((r) => r.id)).toEqual([1]);
    expect(filterCrmRows(rows, entity, { sharedWhenNull: true }).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe("crmScopeCompanyIds / scopeIsEmpty", () => {
  it("null means unrestricted, [] means no rows", () => {
    expect(crmScopeCompanyIds(global)).toBeNull();
    expect(crmScopeCompanyIds(entity)).toEqual([2, 3]);
    expect(scopeIsEmpty(null)).toBe(false);
    expect(scopeIsEmpty(undefined)).toBe(false);
    expect(scopeIsEmpty([])).toBe(true);
    expect(scopeIsEmpty([1])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

describe("parseStageNames", () => {
  it("reads a JSON string array and tolerates junk", () => {
    expect(parseStageNames('["a"," b ",""]')).toEqual(["a", "b"]);
    expect(parseStageNames('[{"name":"x"},3]')).toEqual(["x"]);
    expect(parseStageNames("not json")).toEqual([]);
    expect(parseStageNames(null)).toEqual([]);
    expect(parseStageNames('{"a":1}')).toEqual([]);
  });
});

describe("seedStagesFromNames", () => {
  it("spaces regular stages 10 → 90 and flags won/lost", () => {
    const s = seedStagesFromNames(["discovery", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"]);
    expect(s.map((x) => x.defaultProbability)).toEqual([10, 37, 63, 90, 100, 0]);
    expect(s.map((x) => x.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s[4]).toMatchObject({ isWon: true, isLost: false });
    expect(s[5]).toMatchObject({ isWon: false, isLost: true });
  });
  it("handles one or two regular stages", () => {
    expect(seedStagesFromNames(["only"]).map((x) => x.defaultProbability)).toEqual([10]);
    expect(seedStagesFromNames(["a", "b"]).map((x) => x.defaultProbability)).toEqual([10, 90]);
    expect(seedStagesFromNames(["Won"]).map((x) => x.defaultProbability)).toEqual([100]);
  });
});

describe("resolveMoveProbability / statusForStage", () => {
  const stage = { name: "proposal", sortOrder: 2, defaultProbability: 63, isWon: false, isLost: false };
  it("uses the explicit value when given, clamped to 0..100", () => {
    expect(resolveMoveProbability(55, stage)).toBe(55);
    expect(resolveMoveProbability(140, stage)).toBe(100);
    expect(resolveMoveProbability(-3, stage)).toBe(0);
    expect(resolveMoveProbability(55, undefined)).toBe(55);
  });
  it("falls back to the stage default, then leaves the deal unchanged", () => {
    expect(resolveMoveProbability(undefined, stage)).toBe(63);
    expect(resolveMoveProbability(undefined, undefined)).toBeUndefined();
    expect(resolveMoveProbability(Number.NaN, stage)).toBe(63);
  });
  it("derives status from won/lost flags", () => {
    expect(statusForStage({ isWon: true, isLost: false })).toBe("won");
    expect(statusForStage({ isWon: false, isLost: true })).toBe("lost");
    expect(statusForStage({ isWon: false, isLost: false })).toBe("open");
    expect(statusForStage(undefined)).toBeUndefined();
  });
  it("findStage is case-insensitive", () => {
    expect(findStage([stage], " Proposal ")?.name).toBe("proposal");
    expect(findStage([stage], "nope")).toBeUndefined();
  });
});

describe("dealIsRotting", () => {
  const now = new Date("2026-09-29T00:00:00Z");
  it("compares idle time against the stage threshold (default 21 days)", () => {
    expect(dealIsRotting(new Date("2026-09-20T00:00:00Z"), null, now)).toBe(false);
    expect(dealIsRotting(new Date("2026-09-01T00:00:00Z"), null, now)).toBe(true);
    expect(dealIsRotting(new Date("2026-09-20T00:00:00Z"), 7, now)).toBe(true);
    expect(dealIsRotting(null, 7, now)).toBe(false);
    expect(dealIsRotting("garbage", 7, now)).toBe(false);
  });
});

describe("computeForecast", () => {
  const stages = seedStagesFromNames(["discovery", "proposal", "closed_won", "closed_lost"]);
  const deals = [
    { id: 1, stage: "discovery", status: "open", amount: "1000", probability: 20, expectedCloseDate: "2026-10-05T00:00:00Z" },
    { id: 2, stage: "proposal", status: "open", amount: "2000", probability: null, expectedCloseDate: "2026-10-20T00:00:00Z" },
    { id: 3, stage: "proposal", status: "open", amount: 500, probability: 50, expectedCloseDate: null },
    { id: 4, stage: "closed_won", status: "won", amount: "9999", probability: 100, expectedCloseDate: "2026-10-01T00:00:00Z" },
    { id: 5, stage: "discovery", status: "open", amount: null, probability: 10, expectedCloseDate: "2026-11-01T00:00:00Z" },
  ];
  it("weights open deals by probability, defaulting to the stage value", () => {
    const f = computeForecast(deals, stages);
    // 1000*0.2 + 2000*0.9 (proposal default) + 500*0.5 + 0
    expect(f.totalOpen).toBe(3500);
    expect(f.totalWeighted).toBe(200 + 1800 + 250);
  });
  it("buckets by expected-close month with unscheduled last, and by stage in pipeline order", () => {
    const f = computeForecast(deals, stages);
    expect(f.byMonth.map((b) => b.key)).toEqual(["2026-10", "2026-11", "unscheduled"]);
    expect(f.byMonth[0]).toEqual({ key: "2026-10", count: 2, amount: 3000, weighted: 2000 });
    expect(f.byMonth[2]).toEqual({ key: "unscheduled", count: 1, amount: 500, weighted: 250 });
    expect(f.byStage.map((b) => b.key)).toEqual(["discovery", "proposal"]);
    expect(f.byStage[1]).toEqual({ key: "proposal", count: 2, amount: 2500, weighted: 2050 });
  });
  it("works without stage metadata (unknown probability = 0)", () => {
    const f = computeForecast([{ id: 9, stage: "x", status: "open", amount: "100", probability: null, expectedCloseDate: null }]);
    expect(f.totalWeighted).toBe(0);
    expect(monthKey("2026-02-03")).toBe("2026-02");
  });
});

describe("computeVelocity", () => {
  it("averages completed stays per stage and ignores the current stage", () => {
    const v = computeVelocity([
      { dealId: 1, fromStage: null, toStage: "discovery", changedAt: "2026-01-01T00:00:00Z" },
      { dealId: 1, fromStage: "discovery", toStage: "proposal", changedAt: "2026-01-11T00:00:00Z" },
      { dealId: 1, fromStage: "proposal", toStage: "closed_won", changedAt: "2026-01-16T00:00:00Z" },
      { dealId: 2, fromStage: "discovery", toStage: "proposal", changedAt: "2026-02-10T00:00:00Z" }, // out of order on purpose
      { dealId: 2, fromStage: null, toStage: "discovery", changedAt: "2026-02-01T00:00:00Z" },
    ]);
    const by = Object.fromEntries(v.map((s) => [s.stage, s]));
    expect(by.discovery).toEqual({ stage: "discovery", samples: 2, avgDays: 9.5 });
    expect(by.proposal).toEqual({ stage: "proposal", samples: 1, avgDays: 5 });
    expect(by.closed_won).toBeUndefined();
  });
});

describe("dealStaleReason", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it("idle beyond the stage threshold (default 21 days), measured from creation when never touched", () => {
    expect(dealStaleReason({ status: "open", createdAt: "2026-09-01" }, null, null, now)).toBe("idle");
    expect(dealStaleReason({ status: "open", createdAt: "2026-09-01" }, "2026-09-20", null, now)).toBeNull();
    expect(dealStaleReason({ status: "open", createdAt: "2026-09-01" }, "2026-09-20", 5, now)).toBe("idle");
  });
  it("past expected close date; closed deals are never stale", () => {
    expect(dealStaleReason({ status: "open", createdAt: "2026-09-25", expectedCloseDate: "2026-09-28" }, null, null, now)).toBe("past_close");
    expect(dealStaleReason({ status: "open", createdAt: "2026-09-25", expectedCloseDate: "2026-09-29T08:00:00Z" }, null, null, now)).toBeNull();
    expect(dealStaleReason({ status: "won", createdAt: "2020-01-01" }, null, null, now)).toBeNull();
  });
});

describe("tasks helpers", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it("buckets tasks by UTC day", () => {
    expect(taskBucket({ dueAt: "2026-09-28T23:00:00Z" }, now)).toBe("overdue");
    expect(taskBucket({ dueAt: "2026-09-29T00:00:00Z" }, now)).toBe("today");
    expect(taskBucket({ dueAt: "2026-09-29T23:59:00Z" }, now)).toBe("today");
    expect(taskBucket({ dueAt: "2026-09-30T00:00:00Z" }, now)).toBe("upcoming");
    expect(taskBucket({ dueAt: null }, now)).toBe("someday");
    expect(taskBucket({ dueAt: "2026-09-01", completedAt: "2026-09-02" }, now)).toBe("done");
  });
  it("maps views to db filters", () => {
    expect(taskViewFilters("today", 4, now)).toEqual({ assignedTo: 4, status: "open", dueAfter: new Date("2026-09-29T00:00:00Z"), dueBefore: new Date("2026-09-29T23:59:59.999Z") });
    expect(taskViewFilters("upcoming", 4, now)).toEqual({ assignedTo: 4, status: "open", dueAfter: new Date("2026-09-30T00:00:00Z") });
    expect(taskViewFilters("all", 4, now)).toEqual({ status: "all" });
  });
  it("groups reminders by assignee and renders overdue first", () => {
    const tasks = [
      { id: 1, title: "Call district", type: "call", dueAt: new Date("2026-09-27T00:00:00Z"), assignedTo: 1 },
      { id: 2, title: "Send pricing", type: "email", dueAt: new Date("2026-09-29T10:00:00Z"), assignedTo: 1 },
      { id: 3, title: "Unassigned", type: "todo", dueAt: null, assignedTo: null },
    ];
    const g = groupTasksByAssignee(tasks);
    expect([...g.keys()]).toEqual([1]);
    const text = renderTaskReminderText("Jade", g.get(1)!, now);
    expect(text.indexOf("Overdue (1)")).toBeLessThan(text.indexOf("Due today (1)"));
    expect(text).toContain("- [call] Call district (due 2026-09-27)");
  });
});

describe("computeLeadScore", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it("adds each rule and caps at 100", () => {
    expect(computeLeadScore({ contactType: "lead" }, now).score).toBe(10);
    expect(computeLeadScore({ contactType: "vendor" }, now).score).toBe(0);
    const big = computeLeadScore({
      contactType: "customer", accountType: "distributor", mealsPerDay: 80000,
      lastInteractionAt: "2026-09-28", lastRepliedAt: "2026-09-28", openDealAmount: 500000,
    }, now);
    expect(big.score).toBe(100);
    expect(big.factors.map((f) => f.points)).toEqual([25, 15, 20, 15, 15, 10]);
  });
  it("recency tiers decay", () => {
    const s = (d: string) => computeLeadScore({ contactType: null, lastInteractionAt: d }, now).score;
    expect([s("2026-09-25"), s("2026-09-10"), s("2026-07-15"), s("2026-01-01")]).toEqual([15, 10, 5, 0]);
  });
});

describe("CSV import helpers", () => {
  it("parses quotes, escaped quotes, CRLF and embedded newlines; skips blank lines", () => {
    const rows = parseCsv('\uFEFFa,b,c\r\n"x, y","he said ""hi""","multi\nline"\r\n\r\n1,,3');
    expect(rows).toEqual([["a", "b", "c"], ["x, y", 'he said "hi"', "multi\nline"], ["1", "", "3"]]);
  });
  it("guesses a mapping from common headers", () => {
    expect(guessImportMapping(["Full Name", "E-mail Address", "School District", "Job Title", "Mobile", "LinkedIn URL", "Misc"]))
      .toEqual({ 0: "fullName", 1: "email", 2: "organization", 3: "jobTitle", 4: "phone", 5: "linkedinUrl", 6: "" });
  });
  it("maps a row, splitting a full name and validating", () => {
    const m = { 0: "fullName", 1: "email", 2: "organization", 3: "contactType" } as const;
    expect(mapImportRow(["Ana Maria Lopez", "ANA@X.ORG", "Dallas ISD", "Prospect"], m).contact).toMatchObject({
      firstName: "Ana", lastName: "Maria Lopez", fullName: "Ana Maria Lopez", email: "ana@x.org", organization: "Dallas ISD", contactType: "prospect",
    });
    expect(mapImportRow(["", "", "", ""], m).error).toBe("Missing name");
    expect(mapImportRow(["Bo", "not-an-email", "", ""], m).error).toMatch(/Invalid email/);
    expect(mapImportRow(["Bo", "", "", ""], m).error).toMatch(/Needs an email/);
    expect(mapImportRow(["", "cy@x.org", "", "weird"], m).contact).toMatchObject({ firstName: "cy", contactType: undefined });
  });
});
