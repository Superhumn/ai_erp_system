/**
 * CRM feature logic. Routers in server/routers/crm.ts call these; the pure
 * rules live in server/crmLogic.ts so they can be tested without a DB.
 *
 * Every by-id loader here answers NOT_FOUND (never FORBIDDEN) for a row that
 * exists but belongs to an entity outside the caller's scope — confirming a
 * record exists would leak another entity's data.
 */
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import type { Scope } from "./_core/scope";
import {
  DEFAULT_ROTTING_DAYS,
  computeForecast,
  crmRowVisible,
  crmScopeCompanyIds,
  findStage,
  parseStageNames,
  resolveMoveProbability,
  seedStagesFromNames,
  statusForStage,
} from "./crmLogic";

export type CrmScope = Scope;

function notFound(what: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
}

// ---------------------------------------------------------------------------
// Scoped by-id loaders
// ---------------------------------------------------------------------------

export async function loadScopedContact(id: number, scope: Scope) {
  const row = await db.getCrmContactById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Contact");
  return row;
}

export async function loadScopedContactByEmail(email: string, scope: Scope) {
  const row = await db.getCrmContactByEmail(email);
  if (!row || !crmRowVisible(scope, row.companyId)) return undefined;
  return row;
}

export async function loadScopedDeal(id: number, scope: Scope) {
  const row = await db.getCrmDealById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Deal");
  return row;
}

export async function loadScopedPipeline(id: number, scope: Scope) {
  const row = await db.getCrmPipelineById(id);
  if (!row || !crmRowVisible(scope, row.companyId, { sharedWhenNull: true })) notFound("Pipeline");
  return row;
}

export async function loadScopedTag(id: number, scope: Scope) {
  const row = await db.getCrmTagById(id);
  if (!row || !crmRowVisible(scope, row.companyId, { sharedWhenNull: true })) notFound("Tag");
  return row;
}

export async function loadScopedCapture(id: number, scope: Scope) {
  const row = await db.getContactCaptureById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Capture");
  return row;
}

export async function loadScopedAccount(id: number, scope: Scope) {
  const row = await db.getCrmAccountById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Account");
  return row;
}

/**
 * Validates a parent assignment: the parent must be visible, must not be the
 * account itself, and must not be one of its descendants (no cycles).
 */
export async function assertValidParentAccount(accountId: number | null, parentAccountId: number, scope: Scope): Promise<void> {
  if (accountId != null && parentAccountId === accountId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An account cannot be its own parent" });
  }
  let cursor: number | null = parentAccountId;
  const seen = new Set<number>();
  while (cursor != null) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const parent = await loadScopedAccount(cursor, scope);
    if (accountId != null && parent.parentAccountId === accountId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That parent is a child of this account" });
    }
    cursor = parent.parentAccountId ?? null;
  }
}

/** Account detail: the row plus parent, children, contacts, deals and a merged timeline. */
export async function getAccountDetail(id: number, scope: Scope) {
  const account = await loadScopedAccount(id, scope);
  const companyIds = crmScopeCompanyIds(scope);
  const [parent, children, contacts, deals] = await Promise.all([
    account.parentAccountId ? db.getCrmAccountById(account.parentAccountId) : Promise.resolve(undefined),
    db.getCrmAccountChildren(id),
    db.getCrmContacts({ accountId: id, companyIds, limit: 500 }),
    db.getCrmDeals({ accountId: id, companyIds, limit: 500 }),
  ]);
  const timeline = contacts.length
    ? (await Promise.all(contacts.map((c) => db.getCrmInteractions({ contactId: c.id, limit: 20 }))))
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50)
    : [];
  return { ...account, parent: parent && crmRowVisible(scope, parent.companyId) ? parent : null, children, contacts, deals, timeline };
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

/**
 * Stage rows for a pipeline. A pipeline created before stages existed (or
 * one the SQL backfill could not parse) is seeded from its JSON `stages`
 * array on first read, so the kanban always has typed columns.
 */
