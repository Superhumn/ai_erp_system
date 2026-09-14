import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";

// Direct-Intuit provider (the default). Env must be set before ./routers
// (and its env.ts import) loads.
const savedEnv = vi.hoisted(() => {
  const saved = {
    ACCOUNTING_SYNC_PROVIDER: process.env.ACCOUNTING_SYNC_PROVIDER,
    MERGE_API_KEY: process.env.MERGE_API_KEY,
    MERGE_ACCOUNT_TOKEN: process.env.MERGE_ACCOUNT_TOKEN,
    MERGE_COMPANY_ID: process.env.MERGE_COMPANY_ID,
  };
  process.env.ACCOUNTING_SYNC_PROVIDER = "intuit";
  delete process.env.MERGE_API_KEY;
  delete process.env.MERGE_ACCOUNT_TOKEN;
  delete process.env.MERGE_COMPANY_ID;
  return saved;
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  getUserEntityAccessCompanyIds: vi.fn().mockResolvedValue([]),
  getEntityAndDescendantCompanyIds: vi.fn().mockResolvedValue([]),
  getCompanyById: vi.fn().mockResolvedValue(undefined),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
  getQuickBooksOAuthToken: vi.fn().mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    realmId: "9130357",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }),
  syncQuickBooksAccountsForCompany: vi.fn().mockResolvedValue({ count: 1, synced: 1 }),
  syncQuickBooksItemsForCompany: vi.fn().mockResolvedValue({ count: 1, synced: 1 }),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/quickbooks", () => ({
  getQuickBooksAuthUrl: vi.fn(),
  getQuickBooksRedirectUri: vi.fn(() => "https://example.com/cb"),
  refreshQuickBooksToken: vi.fn(),
  getCompanyInfo: vi.fn(),
  getChartOfAccounts: vi.fn().mockResolvedValue({
    data: {
      QueryResponse: {
        Account: [
          {
            Id: "35",
            Name: "Cost of Goods Sold",
            AccountType: "Cost of Goods Sold",
            AccountSubType: "SuppliesMaterialsCogs",
            Classification: "Expense",
            FullyQualifiedName: "Cost of Goods Sold",
            Active: true,
            CurrentBalance: 1200.5,
            CurrencyRef: { value: "USD" },
          },
        ],
      },
    },
  }),
  getQuickBooksItems: vi.fn().mockResolvedValue({
    data: {
      QueryResponse: {
        Item: [
          {
            Id: "9",
            Name: "Widget",
            Sku: "W-1",
            Type: "Inventory",
            UnitPrice: 10,
            PurchaseCost: 4,
            QtyOnHand: 25,
            IncomeAccountRef: { value: "45" },
            ExpenseAccountRef: { value: "35" },
            AssetAccountRef: { value: "81" },
            Active: true,
          },
        ],
      },
    },
  }),
  getProfitAndLoss: vi.fn(),
  parseProfitAndLossReport: vi.fn(),
}));

import { appRouter } from "./routers";
import * as db from "./db";
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

describe("quickbooks router — direct Intuit provider branches", () => {
  it("syncAccounts defaults to the caller's entity and upserts normalized rows", async () => {
    const caller = makeCaller({ companyId: 4, regionScope: "entity" });

    const result = await caller.quickbooks.syncAccounts({});

    expect(result.success).toBe(true);
    expect(db.syncQuickBooksAccountsForCompany).toHaveBeenCalledTimes(1);
    const [companyId, rows] = vi.mocked(db.syncQuickBooksAccountsForCompany).mock.calls[0];
    expect(companyId).toBe(4);
    expect(rows[0]).toMatchObject({
      companyId: 4,
      quickbooksAccountId: "35",
      name: "Cost of Goods Sold",
      accountType: "Cost of Goods Sold",
      accountSubType: "SuppliesMaterialsCogs",
      classification: "Expense",
      active: true,
      currentBalance: "1200.5",
      currency: "USD",
    });
  });

  it("syncItems maps QuickBooks item fields onto our columns via the scoped upsert", async () => {
    const caller = makeCaller({ companyId: 4, regionScope: "entity" });

    const result = await caller.quickbooks.syncItems({});

    expect(result.success).toBe(true);
    const [companyId, rows] = vi.mocked(db.syncQuickBooksItemsForCompany).mock.calls[0];
    expect(companyId).toBe(4);
    expect(rows[0]).toMatchObject({
      companyId: 4,
      quickbooksItemId: "9",
      name: "Widget",
      sku: "W-1",
      type: "Inventory",
      unitPrice: "10",
      purchaseCost: "4",
      quantityOnHand: "25",
      incomeAccountId: "45",
      expenseAccountId: "35",
      assetAccountId: "81",
      active: true,
    });
  });

  it("syncAccounts refuses an explicit target outside the caller's scope", async () => {
    const caller = makeCaller({ companyId: 4, regionScope: "entity" });

    await expect(caller.quickbooks.syncAccounts({ companyId: 7 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.syncQuickBooksAccountsForCompany).not.toHaveBeenCalled();
  });
});
