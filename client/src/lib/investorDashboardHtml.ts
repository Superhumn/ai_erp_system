import type { FinancialModel } from "./financialProjectionParser";
import { deriveSeries } from "./financialProjectionParser";

// ── Formatters ────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", CAD: "C$", AUD: "A$", INR: "₹", JPY: "¥",
};

function sym(cur: string) {
  return CURRENCY_SYMBOL[cur.toUpperCase()] ?? `${cur} `;
}

function fmtMoney(n: number | null | undefined, currency = "USD") {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const s = n < 0 ? "-" : "";
  const $ = sym(currency);
  if (abs >= 1_000_000_000) return `${s}${$}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${s}${$}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${s}${$}${(abs / 1_000).toFixed(0)}K`;
  return `${s}${$}${abs.toFixed(0)}`;
}

function fmtAxis(n: number, currency = "USD") {
  const abs = Math.abs(n);
  const $ = sym(currency);
  if (abs >= 1_000_000) return `${$}${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${$}${(n / 1_000).toFixed(0)}K`;
  return `${$}${n.toFixed(0)}`;
}

function fmtPct(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function fmtNumber(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── SVG chart helpers ────────────────────────────────────────────────────

const CHART_W = 440;
const CHART_H = 220;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

interface Series {
  label: string;
  values: (number | null)[];
  color: string;
}

function niceBounds(min: number, max: number): { min: number; max: number } {
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return { min: min - pad, max: max + pad };
  }
  const range = max - min;
  const pad = range * 0.08;
  return { min: min - pad, max: max + pad };
}

function seriesBounds(series: Series[]): { min: number; max: number } {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (all.length === 0) return { min: 0, max: 1 };
  return niceBounds(Math.min(...all, 0), Math.max(...all, 0));
}

function stackedBarBounds(series: Series[]): { min: number; max: number } {
  const n = series[0]?.values.length ?? 0;
  let maxStack = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const s of series) {
      const v = s.values[i];
      if (v !== null && v > 0) sum += v;
    }
    if (sum > maxStack) maxStack = sum;
  }
  return { min: 0, max: maxStack > 0 ? maxStack * 1.1 : 1 };
}

/** 4-step axis ticks rounded to human-friendly values. */
function axisTicks(min: number, max: number, steps = 4): number[] {
  if (min === max) return [min];
  const range = max - min;
  const rawStep = range / steps;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 2.5, 5, 10].map((f) => f * pow);
  const step = candidates.find((c) => c >= rawStep) ?? pow * 10;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

function svgHeader(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_W} ${CHART_H}" width="100%" height="${CHART_H}" role="img">`;
}

function axesAndGrid(
  xLabels: string[],
  yBounds: { min: number; max: number },
  yFormat: (n: number) => string,
): string {
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const ticks = axisTicks(yBounds.min, yBounds.max);
  const y = (val: number) =>
    PAD_T + plotH - ((val - yBounds.min) / (yBounds.max - yBounds.min || 1)) * plotH;

  let out = "";
  // Horizontal grid lines + y-labels
  for (const t of ticks) {
    const yy = y(t);
    out += `<line x1="${PAD_L}" y1="${yy.toFixed(1)}" x2="${PAD_L + plotW}" y2="${yy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 3" />`;
    out += `<text x="${PAD_L - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b" font-family="system-ui, sans-serif">${esc(yFormat(t))}</text>`;
  }
  // X labels
  const n = xLabels.length;
  xLabels.forEach((lbl, i) => {
    const x = n === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (n - 1)) * plotW;
    out += `<text x="${x.toFixed(1)}" y="${(PAD_T + plotH + 16).toFixed(1)}" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui, sans-serif">${esc(lbl)}</text>`;
  });
  return out;
}

