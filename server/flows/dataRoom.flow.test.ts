/**
 * Flow test — data room, NDA, investor portal and legal cases.
 *
 * Runs the real dataRoom / nda / investorPortal / investorUpdates /
 * notifications / legalCases routers over one in-memory store. Storage, email
 * and the visitor session cookie are mocked and asserted. legalCases talks to
 * Drizzle directly, so the store also answers Drizzle-shaped queries.
 */
import { describe, it, expect, vi } from "vitest";
import { ctxFor } from "./_harness";
import type { TrpcContext } from "../_core/context";
import { legalCases } from "../../drizzle/schema";

type Row = { id: number } & Record<string, any>;

const { store, fakeDb } = await vi.hoisted(async () => {
  const { table } = await import("./_harness");
  const { SQL, StringChunk, Param, Column, getTableName, getTableColumns } = await import("drizzle-orm");
  type Row = { id: number } & Record<string, any>;
  type Tok = { k: "s"; v: string } | { k: "c"; col: any } | { k: "p"; v: unknown } | { k: "q"; sql: any } | { k: "a"; items: unknown[] };

  const tables = new Map<string, ReturnType<typeof table<Row>>>();
  const T = (name: string) => { let t = tables.get(name); if (!t) { t = table<Row>(); tables.set(name, t); } return t; };
  const store = {
    rows: (tbl: object) => T(getTableName(tbl as any)),
    // Tables the mocked db helpers keep (no Drizzle involved).
    dataRooms: table<Row>(), folders: table<Row>(), documents: table<Row>(), links: table<Row>(), invitations: table<Row>(),
    visitors: table<Row>(), views: table<Row>(), notifications: table<Row>(), commitments: table<Row>(),
    ndaDocuments: table<Row>(), ndaSignatures: table<Row>(), ndaAudit: table<Row>(),
    stakeholders: table<Row>(), teamInvites: table<Row>(), equityGrants: table<Row>(), shareClasses: table<Row>(), companies: table<Row>(),
    investorUpdates: table<Row>(), auditLogs: table<Row>(),
  };

  // ---- minimal Drizzle-shaped engine (single table: select / insert / update) ----
  const keyCache = new Map<object, Map<unknown, string>>();
  const colKey = (col: any) => {
    let m = keyCache.get(col.table);
    if (!m) { m = new Map(); for (const [k, c] of Object.entries(getTableColumns(col.table))) m.set(c, k); keyCache.set(col.table, m); }
    return m.get(col)!;
  };
  const colVal = (col: any, row: Row) => row[colKey(col)];
  function toks(node: any): Tok[] {
    const out: Tok[] = [];
    for (const ch of node.queryChunks) {
      if (ch instanceof StringChunk) { const v = ch.value.join("").trim().toLowerCase(); if (v) out.push({ k: "s", v }); }
      else if (ch instanceof Column) out.push({ k: "c", col: ch });
      else if (ch instanceof Param) out.push({ k: "p", v: ch.value });
      else if (ch instanceof SQL) out.push({ k: "q", sql: ch });
      else if (Array.isArray(ch)) out.push({ k: "a", items: ch });
      else throw new Error(`fake drizzle: unsupported chunk ${ch?.constructor?.name}`);
    }
    return out;
  }
  const looseEq = (a: unknown, b: unknown) => (a == null || b == null ? a == null && b == null : String(a) === String(b));
  function evalNode(node: any, row: Row): boolean {
    if (node == null) return true;
    const t = toks(node);
    const val = (tok: Tok): unknown => (tok.k === "c" ? colVal(tok.col, row) : tok.k === "p" ? tok.v : undefined);
    if (t.length === 1 && t[0].k === "q") return evalNode(t[0].sql, row);
    if (t.length === 3 && t[0].k === "s" && t[0].v === "(" && t[1].k === "q" && t[2].k === "s" && t[2].v === ")") return evalNode(t[1].sql, row);
    if (t.length >= 3 && t.every((x, i) => (i % 2 === 0 ? x.k === "q" : x.k === "s" && (x.v === "and" || x.v === "or")))) {
      const vals = t.filter((_, i) => i % 2 === 0).map((x) => evalNode((x as { sql: any }).sql, row));
      return (t[1] as { v: string }).v === "and" ? vals.every(Boolean) : vals.some(Boolean);
    }
    if (t.length === 3 && t[1].k === "s") {
      const l = val(t[0]); const r = t[2];
      if (t[1].v === "=") return looseEq(l, val(r));
      if (t[1].v === "in") return (r.k === "a" ? r.items : [val(r)]).some((v: unknown) => looseEq(l, v instanceof Param ? v.value : v));
    }
    if (t.length === 2 && t[0].k === "c" && t[1].k === "s" && t[1].v === "is null") return colVal(t[0].col, row) == null;
    throw new Error(`fake drizzle: unsupported where shape "${t.map((x) => (x.k === "s" ? x.v : x.k.toUpperCase())).join(" ")}"`);
  }
  const thenable = <V,>(run: () => V) => ({ then: (res: any, rej: any) => Promise.resolve().then(run).then(res, rej) });
  const fakeDb: any = {
    select() {
      const st = { from: "", where: undefined as any, desc: false };
      const chain: any = {
        from(tbl: any) { st.from = getTableName(tbl); return chain; },
        where(c: any) { st.where = c; return chain; },
        orderBy(term: any) { st.desc = term instanceof SQL && toks(term).some((x) => x.k === "s" && x.v === "desc"); return chain; },
        limit() { return chain; },
        ...thenable(() => { const rows = T(st.from).filter((r) => evalNode(st.where, r)); return st.desc ? rows.reverse() : rows; }),
      };
      return chain;
    },
    insert(tbl: any) {
      return { values: (v: Row) => { const id = T(getTableName(tbl)).insert(v).id; return { $returningId: async () => [{ id }], ...thenable(() => [{ insertId: id, affectedRows: 1 }]) }; } };
    },
    update(tbl: any) {
      const name = getTableName(tbl);
      return { set: (patch: Row) => ({ where: (c: any) => thenable(() => { for (const r of T(name).filter((r) => evalNode(c, r))) T(name).update(r.id, patch); return [{ affectedRows: 1 }]; }) }) };
    },
  };
  return { store, fakeDb };
});

