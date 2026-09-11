import { describe, it, expect } from "vitest";
import { parseMergeIncomeStatements, type MergeIncomeStatement } from "./merge";

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

  it("includes non-operating expenses in the monthly expense total", () => {
    const result = parseMergeIncomeStatements([
      {
        ...statement("2026-01-01", "2026-01-31", 1000, 0, [{ name: "Rent", value: 300 }]),
        non_operating_expenses: { name: "Interest", value: 50 },
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
