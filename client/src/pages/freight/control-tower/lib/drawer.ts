// ============================================================================
// Overlay view-models: movement drawer, document (paper) viewer, request
// composer, dock receiving mode. Pure functions over decorated shipments.
// ============================================================================

import {
  VENDORS, CONTACTS, BROKER, UNDERWRITER, QA, BUYER,
  type Contact,
} from "@shared/freight-control-tower/fixtures";
import { STATUS_TONE } from "@shared/freight-control-tower/marks";
import { toneHex, type Palette } from "./palette";
import { docColor, type Decorated, type DocRow, type Pivot } from "./selectors";

const A = (hex: string, s: string) => `${hex}${s}`;

// ── Milestones (9-step dot-and-rail timeline) ───────────────────────────────
export interface Milestone { label: string; place: string; time: string; dotBg: string; dotBorder: string; anim: string; lineColor: string; textColor: string; timeColor: string; }

export function milestonesFor(s: Decorated, C: Palette): Milestone[] {
  const statusColor = toneHex(C, STATUS_TONE[s.status] ?? "neutral");
  const raw = [
    { label: "Purchase order issued", place: `${s.po} · confirmed by supplier`, time: "12 Jun", at: 0.02 },
    { label: "Production complete", place: s.supplier, time: s.etd, at: 0.14 },
    { label: "Cargo ready", place: `${s.origin} (${s.oc})`, time: s.etd, at: 0.22 },
    { label: "Departed origin", place: `${s.originPort} · ${s.vessel || "—"}`, time: s.etd, at: 0.30 },
    { label: "In transit", place: s.mode === "AIR" ? "airside" : "blue water", time: "—", at: 0.55 },
    { label: "Arrived destination", place: s.destPort, time: s.eta, at: 0.82 },
    { label: "Customs entry filed", place: `${s.destPort} · broker Wexler & Co`, time: s.eta, at: 0.86 },
    { label: "Customs cleared", place: s.destPort, time: s.eta, at: 0.92 },
    { label: "Received & counted", place: `${s.dest} (${s.dc})`, time: s.prog >= 1 ? s.eta : "—", at: 1.0 },
  ];
  let firstPending = true;
  return raw.map((m) => {
    const done = s.prog >= m.at;
    const active = !done && firstPending;
    if (active) firstPending = false;
    return {
      label: m.label, place: m.place, time: done ? m.time : "projected " + m.time,
      dotBg: done ? statusColor : C.surface,
      dotBorder: done ? statusColor : active ? C.faint : C.borderStrong,
      anim: active ? "fctPulse 1.8s ease-in-out infinite" : "none",
      lineColor: done ? C.control : C.border,
      textColor: done ? C.text : active ? C.mid : C.faint,
      timeColor: done ? C.mid : C.faint,
    };
  });
}

// ── Drawer detail ───────────────────────────────────────────────────────────
export interface DrawerDoc { name: string; short: string; meta: string; color: string; border: string; index: number; status: string; }
export interface DrawerFact { k: string; v: string; color: string; }
export interface DrawerVendorBar { k: string; v: string; pct: string; color: string; }
export interface Detail {
  ref: string; status: string; statusColor: string; statusBg: string;
  origin: string; dest: string; mode: string; incoterm: string; skuName: string; qty: string; supplier: string;
  links: Pivot[];
  hasFlag: boolean; flagKind: string; flagText: string; flagColor: string; flagBg: string; flagBorder: string;
  hasGps: boolean; gpsAge: string; vessel: string; gpsFacts: { k: string; v: string }[]; pct: string; originPort: string; destPort: string;
  milestones: Milestone[]; facts: DrawerFact[]; docs: DrawerDoc[]; vendor: DrawerVendorBar[];
  actLabel: string; actKind: "compose" | "toast"; missingDocName: string | null;
}

