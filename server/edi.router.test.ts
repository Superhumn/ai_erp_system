import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers/index";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "edi-user",
    email: "edi@example.com",
    name: "EDI User",
    loginMethod: "manus",
    role: "admin",
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

describe("edi router", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("partners.list forwards the status/partnerType filters the client sends", async () => {
    const spy = vi.spyOn(db, "getEdiTradingPartners").mockResolvedValue([] as any);
    const caller = appRouter.createCaller(ctxFor());
    await caller.edi.partners.list({ status: "active", partnerType: "retailer" });
    expect(spy).toHaveBeenCalledWith({ status: "active", partnerType: "retailer" });
  });

  it("settings.get reads the same row settings.upsert writes (no companyId on either side)", async () => {
    const get = vi.spyOn(db, "getEdiSettings").mockResolvedValue({ id: 1, companyId: null, isaId: "ISA" } as any);
    const upsert = vi.spyOn(db, "upsertEdiSettings").mockResolvedValue({ id: 1 });
    vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(ctxFor());
    await caller.edi.settings.upsert({ isaId: "ISA", gsApplicationCode: "GS" });
    const read = await caller.edi.settings.get();

    expect(upsert.mock.calls[0][0]).not.toHaveProperty("companyId");
    // Previously hard-coded getEdiSettings(1), which never found the companyId=NULL row.
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBeUndefined();
    expect(read?.isaId).toBe("ISA");
  });
});
