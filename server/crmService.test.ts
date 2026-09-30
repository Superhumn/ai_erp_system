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
  createCrmDeal: vi.fn(async () => 77),
  upsertCrmDealContact: vi.fn(async () => 1),
  removeCrmDealContact: vi.fn(),
  getCrmDealContacts: vi.fn(async () => []),
  getCrmDealItems: vi.fn(async () => []),
  getCrmDealItemById: vi.fn(),
  createCrmDealItem: vi.fn(async () => 9),
  updateCrmDealItem: vi.fn(),
  deleteCrmDealItem: vi.fn(),
  getCrmLossReasons: vi.fn(async () => []),
  getCrmLossReasonById: vi.fn(),
  createCrmLossReasons: vi.fn(),
  createCrmInteraction: vi.fn(async () => 1),
  getCrmDealStageHistoryForDeals: vi.fn(async () => []),
  deleteCrmAccount: vi.fn(),
  mergeCrmAccounts: vi.fn(async (_p: number, ids: number[]) => ({ merged: ids.length })),
  getCrmTaskById: vi.fn(),
  getCrmTasks: vi.fn(async () => []),
  createCrmTask: vi.fn(async () => 50),
  updateCrmTask: vi.fn(),
  deleteCrmTask: vi.fn(),
  getOpenCrmTasksForDeal: vi.fn(async () => []),
  getCrmTasksDueForReminder: vi.fn(async () => []),
  markCrmTasksReminded: vi.fn(),
  getUserById: vi.fn(),
  setCrmDealsStale: vi.fn(),
  getCrmContactLastInteractionAt: vi.fn(async () => null),
  updateCrmContact: vi.fn(),
  findCrmContactMatch: vi.fn(async () => undefined),
  findCrmAccountByName: vi.fn(async () => undefined),
  createCrmAccount: vi.fn(async () => 300),
  createCrmContact: vi.fn(async () => 400),
}));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));

import * as db from "./db";
import { sendEmail } from "./_core/email";
import type { Scope } from "./_core/scope";
import { seedStagesFromNames } from "./crmLogic";
import {
  addDealItem, closeDeal, completeTask, createDeal, createTask, dealForecast, deleteAccount, getOrSeedPipelineStages, importCommit,
  importPreview, listLossReasons, listTasks, loadScopedDeal, loadScopedTask, mergeAccounts, moveDealStage, recomputeLeadScore,
  removeDealContact, runStaleDealCheck, salesReport, sendCrmTaskReminders, updateTask,
} from "./crmService";

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
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "proposal", probability: 90, isStale: false });
    expect(db.createCrmDealStageHistory).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, dealId: 5, fromStage: "discovery", toStage: "proposal", changedBy: 42,
    }));
  });

  it("keeps an explicit probability and marks the deal won on a won stage", async () => {
    const r = await moveDealStage({ id: 5, stage: "Closed_Won", probability: 95 }, global, 42);
    expect(r).toMatchObject({ stage: "closed_won", probability: 95, status: "won" });
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "closed_won", probability: 95, status: "won", isStale: false });
  });

  it("does not write history when the stage is unchanged", async () => {
    await moveDealStage({ id: 5, stage: "discovery" }, global, 42);
    expect(db.createCrmDealStageHistory).not.toHaveBeenCalled();
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "discovery", probability: 10 });
  });

  it("leaves probability alone for an unknown stage with no explicit value", async () => {
    await moveDealStage({ id: 5, stage: "mystery" }, global, 42);
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { stage: "mystery", isStale: false });
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

describe("createDeal", () => {
  const contact = { id: 3, companyId: 7, fullName: "Jane Doe", organization: "ACME Schools", accountId: null };
  beforeEach(() => { vi.mocked(db.getCrmContactById).mockResolvedValue(contact as never); });

  it("inserts directly, names the deal after the organization, defaults probability from the stage and records history", async () => {
    const r = await createDeal({ pipelineId: 1, contactId: 3, stage: "proposal", amount: "500" }, entity, { id: 42, companyId: 7 });
    expect(r).toEqual({ id: 77, name: "ACME Schools" });
    expect(db.createCrmDeal).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, pipelineId: 1, contactId: 3, name: "ACME Schools", stage: "proposal", probability: 90, status: "open", assignedTo: 42,
    }));
    expect(db.createCrmDealStageHistory).toHaveBeenCalledWith(expect.objectContaining({ dealId: 77, fromStage: null, toStage: "proposal", changedBy: 42 }));
    expect(db.upsertCrmDealContact).toHaveBeenCalledWith(expect.objectContaining({ dealId: 77, contactId: 3, role: "decision_maker" }));
  });

  it("keeps an explicit name and allows a second deal for the same organization", async () => {
    await createDeal({ pipelineId: 1, contactId: 3, stage: "discovery", name: "ACME — fall menu" }, global, { id: 42, companyId: null });
    await createDeal({ pipelineId: 1, contactId: 3, stage: "discovery", name: "ACME — spring menu" }, global, { id: 42, companyId: null });
    expect(db.createCrmDeal).toHaveBeenCalledTimes(2);
    expect(vi.mocked(db.createCrmDeal).mock.calls.map((c) => c[0].name)).toEqual(["ACME — fall menu", "ACME — spring menu"]);
  });

  it("refuses a contact outside scope", async () => {
    await expect(createDeal({ pipelineId: 1, contactId: 3, stage: "discovery" }, { mode: "entity", companyIds: [1] }, { id: 42, companyId: 1 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.createCrmDeal).not.toHaveBeenCalled();
  });
});

