import { describe, it, expect, vi, beforeEach } from "vitest";

// Replace eq/and with inspectable plain objects so we can assert exactly
// which conditions reached the query builder and how they were combined.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: any, val: unknown) => ({ op: "eq", col: col?.name ?? col, val })),
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
  };
});

const rows = [{ id: 1 }];
const builder: any = {};
builder.where = vi.fn(() => builder);
builder.limit = vi.fn(async () => rows);
const fakeDb = { select: vi.fn(() => ({ from: vi.fn(() => builder) })) };

vi.mock("../../../db", () => ({
  getDb: vi.fn(async () => fakeDb),
}));

import { queryDatabase } from "./db";

describe("queryDatabase filter composition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies every filter in a single where(and(...)) instead of overwriting per filter", async () => {
    const res = await queryDatabase({
      table: "orders",
      filters: { status: "pending", customerId: 7 },
    });

    expect(res.success).toBe(true);
    expect(res.rowCount).toBe(1);
    // Regression: the old code called .where() once per filter; Drizzle's
    // .where() replaces the previous condition, so only the last filter applied.
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.where).toHaveBeenCalledWith({
      op: "and",
      conds: [
        { op: "eq", col: "status", val: "pending" },
        { op: "eq", col: "customerId", val: 7 },
      ],
    });
  });

  it("adds the run's company scope when the table has a companyId column", async () => {
    await queryDatabase({
      table: "orders",
      filters: { status: "pending", companyId: 999 }, // model-supplied companyId is overridden by scope
      scopeCompanyId: 3,
    });

    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.where).toHaveBeenCalledWith({
      op: "and",
      conds: [
        { op: "eq", col: "companyId", val: 3 },
        { op: "eq", col: "status", val: "pending" },
      ],
    });
  });

  it("passes a lone condition straight through and skips where() with no filters", async () => {
    await queryDatabase({ table: "orders", filters: { status: "shipped" } });
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.where).toHaveBeenCalledWith({ op: "eq", col: "status", val: "shipped" });

    vi.clearAllMocks();
    await queryDatabase({ table: "orders" });
    expect(builder.where).not.toHaveBeenCalled();
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  it("rejects unknown tables", async () => {
    const res = await queryDatabase({ table: "users" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown table/);
  });
});
