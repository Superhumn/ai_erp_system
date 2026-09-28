import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// integrations.shopify.disconnect / testConnection were protectedProcedure, so any signed-in user
// could wipe a store's access token or probe its connection. Every other procedure in the
// integrations router is admin-only; these two now are as well. initiateOAuth stays protected.

vi.mock("./db", () => ({
  updateShopifyStore: vi.fn(async () => undefined),
  createSyncLog: vi.fn(async () => undefined),
  getShopifyStoreById: vi.fn(async () => null),
}));

import * as db from "./db";

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: 5,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "user",
      companyId: 1,
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

describe("integrations.shopify admin gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["user", "ops", "sales", "finance"] as const)("disconnect is FORBIDDEN for role %s", async (role) => {
    const caller = appRouter.createCaller(ctxFor({ role }));
    await expect(caller.integrations.shopify.disconnect({ storeId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateShopifyStore).not.toHaveBeenCalled();
    expect(db.createSyncLog).not.toHaveBeenCalled();
  });

  it("testConnection is FORBIDDEN for a non-admin", async () => {
    const caller = appRouter.createCaller(ctxFor({ role: "ops" }));
    await expect(caller.integrations.shopify.testConnection({ storeId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getShopifyStoreById).not.toHaveBeenCalled();
  });

  it("disconnect disables the store and clears its token for an admin", async () => {
    const caller = appRouter.createCaller(ctxFor({ role: "admin" }));
    await expect(caller.integrations.shopify.disconnect({ storeId: 1 })).resolves.toEqual({ success: true });
    expect(db.updateShopifyStore).toHaveBeenCalledWith(1, { isEnabled: false, accessToken: null });
  });

  it("testConnection reaches the store lookup for an admin", async () => {
    const caller = appRouter.createCaller(ctxFor({ role: "admin" }));
    // Store mock returns null → BAD_REQUEST, which proves the admin gate was passed.
    await expect(caller.integrations.shopify.testConnection({ storeId: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.getShopifyStoreById).toHaveBeenCalledWith(1);
  });
});