describe("deal items", () => {
  it("adds an item with a computed total and recomputes the deal amount", async () => {
    vi.mocked(db.getCrmDealItems).mockResolvedValueOnce([{ totalAmount: "300.00" }, { totalAmount: "45.50" }] as never);
    const r = await addDealItem(5, { description: "Plant protein crumbles", quantity: 30, unit: "case", unitPrice: 10 }, entity);
    expect(db.createCrmDealItem).toHaveBeenCalledWith(expect.objectContaining({ dealId: 5, companyId: 7, quantity: "30", unitPrice: "10", totalAmount: "300.00" }));
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, { amount: "345.50" });
    expect(r).toEqual({ id: 9, amount: 345.5 });
  });
});

describe("removeDealContact", () => {
  it("never removes the primary contact", async () => {
    await expect(removeDealContact({ dealId: 5, contactId: 3 }, global)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await removeDealContact({ dealId: 5, contactId: 4 }, global);
    expect(db.removeCrmDealContact).toHaveBeenCalledWith(5, 4);
  });
});

describe("closeDeal / listLossReasons", () => {
  it("marks a deal lost with a reason, moves it to the lost stage and logs the note", async () => {
    vi.mocked(db.getCrmLossReasonById).mockResolvedValue({ id: 2, companyId: null, name: "Price" } as never);
    const r = await closeDeal({ dealId: 5, outcome: "lost", lossReasonId: 2, note: "Went with incumbent pricing" }, entity, 42);
    expect(r.patch).toMatchObject({ status: "lost", probability: 0, lossReasonId: 2, lostReason: "Went with incumbent pricing", stage: "closed_lost" });
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, expect.objectContaining({ status: "lost", stage: "closed_lost" }));
    expect(db.createCrmDealStageHistory).toHaveBeenCalledWith(expect.objectContaining({ fromStage: "discovery", toStage: "closed_lost" }));
    expect(db.createCrmInteraction).toHaveBeenCalledWith(expect.objectContaining({ relatedDealId: 5, subject: "Deal lost" }));
  });

  it("marks a deal won and clears any loss reason", async () => {
    const r = await closeDeal({ dealId: 5, outcome: "won" }, global, 42);
    expect(r.patch).toMatchObject({ status: "won", probability: 100, lossReasonId: null, lostReason: null, stage: "closed_won" });
    expect(db.createCrmInteraction).not.toHaveBeenCalled();
  });

  it("rejects an invisible loss reason", async () => {
    vi.mocked(db.getCrmLossReasonById).mockResolvedValue({ id: 2, companyId: 99, name: "Private" } as never);
    await expect(closeDeal({ dealId: 5, outcome: "lost", lossReasonId: 2 }, entity, 42)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("seeds the default loss reasons when the table is empty", async () => {
    vi.mocked(db.getCrmLossReasons).mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ id: 1, name: "Price" }] as never);
    const rows = await listLossReasons(global);
    expect(db.createCrmLossReasons).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.createCrmLossReasons).mock.calls[0][0].map((r) => r.name)).toEqual(["Price", "Chose incumbent", "No budget this cycle", "Bid timing", "Product fit", "Distributor not carrying", "No decision"]);
    expect(rows).toHaveLength(1);
  });
});

