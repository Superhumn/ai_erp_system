/**
 * CRM / Marketing process flow: contact → interactions → deal (approval →
 * pipeline stats) → email sequence + campaign → social publishing + brand
 * ambassadors, plus the role-gating regressions.
 *
 * Runs the real tRPC routers against a stateful in-memory replacement for
 * server/db.ts. Two routers on this path (emailSequences, brandAmbassadors)
 * bypass the db helpers and query Drizzle directly through db.getDb(), so the
 * mock also provides a tiny Drizzle look-alike (select/insert/update/delete
 * over the same in-memory tables) and swaps drizzle-orm's eq/and/desc for
 * plain predicates it can evaluate.
 *
 * Email sending (campaign send, sequence runner tick) goes through the real
 * server/campaignSender.ts + server/sequenceRunner.ts with only the mailer
 * (_core/email.sendEmail) mocked.
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import type { Table } from "./_harness";
import { ctxFor, money } from "./_harness";

type Row = { id: number; [k: string]: any };

interface State {
  contacts: Table<Row>;
  interactions: Table<Row>;
  pipelines: Table<Row>;
  deals: Table<Row>;
  stages: Table<Row>;
  stageHistory: Table<Row>;
  dealContacts: Table<Row>;
  tasks: Table<Row>;
  taskLogs: Table<Row>;
  campaigns: Table<Row>;
  recipients: Table<Row>;
  videos: Table<Row>;
  posts: Table<Row>;
  credentials: Table<Row>;
  // Raw-drizzle tables, keyed by SQL table name.
  raw: Record<string, Table<Row>>;
  auditLogs: Row[];
}

// drizzle-orm's condition builders become plain row predicates so the fake
// query engine below can evaluate them. Column objects keep their `.name`.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  type Pred = ((row: Row) => boolean) & { col?: string; val?: unknown };
  const eq = (col: { name: string }, val: unknown): Pred =>
    Object.assign((row: Row) => row[col.name] === val, { col: col.name, val });
  const and = (...conds: Array<Pred | undefined>) => {
    const cs = conds.filter((c): c is Pred => typeof c === "function");
    if (cs.length === 0) return undefined;
    return (row: Row) => cs.every((c) => c(row));
  };
  const desc = (col: { name: string }) => ({ col: col.name, dir: "desc" as const });
  return { ...actual, eq, and, desc };
});

vi.mock("../db", async () => {
  const { table } = await import("./_harness");
  const { getTableName } = await import("drizzle-orm");
  const state: State = {
    contacts: table<Row>(),
    interactions: table<Row>(),
    pipelines: table<Row>(),
    deals: table<Row>(),
    stages: table<Row>(),
    stageHistory: table<Row>(),
    dealContacts: table<Row>(),
    tasks: table<Row>(),
    taskLogs: table<Row>(),
    campaigns: table<Row>(),
    recipients: table<Row>(),
    videos: table<Row>(),
    posts: table<Row>(),
    credentials: table<Row>(),
    raw: {
      email_sequences: table<Row>(),
      email_sequence_steps: table<Row>(),
      brand_ambassadors: table<Row>(),
      brand_ambassador_activities: table<Row>(),
      email_sequence_enrollments: table<Row>(),
    },
    auditLogs: [],
  };
  const RAW_DEFAULTS: Record<string, Row> = {
    email_sequences: { id: 0, status: "draft", totalContacts: 0 },
    email_sequence_steps: { id: 0, delayDays: 1 },
    brand_ambassadors: { id: 0, stage: "prospect", priority: "medium", currency: "USD" },
    brand_ambassador_activities: { id: 0 },
    email_sequence_enrollments: { id: 0, status: "active", currentStepOrder: 0, attempts: 0 },
  };

  // Strictly increasing clock so createdAt/updatedAt ordering is deterministic
  // even when several rows are written within the same millisecond.
  let clock = Date.parse("2026-09-28T09:00:00.000Z");
  const tick = () => new Date((clock += 1000));
  const cmp = (a: unknown, b: unknown) => {
    const x = a instanceof Date ? a.getTime() : (a as number);
    const y = b instanceof Date ? b.getTime() : (b as number);
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const desc = (key: string) => (a: Row, b: Row) => cmp(b[key], a[key]) || b.id - a.id;
  const page = <T>(rows: T[], limit?: number, offset?: number) => rows.slice(offset || 0, (offset || 0) + (limit || 100));
  const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();
  // Reads return snapshots, like rows coming back from MySQL, so a later
  // update never mutates an object a router already holds.
  const snap = (r?: Row) => (r ? { ...r } : r);

  // ---- Minimal Drizzle look-alike over the raw tables.
  type Pred = (row: Row) => boolean;
  const resolve = (t: unknown) => {
    const name = getTableName(t as any) as string;
    const tbl = state.raw[name];
    if (!tbl) throw new Error(`fake drizzle: no table for ${name}`);
    return { name, tbl };
  };
  const makeQuery = (tbl: Table<Row>) => {
    let pred: Pred | undefined;
    let order: { col: string; dir: "desc" } | undefined;
    const q = {
      where(p?: Pred) { pred = p; return q; },
      orderBy(o?: { col: string; dir: "desc" }) { order = o; return q; },
      limit() { return q; },
      then<R>(res: (rows: Row[]) => R, rej?: (e: unknown) => R) {
        let rows = tbl.all();
        if (pred) rows = rows.filter(pred);
        if (order) rows.sort(desc(order.col));
        return Promise.resolve(rows.map((r) => ({ ...r }))).then(res, rej);
      },
    };
    return q;
  };
  const fakeDrizzle = {
    select: () => ({ from: (t: unknown) => makeQuery(resolve(t).tbl) }),
    insert: (t: unknown) => ({
      values: async (v: Row) => {
        const { name, tbl } = resolve(t);
        const { id: _ignored, ...defaults } = RAW_DEFAULTS[name] ?? { id: 0 };
        const now = tick();
        const row = tbl.insert({ ...defaults, ...v, createdAt: now, updatedAt: now });
        return [{ insertId: row.id, affectedRows: 1 }];
      },
    }),
    update: (t: unknown) => ({
      set: (patch: Row) => ({
        where: async (p: Pred) => {
          const { tbl } = resolve(t);
          for (const row of tbl.filter(p)) Object.assign(row, patch, { updatedAt: tick() });
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async (p: Pred) => {
        const { tbl } = resolve(t);
        for (const row of tbl.filter(p)) tbl.remove(row.id);
      },
    }),
  };

  return {
    __state: state,
    getDb: vi.fn(async () => fakeDrizzle),
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    createAuditLog: vi.fn(async (data: Row) => { state.auditLogs.push(data); }),

    // ---- contacts
    getCrmContacts: vi.fn(async (f?: Row) => {
      const ex = lower(f?.excludeEmail);
      const rows = state.contacts
        .filter((c) =>
          (!f?.contactType || c.contactType === f.contactType) &&
          (!f?.status || c.status === f.status) &&
          (!f?.source || c.source === f.source) &&
          (!f?.pipelineStage || c.pipelineStage === f.pipelineStage) &&
          (!f?.assignedTo || c.assignedTo === f.assignedTo) &&
          (!ex || c.email == null || lower(c.email) !== ex) &&
          (!f?.search || [c.fullName, c.email, c.organization, c.phone].some((v) => lower(v).includes(lower(f.search)))))
        .sort(desc("createdAt"));
      return page(rows, f?.limit, f?.offset).map((r) => ({ ...r }));
    }),
    getCrmContactById: vi.fn(async (id: number) => snap(state.contacts.get(id))),
    getCrmContactByEmail: vi.fn(async (email: string) => snap(state.contacts.find((c) => c.email === email))),
    findOrCreateCrmContact: vi.fn(async (data: Row) => {
      const normalized: Row = {
        ...data,
        email: data.email?.trim() || undefined,
        phone: data.phone?.trim() || undefined,
        whatsappNumber: data.whatsappNumber?.trim() || undefined,
        linkedinUrl: data.linkedinUrl?.trim() || undefined,
      };
      const email = lower(normalized.email);
      const match = state.contacts.find((c) =>
        (!!email && lower(c.email) === email) ||
        (!!normalized.phone && c.phone === normalized.phone) ||
        (!!normalized.whatsappNumber && c.whatsappNumber === normalized.whatsappNumber) ||
        (!!normalized.linkedinUrl && lower(c.linkedinUrl).includes(lower(normalized.linkedinUrl))));
      if (match) {
        const patch: Row = { id: match.id };
        for (const [k, v] of Object.entries(normalized)) {
          if (v == null) continue;
          if (match[k] == null || match[k] === "") patch[k] = v;
        }
        if (Object.keys(patch).length > 1) state.contacts.update(match.id, { ...patch, updatedAt: tick() });
        return { id: match.id, created: false };
      }
      const now = tick();
      const row = state.contacts.insert({
        contactType: "lead", source: "manual", status: "active", pipelineStage: "new", dealCurrency: "USD",
        leadScore: 0, totalInteractions: 0, preferredChannel: "email",
        optedOutEmail: false, optedOutSms: false, optedOutWhatsapp: false,
        ...normalized, createdAt: now, updatedAt: now,
      });
      return { id: row.id, created: true };
    }),
    updateCrmContact: vi.fn(async (id: number, data: Row) => { state.contacts.update(id, data); }),
    deleteAllCrmContacts: vi.fn(async () => { const n = state.contacts.all().length; state.contacts.clear(); return n; }),

    // ---- interactions
    getCrmInteractions: vi.fn(async (f?: Row) => {
      const rows = state.interactions
        .filter((i) => (!f?.contactId || i.contactId === f.contactId) && (!f?.channel || i.channel === f.channel))
        .sort(desc("createdAt"));
      return page(rows, f?.limit, f?.offset).map((r) => ({ ...r }));
    }),
    createCrmInteraction: vi.fn(async (data: Row) => {
      const now = tick();
      const row = state.interactions.insert({ ...data, createdAt: now, updatedAt: now });
      const contact = state.contacts.get(data.contactId);
      if (contact) state.contacts.update(contact.id, { totalInteractions: (contact.totalInteractions ?? 0) + 1, lastContactedAt: now });
      return row.id;
    }),

    // ---- pipelines & deals
    getCrmPipelines: vi.fn(async (type?: string) =>
      state.pipelines.filter((p) => p.isActive === true && (!type || p.type === type)).sort((a, b) => a.name.localeCompare(b.name))),
    createCrmPipeline: vi.fn(async (data: Row) => state.pipelines.insert({ isActive: true, isDefault: false, ...data }).id),
    getCrmPipelineById: vi.fn(async (id: number) => snap(state.pipelines.get(id))),
    updateCrmPipeline: vi.fn(async (id: number, data: Row) => { state.pipelines.update(id, data); }),
    // ---- typed pipeline stages + stage history (crm_pipeline_stages / crm_deal_stage_history)
    getCrmPipelineStages: vi.fn(async (pipelineId: number) =>
      state.stages.filter((st) => st.pipelineId === pipelineId).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).map((st) => ({ ...st }))),
    getCrmPipelineStagesForPipelines: vi.fn(async (ids: number[]) =>
      state.stages.filter((st) => ids.includes(st.pipelineId)).sort((a, b) => a.sortOrder - b.sortOrder).map((st) => ({ ...st }))),
    createCrmPipelineStage: vi.fn(async (data: Row) => state.stages.insert({ rottingDays: null, ...data }).id),
    createCrmPipelineStages: vi.fn(async (rows: Row[]) => { for (const r of rows) state.stages.insert({ rottingDays: null, ...r }); }),
    updateCrmPipelineStage: vi.fn(async (id: number, data: Row) => { state.stages.update(id, data); }),
    deleteCrmPipelineStage: vi.fn(async (id: number) => { state.stages.remove(id); }),
    countCrmDealsInStage: vi.fn(async (pipelineId: number, stage: string) => state.deals.filter((d) => d.pipelineId === pipelineId && d.stage === stage).length),
    createCrmDealStageHistory: vi.fn(async (data: Row) => state.stageHistory.insert(data).id),
    getCrmDealStageHistory: vi.fn(async (dealId: number) => state.stageHistory.filter((h) => h.dealId === dealId).map((h) => ({ ...h }))),
    upsertCrmDealContact: vi.fn(async (data: Row) => {
      const existing = state.dealContacts.find((l) => l.dealId === data.dealId && l.contactId === data.contactId);
      if (existing) { state.dealContacts.update(existing.id, { role: data.role }); return existing.id; }
      return state.dealContacts.insert(data).id;
    }),
    deleteCrmDeal: vi.fn(async (id: number) => { state.deals.remove(id); }),
    // ---- lead scoring inputs
    getCrmAccountById: vi.fn(async () => undefined),
    getCrmContactLastInteractionAt: vi.fn(async (contactId: number) =>
      state.interactions.filter((i) => i.contactId === contactId).map((i) => i.createdAt as Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null),
    getCrmDeals: vi.fn(async (f?: Row) => {
      const rows = state.deals
        .filter((d) =>
          (!f?.pipelineId || d.pipelineId === f.pipelineId) &&
          (!f?.contactId || d.contactId === f.contactId) &&
          (!f?.stage || d.stage === f.stage) &&
          (!f?.status || d.status === f.status) &&
          (!f?.assignedTo || d.assignedTo === f.assignedTo))
        .sort(desc("createdAt"));
      return page(rows, f?.limit, f?.offset).map((r) => ({ ...r }));
    }),
    getCrmDealById: vi.fn(async (id: number) => snap(state.deals.get(id))),
    findCrmDealByCompany: vi.fn(async (company: string) => {
      const n = lower(company);
      if (!n) return undefined;
      return state.deals.find((d) => lower(d.name) === n || lower(state.contacts.get(d.contactId)?.organization) === n);
    }),
    hasPendingDealApprovalForCompany: vi.fn(async (company: string) => {
      const n = lower(company);
      return state.tasks
        .filter((t) => t.taskType === "create_crm_deal" && t.status === "pending_approval")
        .some((t) => { try { return lower(JSON.parse(t.taskData || "{}").company) === n; } catch { return false; } });
    }),
    createCrmDeal: vi.fn(async (data: Row) => {
      const now = tick();
      return state.deals.insert({ status: "open", currency: "USD", ...data, createdAt: now, updatedAt: now }).id;
    }),
    updateCrmDeal: vi.fn(async (id: number, data: Row) => {
      if (data.status === "won" && !data.wonAt) data.wonAt = new Date();
      if (data.status === "lost" && !data.lostAt) data.lostAt = new Date();
      state.deals.update(id, data);
    }),
    getCrmDealStats: vi.fn(async (pipelineId?: number) => {
      const rows = state.deals.filter((d) => !pipelineId || d.pipelineId === pipelineId);
      const sum = (rs: Row[]) => (rs.length ? money(rs.reduce((s, d) => s + Number(d.amount || 0), 0)) : null);
      const open = rows.filter((d) => d.status === "open");
      const won = rows.filter((d) => d.status === "won");
      return {
        total: rows.length,
        open: open.length,
        openValue: sum(open) || 0,
        won: won.length,
        wonValue: sum(won) || 0,
        lost: rows.filter((d) => d.status === "lost").length,
      };
    }),

    // ---- approval tasks (deal creation goes through the approval queue)
    createAiAgentTask: vi.fn(async (data: Row) => {
      const now = tick();
      const row = state.tasks.insert({ requiresApproval: true, ...data, createdAt: now, updatedAt: now });
      return { id: row.id, ...data };
    }),
    createAiAgentLog: vi.fn(async (data: Row) => ({ id: state.taskLogs.insert(data).id, ...data })),
    getAiAgentTaskById: vi.fn(async (id: number) => snap(state.tasks.get(id)) ?? null),
    updateAiAgentTask: vi.fn(async (id: number, data: Row) => { state.tasks.update(id, data); }),

    // ---- campaigns
    getCrmEmailCampaigns: vi.fn(async (f?: Row) => {
      const rows = state.campaigns
        .filter((c) => (!f?.status || c.status === f.status) && (!f?.type || c.type === f.type))
        .sort(desc("createdAt"));
      return rows.slice(0, f?.limit || 50);
    }),
    createCrmEmailCampaign: vi.fn(async (data: Row) => {
      const now = tick();
      return state.campaigns.insert({ status: "draft", type: "custom", totalRecipients: 0, sentCount: 0, ...data, createdAt: now, updatedAt: now }).id;
    }),
    updateCrmEmailCampaign: vi.fn(async (id: number, data: Row) => { state.campaigns.update(id, data); }),
    getCrmEmailCampaignById: vi.fn(async (id: number) => snap(state.campaigns.get(id))),
    getCrmContactsByIds: vi.fn(async (ids: number[]) => state.contacts.filter((c) => ids.includes(c.id)).map((c) => ({ ...c }))),
    getCrmContactsForSegment: vi.fn(async (seg: Row) =>
      state.contacts
        .filter((c) =>
          !!c.email && c.status === "active" && !c.optedOutEmail &&
          (!seg.contactTypes?.length || seg.contactTypes.includes(c.contactType)) &&
          (!seg.pipelineStages?.length || seg.pipelineStages.includes(c.pipelineStage)) &&
          (!seg.tagIds?.length) && // no tag assignments in this flow
          (seg.companyIds == null || seg.companyIds.includes(c.companyId)))
        .map((c) => ({ ...c }))),
    getCrmCampaignRecipients: vi.fn(async (campaignId: number) =>
      state.recipients.filter((r) => r.campaignId === campaignId).sort((a, b) => a.id - b.id).map((r) => ({ ...r }))),
    addCrmCampaignRecipients: vi.fn(async (campaignId: number, rows: Row[]) => {
      const seen = new Set(state.recipients.filter((r) => r.campaignId === campaignId).map((r) => r.contactId));
      let added = 0;
      for (const r of rows) {
        if (seen.has(r.contactId)) continue;
        seen.add(r.contactId);
        state.recipients.insert({ campaignId, contactId: r.contactId, email: r.email, status: "pending", createdAt: tick() });
        added++;
      }
      state.campaigns.update(campaignId, { totalRecipients: state.recipients.filter((r) => r.campaignId === campaignId).length });
      return added;
    }),
    removeCrmCampaignRecipient: vi.fn(async (campaignId: number, recipientId: number) => {
      const r = state.recipients.get(recipientId);
      if (!r || r.campaignId !== campaignId || !["pending", "failed", "skipped"].includes(r.status)) return false;
      state.recipients.remove(recipientId);
      state.campaigns.update(campaignId, { totalRecipients: state.recipients.filter((x) => x.campaignId === campaignId).length });
      return true;
    }),
    claimCrmEmailCampaignForSend: vi.fn(async (id: number, from: string[], staleBefore?: Date) => {
      const c = state.campaigns.get(id);
      const stale = c?.status === "sending" && !!staleBefore && c.updatedAt < staleBefore;
      if (!c || !(from.includes(c.status) || stale)) return false;
      state.campaigns.update(id, { status: "sending" });
      return true;
    }),
    resetFailedCrmCampaignRecipients: vi.fn(async (campaignId: number) => {
      for (const r of state.recipients.filter((x) => x.campaignId === campaignId && x.status === "failed")) Object.assign(r, { status: "pending", error: null });
    }),
    claimCrmCampaignRecipient: vi.fn(async (id: number) => {
      const r = state.recipients.get(id);
      if (!r || r.status !== "pending") return false;
      r.status = "sending";
      return true;
    }),
    updateCrmCampaignRecipient: vi.fn(async (id: number, data: Row) => { state.recipients.update(id, data); }),
    getDueScheduledCrmEmailCampaigns: vi.fn(async (now: Date) =>
      state.campaigns.filter((c) => c.status === "scheduled" && c.scheduledAt && c.scheduledAt <= now).map((c) => ({ ...c }))),

    // ---- sequence enrollments (sequences/steps themselves live in state.raw)
    getEmailSequenceById: vi.fn(async (id: number) => snap(state.raw.email_sequences.get(id))),
    getEmailSequenceSteps: vi.fn(async (sequenceId: number) =>
      state.raw.email_sequence_steps.filter((s) => s.sequenceId === sequenceId).sort((a, b) => a.stepOrder - b.stepOrder || a.id - b.id).map((s) => ({ ...s }))),
    getEmailSequenceEnrollments: vi.fn(async (sequenceId: number) =>
      state.raw.email_sequence_enrollments.filter((e) => e.sequenceId === sequenceId).sort(desc("createdAt"))
        .map((e) => ({ ...e, contactName: state.contacts.get(e.contactId)?.fullName ?? null, contactEmail: state.contacts.get(e.contactId)?.email ?? null }))),
    getEmailSequenceEnrollmentById: vi.fn(async (id: number) => snap(state.raw.email_sequence_enrollments.get(id))),
    createEmailSequenceEnrollments: vi.fn(async (rows: Row[]) => {
      const tbl = state.raw.email_sequence_enrollments;
      const enrolled: number[] = [];
      for (const r of rows) {
        if (tbl.find((e) => e.sequenceId === r.sequenceId && e.contactId === r.contactId)) continue;
        const now = tick();
        tbl.insert({ attempts: 0, lastError: null, lastSentAt: null, stoppedReason: null, ...r, createdAt: now, updatedAt: now });
        enrolled.push(r.contactId);
      }
      for (const seqId of new Set(rows.map((r) => r.sequenceId))) {
        const seq = state.raw.email_sequences.get(seqId);
        if (seq) seq.totalContacts = tbl.filter((e) => e.sequenceId === seqId).length;
      }
      return enrolled;
    }),
    updateEmailSequenceEnrollment: vi.fn(async (id: number, data: Row) => { state.raw.email_sequence_enrollments.update(id, data); }),
    getDueEmailSequenceEnrollments: vi.fn(async (now: Date) =>
      state.raw.email_sequence_enrollments.filter((e) => e.status === "active" && !!e.nextSendAt && e.nextSendAt <= now).map((e) => ({ ...e }))),
    claimEmailSequenceEnrollment: vi.fn(async (id: number, now: Date, leaseUntil: Date) => {
      const e = state.raw.email_sequence_enrollments.get(id);
      if (!e || e.status !== "active" || !e.nextSendAt || e.nextSendAt > now) return false;
      e.nextSendAt = leaseUntil;
      return true;
    }),

    // ---- marketing
    getMarketingVideos: vi.fn(async (f?: Row) => state.videos.filter((v) => !f?.companyId || v.companyId === f.companyId)),
    getMarketingVideoById: vi.fn(async (id: number) => snap(state.videos.get(id)) ?? null),
    createMarketingVideo: vi.fn(async (data: Row) => ({ id: state.videos.insert(data).id })),
    getSocialPosts: vi.fn(async (f?: Row) =>
      state.posts
        .filter((p) => (!f?.videoId || p.videoId === f.videoId) && (!f?.platform || p.platform === f.platform) && (!f?.status || p.status === f.status))
        .sort(desc("createdAt"))),
    createSocialPost: vi.fn(async (data: Row) => {
      const now = tick();
      return { id: state.posts.insert({ ...data, createdAt: now, updatedAt: now }).id };
    }),
    updateSocialPost: vi.fn(async (id: number, data: Row) => { state.posts.update(id, data); }),
    getSocialPlatformCredentials: vi.fn(async (f?: Row) =>
      state.credentials.filter((c) => (!f?.companyId || c.companyId === f.companyId) && (!f?.platform || c.platform === f.platform))),
    upsertSocialPlatformCredential: vi.fn(async (data: Row) => {
      const existing = state.credentials.find((c) => (c.companyId ?? null) === (data.companyId ?? null) && c.platform === data.platform);
      if (existing) { state.credentials.update(existing.id, data); return { id: existing.id }; }
      return { id: state.credentials.insert(data).id };
    }),
  };
});

vi.mock("../_core/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ success: true, messageId: "sg-1" })) };
});

vi.mock("../_core/socialPublisher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/socialPublisher")>();
  return { ...actual, publishToPlatform: vi.fn() };
});

import * as db from "../db";
import { publishToPlatform } from "../_core/socialPublisher";
import { sendEmail } from "../_core/email";
import { appRouter } from "../routers";
import { runEmailOutreachTick } from "../sequenceRunner";

const state = (db as unknown as { __state: State }).__state;

const SALES_ID = 10;
const sales = appRouter.createCaller(ctxFor("sales", { id: SALES_ID, name: "Sam Sales", email: "sales@example.com" }));
const admin = appRouter.createCaller(ctxFor("admin", { id: 1, name: "Admin User", email: "admin@example.com" }));
const ops = appRouter.createCaller(ctxFor("ops", { id: 20, email: "ops@example.com" }));
const otherSales = appRouter.createCaller(ctxFor("sales", { id: 11, email: "sales2@example.com" }));
const investor = appRouter.createCaller(ctxFor("investor", { id: 30, email: "investor@example.com" }));
// Same sales user, but confined to entity #2 (campaigns/contacts above belong to #1 or none).
const salesEntity2 = appRouter.createCaller(ctxFor("sales", { id: SALES_ID, email: "sales@example.com", companyId: 2, regionScope: "entity" }));
const DAY = 24 * 60 * 60 * 1000;
const sentTo = () => vi.mocked(sendEmail).mock.calls.map((c) => [c[0].to, c[0].subject]);

const ids = {
  contactId: 0,
  interactionIds: { call: 0, email: 0, meeting: 0 },
  pipelineId: 0,
  taskId: 0,
  dealId: 0,
  sequenceId: 0,
  stepIds: [] as number[],
  campaignId: 0,
  videoId: 0,
  credentialId: 0,
  ambassadorId: 0,
};

describe("CRM process: contact → deal → outreach → marketing", () => {
  beforeAll(() => {
    ids.credentialId = state.credentials.insert({
      companyId: null, platform: "youtube", accountHandle: "@superhumn", isActive: true,
      accessToken: "yt-access-token", refreshToken: null, tokenExpiresAt: null,
    }).id;
  });

  it("1. sales creates a contact with a company; a duplicate email merges into it, not a second row", async () => {
    const created = await sales.crm.contacts.create({
      firstName: "Jane", lastName: "Doe", email: "jane@acme.com", organization: "Acme Foods",
      contactType: "prospect", source: "event",
    });
    ids.contactId = created.id;
    expect(created).toEqual({ id: ids.contactId, merged: false });

    const contact = await sales.crm.contacts.get({ id: ids.contactId });
    expect(contact).toMatchObject({
      fullName: "Jane Doe", email: "jane@acme.com", organization: "Acme Foods", contactType: "prospect",
      source: "event", status: "active", pipelineStage: "new", capturedBy: SALES_ID, totalInteractions: 0,
    });
    expect(state.auditLogs.at(-1)).toMatchObject({ userId: SALES_ID, action: "create", entityType: "crm_contact", entityId: ids.contactId, entityName: "Jane Doe" });

    // Same email (different case) → merged into the existing record; only blank fields are filled in.
    const dup = await sales.crm.contacts.create({ firstName: "Janet", email: "JANE@acme.com ", organization: "Acme Foods Inc", jobTitle: "Head of Procurement" });
    expect(dup).toEqual({ id: ids.contactId, merged: true });
    expect(state.contacts.all()).toHaveLength(1);
    const merged = await sales.crm.contacts.get({ id: ids.contactId });
    expect(merged).toMatchObject({ fullName: "Jane Doe", organization: "Acme Foods", jobTitle: "Head of Procurement" });
    expect(state.auditLogs.at(-1)).toMatchObject({ action: "update", entityType: "crm_contact", entityId: ids.contactId });

    // Users cannot add themselves as a contact.
    await expect(sales.crm.contacts.create({ firstName: "Sam", email: "Sales@Example.com" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await sales.crm.contacts.getByEmail({ email: "jane@acme.com" })).toMatchObject({ id: ids.contactId });
    expect((await sales.crm.contacts.list({ search: "acme" })).map((c) => c.id)).toEqual([ids.contactId]);
    expect(await sales.crm.contacts.list({ contactType: "customer" })).toEqual([]);
  });

  it("2. interactions (call, email, meeting) are logged and listed newest first; the contact's counters update", async () => {
    ids.interactionIds.call = (await sales.crm.interactions.create({
      contactId: ids.contactId, channel: "phone", interactionType: "call_made", callDuration: 12, callOutcome: "answered", summary: "Intro call",
    })).id;
    ids.interactionIds.email = (await sales.crm.interactions.create({
      contactId: ids.contactId, channel: "email", interactionType: "sent", subject: "Samples", content: "Sending samples this week",
    })).id;
    const start = new Date("2026-10-02T15:00:00.000Z");
    ids.interactionIds.meeting = (await sales.crm.interactions.create({
      contactId: ids.contactId, channel: "meeting", interactionType: "meeting_scheduled", subject: "Tasting", meetingStartTime: start, meetingLocation: "Acme HQ",
    })).id;

    const list = await sales.crm.interactions.list({ contactId: ids.contactId });
    expect(list.map((i) => i.id)).toEqual([ids.interactionIds.meeting, ids.interactionIds.email, ids.interactionIds.call]);
    expect(list.map((i) => i.channel)).toEqual(["meeting", "email", "phone"]);
    expect(list[0]).toMatchObject({ interactionType: "meeting_scheduled", subject: "Tasting", meetingLocation: "Acme HQ", performedBy: SALES_ID });
    expect(list[0].meetingStartTime).toEqual(start);
    expect(list[2]).toMatchObject({ interactionType: "call_made", callDuration: 12, callOutcome: "answered" });

    expect((await sales.crm.interactions.list({ contactId: ids.contactId, channel: "email" })).map((i) => i.id)).toEqual([ids.interactionIds.email]);
    expect(await sales.crm.interactions.list({ contactId: 9999 })).toEqual([]);

    const contact = await sales.crm.contacts.get({ id: ids.contactId });
    expect(contact?.totalInteractions).toBe(3);
    expect(contact?.lastContactedAt).toBeInstanceOf(Date);

    // Convenience loggers write the same rows.
    await sales.crm.interactions.logCall({ contactId: ids.contactId, direction: "inbound", outcome: "voicemail", duration: 1 });
    const latest = (await sales.crm.interactions.list({ contactId: ids.contactId }))[0];
    expect(latest).toMatchObject({ channel: "phone", interactionType: "call_received", callOutcome: "voicemail" });
    expect((await sales.crm.contacts.get({ id: ids.contactId }))?.totalInteractions).toBe(4);
  });

  it("3a. a deal request goes to the approval queue; admin approval creates the deal", async () => {
    ids.pipelineId = (await sales.crm.pipelines.create({
      name: "Wholesale", type: "sales", stages: JSON.stringify(["discovery", "proposal", "negotiation", "closed_won"]), isDefault: true,
    })).id;
    expect((await sales.crm.pipelines.list({ type: "sales" })).map((p) => p.id)).toEqual([ids.pipelineId]);

    // The JSON stage array is mirrored into typed stage rows on create.
    expect(state.stages.filter((st) => st.pipelineId === ids.pipelineId).map((st) => [st.name, st.defaultProbability, st.isWon])).toEqual([
      ["discovery", 10, false], ["proposal", 50, false], ["negotiation", 90, false], ["closed_won", 100, true],
    ]);

    // requestApproval routes the new deal through the AI-agent approval queue.
    const req = await sales.crm.deals.create({
      pipelineId: ids.pipelineId, contactId: ids.contactId, stage: "discovery", amount: "25000", source: "event", notes: "Regional launch",
      requestApproval: true,
    });
    ids.taskId = req.taskId;
    expect(req).toEqual({ taskId: ids.taskId, pendingApproval: true, company: "Acme Foods" });
    expect(state.tasks.get(ids.taskId)).toMatchObject({ taskType: "create_crm_deal", status: "pending_approval", priority: "medium" });
    expect(JSON.parse(state.tasks.get(ids.taskId)!.taskData)).toEqual({
      pipelineId: ids.pipelineId, contactId: ids.contactId, company: "Acme Foods", name: "Acme Foods", stage: "discovery", amount: "25000", source: "event", notes: "Regional launch", assignedTo: SALES_ID,
    });
    expect(await sales.crm.deals.list()).toEqual([]); // nothing until approved

    // A second request for the same company is blocked while one is pending.
    await expect(sales.crm.deals.create({ pipelineId: ids.pipelineId, contactId: ids.contactId, stage: "discovery", requestApproval: true }))
      .rejects.toMatchObject({ code: "CONFLICT", message: 'An approval is already pending for "Acme Foods".' });

    // Only an admin can approve.
    await expect(sales.aiAgent.tasks.approve({ id: ids.taskId })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const approval = await admin.aiAgent.tasks.approve({ id: ids.taskId });
    expect(approval).toMatchObject({ success: true, autoExecuted: true, company: "Acme Foods" });
    ids.dealId = (approval as { dealId: number }).dealId;
    expect(state.tasks.get(ids.taskId)).toMatchObject({ status: "completed", approvedBy: 1 });
    expect(JSON.parse(state.tasks.get(ids.taskId)!.executionResult)).toEqual({ created: true, dealId: ids.dealId, dealName: "Acme Foods" });

    const deal = await sales.crm.deals.get({ id: ids.dealId });
    expect(deal).toMatchObject({
      name: "Acme Foods", pipelineId: ids.pipelineId, contactId: ids.contactId, stage: "discovery", amount: "25000",
      status: "open", source: "event", notes: "Regional launch", assignedTo: SALES_ID,
    });
    expect((await sales.crm.deals.list({ contactId: ids.contactId })).map((d) => d.id)).toEqual([ids.dealId]);

    // Without requestApproval a deal is inserted directly — a company may
    // hold several deals — with its stage probability and history recorded.
    const direct = await sales.crm.deals.create({ pipelineId: ids.pipelineId, contactId: ids.contactId, stage: "proposal", name: "Acme Foods — spring menu" });
    expect(direct).toMatchObject({ pendingApproval: false, name: "Acme Foods — spring menu" });
    const directId = (direct as { id: number }).id;
    expect(await sales.crm.deals.get({ id: directId })).toMatchObject({ stage: "proposal", probability: 50, status: "open", assignedTo: SALES_ID });
    expect(state.stageHistory.filter((h) => h.dealId === directId).map((h) => [h.fromStage, h.toStage])).toEqual([[null, "proposal"]]);
    await sales.crm.deals.delete({ id: directId });
    expect(state.deals.all()).toHaveLength(1);
  });

  it("3b. the deal moves through the stages to won and the pipeline summary reflects it", async () => {
    expect(await sales.crm.deals.getStats({ pipelineId: ids.pipelineId })).toEqual({
      total: 1, open: 1, openValue: "25000.00", won: 0, wonValue: 0, lost: 0,
    });

    for (const [stage, probability] of [["proposal", 40], ["negotiation", 70], ["closed_won", 100]] as const) {
      expect(await sales.crm.deals.moveStage({ id: ids.dealId, stage, probability })).toMatchObject({ success: true, stage, probability });
      expect(await sales.crm.deals.get({ id: ids.dealId })).toMatchObject({ stage, probability });
    }
    expect(state.auditLogs.at(-1)).toMatchObject({
      action: "update", entityType: "crm_deal", entityId: ids.dealId, oldValues: { stage: "negotiation" }, newValues: { stage: "closed_won" },
    });

    await sales.crm.deals.update({ id: ids.dealId, status: "won", amount: "27500" });
    const won = await sales.crm.deals.get({ id: ids.dealId });
    expect(won).toMatchObject({ status: "won", stage: "closed_won", amount: "27500" });
    expect(won?.wonAt).toBeInstanceOf(Date);

    expect(await sales.crm.deals.getStats({ pipelineId: ids.pipelineId })).toEqual({
      total: 1, open: 0, openValue: 0, won: 1, wonValue: "27500.00", lost: 0,
    });
    expect(await sales.crm.deals.getStats()).toMatchObject({ total: 1, won: 1 });
    expect(await sales.crm.deals.getStats({ pipelineId: 999 })).toEqual({ total: 0, open: 0, openValue: 0, won: 0, wonValue: 0, lost: 0 });
    expect((await sales.crm.deals.list({ status: "won" })).map((d) => d.id)).toEqual([ids.dealId]);
    expect(await sales.crm.deals.list({ status: "open" })).toEqual([]);
  });

  it("4a. an email sequence is built, contacts are enrolled and the runner sends each step until completion", async () => {
    ids.sequenceId = (await sales.emailSequences.create({ name: "Wholesale nurture", description: "3-touch follow-up" })).id;
    expect(ids.sequenceId).toBeGreaterThan(0);

    ids.stepIds.push((await sales.emailSequences.addStep({ sequenceId: ids.sequenceId, subject: "Thanks for meeting, {{firstName}}", body: "Great to meet you at {{company}}.", delayDays: 0 })).id);
    ids.stepIds.push((await sales.emailSequences.addStep({ sequenceId: ids.sequenceId, subject: "Samples on the way", body: "Tracking inside.", delayDays: 3 })).id);
    ids.stepIds.push((await sales.emailSequences.addStep({ sequenceId: ids.sequenceId, subject: "Any questions?", body: "Happy to help.", delayDays: 7 })).id);

    const seq = await sales.emailSequences.get({ id: ids.sequenceId });
    expect(seq).toMatchObject({ id: ids.sequenceId, userId: SALES_ID, name: "Wholesale nurture", status: "draft", totalContacts: 0 });
    expect(seq.steps.map((s) => [s.stepOrder, s.subject, s.delayDays])).toEqual([
      [1, "Thanks for meeting, {{firstName}}", 0], [2, "Samples on the way", 3], [3, "Any questions?", 7],
    ]);

    // Sequences are private to their author.
    expect(await otherSales.emailSequences.list()).toEqual([]);
    await expect(otherSales.emailSequences.get({ id: ids.sequenceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(otherSales.emailSequences.updateStep({ stepId: ids.stepIds[0], subject: "hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(otherSales.emailSequences.deleteStep({ stepId: ids.stepIds[0] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.raw.email_sequence_steps.get(ids.stepIds[0])?.subject).toBe("Thanks for meeting, {{firstName}}");

    // A draft sequence does not accept contacts.
    await expect(sales.emailSequences.enroll({ sequenceId: ids.sequenceId, contactIds: [ids.contactId] }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await sales.emailSequences.updateStep({ stepId: ids.stepIds[1], delayDays: 2 });
    await sales.emailSequences.update({ id: ids.sequenceId, status: "active" });
    const list = await sales.emailSequences.list();
    expect(list[0]).toMatchObject({ id: ids.sequenceId, status: "active", stepCount: 3 });

    // Enroll Jane, Bob, an opted-out contact and an unknown id.
    const optedOut = state.contacts.insert({ firstName: "Otto", fullName: "Otto Out", email: "otto@x.com", status: "active", optedOutEmail: true, contactType: "prospect", pipelineStage: "new" }).id;
    const bob = state.contacts.insert({ firstName: "Bob", fullName: "Bob Buyer", email: "bob@acme.com", organization: "Acme Foods", status: "active", optedOutEmail: false, contactType: "prospect", pipelineStage: "contacted" }).id;

    // Only internal roles may enroll; only the author sees their sequence.
    await expect(investor.emailSequences.enroll({ sequenceId: ids.sequenceId, contactIds: [ids.contactId] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(otherSales.emailSequences.enroll({ sequenceId: ids.sequenceId, contactIds: [ids.contactId] })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const before = Date.now();
    const res = await sales.emailSequences.enroll({ sequenceId: ids.sequenceId, contactIds: [ids.contactId, optedOut, bob, 9999] });
    expect(res).toMatchObject({ enrolled: 2, enrolledContactIds: [ids.contactId, bob] });
    expect(res.skipped).toEqual([
      { contactId: optedOut, reason: "Contact opted out of email" },
      { contactId: 9999, reason: "Contact not found" },
    ]);
    expect(res.nextSendAt.getTime()).toBeGreaterThanOrEqual(before); // step 1 has no delay

    // Duplicates are skipped; an entity-2-scoped caller can neither enroll contacts outside
    // entity 2 nor see enrollments of them.
    expect((await sales.emailSequences.enroll({ sequenceId: ids.sequenceId, contactIds: [ids.contactId] })).skipped)
      .toEqual([{ contactId: ids.contactId, reason: "Already enrolled" }]);
    expect((await salesEntity2.emailSequences.enroll({ sequenceId: ids.sequenceId, contactIds: [bob] })).skipped)
      .toEqual([{ contactId: bob, reason: "Contact not found" }]);
    expect(await salesEntity2.emailSequences.enrollments({ sequenceId: ids.sequenceId })).toEqual([]);

    let enrollments = await sales.emailSequences.enrollments({ sequenceId: ids.sequenceId });
    expect(enrollments.map((e) => [e.contactId, e.contactName, e.status, e.currentStepOrder])).toEqual([
      [bob, "Bob Buyer", "active", 0], [ids.contactId, "Jane Doe", "active", 0],
    ]);
    expect(state.raw.email_sequences.get(ids.sequenceId)?.totalContacts).toBe(2);
    const bobEnrollment = enrollments.find((e) => e.contactId === bob)!.id;
    const janeEnrollment = enrollments.find((e) => e.contactId === ids.contactId)!.id;

    // Tick 1: step 1 goes to both, with merge fields rendered.
    vi.mocked(sendEmail).mockClear();
    let t = new Date(Date.now() + 1000);
    let tick = await runEmailOutreachTick(t);
    expect(tick.sequences).toMatchObject({ due: 2, claimed: 2, sent: 2 });
    expect(sentTo().sort()).toEqual([["bob@acme.com", "Thanks for meeting, Bob"], ["jane@acme.com", "Thanks for meeting, Jane"]]);
    expect(vi.mocked(sendEmail).mock.calls.find((c) => c[0].to === "jane@acme.com")![0].text).toBe("Great to meet you at Acme Foods.");
    expect(state.raw.email_sequence_enrollments.get(janeEnrollment)).toMatchObject({ currentStepOrder: 1, lastSentAt: t, nextSendAt: new Date(t.getTime() + 2 * DAY) });

    // Re-running the same tick sends nothing (rows already advanced).
    vi.mocked(sendEmail).mockClear();
    expect((await runEmailOutreachTick(t)).sequences).toMatchObject({ due: 0, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();

    // Bob is paused before step 2; Jane gets step 2.
    await sales.emailSequences.pause({ enrollmentId: bobEnrollment });
    await expect(otherSales.emailSequences.pause({ enrollmentId: janeEnrollment })).rejects.toMatchObject({ code: "NOT_FOUND" });
    t = new Date(t.getTime() + 2 * DAY);
    await runEmailOutreachTick(t);
    expect(sentTo()).toEqual([["jane@acme.com", "Samples on the way"]]);

    // Bob resumes (his overdue step goes out next tick); Jane is unenrolled instead of getting step 3.
    await sales.emailSequences.resume({ enrollmentId: bobEnrollment });
    await sales.emailSequences.unenroll({ enrollmentId: janeEnrollment });
    vi.mocked(sendEmail).mockClear();
    t = new Date(t.getTime() + 7 * DAY);
    await runEmailOutreachTick(t);
    expect(sentTo()).toEqual([["bob@acme.com", "Samples on the way"]]);
    t = new Date(t.getTime() + 7 * DAY);
    await runEmailOutreachTick(t);
    expect(sentTo()).toEqual([["bob@acme.com", "Samples on the way"], ["bob@acme.com", "Any questions?"]]);

    enrollments = await sales.emailSequences.enrollments({ sequenceId: ids.sequenceId });
    expect(enrollments.map((e) => [e.contactId, e.status, e.currentStepOrder, e.stoppedReason ?? null])).toEqual([
      [bob, "completed", 3, null], [ids.contactId, "stopped", 2, "Unenrolled"],
    ]);
    await expect(sales.emailSequences.resume({ enrollmentId: janeEnrollment })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(Object.keys(appRouter._def.procedures).filter((p) => p.startsWith("emailSequences.")).sort()).toEqual([
      "emailSequences.addStep", "emailSequences.create", "emailSequences.delete", "emailSequences.deleteStep",
      "emailSequences.enroll", "emailSequences.enrollments", "emailSequences.get", "emailSequences.list",
      "emailSequences.pause", "emailSequences.resume", "emailSequences.unenroll", "emailSequences.update", "emailSequences.updateStep",
    ]);
  });

  it("4b. a campaign gets recipients (explicit + segment), is test-sent, sent with per-recipient statuses and retried", async () => {
    ids.campaignId = (await sales.crm.campaigns.create({
      name: "Fall wholesale launch", subject: "New fall SKUs for {{company}}", bodyHtml: "<p>Hi {{firstName}}</p>", bodyText: "Hi {{firstName}}",
      type: "announcement", targetContactTypes: JSON.stringify(["prospect"]), targetPipelineStages: JSON.stringify(["new", "contacted"]),
    })).id;

    let [campaign] = await sales.crm.campaigns.list({ status: "draft" });
    expect(campaign).toMatchObject({
      id: ids.campaignId, name: "Fall wholesale launch", type: "announcement", status: "draft", companyId: 1,
      createdBy: SALES_ID, totalRecipients: 0, sentCount: 0, targetContactTypes: '["prospect"]',
    });
    expect(state.auditLogs.at(-1)).toMatchObject({ action: "create", entityType: "crm_campaign", entityId: ids.campaignId, entityName: "Fall wholesale launch" });

    const scheduledAt = new Date("2026-10-05T14:00:00.000Z");
    expect(await sales.crm.campaigns.update({ id: ids.campaignId, status: "scheduled", scheduledAt })).toEqual({ success: true });
    [campaign] = await sales.crm.campaigns.list({ status: "scheduled" });
    expect(campaign.scheduledAt).toEqual(scheduledAt);
    expect((await sales.crm.campaigns.list({ type: "announcement" })).map((c) => c.id)).toEqual([ids.campaignId]);

    // Recipients: explicit ids (skips are reported) + the campaign's own targeting.
    const [otto, bob] = ["Otto Out", "Bob Buyer"].map((n) => state.contacts.find((c) => c.fullName === n)!.id);
    const noEmail = state.contacts.insert({ firstName: "Nia", fullName: "Nia NoMail", email: null, status: "active", contactType: "customer" }).id;
    const added = await sales.crm.campaigns.addRecipients({ campaignId: ids.campaignId, contactIds: [ids.contactId, otto, noEmail, 9999], segment: { useCampaignTargeting: true } });
    expect(added).toEqual({
      added: 2, alreadyAdded: 0, totalRecipients: 2,
      skipped: [
        { contactId: otto, reason: "Contact opted out of email" },
        { contactId: noEmail, reason: "Contact has no email address" },
        { contactId: 9999, reason: "Contact not found" },
      ],
    });
    let recipients = await sales.crm.campaigns.recipients({ campaignId: ids.campaignId });
    expect(recipients.map((r) => [r.contactId, r.contactName, r.email, r.status])).toEqual([
      [ids.contactId, "Jane Doe", "jane@acme.com", "pending"], [bob, "Bob Buyer", "bob@acme.com", "pending"],
    ]);

    // Gating + scope: ops (internal, not CRM) cannot send; investors cannot read; another entity cannot see it.
    await expect(ops.crm.campaigns.send({ campaignId: ids.campaignId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ops.crm.campaigns.sendTest({ campaignId: ids.campaignId, to: "ops@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(investor.crm.campaigns.recipients({ campaignId: ids.campaignId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(salesEntity2.crm.campaigns.get({ id: ids.campaignId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(salesEntity2.crm.campaigns.send({ campaignId: ids.campaignId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await salesEntity2.crm.campaigns.list()).toEqual([]);

    // Test send: rendered with the first recipient, tagged [TEST], no recipient rows touched.
    vi.mocked(sendEmail).mockClear();
    expect(await sales.crm.campaigns.sendTest({ campaignId: ids.campaignId, to: "sales@example.com" })).toEqual({ success: true });
    expect(sendEmail).toHaveBeenCalledWith({ to: "sales@example.com", subject: "[TEST] New fall SKUs for Acme Foods", html: "<p>Hi Jane</p>", text: "Hi Jane" });
    expect((await sales.crm.campaigns.recipients({ campaignId: ids.campaignId })).every((r) => r.status === "pending")).toBe(true);

    // Send now: Bob's mailbox rejects.
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendEmail).mockImplementation(async (o) => (o.to === "bob@acme.com" ? { success: false, error: "550 mailbox unavailable" } : { success: true, messageId: "sg-jane" }));
    const first = await sales.crm.campaigns.send({ campaignId: ids.campaignId });
    expect(first).toMatchObject({ claimed: true, status: "partially_failed", sent: 1, failed: 1, skipped: 0, sentCount: 1 });
    recipients = await sales.crm.campaigns.recipients({ campaignId: ids.campaignId });
    expect(recipients.map((r) => [r.email, r.status, r.messageId ?? null, r.error ?? null])).toEqual([
      ["jane@acme.com", "sent", "sg-jane", null], ["bob@acme.com", "failed", null, "550 mailbox unavailable"],
    ]);
    expect(recipients[0].sentAt).toBeInstanceOf(Date);
    expect(await sales.crm.campaigns.get({ id: ids.campaignId })).toMatchObject({ status: "partially_failed", sentCount: 1, totalRecipients: 2 });

    // Re-send retries Bob only; Jane is never mailed twice.
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendEmail).mockImplementation(async () => ({ success: true, messageId: "sg-2" }));
    expect(await sales.crm.campaigns.send({ campaignId: ids.campaignId })).toMatchObject({ status: "sent", sent: 1, sentCount: 2 });
    expect(sentTo()).toEqual([["bob@acme.com", "New fall SKUs for Acme Foods"]]);
    await expect(sales.crm.campaigns.send({ campaignId: ids.campaignId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(sales.crm.campaigns.removeRecipient({ campaignId: ids.campaignId, recipientId: recipients[0].id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.auditLogs.at(-1)).toMatchObject({ action: "update", entityType: "crm_campaign", entityId: ids.campaignId, entityName: "sent: 1 ok, 0 failed, 0 skipped" });

    // A scheduled campaign is sent by the outreach tick once its time passes.
    const scheduled = (await sales.crm.campaigns.create({ name: "Reminder", subject: "Reminder", bodyHtml: "<p>{{firstName}}</p>", type: "newsletter" })).id;
    await expect(sales.crm.campaigns.schedule({ campaignId: scheduled, scheduledAt: new Date(Date.now() + DAY) })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await sales.crm.campaigns.addRecipients({ campaignId: scheduled, contactIds: [ids.contactId, bob] });
    const removed = (await sales.crm.campaigns.recipients({ campaignId: scheduled })).find((r) => r.contactId === bob)!;
    expect(await sales.crm.campaigns.removeRecipient({ campaignId: scheduled, recipientId: removed.id })).toEqual({ success: true });
    const at = new Date(Date.now() + DAY);
    expect(await sales.crm.campaigns.schedule({ campaignId: scheduled, scheduledAt: at })).toEqual({ success: true, scheduledAt: at });
    vi.mocked(sendEmail).mockClear();
    expect((await runEmailOutreachTick(new Date(at.getTime() - 1000))).campaigns).toEqual([]);
    const tick = await runEmailOutreachTick(new Date(at.getTime() + 1000));
    expect(tick.campaigns).toEqual([expect.objectContaining({ campaignId: scheduled, claimed: true, status: "sent", sent: 1 })]);
    expect(sentTo()).toEqual([["jane@acme.com", "Reminder"]]);
    expect((await runEmailOutreachTick(new Date(at.getTime() + 2000))).campaigns).toEqual([]);

    expect(Object.keys(appRouter._def.procedures).filter((p) => p.startsWith("crm.campaigns.")).sort()).toEqual([
      "crm.campaigns.addRecipients", "crm.campaigns.create", "crm.campaigns.get", "crm.campaigns.list", "crm.campaigns.recipients",
      "crm.campaigns.removeRecipient", "crm.campaigns.schedule", "crm.campaigns.send", "crm.campaigns.sendTest",
      "crm.campaigns.unschedule", "crm.campaigns.update",
    ]);

    // Leave the contact book as later steps expect it (Jane only).
    for (const id of [otto, bob, noEmail]) state.contacts.remove(id);
  });

  it("5a. marketing: connected credentials never expose tokens; posts are planned per platform", async () => {
    const creds = await sales.marketing.listCredentials();
    expect(creds).toEqual([{ id: ids.credentialId, platform: "youtube", accountHandle: "@superhumn", isActive: true, isConnected: true, tokenExpiresAt: null }]);
    expect(creds[0]).not.toHaveProperty("accessToken");

    ids.videoId = (await sales.marketing.createVideo({
      title: "Fall launch teaser", description: "New fall SKUs", horizontalUrl: "https://cdn.example/fall-16x9.mp4", durationSec: 45, tags: "#fall #launch",
    })).id;
    expect(state.auditLogs.at(-1)).toMatchObject({ action: "create", entityType: "marketingVideo", entityId: ids.videoId, entityName: "Fall launch teaser" });

    const plan = await sales.marketing.planPosts({ videoId: ids.videoId, platforms: ["youtube", "tiktok", "instagram_feed"] });
    expect(plan).toEqual([
      { platform: "youtube", pickedRatio: "horizontal", pickedUrl: "https://cdn.example/fall-16x9.mp4", skipReason: null },
      { platform: "tiktok", pickedRatio: null, pickedUrl: null, skipReason: "TikTok requires 9:16; none of those cuts were uploaded." },
      { platform: "instagram_feed", pickedRatio: "horizontal", pickedUrl: "https://cdn.example/fall-16x9.mp4", skipReason: null },
    ]);
    expect(await sales.marketing.listPosts({ videoId: ids.videoId })).toEqual([]); // planning writes nothing
    await expect(sales.marketing.planPosts({ videoId: 999, platforms: ["youtube"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("5b. marketing: publishing uploads to the connected platform and records every outcome", async () => {
    vi.mocked(publishToPlatform).mockResolvedValueOnce({ externalId: "yt-abc123", externalUrl: "https://youtu.be/yt-abc123", refreshedTokens: null });

    const res = await sales.marketing.publish({ videoId: ids.videoId, platforms: ["youtube", "tiktok"], caption: "Fall is here", hashtags: "#fall" });
    expect(res.videoId).toBe(ids.videoId);
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toMatchObject({ platform: "youtube", status: "published", externalUrl: "https://youtu.be/yt-abc123" });
    expect(res.results[1]).toMatchObject({ platform: "tiktok", status: "skipped", skipReason: "TikTok requires 9:16; none of those cuts were uploaded." });

    expect(publishToPlatform).toHaveBeenCalledTimes(1);
    expect(publishToPlatform).toHaveBeenCalledWith({
      platform: "youtube", videoUrl: "https://cdn.example/fall-16x9.mp4", title: "Fall launch teaser", caption: "Fall is here", hashtags: "#fall",
      tokens: { accessToken: "yt-access-token", refreshToken: null, expiresAt: null },
    });

    const posts = await sales.marketing.listPosts({ videoId: ids.videoId });
    expect(posts).toHaveLength(2);
    const yt = posts.find((p) => p.platform === "youtube")!;
    expect(yt).toMatchObject({ status: "published", aspectRatio: "horizontal", externalId: "yt-abc123", externalUrl: "https://youtu.be/yt-abc123", caption: "Fall is here", createdBy: SALES_ID });
    expect(yt.publishedAt).toBeInstanceOf(Date);
    expect(posts.find((p) => p.platform === "tiktok")).toMatchObject({ status: "skipped", aspectRatio: "vertical", skipReason: "TikTok requires 9:16; none of those cuts were uploaded." });
    expect(state.auditLogs.at(-1)).toMatchObject({ action: "create", entityType: "socialPostFanout", entityId: ids.videoId });

    // A platform without a connected account fails that post only, with the reason recorded.
    vi.mocked(publishToPlatform).mockRejectedValueOnce(new Error("Missing OAuth credentials for instagram_feed. Connect the account in Marketing → Settings."));
    const res2 = await sales.marketing.publish({ videoId: ids.videoId, platforms: ["instagram_feed"] });
    expect(res2.results[0]).toMatchObject({ platform: "instagram_feed", status: "failed", error: "Missing OAuth credentials for instagram_feed. Connect the account in Marketing → Settings." });
    expect((await sales.marketing.listPosts({ videoId: ids.videoId, status: "failed" }))[0]).toMatchObject({ platform: "instagram_feed", errorMessage: expect.stringContaining("Missing OAuth credentials") });
    expect((await sales.marketing.listPosts({ status: "published" })).map((p) => p.platform)).toEqual(["youtube"]);
  });

  it("5c. a brand ambassador is created and moved through outreach stages", async () => {
    ids.ambassadorId = (await sales.brandAmbassadors.create({
      name: "Chef Rosa", type: "chef", country: "US", followerCount: 120000, agentName: "Lee", agentEmail: "lee@talent.example", campaignName: "Fall launch",
    })).id;
    expect(ids.ambassadorId).toBeGreaterThan(0);

    let amb = await sales.brandAmbassadors.get({ id: ids.ambassadorId });
    expect(amb).toMatchObject({ name: "Chef Rosa", type: "chef", stage: "prospect", priority: "medium", currency: "USD", createdBy: SALES_ID, activities: [] });

    expect(await sales.brandAmbassadors.updateStage({ id: ids.ambassadorId, stage: "contacted", notes: "Intro email sent to agent" })).toEqual({ ok: true });
    await sales.brandAmbassadors.logActivity({
      ambassadorId: ids.ambassadorId, activityType: "outreach", occurredAt: new Date("2026-09-28T12:00:00.000Z"), summary: "Intro email to Lee",
    });
    amb = await sales.brandAmbassadors.get({ id: ids.ambassadorId });
    expect(amb).toMatchObject({ stage: "contacted", notes: "Intro email sent to agent" });
    expect(amb.activities).toHaveLength(1);
    expect(amb.activities[0]).toMatchObject({ activityType: "outreach", summary: "Intro email to Lee", createdBy: SALES_ID });

    await sales.brandAmbassadors.updateStage({ id: ids.ambassadorId, stage: "in_negotiation" });
    expect((await sales.brandAmbassadors.list({ stage: "in_negotiation" })).map((a) => a.id)).toEqual([ids.ambassadorId]);
    expect(await sales.brandAmbassadors.list({ stage: "signed" })).toEqual([]);
    expect((await sales.brandAmbassadors.list({ type: "chef", country: "US" })).map((a) => a.name)).toEqual(["Chef Rosa"]);
    await expect(sales.brandAmbassadors.get({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("6. role gating: ops cannot wipe the contact book; investors cannot read it", async () => {
    await expect(ops.crm.contacts.deleteAll()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.contacts.all()).toHaveLength(1);

    await expect(investor.crm.contacts.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Internal roles keep access.
    expect((await ops.crm.contacts.list()).map((c) => c.id)).toEqual([ids.contactId]);
  });
});
