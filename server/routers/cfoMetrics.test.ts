/** financialReports.cfoMetrics: role gate, scope pass-through and boundary validation. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctxFor } from "../flows/_harness";

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn(),
  getUserEntityAccessCompanyIds: vi.fn(async () => []),
  getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
  getCompanyById: vi.fn(async () => undefined),
  getCompanyIdsInRegion: vi.fn(async () => []),
  getCfoAggregates: vi.fn(async () => ({
    customers: [{ name: "Acme", count: 2, total: 300, firstAt: 0, lastAt: 1, rev90: 0, revPrior90: 0, revThisMonth: 0, revYearAgoMonth: 0 }],
    monthlyRevenue: new Array(13).fill(0),
    cohortCells: [{ cohortQ: 7, offset: 0, revenue: 100 }],
    cohortSizes: [{ cohortQ: 7, customers: 1 }],
    arAging: { current: 1, d30: 2, d60: 3, d90: 4 },
    expenseByMonth: [0, 0, 5],
    outstandingAP: 9,
  })),
}));

import * as db from "../db";
import { appRouter } from "./index";

const finance = appRouter.createCaller(ctxFor("finance", { id: 2, companyId: 1, regionScope: "entity" }));
const sales = appRouter.createCaller(ctxFor("sales", { id: 1, companyId: 1, regionScope: "entity" }));

const windows = {
  nowMs: 1_000,
  monthStarts: Array.from({ length: 14 }, (_, i) => i * 10),
  quarterStarts: Array.from({ length: 9 }, (_, i) => i * 30),
  currentQuarter: 8100,
  newCustomerCutoffMs: 0,
};

beforeEach(() => vi.clearAllMocks());

describe("financialReports.cfoMetrics", () => {
  it("aggregates under the caller's scope and maps cohort buckets to absolute quarters", async () => {
    const r = await finance.financialReports.cfoMetrics(windows);
    expect(db.getCfoAggregates).toHaveBeenCalledWith({ mode: "entity", companyIds: [1] }, windows);
    expect(r.concentration.top5[0]).toMatchObject({ name: "Acme", value: 300 });
    // Bucket 7 of the 8-quarter window is the current quarter.
    expect(r.cohortHeatmap?.rows[0].label).toBe(`Q${(8100 % 4) + 1} ${Math.floor(8100 / 4)}`);
    expect(r.outstandingAP).toBe(9);
    expect(r.hasInvoices).toBe(true);
  });

  it("rejects boundaries that are not ascending or the wrong length", async () => {
    await expect(finance.financialReports.cfoMetrics({ ...windows, monthStarts: [...windows.monthStarts].reverse() }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(finance.financialReports.cfoMetrics({ ...windows, quarterStarts: [1, 2] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.getCfoAggregates).not.toHaveBeenCalled();
  });

  it("is finance-only", async () => {
    await expect(sales.financialReports.cfoMetrics(windows)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