vi.mock("../db", () => {
  const byDesc = (rows: Row[]) => rows.slice().sort((a, b) => b.id - a.id);
  return {
    getDb: vi.fn(async () => fakeDb),
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    getCompanyIdsInRegion: vi.fn(async () => []),
    getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
    createAuditLog: vi.fn(async (d: Row) => { store.auditLogs.insert(d); }),
    getCompanyById: vi.fn(async (id: number) => store.companies.get(id)),
    getCompaniesByIds: vi.fn(async (ids: number[]) => store.companies.filter((c) => ids.includes(c.id))),

    // ---- data rooms ----
    getDataRooms: vi.fn(async (ownerId?: number) => byDesc(store.dataRooms.filter((r) => !ownerId || r.ownerId === ownerId))),
    getDataRoomBySlug: vi.fn(async (slug: string) => store.dataRooms.find((r) => r.slug === slug) || null),
    getDataRoomById: vi.fn(async (id: number) => store.dataRooms.get(id) || null),
    createDataRoom: vi.fn(async (d: Row) => ({ id: store.dataRooms.insert({ status: "active", ...d }).id })),
    updateDataRoom: vi.fn(async (id: number, d: Row) => { store.dataRooms.update(id, d); }),
    getDataRoomFolders: vi.fn(async (dataRoomId: number, parentId?: number | null) =>
      store.folders.filter((f) => f.dataRoomId === dataRoomId && (parentId === undefined || (parentId === null ? f.parentId == null : f.parentId === parentId)))),
    getDataRoomFolderById: vi.fn(async (id: number) => store.folders.get(id) || null),
    createDataRoomFolder: vi.fn(async (d: Row) => ({ id: store.folders.insert({ sortOrder: 0, ...d }).id })),
    getDataRoomDocuments: vi.fn(async (dataRoomId: number, folderId?: number | null) =>
      store.documents.filter((f) => f.dataRoomId === dataRoomId && (folderId === undefined || (folderId === null ? f.folderId == null : f.folderId === folderId)))),
    getDataRoomDocumentById: vi.fn(async (id: number) => store.documents.get(id) || null),
    createDataRoomDocument: vi.fn(async (d: Row) => ({ id: store.documents.insert({ isHidden: false, sortOrder: 0, version: 1, ...d }).id })),
    deleteDataRoomDocument: vi.fn(async (id: number) => { store.documents.remove(id); }),
    getDataRoomLinks: vi.fn(async (dataRoomId: number) => byDesc(store.links.filter((l) => l.dataRoomId === dataRoomId))),
    getDataRoomLinkByCode: vi.fn(async (code: string) => store.links.find((l) => l.linkCode === code) || null),
    createDataRoomLink: vi.fn(async (d: Row) => ({ id: store.links.insert({ isActive: true, viewCount: 0, ...d }).id })),
    updateDataRoomLink: vi.fn(async (id: number, d: Row) => { store.links.update(id, d); }),
    incrementLinkViewCount: vi.fn(async (id: number) => { const l = store.links.get(id)!; store.links.update(id, { viewCount: (l.viewCount ?? 0) + 1 }); }),
    getDataRoomInvitations: vi.fn(async (dataRoomId: number) => byDesc(store.invitations.filter((i) => i.dataRoomId === dataRoomId))),
    getDataRoomInvitationByEmail: vi.fn(async (dataRoomId: number, email: string) =>
      store.invitations.find((i) => i.dataRoomId === dataRoomId && i.email === email.toLowerCase()) || null),
    createDataRoomInvitation: vi.fn(async (d: Row) => ({ id: store.invitations.insert({ status: "pending", ...d }).id })),
    getVisitorByEmail: vi.fn(async (dataRoomId: number, email: string) => store.visitors.find((v) => v.dataRoomId === dataRoomId && v.email === email) || null),
    createDataRoomVisitor: vi.fn(async (d: Row) => ({ id: store.visitors.insert({ accessStatus: "active", totalViews: 0, engagementScore: 0, pagesViewed: 0, totalTimeSpent: 0, ...d }).id })),
    getDataRoomVisitors: vi.fn(async (dataRoomId: number) => store.visitors.filter((v) => v.dataRoomId === dataRoomId)),
    getDataRoomVisitorById: vi.fn(async (id: number) => store.visitors.get(id) || null),
    updateDataRoomVisitor: vi.fn(async (id: number, d: Row) => { store.visitors.update(id, d); }),
    createDocumentView: vi.fn(async (d: Row) => ({ id: store.views.insert(d).id })),
    createInvestmentCommitment: vi.fn(async (d: Row) => ({ id: store.commitments.insert(d).id })),
    getInvestmentCommitments: vi.fn(async (f?: { dataRoomId?: number }) => byDesc(store.commitments.filter((c) => !f?.dataRoomId || c.dataRoomId === f.dataRoomId))),

    // ---- notifications ----
    createNotification: vi.fn(async (d: Row) => store.notifications.insert({ severity: "info", ...d, isRead: false }).id),
    getUserNotifications: vi.fn(async (userId: number, o?: { unreadOnly?: boolean; limit?: number; offset?: number }) =>
      byDesc(store.notifications.filter((n) => n.userId === userId && (!o?.unreadOnly || !n.isRead))).slice(o?.offset || 0, (o?.offset || 0) + (o?.limit || 50))),
    getUnreadNotificationCount: vi.fn(async (userId: number) => store.notifications.filter((n) => n.userId === userId && !n.isRead).length),

    // ---- NDA ----
    getNdaDocuments: vi.fn(async (dataRoomId: number) => byDesc(store.ndaDocuments.filter((d) => d.dataRoomId === dataRoomId))),
    getActiveNdaDocument: vi.fn(async (dataRoomId: number) => byDesc(store.ndaDocuments.filter((d) => d.dataRoomId === dataRoomId && d.isActive))[0] || null),
    getNdaDocumentById: vi.fn(async (id: number) => store.ndaDocuments.get(id) || null),
    createNdaDocument: vi.fn(async (d: Row) => {
      for (const prev of store.ndaDocuments.filter((x) => x.dataRoomId === d.dataRoomId)) store.ndaDocuments.update(prev.id, { isActive: false });
      return { id: store.ndaDocuments.insert({ ...d, isActive: true }).id };
    }),
    createNdaSignature: vi.fn(async (d: Row) => ({ id: store.ndaSignatures.insert({ ...d, status: "signed", signedAt: new Date() }).id })),
    getNdaSignatureById: vi.fn(async (id: number) => store.ndaSignatures.get(id) || null),
    getNdaSignatures: vi.fn(async (dataRoomId: number, o?: { visitorId?: number; status?: string }) =>
      byDesc(store.ndaSignatures.filter((s) => s.dataRoomId === dataRoomId && (!o?.visitorId || s.visitorId === o.visitorId) && (!o?.status || s.status === o.status)))),
    getVisitorNdaSignature: vi.fn(async (dataRoomId: number, email: string) =>
      byDesc(store.ndaSignatures.filter((s) => s.dataRoomId === dataRoomId && s.signerEmail === email && s.status === "signed"))[0] || null),
    createNdaAuditLog: vi.fn(async (d: Row) => ({ id: store.ndaAudit.insert(d).id })),
    linkVisitorToNdaSignature: vi.fn(async (visitorId: number, signatureId: number) => { store.visitors.update(visitorId, { ndaSignatureId: signatureId }); }),

    // ---- investors ----
    getStakeholderById: vi.fn(async (id: number) => store.stakeholders.get(id) || null),
    getStakeholdersByUserId: vi.fn(async (userId: number) => store.stakeholders.filter((s) => s.userId === userId)),
    createTeamInvite: vi.fn(async (d: Row) => ({ id: store.teamInvites.insert(d).id, token: d.token })),
    getEquityGrantsByStakeholder: vi.fn(async (stakeholderId: number) => store.equityGrants.filter((g) => g.stakeholderId === stakeholderId)),
    getEquityGrants: vi.fn(async (companyId?: number) => store.equityGrants.filter((g) => !companyId || g.companyId === companyId)),
    getShareClasses: vi.fn(async (companyId?: number) => store.shareClasses.filter((c) => !companyId || c.companyId === companyId)),
    createInvestorUpdate: vi.fn(async (d: Row) => ({ id: store.investorUpdates.insert({ status: "draft", ...d }).id })),
    getInvestorUpdateById: vi.fn(async (id: number) => store.investorUpdates.get(id)),
    getInvestorUpdates: vi.fn(async (f?: { companyId?: number; status?: string; type?: string }) =>
      byDesc(store.investorUpdates.filter((u) => (!f?.companyId || u.companyId === f.companyId) && (!f?.status || u.status === f.status) && (!f?.type || u.type === f.type)))),
    updateInvestorUpdate: vi.fn(async (id: number, d: Row) => { store.investorUpdates.update(id, d); }),
  };
});

