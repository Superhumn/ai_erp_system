import * as XLSX from "xlsx";

// ── Public types ──────────────────────────────────────────────────────────

export type MetricKey =
  // Tier 1 — core narrative
  | "revenue" | "arr"
  | "cogs" | "grossProfit"
  | "opex" | "sm" | "rd" | "ga"
  | "ebitda" | "netIncome"
  | "cashBalance" | "headcount"
  // Tier 2 — efficiency story
  | "magicNumber" | "cacPayback" | "ltvCac"
  // Tier 3 — retention / customer story
  | "customers" | "newLogos" | "churnedLogos"
  | "nrr" | "grr" | "acv" | "arpu" | "cac" | "ltv";

export interface Period {
  /** Display label, e.g. "2026", "FY26", "Jan 2026". */
  label: string;
  /** Four-digit year extracted from the cell. */
  year: number;
  /** Starting month when available (1–12 for monthly periods and quarter labels); undefined for annual periods. */
  month?: number;
  /** Sortable key: `year * 100 + (month || 0)`, using the starting month when available. */
  sortKey: number;
}

export interface ExtraMetric {
  /** Label from the source sheet. */
  label: string;
  /** One entry per period (same length as `FinancialModel.periods`). */
  values: (number | null)[];
}

export interface FinancialMeta {
  companyName?: string;
  currency: string;
  stage?: string;
  raiseAmount?: number;
  valuation?: number;
  /** Name of the worksheet the projection was parsed from. */
  sourceSheet: string;
  /** `"columns"` = periods across the top; `"rows"` = periods down the side. */
  layout: "columns" | "rows";
}

export interface FinancialModel {
  periods: Period[];
  /** Canonical metrics, mapped to one value per period. */
  metrics: Partial<Record<MetricKey, (number | null)[]>>;
  /** Rows/columns with numeric data that we couldn't map to a canonical key. */
  extras: ExtraMetric[];
  meta: FinancialMeta;
}

export interface ParseResult {
  model: FinancialModel;
  /** Non-fatal notes surfaced to the UI (e.g. sheets skipped, ambiguous labels). */
  warnings: string[];
}

// ── Synonyms ─────────────────────────────────────────────────────────────

const SYNONYMS: Record<MetricKey, string[]> = {
  revenue: [
    "revenue", "total revenue", "net revenue", "sales", "net sales",
    "total sales", "gross revenue", "top line", "turnover",
  ],
  arr: [
    "arr", "annual recurring revenue", "ending arr", "exit arr",
    "ending arr ($)", "arr ($)",
  ],
  cogs: [
    "cogs", "cost of goods sold", "cost of revenue", "cost of sales",
    "total cogs", "direct costs",
  ],
  grossProfit: [
    "gross profit", "total gross profit",
  ],
  opex: [
    "opex", "total opex", "operating expenses", "operating expense",
    "total operating expenses", "operating costs", "total operating costs",
  ],
  sm: [
    "s&m", "sm", "sales & marketing", "sales and marketing",
    "sales & marketing expenses", "sales and marketing expenses", "marketing",
  ],
  rd: [
    "r&d", "rd", "research & development", "research and development",
    "r&d expenses", "rnd",
  ],
  ga: [
    "g&a", "ga", "general & administrative", "general and administrative",
    "g&a expenses", "general & admin",
  ],
  ebitda: [
    "ebitda", "adjusted ebitda",
  ],
  netIncome: [
    "net income", "net profit", "net loss", "net earnings",
    "profit / (loss)", "profit/(loss)", "bottom line",
  ],
  cashBalance: [
    "cash", "cash balance", "ending cash", "ending cash balance",
    "cash on hand", "cash position", "cash & equivalents",
    "cash and equivalents",
  ],
  headcount: [
    "headcount", "total headcount", "employees", "total employees",
    "fte", "ftes", "team size", "staff",
  ],
  magicNumber: ["magic number", "sales magic number"],
  cacPayback: ["cac payback", "cac payback period", "payback period"],
  ltvCac: ["ltv/cac", "ltv:cac", "ltv to cac"],
  customers: [
    "customers", "total customers", "active customers", "paying customers",
    "accounts", "total accounts", "logos", "total logos",
  ],
  newLogos: ["new logos", "new customers", "logos added", "net new logos"],
  churnedLogos: ["churned logos", "lost logos", "logo churn"],
  nrr: ["nrr", "net revenue retention", "ndr", "net dollar retention"],
  grr: ["grr", "gross revenue retention"],
  acv: ["acv", "average contract value"],
  arpu: ["arpu", "average revenue per user", "average revenue per account"],
  cac: ["cac", "customer acquisition cost"],
  ltv: ["ltv", "lifetime value", "customer lifetime value"],
};

