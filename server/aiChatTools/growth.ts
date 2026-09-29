/**
 * Growth-side chat tools: grants, fundraising, recruiting, SOPs and legal.
 *
 * Role gates mirror each module's router:
 *  - manage_grants      reads/writes: any internal role (grantBid is protectedProcedure)
 *  - manage_fundraising reads/writes: any internal role (crm.* fundraising is protectedProcedure);
 *                       investor-role users are external and refused everywhere
 *  - manage_recruiting  reads/writes: any internal role (recruiting is protectedProcedure)
 *  - manage_sops        reads/writes: any internal role (documents is protectedProcedure)
 *  - manage_legal       everything: legal / admin / exec (legalProcedure)
 *
 * Every write is a draft-level row (grant application in "draft", investor
 * update in "draft", SOP stored as a draft document). Nothing sends.
 */
import * as db from "../db";
import type { Contract, Document, GrantBidApplication, Investor, RecruitingCandidate } from "../../drizzle/schema";
import {
  type ChatToolModule,
  type ChatToolParams,
  type AIAgentContext,
  type Tool,
  LEGAL_ROLES,
  ChatToolError,
  defineTool,
  requireInternal,
  requireRole,
  companyIdOf,
  inCompany,
  filterByCompany,
  notFound,
  requireNumber,
  requireString,
  requireDate,
  optionalNumber,
  optionalString,
  optionalDate,
  toNumber,
  countBy,
  includesText,
  daysFromNow,
  makeNumber,
  unknownAction,
} from "./types";

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export const GRANT_ACTIONS = ["list_grants", "grant_deadlines", "create_grant_application_draft"] as const;
const GRANT_TYPES = ["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"] as const;
const CLOSED_GRANT_STATUSES = new Set(["submitted", "under_review", "awarded", "rejected", "withdrawn"]);

export const grantsTool = defineTool(
  "manage_grants",
  "Grants & bids module: list grant/bid applications, show upcoming submission deadlines, or start a draft application (draft only; narrative generation and submission stay in the Grants page).",
  GRANT_ACTIONS,
  {
    status: { type: "string", description: "Application status filter (list_grants)" },
    type: { type: "string", enum: [...GRANT_TYPES], description: "Application type (list_grants filter, create_grant_application_draft)" },
    withinDays: { type: "number", description: "Deadline window in days, default 30 (grant_deadlines)" },
    title: { type: "string", description: "Application title (create_grant_application_draft)" },
    grantingOrganization: { type: "string", description: "Funder / agency (create_grant_application_draft)" },
    programName: { type: "string", description: "Program name (create_grant_application_draft)" },
    requestedAmount: { type: "number", description: "Amount requested (create_grant_application_draft)" },
    submissionDeadline: { type: "string", description: "ISO deadline (create_grant_application_draft)" },
    submissionUrl: { type: "string", description: "Portal / form URL (create_grant_application_draft)" },
  },
);

function compactGrant(g: GrantBidApplication) {
  return {
    id: g.id,
    applicationNumber: g.applicationNumber,
    title: g.title,
    type: g.type,
    status: g.status,
    grantingOrganization: g.grantingOrganization,
    programName: g.programName,
    requestedAmount: toNumber(g.requestedAmount),
    submissionDeadline: g.submissionDeadline,
    submittedAt: g.submittedAt,
  };
}

async function listGrants(params: ChatToolParams, ctx: AIAgentContext) {
  const rows = filterByCompany(ctx, await db.getGrantBidApplications({ status: optionalString(params.status), type: optionalString(params.type) }));
  return {
    applications: rows.slice(0, 50).map(compactGrant),
    total: rows.length,
    byStatus: countBy(rows, (g) => g.status),
    totalRequested: rows.reduce((s, g) => s + toNumber(g.requestedAmount), 0),
  };
}