export function detailFor(sel: Decorated, C: Palette, sla: number): Detail {
  const v = VENDORS[sel.supplier];
  const flagColor = sel.flag ? toneHex(C, sel.flag.tone) : C.mid;
  const missing = sel._docs.find((d) => d.status === "missing");
  const actLabel = sel.flag
    ? sel.flag.kind === "Docs missing" ? "Chase document"
      : sel.flag.kind === "Duty variance" ? "File post-entry amendment"
      : sel.flag.kind === "Qty variance" ? "Raise debit note" : "Set disposition"
    : "Mark reviewed";
  return {
    ref: sel.ref, status: sel.status, statusColor: sel.statusColor, statusBg: sel.statusBg,
    origin: sel.origin, dest: sel.dest, mode: sel.mode, incoterm: sel.incoterm, skuName: sel.skuName, qty: sel.qty, supplier: sel.supplier,
    links: [
      { kind: "SKU", label: sel.sku, group: "location" },
      { kind: "Supplier", label: sel.supplier, group: "supplier" },
      { kind: "PO", label: sel.po, group: "po" },
      { kind: "Dest", label: sel.dest, group: "location" },
      { kind: "Lane", label: sel.originPort + "→" + sel.destPort, group: "lane" },
    ],
    hasFlag: !!sel.flag, flagKind: sel.flag?.kind ?? "", flagText: sel.flag?.text ?? "",
    flagColor, flagBg: sel.flag ? A(flagColor, "14") : "transparent", flagBorder: sel.flag ? A(flagColor, "55") : C.borderStrong,
    hasGps: !!sel.gps, gpsAge: sel.gps ? "updated " + sel.gps.age : "", vessel: sel.vessel,
    gpsFacts: sel.gps ? [
      { k: "Position", v: sel.gps.pos }, { k: "Speed", v: sel.gps.speed },
      { k: "Container", v: sel.box }, { k: "Next event", v: sel.gps.next },
    ] : [],
    pct: sel.pct, originPort: sel.originPort, destPort: sel.destPort,
    milestones: milestonesFor(sel, C),
    facts: [
      { k: "Purchase order", v: `${sel.po} · ${sel.poValue}`, color: C.text },
      { k: "Supplier invoice", v: sel.inv === "pending" ? "not received" : `${sel.inv} · ${sel.value}`, color: sel.inv === "pending" ? C.amber : C.text },
      { k: "Goods receipt", v: `${sel.grn} · ${sel.grnRef}`, color: /awaiting|transit|quarantined|—/.test(sel.grn) ? C.mid : C.text },
      { k: "Variance", v: sel.variance, color: sel.variance === "—" ? C.dim : C.amber },
      { k: "Match state", v: sel.matchState, color: sel.matchTone === "green" ? C.green : sel.matchTone === "red" ? C.red : sel.matchTone === "amber" ? C.amber : C.blue },
      { k: "HS code / origin", v: `${sel.hs} · ${sel.coo}`, color: C.text },
      { k: "Incoterm", v: sel.incoterm, color: C.text },
      { k: "Duty estimated", v: sel.dutyEst, color: C.mid },
      { k: "Duty assessed", v: sel.dutyAct, color: sel.dutyAct !== "—" && sel.dutyAct !== sel.dutyEst && sel.dutyAct !== "$0" ? C.amber : C.mid },
    ],
    docs: sel._docs.map((d, i) => ({
      name: d.name, short: d.status.toUpperCase(), index: i, status: d.status,
      meta: d.status === "missing" ? `due ${sla}d before ETD · requested 3×`
        : d.status === "pending" ? "awaiting upstream event"
        : d.status === "na" ? "not required under " + sel.incoterm.split(" ")[0]
        : "v1 · verified · broker Wexler",
      color: docColor(d.status, C), border: A(docColor(d.status, C), "3A"),
    })),
    vendor: v ? [
      { k: "On time", v: v.ot + "%", pct: v.ot + "%", color: v.ot >= 93 ? C.green : v.ot >= 82 ? C.amber : C.red },
      { k: "Doc accuracy", v: v.doc + "%", pct: v.doc + "%", color: v.doc >= 93 ? C.green : v.doc >= 82 ? C.amber : C.red },
      { k: "Qty accuracy", v: v.qty + "%", pct: v.qty + "%", color: v.qty >= 93 ? C.green : C.amber },
      { k: "Spend 90d", v: v.spend, pct: "100%", color: C.mid },
    ] : [],
    actLabel, actKind: sel.flag && sel.flag.kind === "Docs missing" && missing ? "compose" : "toast",
    missingDocName: missing?.name ?? null,
  };
}

// ── Request composer routing ────────────────────────────────────────────────
export interface RequestModel { to: Contact; cc: Contact[]; subject: string; body: string; consequence: string; attachments: { ext: string; name: string }[]; }