// Prefer Revenue over ARR if both seen, but prefer ARR for SaaS-specific use.
// Resolution is handled in `pickBestMetricMatch` by list order: earlier wins ties.
const METRIC_PRIORITY: MetricKey[] = [
  "revenue", "arr", "cogs", "grossProfit",
  "opex", "sm", "rd", "ga",
  "ebitda", "netIncome", "cashBalance", "headcount",
  "magicNumber", "cacPayback", "ltvCac",
  "customers", "newLogos", "churnedLogos",
  "nrr", "grr", "acv", "arpu", "cac", "ltv",
];

// ── Helpers ──────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[:·•]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Parse a cell value into a number. Handles commas, currency symbols, (negatives), and %. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const raw = v.trim();
  if (!raw || raw === "-" || raw === "—" || raw.toLowerCase() === "n/a") return null;
  let cleaned = raw.replace(/[,$€£¥₹\s]/g, "");
  let isNeg = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    isNeg = true;
    cleaned = cleaned.slice(1, -1);
  }
  let isPct = false;
  if (cleaned.endsWith("%")) {
    isPct = true;
    cleaned = cleaned.slice(0, -1);
  }
  // Reject values with unsupported suffixes (K, M, B)
  if (/[a-zA-Z]/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  const signed = isNeg ? -n : n;
  return isPct ? signed : signed;
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/** Parse one cell into a Period, or null if it isn't period-like. */
export function parsePeriod(cell: unknown): Period | null {
  // Numeric year (most common)
  if (typeof cell === "number") {
    if (Number.isInteger(cell) && cell >= 1990 && cell <= 2100) {
      return { label: String(cell), year: cell, sortKey: cell * 100 };
    }
    // Excel date serial: parse with SSF
    if (cell > 20000 && cell < 80000) {
      const d = XLSX.SSF.parse_date_code(cell);
      if (d && d.y >= 1990 && d.y <= 2100) {
        if (d.m >= 1 && d.m <= 12 && d.d === 1) {
          const monthName = MONTH_NAMES[d.m - 1].replace(/^\w/, (c) => c.toUpperCase());
          return {
            label: `${monthName} ${d.y}`,
            year: d.y,
            month: d.m,
            sortKey: d.y * 100 + d.m,
          };
        }
        return { label: String(d.y), year: d.y, sortKey: d.y * 100 };
      }
    }
    return null;
  }
  if (typeof cell !== "string") return null;
  const s = cell.trim();
  if (!s) return null;

  // "FY26", "FY 2026", "FY-26"
  const fy = /^(?:FY|fy|Fy)[\s-]*(\d{2,4})$/.exec(s);
  if (fy) {
    let y = parseInt(fy[1], 10);
    if (y < 100) y += 2000;
    if (y >= 1990 && y <= 2100) return { label: s, year: y, sortKey: y * 100 };
  }

  // Plain 4-digit year
  const yOnly = /^(\d{4})$/.exec(s);
  if (yOnly) {
    const y = parseInt(yOnly[1], 10);
    if (y >= 1990 && y <= 2100) return { label: s, year: y, sortKey: y * 100 };
  }

  // "Jan 2026", "January 2026", "Jan-26"
  const monthYear = /^([A-Za-z]{3,9})[\s-]+(\d{2,4})$/.exec(s);
  if (monthYear) {
    const name = monthYear[1].toLowerCase();
    const mi = MONTH_NAMES.findIndex((m) => name.startsWith(m));
    if (mi >= 0) {
      let y = parseInt(monthYear[2], 10);
      if (y < 100) y += 2000;
      if (y >= 1990 && y <= 2100) {
        return { label: s, year: y, month: mi + 1, sortKey: y * 100 + (mi + 1) };
      }
    }
  }

  // "Q1 2026", "Q1 FY26"
  const quarter = /^(Q[1-4])[\s-]*(?:FY\s*)?(\d{2,4})$/i.exec(s);
  if (quarter) {
    let y = parseInt(quarter[2], 10);
    if (y < 100) y += 2000;
    if (y >= 1990 && y <= 2100) {
      const qIndex = parseInt(quarter[1][1], 10);
      const month = (qIndex - 1) * 3 + 1;
      return { label: s, year: y, month, sortKey: y * 100 + month };
    }
  }

  return null;
}

/** Match a cell label to a canonical metric key. Returns null if no match. */
export function matchMetric(label: unknown): MetricKey | null {
  const nl = norm(label).replace(/^total\s+/, "");
  if (!nl) return null;
  // Exact match against synonyms, respecting priority order.
  for (const key of METRIC_PRIORITY) {
    if (SYNONYMS[key].includes(nl)) return key;
  }
  // Loose match: label contains a synonym of reasonable length.
  for (const key of METRIC_PRIORITY) {
    for (const syn of SYNONYMS[key]) {
      if (syn.length >= 4 && nl.includes(syn)) return key;
    }
  }
  return null;
}

// ── Layout detection + row/column parsing ───────────────────────────────

interface Candidate {
  sheetName: string;
  layout: "columns" | "rows";
  score: number;
  periods: Period[];
  metrics: Partial<Record<MetricKey, (number | null)[]>>;
  extras: ExtraMetric[];
}

function tryColumnsLayout(
  sheetName: string,
  rows: unknown[][],
): Candidate | null {
  // Scan first 15 rows for a "period header row": ≥2 period-like cells.
  const maxScan = Math.min(rows.length, 15);
  let headerRow = -1;
  let periodCols: { col: number; period: Period }[] = [];
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] ?? [];
    const found: { col: number; period: Period }[] = [];
    for (let c = 0; c < row.length; c++) {
      const p = parsePeriod(row[c]);
      if (p) found.push({ col: c, period: p });
    }
    if (found.length >= 2 && found.length > periodCols.length) {
      headerRow = r;
      periodCols = found;
    }
  }
  if (headerRow < 0 || periodCols.length < 2) return null;

  const sortedCols = [...periodCols].sort(
    (a, b) => a.period.sortKey - b.period.sortKey,
  );
  const periods = sortedCols.map((c) => c.period);
  const firstPeriodCol = Math.min(...sortedCols.map((c) => c.col));

  const metrics: Partial<Record<MetricKey, (number | null)[]>> = {};
  const totalsTaken = new Set<MetricKey>();
  const extras: ExtraMetric[] = [];

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    // Label = first non-empty text cell strictly before the first period column.
    let label = "";
    for (let c = 0; c < firstPeriodCol; c++) {
      const v = row[c];
      if (typeof v === "string" && v.trim()) {
        label = v.trim();
        break;
      }
    }
    if (!label) continue;

    const values = sortedCols.map((pc) => toNumber(row[pc.col]));
    if (values.every((v) => v === null)) continue;

    const key = matchMetric(label);
    const isTotal = /^total\s+/i.test(label);
    if (key) {
      if (!metrics[key] || (isTotal && !totalsTaken.has(key))) {
        metrics[key] = values;
        if (isTotal) totalsTaken.add(key);
      }
    } else {
      extras.push({ label, values });
    }
  }

  const score = Object.keys(metrics).length * periods.length;
  return { sheetName, layout: "columns", score, periods, metrics, extras };
}

