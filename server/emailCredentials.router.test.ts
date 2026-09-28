import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers/index";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "cred-user",
    email: "cred@example.com",
    name: "Cred User",
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

describe("emailCredentials.schedules ownership", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("delete refuses a schedule whose credential belongs to someone else", async () => {
    vi.spyOn(db, "getScheduledScanById").mockResolvedValue({ id: 5, credentialId: 10 } as any);
    vi.spyOn(db, "getEmailCredentialById").mockResolvedValue({ id: 10, userId: 99 } as any);
    const del = vi.spyOn(db, "deleteScheduledScan").mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(ctxFor({ id: 42 }));
    await expect(caller.emailCredentials.schedules.delete({ id: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(del).not.toHaveBeenCalled();
  });

  it("update refuses a schedule whose credential belongs to someone else", async () => {
    vi.spyOn(db, "getScheduledScanById").mockResolvedValue({ id: 5, credentialId: 10 } as any);
    vi.spyOn(db, "getEmailCredentialById").mockResolvedValue({ id: 10, userId: 99 } as any);
    const upd = vi.spyOn(db, "updateScheduledScan").mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(ctxFor({ id: 42 }));
    await expect(caller.emailCredentials.schedules.update({ id: 5, isEnabled: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(upd).not.toHaveBeenCalled();
  });

  it("update/delete work for the credential owner", async () => {
    vi.spyOn(db, "getScheduledScanById").mockResolvedValue({ id: 5, credentialId: 10 } as any);
    vi.spyOn(db, "getEmailCredentialById").mockResolvedValue({ id: 10, userId: 42 } as any);
    const upd = vi.spyOn(db, "updateScheduledScan").mockResolvedValue(undefined as any);
    const del = vi.spyOn(db, "deleteScheduledScan").mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(ctxFor({ id: 42 }));
    await expect(caller.emailCredentials.schedules.update({ id: 5, isEnabled: false })).resolves.toEqual({ success: true });
    expect(upd).toHaveBeenCalledWith(5, expect.objectContaining({ isEnabled: false }));
    await expect(caller.emailCredentials.schedules.delete({ id: 5 })).resolves.toEqual({ success: true });
    expect(del).toHaveBeenCalledWith(5);
  });

  it("list without credentialId returns only schedules for the caller's credentials", async () => {
    vi.spyOn(db, "getEmailCredentials").mockResolvedValue([{ id: 10 }] as any);
    vi.spyOn(db, "getScheduledScans").mockResolvedValue([
      { id: 1, credentialId: 10 },
      { id: 2, credentialId: 11 },
    ] as any);

    const caller = appRouter.createCaller(ctxFor({ id: 42 }));
    const rows = await caller.emailCredentials.schedules.list({});
    expect(rows.map((r) => r.id)).toEqual([1]);
  });
});