async function grantDeadlines(params: ChatToolParams, ctx: AIAgentContext) {
  const withinDays = optionalNumber(params.withinDays) ?? 30;
  const now = new Date();
  const cutoff = daysFromNow(withinDays, now);
  const rows = filterByCompany(ctx, await db.getGrantBidApplications())
    .filter((g) => g.submissionDeadline && !CLOSED_GRANT_STATUSES.has(g.status))
    .map((g) => ({ ...compactGrant(g), daysLeft: Math.ceil((new Date(g.submissionDeadline as Date).getTime() - now.getTime()) / 86_400_000) }))
    .filter((g) => new Date(g.submissionDeadline as Date).getTime() <= cutoff.getTime())
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return { withinDays, upcoming: rows.filter((g) => g.daysLeft >= 0), overdue: rows.filter((g) => g.daysLeft < 0) };
}

async function createGrantDraft(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "create grant application draft");
  const title = requireString(params.title, "title");
  const type = (optionalString(params.type) ?? "grant") as (typeof GRANT_TYPES)[number];
  if (!GRANT_TYPES.includes(type)) throw new ChatToolError(`Unknown application type: ${type}`);
  const requestedAmount = optionalNumber(params.requestedAmount);
  const companyId = companyIdOf(ctx);
  const applicationNumber = makeNumber("GBA");
  // Same insert + submission log as grantBid.applications.create.
  const result = await db.createGrantBidApplication({
    companyId,
    applicationNumber,
    title,
    type,
    grantingOrganization: optionalString(params.grantingOrganization),
    programName: optionalString(params.programName),
    requestedAmount: requestedAmount != null ? requestedAmount.toFixed(2) : undefined,
    submissionDeadline: optionalDate(params.submissionDeadline, "submissionDeadline"),
    submissionUrl: optionalString(params.submissionUrl),
    status: "draft",
    createdBy: ctx.userId,
  });
  await db.createGrantBidSubmissionLog({ applicationId: result.id, action: "created", details: `Application "${title}" created from the AI Assistant`, performedBy: ctx.userId });
  await db.createAuditLog({ companyId, userId: ctx.userId, action: "create", entityType: "grant_bid_application", entityId: result.id, entityName: title, newValues: { via: "ai_chat" } });
  return { created: true, applicationId: result.id, applicationNumber, title, type, status: "draft" };
}

export async function executeGrants(params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  requireInternal(ctx, "use grants tools");
  switch (params.action) {
    case "list_grants": return listGrants(params, ctx);
    case "grant_deadlines": return grantDeadlines(params, ctx);
    case "create_grant_application_draft": return createGrantDraft(params, ctx);
    default: return unknownAction("manage_grants", params.action);
  }
}

// ---------------------------------------------------------------------------
// Fundraising
// ---------------------------------------------------------------------------

export const FUNDRAISING_ACTIONS = ["pipeline_summary", "list_investors", "log_investor_interaction", "create_investor_update_draft"] as const;
const INVESTOR_STATUSES = ["lead", "contacted", "interested", "committed", "invested", "passed"] as const;
const UPDATE_TYPES = ["quarterly", "monthly", "annual", "ad_hoc"] as const;

export const fundraisingTool = defineTool(
  "manage_fundraising",
  "Fundraising module: pipeline summary (investors by status, active rounds, committed vs raised), list investors, log a call/meeting/email with an investor (note + optional status/follow-up), or draft an investor update (draft only, never sent).",
  FUNDRAISING_ACTIONS,
  {
    status: { type: "string", enum: [...INVESTOR_STATUSES], description: "Investor status filter (list_investors)" },
    query: { type: "string", description: "Name / firm / email search (list_investors)" },
    investorId: { type: "number", description: "Investor ID (log_investor_interaction)" },
    investorName: { type: "string", description: "Investor name when the ID is unknown (log_investor_interaction)" },
    summary: { type: "string", description: "What happened in the interaction (log_investor_interaction)" },
    newStatus: { type: "string", enum: [...INVESTOR_STATUSES], description: "Move the investor to this status (log_investor_interaction)" },
    followUpDate: { type: "string", description: "ISO date for the next follow-up (log_investor_interaction)" },
    title: { type: "string", description: "Update title (create_investor_update_draft)" },
    period: { type: "string", description: "Period label, e.g. Q3 2026 (create_investor_update_draft)" },
    type: { type: "string", enum: [...UPDATE_TYPES], description: "Update cadence (create_investor_update_draft)" },
    content: { type: "string", description: "Body (create_investor_update_draft)" },
    highlights: { type: "string", description: "Highlights (create_investor_update_draft)" },
    asks: { type: "string", description: "Asks for investors (create_investor_update_draft)" },
  },
);

