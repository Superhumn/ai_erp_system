import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { legalCases } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// appRouter.legalCases used to reach for `(db as any)._.session.client`, which drizzle-orm never
// exposes, so list() always returned [] and create()/update() always threw. It now goes through
// Drizzle against the `legalCases` table and defaults companyId to the caller's home entity.

const rows = [{ id: 1, title: "Trademark opposition" }];
const orderBy = vi.fn().mockResolvedValue(rows);
const where = vi.fn(() => ({ orderBy }));
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));
const values = vi.fn().mockResolvedValue([{ insertId: 42 }]);
const insert = vi.fn(() => ({ values }));
const updateWhere = vi.fn().mockResolvedValue(undefined);
const set = vi.fn(() => ({ where: updateWhere }));
const update = vi.fn(() => ({ set }));
const fakeDb = { select, insert, update };

vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeDb),
  getUserEntityAccessCompanyIds: vi.fn(async () => []),
  getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
  getCompanyById: vi.fn().mockResolvedValue(undefined),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
}));

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "legal",
      companyId: 3,
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

describe("legalCases router (Drizzle-backed)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list selects from the legalCases table and returns the rows", async () => {
    const caller = appRouter.createCaller(ctxFor({ regionScope: "global" }));
    const result = await caller.legalCases.list();
    expect(result).toEqual(rows);
    expect(from).toHaveBeenCalledWith(legalCases);
    // Global scope + no filters → no WHERE clause.
    expect(where).toHaveBeenCalledWith(undefined);
  });

  it("list scopes an entity-scoped user to their companyId", async () => {
    const caller = appRouter.createCaller(ctxFor({ regionScope: "entity", companyId: 3 }));
    await caller.legalCases.list({ status: "open" });
    expect(from).toHaveBeenCalledWith(legalCases);
    expect(where.mock.calls[0][0]).toBeDefined();
  });

  it("create inserts into legalCases with companyId defaulted from the user and dates parsed", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: 7, companyId: 3 }));
    const result = await caller.legalCases.create({
      title: "Trademark opposition",
      type: "trademark",
      filedDate: "2026-01-15",
      nextHearingDate: "",
    });
    expect(result).toEqual({ id: 42, success: true });
    expect(insert).toHaveBeenCalledWith(legalCases);
    const inserted = values.mock.calls[0][0];
    expect(inserted).toMatchObject({
      title: "Trademark opposition",
      type: "trademark",
      status: "open",
      priority: "medium",
      companyId: 3,
      createdBy: 7,
      nextHearingDate: null,
    });
    expect(inserted.filedDate).toBeInstanceOf(Date);
  });

  it("create honours an explicit companyId over the user's home entity", async () => {
    const caller = appRouter.createCaller(ctxFor({ companyId: 3 }));
    await caller.legalCases.create({ title: "X", companyId: 9 });
    expect(values.mock.calls[0][0]).toMatchObject({ companyId: 9 });
  });

  it("update sets only the provided fields on the matching row", async () => {
    const caller = appRouter.createCaller(ctxFor({}));
    await caller.legalCases.update({ id: 5, status: "closed" });
    expect(update).toHaveBeenCalledWith(legalCases);
    expect(set).toHaveBeenCalledWith({ status: "closed" });
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-legal role on create", async () => {
    const caller = appRouter.createCaller(ctxFor({ role: "sales" }));
    await expect(caller.legalCases.create({ title: "X" })).rejects.toThrow(/legal access/i);
    expect(insert).not.toHaveBeenCalled();
  });
});
