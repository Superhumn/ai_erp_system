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
  tasks: Table<Row>;
  taskLogs: Table<Row>;
  campaigns: Table<Row>;
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
    tasks: table<Row>(),
    taskLogs: table<Row>(),
    campaigns: table<Row>(),
    videos: table<Row>(),
    posts: table<Row>(),
    credentials: table<Row>(),
    raw: {
      email_sequences: table<Row>(),
      email_sequence_steps: table<Row>(),
      brand_ambassadors: table<Row>(),
      brand_ambassador_activities: table<Row>(),
    },
    auditLogs: [],
  };
  const RAW_DEFAULTS: Record<string, Row> = {
    email_sequences: { id: 0, status: "draft", totalContacts: 0 },
    email_sequence_steps: { id: 0, delayDays: 1 },
    brand_ambassadors: { id: 0, stage: "prospect", priority: "medium", currency: "USD" },
    brand_ambassador_activities: { id: 0 },
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

vi.mock("../_core/socialPublisher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/socialPublisher")>();
  return { ...actual, publishToPlatform: vi.fn() };
});

import * as db from "../db";
import { publishToPlatform } from "../_core/socialPublisher";
import { appRouter } from "../routers";

const state = (db as unknown as { __state: State }).__state;

const SALES_ID = 10;
const sales = appRouter.createCaller(ctxFor("sales", { id: SALES_ID, name: "Sam Sales", email: "sales@example.com" }));
const admin = appRouter.createCaller(ctxFor("admin", { id: 1, name: "Admin User", email: "admin@example.com" }));
const ops = appRouter.createCaller(ctxFor("ops", { id: 20, email: "ops@example.com" }));
const otherSales = appRouter.createCaller(ctxFor("sales", { id: 11, email: "sales2@example.com" }));
const investor = appRouter.createCaller(ctxFor("investor", { id: 30, email: "investor@example.com" }));

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

    const req = await sales.crm.deals.create({
      pipelineId: ids.pipelineId, contactId: ids.contactId, stage: "discovery", amount: "25000", source: "event", notes: "Regional launch",
    });
    ids.taskId = req.taskId;
    expect(req).toEqual({ taskId: ids.taskId, pendingApproval: true, company: "Acme Foods" });
    expect(state.tasks.get(ids.taskId)).toMatchObject({ taskType: "create_crm_deal", status: "pending_approval", priority: "medium" });
    expect(JSON.parse(state.tasks.get(ids.taskId)!.taskData)).toEqual({
      pipelineId: ids.pipelineId, contactId: ids.contactId, company: "Acme Foods", stage: "discovery", amount: "25000", source: "event", notes: "Regional launch", assignedTo: SALES_ID,
    });
    expect(await sales.crm.deals.list()).toEqual([]); // nothing until approved

    // A second request for the same company is blocked while one is pending.
    await expect(sales.crm.deals.create({ pipelineId: ids.pipelineId, contactId: ids.contactId, stage: "discovery" }))
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

    // And now that the deal exists, another request for the company is rejected outright.
    await expect(sales.crm.deals.create({ pipelineId: ids.pipelineId, contactId: ids.contactId, stage: "discovery" }))
      .rejects.toMatchObject({ code: "CONFLICT", message: `A deal already exists for "Acme Foods" (deal #${ids.dealId}).` });
  });

  it("3b. the deal moves through the stages to won and the pipeline summary reflects it", async () => {
    expect(await sales.crm.deals.getStats({ pipelineId: ids.pipelineId })).toEqual({
      total: 1, open: 1, openValue: "25000.00", won: 0, wonValue: 0, lost: 0,
    });

    for (const [stage, probability] of [["proposal", 40], ["negotiation", 70], ["closed_won", 100]] as const) {
      expect(await sales.crm.deals.moveStage({ id: ids.dealId, stage, probability })).toEqual({ success: true });
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

  it("4a. an email sequence is built with ordered steps (no enroll procedure exists)", async () => {
    ids.sequenceId = (await sales.emailSequences.create({ name: "Wholesale nurture", description: "3-touch follow-up" })).id;
    expect(ids.sequenceId).toBeGreaterThan(0);

    ids.stepIds.push((await sales.emailSequences.addStep({ sequenceId: ids.sequenceId, subject: "Thanks for meeting", body: "Great to meet you.", delayDays: 0 })).id);
    ids.stepIds.push((await sales.emailSequences.addStep({ sequenceId: ids.sequenceId, subject: "Samples on the way", body: "Tracking inside.", delayDays: 3 })).id);
    ids.stepIds.push((await sales.emailSequences.addStep({ sequenceId: ids.sequenceId, subject: "Any questions?", body: "Happy to help.", delayDays: 7 })).id);

    const seq = await sales.emailSequences.get({ id: ids.sequenceId });
    expect(seq).toMatchObject({ id: ids.sequenceId, userId: SALES_ID, name: "Wholesale nurture", status: "draft", totalContacts: 0 });
    expect(seq.steps.map((s) => [s.stepOrder, s.subject, s.delayDays])).toEqual([
      [1, "Thanks for meeting", 0], [2, "Samples on the way", 3], [3, "Any questions?", 7],
    ]);

    await sales.emailSequences.updateStep({ stepId: ids.stepIds[1], delayDays: 2 });
    await sales.emailSequences.update({ id: ids.sequenceId, status: "active" });
    const list = await sales.emailSequences.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ids.sequenceId, status: "active", stepCount: 3 });
    expect(list[0].steps.find((s: Row) => s.id === ids.stepIds[1])).toMatchObject({ delayDays: 2 });

    // Sequences are private to their author.
    expect(await otherSales.emailSequences.list()).toEqual([]);
    await expect(otherSales.emailSequences.get({ id: ids.sequenceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(otherSales.emailSequences.updateStep({ stepId: ids.stepIds[0], subject: "hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(otherSales.emailSequences.deleteStep({ stepId: ids.stepIds[0] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.raw.email_sequence_steps.get(ids.stepIds[0])?.subject).toBe("Thanks for meeting");

    // No enroll/contact-assignment procedure exists on emailSequences.
    expect(Object.keys(appRouter._def.procedures).filter((p) => p.startsWith("emailSequences.")).sort()).toEqual([
      "emailSequences.addStep", "emailSequences.create", "emailSequences.delete", "emailSequences.deleteStep",
      "emailSequences.get", "emailSequences.list", "emailSequences.update", "emailSequences.updateStep",
    ]);
  });

  it("4b. a campaign is created, targeted and scheduled (no recipient/send procedure exists)", async () => {
    ids.campaignId = (await sales.crm.campaigns.create({
      name: "Fall wholesale launch", subject: "New fall SKUs", bodyHtml: "<p>Hi {{firstName}}</p>", bodyText: "Hi",
      type: "announcement", targetContactTypes: JSON.stringify(["prospect"]), targetPipelineStages: JSON.stringify(["new", "contacted"]),
    })).id;

    let [campaign] = await sales.crm.campaigns.list({ status: "draft" });
    expect(campaign).toMatchObject({
      id: ids.campaignId, name: "Fall wholesale launch", subject: "New fall SKUs", type: "announcement", status: "draft",
      createdBy: SALES_ID, totalRecipients: 0, sentCount: 0, targetContactTypes: '["prospect"]',
    });
    expect(state.auditLogs.at(-1)).toMatchObject({ action: "create", entityType: "crm_campaign", entityId: ids.campaignId, entityName: "Fall wholesale launch" });

    const scheduledAt = new Date("2026-10-05T14:00:00.000Z");
    expect(await sales.crm.campaigns.update({ id: ids.campaignId, status: "scheduled", scheduledAt })).toEqual({ success: true });
    [campaign] = await sales.crm.campaigns.list({ status: "scheduled" });
    expect(campaign).toMatchObject({ id: ids.campaignId, status: "scheduled" });
    expect(campaign.scheduledAt).toEqual(scheduledAt);
    expect(await sales.crm.campaigns.list({ status: "draft" })).toEqual([]);
    expect((await sales.crm.campaigns.list({ type: "announcement" })).map((c) => c.id)).toEqual([ids.campaignId]);

    // The router only exposes list/create/update: no recipients, no send, no per-recipient status.
    expect(Object.keys(appRouter._def.procedures).filter((p) => p.startsWith("crm.campaigns.")).sort()).toEqual([
      "crm.campaigns.create", "crm.campaigns.list", "crm.campaigns.update",
    ]);
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
