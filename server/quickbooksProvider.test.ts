import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";

// Merge-provider env must be in place before ./routers (and its env.ts
// import) loads. vi.hoisted runs ahead of the hoisted static imports.
const savedEnv = vi.hoisted(() => {
  const saved = {
    ACCOUNTING_SYNC_PROVIDER: process.env.ACCOUNTING_SYNC_PROVIDER,
    MERGE_API_KEY: process.env.MERGE_API_KEY,
    MERGE_ACCOUNT_TOKEN: process.env.MERGE_ACCOUNT_TOKEN,
    MERGE_COMPANY_ID: process.env.MERGE_COMPANY_ID,
  };
  process.env.ACCOUNTING_SYNC_PROVIDER = "merge";
  process.env.MERGE_API_KEY = "test-key";
  process.env.MERGE_ACCOUNT_TOKEN = "test-token";
  process.env.MERGE_COMPANY_ID = "2";
  return saved;
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  // Entity scoping
  getUserEntityAccessCompanyIds: vi.fn().mockResolvedValue([]),
  getEntityAndDescendantCompanyIds: vi.fn().mockResolvedValue([]),
  // MERGE_COMPANY_ID (2) must resolve to a real company for merge branches.
  getCompanyById: vi.fn().mockResolvedValue({ id: 2, name: "Test Co" }),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
  // QuickBooks sync
  syncQuickBooksAccountsForCompany: vi.fn().mockResolvedValue({ count: 1, synced: 1 }),
  syncQuickBooksItemsForCompany: vi.fn().mockResolvedValue({ count: 1, synced: 1 }),
  getQuickBooksOAuthToken: vi.fn().mockResolvedValue(null),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/merge", () => ({
  isMergeConfigured: vi.fn(() => true),
  checkMergeConnection: vi.fn().mockResolvedValue({ connected: true, companyName: "Superhumn Inc" }),
  getMergeCompanyInfo: vi.fn().mockResolvedValue({ name: "Superhumn Inc" }),
  getMergeAccounts: vi.fn().mockResolvedValue({
    accounts: [{ companyId: 2, quickbooksAccountId: "35", name: "COGS", active: true }],
  }),
  getMergeItems: vi.fn().mockResolvedValue({ items: [] }),
  getMergeProfitAndLoss: vi.fn().mockResolvedValue({
    report: { months: [{ label: "Jan 2026", income: 100, cogs: 40, expense: 20 }], expenseAccounts: [] },
  }),
}));

import { appRouter } from "./routers";
import * as db from "./db";
import * as merge from "./_core/merge";
import type { TrpcContext } from "./_core/context";

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key as keyof typeof savedEnv];
    else process.env[key] = value;
  }
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCaller(user: { companyId: number | null; regionScope: "entity" | "region" | "global" }) {
  const ctx: TrpcContext = {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "local",
      role: "admin",
      companyId: user.companyId,
      regionScope: user.regionScope,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as unknown as AuthenticatedUser,
    req: { protocol: "https", secure: true, headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quickbooks router — Merge provider branches", () => {
  it("syncAccounts defaults to MERGE_COMPANY_ID and syncs through the scoped upsert", async () => {
    const caller = makeCaller({ companyId: null, regionScope: "global" });

    const result = await caller.quickbooks.syncAccounts({});

    expect(result.success).toBe(true);
    expect(merge.getMergeAccounts).toHaveBeenCalledWith(2);
    expect(db.syncQuickBooksAccountsForCompany).toHaveBeenCalledWith(2, expect.any(Array));
  });

  it("syncAccounts refuses a target other than the linked entity", async () => {
    const caller = makeCaller({ companyId: null, regionScope: "global" });

    await expect(caller.quickbooks.syncAccounts({ companyId: 5 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(db.syncQuickBooksAccountsForCompany).not.toHaveBeenCalled();
  });

  it("syncAccounts refuses a caller scoped away from the linked entity", async () => {
    const caller = makeCaller({ companyId: 3, regionScope: "entity" });

    await expect(caller.quickbooks.syncAccounts({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(merge.getMergeAccounts).not.toHaveBeenCalled();
  });

  it("syncItems enforces the same binding as syncAccounts", async () => {
    const caller = makeCaller({ companyId: null, regionScope: "global" });

    await expect(caller.quickbooks.syncItems({ companyId: 9 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(db.syncQuickBooksItemsForCompany).not.toHaveBeenCalled();
  });

  it("getProfitAndLoss returns not-connected for callers scoped away from the linked entity", async () => {
    const caller = makeCaller({ companyId: 3, regionScope: "entity" });

    const result = await caller.quickbooks.getProfitAndLoss({});

    expect(result).toEqual({ connected: false, months: [] });
    expect(merge.getMergeProfitAndLoss).not.toHaveBeenCalled();
  });

  it("getProfitAndLoss returns the parsed Merge report for in-scope callers", async () => {
    const caller = makeCaller({ companyId: 2, regionScope: "entity" });

    const result = await caller.quickbooks.getProfitAndLoss({});

    expect(merge.checkMergeConnection).toHaveBeenCalled();
    expect(result.connected).toBe(true);
    expect(result.months).toEqual([{ label: "Jan 2026", income: 100, cogs: 40, expense: 20 }]);
  });

  it("getConnectionStatus reports the company name separately from realmId", async () => {
    const caller = makeCaller({ companyId: 2, regionScope: "entity" });

    const status = await caller.quickbooks.getConnectionStatus();

    expect(status).toMatchObject({ connected: true, realmId: null, companyName: "Superhumn Inc", provider: "merge" });
  });

  it("fails closed when MERGE_COMPANY_ID names no existing company", async () => {
    vi.mocked(db.getCompanyById).mockResolvedValue(undefined as any);
    const caller = makeCaller({ companyId: null, regionScope: "global" });

    await expect(caller.quickbooks.syncAccounts({})).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.syncQuickBooksAccountsForCompany).not.toHaveBeenCalled();

    const status = await caller.quickbooks.getConnectionStatus();
    expect(status.connected).toBe(false);

    vi.mocked(db.getCompanyById).mockResolvedValue({ id: 2, name: "Test Co" } as any);
  });

  it("disconnect refuses in Merge mode", async () => {
    const caller = makeCaller({ companyId: 2, regionScope: "entity" });

    await expect(caller.quickbooks.disconnect()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