function renderLineChart(
  series: Series[],
  xLabels: string[],
  yFormat: (n: number) => string,
): string {
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const n = xLabels.length;
  const bounds = seriesBounds(series);
  const y = (val: number) =>
    PAD_T + plotH - ((val - bounds.min) / (bounds.max - bounds.min || 1)) * plotH;
  const x = (i: number) => (n === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (n - 1)) * plotW);

  let out = svgHeader();
  out += axesAndGrid(xLabels, bounds, yFormat);

  for (const s of series) {
    // Path
    let d = "";
    s.values.forEach((v, i) => {
      if (v === null) return;
      const cmd = d === "" ? "M" : "L";
      d += `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    if (d) {
      out += `<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    // Dots
    s.values.forEach((v, i) => {
      if (v === null) return;
      out += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}" />`;
    });
  }

  // Legend (top-right)
  let lx = CHART_W - PAD_R;
  for (let i = series.length - 1; i >= 0; i--) {
    const s = series[i];
    const tw = s.label.length * 5.5 + 18;
    lx -= tw + 6;
    out += `<rect x="${lx.toFixed(1)}" y="4" width="10" height="10" fill="${s.color}" rx="2" />`;
    out += `<text x="${(lx + 14).toFixed(1)}" y="13" font-size="10" fill="#334155" font-family="system-ui, sans-serif">${esc(s.label)}</text>`;
  }

  out += "</svg>";
  return out;
}

function renderAreaChart(
  s: Series,
  xLabels: string[],
  yFormat: (n: number) => string,
): string {
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const n = xLabels.length;
  const bounds = seriesBounds([s]);
  const y = (val: number) =>
    PAD_T + plotH - ((val - bounds.min) / (bounds.max - bounds.min || 1)) * plotH;
  const x = (i: number) => (n === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (n - 1)) * plotW);

  let out = svgHeader();
  // Gradient def
  out += `<defs><linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">`;
  out += `<stop offset="0%" stop-color="${s.color}" stop-opacity="0.45" />`;
  out += `<stop offset="100%" stop-color="${s.color}" stop-opacity="0.05" /></linearGradient></defs>`;
  out += axesAndGrid(xLabels, bounds, yFormat);

  // Build area path
  let top = "";
  s.values.forEach((v, i) => {
    if (v === null) return;
    const cmd = top === "" ? "M" : "L";
    top += `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  if (top) {
    const firstI = s.values.findIndex((v) => v !== null);
    const lastI = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null);
    const baseline = y(bounds.min);
    const closeR = `L${x(lastI).toFixed(1)},${baseline.toFixed(1)} L${x(firstI).toFixed(1)},${baseline.toFixed(1)} Z`;
    out += `<path d="${top.trim()} ${closeR}" fill="url(#area-grad)" />`;
    out += `<path d="${top.trim()}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" />`;
  }
  s.values.forEach((v, i) => {
    if (v === null) return;
    out += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}" />`;
  });

  out += `<text x="${CHART_W - PAD_R}" y="13" text-anchor="end" font-size="10" fill="#334155" font-family="system-ui, sans-serif">${esc(s.label)}</text>`;
  out += "</svg>";
  return out;
}

function renderStackedBarChart(
  series: Series[],
  xLabels: string[],
  yFormat: (n: number) => string,
): string {
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const n = xLabels.length;
  const bounds = stackedBarBounds(series);
  const y = (val: number) =>
    PAD_T + plotH - ((val - bounds.min) / (bounds.max - bounds.min || 1)) * plotH;
  const bandW = plotW / Math.max(n, 1);
  const barW = Math.min(bandW * 0.55, 40);

  let out = svgHeader();
  out += axesAndGrid(xLabels, bounds, yFormat);

  for (let i = 0; i < n; i++) {
    const cx = PAD_L + bandW * (i + 0.5);
    let yCursor = y(0);
    for (const s of series) {
      const v = s.values[i];
      if (v === null || v <= 0) continue;
      const h = y(0) - y(v);
      const yTop = yCursor - h;
      out += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" rx="2" />`;
      yCursor = yTop;
    }
  }

  // Legend
  let lx = CHART_W - PAD_R;
  for (let i = series.length - 1; i >= 0; i--) {
    const s = series[i];
    const tw = s.label.length * 5.5 + 18;
    lx -= tw + 6;
    out += `<rect x="${lx.toFixed(1)}" y="4" width="10" height="10" fill="${s.color}" rx="2" />`;
    out += `<text x="${(lx + 14).toFixed(1)}" y="13" font-size="10" fill="#334155" font-family="system-ui, sans-serif">${esc(s.label)}</text>`;
  }

  out += "</svg>";
  return out;
}