vi.mock("../storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://files.test/${key}` })),
  storageGet: vi.fn(async (key: string) => ({ key, url: `https://files.test/${key}` })),
  storageDelete: vi.fn(),
}));
vi.mock("../_core/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_core/email")>()),
  sendEmail: vi.fn(async () => ({ success: true, messageId: "msg-1" })),
  isEmailConfigured: () => true,
}));
vi.mock("../_core/dataRoomVisitorSession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_core/dataRoomVisitorSession")>()),
  setVisitorSessionCookie: vi.fn(async () => undefined),
}));

import * as db from "../db";
import { storagePut } from "../storage";
import { sendEmail } from "../_core/email";
import { setVisitorSessionCookie } from "../_core/dataRoomVisitorSession";
import { appRouter } from "../routers";

const OWNER_ID = 42;
const owner = appRouter.createCaller(ctxFor("admin", { id: OWNER_ID, name: "Olive Owner", companyId: 1 }));
const userOne = appRouter.createCaller(ctxFor("admin", { id: 1, name: "First Admin", companyId: 1 }));
const stranger = appRouter.createCaller(ctxFor("user", { id: 7, name: "Sam Stranger", companyId: 1 }));
const anonCtx: TrpcContext = {
  ...ctxFor("user"),
  user: null,
  req: { protocol: "https", headers: { "x-forwarded-for": "203.0.113.5", "user-agent": "Mozilla/5.0 (Macintosh)" }, ip: "127.0.0.1" } as unknown as TrpcContext["req"],
};
const visitor = appRouter.createCaller(anonCtx);
const lastEmail = () => vi.mocked(sendEmail).mock.calls.at(-1)![0];

