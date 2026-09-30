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
import { resolveScopeFromAccess, type Scope } from "./_core/scope";
import {
  DEFAULT_LOSS_REASONS,
  DEFAULT_ROTTING_DAYS,
  closeDealPatch,
  computeForecast,
  dealAmountFromItems,
  dealItemTotal,
  crmRowVisible,
  crmScopeCompanyIds,
  findStage,
  parseStageNames,
  resolveMoveProbability,
  seedStagesFromNames,
  statusForStage,
  computeLeadScore,
  computeSalesReport,
  computeVelocity,
  dealStaleReason,
  endOfUtcDay,
  groupTasksByAssignee,
  guessImportMapping,
  mapImportRow,
  parseCsv,
  renderTaskReminderText,
  staleFollowUpTitle,
  taskViewFilters,
  findStageInPipeline,
  idsAreUnique,
  outcomeTimestamps,
  sameCompany,
  type ImportMapping,
  type ImportedContact,
  type TaskView,
} from "./crmLogic";
import { sendEmail } from "./_core/email";
import { createLogger } from "./_core/logger";

const logger = createLogger("crm");

export type CrmScope = Scope;

function notFound(what: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
}

/** Records linked together (deal ↔ account, task ↔ deal, …) must share an entity. */
function assertSameCompany(a: number | null | undefined, b: number | null | undefined, message: string): void {
  if (!sameCompany(a, b)) throw new TRPCError({ code: "BAD_REQUEST", message });
}

/** Loss reason visible to the caller (NULL companyId = shared default) and active. */
export async function loadScopedLossReason(id: number, scope: Scope) {
  const reason = await db.getCrmLossReasonById(id);
  if (!reason || !crmRowVisible(scope, reason.companyId, { sharedWhenNull: true }) || reason.isActive === false) notFound("Loss reason");
  return reason;
}

/** Portal roles never own CRM work (mirrors routers/_shared EXTERNAL_ROLES). */
const EXTERNAL_ROLES = ["copacker", "vendor", "investor", "contractor"];

/** Entity scope of an arbitrary user (same resolution as the request scope). */
export async function scopeForUser(user: { id: number; companyId: number | null; regionScope?: "entity" | "region" | "global" | null }): Promise<Scope> {
  const accessEntityIds = await db.getUserEntityAccessCompanyIds(user.id);
  return resolveScopeFromAccess({ companyId: user.companyId, regionScope: user.regionScope ?? null }, accessEntityIds, {
    getCompanyRegionId: async (id) => (await db.getCompanyById(id))?.regionId ?? null,
    getCompanyIdsInRegion: (regionId) => db.getCompanyIdsInRegion(regionId),
    getEntityAndDescendants: (id) => db.getEntityAndDescendantCompanyIds(id),
  });
}

/**
 * Whether `userId` may own work on a row of `companyId`: an existing internal
 * user whose entity scope includes that entity.
 */
export async function userCanAccessCompany(userId: number, companyId: number | null | undefined): Promise<boolean> {
  const user = await db.getUserById(userId);
  if (!user || EXTERNAL_ROLES.includes(user.role)) return false;
  return crmRowVisible(await scopeForUser(user), companyId);
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
 * Validates a parent assignment: the parent must be visible, in the same
 * entity as the child (`childCompanyId`), not the account itself, and not one
 * of its descendants (no cycles).
 */
export async function assertValidParentAccount(
  accountId: number | null,
  parentAccountId: number,
  scope: Scope,
  childCompanyId: number | null | undefined,
): Promise<void> {
  if (accountId != null && parentAccountId === accountId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An account cannot be its own parent" });
  }
  let cursor: number | null = parentAccountId;
  const seen = new Set<number>();
  while (cursor != null) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const parent = await loadScopedAccount(cursor, scope);
    if (cursor === parentAccountId) assertSameCompany(parent.companyId, childCompanyId, "A parent account must belong to the same entity");
    if (accountId != null && parent.parentAccountId === accountId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That parent is a child of this account" });
    }
    cursor = parent.parentAccountId ?? null;
  }
}

export interface AccountInput {
  name?: string;
  type?: "district" | "school" | "distributor" | "operator" | "gpo" | "other";
  parentAccountId?: number | null;
  region?: string | null;
  state?: string | null;
  mealsPerDay?: number | null;
  externalId?: string | null;
  customerId?: number | null;
  website?: string | null;
  notes?: string | null;
  assignedTo?: number | null;
}

export async function createAccount(input: AccountInput & { name: string }, scope: Scope, user: { companyId: number | null }) {
  const companyId = user.companyId ?? null;
  if (input.parentAccountId) await assertValidParentAccount(null, input.parentAccountId, scope, companyId);
  return db.createCrmAccount({ ...input, companyId });
}

export async function updateAccount(id: number, data: AccountInput, scope: Scope) {
  const existing = await loadScopedAccount(id, scope);
  if (data.parentAccountId) await assertValidParentAccount(id, data.parentAccountId, scope, existing.companyId);
  await db.updateCrmAccount(id, data);
  return existing;
}

