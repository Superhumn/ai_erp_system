import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { filterAccessibleFolders } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(userOverrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "contractor",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...userOverrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("filterAccessibleFolders (pure access rule)", () => {
  const folders = [
    { id: 1, visibleToRoles: ["contractor"] },
    { id: 2, visibleToRoles: ["investor"] },
    { id: 3, visibleToRoles: null },
    { id: 4, visibleToRoles: ["contractor", "vendor"] },
  ];

  it("includes folders whose visibleToRoles contains the role", () => {
    const ids = filterAccessibleFolders(folders, [], "contractor").map((f) => f.id);
    expect(ids).toEqual([1, 4]);
  });

  it("adds individually granted folders (mode allow)", () => {
    const ids = filterAccessibleFolders(folders, [{ folderId: 3, mode: "allow" }], "contractor").map(
      (f) => f.id,
    );
    expect(ids).toEqual([1, 3, 4]);
  });

  it("restrict wins over role-wide visibility", () => {
    const ids = filterAccessibleFolders(folders, [{ folderId: 1, mode: "restrict" }], "contractor").map(
      (f) => f.id,
    );
    expect(ids).toEqual([4]);
  });

  it("grants access to nothing when role matches nothing and no grants", () => {
    expect(filterAccessibleFolders(folders, [], "vendor").map((f) => f.id)).toEqual([4]);
    expect(filterAccessibleFolders(folders, [], "finance")).toEqual([]);
  });
});

describe("dataRoom.contractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getContent returns accessible folders and their non-hidden documents", async () => {
    const ctx = createMockContext({ role: "contractor" });
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(db, "getAccessibleDataRoomFoldersForUser").mockResolvedValue([
      { id: 10 } as any,
      { id: 11 } as any,
    ]);
    vi.spyOn(db, "getDataRoomDocumentsInFolders").mockResolvedValue([
      { id: 100, folderId: 10, isHidden: false } as any,
      { id: 101, folderId: 11, isHidden: true } as any,
    ]);

    const result = await caller.dataRoom.contractor.getContent();

    expect(result.folders.map((f: any) => f.id)).toEqual([10, 11]);
    // Hidden document is filtered out.
    expect(result.documents.map((d: any) => d.id)).toEqual([100]);
  });

  it("getDocument denies a document outside the contractor's accessible folders", async () => {
    const ctx = createMockContext({ role: "contractor" });
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(db, "getDataRoomDocumentById").mockResolvedValue({ id: 100, folderId: 99 } as any);
    vi.spyOn(db, "getAccessibleDataRoomFoldersForUser").mockResolvedValue([{ id: 10 } as any]);

    await expect(caller.dataRoom.contractor.getDocument({ id: 100 })).rejects.toThrow(
      "You do not have access to this document",
    );
  });

  it("getDocument returns a document inside an accessible folder", async () => {
    const ctx = createMockContext({ role: "contractor" });
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(db, "getDataRoomDocumentById").mockResolvedValue({ id: 100, folderId: 10 } as any);
    vi.spyOn(db, "getAccessibleDataRoomFoldersForUser").mockResolvedValue([{ id: 10 } as any]);

    const doc = await caller.dataRoom.contractor.getDocument({ id: 100 });
    expect(doc?.id).toBe(100);
  });

  it("blocks non-contractor external roles from getContent", async () => {
    const ctx = createMockContext({ role: "vendor", linkedVendorId: 1 });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dataRoom.contractor.getContent()).rejects.toThrow("Contractor access required");
  });

  it("allows admin to preview the contractor content", async () => {
    const ctx = createMockContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    vi.spyOn(db, "getAccessibleDataRoomFoldersForUser").mockResolvedValue([]);
    vi.spyOn(db, "getDataRoomDocumentsInFolders").mockResolvedValue([]);

    const result = await caller.dataRoom.contractor.getContent();
    expect(result).toEqual({ folders: [], documents: [] });
  });
});