function tryRowsLayout(
  sheetName: string,
  rows: unknown[][],
): Candidate | null {
  // Find a column where most cells are period-like.
  const maxColsScan = 8;
  let periodCol = -1;
  let periodCells: { row: number; period: Period }[] = [];
  for (let c = 0; c < maxColsScan; c++) {
    const found: { row: number; period: Period }[] = [];
    for (let r = 0; r < rows.length; r++) {
      const p = parsePeriod(rows[r]?.[c]);
      if (p) found.push({ row: r, period: p });
    }
    if (found.length >= 2 && found.length > periodCells.length) {
      periodCol = c;
      periodCells = found;
    }
  }
  if (periodCol < 0 || periodCells.length < 2) return null;

  const sortedRows = [...periodCells].sort(
    (a, b) => a.period.sortKey - b.period.sortKey,
  );
  const periods = sortedRows.map((r) => r.period);

  // Header row is the row immediately above the first period row, if it has text labels.
  const firstPeriodRow = Math.min(...periodCells.map((p) => p.row));
  const headerRow =
    firstPeriodRow > 0 ? rows[firstPeriodRow - 1] ?? [] : [];

  const metrics: Partial<Record<MetricKey, (number | null)[]>> = {};
  const totalsTaken = new Set<MetricKey>();
  const extras: ExtraMetric[] = [];

  // Each column to the right of `periodCol` is a potential metric.
  const maxCol = Math.max(
    ...rows.map((row) => (row ? row.length : 0)),
    headerRow.length,
  );
  for (let c = periodCol + 1; c < maxCol; c++) {
    const label = typeof headerRow[c] === "string" ? (headerRow[c] as string).trim() : "";
    if (!label) continue;

    const values = sortedRows.map((pr) => toNumber(rows[pr.row]?.[c]));
    if (values.every((v) => v === null)) continue;

    const key = matchMetric(label);
    const isTotal = /^total\s+/i.test(label);
    if (key) {
      if (!metrics[key] || (isTotal && !totalsTaken.has(key))) {
        metrics[key] = values;
        if (isTotal) totalsTaken.add(key);
      }
    } else {
      extras.push({ label, values });
    }
  }

  const score = Object.keys(metrics).length * periods.length;
  return { sheetName, layout: "rows", score, periods, metrics, extras };
}