export function requestFor(r: Decorated, docName: string, sla: number): RequestModel {
  const sup: Contact = CONTACTS[r.supplier] || { name: r.supplier, email: `exports@${r.supplier.replace(/[^a-z]/gi, "").toLowerCase()}.com`, role: "Export desk" };
  let to: Contact = sup;
  let cc: Contact[] = [BROKER, BUYER];
  let ask = `please send the ${docName.toLowerCase()} for the movement below at your earliest convenience`;
  let consequence = `This document is required to progress ${r.ref}. Please reply to this thread with the file attached.`;

  const coForm = r.coo === "CN" ? "Form E" : r.coo === "IN" ? "Form AI" : r.coo === "ZA" ? "Form A" : "Form D";
  if (docName === "Customs Entry" || docName === "HS Classification") {
    to = BROKER; cc = [BUYER];
    ask = `please issue the ${docName.toLowerCase()} and file the entry for the movement below`;
    consequence = "Broker-held document — clearance and release cannot proceed until it is filed.";
  } else if (docName === "Insurance Certificate") {
    to = UNDERWRITER; cc = [BUYER];
    ask = "please issue the marine insurance certificate for the movement below";
    consequence = "Cover must be certified before the goods sail; please confirm binding.";
  } else if (docName === "Inspection Report") {
    to = QA; cc = [BUYER];
    ask = "please complete and upload the incoming inspection report for the lot below";
    consequence = "Payment and stock release are blocked until QA dispositions the lot.";
  } else if (docName === "Certificate of Origin") {
    ask = `please send the certificate of origin (${coForm}) for the movement below`;
    consequence = r.status === "At Customs"
      ? "Entry is filed pending; demurrage begins 02 Aug unless the certificate is received."
      : `Due ${sla} days before ETD ${r.etd} to preserve the preferential duty rate.`;
  } else if (docName === "Packing List") {
    ask = "please upload the packing list for the movement below";
    consequence = `Required ${sla} days before ETD ${r.etd} so the entry can be pre-filed.`;
  } else if (docName === "Commercial Invoice") {
    ask = `please issue the commercial invoice against ${r.po}`;
    consequence = "No invoice on file — the three-way match and payment cannot be started.";
  }

  const firstName = to.name.split(" ")[0];
  const subject = `[${r.ref}] ${docName} outstanding — ${r.po} · ETD ${r.etd}`;
  const body =
    `Dear ${firstName},\n\n` +
    `${ask.charAt(0).toUpperCase() + ask.slice(1)}.\n\n` +
    `  Movement       ${r.ref}\n` +
    `  Purchase order ${r.po}\n` +
    `  Item           ${r.sku} — ${r.skuName}\n` +
    `  Quantity       ${r.qty}\n` +
    `  Lane           ${r.origin} → ${r.dest} (${r.originPort} → ${r.destPort})\n` +
    `  ETD / ETA      ${r.etd} / ${r.eta}\n` +
    `  HS code        ${r.hs}\n\n` +
    `${consequence}\n\n` +
    `Please reply to this thread with the document attached.\n\n` +
    `Kind regards,\nDana Kestrel\nSupply Chain Operations, Meridian Nutrition`;
  return {
    to, cc, subject, body, consequence,
    attachments: [
      { ext: "PDF", name: `${r.po} purchase order.pdf` },
      { ext: "CSV", name: `${r.ref} movement summary.csv` },
    ],
  };
}

// ── Dock receiving mode (fixed to the pouch movement) ───────────────────────
export interface DockModel {
  ref: string; lane: string; container: string; item: string; sku: string; expected: string;
  count: string; countColor: string; varText: string; varBg: string;
  conditions: { label: string; bg: string; border: string; fg: string }[];
  btnLabel: string; btnBg: string; btnFg: string;
}

export function dockFor(count: number, cond: string, submitted: boolean, C: Palette): DockModel {
  const diff = count - 240000;
  return {
    ref: "SHP-260709", lane: "Hefei CN → Greenville SC · TGHU 8830115", container: "TGHU 8830115",
    item: "Stand-up pouch, 500 g matte kraft", sku: "PK-POU-500 · PACKAGING · Anhui Flexipack",
    expected: "240,000 pouches", count: count.toLocaleString(),
    countColor: diff === 0 ? C.green : C.amber,
    varText: diff === 0 ? "Matches packing list — no variance"
      : (diff > 0 ? "+" : "") + diff.toLocaleString() + " pouches variance · debit note will be raised",
    varBg: A(diff === 0 ? C.green : C.amber, "14"),
    conditions: ["Good", "Damaged", "Short"].map((label) => ({
      label,
      bg: cond === label ? C.borderStrong : C.surface2,
      border: cond === label ? C.amber : C.control,
      fg: cond === label ? C.text : C.mid,
    })),
    btnLabel: submitted ? "Receipt posted · GRN-9046" : "Post goods receipt",
    btnBg: submitted ? C.green : C.amber, btnFg: C.bg,
  };
}
