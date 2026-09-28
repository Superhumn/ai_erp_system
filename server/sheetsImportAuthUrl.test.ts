import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

import { appRouter } from "./routers";
import { verifySignedOAuthState } from "./_core/crypto";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "u7",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "ops",
      companyId: 1,
      regionScope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("sheetsImport.getAuthUrl", () => {
  const prevSecret = process.env.JWT_SECRET;
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-123";
    process.env.JWT_SECRET = "test-secret-for-oauth-state-signing";
  });
  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  });

  it("requests incremental authorization and carries a same-origin returnTo in the signed state", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const { url, error } = await caller.sheetsImport.getAuthUrl({ returnTo: "/operations/document-import" });
    expect(error).toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("include_granted_scopes")).toBe("true");
    expect(parsed.searchParams.get("scope")).toContain("drive.readonly");
    const state = verifySignedOAuthState(parsed.searchParams.get("state")!);
    expect(state).toMatchObject({ userId: 7, provider: "google", returnTo: "/operations/document-import" });
  });

  it("drops a returnTo that is not a same-origin path", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const { url } = await caller.sheetsImport.getAuthUrl({ returnTo: "//evil.example.com/phish" });
    const state = verifySignedOAuthState(new URL(url!).searchParams.get("state")!);
    expect(state).not.toHaveProperty("returnTo");
  });

  it("still works with no input, defaulting to the callback's own landing page", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const { url } = await caller.sheetsImport.getAuthUrl();
    const state = verifySignedOAuthState(new URL(url!).searchParams.get("state")!);
    expect(state).toMatchObject({ userId: 7 });
    expect(state).not.toHaveProperty("returnTo");
  });
});
