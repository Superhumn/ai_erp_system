import { describe, it, expect } from "vitest";
import { renderInvestorDashboardHtml } from "./investorDashboardHtml";
import type { FinancialModel } from "./financialProjectionParser";

// ── Fixtures ─────────────────────────────────────────────────────────────

function makePeriod(year: number) {
  return { label: String(year), year, sortKey: year * 100 };
}

function makeModel(overrides: Partial<FinancialModel> = {}): FinancialModel {
  return {
    periods: [makePeriod(2026), makePeriod(2027), makePeriod(2028)],
    metrics: {
      revenue: [1_000_000, 2_500_000, 5_000_000],
      cogs: [400_000, 900_000, 1_750_000],
      opex: [800_000, 1_500_000, 2_500_000],
      cashBalance: [3_000_000, 2_500_000, 4_000_000],
      headcount: [12, 25, 55],
    },
    extras: [],
    meta: {
      companyName: "Acme Corp",
      currency: "USD",
      stage: "Series A",
      raiseAmount: 5_000_000,
      valuation: 25_000_000,
      sourceSheet: "Projections",
      layout: "columns",
    },
    ...overrides,
  };
}

// ── Self-contained output ─────────────────────────────────────────────────

describe("renderInvestorDashboardHtml — self-contained output", () => {
  it("contains no external <link> resources", () => {
    const html = renderInvestorDashboardHtml(makeModel());
    expect(html).not.toMatch(/<link\b[^>]*\bhref\b/i);
  });

  it("contains no external <script src=…> resources", () => {
    const html = renderInvestorDashboardHtml(makeModel());
    expect(html).not.toMatch(/<script\b[^>]*\bsrc\b/i);
  });

  it("contains no @import rules in the inline styles", () => {
    const html = renderInvestorDashboardHtml(makeModel());
    expect(html).not.toMatch(/@import/i);
  });

  it("has a valid HTML doctype and <html> wrapper", () => {
    const html = renderInvestorDashboardHtml(makeModel());
    expect(html.trimStart()).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });
});

// ── XSS / HTML-escaping ───────────────────────────────────────────────────

describe("renderInvestorDashboardHtml — HTML escaping", () => {
  it("escapes company name containing HTML special chars", () => {
    const model = makeModel({
      meta: {
        companyName: '<script>alert("xss")</script>',
        currency: "USD",
        stage: "Series A",
        sourceSheet: "Projections",
        layout: "columns",
      },
    });
    const html = renderInvestorDashboardHtml(model);
    // The raw string must not appear unescaped.
    expect(html).not.toContain('<script>alert("xss")</script>');
    // The escaped form should be present.
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes single and double quotes in meta fields", () => {
    const model = makeModel({
      meta: {
        companyName: "O'Brien & Co",
        currency: "USD",
        stage: 'Stage "Seed"',
        sourceSheet: "Projections",
        layout: "columns",
      },
    });
    const html = renderInvestorDashboardHtml(model);
    // Raw unescaped quotes must not appear inside HTML attributes/content.
    expect(html).toContain("O&#39;Brien &amp; Co");
    expect(html).toContain("Stage &quot;Seed&quot;");
  });

  it("escapes the generatedAt option if it contains markup", () => {
    const html = renderInvestorDashboardHtml(makeModel(), {
      generatedAt: "<bad>2026-01-01</bad>",
    });
    expect(html).not.toContain("<bad>");
    expect(html).toContain("&lt;bad&gt;");
  });
});

// ── Null metric rendering ("—" not "$0") ─────────────────────────────────

