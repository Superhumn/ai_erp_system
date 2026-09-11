import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./env", () => ({
  ENV: { mergeApiKey: "test-key", mergeAccountToken: "test-token" },
}));

import {
  parseMergeIncomeStatements,
  mapMergeAccount,
  mapMergeItem,
  getMergeCompanyInfo,
  getMergeAccounts,
  getMergeItems,
  type MergeIncomeStatement,
} from "./merge";

const statement = (
  start: string,
  end: string,
  income: number,
  cogs: number,
  opEx: { name: string; value: number }[],
): MergeIncomeStatement => ({
  start_period: start,
  end_period: end,
  income: { name: "Income", value: income },
  cost_of_sales: { name: "COGS", value: cogs },
  operating_expenses: {
    name: "Operating Expenses",
    value: opEx.reduce((s, e) => s + e.value, 0),
    sub_items: opEx.map((e) => ({ name: e.name, value: e.value })),
  },
});

describe("parseMergeIncomeStatements", () => {
  it("maps statements to monthly income/cogs/expense rows, sorted ascending", () => {
    const result = parseMergeIncomeStatements([
      statement("2026-02-01", "2026-02-28", 2000, 800, [{ name: "Rent", value: 300 }]),
      statement("2026-01-01", "2026-01-31", 1000, 400, [{ name: "Rent", value: 300 }]),
    ]);

    expect(result.months).toEqual([
      { label: "Jan 2026", income: 1000, cogs: 400, expense: 300 },
      { label: "Feb 2026", income: 2000, cogs: 800, expense: 300 },
    ]);
  });

  it("handles the live API shape where sections are arrays of report items", () => {
    const result = parseMergeIncomeStatements([
      {
        start_period: "2026-01-01",
        end_period: "2026-01-31",
        income: [
          { name: "Sales", value: 700 },
          { name: "Services", value: 300 },
        ],
        cost_of_sales: [{ name: "Materials", value: 250 }],
        operating_expenses: [
          { name: "Rent", value: 300 },
          { name: "Payroll", value: 500, sub_items: [{ name: "Salaries", value: 500 }] },
        ],
      },
    ]);

    expect(result.months).toEqual([{ label: "Jan 2026", income: 1000, cogs: 250, expense: 800 }]);
    expect(result.expenseAccounts).toEqual([
      { name: "Rent", total: 300 },
      { name: "Salaries", total: 500 },
    ]);
  });

  it("filters by the requested date window on end_period", () => {
    const result = parseMergeIncomeStatements(
      [
        statement("2025-12-01", "2025-12-31", 500, 100, []),
        statement("2026-01-01", "2026-01-31", 1000, 400, []),
        statement("2026-02-01", "2026-02-28", 2000, 800, []),
      ],
      { startDate: "2026-01-01", endDate: "2026-01-31" },
    );

    expect(result.months).toHaveLength(1);
    expect(result.months[0].label).toBe("Jan 2026");
  });

  it("aggregates into quarters and years when summarizeBy is set", () => {
    const input = [
      statement("2026-01-01", "2026-01-31", 100, 10, []),
      statement("2026-02-01", "2026-02-28", 200, 20, []),
      statement("2026-04-01", "2026-04-30", 400, 40, []),
    ];

    const quarters = parseMergeIncomeStatements(input, { summarizeBy: "Quarter" });
    expect(quarters.months).toEqual([
      { label: "Q1 2026", income: 300, cogs: 30, expense: 0 },
      { label: "Q2 2026", income: 400, cogs: 40, expense: 0 },
    ]);

    const years = parseMergeIncomeStatements(input, { summarizeBy: "Year" });
    expect(years.months).toEqual([{ label: "2026", income: 700, cogs: 70, expense: 0 }]);
  });

  it("falls back to summing sub_items when a report item has no value", () => {
    const result = parseMergeIncomeStatements([
      {
        start_period: "2026-01-01",
        end_period: "2026-01-31",
        income: { name: "Income", sub_items: [{ name: "Sales", value: 700 }, { name: "Services", value: 300 }] },
        cost_of_sales: null,
        operating_expenses: null,
      },
    ]);

    expect(result.months[0]).toEqual({ label: "Jan 2026", income: 1000, cogs: 0, expense: 0 });
  });

  it("aggregates expense accounts across months and drops zero totals", () => {
    const result = parseMergeIncomeStatements([
      statement("2026-01-01", "2026-01-31", 0, 0, [
        { name: "Rent", value: 300 },
        { name: "Software", value: 50 },
        { name: "Unused", value: 0 },
      ]),
      statement("2026-02-01", "2026-02-28", 0, 0, [{ name: "Rent", value: 300 }]),
    ]);

    expect(result.expenseAccounts).toEqual([
      { name: "Rent", total: 600 },
      { name: "Software", total: 50 },
    ]);
  });

  it("includes non-operating expenses in the period expense total", () => {
    const result = parseMergeIncomeStatements([
      {
        ...statement("2026-01-01", "2026-01-31", 1000, 0, [{ name: "Rent", value: 300 }]),
        non_operating_expenses: [{ name: "Interest", value: 50 }],
      },
    ]);

    expect(result.months[0].expense).toBe(350);
    expect(result.expenseAccounts).toContainEqual({ name: "Interest", total: 50 });
  });

  it("skips statements with missing or invalid end_period", () => {
    const result = parseMergeIncomeStatements([
      { start_period: "2026-01-01", end_period: null, income: { value: 1 } },
      statement("2026-02-01", "2026-02-28", 2000, 0, []),
    ]);

    expect(result.months).toHaveLength(1);
    expect(result.months[0].label).toBe("Feb 2026");
  });
});