// ── Meta sheet parsing ───────────────────────────────────────────────────

function pickMetaSheet(wb: XLSX.WorkBook): string | null {
  const candidates = ["summary", "company", "meta", "info", "overview"];
  const lower = wb.SheetNames.map((n) => n.toLowerCase());
  for (const c of candidates) {
    const i = lower.indexOf(c);
    if (i >= 0) return wb.SheetNames[i];
  }
  for (const c of candidates) {
    for (let i = 0; i < lower.length; i++) {
      if (lower[i].includes(c)) return wb.SheetNames[i];
    }
  }
  return null;
}

function parseMeta(wb: XLSX.WorkBook): Partial<FinancialMeta> {
  const sheetName = pickMetaSheet(wb);
  if (!sheetName) return {};
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    blankrows: false,
  });
  const kv: Record<string, unknown> = {};
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 2) continue;
    const k = norm(r[0]);
    if (!k || k === "field") continue;
    kv[k] = r[1];
  }
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (kv[k] !== undefined && kv[k] !== null && kv[k] !== "") return kv[k];
    }
    return undefined;
  };
  const currency = pick("currency", "currency code");
  const raise = pick("raise amount", "raise", "round size", "target raise");
  const val = pick("valuation", "pre-money valuation", "post-money valuation");
  const stage = pick("stage", "round", "funding stage");
  const name = pick("company name", "company", "name");

  return {
    companyName: name !== undefined ? String(name) : undefined,
    currency: currency ? String(currency).toUpperCase() : undefined,
    stage: stage !== undefined ? String(stage) : undefined,
    raiseAmount: raise !== undefined ? toNumber(raise) ?? undefined : undefined,
    valuation: val !== undefined ? toNumber(val) ?? undefined : undefined,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────

/** Parse a workbook into a canonical FinancialModel. Throws on unrecoverable errors. */
export function parseWorkbook(wb: XLSX.WorkBook): ParseResult {
  const warnings: string[] = [];

  // Evaluate every sheet under both layouts, pick the highest-scoring combo.
  const candidates: Candidate[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      blankrows: false,
    });
    if (rows.length === 0) continue;
    const col = tryColumnsLayout(name, rows);
    const row = tryRowsLayout(name, rows);
    if (col) candidates.push(col);
    if (row) candidates.push(row);
  }

  if (candidates.length === 0) {
    throw new Error(
      "No projection table detected. We look for at least two year or date columns (or rows) with labeled metric rows (or columns) nearby.",
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best.score === 0) {
    throw new Error(
      "Found period columns but couldn't match any metric labels (Revenue, Cash, Headcount, …). Check the row labels in your sheet.",
    );
  }

  // Skipped alternatives worth surfacing.
  for (const c of candidates.slice(1)) {
    if (c.sheetName !== best.sheetName && c.score > 0) {
      warnings.push(
        `Also found a projection table on sheet "${c.sheetName}" (${c.layout}, ${Object.keys(c.metrics).length} metrics). Using "${best.sheetName}".`,
      );
    }
  }

  const meta = parseMeta(wb);

  const model: FinancialModel = {
    periods: best.periods,
    metrics: best.metrics,
    extras: best.extras,
    meta: {
      companyName: meta.companyName,
      currency: meta.currency ?? "USD",
      stage: meta.stage,
      raiseAmount: meta.raiseAmount,
      valuation: meta.valuation,
      sourceSheet: best.sheetName,
      layout: best.layout,
    },
  };

  return { model, warnings };
}

