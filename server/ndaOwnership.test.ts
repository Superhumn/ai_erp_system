import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// nda.documents.{list,upload,update,delete}, nda.signatures.{list,getById,revoke,auditLog} had no
// ownership check on the data room, unlike the sibling dataRoom procedures. Any signed-in user
// could read or revoke another owner's NDA signatures. They now enforce owner-or-admin.

const OWNER = 10;
const STRANGER = 11;

vi.mock("./db", () => ({
  getDataRoomById: vi.fn(async (id: number) => (id === 1 ? { id: 1, ownerId: 10, name: "Room" } : null)),
  getNdaDocuments: vi.fn(async () => [{ id: 5 }]),
  getNdaDocumentById: vi.fn(async (id: number) => (id === 5 ? { id: 5, dataRoomId: 1 } : null)),
  createNdaDocument: vi.fn(async () => ({ id: 6 })),
  updateNdaDocument: vi.fn(async () => undefined),
  deleteNdaDocument: vi.fn(async () => undefined),
  getNdaSignatures: vi.fn(async () => [{ id: 8 }]),
  getNdaSignatureById: vi.fn(async (id: number) => (id === 8 ? { id: 8, dataRoomId: 1, status: "signed" } : null)),
  updateNdaSignature: vi.fn(async () => undefined),
  createNdaAuditLog: vi.fn(async () => undefined),
  getNdaAuditLogs: vi.fn(async () => []),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://storage.test/${key}` })),
}));

import * as db from "./db";
import { storagePut } from "./storage";

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: STRANGER,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "user",
      companyId: null,
      regionScope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("nda ownership checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signatures.list is FORBIDDEN for a non-owner", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: STRANGER }));
    await expect(caller.nda.signatures.list({ dataRoomId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getNdaSignatures).not.toHaveBeenCalled();
  });

  it("signatures.list works for the owner and for an admin", async () => {
    await expect(appRouter.createCaller(ctxFor({ id: OWNER })).nda.signatures.list({ dataRoomId: 1 })).resolves.toEqual([{ id: 8 }]);
    await expect(appRouter.createCaller(ctxFor({ id: 99, role: "admin" })).nda.signatures.list({ dataRoomId: 1 })).resolves.toEqual([{ id: 8 }]);
  });

  it("signatures.revoke resolves the room through the signature and rejects a non-owner", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: STRANGER }));
    await expect(caller.nda.signatures.revoke({ id: 8, reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateNdaSignature).not.toHaveBeenCalled();
    expect(db.createNdaAuditLog).not.toHaveBeenCalled();
  });

  it("signatures.revoke works for the owner", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: OWNER }));
    await expect(caller.nda.signatures.revoke({ id: 8, reason: "x" })).resolves.toEqual({ success: true });
    expect(db.updateNdaSignature).toHaveBeenCalledWith(8, expect.objectContaining({ status: "revoked" }));
  });

  it("signatures.getById returns NOT_FOUND for an unknown signature", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: OWNER }));
    await expect(caller.nda.signatures.getById({ id: 404 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("documents.delete resolves the room through the document and rejects a non-owner", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: STRANGER }));
    await expect(caller.nda.documents.delete({ id: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.deleteNdaDocument).not.toHaveBeenCalled();
  });

  it("documents.update works for the owner", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: OWNER }));
    await expect(caller.nda.documents.update({ id: 5, isActive: false })).resolves.toEqual({ success: true });
    expect(db.updateNdaDocument).toHaveBeenCalledWith(5, { isActive: false });
  });

  it("documents.upload is FORBIDDEN for a non-owner and never touches storage", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: STRANGER }));
    await expect(
      caller.nda.documents.upload({ dataRoomId: 1, name: "nda.pdf", fileContent: Buffer.from("x").toString("base64") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storagePut).not.toHaveBeenCalled();
    expect(db.createNdaDocument).not.toHaveBeenCalled();
  });

  it("documents.upload works for the owner", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: OWNER }));
    const result = await caller.nda.documents.upload({ dataRoomId: 1, name: "nda.pdf", fileContent: Buffer.from("x").toString("base64") });
    expect(result).toMatchObject({ id: 6 });
    expect(db.createNdaDocument).toHaveBeenCalledWith(expect.objectContaining({ dataRoomId: 1, name: "nda.pdf", uploadedBy: OWNER }));
  });

  it("documents.list is FORBIDDEN for a non-owner", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: STRANGER }));
    await expect(caller.nda.documents.list({ dataRoomId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getNdaDocuments).not.toHaveBeenCalled();
  });
});