function compactInvestor(i: Investor) {
  return { id: i.id, name: i.name, company: i.company, type: i.type, status: i.status, priority: i.priority, email: i.email, followUpDate: i.followUpDate, investedAt: i.investedAt };
}

async function pipelineSummary(ctx: AIAgentContext) {
  const companyId = companyIdOf(ctx);
  const [investors, rounds, investments] = await Promise.all([
    db.getInvestors(companyId),
    db.getFundraisingCampaigns(companyId),
    db.getInvestorInvestments(),
  ]);
  const investorIds = new Set(investors.map((i) => i.id));
  const committed = investments.filter((inv) => investorIds.has(inv.investorId)).reduce((s, inv) => s + toNumber(inv.amount), 0);
  const now = Date.now();
  return {
    investors: { total: investors.length, byStatus: countBy(investors, (i) => i.status), byType: countBy(investors, (i) => i.type) },
    followUpsDue: investors.filter((i) => i.followUpDate && new Date(i.followUpDate).getTime() <= now && i.status !== "invested" && i.status !== "passed").map(compactInvestor).slice(0, 20),
    rounds: rounds.map((r) => ({ id: r.id, name: r.name, roundType: r.roundType, status: r.status, targetAmount: toNumber(r.targetAmount), raisedAmount: toNumber(r.raisedAmount), targetCloseDate: r.targetCloseDate })),
    committedFromInvestments: committed,
  };
}

async function listInvestors(params: ChatToolParams, ctx: AIAgentContext) {
  const status = optionalString(params.status);
  const query = optionalString(params.query);
  let rows = await db.getInvestors(companyIdOf(ctx));
  if (status) rows = rows.filter((i) => i.status === status);
  if (query) rows = rows.filter((i) => includesText([i.name, i.company, i.email], query));
  return { investors: rows.slice(0, 50).map(compactInvestor), total: rows.length };
}

