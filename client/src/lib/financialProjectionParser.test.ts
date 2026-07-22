import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseWorkbook,
  parsePeriod,
  matchMetric,
  toNumber,
  deriveSeries,
} from "./financialProjectionParser";

function buildWorkbook(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  return wb;
}

describe("toNumber", () => {
  it("returns numbers unchanged", () => {
    expect(toNumber(1234.5)).toBe(1234.5);
  });
  it("parses comma-separated thousands", () => {
    expect(toNumber("1,234,567")).toBe(1_234_567);
  });
  it("parses currency-prefixed values", () => {
    expect(toNumber("$5,000,000")).toBe(5_000_000);
    expect(toNumber("€250K")).toBe(null); // 'K' suffix not supported (intentional)
  });
  it("parses accounting-style negatives", () => {
    expect(toNumber("(250,000)")).toBe(-250_000);
  });
  it("parses percentages", () => {
    expect(toNumber("75.5%")).toBe(75.5);
  });
  it("returns null for blanks and placeholders", () => {
    expect(toNumber("")).toBeNull();
    expect(toNumber("-")).toBeNull();
    expect(toNumber("—")).toBeNull();
    expect(toNumber("N/A")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe("parsePeriod", () => {
  it("parses 4-digit years as numbers", () => {
    expect(parsePeriod(2026)).toMatchObject({ year: 2026, label: "2026" });
  });
  it("rejects numbers outside the reasonable range", () => {
    expect(parsePeriod(1500)).toBeNull();
    expect(parsePeriod(42)).toBeNull();
  });
  it("parses 'FY26' and 'FY 2026' strings", () => {
    expect(parsePeriod("FY26")?.year).toBe(2026);
    expect(parsePeriod("FY 2026")?.year).toBe(2026);
  });
  it("parses 'Jan 2026' with a month", () => {
    const p = parsePeriod("Jan 2026");
    expect(p?.year).toBe(2026);
    expect(p?.month).toBe(1);
  });
  it("parses quarter labels", () => {
    const p = parsePeriod("Q3 2026");
    expect(p?.year).toBe(2026);
    expect(p?.month).toBe(7);
  });
  it("parses years with a projection/actual qualifier", () => {
    expect(parsePeriod("2026E")?.year).toBe(2026);
    expect(parsePeriod("2027A")?.year).toBe(2027);
    expect(parsePeriod("2028 Proj")?.year).toBe(2028);
    expect(parsePeriod("FY26E")?.year).toBe(2026);
    // Label is preserved for display.
    expect(parsePeriod("2026E")?.label).toBe("2026E");
  });
  it("parses quarter and month labels with apostrophes", () => {
    expect(parsePeriod("Q1'26")).toMatchObject({ year: 2026, month: 1 });
    expect(parsePeriod("Jan'26")).toMatchObject({ year: 2026, month: 1 });
  });
  it("parses relative 'Year N' / 'YN' labels onto a synthetic base", () => {
    const y1 = parsePeriod("Year 1");
    const y2 = parsePeriod("Year 2");
    expect(y1?.label).toBe("Year 1");
    expect(y2?.label).toBe("Year 2");
    // One calendar year apart, in order, so growth/CAGR annualization holds.
    expect((y2?.year ?? 0) - (y1?.year ?? 0)).toBe(1);
    expect((y2?.sortKey ?? 0) > (y1?.sortKey ?? 0)).toBe(true);
    expect(parsePeriod("Y3")?.label).toBe("Y3");
  });
  it("rejects random strings", () => {
    expect(parsePeriod("Revenue")).toBeNull();
    expect(parsePeriod("Total")).toBeNull();
    // A 4-digit year followed by a non-qualifier word is not a period.
    expect(parsePeriod("2026 Revenue")).toBeNull();
  });
});

describe("matchMetric", () => {
  it("matches canonical names", () => {
    expect(matchMetric("Revenue")).toBe("revenue");
    expect(matchMetric("COGS")).toBe("cogs");
    expect(matchMetric("Operating Expenses")).toBe("opex");
    expect(matchMetric("Cash Balance")).toBe("cashBalance");
    expect(matchMetric("Headcount")).toBe("headcount");
  });
  it("strips 'Total ' prefix before matching", () => {
    expect(matchMetric("Total Revenue")).toBe("revenue");
    expect(matchMetric("Total Operating Expenses")).toBe("opex");
  });
  it("matches ARR and retention metrics", () => {
    expect(matchMetric("Ending ARR")).toBe("arr");
    expect(matchMetric("Net Revenue Retention")).toBe("nrr");
    expect(matchMetric("NRR")).toBe("nrr");
  });
  it("falls back to loose contains-match", () => {
    expect(matchMetric("FY26 Ending Cash Balance")).toBe("cashBalance");
  });
  it("returns null for unrelated labels", () => {
    expect(matchMetric("Notes")).toBeNull();
    expect(matchMetric("")).toBeNull();
  });
});

describe("parseWorkbook — columns-as-periods layout", () => {
  it("parses a typical founder template", () => {
    const wb = buildWorkbook({
      Projections: [
        ["Year", 2026, 2027, 2028, 2029, 2030],
        ["Revenue", 500_000, 1_500_000, 4_000_000, 10_000_000, 25_000_000],
        ["COGS", 200_000, 550_000, 1_400_000, 3_500_000, 8_500_000],
        ["Operating Expenses", 800_000, 2_000_000, 4_500_000, 8_500_000, 15_000_000],
        ["Cash Balance", 3_000_000, 2_500_000, 1_500_000, 3_000_000, 10_000_000],
        ["Headcount", 12, 25, 55, 120, 250],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.meta.layout).toBe("columns");
    expect(model.periods.map((p) => p.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(model.metrics.revenue).toEqual([500_000, 1_500_000, 4_000_000, 10_000_000, 25_000_000]);
    expect(model.metrics.cogs?.[4]).toBe(8_500_000);
    expect(model.metrics.opex?.[0]).toBe(800_000);
    expect(model.metrics.cashBalance?.[0]).toBe(3_000_000);
    expect(model.metrics.headcount?.[0]).toBe(12);
  });

  it("prefers a 'Total Revenue' row over a plain Revenue row", () => {
    const wb = buildWorkbook({
      Model: [
        ["", 2026, 2027],
        ["Product Revenue", 100, 200],
        ["Services Revenue", 50, 100],
        ["Total Revenue", 150, 300],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.metrics.revenue).toEqual([150, 300]);
  });

  it("parses headers with 'Year N' columns and estimate suffixes", () => {
    const wb = buildWorkbook({
      Projections: [
        ["Metric", "Year 1", "Year 2", "Year 3"],
        ["Revenue", 500_000, 1_500_000, 4_000_000],
        ["Cash Balance", 3_000_000, 2_500_000, 1_500_000],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.meta.layout).toBe("columns");
    expect(model.periods.map((p) => p.label)).toEqual(["Year 1", "Year 2", "Year 3"]);
    expect(model.metrics.revenue).toEqual([500_000, 1_500_000, 4_000_000]);
  });

  it("parses headers with estimate/actual year suffixes", () => {
    const wb = buildWorkbook({
      Model: [
        ["", "2026A", "2027E", "2028E"],
        ["Revenue", 100, 200, 400],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.periods.map((p) => p.year)).toEqual([2026, 2027, 2028]);
    expect(model.metrics.revenue).toEqual([100, 200, 400]);
  });

  it("sorts out-of-order period columns", () => {
    const wb = buildWorkbook({
      Model: [
        ["", 2028, 2026, 2027],
        ["Revenue", 300, 100, 200],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.periods.map((p) => p.year)).toEqual([2026, 2027, 2028]);
    expect(model.metrics.revenue).toEqual([100, 200, 300]);
  });
});

describe("parseWorkbook — rows-as-periods layout", () => {
  it("parses the 'years down the side' layout", () => {
    const wb = buildWorkbook({
      P_L: [
        ["Year", "Revenue", "COGS", "Operating Expenses", "Cash Balance", "Headcount"],
        [2026, 500_000, 200_000, 800_000, 3_000_000, 12],
        [2027, 1_500_000, 550_000, 2_000_000, 2_500_000, 25],
        [2028, 4_000_000, 1_400_000, 4_500_000, 1_500_000, 55],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.meta.layout).toBe("rows");
    expect(model.periods.map((p) => p.year)).toEqual([2026, 2027, 2028]);
    expect(model.metrics.revenue?.[2]).toBe(4_000_000);
    expect(model.metrics.headcount).toEqual([12, 25, 55]);
  });
});

describe("parseWorkbook — resilience", () => {
  it("captures unmapped metric rows as extras", () => {
    const wb = buildWorkbook({
      Model: [
        ["", 2026, 2027],
        ["Revenue", 100, 200],
        ["Some Custom KPI", 7, 9],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.extras).toHaveLength(1);
    expect(model.extras[0].label).toBe("Some Custom KPI");
    expect(model.extras[0].values).toEqual([7, 9]);
  });

  it("parses accounting-style negatives in the values", () => {
    const wb = buildWorkbook({
      Model: [
        ["", 2026, 2027],
        ["Net Income", "(500,000)", "1,200,000"],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.metrics.netIncome).toEqual([-500_000, 1_200_000]);
  });

  it("picks the highest-scoring sheet when multiple candidates exist", () => {
    const wb = buildWorkbook({
      Notes: [["Just a text note"], ["Nothing to see"]],
      Projections: [
        ["", 2026, 2027],
        ["Revenue", 100, 200],
        ["Cash Balance", 900, 800],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.meta.sourceSheet).toBe("Projections");
  });

  it("throws a helpful error when no projection table is found", () => {
    const wb = buildWorkbook({
      Notes: [["Some text"], ["More text"]],
    });
    expect(() => parseWorkbook(wb)).toThrow(/No projection table/i);
  });

  it("reads Summary metadata when present", () => {
    const wb = buildWorkbook({
      Summary: [
        ["Field", "Value"],
        ["Company Name", "Acme Co."],
        ["Currency", "EUR"],
        ["Stage", "Series B"],
        ["Raise Amount", 25_000_000],
      ],
      Projections: [
        ["", 2026, 2027],
        ["Revenue", 1, 2],
      ],
    });
    const { model } = parseWorkbook(wb);
    expect(model.meta.companyName).toBe("Acme Co.");
    expect(model.meta.currency).toBe("EUR");
    expect(model.meta.stage).toBe("Series B");
    expect(model.meta.raiseAmount).toBe(25_000_000);
  });
});

describe("deriveSeries", () => {
  it("computes gross profit, margins, CAGR, and runway", () => {
    const wb = buildWorkbook({
      M: [
        ["", 2026, 2027, 2028],
        ["Revenue", 100, 200, 400],
        ["COGS", 30, 60, 120],
        ["Operating Expenses", 150, 250, 300],
        ["Cash Balance", 500, 300, 100],
      ],
    });
    const { model } = parseWorkbook(wb);
    const d = deriveSeries(model);
    expect(d.grossProfit).toEqual([70, 140, 280]);
    expect(d.grossMargin?.[0]).toBeCloseTo(70);
    // Net income = GP - OpEx
    expect(d.netIncome).toEqual([-80, -110, -20]);
    expect(d.cagr).toBeCloseTo(100, 3); // 100 → 400 over 2 steps = 100% CAGR
    // Last year net loss = 20, burn/month = 20/12, cash = 100, runway = 60 months
    expect(d.runwayMonths).toBeCloseTo(60, 1);
  });

  it("falls back to ARR when Revenue is missing", () => {
    const wb = buildWorkbook({
      M: [
        ["", 2026, 2027],
        ["Ending ARR", 1_000_000, 3_000_000],
      ],
    });
    const { model } = parseWorkbook(wb);
    const d = deriveSeries(model);
    expect(d.cagr).toBeCloseTo(200, 3);
    expect(d.yoyGrowth?.[1]).toBeCloseTo(200);
  });
});
