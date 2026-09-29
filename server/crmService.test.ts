import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getCrmContactById: vi.fn(),
  getCrmContactByEmail: vi.fn(),
  getCrmDealById: vi.fn(),
  getCrmPipelineById: vi.fn(),
  getCrmTagById: vi.fn(),
  getContactCaptureById: vi.fn(),
  getCrmAccountById: vi.fn(),
  getCrmAccountChildren: vi.fn(async () => []),
  getCrmContacts: vi.fn(async () => []),
  getCrmDeals: vi.fn(async () => []),
  getCrmInteractions: vi.fn(async () => []),
  getCrmPipelineStages: vi.fn(async () => []),
  getCrmPipelineStagesForPipelines: vi.fn(async () => []),
  getCrmPipelineStageById: vi.fn(),
  createCrmPipelineStages: vi.fn(),
  createCrmPipelineStage: vi.fn(),
  updateCrmPipelineStage: vi.fn(),
  deleteCrmPipelineStage: vi.fn(),
  reorderCrmPipelineStages: vi.fn(),
  countCrmDealsInStage: vi.fn(async () => 0),
  updateCrmPipeline: vi.fn(),
  updateCrmDeal: vi.fn(),
  createCrmDealStageHistory: vi.fn(),
  getCrmDealLastActivity: vi.fn(async () => new Map()),
}));

import * as db from "./db";
import type { Scope } from "./_core/scope";
import { seedStagesFromNames } from "./crmLogic";
import { dealForecast, getOrSeedPipelineStages, loadScopedDeal, moveDealStage } from "./crmService";

const global: Scope = { mode: "global", companyIds: "all" };
const entity: Scope = { mode: "entity", companyIds: [7] };

const pipeline = { id: 1, companyId: 7, name: "Sales", stages: JSON.stringify(["discovery", "proposal", "closed_won", "closed_lost"]) };
const stageRows = seedStagesFromNames(["discovery", "proposal", "closed_won", "closed_lost"]).map((s, i) => ({ ...s, id: 10 + i, pipelineId: 1, companyId: 7 }));
const deal = { id: 5, companyId: 7, pipelineId: 1, contactId: 3, name: "ACME", stage: "discovery", status: "open", probability: 10, amount: "1000", expectedCloseDate: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getCrmDealById).mockResolvedValue(deal as never);
  vi.mocked(db.getCrmPipelineById).mockResolvedValue(pipeline as never);
  vi.mocked(db.getCrmPipelineStages).mockResolvedValue(stageRows as never);
});

describe("loadScopedDeal", () => {
  it("answers NOT_FOUND (not FORBIDDEN) for a deal outside the caller's scope", async () => {
    await expect(loadScopedDeal(5, { mode: "entity", companyIds: [8] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(loadScopedDeal(5, entity)).resolves.toMatchObject({ id: 5 });
    await expect(loadScopedDeal(5, global)).resolves.toMatchObject({ id: 5 });
  });
});

describe("getOrSeedPipelineStages", () => {
  it("seeds stage rows from the JSON array when the pipeline has none", async () => {
    vi.mocked(db.getCrmPipelineStages).mockResolvedValueOnce([] as never).mockResolvedValueOnce(stageRows as never);
    const rows = await getOrSeedPipelineStages(pipeline);
    expect(db.createCrmPipelineStages).toHaveBeenCalledTimes(1);
    const inserted = vi.mocked(db.createCrmPipelineStages).mock.calls[0][0];
    expect(inserted.map((r) => [r.name, r.defaultProbability, r.isWon, r.isLost])).toEqual([
      ["discovery", 10, false, false], ["proposal", 90, false, false], ["closed_won", 100, true, false], ["closed_lost", 0, false, true],
    ]);
    expect(inserted.every((r) => r.companyId === 7 && r.pipelineId === 1)).toBe(true);
    expect(rows).toHaveLength(4);
  });
  it("does not re-seed when rows exist", async () => {
    await getOrSeedPipelineStages(pipeline);
    expect(db.createCrmPipelineStages).not.toHaveBeenCalled();
  });
});

describe("moveDealStage", () => {
  it("defaults probability from the stage and records history", async () => {
    const r = await moveDealStage({ id: 5, stage: "proposal" }, entity, 42);
    expect(r).toMatchObject({ stage: "proposal", probability: 90, status: "open" });
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "proposal", probability: 90 });
    expect(db.createCrmDealStageHistory).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, dealId: 5, fromStage: "discovery", toStage: "proposal", changedBy: 42,
    }));
  });

  it("keeps an explicit probability and marks the deal won on a won stage", async () => {
    const r = await moveDealStage({ id: 5, stage: "Closed_Won", probability: 95 }, global, 42);
    expect(r).toMatchObject({ stage: "closed_won", probability: 95, status: "won" });
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "closed_won", probability: 95, status: "won" });
  });

  it("does not write history when the stage is unchanged", async () => {
    await moveDealStage({ id: 5, stage: "discovery" }, global, 42);
    expect(db.createCrmDealStageHistory).not.toHaveBeenCalled();
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "discovery", probability: 10 });
  });

  it("leaves probability alone for an unknown stage with no explicit value", async () => {
    await moveDealStage({ id: 5, stage: "mystery" }, global, 42);
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "mystery" });
    expect(db.createCrmDealStageHistory).toHaveBeenCalledWith(expect.objectContaining({ toStage: "mystery" }));
  });

  it("refuses a deal outside scope", async () => {
    await expect(moveDealStage({ id: 5, stage: "proposal" }, { mode: "entity", companyIds: [1] }, 42)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.updateCrmDeal).not.toHaveBeenCalled();
  });
});

describe("dealForecast", () => {
  it("queries open deals within scope and weights them by stage defaults", async () => {
    vi.mocked(db.getCrmDeals).mockResolvedValueOnce([
      { ...deal, probability: null },
      { ...deal, id: 6, stage: "proposal", amount: "200", probability: null, expectedCloseDate: new Date("2026-12-01") },
    ] as never);
    vi.mocked(db.getCrmPipelineStagesForPipelines).mockResolvedValueOnce(stageRows as never);
    const f = await dealForecast(entity, 1);
    expect(db.getCrmDeals).toHaveBeenCalledWith(expect.objectContaining({ status: "open", pipelineId: 1, companyIds: [7] }));
    expect(f.totalOpen).toBe(1200);
    expect(f.totalWeighted).toBe(100 + 180);
    expect(f.byMonth.map((b) => b.key)).toEqual(["2026-12", "unscheduled"]);
  });
});