async function resolveInvestor(params: ChatToolParams, ctx: AIAgentContext): Promise<Investor> {
  const investorId = optionalNumber(params.investorId);
  if (investorId != null) {
    const i = await db.getInvestorById(investorId);
    if (!i || !inCompany(ctx, i.companyId)) return notFound("Investor");
    return i;
  }
  const name = optionalString(params.investorName);
  if (!name) throw new ChatToolError("investorId or investorName is required");
  const rows = (await db.getInvestors(companyIdOf(ctx))).filter((i) => includesText([i.name, i.company, i.email], name));
  if (rows.length === 0) return notFound(`Investor "${name}"`);
  if (rows.length > 1) throw new ChatToolError(`Several investors match "${name}": ${rows.slice(0, 5).map((i) => `${i.name} (#${i.id})`).join(", ")}. Pass investorId.`);
  return rows[0];
}

async function logInvestorInteraction(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "log investor interaction");
  const summary = requireString(params.summary, "summary");
  const investor = await resolveInvestor(params, ctx);
  const newStatus = optionalString(params.newStatus) as (typeof INVESTOR_STATUSES)[number] | undefined;
  if (newStatus && !INVESTOR_STATUSES.includes(newStatus)) throw new ChatToolError(`Unknown investor status: ${newStatus}`);
  const followUpDate = optionalDate(params.followUpDate, "followUpDate");
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] ${ctx.userName}: ${summary}`;
  const notes = investor.notes ? `${investor.notes}\n${line}` : line;
  await db.updateInvestor(investor.id, {
    notes,
    ...(newStatus ? { status: newStatus } : {}),
    ...(followUpDate ? { followUpDate } : {}),
  });
  await db.createAuditLog({
    companyId: investor.companyId ?? companyIdOf(ctx),
    userId: ctx.userId,
    action: "update",
    entityType: "investor",
    entityId: investor.id,
    entityName: investor.name,
    oldValues: { status: investor.status },
    newValues: { interaction: summary, status: newStatus ?? investor.status, followUpDate: followUpDate ?? investor.followUpDate, via: "ai_chat" },
  });
  return { logged: true, investorId: investor.id, investorName: investor.name, status: newStatus ?? investor.status, followUpDate: followUpDate ?? investor.followUpDate ?? null };
}

async function createInvestorUpdateDraft(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "create investor update draft");
  const title = requireString(params.title, "title");
  const type = optionalString(params.type) as (typeof UPDATE_TYPES)[number] | undefined;
  if (type && !UPDATE_TYPES.includes(type)) throw new ChatToolError(`Unknown update type: ${type}`);
  const companyId = companyIdOf(ctx);
  // Same helper + companyId defaulting as investorUpdates.create; status stays draft.
  const result = await db.createInvestorUpdate({
    companyId,
    title,
    period: optionalString(params.period),
    type,
    content: optionalString(params.content),
    highlights: optionalString(params.highlights),
    asks: optionalString(params.asks),
    status: "draft",
    createdBy: ctx.userId,
  });
  await db.createAuditLog({ companyId, userId: ctx.userId, action: "create", entityType: "investorUpdate", entityId: result.id, entityName: title, newValues: { status: "draft", via: "ai_chat" } });
  return { created: true, updateId: result.id, title, status: "draft", message: "Draft saved under Investors > Updates. It is not sent until someone sends it from there." };
}

export async function executeFundraising(params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  requireInternal(ctx, "use fundraising tools");
  switch (params.action) {
    case "pipeline_summary": return pipelineSummary(ctx);
    case "list_investors": return listInvestors(params, ctx);
    case "log_investor_interaction": return logInvestorInteraction(params, ctx);
    case "create_investor_update_draft": return createInvestorUpdateDraft(params, ctx);
    default: return unknownAction("manage_fundraising", params.action);
  }
}

// ---------------------------------------------------------------------------
// Recruiting
// ---------------------------------------------------------------------------

export const RECRUITING_ACTIONS = ["list_candidates", "candidate_summary", "move_candidate_stage", "schedule_interview"] as const;
const CANDIDATE_STAGES = ["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"] as const;
type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const recruitingTool = defineTool(
  "manage_recruiting",
  "Recruiting module: list candidates (by stage/position), summarise one candidate, move a candidate to another pipeline stage, or record an interview date for a candidate (moves them to the interview stage; no calendar invite is sent).",
  RECRUITING_ACTIONS,
  {
    candidateId: { type: "number", description: "Candidate ID (candidate_summary, move_candidate_stage, schedule_interview)" },
    candidateName: { type: "string", description: "Candidate name when the ID is unknown" },
    stage: { type: "string", enum: [...CANDIDATE_STAGES], description: "Stage filter (list_candidates) / target stage (move_candidate_stage)" },
    position: { type: "string", description: "Position filter (list_candidates)" },
    interviewDate: { type: "string", description: "ISO datetime of the interview (schedule_interview)" },
    note: { type: "string", description: "Note to append to the candidate record (move_candidate_stage, schedule_interview)" },
  },
);

function compactCandidate(c: RecruitingCandidate) {
  return { id: c.id, name: c.name, email: c.email, position: c.position, stage: c.stage, score: c.score, source: c.source, appliedAt: c.appliedAt, interviewDate: c.interviewDate };
}

async function visibleCandidates(ctx: AIAgentContext) {
  return filterByCompany(ctx, await db.listRecruitingCandidates());
}

async function resolveCandidate(params: ChatToolParams, ctx: AIAgentContext): Promise<RecruitingCandidate> {
  const rows = await visibleCandidates(ctx);
  const candidateId = optionalNumber(params.candidateId);
  if (candidateId != null) {
    const c = rows.find((r) => r.id === candidateId);
    return c ?? notFound("Candidate");
  }
  const name = optionalString(params.candidateName);
  if (!name) throw new ChatToolError("candidateId or candidateName is required");
  const matches = rows.filter((c) => includesText([c.name, c.email], name));
  if (matches.length === 0) return notFound(`Candidate "${name}"`);
  if (matches.length > 1) throw new ChatToolError(`Several candidates match "${name}": ${matches.slice(0, 5).map((c) => `${c.name} (#${c.id})`).join(", ")}. Pass candidateId.`);
  return matches[0];
}

async function listCandidates(params: ChatToolParams, ctx: AIAgentContext) {
  const stage = optionalString(params.stage);
  const position = optionalString(params.position);
  let rows = await visibleCandidates(ctx);
  if (stage) rows = rows.filter((c) => c.stage === stage);
  if (position) rows = rows.filter((c) => includesText([c.position], position));
  return { candidates: rows.slice(0, 50).map(compactCandidate), total: rows.length, byStage: countBy(rows, (c) => c.stage) };
}

async function candidateSummary(params: ChatToolParams, ctx: AIAgentContext) {
  const c = await resolveCandidate(params, ctx);
  return { candidate: compactCandidate(c), notes: c.notes, resumeExcerpt: c.resume ? c.resume.slice(0, 1500) : null };
}

function appendNote(existing: string | null, note: string | undefined, ctx: AIAgentContext): string | undefined {
  if (!note) return undefined;
  const line = `[${new Date().toISOString().slice(0, 10)}] ${ctx.userName}: ${note}`;
  return existing ? `${existing}\n${line}` : line;
}

async function moveCandidateStage(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "move candidate stage");
  const stage = requireString(params.stage, "stage") as CandidateStage;
  if (!CANDIDATE_STAGES.includes(stage)) throw new ChatToolError(`Unknown stage: ${stage}`);
  const c = await resolveCandidate(params, ctx);
  const notes = appendNote(c.notes, optionalString(params.note), ctx);
  await db.updateRecruitingCandidate(c.id, { stage, ...(notes ? { notes } : {}) });
  await db.createAuditLog({ companyId: c.companyId ?? companyIdOf(ctx), userId: ctx.userId, action: "update", entityType: "recruiting_candidate", entityId: c.id, entityName: c.name, oldValues: { stage: c.stage }, newValues: { stage, via: "ai_chat" } });
  return { moved: true, candidateId: c.id, name: c.name, fromStage: c.stage, toStage: stage };
}

async function scheduleInterview(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "schedule interview");
  const interviewDate = requireDate(params.interviewDate, "interviewDate");
  const c = await resolveCandidate(params, ctx);
  if (c.stage === "hired" || c.stage === "rejected") throw new ChatToolError(`Candidate is ${c.stage}; reopen them before scheduling an interview`);
  const notes = appendNote(c.notes, optionalString(params.note), ctx);
  await db.updateRecruitingCandidate(c.id, { interviewDate, stage: "interview", ...(notes ? { notes } : {}) });
  await db.createAuditLog({ companyId: c.companyId ?? companyIdOf(ctx), userId: ctx.userId, action: "update", entityType: "recruiting_candidate", entityId: c.id, entityName: c.name, newValues: { interviewDate, stage: "interview", via: "ai_chat" } });
  return { scheduled: true, candidateId: c.id, name: c.name, interviewDate, stage: "interview", message: "Interview date recorded on the candidate; no calendar invite or email was sent." };
}

export async function executeRecruiting(params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  requireInternal(ctx, "use recruiting tools");
  switch (params.action) {
    case "list_candidates": return listCandidates(params, ctx);
    case "candidate_summary": return candidateSummary(params, ctx);
    case "move_candidate_stage": return moveCandidateStage(params, ctx);
    case "schedule_interview": return scheduleInterview(params, ctx);
    default: return unknownAction("manage_recruiting", params.action);
  }
}

// ---------------------------------------------------------------------------
// SOPs — stored as `documents` rows with category "sop". The /sops page ships
// a static playbook in the client bundle; drafts created here live alongside
// uploaded SOP documents in the documents store.
// ---------------------------------------------------------------------------

export const SOP_ACTIONS = ["search_sops", "get_sop", "create_sop_draft"] as const;
export const SOP_CATEGORY = "sop";

export const sopsTool = defineTool(
  "manage_sops",
  "SOP module: search standard operating procedures stored in the documents library (category 'sop'), read one, or save a new SOP draft (markdown) for review.",
  SOP_ACTIONS,
  {
    query: { type: "string", description: "Search text (search_sops)" },
    sopId: { type: "number", description: "SOP document ID (get_sop)" },
    title: { type: "string", description: "SOP title (create_sop_draft)" },
    content: { type: "string", description: "SOP body in markdown (create_sop_draft)" },
    tags: { type: "array", items: { type: "string" }, description: "Tags (create_sop_draft)" },
  },
);

function isSop(d: Document): boolean {
  if ((d.category ?? "").toLowerCase() === SOP_CATEGORY) return true;
  return Array.isArray(d.tags) && (d.tags as unknown[]).some((t) => typeof t === "string" && t.toLowerCase() === SOP_CATEGORY);
}

function compactSop(d: Document) {
  return { id: d.id, title: d.name, description: d.description ? d.description.slice(0, 300) : null, tags: d.tags, mimeType: d.mimeType, fileUrl: d.fileUrl, updatedAt: d.updatedAt };
}

async function sopDocuments(ctx: AIAgentContext) {
  return (await db.getDocuments({ companyId: companyIdOf(ctx) })).filter(isSop);
}

async function searchSops(params: ChatToolParams, ctx: AIAgentContext) {
  const query = optionalString(params.query);
  let rows = await sopDocuments(ctx);
  if (query) rows = rows.filter((d) => includesText([d.name, d.description, Array.isArray(d.tags) ? (d.tags as unknown[]).join(" ") : null], query));
  return { sops: rows.slice(0, 25).map(compactSop), total: rows.length, query: query ?? null };
}

async function getSop(params: ChatToolParams, ctx: AIAgentContext) {
  const sopId = requireNumber(params.sopId, "sopId");
  const doc = (await sopDocuments(ctx)).find((d) => d.id === sopId);
  if (!doc) return notFound("SOP");
  const inline = doc.fileUrl.startsWith("data:text/markdown");
  return {
    ...compactSop(doc),
    content: inline ? decodeURIComponent(doc.fileUrl.slice(doc.fileUrl.indexOf(",") + 1)) : doc.description,
    storedInline: inline,
  };
}

async function createSopDraft(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "create SOP draft");
  const title = requireString(params.title, "title");
  const content = requireString(params.content, "content");
  const tags = Array.isArray(params.tags) ? params.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : [];
  const companyId = companyIdOf(ctx);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sop";
  const fileKey = `sop-drafts/${Date.now()}-${slug}.md`;
  const result = await db.createDocument({
    companyId,
    name: title,
    type: "other",
    category: SOP_CATEGORY,
    fileUrl: `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`,
    fileKey,
    fileSize: Buffer.byteLength(content, "utf8"),
    mimeType: "text/markdown",
    description: content.slice(0, 2000),
    tags: Array.from(new Set([SOP_CATEGORY, "draft", ...tags])),
    uploadedBy: ctx.userId,
  });
  await db.createAuditLog({ companyId, userId: ctx.userId, action: "create", entityType: "document", entityId: result.id, entityName: title, newValues: { category: SOP_CATEGORY, status: "draft", via: "ai_chat" } });
  return { created: true, sopId: result.id, title, status: "draft", message: "SOP draft saved to the documents library (category: sop, tag: draft)." };
}

export async function executeSops(params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  requireInternal(ctx, "use SOP tools");
  switch (params.action) {
    case "search_sops": return searchSops(params, ctx);
    case "get_sop": return getSop(params, ctx);
    case "create_sop_draft": return createSopDraft(params, ctx);
    default: return unknownAction("manage_sops", params.action);
  }
}

// ---------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------

export const LEGAL_ACTIONS = ["list_contracts", "contract_expiries", "contract_summary"] as const;
const CONTRACT_TYPES = ["customer", "vendor", "employment", "nda", "partnership", "lease", "service", "other"] as const;

export const legalTool = defineTool(
  "manage_legal",
  "Legal module (legal, admin and exec roles only): list contracts, show contracts expiring or renewing soon, or summarise one contract with its key dates. Read-only; the AI clause analysis lives in Legal > AI Review.",
  LEGAL_ACTIONS,
  {
    status: { type: "string", description: "Contract status filter (list_contracts)" },
    type: { type: "string", enum: [...CONTRACT_TYPES], description: "Contract type filter (list_contracts)" },
    withinDays: { type: "number", description: "Expiry window in days, default 90 (contract_expiries)" },
    contractId: { type: "number", description: "Contract ID (contract_summary)" },
    query: { type: "string", description: "Title / party search (list_contracts, contract_summary)" },
  },
);

function compactContract(c: Contract) {
  return { id: c.id, contractNumber: c.contractNumber, title: c.title, type: c.type, status: c.status, partyName: c.partyName, partyType: c.partyType, value: toNumber(c.value), currency: c.currency, startDate: c.startDate, endDate: c.endDate, renewalDate: c.renewalDate, autoRenewal: c.autoRenewal };
}

async function listContracts(params: ChatToolParams, ctx: AIAgentContext) {
  const query = optionalString(params.query);
  let rows = await db.getContracts({ companyId: companyIdOf(ctx), status: optionalString(params.status), type: optionalString(params.type) });
  if (query) rows = rows.filter((c) => includesText([c.title, c.partyName, c.contractNumber], query));
  return { contracts: rows.slice(0, 50).map(compactContract), total: rows.length, byStatus: countBy(rows, (c) => c.status), totalValue: rows.reduce((s, c) => s + toNumber(c.value), 0) };
}

async function contractExpiries(params: ChatToolParams, ctx: AIAgentContext) {
  const withinDays = optionalNumber(params.withinDays) ?? 90;
  const now = new Date();
  const cutoff = daysFromNow(withinDays, now).getTime();
  const rows = (await db.getContracts({ companyId: companyIdOf(ctx) }))
    .filter((c) => c.status === "active" || c.status === "pending_signature" || c.status === "renewed")
    .map((c) => {
      const next = [c.renewalDate, c.endDate].filter((d): d is Date => d != null).map((d) => new Date(d).getTime()).sort((a, b) => a - b)[0];
      return { ...compactContract(c), nextDate: next != null ? new Date(next) : null, daysLeft: next != null ? Math.ceil((next - now.getTime()) / 86_400_000) : null };
    })
    .filter((c) => c.nextDate != null && c.nextDate.getTime() <= cutoff)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  return { withinDays, expiring: rows, autoRenewing: rows.filter((c) => c.autoRenewal).length };
}

async function contractSummary(params: ChatToolParams, ctx: AIAgentContext) {
  let contractId = optionalNumber(params.contractId);
  if (contractId == null) {
    const query = optionalString(params.query);
    if (!query) throw new ChatToolError("contractId or query is required");
    const matches = (await db.getContracts({ companyId: companyIdOf(ctx) })).filter((c) => includesText([c.title, c.partyName, c.contractNumber], query));
    if (matches.length === 0) return notFound(`Contract "${query}"`);
    if (matches.length > 1) throw new ChatToolError(`Several contracts match "${query}": ${matches.slice(0, 5).map((c) => `${c.title} (#${c.id})`).join(", ")}. Pass contractId.`);
    contractId = matches[0].id;
  }
  const contract = await db.getContractWithKeyDates(contractId);
  if (!contract || !inCompany(ctx, contract.companyId)) return notFound("Contract");
  const now = Date.now();
  return {
    contract: compactContract(contract),
    description: contract.description,
    termsExcerpt: contract.terms ? contract.terms.slice(0, 1500) : null,
    keyDates: contract.keyDates.map((k) => ({ id: k.id, dateType: k.dateType, date: k.date, description: k.description, upcoming: new Date(k.date).getTime() >= now })),
    hasSignedDocument: !!contract.signedDocumentUrl,
  };
}

export async function executeLegal(params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  requireRole(ctx, LEGAL_ROLES, "use legal tools");
  switch (params.action) {
    case "list_contracts": return listContracts(params, ctx);
    case "contract_expiries": return contractExpiries(params, ctx);
    case "contract_summary": return contractSummary(params, ctx);
    default: return unknownAction("manage_legal", params.action);
  }
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const growthTools: Tool[] = [grantsTool, fundraisingTool, recruitingTool, sopsTool, legalTool];

export async function executeGrowth(name: string, params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  switch (name) {
    case "manage_grants": return executeGrants(params, ctx);
    case "manage_fundraising": return executeFundraising(params, ctx);
    case "manage_recruiting": return executeRecruiting(params, ctx);
    case "manage_sops": return executeSops(params, ctx);
    case "manage_legal": return executeLegal(params, ctx);
    default: throw new ChatToolError(`Unknown tool: ${name}`);
  }
}

export const growthModule: ChatToolModule = {
  name: "growth",
  tools: growthTools,
  execute: executeGrowth,
};