describe("data room + investor flow", () => {
  let roomId: number;
  let folderId: number;
  let documentId: number;
  let linkId: number;
  let linkCode: string;
  let visitorId: number;
  let ndaDocId: number;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it("1. admin creates a room, a folder, uploads a document, creates an expiring share link and invites an investor by email", async () => {
    const created = await owner.dataRoom.create({ name: "Series A", slug: "series-a", requiresEmail: true, description: "Round docs" });
    roomId = created.id;
    expect(created).toEqual({ id: roomId, slug: "series-a" });
    expect(store.dataRooms.get(roomId)).toMatchObject({ name: "Series A", slug: "series-a", ownerId: OWNER_ID, requiresEmail: true, isPublic: false, password: null, watermarkEnabled: false, allowDownload: true });
    await expect(owner.dataRoom.create({ name: "Dup", slug: "series-a" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await owner.dataRoom.list()).map((r) => r.id)).toEqual([roomId]);
    expect(await userOne.dataRoom.list()).toEqual([]);

    folderId = (await owner.dataRoom.folders.create({ dataRoomId: roomId, name: "Financials" })).id;
    expect(store.folders.get(folderId)).toMatchObject({ dataRoomId: roomId, name: "Financials" });

    const upload = await owner.dataRoom.documents.upload({
      dataRoomId: roomId, folderId, name: "deck.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 3, base64Content: Buffer.from("abc").toString("base64"),
    });
    documentId = upload.id;
    expect(storagePut).toHaveBeenCalledTimes(1);
    const [key, bytes, mime] = vi.mocked(storagePut).mock.calls[0];
    expect(key).toMatch(new RegExp(`^dataroom/${roomId}/.+-deck\\.pdf$`));
    expect(Buffer.from(bytes as Buffer).toString()).toBe("abc");
    expect(mime).toBe("application/pdf");
    expect(upload.url).toBe(`https://files.test/${key}`);
    expect(store.documents.get(documentId)).toMatchObject({ dataRoomId: roomId, folderId, name: "deck.pdf", storageType: "s3", storageKey: key, storageUrl: upload.url, uploadedBy: OWNER_ID, fileSize: 3 });

    const link = await owner.dataRoom.links.create({ dataRoomId: roomId, name: "Sequoia Partners", expiresAt, requireEmail: true });
    linkId = link.id; linkCode = link.linkCode;
    expect(linkCode).toBe("sequoia-partners");
    expect(store.links.get(linkId)).toMatchObject({ dataRoomId: roomId, linkCode: "sequoia-partners", expiresAt, createdBy: OWNER_ID, isActive: true, viewCount: 0, password: null, allowDownload: true });

    const invite = await owner.dataRoom.invitations.create({ dataRoomId: roomId, email: "vc@fund.test", name: "Vera", role: "viewer", message: "Take a look", expiresAt });
    expect(invite.inviteCode).toHaveLength(16);
    expect(store.invitations.get(invite.id)).toMatchObject({ dataRoomId: roomId, email: "vc@fund.test", role: "viewer", invitedBy: OWNER_ID, inviteCode: invite.inviteCode, status: "pending" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = lastEmail();
    expect(mail.to).toBe("vc@fund.test");
    expect(mail.subject).toBe("You've been invited to a Data Room: Series A");
    expect(mail.html).toContain(`/share/${invite.inviteCode}`);
    expect(mail.html).toContain("Hello Vera");
    expect(mail.html).toContain("with viewer permissions");
    expect(mail.html).toContain("Take a look");
    expect(mail.html).toContain(`expires on ${expiresAt.toLocaleDateString()}`);
  });

  it("2. a different non-admin user is FORBIDDEN from managing the room's folders, documents and links", async () => {
    await expect(stranger.dataRoom.folders.create({ dataRoomId: roomId, name: "Mine" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stranger.dataRoom.documents.delete({ id: documentId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stranger.dataRoom.links.create({ dataRoomId: roomId, name: "leak" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stranger.dataRoom.getById({ id: roomId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.folders.all()).toHaveLength(1);
    expect(store.documents.all()).toHaveLength(1);
    expect(store.links.all()).toHaveLength(1);
    expect(db.deleteDataRoomDocument).not.toHaveBeenCalled();
  });

  it("3. a visitor opens the link, is asked for an email, gets in, lists the documents, views/downloads one — the OWNER (not user 1) is notified; an expired link is refused", async () => {
    const gated = await visitor.dataRoom.public.accessByLink({ linkCode });
    expect(gated).toEqual({ requiresInfo: true, requiredFields: ["email"], dataRoomId: null, visitorId: null });
    expect(store.visitors.all()).toEqual([]);

    const access = await visitor.dataRoom.public.accessByLink({ linkCode, visitorInfo: { email: "vc@fund.test", name: "Vera", company: "Fund LP" } });
    expect(access).toMatchObject({ dataRoomId: roomId, allowDownload: true, allowPrint: true });
    visitorId = access.visitorId!;
    expect(store.visitors.get(visitorId)).toMatchObject({ dataRoomId: roomId, linkId, email: "vc@fund.test", name: "Vera", company: "Fund LP", ipAddress: "127.0.0.1", userAgent: "Mozilla/5.0 (Macintosh)", totalViews: 1 });
    expect(store.visitors.get(visitorId)!.lastViewedAt).toBeInstanceOf(Date);
    expect(store.links.get(linkId)!.viewCount).toBe(1);
    expect(setVisitorSessionCookie).toHaveBeenCalledTimes(1);
    const [, , payload, ttl] = vi.mocked(setVisitorSessionCookie).mock.calls[0];
    expect(payload).toEqual({ visitorId, linkId, linkCode, dataRoomId: roomId });
    expect(ttl).toBeGreaterThan(6 * 24 * 60 * 60 * 1000); // bounded by the link's expiry

    // Returning with the same email reuses the visitor row.
    await visitor.dataRoom.public.accessByLink({ linkCode, visitorInfo: { email: "vc@fund.test" } });
    expect(store.visitors.all()).toHaveLength(1);
    expect(store.visitors.get(visitorId)!.totalViews).toBe(2);
    expect(store.links.get(linkId)!.viewCount).toBe(2);

    const content = await visitor.dataRoom.public.getContent({ dataRoomId: roomId, visitorId });
    expect(content.room).toMatchObject({ name: "Series A", description: "Round docs", requiresEmail: true });
    expect(content.folders.map((f) => f.name)).toEqual(["Financials"]);
    expect(content.documents.map((d) => d.name)).toEqual(["deck.pdf"]);
    expect(content.visitorPermissions).toEqual({ allowDownload: true, allowPrint: true, role: "viewer" }); // from the invitation
    expect(content.watermark).toBeNull();

    const view = await visitor.dataRoom.public.recordView({ documentId, visitorId, linkId, duration: 130, pagesViewed: [1, 2, 3], downloaded: true });
    expect(store.views.get(view.id)).toMatchObject({ documentId, visitorId, linkId, duration: 130, pagesViewed: [1, 2, 3], downloaded: true, deviceType: "desktop" });
    expect(store.visitors.get(visitorId)).toMatchObject({ engagementScore: 3, pagesViewed: 3, totalTimeSpent: 130 });

    expect(store.notifications.all()).toHaveLength(1);
    expect(store.notifications.all()[0]).toMatchObject({
      userId: OWNER_ID, type: "data_room_view", title: 'Vera is viewing "Series A"', message: "Viewing document: deck.pdf",
      entityType: "data_room", entityId: roomId, severity: "info", link: `/data-rooms/${roomId}`, isRead: false,
    });
    expect(await owner.notifications.unreadCount()).toBe(1);
    expect((await owner.notifications.list())[0]).toMatchObject({ type: "data_room_view" });
    expect(await userOne.notifications.list()).toEqual([]);

    const expired = await owner.dataRoom.links.create({ dataRoomId: roomId, name: "old", expiresAt: new Date(Date.now() - 1000), requireEmail: false });
    await expect(visitor.dataRoom.public.accessByLink({ linkCode: expired.linkCode })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Link has expired" });
    await expect(visitor.dataRoom.public.accessByLink({ linkCode: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("4. NDA: owner uploads it, the visitor signs it publicly, the owner sees the signature; investment interest notifies the OWNER", async () => {
    await expect(stranger.nda.documents.upload({ dataRoomId: roomId, name: "NDA.pdf", fileContent: "YWJj" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const nda = await owner.nda.documents.upload({ dataRoomId: roomId, name: "NDA.pdf", version: "v2", fileContent: Buffer.from("nda").toString("base64"), requiresSignature: true });
    ndaDocId = nda.id;
    expect(vi.mocked(storagePut).mock.calls.at(-1)![0]).toMatch(new RegExp(`^nda/${roomId}/\\d+-NDA\\.pdf$`));
    expect(store.ndaDocuments.get(ndaDocId)).toMatchObject({ dataRoomId: roomId, name: "NDA.pdf", version: "v2", isActive: true, requiresSignature: true, uploadedBy: OWNER_ID, storageUrl: nda.url });

    expect(await visitor.nda.documents.getActive({ dataRoomId: roomId })).toMatchObject({ id: ndaDocId, name: "NDA.pdf" });
    expect(await visitor.nda.signatures.checkSigned({ dataRoomId: roomId, email: "vc@fund.test" })).toEqual({ signed: false, signedAt: undefined, signatureId: undefined });

    vi.mocked(sendEmail).mockClear();
    const signed = await visitor.nda.signatures.sign({
      ndaDocumentId: ndaDocId, dataRoomId: roomId, visitorId, linkId, signerName: "Vera Capital", signerEmail: "vc@fund.test",
      signerCompany: "Fund LP", signatureType: "typed", signatureData: "Vera Capital", consentCheckbox: true,
    });
    expect(signed.success).toBe(true);
    const sig = store.ndaSignatures.get(signed.id)!;
    expect(sig).toMatchObject({
      ndaDocumentId: ndaDocId, dataRoomId: roomId, visitorId, linkId, signerName: "Vera Capital", signerEmail: "vc@fund.test", signerCompany: "Fund LP",
      signatureType: "typed", signatureData: "Vera Capital", ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0 (Macintosh)", consentCheckbox: true, status: "signed",
    });
    expect(store.ndaAudit.all()).toEqual([expect.objectContaining({ signatureId: sig.id, action: "completed_signature", ipAddress: "203.0.113.5", details: { signatureType: "typed" } })]);
    expect(store.visitors.get(visitorId)).toMatchObject({ ndaIpAddress: "203.0.113.5", ndaSignatureId: sig.id });
    expect(store.visitors.get(visitorId)!.ndaAcceptedAt).toBeInstanceOf(Date);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(lastEmail()).toMatchObject({ to: "vc@fund.test", subject: "Your Signed NDA for Series A" });
    expect(lastEmail().html).toContain(`Signature ID:</strong> ${sig.id}`);

    // Signing an NDA that belongs to another room is refused.
    await expect(visitor.nda.signatures.sign({
      ndaDocumentId: ndaDocId, dataRoomId: roomId + 1, signerName: "X", signerEmail: "x@y.test", signatureType: "typed", signatureData: "X", consentCheckbox: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await visitor.nda.signatures.checkSigned({ dataRoomId: roomId, email: "vc@fund.test" })).toMatchObject({ signed: true, signatureId: sig.id });
    const listed = await owner.nda.signatures.list({ dataRoomId: roomId });
    expect(listed.map((s) => s.id)).toEqual([sig.id]);
    await expect(stranger.nda.signatures.list({ dataRoomId: roomId })).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.mocked(sendEmail).mockClear();
    const interest = await visitor.dataRoom.submitInvestment({ dataRoomId: roomId, investorName: "Vera Capital", investorEmail: "vc@fund.test", investorCompany: "Fund LP", investmentAmount: "250000", instrumentType: "safe" });
    expect(interest.message).toBe("Thank you! We'll be in touch.");
    expect(store.commitments.get(interest.id)).toMatchObject({ dataRoomId: roomId, investorName: "Vera Capital", investmentAmount: "250000", instrumentType: "safe", status: "interested" });
    const notice = store.notifications.all().at(-1)!;
    expect(notice).toMatchObject({ userId: OWNER_ID, type: "system", title: "New investment interest: Vera Capital", message: "Vera Capital (Fund LP) expressed interest in investing $250000" });
    expect(await owner.notifications.unreadCount()).toBe(2);
    expect(await userOne.notifications.unreadCount()).toBe(0);
    expect(lastEmail()).toMatchObject({ to: "vc@fund.test", subject: "Investment Interest Received — Superhumn Inc" });
    expect((await owner.dataRoom.listCommitments({ dataRoomId: roomId })).map((c) => c.id)).toEqual([interest.id]);
  });

  it("5. investor portal: admin invites the stakeholder; admin's update carries the admin's companyId; the linked investor sees sent updates and only their own holdings", async () => {
    store.companies.insert({ id: 1, name: "Superhumn Inc", type: "operating", country: "US" });
    store.companies.insert({ id: 2, name: "Superhumn EU", type: "subsidiary", country: "DE" });
    store.shareClasses.insert({ id: 1, companyId: 1, name: "Common", type: "common", seniorityRank: 1 });
    const vera = store.stakeholders.insert({ companyId: 1, name: "Vera Capital", email: "VC@fund.test", type: "investor", tier: "major", userId: null, accreditedInvestor: true });
    const founder = store.stakeholders.insert({ companyId: 1, name: "Founder", email: "f@co.test", type: "founder", userId: OWNER_ID });
    store.equityGrants.insert({ companyId: 1, stakeholderId: vera.id, shareClassId: 1, shares: "1000", status: "active", grantDate: new Date("2025-01-01") });
    store.equityGrants.insert({ companyId: 1, stakeholderId: founder.id, shareClassId: 1, shares: "9000", status: "active", grantDate: new Date("2024-01-01") });

    const ops = appRouter.createCaller(ctxFor("ops", { id: 3 }));
    await expect(ops.investorPortal.inviteToPortal({ stakeholderId: vera.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(owner.investorPortal.inviteToPortal({ stakeholderId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });

    vi.mocked(sendEmail).mockClear();
    expect(await owner.investorPortal.inviteToPortal({ stakeholderId: vera.id })).toEqual({ success: true, emailSent: true });
    const invite = store.teamInvites.all()[0];
    expect(invite).toMatchObject({ email: "vc@fund.test", name: "Vera Capital", role: "investor", invitedBy: OWNER_ID, linkedStakeholderId: vera.id });
    expect(invite.token).toMatch(/^[0-9a-f]{64}$/);
    expect(invite.expiresAt.getTime() - Date.now()).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(lastEmail()).toMatchObject({ to: "VC@fund.test", subject: "You have access to your investor portal" });
    expect(lastEmail().html).toContain(`/login?invite=${invite.token}`);
    expect(lastEmail().html).toContain("Olive Owner has invited you");

    // The invite is accepted: the stakeholder row is linked to the new user (localAuth does this).
    const INVESTOR_ID = 77;
    store.stakeholders.update(vera.id, { userId: INVESTOR_ID });
    await expect(owner.investorPortal.inviteToPortal({ stakeholderId: vera.id })).rejects.toMatchObject({ code: "CONFLICT" });
    const investor = appRouter.createCaller(ctxFor("investor", { id: INVESTOR_ID, companyId: null }));

    // Updates: created by an admin of entity 1 → stored on entity 1 (regression #420), invisible until sent.
    const update = await owner.investorUpdates.create({ title: "Q3 2026 update", type: "quarterly", period: "Q3 2026", content: "Revenue up 40%", highlights: "New DC" });
    expect(store.investorUpdates.get(update.id)).toMatchObject({ companyId: 1, title: "Q3 2026 update", status: "draft", createdBy: OWNER_ID });
    const euAdmin = appRouter.createCaller(ctxFor("admin", { id: 9, companyId: 2 }));
    const euUpdate = await owner.investorUpdates.create({ companyId: 2, title: "EU only", type: "monthly" });
    expect(store.investorUpdates.get(euUpdate.id)!.companyId).toBe(2);
    await euAdmin.investorUpdates.update({ id: euUpdate.id, status: "sent", sentAt: new Date() });

    expect(await investor.investorPortal.updates()).toEqual([]); // still a draft
    await owner.investorUpdates.update({ id: update.id, status: "sent", sentAt: new Date("2026-10-01") });
    const seen = await investor.investorPortal.updates();
    expect(seen).toEqual([{ id: update.id, title: "Q3 2026 update", period: "Q3 2026", type: "quarterly", content: "Revenue up 40%", highlights: "New DC", sentAt: new Date("2026-10-01") }]);
    await expect(investor.investorPortal.updates({ companyId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" }); // no position in the EU entity
    await expect(stranger.investorPortal.updates()).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Holdings: only Vera's own grant, with ownership derived from everyone's shares.
    const me = await investor.investorPortal.me();
    expect(me.stakeholder).toMatchObject({ id: vera.id, name: "Vera Capital", tier: "major", accreditedInvestor: true });
    expect(me.entity).toEqual({ id: 1, name: "Superhumn Inc", type: "operating", country: "US" });
    expect(me.entities).toEqual([{ id: 1, name: "Superhumn Inc", type: "operating", country: "US" }]);
    expect(me.grants).toHaveLength(1);
    expect(me.grants[0]).toMatchObject({ stakeholderId: vera.id, shares: "1000", shareClass: expect.objectContaining({ name: "Common" }) });
    expect(me).toMatchObject({ sharesOutstanding: 1000, totalSharesOutstanding: 10000, ownershipPct: 10 });
    await expect(owner.investorPortal.me()).rejects.toMatchObject({ code: "NOT_FOUND" }); // admin has no cap-table row
  });

  it("6. legal cases are scoped by entity: legal users create/update, entity-scoped readers only see their own entity's cases", async () => {
    const legal1 = appRouter.createCaller(ctxFor("legal", { id: 11, companyId: 1, regionScope: "entity" }));
    const legal2 = appRouter.createCaller(ctxFor("legal", { id: 12, companyId: 2, regionScope: "entity" }));
    const ops = appRouter.createCaller(ctxFor("ops", { id: 3, companyId: 1 }));

    await expect(ops.legalCases.create({ title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const created = await legal1.legalCases.create({ title: "Trademark opposition", type: "trademark", priority: "high", filedDate: "2026-09-01", opposingParty: "Sweet Co", attorney: "J. Doe" });
    expect(created).toEqual({ id: 1, success: true });
    const row = store.rows(legalCases).get(1)!;
    expect(row).toMatchObject({ companyId: 1, title: "Trademark opposition", type: "trademark", status: "open", priority: "high", opposingParty: "Sweet Co", attorney: "J. Doe", createdBy: 11 });
    expect(row.filedDate).toEqual(new Date("2026-09-01"));
    expect(row.nextHearingDate).toBeUndefined();
    await expect(legal1.legalCases.create({ title: "bad", filedDate: "not-a-date" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await legal2.legalCases.create({ title: "GDPR audit", type: "compliance" });
    expect(store.rows(legalCases).get(2)!.companyId).toBe(2);

    expect((await legal1.legalCases.list()).map((c) => c.title)).toEqual(["Trademark opposition"]);
    expect((await legal2.legalCases.list()).map((c) => c.title)).toEqual(["GDPR audit"]);
    expect((await owner.legalCases.list()).map((c) => c.title)).toEqual(["GDPR audit", "Trademark opposition"]); // global admin, newest first

    expect(await legal1.legalCases.update({ id: 1, status: "resolved", nextHearingDate: "" })).toEqual({ success: true });
    expect(store.rows(legalCases).get(1)).toMatchObject({ status: "resolved", nextHearingDate: null });
    expect(await legal1.legalCases.list({ status: "open" })).toEqual([]);
    expect((await legal1.legalCases.list({ status: "resolved" })).map((c) => c.id)).toEqual([1]);
    expect(await legal1.legalCases.update({ id: 1 })).toEqual({ success: true }); // no-op update
  });
});
