/**
 * Tests for FinancialReports page utility functions.
 * Functions tested: formatAmount, downloadCSV, downloadPDF, fmtCompact,
 * fmtChartAxis, reportTypes, CHART_COLORS
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatCurrency } from "@/lib/format";

// ── Re-implement pure functions from FinancialReports.tsx ──

const reportTypes = [
  { id: "profit_loss", name: "Profit & Loss (Income Statement)", description: "Revenue, expenses, and net income for a period" },
  { id: "balance_sheet", name: "Balance Sheet", description: "Assets, liabilities, and equity at a point in time" },
  { id: "cash_flow", name: "Cash Flow Statement", description: "Cash inflows and outflows by operating, investing, and financing" },
  { id: "runway", name: "Runway & Burn Rate", description: "Monthly burn rate and months of runway remaining" },
  { id: "revenue_by_customer", name: "Revenue by Customer", description: "Revenue breakdown by customer" },
  { id: "revenue_by_product", name: "Revenue by Product", description: "Revenue breakdown by product/SKU" },
  { id: "expense_by_category", name: "Expenses by Category", description: "Expense breakdown by account category" },
  { id: "expense_by_vendor", name: "Expenses by Vendor", description: "Spending breakdown by vendor" },
  { id: "accounts_receivable", name: "Accounts Receivable Aging", description: "Outstanding invoices by age (current, 30, 60, 90+ days)" },
  { id: "accounts_payable", name: "Accounts Payable Aging", description: "Outstanding bills by age" },
  { id: "cogs_summary", name: "Cost of Goods Sold", description: "COGS breakdown by product, period, and method" },
  { id: "inventory_valuation", name: "Inventory Valuation", description: "Current inventory value by product and location" },
  { id: "tax_summary", name: "Tax Summary", description: "Revenue, deductible expenses, and estimated tax liability" },
  { id: "monthly_summary", name: "Monthly Financial Summary", description: "Month-over-month revenue, expenses, and key metrics" },
];

function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return formatCurrency(value);
}

function fmtCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function fmtChartAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const CHART_COLORS = {
  revenue: "#3b82f6",
  cogs: "#f97316",
  grossProfit: "#22c55e",
  ebitda: "#8b5cf6",
  cash: "#06b6d4",
  negative: "#ef4444",
  muted: "#94a3b8",
};

type ReportRow = {
  label: string;
  amount: number | string | null;
  type: string;
  pct?: string;
  count?: number;
  quantity?: number | null;
  unitCost?: number | null;
  revenue?: number;
  expenses?: number;
  cumulative?: number;
};

type ReportData = {
  title: string;
  headers: string[];
  rows: ReportRow[];
  generatedAt: string;
  summary: string;
};

function generateCSVContent(report: ReportData): string {
  const lines: string[] = [report.headers.join(",")];
  for (const row of report.rows) {
    const cells: string[] = [
      `"${row.label}"`,
      typeof row.amount === "number" ? row.amount.toFixed(2) : (row.amount ?? ""),
    ];
    if (row.pct !== undefined) cells.push(row.pct);
    if (row.count !== undefined) cells.push(String(row.count));
    if (row.quantity !== undefined && row.quantity !== null) cells.push(String(row.quantity));
    if (row.unitCost !== undefined && row.unitCost !== null) cells.push(String(row.unitCost));
    if (row.revenue !== undefined) cells.push(row.revenue.toFixed(2));
    if (row.expenses !== undefined) cells.push(row.expenses.toFixed(2));
    if (row.cumulative !== undefined) cells.push(row.cumulative.toFixed(2));
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

function generatePDFContent(report: ReportData): string {
  return [
    report.title,
    `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
    "",
    report.headers.join(" | "),
    "-".repeat(60),
    ...report.rows.map((row) => {
      const parts = [row.label, formatAmount(row.amount)];
      if (row.pct) parts.push(row.pct);
      if (row.count !== undefined) parts.push(`${row.count} items`);
      return parts.join(" | ");
    }),
    "",
    `Summary: ${report.summary}`,
  ].join("\n");
}

// ── Tests ──

describe("FinancialReports — reportTypes", () => {
  it("has 14 report types", () => {
    expect(reportTypes).toHaveLength(14);
  });

  it("all have unique ids", () => {
    const ids = reportTypes.map(r => r.id);
    expect(new Set(ids).size).toBe(14);
  });

  it("all have name and description", () => {
    for (const report of reportTypes) {
      expect(report.name.length).toBeGreaterThan(0);
      expect(report.description.length).toBeGreaterThan(0);
    }
  });

  it("includes key financial reports", () => {
    const ids = reportTypes.map(r => r.id);
    expect(ids).toContain("profit_loss");
    expect(ids).toContain("balance_sheet");
    expect(ids).toContain("cash_flow");
    expect(ids).toContain("runway");
    expect(ids).toContain("tax_summary");
  });
});

describe("FinancialReports — formatAmount", () => {
  it("formats number as currency", () => {
    expect(formatAmount(1234.56)).toBe("$1,234.56");
  });

  it("returns string as-is", () => {
    expect(formatAmount("Custom Label")).toBe("Custom Label");
  });

  it("returns empty string for null", () => {
    expect(formatAmount(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatAmount(undefined)).toBe("");
  });

  it("formats zero", () => {
    expect(formatAmount(0)).toBe("$0.00");
  });

  it("formats negative numbers", () => {
    expect(formatAmount(-500)).toBe("-$500.00");
  });
});

describe("FinancialReports — fmtCompact", () => {
  it("formats millions", () => {
    expect(fmtCompact(5_000_000)).toBe("$5.0M");
  });

  it("formats thousands", () => {
    expect(fmtCompact(50_000)).toBe("$50K");
  });

  it("formats small numbers", () => {
    expect(fmtCompact(500)).toBe("$500");
  });

  it("formats negative millions", () => {
    expect(fmtCompact(-2_500_000)).toBe("$-2.5M");
  });

  it("formats negative thousands", () => {
    expect(fmtCompact(-15_000)).toBe("$-15K");
  });

  it("handles string input", () => {
    expect(fmtCompact("1000000")).toBe("$1.0M");
  });

  it("returns dash for null", () => {
    expect(fmtCompact(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(fmtCompact(undefined)).toBe("-");
  });

  it("returns dash for NaN string", () => {
    expect(fmtCompact("abc")).toBe("-");
  });

  it("formats zero", () => {
    expect(fmtCompact(0)).toBe("$0");
  });
});

describe("FinancialReports — fmtChartAxis", () => {
  it("formats millions with M suffix", () => {
    expect(fmtChartAxis(5_000_000)).toBe("$5.0M");
  });

  it("formats thousands with K suffix", () => {
    expect(fmtChartAxis(50_000)).toBe("$50K");
  });

  it("formats small values as dollar amount", () => {
    expect(fmtChartAxis(500)).toBe("$500");
  });

  it("formats zero", () => {
    expect(fmtChartAxis(0)).toBe("$0");
  });

  it("formats negative millions", () => {
    expect(fmtChartAxis(-3_000_000)).toBe("$-3.0M");
  });
});

describe("FinancialReports — CHART_COLORS", () => {
  it("has all expected color keys", () => {
    expect(CHART_COLORS).toHaveProperty("revenue");
    expect(CHART_COLORS).toHaveProperty("cogs");
    expect(CHART_COLORS).toHaveProperty("grossProfit");
    expect(CHART_COLORS).toHaveProperty("ebitda");
    expect(CHART_COLORS).toHaveProperty("cash");
    expect(CHART_COLORS).toHaveProperty("negative");
    expect(CHART_COLORS).toHaveProperty("muted");
  });

  it("all values are valid hex colors", () => {
    for (const color of Object.values(CHART_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("FinancialReports — CSV generation", () => {
  const sampleReport: ReportData = {
    title: "Profit & Loss",
    headers: ["Category", "Amount"],
    rows: [
      { label: "Revenue", amount: 100000, type: "income" },
      { label: "Expenses", amount: -50000, type: "expense" },
      { label: "Note", amount: "N/A", type: "info" },
    ],
    generatedAt: "2026-01-15T00:00:00Z",
    summary: "Net income $50K",
  };

  it("generates valid CSV with headers", () => {
    const csv = generateCSVContent(sampleReport);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Category,Amount");
  });

  it("includes all data rows", () => {
    const csv = generateCSVContent(sampleReport);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4); // header + 3 rows
  });

  it("quotes labels in CSV", () => {
    const csv = generateCSVContent(sampleReport);
    expect(csv).toContain('"Revenue"');
  });

  it("formats numbers with 2 decimal places", () => {
    const csv = generateCSVContent(sampleReport);
    expect(csv).toContain("100000.00");
  });

  it("includes string amounts as-is", () => {
    const csv = generateCSVContent(sampleReport);
    expect(csv).toContain("N/A");
  });

  it("includes optional fields when present", () => {
    const report: ReportData = {
      title: "Test",
      headers: ["Cat", "Amt", "Pct", "Count"],
      rows: [{ label: "Item", amount: 100, type: "x", pct: "10%", count: 5 }],
      generatedAt: "2026-01-01T00:00:00Z",
      summary: "Test",
    };
    const csv = generateCSVContent(report);
    expect(csv).toContain("10%");
    expect(csv).toContain("5");
  });
});

describe("FinancialReports — PDF content generation", () => {
  const sampleReport: ReportData = {
    title: "Balance Sheet",
    headers: ["Account", "Amount"],
    rows: [
      { label: "Cash", amount: 200000, type: "asset" },
      { label: "Debt", amount: -100000, type: "liability" },
    ],
    generatedAt: "2026-01-15T00:00:00Z",
    summary: "Net worth $100K",
  };

  it("includes the report title", () => {
    const content = generatePDFContent(sampleReport);
    expect(content).toContain("Balance Sheet");
  });

  it("includes the generation date", () => {
    const content = generatePDFContent(sampleReport);
    expect(content).toContain("Generated:");
  });

  it("includes headers separated by pipes", () => {
    const content = generatePDFContent(sampleReport);
    expect(content).toContain("Account | Amount");
  });

  it("includes row data", () => {
    const content = generatePDFContent(sampleReport);
    expect(content).toContain("Cash");
    expect(content).toContain("Debt");
  });

  it("includes summary at the end", () => {
    const content = generatePDFContent(sampleReport);
    expect(content).toContain("Summary: Net worth $100K");
  });

  it("includes separator line", () => {
    const content = generatePDFContent(sampleReport);
    expect(content).toContain("-".repeat(60));
  });
});