// ── Main entry ───────────────────────────────────────────────────────────

export interface SnapshotOptions {
  /** Override company name if not in the Summary sheet. */
  companyName?: string;
  /** ISO date string or human-readable date shown in the footer. */
  generatedAt?: string;
}

const CHART_COLORS = {
  revenue: "#2563eb",
  netIncome: "#10b981",
  cogs: "#f59e0b",
  opex: "#8b5cf6",
  cash: "#06b6d4",
  headcount: "#0ea5e9",
};

/**
 * Convert a parsed FinancialModel into a standalone HTML document — self-
 * contained styles, inline SVG charts, no external resources. Safe to save as
 * a .html file and view in any browser.
 */
export function renderInvestorDashboardHtml(
  model: FinancialModel,
  opts: SnapshotOptions = {},
): string {
  const currency = model.meta.currency || "USD";
  const derived = deriveSeries(model);
  const periods = model.periods;
  const xLabels = periods.map((p) => p.label);

  const companyName = opts.companyName || model.meta.companyName || "Company";
  const generatedAt = opts.generatedAt || new Date().toISOString().slice(0, 10);

  // ── KPI values ─────────────────────────────────────────────────────────
  const top = model.metrics.revenue ?? model.metrics.arr ?? [];
  const topLabel = model.metrics.revenue ? "Revenue" : "ARR";
  const topValues = top.filter((v): v is number => v !== null);
  const firstTop = topValues.length > 0 ? topValues[0] : null;
  const lastTop = topValues.length > 0 ? topValues[topValues.length - 1] : null;
  const firstYear = periods[0]?.year;
  const lastYear = periods[periods.length - 1]?.year;
  const cash = model.metrics.cashBalance;
  const lastCash = cash ? cash[cash.length - 1] : null;
  const numericCash = cash?.filter((v): v is number => v !== null) ?? [];
  const minCash = numericCash.length > 0 ? Math.min(...numericCash) : null;
  const lastNi = derived.netIncome
    ? [...derived.netIncome].reverse().find((v): v is number => v !== null) ?? null
    : null;
  const lastBurn = lastNi !== null && lastNi < 0 ? -lastNi : null;
  const peakHeadcount = model.metrics.headcount
    ? Math.max(...model.metrics.headcount.filter((v): v is number => v !== null))
    : null;

  const kpis: { label: string; value: string; sub?: string }[] = [
    {
      label: `${lastYear ?? ""} ${topLabel}`.trim(),
      value: fmtMoney(lastTop, currency),
      sub: firstYear ? `from ${fmtMoney(firstTop, currency)} in ${firstYear}` : undefined,
    },
    {
      label: `${topLabel} CAGR`,
      value: fmtPct(derived.cagr),
      sub: `${periods.length}-period plan`,
    },
  ];
  if (lastCash !== null) {
    kpis.push({
      label: "Ending Cash",
      value: fmtMoney(lastCash, currency),
      sub: minCash !== null ? `min ${fmtMoney(minCash, currency)}` : undefined,
    });
  }
  kpis.push({
    label: "Period-end Burn",
    value: lastBurn === null ? "—" : lastBurn > 0 ? fmtMoney(lastBurn, currency) : "Profitable",
    sub:
      lastBurn !== null && lastBurn > 0 && derived.runwayMonths !== null && Number.isFinite(derived.runwayMonths)
        ? `${derived.runwayMonths.toFixed(0)} months runway`
        : undefined,
  });
  if (peakHeadcount !== null) {
    kpis.push({ label: "Peak Headcount", value: fmtNumber(peakHeadcount) });
  }

  // ── Chart series ───────────────────────────────────────────────────────
  const moneyFmt = (n: number) => fmtAxis(n, currency);

  const chartCards: { title: string; desc: string; svg: string }[] = [];

  if (top.length > 0) {
    const revSeries: Series[] = [
      { label: topLabel, values: top.map((v) => v ?? null), color: CHART_COLORS.revenue },
    ];
    if (derived.netIncome) {
      revSeries.push({
        label: "Net Income",
        values: derived.netIncome,
        color: CHART_COLORS.netIncome,
      });
    }
    chartCards.push({
      title: `${topLabel} & Net Income`,
      desc: "Top line vs. bottom line",
      svg: renderLineChart(revSeries, xLabels, moneyFmt),
    });
  }

  if (model.metrics.cogs || model.metrics.opex) {
    const costSeries: Series[] = [];
    if (model.metrics.cogs) {
      costSeries.push({
        label: "COGS",
        values: model.metrics.cogs,
        color: CHART_COLORS.cogs,
      });
    }
    if (model.metrics.opex) {
      costSeries.push({
        label: "OpEx",
        values: model.metrics.opex,
        color: CHART_COLORS.opex,
      });
    }
    chartCards.push({
      title: "Cost Structure",
      desc: "COGS and Operating Expenses",
      svg: renderStackedBarChart(costSeries, xLabels, moneyFmt),
    });
  }

  if (cash) {
    chartCards.push({
      title: "Cash Balance",
      desc: "Year-end cash position",
      svg: renderAreaChart(
        { label: "Cash", values: cash, color: CHART_COLORS.cash },
        xLabels,
        moneyFmt,
      ),
    });
  }

  if (model.metrics.headcount) {
    chartCards.push({
      title: "Headcount",
      desc: "Team size over the plan",
      svg: renderLineChart(
        [{ label: "Headcount", values: model.metrics.headcount, color: CHART_COLORS.headcount }],
        xLabels,
        (n) => fmtNumber(n),
      ),
    });
  }

  // ── Yearly table ───────────────────────────────────────────────────────
  const tableRows = periods.map((p, i) => {
    const rev = top[i] ?? null;
    const cogsV = model.metrics.cogs?.[i] ?? null;
    const gp = derived.grossProfit?.[i] ?? null;
    const gm = derived.grossMargin?.[i] ?? null;
    const opexV = model.metrics.opex?.[i] ?? null;
    const ni = derived.netIncome?.[i] ?? null;
    const nm = derived.netMargin?.[i] ?? null;
    const cashV = model.metrics.cashBalance?.[i] ?? null;
    const hc = model.metrics.headcount?.[i] ?? null;
    const niClass = ni !== null && ni < 0 ? "negative" : ni !== null ? "positive" : "";
    return `
      <tr>
        <td>${esc(p.label)}</td>
        <td>${rev === null ? "—" : fmtMoney(rev, currency)}</td>
        <td>${cogsV === null ? "—" : fmtMoney(cogsV, currency)}</td>
        <td>${gp === null ? "—" : fmtMoney(gp, currency)}</td>
        <td>${fmtPct(gm)}</td>
        <td>${opexV === null ? "—" : fmtMoney(opexV, currency)}</td>
        <td class="${niClass}">${ni === null ? "—" : fmtMoney(ni, currency)}</td>
        <td>${fmtPct(nm)}</td>
        <td>${cashV === null ? "—" : fmtMoney(cashV, currency)}</td>
        <td>${hc === null ? "—" : fmtNumber(hc)}</td>
      </tr>
    `;
  }).join("");

  // ── Meta items ─────────────────────────────────────────────────────────
  const metaItems: { label: string; value: string }[] = [];
  if (model.meta.stage) metaItems.push({ label: "Stage", value: model.meta.stage });
  if (model.meta.raiseAmount !== undefined && model.meta.raiseAmount !== null) {
    metaItems.push({ label: "Target raise", value: fmtMoney(model.meta.raiseAmount, currency) });
  }
  if (model.meta.valuation !== undefined && model.meta.valuation !== null) {
    metaItems.push({ label: "Valuation", value: fmtMoney(model.meta.valuation, currency) });
  }
  metaItems.push({
    label: "Plan",
    value: firstYear && lastYear ? `${firstYear}–${lastYear}` : `${periods.length} periods`,
  });

  // ── HTML assembly ─────────────────────────────────────────────────────
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(companyName)} · Investor Dashboard</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; line-height: 1.5; }
  main { max-width: 980px; margin: 0 auto; padding: 48px 24px 64px; }
  header { border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 28px; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; font-weight: 600; }
  .subtitle { color: #64748b; font-size: 14px; }
  .meta { display: flex; gap: 28px; flex-wrap: wrap; margin-top: 16px; }
  .meta-item { display: flex; flex-direction: column; gap: 2px; }
  .meta-label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
  .meta-value { color: #0f172a; font-weight: 600; font-size: 15px; }
  h2 { font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin: 28px 0 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  @media (max-width: 720px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
  .kpi-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; background: #fff; }
  .kpi-label { font-size: 11px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
  .kpi-value { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  .kpi-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 12px; }
  @media (max-width: 720px) { .charts-grid { grid-template-columns: 1fr; } }
  .chart-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px 16px; background: #fff; }
  .chart-title { font-size: 14px; font-weight: 600; margin: 0 0 2px; }
  .chart-desc { font-size: 12px; color: #64748b; margin-bottom: 8px; }
  .table-card { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { padding: 12px 14px; background: #f1f5f9; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; text-align: right; }
  thead th:first-child { text-align: left; }
  tbody td { padding: 10px 14px; border-top: 1px solid #e2e8f0; text-align: right; }
  tbody td:first-child { text-align: left; font-weight: 500; }
  .positive { color: #059669; font-weight: 500; }
  .negative { color: #dc2626; font-weight: 500; }
  footer { color: #94a3b8; font-size: 11px; text-align: center; margin-top: 40px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(companyName)}</h1>
    <div class="subtitle">Investor Dashboard</div>
    <div class="meta">
      ${metaItems.map((m) => `
        <div class="meta-item">
          <span class="meta-label">${esc(m.label)}</span>
          <span class="meta-value">${esc(m.value)}</span>
        </div>
      `).join("")}
    </div>
  </header>

  <h2>Key Metrics</h2>
  <div class="kpi-grid">
    ${kpis.map((k) => `
      <div class="kpi-card">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value">${esc(k.value)}</div>
        ${k.sub ? `<div class="kpi-sub">${esc(k.sub)}</div>` : ""}
      </div>
    `).join("")}
  </div>

  ${chartCards.length > 0 ? `
    <h2>Charts</h2>
    <div class="charts-grid">
      ${chartCards.map((c) => `
        <div class="chart-card">
          <div class="chart-title">${esc(c.title)}</div>
          <div class="chart-desc">${esc(c.desc)}</div>
          ${c.svg}
        </div>
      `).join("")}
    </div>
  ` : ""}

  <h2>Yearly Summary</h2>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th>Period</th>
          <th>${esc(topLabel)}</th>
          <th>COGS</th>
          <th>Gross Profit</th>
          <th>GM %</th>
          <th>OpEx</th>
          <th>Net Income</th>
          <th>NM %</th>
          <th>Cash</th>
          <th>Team</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>

  <footer>
    Snapshot generated ${esc(generatedAt)}
  </footer>
</main>
</body>
</html>`;
}