/** Direct children of an account, limited to the caller's scope and the parent's entity. */
export async function listAccountChildren(accountId: number, scope: Scope) {
  const account = await loadScopedAccount(accountId, scope);
  return (await db.getCrmAccountChildren(accountId))
    .filter((c) => crmRowVisible(scope, c.companyId) && sameCompany(c.companyId, account.companyId));
}

export const ACCOUNT_DETAIL_PAGE = 50;

/**
 * Account detail: the row plus parent and direct children, then contacts,
 * deals and a timeline across the account and its whole sub-account tree
 * (a district includes its schools). `rollup` totals are aggregate queries
 * over the full subtree (no cap); the row lists are paged (`limit` /
 * `*Offset`) and report `hasMore` when truncated.
 */
export async function getAccountDetail(
  id: number,
  scope: Scope,
  page: { limit?: number; contactsOffset?: number; dealsOffset?: number; timelineOffset?: number } = {},
) {
  const account = await loadScopedAccount(id, scope);
  const limit = Math.min(Math.max(page.limit ?? ACCOUNT_DETAIL_PAGE, 1), 500);
  const [parent, children, descendants] = await Promise.all([
    account.parentAccountId ? db.getCrmAccountById(account.parentAccountId) : Promise.resolve(undefined),
    listAccountChildren(id, scope),
    db.getCrmAccountDescendantIds(id, account.companyId ?? null),
  ]);
  const subtree = [id, ...descendants];
  const visible = <T extends { companyId?: number | null }>(rows: T[]) => rows.filter((r) => crmRowVisible(scope, r.companyId));
  const [rollup, contactRows, dealRows, timelineRows] = await Promise.all([
    db.getCrmAccountRollup(subtree),
    db.getCrmContactsForAccounts(subtree, limit + 1, page.contactsOffset ?? 0),
    db.getCrmDealsForAccounts(subtree, limit + 1, page.dealsOffset ?? 0),
    db.getCrmInteractionsForAccounts(subtree, limit + 1, page.timelineOffset ?? 0),
  ]);
  return {
    ...account,
    parent: parent && crmRowVisible(scope, parent.companyId) ? parent : null,
    children,
    contacts: visible(contactRows.slice(0, limit)),
    deals: visible(dealRows.slice(0, limit)),
    timeline: visible(timelineRows.slice(0, limit)),
    hasMore: { contacts: contactRows.length > limit, deals: dealRows.length > limit, timeline: timelineRows.length > limit },
    pageSize: limit,
    rollup: { descendantCount: descendants.length, ...rollup },
  };
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
  if (!idsAreUnique(orderedIds) || orderedIds.length !== stages.length || orderedIds.some((id) => !known.has(id))) {
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
 * caller passes none, status follows won/lost stages (with wonAt / lostAt
 * stamped or cleared like deals.close and deals.update), and the move is
 * recorded in crm_deal_stage_history. Moving into a lost stage needs a loss
 * reason visible to the caller.
 */
export async function moveDealStage(input: { id: number; stage: string; probability?: number; lossReasonId?: number | null }, scope: Scope, userId: number, now: Date = new Date()) {
  const deal = await loadScopedDeal(input.id, scope);
  const pipeline = await db.getCrmPipelineById(deal.pipelineId);
  const stages = pipeline ? await getOrSeedPipelineStages(pipeline) : [];
  const target = findStage(stages, input.stage);
  const stageName = target?.name ?? input.stage;
  const probability = resolveMoveProbability(input.probability, target);
  const stageStatus = statusForStage(target);
  const nextStatus = stageStatus && stageStatus !== deal.status && (stageStatus !== "open" || deal.status === "won" || deal.status === "lost")
    ? stageStatus
    : undefined;
  if (input.lossReasonId) await loadScopedLossReason(input.lossReasonId, scope);
  const lossReasonId = input.lossReasonId ?? deal.lossReasonId ?? null;
  if (nextStatus === "lost" && !lossReasonId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a loss reason to move the deal to a lost stage" });
  }
  await db.updateCrmDeal(input.id, {
    stage: stageName,
    ...(probability !== undefined ? { probability } : {}),
    ...(nextStatus ? { status: nextStatus, ...outcomeTimestamps(deal.status, nextStatus, now) } : {}),
    ...(target?.isLost && input.lossReasonId ? { lossReasonId: input.lossReasonId } : {}),
    // A move re-engages the deal; the next stale check re-evaluates it.
    ...(stageName !== deal.stage ? { isStale: false } : {}),
  });
  if (stageName !== deal.stage) {
    await db.createCrmDealStageHistory({
      companyId: deal.companyId ?? null,
      dealId: deal.id,
      fromStage: deal.stage,
      toStage: stageName,
      changedAt: now,
      changedBy: userId,
    });
  }
  await recomputeLeadScoreSafe(deal.contactId);
  return { deal, stage: stageName, probability, status: stageStatus };
}

export interface CreateDealInput {
  pipelineId: number;
  contactId: number;
  accountId?: number;
  name?: string;
  description?: string;
  stage: string;
  amount?: string;
  currency?: string;
  probability?: number;
  expectedCloseDate?: Date;
  source?: string;
  campaign?: string;
  notes?: string;
  assignedTo?: number;
}

/**
 * Creates a deal directly. The name defaults to the contact's account /
 * organization (a contact may now have any number of deals); probability
 * defaults to the stage's value; the initial stage is recorded in history.
 * An explicit account must be in the contact's entity; the contact's own
 * account is used only when it is.
 */
export async function createDeal(input: CreateDealInput, scope: Scope, user: { id: number; companyId: number | null }) {
  const contact = await loadScopedContact(input.contactId, scope);
  const pipeline = await loadScopedPipeline(input.pipelineId, scope);
  const stages = await getOrSeedPipelineStages(pipeline);
  const stage = findStage(stages, input.stage);
  const companyId = contact.companyId ?? user.companyId ?? null;
  let accountId: number | null = null;
  let accountName: string | null = null;
  if (input.accountId) {
    const account = await loadScopedAccount(input.accountId, scope);
    assertSameCompany(account.companyId, companyId, "The account belongs to a different entity than the contact");
    accountId = account.id;
    accountName = account.name;
  } else if (contact.accountId) {
    const account = await db.getCrmAccountById(contact.accountId);
    if (account && crmRowVisible(scope, account.companyId) && sameCompany(account.companyId, companyId)) {
      accountId = account.id;
      accountName = account.name;
    }
  }
  const name = input.name?.trim() || accountName || (contact.organization ?? "").trim() || contact.fullName;
  const id = await db.createCrmDeal({
    companyId,
    pipelineId: pipeline.id,
    contactId: contact.id,
    accountId,
    name,
    description: input.description,
    stage: stage?.name ?? input.stage,
    amount: input.amount,
    currency: input.currency ?? "USD",
    probability: resolveMoveProbability(input.probability, stage) ?? 0,
    expectedCloseDate: input.expectedCloseDate,
    status: statusForStage(stage) ?? "open",
    source: input.source,
    campaign: input.campaign,
    notes: input.notes,
    assignedTo: input.assignedTo ?? user.id,
  });
  await db.createCrmDealStageHistory({ companyId, dealId: id, fromStage: null, toStage: stage?.name ?? input.stage, changedAt: new Date(), changedBy: user.id });
  await db.upsertCrmDealContact({ companyId, dealId: id, contactId: contact.id, role: "decision_maker" });
  await recomputeLeadScoreSafe(contact.id);
  return { id, name };
}

export interface UpdateDealInput {
  name?: string;
  description?: string;
  stage?: string;
  amount?: string;
  probability?: number;
  status?: "open" | "won" | "lost" | "stalled";
  lostReason?: string;
  lossReasonId?: number | null;
  wonReason?: string | null;
  accountId?: number | null;
  contactId?: number;
  expectedCloseDate?: Date | null;
  notes?: string;
  assignedTo?: number;
}

/**
 * deals.update: linked account / contact must be in the deal's entity; a
 * status change to lost needs a visible loss reason; won/lost timestamps
 * follow the same rules as moveStage and close.
 */
export async function updateDeal(id: number, data: UpdateDealInput, scope: Scope, now: Date = new Date()) {
  const existing = await loadScopedDeal(id, scope);
  if (data.accountId) {
    const account = await loadScopedAccount(data.accountId, scope);
    assertSameCompany(account.companyId, existing.companyId, "The account belongs to a different entity than the deal");
  }
  if (data.contactId) {
    const contact = await loadScopedContact(data.contactId, scope);
    assertSameCompany(contact.companyId, existing.companyId, "The contact belongs to a different entity than the deal");
  }
  if (data.lossReasonId) await loadScopedLossReason(data.lossReasonId, scope);
  if (data.status === "lost" && existing.status !== "lost" && !(data.lossReasonId ?? existing.lossReasonId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a loss reason to mark the deal lost" });
  }
  await db.updateCrmDeal(id, { ...data, ...outcomeTimestamps(existing.status, data.status, now) });
  return existing;
}

// --- Deal contacts ---

export async function listDealContacts(dealId: number, scope: Scope) {
  await loadScopedDeal(dealId, scope);
  return db.getCrmDealContacts(dealId);
}

export async function addDealContact(input: { dealId: number; contactId: number; role?: DealContactRole }, scope: Scope) {
  const deal = await loadScopedDeal(input.dealId, scope);
  const contact = await loadScopedContact(input.contactId, scope);
  assertSameCompany(contact.companyId, deal.companyId, "The contact belongs to a different entity than the deal");
  return db.upsertCrmDealContact({ companyId: deal.companyId ?? null, dealId: deal.id, contactId: input.contactId, role: input.role ?? "other" });
}

export async function removeDealContact(input: { dealId: number; contactId: number }, scope: Scope) {
  const deal = await loadScopedDeal(input.dealId, scope);
  if (deal.contactId === input.contactId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The primary contact cannot be removed; change the deal's contact instead" });
  }
  await db.removeCrmDealContact(deal.id, input.contactId);
}

export type DealContactRole = "decision_maker" | "champion" | "procurement" | "influencer" | "blocker" | "other";

// --- Deal items ---

/** Recomputes the deal amount from its items (only when it has any). */
export async function recomputeDealAmount(dealId: number) {
  const items = await db.getCrmDealItems(dealId);
  const amount = dealAmountFromItems(items);
  if (amount !== undefined) await db.updateCrmDeal(dealId, { amount: amount.toFixed(2) });
  return amount;
}

export async function listDealItems(dealId: number, scope: Scope) {
  await loadScopedDeal(dealId, scope);
  return db.getCrmDealItems(dealId);
}

export interface DealItemInput {
  productId?: number | null;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  annualVolume?: number | null;
}

export async function addDealItem(dealId: number, input: DealItemInput, scope: Scope) {
  const deal = await loadScopedDeal(dealId, scope);
  const id = await db.createCrmDealItem({
    companyId: deal.companyId ?? null,
    dealId: deal.id,
    productId: input.productId ?? null,
    description: input.description.trim(),
    quantity: String(input.quantity),
    unit: input.unit ?? "case",
    unitPrice: String(input.unitPrice),
    annualVolume: input.annualVolume != null ? String(input.annualVolume) : null,
    totalAmount: dealItemTotal(input.quantity, input.unitPrice).toFixed(2),
  });
  const amount = await recomputeDealAmount(deal.id);
  return { id, amount };
}

export async function updateDealItem(id: number, patch: Partial<DealItemInput>, scope: Scope) {
  const item = await db.getCrmDealItemById(id);
  if (!item) notFound("Deal item");
  await loadScopedDeal(item.dealId, scope);
  const quantity = patch.quantity ?? Number(item.quantity);
  const unitPrice = patch.unitPrice ?? Number(item.unitPrice);
  await db.updateCrmDealItem(id, {
    ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
    ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
    ...(patch.annualVolume !== undefined ? { annualVolume: patch.annualVolume != null ? String(patch.annualVolume) : null } : {}),
    quantity: String(quantity),
    unitPrice: String(unitPrice),
    totalAmount: dealItemTotal(quantity, unitPrice).toFixed(2),
  });
  const amount = await recomputeDealAmount(item.dealId);
  return { amount };
}

export async function removeDealItem(id: number, scope: Scope) {
  const item = await db.getCrmDealItemById(id);
  if (!item) notFound("Deal item");
  await loadScopedDeal(item.dealId, scope);
  await db.deleteCrmDealItem(id);
  const amount = await recomputeDealAmount(item.dealId);
  return { amount };
}

// --- Loss reasons / close ---

export async function listLossReasons(scope: Scope) {
  let rows = await db.getCrmLossReasons(crmScopeCompanyIds(scope));
  if (rows.length === 0) {
    // Fresh database where the migration seed did not run (e.g. ensure-tables bootstrap).
    await db.createCrmLossReasons(DEFAULT_LOSS_REASONS.map((name, sortOrder) => ({ companyId: null, name, sortOrder })));
    rows = await db.getCrmLossReasons(crmScopeCompanyIds(scope));
  }
  return rows;
}

export async function closeDeal(
  input: { dealId: number; outcome: "won" | "lost"; lossReasonId?: number | null; note?: string | null },
  scope: Scope,
  userId: number,
) {
  const deal = await loadScopedDeal(input.dealId, scope);
  if (input.outcome === "lost" && !input.lossReasonId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a loss reason to close the deal as lost" });
  }
  if (input.outcome === "lost" && input.lossReasonId) await loadScopedLossReason(input.lossReasonId, scope);
  const pipeline = await db.getCrmPipelineById(deal.pipelineId);
  const stages = pipeline ? await getOrSeedPipelineStages(pipeline) : [];
  const wonStage = stages.find((s) => s.isWon)?.name;
  const lostStage = stages.find((s) => s.isLost)?.name;
  const patch = closeDealPatch(input.outcome, { lossReasonId: input.lossReasonId, note: input.note, wonStage, lostStage });
  await db.updateCrmDeal(deal.id, patch);
  if (patch.stage && patch.stage !== deal.stage) {
    await db.createCrmDealStageHistory({ companyId: deal.companyId ?? null, dealId: deal.id, fromStage: deal.stage, toStage: patch.stage, changedAt: new Date(), changedBy: userId });
  }
  if (input.note?.trim()) {
    await db.createCrmInteraction({
      contactId: deal.contactId,
      companyId: deal.companyId ?? null,
      relatedDealId: deal.id,
      channel: "note",
      interactionType: "note_added",
      subject: input.outcome === "won" ? "Deal won" : "Deal lost",
      content: input.note.trim(),
      performedBy: userId,
    });
  }
  return { deal, patch };
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
    const stage = findStageInPipeline(stages, d.pipelineId, d.stage);
    return { ...d, rottingDays: stage?.rottingDays ?? DEFAULT_ROTTING_DAYS, lastActivityAt: lastActivity.get(d.id) ?? null };
  });
}

/** Allow-list for list helpers (`null` = unrestricted). */
export function scopeIds(scope: Scope): number[] | null {
  return crmScopeCompanyIds(scope);
}

// ---------------------------------------------------------------------------
// Accounts: delete / merge
// ---------------------------------------------------------------------------

export async function deleteAccount(id: number, scope: Scope) {
  const account = await loadScopedAccount(id, scope);
  await db.deleteCrmAccount(id);
  return account;
}

/**
 * Merges `duplicateIds` into `primaryId`. Every account must be visible and in
 * the primary's entity (children and linked rows move with them, so a
 * cross-entity merge would re-parent another entity's data); a duplicate that
 * is an ancestor of the primary is refused (it would create a cycle).
 */
export async function mergeAccounts(primaryId: number, duplicateIds: number[], scope: Scope) {
  const primary = await loadScopedAccount(primaryId, scope);
  const dupes = [...new Set(duplicateIds.filter((id) => id !== primaryId))];
  if (dupes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick at least one other account to merge" });
  for (const id of dupes) {
    const dup = await loadScopedAccount(id, scope);
    assertSameCompany(dup.companyId, primary.companyId, `"${dup.name}" belongs to a different entity`);
  }
  let cursor = primary.parentAccountId ?? null;
  const seen = new Set<number>();
  while (cursor != null && !seen.has(cursor)) {
    if (dupes.includes(cursor)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge an account into one of its own children" });
    }
    seen.add(cursor);
    cursor = (await db.getCrmAccountById(cursor))?.parentAccountId ?? null;
  }
  const result = await db.mergeCrmAccounts(primaryId, dupes);
  return { ...result, primary };
}

// ---------------------------------------------------------------------------
// Deal velocity + sales reports
// ---------------------------------------------------------------------------

/** Average days per stage from stage history, over the caller's deals. */
export async function dealVelocity(scope: Scope, pipelineId?: number) {
  const deals = await db.getCrmDeals({ pipelineId, companyIds: crmScopeCompanyIds(scope), limit: 10000 });
  const history = await db.getCrmDealStageHistoryForDeals(deals.map((d) => d.id));
  return computeVelocity(history);
}

/** Pipeline, forecast, win rate, cycle time, sources, losses and stale deals. */
export async function salesReport(scope: Scope, pipelineId?: number) {
  const companyIds = crmScopeCompanyIds(scope);
  const deals = await db.getCrmDeals({ pipelineId, companyIds, limit: 10000 });
  const stages = await db.getCrmPipelineStagesForPipelines([...new Set(deals.map((d) => d.pipelineId))]);
  const reasons = await db.getCrmLossReasons(companyIds, true);
  const report = computeSalesReport(deals, stages, reasons);
  const velocity = computeVelocity(await db.getCrmDealStageHistoryForDeals(deals.map((d) => d.id)));
  return { ...report, velocity };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type CrmTaskType = "call" | "email" | "meeting" | "follow_up" | "todo";

export async function loadScopedTask(id: number, scope: Scope) {
  const row = await db.getCrmTaskById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Task");
  return row;
}

export async function listTasks(
  input: { view?: TaskView; contactId?: number; dealId?: number; accountId?: number; limit?: number },
  scope: Scope,
  userId: number,
  now: Date = new Date(),
) {
  const companyIds = crmScopeCompanyIds(scope);
  // Record-scoped lists (a contact's / deal's tasks) show every assignee.
  if (input.contactId || input.dealId || input.accountId) {
    return db.getCrmTasks({ contactId: input.contactId, dealId: input.dealId, accountId: input.accountId, status: "all", companyIds, limit: input.limit }, now);
  }
  return db.getCrmTasks({ ...taskViewFilters(input.view ?? "mine", userId, now), companyIds, limit: input.limit }, now);
}

export interface TaskInput {
  title: string;
  type?: CrmTaskType;
  contactId?: number | null;
  dealId?: number | null;
  accountId?: number | null;
  dueAt?: Date | null;
  reminderAt?: Date | null;
  assignedTo?: number | null;
  notes?: string | null;
}

/**
 * Resolves a task's effective links (deal, contact, account). Every linked
 * record must be visible and all of them must share one entity; a deal fills
 * in a missing contact / account, a contact a missing account. Returns the
 * entity (undefined when nothing is linked) and the full link set to store.
 */
export async function resolveTaskLinks(
  links: { dealId: number | null; contactId: number | null; accountId: number | null },
  scope: Scope,
): Promise<{ companyId: number | null | undefined; dealId: number | null; contactId: number | null; accountId: number | null }> {
  const companies: Array<number | null> = [];
  let { contactId, accountId } = links;
  if (links.dealId) {
    const deal = await loadScopedDeal(links.dealId, scope);
    companies.push(deal.companyId ?? null);
    contactId = contactId ?? deal.contactId;
    accountId = accountId ?? deal.accountId ?? null;
  }
  if (contactId) {
    const contact = await loadScopedContact(contactId, scope);
    companies.push(contact.companyId ?? null);
    if (accountId == null && contact.accountId) {
      const acct = await db.getCrmAccountById(contact.accountId);
      if (acct && sameCompany(acct.companyId, contact.companyId)) accountId = acct.id;
    }
  }
  if (accountId) {
    const account = await loadScopedAccount(accountId, scope);
    companies.push(account.companyId ?? null);
  }
  if (companies.some((c) => !sameCompany(c, companies[0]))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A task's deal, contact and account must belong to the same entity" });
  }
  return { companyId: companies.length ? companies[0] : undefined, dealId: links.dealId, contactId, accountId };
}

async function assertAssignee(assignedTo: number, companyId: number | null) {
  if (!(await userCanAccessCompany(assignedTo, companyId))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The assignee has no access to this task's entity" });
  }
}

export async function createTask(input: TaskInput, scope: Scope, user: { id: number; companyId: number | null }) {
  const links = await resolveTaskLinks({ dealId: input.dealId ?? null, contactId: input.contactId ?? null, accountId: input.accountId ?? null }, scope);
  const companyId = links.companyId !== undefined ? links.companyId : user.companyId ?? null;
  const assignedTo = input.assignedTo ?? user.id;
  if (assignedTo !== user.id) await assertAssignee(assignedTo, companyId);
  return db.createCrmTask({
    companyId,
    title: input.title.trim(),
    type: input.type ?? "todo",
    contactId: links.contactId,
    dealId: links.dealId,
    accountId: links.accountId,
    dueAt: input.dueAt ?? null,
    reminderAt: input.reminderAt ?? null,
    assignedTo,
    createdBy: user.id,
    notes: input.notes ?? null,
  });
}

/**
 * Updates a task. Links are resolved on the effective (existing + patch) set
 * and written together with the derived entity, so a task never points at a
 * deal and a contact from different entities. The assignee is re-checked
 * whenever it or the entity changes.
 */
export async function updateTask(id: number, patch: Partial<TaskInput>, scope: Scope) {
  const task = await loadScopedTask(id, scope);
  const linksTouched = patch.dealId !== undefined || patch.contactId !== undefined || patch.accountId !== undefined;
  let linkPatch: { companyId?: number | null; dealId?: number | null; contactId?: number | null; accountId?: number | null } = {};
  let companyId = task.companyId ?? null;
  if (linksTouched) {
    const links = await resolveTaskLinks({
      dealId: patch.dealId !== undefined ? patch.dealId : task.dealId ?? null,
      contactId: patch.contactId !== undefined ? patch.contactId : task.contactId ?? null,
      accountId: patch.accountId !== undefined ? patch.accountId : task.accountId ?? null,
    }, scope);
    if (links.companyId !== undefined) companyId = links.companyId;
    linkPatch = { companyId, dealId: links.dealId, contactId: links.contactId, accountId: links.accountId };
  }
  const assignee = patch.assignedTo !== undefined ? patch.assignedTo : task.assignedTo ?? null;
  if (assignee != null && (patch.assignedTo !== undefined || !sameCompany(companyId, task.companyId))) {
    await assertAssignee(assignee, companyId);
  }
  const dueMoved = patch.dueAt !== undefined && String(patch.dueAt ?? "") !== String(task.dueAt ?? "");
  const remindMoved = patch.reminderAt !== undefined && String(patch.reminderAt ?? "") !== String(task.reminderAt ?? "");
  await db.updateCrmTask(id, {
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...linkPatch,
    ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
    ...(patch.reminderAt !== undefined ? { reminderAt: patch.reminderAt } : {}),
    ...(patch.assignedTo !== undefined ? { assignedTo: patch.assignedTo } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    // A rescheduled task gets a fresh reminder.
    ...(dueMoved || remindMoved ? { reminderSentAt: null } : {}),
  });
  return task;
}

/**
 * Completes (or re-opens) a task. Completing one tied to a contact logs a
 * task_completed interaction so it shows on the timeline and counts as
 * activity for stale-deal checks and lead scoring.
 */
export async function completeTask(id: number, completed: boolean, scope: Scope, userId: number, now: Date = new Date()) {
  const task = await loadScopedTask(id, scope);
  await db.updateCrmTask(id, { completedAt: completed ? now : null });
  if (completed && !task.completedAt && task.contactId) {
    await db.createCrmInteraction({
      contactId: task.contactId,
      companyId: task.companyId ?? null,
      relatedDealId: task.dealId ?? undefined,
      channel: "task",
      interactionType: "task_completed",
      subject: task.title,
      content: task.notes ?? undefined,
      performedBy: userId,
    });
    await recomputeLeadScoreSafe(task.contactId);
  }
  return task;
}

export async function deleteTask(id: number, scope: Scope) {
  const task = await loadScopedTask(id, scope);
  await db.deleteCrmTask(id);
  return task;
}

/**
 * Daily job: one digest email per assignee listing their open tasks due by
 * the end of the current UTC day (or whose reminderAt has passed) that have
 * not been reminded yet; each task is marked reminderSentAt so it is sent
 * once. Tasks are marked only when their email went out, so a failed send
 * retries next run. Tasks in an entity the assignee can no longer see (or
 * assigned to a missing / external user) are skipped, never emailed.
 */
export async function sendCrmTaskReminders(now: Date = new Date()) {
  const due = await db.getCrmTasksDueForReminder(endOfUtcDay(now), now);
  const result = { tasks: due.length, sent: 0, failed: 0, skipped: 0 };
  for (const [userId, tasks] of groupTasksByAssignee(due)) {
    const user = await db.getUserById(userId);
    if (!user?.email || EXTERNAL_ROLES.includes(user.role)) { result.skipped += tasks.length; continue; }
    const scope = await scopeForUser(user);
    const allowed = tasks.filter((t) => crmRowVisible(scope, t.companyId));
    result.skipped += tasks.length - allowed.length;
    if (allowed.length === 0) continue;
    const text = renderTaskReminderText(user.name, allowed, now);
    const res = await sendEmail({
      to: user.email,
      subject: `CRM: ${allowed.length} task${allowed.length === 1 ? "" : "s"} due`,
      text,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    }).catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }));
    if (res.success) {
      result.sent++;
      await db.markCrmTasksReminded(allowed.map((t) => t.id), now);
    } else {
      result.failed++;
      logger.warn("Task reminder email failed", { userId, error: res.error });
    }
  }
  return result;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Stale deals
// ---------------------------------------------------------------------------

/**
 * Daily job over every open deal: flags `isStale` when the deal has had no
 * interaction since it was created for its stage's rottingDays (default 21)
 * or its expected close date has passed, clears the flag otherwise, and
 * opens a follow-up task for the deal owner when the deal has no open task
 * (open-task membership is fetched once, in batches). Idempotent.
 */
export async function runStaleDealCheck(now: Date = new Date()) {
  const deals = await db.getCrmDeals({ status: "open", limit: 100000 });
  const annotated = await annotateDealActivity(deals);
  const result = { checked: deals.length, stale: 0, cleared: 0, tasksCreated: 0 };
  const toFlag: number[] = [];
  const toClear: number[] = [];
  const staleDeals: Array<{ deal: (typeof annotated)[number]; reason: NonNullable<ReturnType<typeof dealStaleReason>> }> = [];
  for (const d of annotated) {
    const reason = dealStaleReason(d, d.lastActivityAt, d.rottingDays, now);
    if (reason) {
      result.stale++;
      if (!d.isStale) toFlag.push(d.id);
      staleDeals.push({ deal: d, reason });
    } else if (d.isStale) {
      toClear.push(d.id);
    }
  }
  const withOpenTask = await db.getDealIdsWithOpenCrmTasks(staleDeals.map((x) => x.deal.id));
  for (const { deal: d, reason } of staleDeals) {
    if (withOpenTask.has(d.id)) continue;
    await db.createCrmTask({
      companyId: d.companyId ?? null,
      title: staleFollowUpTitle(d.name, reason).slice(0, 255),
      type: "follow_up",
      contactId: d.contactId,
      dealId: d.id,
      accountId: d.accountId ?? null,
      dueAt: now,
      assignedTo: d.assignedTo ?? null,
      notes: reason === "past_close"
        ? "Expected close date has passed — confirm timing or update the close date."
        : `No activity in ${d.rottingDays}+ days.`,
    });
    result.tasksCreated++;
  }
  await db.setCrmDealsStale(toFlag, true);
  await db.setCrmDealsStale(toClear, false);
  result.cleared = toClear.length;
  return result;
}

// ---------------------------------------------------------------------------
// Lead scoring
// ---------------------------------------------------------------------------

/** Recomputes and persists crm_contacts.leadScore from the scoring rules. */
export async function recomputeLeadScore(contactId: number, now: Date = new Date()) {
  const contact = await db.getCrmContactById(contactId);
  if (!contact) return null;
  const [account, lastInteractionAt, openDeals] = await Promise.all([
    contact.accountId ? db.getCrmAccountById(contact.accountId) : Promise.resolve(undefined),
    db.getCrmContactLastInteractionAt(contactId),
    db.getCrmDeals({ contactId, status: "open", limit: 500 }),
  ]);
  const { score, factors } = computeLeadScore({
    contactType: contact.contactType,
    accountType: account?.type ?? null,
    mealsPerDay: account?.mealsPerDay ?? null,
    lastInteractionAt: lastInteractionAt ?? contact.lastContactedAt ?? null,
    lastRepliedAt: contact.lastRepliedAt ?? null,
    openDealAmount: openDeals.reduce((s, d) => s + (Number(d.amount ?? 0) || 0), 0),
  }, now);
  if (score !== contact.leadScore) await db.updateCrmContact(contactId, { leadScore: score });
  return { score, factors };
}

/** Scoring never blocks the write that triggered it. */
export async function recomputeLeadScoreSafe(contactId: number | null | undefined) {
  if (!contactId) return;
  try {
    await recomputeLeadScore(contactId);
  } catch (e) {
    logger.warn("Lead score recompute failed", { contactId, error: e instanceof Error ? e.message : String(e) });
  }
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export const IMPORT_MAX_ROWS = 5000;

export type ImportRowStatus = "new" | "duplicate" | "invalid";

export interface ImportPreviewRow {
  row: number;
  status: ImportRowStatus;
  contact?: ImportedContact;
  error?: string;
  /** Existing contact matched by email / phone / LinkedIn. */
  matchId?: number;
  matchName?: string;
  /** The match belongs to an entity outside the caller's scope (cannot be updated). */
  matchOutOfScope?: boolean;
}

/**
 * Parses CSV text, guesses (or applies) the column mapping and classifies
 * each row: new, duplicate (matches an existing contact — including another
 * row earlier in the file), or invalid.
 */
export async function importPreview(input: { csv: string; mapping?: ImportMapping; hasHeader?: boolean }, scope: Scope) {
  const rows = parseCsv(input.csv);
  if (rows.length === 0) return { headers: [] as string[], mapping: {} as ImportMapping, rows: [] as ImportPreviewRow[], counts: { new: 0, duplicate: 0, invalid: 0 } };
  const hasHeader = input.hasHeader !== false;
  const headers = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`);
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length > IMPORT_MAX_ROWS) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: `This file has ${body.length.toLocaleString()} rows; the import limit is ${IMPORT_MAX_ROWS.toLocaleString()}. Split it into smaller files.`,
    });
  }
  const mapping = input.mapping ?? guessImportMapping(headers);
  const seen = new Set<string>();
  const out: ImportPreviewRow[] = [];
  for (let i = 0; i < body.length; i++) {
    const rowNum = i + (hasHeader ? 2 : 1);
    const { contact, error } = mapImportRow(body[i], mapping);
    if (!contact) { out.push({ row: rowNum, status: "invalid", error }); continue; }
    const keys = [contact.email && `e:${contact.email}`, contact.phone && `p:${contact.phone}`, contact.linkedinUrl && `l:${contact.linkedinUrl.toLowerCase()}`].filter((k): k is string => !!k);
    if (keys.some((k) => seen.has(k))) {
      out.push({ row: rowNum, status: "duplicate", contact, error: "Duplicate of an earlier row in this file" });
      continue;
    }
    keys.forEach((k) => seen.add(k));
    const match = await db.findCrmContactMatch({ email: contact.email, phone: contact.phone, linkedinUrl: contact.linkedinUrl });
    if (match) {
      const inScope = crmRowVisible(scope, match.companyId);
      out.push({ row: rowNum, status: "duplicate", contact, matchId: match.id, matchName: inScope ? match.fullName : undefined, matchOutOfScope: !inScope });
    } else {
      out.push({ row: rowNum, status: "new", contact });
    }
  }
  const counts = { new: 0, duplicate: 0, invalid: 0 };
  for (const r of out) counts[r.status]++;
  return { headers, mapping, rows: out, counts };
}

/**
 * Imports the previewed rows: inserts new contacts, optionally fills blanks
 * on in-scope duplicates (never overwrites existing values), and links each
 * contact to an account created from its organization (reused by name).
 */
export async function importCommit(
  input: { csv: string; mapping: ImportMapping; hasHeader?: boolean; updateDuplicates?: boolean; createAccounts?: boolean; contactType?: ImportedContact["contactType"] },
  scope: Scope,
  user: { id: number; companyId: number | null; email?: string | null },
) {
  const preview = await importPreview(input, scope);
  const companyId = user.companyId ?? null;
  const ownEmail = user.email?.trim().toLowerCase();
  const accountCache = new Map<string, number>();
  const touched: number[] = [];
  const result = { created: 0, updated: 0, skipped: 0, invalid: preview.counts.invalid, accountsCreated: 0, errors: [] as Array<{ row: number; error: string }> };

  const accountFor = async (org: string | undefined): Promise<number | null> => {
    if (!input.createAccounts || !org?.trim()) return null;
    const key = org.trim().toLowerCase();
    const cached = accountCache.get(key);
    if (cached) return cached;
    const existing = await db.findCrmAccountByName(org, companyId);
    const id = existing?.id ?? await db.createCrmAccount({ companyId, name: org.trim().slice(0, 255), type: "other" });
    if (!existing) result.accountsCreated++;
    accountCache.set(key, id);
    return id;
  };

  for (const r of preview.rows) {
    if (r.status === "invalid" || !r.contact) continue;
    const c = r.contact;
    if (ownEmail && c.email === ownEmail) { result.skipped++; continue; }
    try {
      if (r.status === "duplicate") {
        if (!input.updateDuplicates || !r.matchId || r.matchOutOfScope) { result.skipped++; continue; }
        const existing = await db.getCrmContactById(r.matchId);
        if (!existing) { result.skipped++; continue; }
        // Accounts are created in the importer's entity; only link one to a
        // duplicate from that same entity.
        const accountId = existing.accountId ?? (sameCompany(existing.companyId, companyId) ? await accountFor(c.organization) : null);
        const patch: Record<string, unknown> = {};
        const fill = (k: keyof typeof existing, v: unknown) => {
          if (v != null && v !== "" && (existing[k] == null || existing[k] === "")) patch[k as string] = v;
        };
        fill("lastName", c.lastName); fill("phone", c.phone); fill("organization", c.organization);
        fill("jobTitle", c.jobTitle); fill("city", c.city); fill("state", c.state); fill("country", c.country);
        fill("linkedinUrl", c.linkedinUrl); fill("notes", c.notes); fill("accountId", accountId);
        if (Object.keys(patch).length) {
          await db.updateCrmContact(existing.id, patch);
          touched.push(existing.id);
          result.updated++;
        } else {
          result.skipped++;
        }
        continue;
      }
      const accountId = await accountFor(c.organization);
      const newId = await db.createCrmContact({
        ...c,
        contactType: c.contactType ?? input.contactType ?? "lead",
        source: "import",
        companyId,
        accountId,
        capturedBy: user.id,
      });
      touched.push(newId);
      result.created++;
    } catch (e) {
      // A UNIQUE collision (e.g. phone formatted differently) lands here.
      result.errors.push({ row: r.row, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
  }
  // Imported / enriched contacts get a real score, not the column default.
  for (const id of touched) await recomputeLeadScoreSafe(id);
  return result;
}