/** Convenience wrapper: parse a File or ArrayBuffer directly. */
export async function parseFinancialProjection(
  input: File | ArrayBuffer,
): Promise<ParseResult> {
  const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  return parseWorkbook(wb);
}

// ── Derived helpers available to UI layers ───────────────────────────────

/**
 * Compute standard derived series (gross profit/margin, net income, runway…)
 * from whatever raw metrics are present. Returns only what can be computed.
 */
export function deriveSeries(model: FinancialModel) {
  const { periods, metrics } = model;
  const n = periods.length;
  const rev = metrics.revenue ?? metrics.arr;
  const cogs = metrics.cogs;
  const opex = metrics.opex;

  const grossProfit: (number | null)[] | undefined = metrics.grossProfit
    ? metrics.grossProfit
    : rev && cogs
      ? rev.map((r, i) => (r !== null && cogs[i] !== null ? r - (cogs[i] as number) : null))
      : undefined;

  const grossMargin: (number | null)[] | undefined = rev && grossProfit
    ? rev.map((r, i) =>
        r !== null && grossProfit[i] !== null && r !== 0
          ? ((grossProfit[i] as number) / r) * 100
          : null,
      )
    : undefined;

  const netIncome: (number | null)[] | undefined = metrics.netIncome
    ? metrics.netIncome
    : grossProfit && opex
      ? grossProfit.map((gp, i) =>
          gp !== null && opex[i] !== null ? gp - (opex[i] as number) : null,
        )
      : undefined;

  const netMargin: (number | null)[] | undefined = rev && netIncome
    ? rev.map((r, i) =>
        r !== null && netIncome[i] !== null && r !== 0
          ? ((netIncome[i] as number) / r) * 100
          : null,
      )
    : undefined;

  const getPeriodMonthIndex = (period: Period): number => {
    if (period.month !== undefined) {
      return period.year * 12 + (period.month - 1);
    }
    }
    return period.year * 12;
  };

  const getElapsedMonths = (start: Period, end: Period): number => {
    return getPeriodMonthIndex(end) - getPeriodMonthIndex(start);
  };

  // Annualized growth on primary top-line series (revenue preferred, else ARR),
  // using actual elapsed time between adjacent periods.
  const yoyGrowth: (number | null)[] | undefined = rev
    ? rev.map((r, i) => {
        if (i === 0 || r === null) return null;
        const prev = rev[i - 1];
        if (prev === null || prev <= 0 || r <= 0) return null;

        const elapsedMonths = getElapsedMonths(periods[i - 1], periods[i]);
        if (elapsedMonths <= 0) return null;

        return (Math.pow(r / prev, 12 / elapsedMonths) - 1) * 100;
      })
    : undefined;

  // CAGR on primary top-line, first non-null → last non-null, annualized using
  // the actual elapsed time between those periods.
  let cagr: number | null = null;
  if (rev && n >= 2) {
    let firstIndex = -1;
    let lastIndex = -1;

    for (let i = 0; i < n; i++) {
      if (rev[i] !== null) {
        firstIndex = i;
        break;
      }
    }

    for (let i = n - 1; i >= 0; i--) {
      if (rev[i] !== null) {
        lastIndex = i;
        break;
      }
    }

    if (firstIndex !== -1 && lastIndex !== -1 && lastIndex > firstIndex) {
      const first = rev[firstIndex] as number;
      const last = rev[lastIndex] as number;
      const elapsedMonths = getElapsedMonths(periods[firstIndex], periods[lastIndex]);

      if (first > 0 && last > 0 && elapsedMonths > 0) {
        cagr = (Math.pow(last / first, 12 / elapsedMonths) - 1) * 100;
      }
    }
  }

  // Runway at last-period burn, in months.
  // Convert the last period's net income into a monthly burn rate based on
  // the spacing between consecutive period sort keys:
  //   monthly => 1, quarterly => 3, annual => 12.
  let runwayMonths: number | null = null;
  const cash = metrics.cashBalance;
  if (cash && netIncome && n > 0) {
    const lastCash = cash[n - 1];
    const lastNi = netIncome[n - 1];
    if (lastCash !== null && lastNi !== null && lastNi < 0) {
      const stepSizes = periods
        .slice(1)
        .map((period, i) => period.sortKey - periods[i].sortKey)
        .filter((delta) => delta > 0);

      const inferredMonthsPerPeriod =
        stepSizes.length > 0 && stepSizes.every((delta) => delta === stepSizes[0])
    ? (stepSizes[0] <= 12 ? stepSizes[0] : Math.round(stepSizes[0] / 100 * 12))
          : periods.every((p) => p.month !== undefined)
            ? 1
            : 12;

      const burnPerMonth = -lastNi / inferredMonthsPerPeriod;
      runwayMonths = burnPerMonth > 0 ? lastCash / burnPerMonth : null;
    }
  }

  // Rule of 40: growth% + ebitda margin% (or net margin if ebitda missing).
  let ruleOf40Last: number | null = null;
  if (yoyGrowth && (metrics.ebitda || netMargin)) {
    const lastGrowth = yoyGrowth[n - 1];
    const marginSeries = metrics.ebitda && rev
      ? rev.map((r, i) =>
          r !== null && metrics.ebitda![i] !== null && r !== 0
            ? ((metrics.ebitda![i] as number) / r) * 100
            : null,
        )
      : netMargin;
    const lastMargin = marginSeries ? marginSeries[n - 1] : null;
    if (lastGrowth !== null && lastMargin !== null) {
      ruleOf40Last = lastGrowth + lastMargin;
    }
  }

  return {
    grossProfit, grossMargin, netIncome, netMargin,
    yoyGrowth, cagr, runwayMonths, ruleOf40Last,
  };
}
