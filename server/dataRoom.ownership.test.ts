import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers/index";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

vi.mock("./_core/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_core/email")>()),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  isEmailConfigured: () => false,
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "room-user",
    email: "room@example.com",
    name: "Room User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const ROOM = { id: 3, ownerId: 42, name: "Series A" };

describe("dataRoom owner-side mutations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db, "getDataRoomById").mockResolvedValue(ROOM as any);
  });

  it("folders.delete is FORBIDDEN for a non-owner and resolves the room through the folder", async () => {
    vi.spyOn(db, "getDataRoomFolderById").mockResolvedValue({ id: 8, dataRoomId: 3 } as any);
    const del = vi.spyOn(db, "deleteDataRoomFolder").mockResolvedValue(undefined as any);

    const stranger = appRouter.createCaller(ctxFor({ id: 7 }));
    await expect(stranger.dataRoom.folders.delete({ id: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(del).not.toHaveBeenCalled();

    const owner = appRouter.createCaller(ctxFor({ id: 42 }));
    await expect(owner.dataRoom.folders.delete({ id: 8 })).resolves.toEqual({ success: true });
    expect(del).toHaveBeenCalledWith(8);
  });

  it("documents.upload / links.create / invitations.create refuse a room the caller does not own", async () => {
    const stranger = appRouter.createCaller(ctxFor({ id: 7 }));
    const createDoc = vi.spyOn(db, "createDataRoomDocument").mockResolvedValue({ id: 1 } as any);
    const createLink = vi.spyOn(db, "createDataRoomLink").mockResolvedValue({ id: 1 } as any);
    const createInvite = vi.spyOn(db, "createDataRoomInvitation").mockResolvedValue({ id: 1 } as any);

    await expect(stranger.dataRoom.documents.upload({
      dataRoomId: 3, name: "deck.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 3, base64Content: "YWJj",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stranger.dataRoom.links.create({ dataRoomId: 3, name: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stranger.dataRoom.invitations.create({ dataRoomId: 3, email: "vc@fund.test" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(createDoc).not.toHaveBeenCalled();
    expect(createLink).not.toHaveBeenCalled();
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("admins pass the owner gate on child-row mutations", async () => {
    vi.spyOn(db, "getDataRoomLinkById").mockResolvedValue({ id: 5, dataRoomId: 3 } as any);
    const upd = vi.spyOn(db, "updateDataRoomLink").mockResolvedValue(undefined as any);

    const admin = appRouter.createCaller(ctxFor({ id: 999, role: "admin" }));
    await expect(admin.dataRoom.links.update({ id: 5, isActive: false })).resolves.toEqual({ success: true });
    expect(upd).toHaveBeenCalledWith(5, { isActive: false });
  });

  it("returns NOT_FOUND when the child row does not exist", async () => {
    vi.spyOn(db, "getDataRoomInvitationById").mockResolvedValue(null as any);
    const owner = appRouter.createCaller(ctxFor({ id: 42 }));
    await expect(owner.dataRoom.invitations.revoke({ id: 123 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("dataRoom.submitInvestment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("notifies the room's owner rather than user 1", async () => {
    vi.spyOn(db, "getDataRoomById").mockResolvedValue({ ...ROOM, ownerId: 58 } as any);
    vi.spyOn(db, "createInvestmentCommitment").mockResolvedValue({ id: 11 } as any);
    const notify = vi.spyOn(db, "createNotification").mockResolvedValue({ id: 1 } as any);

    const anon = appRouter.createCaller({ user: null, req: { protocol: "https", headers: {} } as any, res: {} as any });
    const result = await anon.dataRoom.submitInvestment({
      dataRoomId: 3, investorName: "Jane", investorEmail: "jane@fund.test", investmentAmount: "250000",
    });
    expect(result.id).toBe(11);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 58 }));
  });
});