export async function getOrSeedPipelineStages(pipeline: { id: number; companyId?: number | null; stages: string | null }) {
  const existing = await db.getCrmPipelineStages(pipeline.id);
  if (existing.length > 0) return existing;
  const names = parseStageNames(pipeline.stages);
  if (names.length === 0) return existing;
  await db.createCrmPipelineStages(seedStagesFromNames(names).map((s) => ({
    companyId: pipeline.companyId ?? null,
    pipelineId: pipeline.id,
    name: s.name,
    sortOrder: s.sortOrder,
    defaultProbability: s.defaultProbability,
    isWon: s.isWon,
    isLost: s.isLost,
  })));
  return db.getCrmPipelineStages(pipeline.id);
}

export async function listPipelineStages(pipelineId: number, scope: Scope) {
  const pipeline = await loadScopedPipeline(pipelineId, scope);
  return getOrSeedPipelineStages(pipeline);
}

export async function loadScopedStage(id: number, scope: Scope) {
  const stage = await db.getCrmPipelineStageById(id);
  if (!stage) notFound("Stage");
  await loadScopedPipeline(stage.pipelineId, scope);
  return stage;
}

/** Keeps the legacy JSON `stages` column in step with the stage rows. */
async function syncPipelineStageJson(pipelineId: number) {
  const stages = await db.getCrmPipelineStages(pipelineId);
  await db.updateCrmPipeline(pipelineId, { stages: JSON.stringify(stages.map((s) => s.name)) });
}

export async function createPipelineStage(input: {
  pipelineId: number; name: string; defaultProbability?: number; isWon?: boolean; isLost?: boolean; rottingDays?: number | null;
}, scope: Scope) {
  const pipeline = await loadScopedPipeline(input.pipelineId, scope);
  const stages = await getOrSeedPipelineStages(pipeline);
  if (findStage(stages, input.name)) {
    throw new TRPCError({ code: "CONFLICT", message: `Stage "${input.name}" already exists` });
  }
  const id = await db.createCrmPipelineStage({
    companyId: pipeline.companyId ?? null,
    pipelineId: pipeline.id,
    name: input.name.trim(),
    sortOrder: stages.length,
    defaultProbability: input.defaultProbability ?? 10,
    isWon: input.isWon ?? false,
    isLost: input.isLost ?? false,
    rottingDays: input.rottingDays ?? null,
  });
  await syncPipelineStageJson(pipeline.id);
  return id;
}

export async function updatePipelineStage(id: number, data: {
  name?: string; defaultProbability?: number; isWon?: boolean; isLost?: boolean; rottingDays?: number | null;
}, scope: Scope) {
  const stage = await loadScopedStage(id, scope);
  if (data.name && data.name.trim().toLowerCase() !== stage.name.toLowerCase()) {
    const siblings = await db.getCrmPipelineStages(stage.pipelineId);
    if (findStage(siblings, data.name)) throw new TRPCError({ code: "CONFLICT", message: `Stage "${data.name}" already exists` });
    // Deals reference stages by name; keep them attached.
    const inStage = await db.getCrmDeals({ pipelineId: stage.pipelineId, stage: stage.name, limit: 10000 });
    for (const d of inStage) await db.updateCrmDeal(d.id, { stage: data.name.trim() });
  }
  await db.updateCrmPipelineStage(id, { ...data, ...(data.name ? { name: data.name.trim() } : {}) });
  await syncPipelineStageJson(stage.pipelineId);
  return stage;
}

/**
 * Legacy path: the pipeline's JSON `stages` array was edited directly. Adds
 * rows for new names (seeded probabilities), removes rows for dropped names
 * that hold no deals, and reorders the rest to match the array.
 */
export async function syncStagesFromJson(pipeline: { id: number; companyId?: number | null }, names: string[]) {
  const existing = await db.getCrmPipelineStages(pipeline.id);
  const seeded = seedStagesFromNames(names);
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const row of existing) {
    if (!wanted.has(row.name.toLowerCase()) && (await db.countCrmDealsInStage(pipeline.id, row.name)) === 0) {
      await db.deleteCrmPipelineStage(row.id);
    }
  }
  const byName = new Map((await db.getCrmPipelineStages(pipeline.id)).map((r) => [r.name.toLowerCase(), r]));
  for (const s of seeded) {
    const row = byName.get(s.name.toLowerCase());
    if (row) {
      if (row.sortOrder !== s.sortOrder) await db.updateCrmPipelineStage(row.id, { sortOrder: s.sortOrder });
    } else {
      await db.createCrmPipelineStage({
        companyId: pipeline.companyId ?? null, pipelineId: pipeline.id, name: s.name, sortOrder: s.sortOrder,
        defaultProbability: s.defaultProbability, isWon: s.isWon, isLost: s.isLost,
      });
    }
  }
}

