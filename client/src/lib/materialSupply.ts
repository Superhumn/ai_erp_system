/**
 * Material Supply & Reorder — view-model builder.
 *
 * Pure port of the reorder math + view derivation from the design spec
 * (`Material & Map View.dc.html`). Takes the API `MaterialSupplyOverview`
 * and produces everything the `MaterialSupply` page renders: KPIs, the map
 * (pins + freight lanes + origins) and the by-material grid.
 *
 * Reorder math (per material at each copacker), from HANDOFF §3:
 *   inbound           = sum(shipment.qty for that material+copacker)
 *   total             = onHand + inbound
 *   daysOnHand        = onHand / dailyUsage
 *   runwayWithInbound = total / dailyUsage
 *   reorderPoint      = dailyUsage * (leadTimeDays + SAFETY_DAYS)
 *   targetStock       = dailyUsage * (leadTimeDays + TARGET_COVER_DAYS)
 *   recommendedOrder  = max(0, roundUpToLot(targetStock - total))
 *   orderByDays       = runwayWithInbound - leadTimeDays   // <0 means overdue
 */
import type {
  MaterialSupplyOverview,
  MaterialSupplyCopacker,
  MaterialSupplyInventoryLine,
  MaterialSupplyMaterial,
  MaterialSupplyShipment,
  OriginRegion,
  ShipmentStatus,
} from "@shared/materialSupply";

// monochrome: blue is "moving / inbound", red is the only alert, grey is calm
const STATUS_COLOR: Record<ShipmentStatus, string> = {
  sea: "#2563EB",
  port: "#2563EB",
  customs: "#2563EB",
  delayed: "#E5484D",
  booked: "#9AA0AB",
};

const ORIGINS: Record<OriginRegion, { x: number; y: number; label: string; anchor: "start" | "end"; ty: number }> = {
  asia: { x: 70, y: 120, label: "China", anchor: "start", ty: 106 },
  sea: { x: 100, y: 288, label: "SE Asia", anchor: "start", ty: 310 },
  eu: { x: 1235, y: 88, label: "Europe", anchor: "end", ty: 74 },
};

type StateKey = "ok" | "later" | "soon" | "overdue";
const STATE: Record<StateKey, { color: string; word: string; rank: number }> = {
  ok: { color: "#9AA0AB", word: "on track", rank: 0 },
  later: { color: "#9AA0AB", word: "on track", rank: 1 },
  soon: { color: "#2563EB", word: "order soon", rank: 2 },
  overdue: { color: "#E5484D", word: "overdue", rank: 3 },
};

const RANK_STATUS: Record<ShipmentStatus, number> = { delayed: 4, customs: 3, port: 2, sea: 1, booked: 0 };

// ---- formatting helpers ----
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
function fmtDate(days: number): string {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = new Date();
  d.setDate(d.getDate() + Math.round(days));
  return `${m[d.getMonth()]} ${d.getDate()}`;
}
const qf = (unit: string, v: number) => `${fmtNum(v)} ${unit}`;
const qfShort = (v: number) => (v >= 1000 ? (v / 1000).toFixed(v < 10000 ? 1 : 0) + "k" : fmtNum(v));
const roundLot = (v: number) => Math.ceil(v / 100) * 100;

type Enriched = {
  line: MaterialSupplyInventoryLine;
  material: MaterialSupplyMaterial;
  copacker: MaterialSupplyCopacker;
  ships: MaterialSupplyShipment[];
  inbound: number;
  total: number;
  reorderPt: number;
  target: number;
  reco: number;
  runway: number;
  orderByDays: number;
  dos: number;
};

// ---- view-model output types ----
export type MapDot = { cx: number; cy: number; color: string; title: string };
export type MapPin = { x: number; y: number; r: number; color: string; short: string; toOrder: number; ty: number; dots: MapDot[] };
export type MapRoute = { d: string; color: string; anim: string; lx: number; ly: number; lyEta: number; count: number; etaLabel: string };
export type MapOrigin = { x: number; y: number; label: string; anchor: "start" | "end"; ty: number };
export type MaterialRow = {
  short: string;
  covColor: string;
  covLabel: string;
  onHandPct: number;
  inboundPct: number;
  deficitPct: number;
  showDeficit: boolean;
  reorderPct: number;
  onHandLabel: string;
  inboundLabel: string;
  inboundDetail: string;
  orderBg: string;
  orderColor: string;
  orderKicker: string;
  orderQty: string;
  orderWhen: string;
};
export type MaterialCard = {
  name: string;
  totals: string;
  orderBg: string;
  orderColor: string;
  orderSummary: string;
  rows: MaterialRow[];
};
export type MaterialSupplyView = {
  source: "live" | "sample";
  kpis: { copackers: number; toOrder: number; inbound: number; containers: number; delayed: number };
  map: { pins: MapPin[]; routes: MapRoute[]; origins: MapOrigin[] };
  materials: MaterialCard[];
};

