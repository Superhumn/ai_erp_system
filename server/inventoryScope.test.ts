import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Regression coverage for the inventory access boundary (breadth rollout): a non-global user's
// resolved entity allow-list must be forwarded to db.getInventory. If someone reverted
// inventory.list to the old unscoped query, the forwarding assertion below would fail.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  getInventory: vi.fn().mockResolvedValue([]),
  // Scope resolution deps: user 2 belongs to entity 2, which expands to [2, 5] via entity_tree.
  getUserEntityAccessCompanyIds: vi.fn(async (userId: number) => (userId === 2 ? [2] : [])),
  getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => (id === 2 ? [2, 5] : [id])),
  getCompanyById: vi.fn().mockResolvedValue(undefined),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
}));

import * as db from "./db";

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "ops",
      companyId: null,
      regionScope: "entity",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("inventory.list entity scoping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the resolved entity allow-list to getInventory for a non-global user", async () => {
    // user 2 → access [2] → expanded [2,5]
    const caller = appRouter.createCaller(ctxFor({ id: 2, regionScope: "entity" }));
    await caller.inventory.list();

    expect(db.getInventory).toHaveBeenCalledTimes(1);
    const scopeArg = (db.getInventory as any).mock.calls[0][0];
    expect(scopeArg).toMatchObject({ mode: "entity", companyIds: [2, 5] });
  });

  it("passes an unrestricted scope for a global (exec) user", async () => {
    const caller = appRouter.createCaller(ctxFor({ id: 9, regionScope: "global" }));
    await caller.inventory.list();
    const scopeArg = (db.getInventory as any).mock.calls[0][0];
    expect(scopeArg).toMatchObject({ mode: "global", companyIds: "all" });
  });

  it("rejects a non-global user with no home/access entity (FORBIDDEN, not empty)", async () => {
    // user 9 has no access rows and no home company, regionScope 'entity' → empty scope.
    const caller = appRouter.createCaller(ctxFor({ id: 9, companyId: null, regionScope: "entity" }));
    await expect(caller.inventory.list()).rejects.toThrow(/entity scope/i);
    expect(db.getInventory).not.toHaveBeenCalled();
  });
});