describe("renderInvestorDashboardHtml — null metric rendering", () => {
  it("renders '—' in the table for null revenue values", () => {
    const model = makeModel({
      metrics: {
        revenue: [null, 2_500_000, 5_000_000],
        cashBalance: [3_000_000, 2_500_000, 4_000_000],
      },
    });
    const html = renderInvestorDashboardHtml(model);
    // The first period revenue is null — it should show "—", not "$0".
    expect(html).toContain("—");
    expect(html).not.toContain(">$0<");
  });

  it("shows '—' for Period-end Burn when net income data is unavailable", () => {
    const model = makeModel({
      metrics: {
        // No revenue, no cogs, no opex — derived.netIncome will be undefined/null
        cashBalance: [3_000_000, 2_500_000, 4_000_000],
      },
    });
    const html = renderInvestorDashboardHtml(model);
    // Burn KPI should show "—" (not "Profitable") when net income is missing.
    expect(html).toContain("Period-end Burn");
    // The output must not claim "Profitable" when there is no net income data.
    // Instead the kpi-value should be "—".
    // Look for the pattern: kpi-label contains "Period-end Burn", kpi-value is "—".
    const burnsection = html.split("Period-end Burn")[1] ?? "";
    expect(burnsection).toContain("—");
    expect(burnsection.split("kpi-label")[0]).toContain("—");
    // Explicitly assert "Profitable" is not shown when data is unavailable.
    expect(burnsection.split("kpi-label")[0]).not.toContain("Profitable");
  });

  it("shows 'Profitable' only when the last non-null net income is ≥ 0", () => {
    const model = makeModel({
      metrics: {
        revenue: [1_000_000, 2_500_000, 5_000_000],
        cogs: [400_000, 900_000, 1_750_000],
        opex: [300_000, 800_000, 1_500_000],
      },
    });
    const html = renderInvestorDashboardHtml(model);
    expect(html).toContain("Profitable");
  });

  it("does not show minCash '—' when all cash values are valid numbers", () => {
    const model = makeModel();
    const html = renderInvestorDashboardHtml(model);
    // minCash sub-label should appear — checking it doesn't show the infinity fallback
    expect(html).toContain("min $");
    expect(html).not.toContain("min —");
  });

  it("handles an all-null cash array without Infinity in minCash", () => {
    const model = makeModel({
      metrics: {
        revenue: [1_000_000, 2_500_000, 5_000_000],
        cashBalance: [null, null, null],
      },
    });
    const html = renderInvestorDashboardHtml(model);
    // minCash should be null → sub-label should not say "min Infinity" or similar.
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("min —");
  });
});

// ── Footer branding ───────────────────────────────────────────────────────

describe("renderInvestorDashboardHtml — footer", () => {
  it("does not contain 'VC Corner Dashboard Generator' in the footer", () => {
    const html = renderInvestorDashboardHtml(makeModel());
    expect(html).not.toContain("VC Corner Dashboard Generator");
  });

  it("includes the generated date in the footer", () => {
    const html = renderInvestorDashboardHtml(makeModel(), { generatedAt: "2026-04-27" });
    expect(html).toContain("2026-04-27");
  });
});

// ── KPI edge cases ────────────────────────────────────────────────────────

describe("renderInvestorDashboardHtml — KPI edge cases", () => {
  it("uses last non-null revenue value as lastTop (not the last element)", () => {
    const model = makeModel({
      metrics: {
        revenue: [1_000_000, 2_500_000, null],
        cashBalance: [3_000_000, 2_500_000, null],
      },
    });
    const html = renderInvestorDashboardHtml(model);
    // lastTop should be 2_500_000 (last non-null), shown as "$2.50M" in the KPI.
    expect(html).toContain("$2.50M");
  });

  it("uses first non-null revenue value as firstTop (not index 0)", () => {
    const model = makeModel({
      metrics: {
        revenue: [null, 1_000_000, 2_500_000],
        cashBalance: [3_000_000, 2_500_000, 4_000_000],
      },
    });
    const html = renderInvestorDashboardHtml(model);
    // firstTop is 1_000_000 (first non-null); firstYear is still periods[0].year = 2026.
    // The sub-label says "from $1.00M in 2026" — importantly it must NOT say "from $0 in 2026".
    expect(html).toContain("from $1.00M in 2026");
    expect(html).not.toContain("from $0");
  });

  it("falls back to ARR when revenue is absent", () => {
    const model = makeModel({
      metrics: {
        arr: [500_000, 1_200_000, 2_800_000],
        cashBalance: [2_000_000, 1_500_000, 3_000_000],
      },
    });
    const html = renderInvestorDashboardHtml(model);
    expect(html).toContain("ARR CAGR");
  });
});