/** Auto-layout copacker pins that lack stylized-map coordinates. */
function withPositions(copackers: MaterialSupplyCopacker[]): MaterialSupplyCopacker[] {
  if (copackers.every((c) => c.x != null && c.y != null)) return copackers;
  const n = copackers.length;
  const cols = Math.min(n, 4);
  const rows = Math.ceil(n / cols);
  const marginX = 200;
  const marginY = 95;
  const spanX = 1300 - marginX * 2;
  const spanY = 340 - marginY * 2;
  return copackers.map((c, i) => {
    if (c.x != null && c.y != null) return c;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = cols === 1 ? 650 : marginX + (spanX * col) / (cols - 1);
    const y = rows === 1 ? 160 : marginY + (spanY * row) / (rows - 1);
    return { ...c, x, y };
  });
}

export function buildMaterialSupplyView(overview: MaterialSupplyOverview): MaterialSupplyView {
  const { safetyDays, targetCoverDays } = overview.planning;
  const copackers = withPositions(overview.copackers);
  const cpByCode = new Map(copackers.map((c) => [c.code, c]));
  const matById = new Map(overview.materials.map((m) => [m.id, m]));

  const enrich = (line: MaterialSupplyInventoryLine): Enriched | null => {
    const material = matById.get(line.materialId);
    const copacker = cpByCode.get(line.copackerCode);
    if (!material || !copacker) return null;
    const ships = overview.shipments
      .filter((s) => s.copackerCode === line.copackerCode && s.materialId === line.materialId)
      .sort((a, b) => a.etaDays - b.etaDays);
    const inbound = ships.reduce((a, s) => a + s.qty, 0);
    const total = line.onHand + inbound;
    const reorderPt = line.dailyUsage * (material.leadTimeDays + safetyDays);
    const target = line.dailyUsage * (material.leadTimeDays + targetCoverDays);
    const reco = Math.max(0, roundLot(target - total));
    const runway = total / line.dailyUsage;
    const orderByDays = runway - material.leadTimeDays;
    const dos = line.onHand / line.dailyUsage;
    return { line, material, copacker, ships, inbound, total, reorderPt, target, reco, runway, orderByDays, dos };
  };

  const stateOf = (e: Enriched): StateKey => {
    if (e.reco <= 0) return "ok";
    if (e.orderByDays < 0) return "overdue";
    if (e.orderByDays < 10) return "soon";
    return "later";
  };

  const urgency = (e: Enriched) => {
    const s = stateOf(e);
    if (s === "overdue") return { color: "#DC2626", bg: "#FDECEC", kicker: "Overdue" };
    if (s === "soon") return { color: "#2563EB", bg: "#EAF1FE", kicker: "Order soon" };
    if (s === "ok") return { color: "#6B7280", bg: "#F2F4F7", kicker: "In stock" };
    return { color: "#6B7280", bg: "#F2F4F7", kicker: "Order" };
  };

  const all = overview.inventoryLines
    .map(enrich)
    .filter((e): e is Enriched => e !== null);

  const isToOrder = (e: Enriched) => {
    const s = stateOf(e);
    return s === "overdue" || s === "soon";
  };

  const kpis = {
    copackers: copackers.length,
    toOrder: all.filter(isToOrder).length,
    inbound: overview.shipments.length,
    containers: overview.shipments.reduce((a, s) => a + (s.containers ?? 0), 0),
    delayed: overview.shipments.filter((s) => s.status === "delayed").length,
  };

  // Map pins — one per copacker
  const pins: MapPin[] = copackers.map((c) => {
    const lines = all.filter((e) => e.line.copackerCode === c.code);
    const worst = lines.map(stateOf).reduce<StateKey>((w, s) => (STATE[s].rank > STATE[w].rank ? s : w), "ok");
    const toOrder = lines.filter(isToOrder).length;
    const r = 15 + lines.length * 1.3;
    const n = lines.length;
    const gap = 13;
    const startX = (c.x as number) - ((n - 1) * gap) / 2;
    const dots: MapDot[] = lines.map((e, i) => ({
      cx: startX + i * gap,
      cy: (c.y as number) + r + 19,
      color: STATE[stateOf(e)].color,
      title: `${e.material.name} · ${STATE[stateOf(e)].word}`,
    }));
    return { x: c.x as number, y: c.y as number, r, color: STATE[worst].color, short: c.short, toOrder, ty: (c.y as number) + r + 15, dots };
  });

  // Freight lanes — grouped by origin region → copacker
  const laneMap: Record<string, { region: OriginRegion; cp: string; ships: MaterialSupplyShipment[] }> = {};
  overview.shipments.forEach((s) => {
    const k = s.originRegion + ">" + s.copackerCode;
    (laneMap[k] = laneMap[k] || { region: s.originRegion, cp: s.copackerCode, ships: [] }).ships.push(s);
  });
  const routes: MapRoute[] = Object.values(laneMap)
    .map((ln, i) => {
      const o = ORIGINS[ln.region];
      const cp = cpByCode.get(ln.cp);
      if (!o || !cp || cp.x == null || cp.y == null) return null;
      const cx = (o.x + cp.x) / 2;
      const cy = (o.y + cp.y) / 2 - 48 - i * 13;
      const t = 0.66;
      const mt = 1 - t;
      const lx = mt * mt * o.x + 2 * mt * t * cx + t * t * cp.x;
      const ly = mt * mt * o.y + 2 * mt * t * cy + t * t * cp.y;
      const earliest = ln.ships.slice().sort((a, b) => a.etaDays - b.etaDays)[0];
      const worstSt = ln.ships.reduce<ShipmentStatus>((w, s) => (RANK_STATUS[s.status] > RANK_STATUS[w] ? s.status : w), "booked");
      const anySea = ln.ships.some((s) => s.status === "sea");
      return {
        d: `M${o.x},${o.y} Q${cx},${cy} ${cp.x},${cp.y}`,
        color: STATUS_COLOR[worstSt],
        anim: anySea ? "msr-dashmove 1.5s linear infinite" : "none",
        lx,
        ly,
        lyEta: ly + 20,
        count: ln.ships.length,
        etaLabel: "ETA " + fmtDate(earliest.etaDays),
      };
    })
    .filter((r): r is MapRoute => r !== null);

  const origins: MapOrigin[] = [...new Set(Object.values(laneMap).map((l) => l.region))].map((rk) => ORIGINS[rk]);

  // By-material grid
  const materials: MaterialCard[] = overview.materials.map((m) => {
    const lines = all.filter((e) => e.line.materialId === m.id);
    const onHandSum = lines.reduce((a, e) => a + e.line.onHand, 0);
    const inboundSum = lines.reduce((a, e) => a + e.inbound, 0);
    const needOrder = lines.filter(isToOrder).length;
    const rows: MaterialRow[] = lines.map((e) => {
      const u = urgency(e);
      const onHandPct = Math.min(100, (e.line.onHand / e.target) * 100);
      const inboundPct = Math.min(100 - onHandPct, (e.inbound / e.target) * 100);
      const next = e.ships[0];
      return {
        short: e.copacker.short,
        covColor: e.dos < 7 ? "#DC2626" : e.dos < 21 ? "#2563EB" : "#9AA0AB",
        covLabel: `${e.dos < 10 ? e.dos.toFixed(1) : Math.round(e.dos)}d → ${Math.round(e.runway)}d w/ inbound`,
        onHandPct,
        inboundPct,
        deficitPct: Math.max(0, 100 - onHandPct - inboundPct),
        showDeficit: e.reco > 0,
        reorderPct: Math.min(100, (e.reorderPt / e.target) * 100),
        onHandLabel: qfShort(e.line.onHand),
        inboundLabel: qfShort(e.inbound),
        inboundDetail: e.ships.length ? `next ${fmtDate(next.etaDays)}` : "none booked",
        orderBg: u.bg,
        orderColor: u.color,
        orderKicker: u.kicker,
        orderQty: e.reco > 0 ? qf(m.unit, e.reco) : "—",
        orderWhen:
          e.reco <= 0
            ? "above target"
            : e.orderByDays < 0
              ? `now · ${Math.round(-e.orderByDays)}d late`
              : `by ${fmtDate(e.orderByDays)}`,
      };
    });
    return {
      name: m.name,
      totals: `${qfShort(onHandSum)} on hand · ${qfShort(inboundSum)} inbound ${m.unit}`,
      orderBg: needOrder > 0 ? "#FDECEC" : "#F2F4F7",
      orderColor: needOrder > 0 ? "#DC2626" : "#6B7280",
      orderSummary: needOrder > 0 ? `${needOrder} to order` : "all stocked",
      rows,
    };
  });

  return { source: overview.source, kpis, map: { pins, routes, origins }, materials };
}