export async function reorderPipelineStages(pipelineId: number, orderedIds: number[], scope: Scope) {
  await loadScopedPipeline(pipelineId, scope);
  const stages = await db.getCrmPipelineStages(pipelineId);
  const known = new Set(stages.map((s) => s.id));
  if (orderedIds.length !== stages.length || orderedIds.some((id) => !known.has(id))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "orderedIds must list every stage of the pipeline exactly once" });
  }
  await db.reorderCrmPipelineStages(pipelineId, orderedIds);
  await syncPipelineStageJson(pipelineId);
}

export async function deletePipelineStage(id: number, scope: Scope) {
  const stage = await loadScopedStage(id, scope);
  const inUse = await db.countCrmDealsInStage(stage.pipelineId, stage.name);
  if (inUse > 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${inUse} deal(s) are in "${stage.name}" — move them first` });
  }
  await db.deleteCrmPipelineStage(id);
  await syncPipelineStageJson(stage.pipelineId);
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

/**
 * Moves a deal to a stage: probability defaults to the stage's value when the
 * caller passes none, status follows won/lost stages, and the move is
 * recorded in crm_deal_stage_history.
 */
export async function moveDealStage(input: { id: number; stage: string; probability?: number }, scope: Scope, userId: number) {
  const deal = await loadScopedDeal(input.id, scope);
  const pipeline = await db.getCrmPipelineById(deal.pipelineId);
  const stages = pipeline ? await getOrSeedPipelineStages(pipeline) : [];
  const target = findStage(stages, input.stage);
  const stageName = target?.name ?? input.stage;
  const probability = resolveMoveProbability(input.probability, target);
  const status = statusForStage(target);
  await db.updateCrmDeal(input.id, {
    stage: stageName,
    ...(probability !== undefined ? { probability } : {}),
    ...(status && status !== deal.status && (status !== "open" || deal.status === "won" || deal.status === "lost") ? { status } : {}),
  });
  if (stageName !== deal.stage) {
    await db.createCrmDealStageHistory({
      companyId: deal.companyId ?? null,
      dealId: deal.id,
      fromStage: deal.stage,
      toStage: stageName,
      changedAt: new Date(),
      changedBy: userId,
    });
  }
  return { deal, stage: stageName, probability, status };
}

/** Weighted pipeline for the caller's scope (optionally one pipeline). */
export async function dealForecast(scope: Scope, pipelineId?: number) {
  const companyIds = crmScopeCompanyIds(scope);
  const deals = await db.getCrmDeals({ status: "open", pipelineId, companyIds, limit: 10000 });
  const pipelineIds = [...new Set(deals.map((d) => d.pipelineId))];
  const stages = (await db.getCrmPipelineStagesForPipelines(pipelineIds)).map((s) => ({ ...s }));
  return computeForecast(deals, stages);
}

/**
 * Open deals annotated with their stage's rotting threshold and last activity,
 * for the kanban badge and the stale-deal job.
 */
export async function annotateDealActivity<T extends { id: number; pipelineId: number; stage: string }>(deals: T[]) {
  const pipelineIds = [...new Set(deals.map((d) => d.pipelineId))];
  const stages = await db.getCrmPipelineStagesForPipelines(pipelineIds);
  const lastActivity = await db.getCrmDealLastActivity(deals.map((d) => d.id));
  return deals.map((d) => {
    const stage = findStage(stages.filter((s) => s.pipelineId === d.pipelineId), d.stage);
    return { ...d, rottingDays: stage?.rottingDays ?? DEFAULT_ROTTING_DAYS, lastActivityAt: lastActivity.get(d.id) ?? null };
  });
}

/** Allow-list for list helpers (`null` = unrestricted). */
export function scopeIds(scope: Scope): number[] | null {
  return crmScopeCompanyIds(scope);
}