describe("win/loss rules", () => {
  it("closing as lost without a reason is refused", async () => {
    await expect(closeDeal({ dealId: 5, outcome: "lost" }, entity, 42)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateCrmDeal).not.toHaveBeenCalled();
  });

  it("stores the won note as wonReason", async () => {
    const r = await closeDeal({ dealId: 5, outcome: "won", note: "Menu fit + price" }, entity, 42);
    expect(r.patch).toMatchObject({ status: "won", wonReason: "Menu fit + price" });
  });

  it("moving to a lost stage needs a loss reason, and records it", async () => {
    await expect(moveDealStage({ id: 5, stage: "closed_lost" }, entity, 42)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await moveDealStage({ id: 5, stage: "closed_lost", lossReasonId: 4 }, entity, 42);
    expect(db.updateCrmDeal).toHaveBeenCalledWith(5, expect.objectContaining({ stage: "closed_lost", status: "lost", lossReasonId: 4, probability: 0 }));
  });
});

describe("accounts delete / merge", () => {
  const acct = (id: number, companyId: number, parentAccountId: number | null = null) => ({ id, companyId, name: `A${id}`, parentAccountId });

  it("delete answers NOT_FOUND outside scope", async () => {
    vi.mocked(db.getCrmAccountById).mockResolvedValue(acct(1, 99) as never);
    await expect(deleteAccount(1, entity)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.deleteCrmAccount).not.toHaveBeenCalled();
    vi.mocked(db.getCrmAccountById).mockResolvedValue(acct(1, 7) as never);
    await deleteAccount(1, entity);
    expect(db.deleteCrmAccount).toHaveBeenCalledWith(1);
  });

  it("merge requires every account in scope and refuses merging a parent into its child", async () => {
    const rows: Record<number, ReturnType<typeof acct>> = { 1: acct(1, 7), 2: acct(2, 7, 1), 3: acct(3, 99) };
    vi.mocked(db.getCrmAccountById).mockImplementation(async (id: number) => rows[id] as never);
    await expect(mergeAccounts(1, [3], entity)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(mergeAccounts(2, [1], entity)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(mergeAccounts(1, [1], entity)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.mergeCrmAccounts).not.toHaveBeenCalled();
    await expect(mergeAccounts(1, [2], entity)).resolves.toMatchObject({ merged: 1 });
    expect(db.mergeCrmAccounts).toHaveBeenCalledWith(1, [2]);
  });
});

describe("tasks", () => {
  const NOW = new Date("2026-09-29T15:00:00Z");

  it("create takes entity + account from the linked deal and assigns the caller by default", async () => {
    vi.mocked(db.getCrmDealById).mockResolvedValue({ ...deal, accountId: 12 } as never);
    await createTask({ title: " Call Jane ", type: "call", dealId: 5 }, entity, { id: 42, companyId: 1 });
    expect(db.createCrmTask).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, dealId: 5, contactId: 3, accountId: 12, title: "Call Jane", type: "call", assignedTo: 42, createdBy: 42,
    }));
  });

  it("create refuses a deal outside scope", async () => {
    await expect(createTask({ title: "x", dealId: 5 }, { mode: "entity", companyIds: [1] }, { id: 42, companyId: 1 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.createCrmTask).not.toHaveBeenCalled();
  });

  it("list views scope to the caller and the entity", async () => {
    await listTasks({ view: "overdue" }, entity, 42, NOW);
    expect(db.getCrmTasks).toHaveBeenCalledWith(expect.objectContaining({
      assignedTo: 42, status: "open", companyIds: [7], dueBefore: new Date("2026-09-28T23:59:59.999Z"),
    }), NOW);
    await listTasks({ dealId: 5 }, entity, 42, NOW);
    expect(db.getCrmTasks).toHaveBeenLastCalledWith(expect.objectContaining({ dealId: 5, status: "all", companyIds: [7] }), NOW);
  });

  it("loadScopedTask hides other entities' tasks", async () => {
    vi.mocked(db.getCrmTaskById).mockResolvedValue({ id: 9, companyId: 99 } as never);
    await expect(loadScopedTask(9, entity)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rescheduling clears reminderSentAt; completing logs an interaction once", async () => {
    vi.mocked(db.getCrmTaskById).mockResolvedValue({ id: 9, companyId: 7, title: "Call", contactId: 3, dealId: 5, dueAt: NOW, completedAt: null, notes: null } as never);
    await updateTask(9, { dueAt: new Date("2026-10-02T00:00:00Z") }, entity);
    expect(db.updateCrmTask).toHaveBeenCalledWith(9, expect.objectContaining({ reminderSentAt: null }));
    await completeTask(9, true, entity, 42, NOW);
    expect(db.updateCrmTask).toHaveBeenLastCalledWith(9, { completedAt: NOW });
    expect(db.createCrmInteraction).toHaveBeenCalledWith(expect.objectContaining({ contactId: 3, relatedDealId: 5, interactionType: "task_completed" }));
  });

  it("reminder digest: one email per assignee, marks tasks only when sent", async () => {
    vi.mocked(db.getCrmTasksDueForReminder).mockResolvedValue([
      { id: 1, title: "A", type: "call", dueAt: new Date("2026-09-27T10:00:00Z"), assignedTo: 42 },
      { id: 2, title: "B", type: "email", dueAt: NOW, assignedTo: 42 },
      { id: 3, title: "C", type: "todo", dueAt: NOW, assignedTo: 43 },
    ] as never);
    vi.mocked(db.getUserById).mockImplementation(async (id: number) => ({ id, name: `U${id}`, email: `u${id}@x.co` }) as never);
    vi.mocked(sendEmail).mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: "boom" });
    const r = await sendCrmTaskReminders(NOW);
    expect(r).toMatchObject({ tasks: 3, sent: 1, failed: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: "u42@x.co", subject: "CRM: 2 tasks due" });
    expect(db.markCrmTasksReminded).toHaveBeenCalledTimes(1);
    expect(db.markCrmTasksReminded).toHaveBeenCalledWith([1, 2], NOW);
  });
});

describe("runStaleDealCheck", () => {
  const NOW = new Date("2026-09-29T12:00:00Z");
  const base = { ...deal, createdAt: new Date("2026-08-01T00:00:00Z"), assignedTo: 42, accountId: null, isStale: false };

  it("flags idle / past-close deals, clears recovered ones and opens one follow-up task", async () => {
    vi.mocked(db.getCrmDeals).mockResolvedValueOnce([
      { ...base, id: 1 }, // idle since creation, no task yet
      { ...base, id: 2, expectedCloseDate: new Date("2026-09-01T00:00:00Z") }, // past close, has an open task
      { ...base, id: 3, isStale: true }, // recovered: recent activity
    ] as never);
    vi.mocked(db.getCrmDealLastActivity).mockResolvedValueOnce(new Map([
      [2, new Date("2026-09-25T00:00:00Z")],
      [3, new Date("2026-09-28T00:00:00Z")],
    ]));
    vi.mocked(db.getOpenCrmTasksForDeal).mockImplementation(async (id: number) => (id === 2 ? [{ id: 99 }] : []) as never);
    const r = await runStaleDealCheck(NOW);
    expect(r).toEqual({ checked: 3, stale: 2, cleared: 1, tasksCreated: 1 });
    expect(db.setCrmDealsStale).toHaveBeenCalledWith([1, 2], true);
    expect(db.setCrmDealsStale).toHaveBeenCalledWith([3], false);
    expect(db.createCrmTask).toHaveBeenCalledTimes(1);
    expect(db.createCrmTask).toHaveBeenCalledWith(expect.objectContaining({ dealId: 1, type: "follow_up", assignedTo: 42, companyId: 7 }));
  });
});

describe("recomputeLeadScore", () => {
  it("persists the computed score from contact, account, activity and open deals", async () => {
    const NOW = new Date("2026-09-29T12:00:00Z");
    vi.mocked(db.getCrmContactById).mockResolvedValue({ id: 3, contactType: "prospect", accountId: 12, leadScore: 0, lastRepliedAt: new Date("2026-09-20T00:00:00Z") } as never);
    vi.mocked(db.getCrmAccountById).mockResolvedValue({ id: 12, type: "district", mealsPerDay: 12000 } as never);
    vi.mocked(db.getCrmContactLastInteractionAt).mockResolvedValue(new Date("2026-09-27T00:00:00Z"));
    vi.mocked(db.getCrmDeals).mockResolvedValueOnce([{ amount: "60000" }] as never);
    const r = await recomputeLeadScore(3, NOW);
    // prospect 18 + district 15 + 12k meals 15 + touched 2d ago 15 + replied 9d ago 15 + $60k 7
    expect(r?.score).toBe(85);
    expect(db.updateCrmContact).toHaveBeenCalledWith(3, { leadScore: 85 });
  });
});

describe("salesReport", () => {
  it("summarises scoped deals with loss reasons and velocity", async () => {
    vi.mocked(db.getCrmDeals).mockResolvedValueOnce([
      { ...deal, id: 1, status: "won", amount: "100", createdAt: new Date("2026-01-01"), wonAt: new Date("2026-01-11"), source: "Referral" },
      { ...deal, id: 2, status: "lost", amount: "50", createdAt: new Date("2026-01-01"), lossReasonId: 4, source: "referral" },
      { ...deal, id: 3, status: "open", amount: "1000", createdAt: new Date("2026-01-01"), isStale: true },
    ] as never);
    vi.mocked(db.getCrmLossReasons).mockResolvedValueOnce([{ id: 4, name: "Price" }] as never);
    const r = await salesReport(entity);
    expect(db.getCrmDeals).toHaveBeenCalledWith(expect.objectContaining({ companyIds: [7] }));
    expect(r).toMatchObject({ wonCount: 1, lostCount: 1, winRate: 50, avgCycleDays: 10 });
    expect(r.lossesByReason).toEqual([{ reasonId: 4, reason: "Price", count: 1, amount: 50 }]);
    expect(r.bySource[0]).toMatchObject({ source: "Referral", count: 2, won: 1 });
    expect(r.staleDeals.map((d) => d.id)).toEqual([3]);
    expect(r.velocity).toEqual([]);
  });
});

describe("CSV import", () => {
  const csv = [
    "First Name,Last Name,Email,Company,Title",
    "Jane,Doe,jane@district.org,Springfield USD,Food Services Director",
    "Bob,,bob@dup.com,Acme Foods,",
    "No,Email,,,",
    "Jane,Again,JANE@district.org,Springfield USD,",
    "Eve,,eve@other.org,Other Co,",
  ].join("\n");
  const matcher = async (q: { email?: string | null }) =>
    (q.email === "bob@dup.com" ? { id: 8, companyId: 7, fullName: "Bob D" } : q.email === "eve@other.org" ? { id: 9, companyId: 99, fullName: "Eve" } : undefined) as never;

  it("preview guesses the mapping and tags new / duplicate / invalid rows", async () => {
    vi.mocked(db.findCrmContactMatch).mockImplementation(matcher);
    const p = await importPreview({ csv }, entity);
    expect(p.mapping).toEqual({ 0: "firstName", 1: "lastName", 2: "email", 3: "organization", 4: "jobTitle" });
    expect(p.rows.map((r) => [r.row, r.status])).toEqual([[2, "new"], [3, "duplicate"], [4, "invalid"], [5, "duplicate"], [6, "duplicate"]]);
    expect(p.rows[1]).toMatchObject({ matchId: 8, matchName: "Bob D", matchOutOfScope: false });
    expect(p.rows[4]).toMatchObject({ matchId: 9, matchOutOfScope: true });
    expect(p.rows[4].matchName).toBeUndefined();
    expect(p.counts).toEqual({ new: 1, duplicate: 3, invalid: 1 });
  });

  it("commit inserts new rows with accounts, fills blanks on in-scope duplicates only", async () => {
    vi.mocked(db.findCrmContactMatch).mockImplementation(matcher);
    vi.mocked(db.getCrmContactById).mockResolvedValue({ id: 8, companyId: 7, fullName: "Bob D", organization: null, accountId: null, lastName: "D" } as never);
    const mapping = { 0: "firstName", 1: "lastName", 2: "email", 3: "organization", 4: "jobTitle" } as const;
    const r = await importCommit({ csv, mapping, updateDuplicates: true, createAccounts: true }, entity, { id: 42, companyId: 7, email: "me@superhumn.co" });
    expect(db.createCrmContact).toHaveBeenCalledTimes(1);
    expect(db.createCrmContact).toHaveBeenCalledWith(expect.objectContaining({
      firstName: "Jane", email: "jane@district.org", organization: "Springfield USD", source: "import", contactType: "lead", companyId: 7, accountId: 300,
    }));
    expect(db.updateCrmContact).toHaveBeenCalledWith(8, expect.objectContaining({ organization: "Acme Foods", accountId: 300 }));
    expect(r).toMatchObject({ created: 1, updated: 1, invalid: 1, accountsCreated: 2 });
    expect(r.skipped).toBe(2); // in-file duplicate + out-of-scope match
  });
});