describe("mapMergeAccount / mapMergeItem", () => {
  it("maps a Merge account onto quickbooksAccounts columns", () => {
    const row = mapMergeAccount(
      {
        id: "uuid-1",
        remote_id: "35",
        name: "Cost of Goods Sold",
        classification: "EXPENSE",
        type: "Cost of Goods Sold",
        status: "ACTIVE",
        current_balance: 1234.5,
        currency: "USD",
      },
      7,
    );

    expect(row).toMatchObject({
      companyId: 7,
      quickbooksAccountId: "35",
      name: "Cost of Goods Sold",
      classification: "Expense",
      accountType: "Cost of Goods Sold",
      active: true,
      currentBalance: "1234.5",
      currency: "USD",
    });
  });

  it("maps item fields across both Merge field spellings and normalizes type", () => {
    const modern = mapMergeItem(
      { id: "u1", remote_id: "9", name: "Widget", type: "INVENTORY", unit_price: 10, purchase_price: 4, status: "ACTIVE" },
      1,
    );
    expect(modern).toMatchObject({ quickbooksItemId: "9", type: "Inventory", unitPrice: "10", purchaseCost: "4" });

    const alternate = mapMergeItem(
      { id: "u2", name: "Service A", item_type: "SERVICE", sales_price: 25, status: "ACTIVE" },
      1,
    );
    expect(alternate).toMatchObject({ quickbooksItemId: "u2", type: "Service", unitPrice: "25" });
  });
});

describe("request layer (mocked fetch)", () => {
  const jsonResponse = (body: any, status = 200) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response;

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends auth headers and follows pagination cursors until exhausted", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ next: "cur2", results: [{ id: "a1", name: "A1" }] }))
      .mockResolvedValueOnce(jsonResponse({ next: null, results: [{ id: "a2", name: "A2" }] }));

    const res = await getMergeAccounts(1);

    expect(res.error).toBeUndefined();
    expect(res.accounts).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(String(firstUrl)).toContain("/accounts?");
    expect(firstInit.headers["Authorization"]).toBe("Bearer test-key");
    expect(firstInit.headers["X-Account-Token"]).toBe("test-token");
    const [secondUrl] = fetchMock.mock.calls[1];
    expect(String(secondUrl)).toContain("cursor=cur2");
  });

  it("returns an explicit truncation error instead of a silent partial sync", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ next: "more", results: [{ id: "x" }] }));

    const res = await getMergeAccounts(1);

    expect(res.accounts).toBeUndefined();
    expect(res.error).toMatch(/more than \d+ rows/);
  });

  it("reads company-info from both list and singleton response shapes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ next: null, results: [{ name: "Superhumn Inc" }] }));
    expect((await getMergeCompanyInfo()).name).toBe("Superhumn Inc");

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "c1", legal_name: "Superhumn LLC" }));
    expect((await getMergeCompanyInfo()).name).toBe("Superhumn LLC");
  });

  it("surfaces non-2xx responses as errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "Invalid token" }, 401));

    const res = await getMergeCompanyInfo();
    expect(res.error).toContain("401");
  });

  it("filters items by requested type after mapping", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        next: null,
        results: [
          { id: "i1", name: "Widget", type: "INVENTORY" },
          { id: "i2", name: "Consulting", type: "SERVICE" },
        ],
      }),
    );

    const res = await getMergeItems(1, { type: "Service" });
    expect(res.items).toHaveLength(1);
    expect(res.items![0].name).toBe("Consulting");
  });
});
