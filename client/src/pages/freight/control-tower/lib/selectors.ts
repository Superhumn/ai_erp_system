// ============================================================================
// View-model selectors. Pure functions: (snapshot, palette, opts) -> view data.
// No React, no handlers baked in — rows carry a `ref` and links carry a `pivot`
// descriptor; the components wire the actual onClick. All colour comes from the
// resolved palette so the board follows the host theme.
// ============================================================================

import {
  DOC_TYPES, ETA_NOTE, VENDORS, AXIS0, AXIS_DAYS, DAY, TODAY, MNAMES,
  type Shipment, type Vendor, type CoverRow, type ClockEvent,
} from "@shared/freight-control-tower/fixtures";
import { ICON, ICON_PATH, STATUS_TONE, STATE_TONE, PCODE } from "@shared/freight-control-tower/marks";
import { parseDay, HORIZON, type CoverProjection } from "@shared/freight-control-tower/projection";
import { toneHex, type Palette } from "./palette";

const A = (hex: string, suffix: string) => `${hex}${suffix}`; // literal alpha-hex append

// ── generic money helpers ──────────────────────────────────────────────────
export function moneyN(s: unknown): number | null {
  const m = String(s).match(/-?[\d][\d,]*(\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}
export function money(arr: Record<string, unknown>[], key: string): number {
  return arr.reduce((n, r) => n + Number(String(r[key]).replace(/[^0-9.]/g, "") || 0), 0);
}
export function fmt(n: number): string {
  return n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M"
    : n >= 1e4 ? "$" + Math.round(n / 1000) + "K"
    : n >= 1e3 ? "$" + (n / 1000).toFixed(1) + "K"
    : "$" + Math.round(n);
}

// ── date / axis helpers ─────────────────────────────────────────────────────
export function pctOf(ms: number): number {
  return Math.max(0, Math.min(100, ((ms - AXIS0) / DAY) / AXIS_DAYS * 100));
}
export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MNAMES[d.getUTCMonth()]}`;
}

// ── document envelope ───────────────────────────────────────────────────────
export type DocStatus = "ok" | "missing" | "pending" | "filed" | "fail" | "na";
export interface DocRow { name: string; status: DocStatus; }

export function docsFor(s: Shipment): DocRow[] {
  const issues = s.docIssues || {};
  return DOC_TYPES.map((name) => {
    let n: string = name;
    if (name === "Bill of Lading" && s.mode === "AIR") n = "Air Waybill";
    if (name === "Bill of Lading" && s.mode === "TRK") n = "Delivery Note";
    let st: DocStatus = "ok";
    if (issues[name]) st = issues[name] as DocStatus;
    else if (name === "Commercial Invoice" && s.inv === "pending") st = "pending";
    else if (name === "Customs Entry") st = s.prog < 0.5 ? "pending" : (s.status === "At Customs" ? "filed" : "ok");
    else if (name === "Inspection Report") st = s.prog < 0.9 ? "pending" : (s.status === "QC Hold" ? "fail" : "ok");
    else if (name === "Insurance Certificate" && s.incoterm.indexOf("FOB") === 0) st = "na";
    else if (name === "Bill of Lading" && s.prog < 0.25) st = "pending";
    return { name: n, status: st };
  });
}
export function docColor(st: DocStatus, C: Palette): string {
  if (st === "missing" || st === "fail") return C.red;
  if (st === "pending" || st === "filed") return C.amber;
  if (st === "na") return C.lineMuted;
  return C.green;
}
export function docSummary(docs: DocRow[], C: Palette) {
  const missing = docs.filter((d) => d.status === "missing").length;
  const failed = docs.filter((d) => d.status === "fail").length;
  const pend = docs.filter((d) => d.status === "pending" || d.status === "filed").length;
  const ok = docs.filter((d) => d.status === "ok").length;
  const total = docs.filter((d) => d.status !== "na").length;
  if (missing && failed) return { text: `${missing} missing · ${failed} failed`, color: C.red, missing, failed };
  if (missing) return { text: `${missing} missing`, color: C.red, missing, failed };
  if (failed) return { text: `${failed} failed`, color: C.red, missing, failed };
  if (pend) return { text: `${ok} of ${total}`, color: C.amber, missing, failed };
  return { text: "complete", color: C.green, missing, failed };
}

// ── decorate: enrich every shipment for display ─────────────────────────────
export interface Decorated extends Shipment {
  _docs: DocRow[];
  docSummary: string; docColor: string; docsMissing: number; docsFailed: number;
  docPips: { color: string }[];
  statusColor: string; statusBg: string; stateColor: string; stateBg: string;
  pct: string; lane: string; etaNote: string; etaColor: string; riskBar: string;
}

export function decorate(s: Shipment, C: Palette): Decorated {
  const docs = docsFor(s);
  const sum = docSummary(docs, C);
  const override = ETA_NOTE[s.ref];
  const note: [string, string] = override
    ? [override[0], toneHex(C, override[1])]
    : [
        s.status === "Received" ? "received" : s.status === "QC Hold" ? "quarantined" : "on plan",
        s.status === "QC Hold" ? C.red : C.mid,
      ];
  const statusColor = toneHex(C, STATUS_TONE[s.status] ?? "neutral");
  const stateColor = toneHex(C, STATE_TONE[s.state] ?? "teal");
  return {
    ...s,
    _docs: docs,
    docSummary: sum.text, docColor: sum.color, docsMissing: sum.missing, docsFailed: sum.failed,
    docPips: docs.map((d) => ({ color: docColor(d.status, C) })),
    statusColor, statusBg: A(statusColor, "22"),
    stateColor, stateBg: A(stateColor, "22"),
    pct: Math.round(s.prog * 100) + "%",
    lane: s.origin + " → " + s.dest,
    etaNote: note[0], etaColor: note[1],
    riskBar: s.flag ? toneHex(C, s.flag.tone) : "transparent",
  };
}
export function decorateAll(shipments: Shipment[], C: Palette): Decorated[] {
  return shipments.map((s) => decorate(s, C));
}

// ── filter (KPI focus + search) and sort ────────────────────────────────────
export type FocusId = "exceptions" | "transit" | "customs" | "duty" | "docs";
export const TESTS: Record<FocusId, (r: Decorated) => boolean> = {
  exceptions: (r) => !!r.flag,
  transit: (r) => r.status === "In Transit",
  customs: (r) => r.status === "At Customs",
  duty: (r) => {
    const a = moneyN(r.dutyAct), e = moneyN(r.dutyEst);
    return a != null && e != null && Math.abs(a - e) > 0.5;
  },
  docs: (r) => r.docsMissing > 0,
};

export function filterSort(all: Decorated[], cut: FocusId | null, query: string): Decorated[] {
  const q = query.trim().toLowerCase();
  const rows = all.filter((r) => {
    if (cut && !TESTS[cut](r)) return false;
    if (q && [r.ref, r.po, r.sku, r.supplier, r.origin, r.dest, r.skuName, r.originPort, r.destPort, r.hs]
        .join(" ").toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  rows.sort((a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0) || a.eta.localeCompare(b.eta));
  return rows;
}

export function resultSummary(rows: Decorated[], all: Decorated[]): string {
  return `${rows.length} of ${all.length} movements · ${fmt(money(rows, "value"))} · ${rows.filter((r) => r.flag).length} flagged`;
}

// ── KPI strip ───────────────────────────────────────────────────────────────
export interface Kpi { id: FocusId; label: string; value: string; note: string; color: string; noteColor: string; bg: string; border: string; on: boolean; }

export function kpis(all: Decorated[], cut: FocusId | null, C: Palette, sla: number): Kpi[] {
  const flagged = all.filter((r) => r.flag);
  const nDocs = all.filter((r) => TESTS.docs(r)).length;
  const dutyRows = all.filter((r) => TESTS.duty(r));
  const dutyDelta = dutyRows.reduce((acc, r) => acc + ((moneyN(r.dutyAct) ?? 0) - (moneyN(r.dutyEst) ?? 0)), 0);
  const dutyNote = (dutyDelta >= 0 ? "+" : "−") + fmt(Math.abs(dutyDelta)) + " above estimate";
  const nFailed = all.filter((r) => r.docsFailed > 0).length;

  const tile = (id: FocusId, label: string, value: string, note: string, color: string): Kpi => {
    const on = cut === id;
    return {
      id, label, value, color, on,
      note: on ? "filtering · click to clear" : note,
      noteColor: on ? color : C.dim,
      bg: on ? A(color, "12") : C.surface2,
      border: on ? A(color, "66") : C.border,
    };
  };
  return [
    tile("exceptions", "Open exceptions", String(flagged.length), "2 breach SLA today", C.red),
    tile("transit", "In transit", String(all.filter(TESTS.transit).length), fmt(money(all.filter(TESTS.transit), "value")) + " moving", C.amber),
    tile("customs", "Held at customs", String(all.filter(TESTS.customs).length), "demurrage 02 Aug", C.red),
    tile("duty", "Duty variance", String(dutyRows.length), dutyNote, C.amber),
    tile("docs", "Docs missing", String(nDocs), nFailed ? "plus " + nFailed + " failed on test" : "due " + sla + "d before ETD", C.magenta),
  ];
}

// ── Runway ──────────────────────────────────────────────────────────────────
export interface RunwayRow {
  sku: string; name: string; plantCode: string; days: number;
  color: string; barColor: string;
  coverPct: string; gapLeft: string; gapW: string; extLeft: string; extW: string; extBg: string;
  arrLeft: string; note: string; noteColor: string; hasGap: boolean; onHand: string;
  ref: string | null; rowCursor: "pointer" | "default";
}

export function runway(
  cover: Record<string, CoverRow>, all: Decorated[], proj: Record<string, CoverProjection>, C: Palette,
): { rows: RunwayRow[]; note: string; ticks: { label: string }[] } {
  const RUN_H = HORIZON;
  const rpct = (d: number) => (Math.max(0, Math.min(RUN_H, d)) / RUN_H * 100).toFixed(1) + "%";

  const rows = Object.keys(cover).map((sku) => {
    const cv = cover[sku];
    const burn = cv.onHandN / cv.days;
    const src = all.find((r) => r.sku === sku);
    // Clamp inbound day offsets to >= 1, exactly as projectSku credits them,
    // so Runway/Today/Plant-wall geometry never contradicts the projection
    // (a past-dated but not-yet-received ETA lands "tomorrow", not today).
    const inb = all
      .filter((r) => r.sku === sku && r.prog < 1 && parseDay(r.eta) != null)
      .map((r) => ({ d: Math.max(1, Math.round((parseDay(r.eta)! - TODAY) / DAY)), qty: r.qtyN, ref: r.ref }))
      .sort((a, b) => a.d - b.d);
    const arr = inb.length ? inb[0] : null;
    const pl = proj[sku];
    const hasGap = !!pl?.hasGap;
    const out = hasGap ? (pl!.stockoutDay as number) : 0;

    let bal = cv.onHandN, back: number | null = null;
    for (let d = 0; d <= RUN_H; d++) {
      inb.filter((x) => x.d === d).forEach((x) => { bal += x.qty; });
      if (hasGap && d > out && back == null && bal > 0) back = d;
      bal -= burn;
    }
    const gapEnd = hasGap ? (back == null ? RUN_H : back) : 0;
    const color = hasGap ? C.red : cv.days <= 14 ? C.amber : C.green;
    const openRef = arr?.ref ?? src?.ref ?? null;
    return {
      sku, name: src?.skuName ?? sku, plantCode: PCODE[cv.plant] ?? cv.plant, days: cv.days, color,
      barColor: hasGap ? C.green : color,
      coverPct: rpct(cv.days),
      gapLeft: rpct(out), gapW: hasGap ? rpct(gapEnd - out) : "0%",
      extLeft: rpct(cv.days),
      extW: rpct(Math.max(0, (hasGap ? out : RUN_H) - cv.days)),
      extBg: arr ? A(C.blue, "2E") : "transparent",
      arrLeft: arr ? rpct(arr.d) : "-99%",
      note: hasGap ? fmtDay(TODAY + out * DAY) : (arr ? "covered" : "no inbound"),
      noteColor: hasGap ? C.red : C.faint,
      hasGap, onHand: cv.onHand,
      ref: openRef, rowCursor: openRef ? ("pointer" as const) : ("default" as const),
    };
  }).sort((a, b) => (b.hasGap ? 1 : 0) - (a.hasGap ? 1 : 0) || a.days - b.days);

  const short = rows.filter((r) => r.hasGap).length;
  const note = `${short} SKU${short === 1 ? " runs" : "s run"} short before the next arrival`;
  const ticks: { label: string }[] = [];
  for (let i = 0; i < 6; i++) ticks.push({ label: i === 0 ? "Today" : fmtDay(TODAY + Math.round(i * RUN_H / 6) * DAY) });
  return { rows, note, ticks };
}

// ── Plant wall ──────────────────────────────────────────────────────────────
export interface WallItem extends RunwayRow { barW: string; }
export interface WallCard { code: string; name: string; min: string; dot: string; border: string; bg: string; items: WallItem[]; }

export function plantWall(runwayRows: RunwayRow[], cover: Record<string, CoverRow>, plants: { key: string; name: string }[], C: Palette): WallCard[] {
  const RUN_H = HORIZON;
  return plants.map((pl) => {
    const items = runwayRows.filter((r) => cover[r.sku].plant === pl.key);
    const gapped = items.filter((x) => x.hasGap);
    const worst = gapped.length
      ? gapped.reduce((m, x) => (x.days < m.days ? x : m), gapped[0])
      : items.length ? items.reduce((m, x) => (x.days < m.days ? x : m), items[0]) : null;
    const risk = worst ? worst.color : C.green;
    return {
      code: PCODE[pl.key], name: pl.name, min: worst ? String(worst.days) : "—", dot: risk,
      border: risk === C.green ? C.border : A(risk, "55"),
      bg: risk === C.green ? C.surface : A(risk, "0D"),
      items: items.map((r) => ({ ...r, barW: Math.min(100, r.days / RUN_H * 100).toFixed(0) + "%" })),
    };
  });
}

// ── Journeys ────────────────────────────────────────────────────────────────
export interface JourneyRibbon {
  sku: string; ref: string; plantCode: string;
  left: string; width: string;
  segs: { w: string; color: string; label: string }[];
  flag: boolean; flagLeft: string; flagColor: string; flagIcon: string;
}

export function journeys(all: Decorated[], C: Palette): { rows: JourneyRibbon[]; ticks: { label: string }[]; todayLeft: string } {
  const SEGS: Record<string, [number, string, string][]> = {
    "In Production": [[100, C.faint, "at supplier"]],
    "Ready to Ship": [[100, C.faint, "at supplier"]],
    "In Transit": [[12, C.faint, "at supplier"], [88, C.blue, "in transit"]],
    "At Customs": [[10, C.faint, "at supplier"], [60, C.blue, "in transit"], [30, C.violet, "customs"]],
    "Cleared": [[10, C.faint, "at supplier"], [58, C.blue, "in transit"], [20, C.violet, "customs"], [12, C.green, "cleared"]],
    "Received": [[10, C.faint, "at supplier"], [56, C.blue, "in transit"], [16, C.violet, "customs"], [18, C.green, "received"]],
    "QC Hold": [[10, C.faint, "at supplier"], [56, C.blue, "in transit"], [16, C.violet, "customs"], [18, C.red, "quarantined"]],
  };
  const flight = all.filter((r) => r.prog < 1 || r.status === "QC Hold");
  const jDays = flight.map((r) => [parseDay(r.etd), parseDay(r.eta)]).filter((x) => x[0] && x[1]) as [number, number][];
  // No parseable journey dates (empty/over-filtered snapshot): Math.min/max of
  // [] would be ±Infinity and jpct would divide by zero → return a safe empty model.
  if (jDays.length === 0) return { rows: [], ticks: [], todayLeft: "0%" };
  const JMIN = Math.min(...jDays.map((x) => x[0]));
  const JMAX = Math.max(...jDays.map((x) => x[1]));
  const jpct = (ms: number) => ((ms - JMIN) / (JMAX - JMIN)) * 100;

  const rows = flight.map((r) => {
    const a = parseDay(r.etd), b = parseDay(r.eta);
    const left = a ? jpct(a) : 0;
    const right = b ? jpct(b) : left + 6;
    return {
      sku: r.sku, ref: r.ref, plantCode: PCODE[r.dest] ?? r.dest,
      left: left.toFixed(1) + "%", width: Math.max(2, right - left).toFixed(1) + "%",
      segs: (SEGS[r.status] || SEGS["In Transit"]).map((s) => ({ w: s[0] + "%", color: s[1], label: s[2] })),
      flag: !!r.flag, flagLeft: Math.min(97, right + 0.5).toFixed(1) + "%",
      flagColor: r.flag ? toneHex(C, r.flag.tone) : C.amber,
      flagIcon: r.flag && r.flag.kind === "QC hold" ? "✕" : "!",
    };
  }).sort((x, y) => parseFloat(x.left) - parseFloat(y.left));

  const ticks: { label: string }[] = [];
  for (let i = 0; i < 6; i++) ticks.push({ label: fmtDay(JMIN + Math.round(i * (JMAX - JMIN) / 6)) });
  return { rows, ticks, todayLeft: jpct(TODAY).toFixed(1) + "%" };
}

// ── Today "Next 72 hours" clock ─────────────────────────────────────────────
export interface ClockRow { sku: string; hrs: string; label: string; sub: string; ref: string; color: string; border: string; bg: string; }

export function clockRows(clock: ClockEvent[], all: Decorated[], C: Palette): ClockRow[] {
  const TONE: Record<string, string> = { r: C.red, a: C.amber, b: C.blue };
  return clock.map((e) => {
    const r = all.find((x) => x.ref === e.ref);
    const color = TONE[e.tone];
    return {
      sku: r?.sku ?? "RM-MSH-LM8",
      hrs: String(e.hrs), label: e.label, sub: e.sub, ref: e.ref, color,
      border: e.tone === "b" ? C.border : A(color, "40"),
      bg: e.tone === "b" ? C.bg : A(color, "0A"),
    };
  }).sort((x, y) => +x.hrs - +y.hrs);
}

// ── Board ───────────────────────────────────────────────────────────────────
export type GroupKey = "none" | "lane" | "location" | "supplier" | "po";
export interface Pivot { kind: string; label: string; group: GroupKey; }

export interface Cell {
  align: "left" | "right";
  hasIcon?: boolean; iconPath?: string; iconColor?: string;
  hasBadge?: boolean; badge?: string; badgeColor?: string;
  hasPips?: boolean; pips?: { color: string }[];
  top: string; topColor: string; topMono: boolean; topSize: string; topWeight: number;
  topPivot?: Pivot; topDocsRef?: string;
  hasBottom: boolean; bottom?: string; bottomColor?: string; bottomMono?: boolean; bottomPivot?: Pivot;
  hasBar?: boolean; barPct?: string; barColor?: string;
}

export const HEADERS: { label: string; align: "left" | "right" }[] = [
  { label: "Ref / PO", align: "left" }, { label: "Item", align: "left" }, { label: "Qty · value", align: "right" },
  { label: "Lane", align: "left" }, { label: "ETA", align: "left" }, { label: "What needs doing", align: "left" },
  { label: "Docs · HS", align: "left" }, { label: "Status", align: "left" },
];
export const GRID_COLS = "108px minmax(0, 1.35fr) 108px minmax(0, 1.05fr) 92px minmax(0, 1.9fr) 116px 112px";

function nextAction(r: Decorated, C: Palette): { top: string; bottom: string; color: string } {
  if (r.status === "At Customs") return { top: r.entry, bottom: `duty ${r.dutyEst} → ${r.dutyAct}`, color: C.red };
  if (r.status === "QC Hold") return { top: "disposition due 01 Aug", bottom: "CAR-0918 · payment blocked", color: C.red };
  if (r.status === "In Transit") return { top: r.gps ? r.gps.next : "in transit", bottom: r.vessel, color: C.text };
  if (r.status === "Cleared") return { top: "awaiting drayage", bottom: r.variance !== "—" ? r.variance : r.matchState, color: C.green };
  if (r.status === "Received") return { top: r.variance !== "—" ? r.variance + " to resolve" : "closed", bottom: r.matchState + " · " + r.grnRef, color: r.variance !== "—" ? C.amber : C.dim };
  if (r.inv === "pending") return { top: "ETD " + r.etd, bottom: "no supplier invoice yet", color: C.mid };
  return { top: "ETD " + r.etd, bottom: r.matchState, color: C.mid };
}

export function cellsFor(r: Decorated, C: Palette): Cell[] {
  const base = (o: Partial<Cell> & { top: string }): Cell => ({
    align: o.align ?? "left",
    top: o.top, topColor: o.topColor ?? C.text, topMono: o.topMono ?? false,
    topSize: o.topSize ?? (o.topMono ? "11.5px" : "12.5px"), topWeight: o.topWeight ?? (o.topMono ? 500 : 500),
    hasBottom: o.bottom != null, bottom: o.bottom, bottomColor: o.bottomColor ?? C.dim, bottomMono: o.bottomMono ?? true,
    topPivot: o.topPivot, topDocsRef: o.topDocsRef, bottomPivot: o.bottomPivot,
    hasIcon: o.hasIcon, iconPath: o.iconPath, iconColor: o.iconColor,
    hasBadge: o.hasBadge, badge: o.badge, badgeColor: o.badgeColor,
    hasPips: o.hasPips, pips: o.pips,
    hasBar: o.hasBar, barPct: o.barPct, barColor: o.barColor,
  });
  const f2 = r.flag;
  const na = nextAction(r, C);
  return [
    base({ top: r.ref, topMono: true, bottom: `${r.mode} · ${r.po}`, bottomPivot: { kind: "PO", label: r.po, group: "po" } }),
    base({ top: r.sku, topMono: true, hasIcon: true, iconPath: ICON_PATH[ICON[r.sku]], iconColor: r.stateColor, hasBadge: true, badge: r.state, badgeColor: r.stateColor, bottom: r.skuName, bottomMono: false, topPivot: { kind: "SKU", label: r.sku, group: "location" } }),
    base({ top: r.qty, topMono: true, align: "right", bottom: r.value, bottomColor: C.faint }),
    base({ top: r.lane, bottom: r.supplier, topPivot: { kind: "Destination", label: r.dest, group: "location" }, bottomPivot: { kind: "Supplier", label: r.supplier, group: "supplier" } }),
    base({ top: r.eta, topMono: true, bottom: r.etaNote, bottomColor: r.etaColor }),
    base({ top: f2 ? f2.kind : na.top, topColor: f2 ? toneHex(C, f2.tone) : na.color, topMono: !f2, topSize: f2 ? "12px" : "11px", bottom: f2 ? f2.text : na.bottom, bottomMono: !f2, bottomColor: f2 ? C.mid : C.dim }),
    base({ top: r.docSummary, topColor: r.docColor, topMono: true, topSize: "10.5px", hasPips: true, pips: r.docPips, bottom: `${r.hs} · ${r.coo}`, topDocsRef: r.ref, bottomPivot: { kind: "HS code", label: r.hs, group: "none" } }),
    base({ top: r.status, topMono: true, topSize: "10px", topColor: r.statusColor, hasBar: true, barPct: r.pct, barColor: r.statusColor }),
  ];
}

export interface GroupStat { k: string; v: string; color: string; }
export interface BoardGroup {
  isGroup: boolean; key: string; tag?: string; tagBg?: string; tagFg?: string;
  title?: string; meta?: string; drill?: Pivot; stats: GroupStat[];
  rows: (Decorated & { cells: Cell[] })[];
}

export function board(rows: Decorated[], group: GroupKey, collapsed: Record<string, boolean>, C: Palette): BoardGroup[] {
  const withCells = rows.map((r) => ({ ...r, cells: cellsFor(r, C) }));
  if (group === "none") return [{ isGroup: false, key: "all", stats: [], rows: withCells }];

  const keyOf = (r: Decorated) =>
    group === "lane" ? r.originPort + " → " + r.destPort
      : group === "location" ? r.dest
      : group === "supplier" ? r.supplier
      : r.po;

  const order: string[] = [];
  const bucket: Record<string, typeof withCells> = {};
  for (const r of withCells) {
    const k = keyOf(r);
    if (!bucket[k]) { bucket[k] = []; order.push(k); }
    bucket[k].push(r);
  }
  const mv = (n: number) => n + " movement" + (n === 1 ? "" : "s");

  return order.map((k) => {
    const rs = bucket[k];
    const flagged = rs.filter((r) => r.flag).length;
    const cnt = (state: string) => rs.filter((r) => r.state === state).length;
    let tag = "", tagColor = C.mid, title: string, meta: string, stats: GroupStat[] = [], drill: Pivot | undefined;

    if (group === "lane") {
      tag = "LANE"; title = k; meta = `${rs[0].origin} → ${rs[0].dest} · ${mv(rs.length)}`;
      drill = { kind: "Lane", label: k, group: "lane" };
      stats = [
        { k: "value", v: fmt(money(rs, "value")), color: C.text },
        { k: "mix", v: [cnt("RAW"), cnt("SEMI"), cnt("FIN")].join(" / "), color: C.mid },
        { k: "flagged", v: String(flagged), color: flagged ? C.red : C.dim },
      ];
    } else if (group === "location") {
      tag = "DEST"; title = k; meta = `${rs.length} inbound`;
      drill = { kind: "Destination", label: k, group: "location" };
      const inFlight = rs.filter((r) => r.prog < 1);
      stats = [
        { k: "raw", v: String(cnt("RAW")), color: C.cyan },
        { k: "semi", v: String(cnt("SEMI")), color: C.violet },
        { k: "fin", v: String(cnt("FIN")), color: C.green },
        { k: "in flight", v: fmt(money(inFlight, "value")), color: C.text },
        { k: "at risk", v: flagged ? fmt(money(rs.filter((r) => r.flag), "value")) : "—", color: flagged ? C.red : C.dim },
      ];
    } else if (group === "supplier") {
      const v: Vendor | undefined = VENDORS[k];
      const score = v ? Math.round(v.ot * 0.4 + v.doc * 0.35 + v.qty * 0.25) : 0;
      tag = v?.country ?? ""; title = k; meta = `${v?.spend ?? "—"} trailing spend · ${mv(rs.length)}`;
      drill = { kind: "Supplier", label: k, group: "supplier" };
      const grade = score >= 93 ? "A" : score >= 85 ? "B" : score >= 78 ? "C" : "D";
      const gcol = score >= 93 ? C.green : score >= 85 ? C.amber : score >= 78 ? C.amber : C.red;
      if (v) stats = [
        { k: "on time", v: v.ot + "%", color: v.ot >= 93 ? C.green : v.ot >= 82 ? C.amber : C.red },
        { k: "doc acc", v: v.doc + "%", color: v.doc >= 93 ? C.green : v.doc >= 82 ? C.amber : C.red },
        { k: "qty acc", v: v.qty + "%", color: v.qty >= 93 ? C.green : C.amber },
        { k: "grade", v: grade, color: gcol },
      ];
    } else {
      tag = "PO"; title = k; meta = `${rs[0].supplier} · ${mv(rs.length)}`;
      drill = { kind: "PO", label: k, group: "po" };
      const m0 = rs[0];
      const mcol = m0.matchTone === "green" ? C.green : m0.matchTone === "red" ? C.red : m0.matchTone === "amber" ? C.amber : C.blue;
      stats = [
        { k: "ordered", v: fmt(money(rs, "poValue")), color: C.text },
        { k: "invoiced", v: fmt(money(rs, "value")), color: C.mid },
        { k: "match", v: m0.matchState, color: mcol },
      ];
    }
    const isCollapsed = !!collapsed[group + "|" + k];
    return {
      isGroup: true, key: k, tag, tagBg: A(tagColor, "22"), tagFg: tagColor,
      title, meta, drill, stats, rows: isCollapsed ? [] : rs,
    };
  });
}

export function isEmpty(rows: Decorated[], view: string): boolean {
  return rows.length === 0 && view !== "map";
}
