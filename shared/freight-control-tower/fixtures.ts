// ============================================================================
// Freight Control Tower — business fixtures (single source of truth)
//
// Transcribed from the design prototype ("Freight Control Tower v2.dc.html").
// In production every one of these must come from a real system (ERP purchasing,
// freight EDI, inventory balances, MES, vendor master, document management,
// carrier tracking) — see docs/handoff. Here they are static demo records that
// the server exposes verbatim through `trpc.freightControlTower.snapshot`.
//
// Colours are NOT stored here. Anything colour-bearing carries a semantic
// *tone* token name (danger/warning/info/success/accent/teal/magenta) that the
// client resolves to `var(--erp-*)` so the board inherits the host theme.
// ============================================================================

/** Semantic tone → the `--erp-*` token the client resolves it against. */
export type Tone =
  | "danger"
  | "warning"
  | "info"
  | "success"
  | "accent"
  | "teal"
  | "magenta"
  | "neutral";

export type MatchTone = "blue" | "red" | "amber" | "green";

export interface Gps {
  pos: string;
  lon: number;
  lat: number;
  speed: string;
  next: string;
  age: string;
}

export interface Flag {
  kind: string;
  text: string;
  /** token name, resolved to var(--erp-*) at render */
  tone: Tone;
}

export interface Shipment {
  ref: string;
  qtyN: number;
  mode: "OCN" | "AIR" | "TRK";
  box: string;
  vessel: string;
  supplier: string;
  origin: string;
  oc: string;
  dest: string;
  dc: string;
  originPort: string;
  destPort: string;
  sku: string;
  skuName: string;
  state: "RAW" | "PACK" | "SEMI" | "FIN";
  qty: string;
  po: string;
  inv: string;
  value: string;
  poValue: string;
  grn: string;
  grnRef: string;
  variance: string;
  matchState: string;
  matchTone: MatchTone;
  incoterm: string;
  hs: string;
  coo: string;
  etd: string;
  eta: string;
  status: string;
  prog: number;
  dutyEst: string;
  dutyAct: string;
  entry: string;
  gps?: Gps;
  flag?: Flag;
  docIssues?: Record<string, "missing" | "failed" | "pending">;
}

export const SHIPMENTS: Shipment[] = [
  { ref: "SHP-260714", qtyN: 1200, mode: "OCN", box: "MSKU 4471902", vessel: "MAERSK SELETAR / 626W", supplier: "Xi'an Bioceuticals", origin: "Xi'an", oc: "CN", dest: "Greenville", dc: "US", originPort: "CNSHA", destPort: "USCHS",
    sku: "RM-MSH-LM8", skuName: "Lion's mane extract, 8:1 hot water", state: "RAW", qty: "1,200 kg", po: "PO-4412", inv: "XB-88213", value: "$61,200", poValue: "$61,200", grn: "in transit", grnRef: "ETA 04 Aug", variance: "—", matchState: "AWAITING GRN", matchTone: "blue",
    incoterm: "FOB Shanghai", hs: "1302.19", coo: "CN", etd: "02 Jul", eta: "04 Aug", status: "In Transit", prog: 0.58, dutyEst: "$1,530", dutyAct: "—", entry: "not yet filed",
    gps: { pos: "12°04′N 63°18′E", lon: 63.30, lat: 12.07, speed: "16.4 kn", next: "Suez transit 03 Aug", age: "8 min ago" } },
  { ref: "SHP-260709", qtyN: 240000, mode: "OCN", box: "TGHU 8830115", vessel: "ONE COMPETENCE / 041E", supplier: "Anhui Flexipack", origin: "Hefei", oc: "CN", dest: "Greenville", dc: "US", originPort: "CNSHA", destPort: "USCHS",
    sku: "PK-POU-500", skuName: "Stand-up pouch, 500 g, matte kraft", state: "PACK", qty: "240,000 pouches", po: "PO-4398", inv: "AF-20744", value: "$148,800", poValue: "$146,200", grn: "awaiting", grnRef: "held at customs", variance: "+$2,600", matchState: "PRICE VARIANCE", matchTone: "red",
    incoterm: "FCA Shanghai", hs: "3923.21", coo: "CN", etd: "28 Jun", eta: "30 Jul", status: "At Customs", prog: 0.85, dutyEst: "$4,464", dutyAct: "held", entry: "filed 29 Jul · pending",
    flag: { kind: "Docs missing", text: "Certificate of Origin (Form E) not received from supplier. Entry filed pending and demurrage begins 02 Aug — pouches are the binding constraint on the Daily Focus run.", tone: "danger" },
    docIssues: { "Certificate of Origin": "missing" } },
  { ref: "SHP-260721", qtyN: 2400, mode: "AIR", box: "AWB 020-4471 8830", vessel: "AI 3402 / COK–ATL", supplier: "Kerala Coco Mills", origin: "Kochi", oc: "IN", dest: "Greenville", dc: "US", originPort: "INCOK", destPort: "USATL",
    sku: "RM-MCT-C8", skuName: "Coconut MCT oil, C8 fraction", state: "RAW", qty: "2,400 kg", po: "PO-4431", inv: "KC-5510", value: "$39,600", poValue: "$39,600", grn: "in transit", grnRef: "ETA 31 Jul", variance: "—", matchState: "AWAITING GRN", matchTone: "blue",
    incoterm: "CIP Greenville", hs: "1513.19", coo: "IN", etd: "27 Jul", eta: "31 Jul", status: "In Transit", prog: 0.74, dutyEst: "$0 (GSP)", dutyAct: "—", entry: "pre-filed",
    gps: { pos: "34°12′N 22°40′E", lon: 22.67, lat: 34.20, speed: "486 kn", next: "ATL arrival 31 Jul 04:15", age: "2 min ago" } },
  { ref: "SHP-260702", qtyN: 18, mode: "OCN", box: "CAIU 7719340", vessel: "MSC RUBINA / 428A", supplier: "Cape Cacao Collective", origin: "Cape Town", oc: "ZA", dest: "Greenville", dc: "US", originPort: "ZACPT", destPort: "USCHS",
    sku: "RM-CAC-22", skuName: "Cacao powder, 22–24% fat, alkalised", state: "RAW", qty: "18.0 MT", po: "PO-4380", inv: "CC-9912", value: "$79,200", poValue: "$79,200", grn: "$79,200", grnRef: "GRN-9036", variance: "duty +$2,376", matchState: "DUTY VARIANCE", matchTone: "amber",
    incoterm: "CFR Charleston", hs: "1805.00", coo: "ZA", etd: "14 Jun", eta: "26 Jul", status: "Cleared", prog: 0.93, dutyEst: "$0 (AGOA)", dutyAct: "$2,376", entry: "cleared 26 Jul",
    flag: { kind: "Duty variance", text: "AGOA preference denied for want of a valid Form A, so $2,376 was assessed against a zero estimate. Recoverable by post-entry amendment within 30 days.", tone: "warning" } },
  { ref: "SHP-260698", qtyN: 900, mode: "OCN", box: "MRKU 2210887", vessel: "WAN HAI 621 / 118N", supplier: "Bharat Botanicals", origin: "Nhava Sheva", oc: "IN", dest: "Jurong", dc: "SG", originPort: "INNSA", destPort: "SGSIN",
    sku: "RM-ASH-KSM", skuName: "Ashwagandha root extract, KSM-66", state: "RAW", qty: "900 kg", po: "PO-4371", inv: "BB-3320", value: "$118,800", poValue: "$118,800", grn: "$112,860", grnRef: "GRN-9041", variance: "−$5,940", matchState: "QTY VARIANCE", matchTone: "amber",
    incoterm: "FOB Nhava Sheva", hs: "1302.19", coo: "IN", etd: "09 Jun", eta: "18 Jul", status: "Received", prog: 1, dutyEst: "$0 (AIFTA)", dutyAct: "$0", entry: "cleared 17 Jul",
    flag: { kind: "Qty variance", text: "Goods receipt 855 kg against 900 kg invoiced — 5.0% short. Weighbridge and drum tare tickets attached; debit note required before invoice release.", tone: "warning" } },
  { ref: "SHP-260725", qtyN: 34000, mode: "TRK", box: "TRL SG-4418", vessel: "Sentosa Logistics / RUN-2213", supplier: "Jurong Carton Works", origin: "Singapore", oc: "SG", dest: "Jurong", dc: "SG", originPort: "SGSIN", destPort: "SGSIN",
    sku: "PK-CTN-12", skuName: "Retail carton, 12-count shipper", state: "PACK", qty: "34,000 cartons", po: "PO-4440", inv: "JC-1188", value: "$54,400", poValue: "$54,400", grn: "in transit", grnRef: "ETA 31 Jul", variance: "—", matchState: "AWAITING GRN", matchTone: "blue",
    incoterm: "DAP Jurong", hs: "4819.20", coo: "SG", etd: "30 Jul", eta: "31 Jul", status: "In Transit", prog: 0.42, dutyEst: "domestic", dutyAct: "—", entry: "not required",
    gps: { pos: "1°19′N 103°44′E", lon: 103.73, lat: 1.32, speed: "54 km/h", next: "Gate-in 31 Jul 09:40", age: "1 min ago" } },
  { ref: "SHP-260717", qtyN: 3500, mode: "AIR", box: "AWB 160-9921 4470", vessel: "CX 2044 / CAN–PNQ", supplier: "Yunnan Hemp Works", origin: "Kunming", oc: "CN", dest: "Pune", dc: "IN", originPort: "CNCAN", destPort: "INPNQ",
    sku: "RM-HMP-50", skuName: "Hemp protein, 50% isolate", state: "RAW", qty: "3,500 kg", po: "PO-4425", inv: "YH-7741", value: "$27,440", poValue: "$27,440", grn: "quarantined", grnRef: "GRN-9044", variance: "hold", matchState: "QC BLOCKED", matchTone: "red",
    incoterm: "DAP Pune", hs: "2106.10", coo: "CN", etd: "22 Jul", eta: "25 Jul", status: "QC Hold", prog: 1, dutyEst: "$1,372", dutyAct: "$1,372", entry: "cleared 24 Jul",
    flag: { kind: "QC hold", text: "Protein assay 46.2% against a 50% minimum on 3 of 20 sampled lots. Full consignment quarantined at Pune; supplier CAR-0918 raised, disposition due 01 Aug.", tone: "danger" } },
  { ref: "SHP-260730", qtyN: 24, mode: "OCN", box: "awaiting allocation", vessel: "—", supplier: "Karoo Baobab Co", origin: "Cape Town", oc: "ZA", dest: "Jurong", dc: "SG", originPort: "ZACPT", destPort: "SGSIN",
    sku: "RM-BAO-P1", skuName: "Baobab fruit powder, sun-dried", state: "RAW", qty: "24.0 MT", po: "PO-4448", inv: "KB-2201", value: "$103,000", poValue: "$103,000", grn: "—", grnRef: "ETD 06 Aug", variance: "—", matchState: "AWAITING GRN", matchTone: "blue",
    incoterm: "FOB Cape Town", hs: "1211.90", coo: "ZA", etd: "06 Aug", eta: "11 Sep", status: "Ready to Ship", prog: 0.22, dutyEst: "$0", dutyAct: "—", entry: "not yet filed" },
  { ref: "SHP-260711", qtyN: 800, mode: "OCN", box: "OOLU 6612093", vessel: "OOCL ZHOUSHAN / 093S", supplier: "Xi'an Bioceuticals", origin: "Xi'an", oc: "CN", dest: "Jurong", dc: "SG", originPort: "CNNGB", destPort: "SGSIN",
    sku: "RM-RSH-10", skuName: "Reishi extract, 10:1 dual extraction", state: "RAW", qty: "800 kg", po: "PO-4402", inv: "XB-88190", value: "$46,080", poValue: "$46,080", grn: "awaiting", grnRef: "held at customs", variance: "duty +$1,280", matchState: "DUTY VARIANCE", matchTone: "amber",
    incoterm: "FOB Ningbo", hs: "1302.19", coo: "CN", etd: "05 Jul", eta: "29 Jul", status: "At Customs", prog: 0.85, dutyEst: "$1,840", dutyAct: "$3,120", entry: "query raised 30 Jul",
    flag: { kind: "Duty variance", text: "Singapore Customs reclassified the extract to 2106.90 as a food preparation — duty $3,120 against $1,840 estimated. A binding ruling is advised before the next four POs ship.", tone: "warning" } },
  { ref: "SHP-260733", qtyN: 26000, mode: "AIR", box: "not yet tendered", vessel: "—", supplier: "Anhui Flexipack", origin: "Shanghai", oc: "CN", dest: "Greenville", dc: "US", originPort: "CNSHA", destPort: "USATL",
    sku: "PK-POU-500", skuName: "Stand-up pouch, 500 g, matte kraft", state: "PACK", qty: "26,000 pouches", po: "PO-4452", inv: "pending", value: "$17,100", poValue: "$17,100", grn: "—", grnRef: "ETD 02 Aug", variance: "—", matchState: "NO INVOICE", matchTone: "blue",
    incoterm: "FCA Shanghai", hs: "3923.21", coo: "CN", etd: "02 Aug", eta: "05 Aug", status: "In Production", prog: 0.12, dutyEst: "$513", dutyAct: "—", entry: "not yet filed" },
  { ref: "SHP-260705", qtyN: 9000, mode: "OCN", box: "HLXU 3390221", vessel: "HAPAG BREMEN / 221W", supplier: "Kerala Coco Mills", origin: "Kochi", oc: "IN", dest: "Jurong", dc: "SG", originPort: "INCOK", destPort: "SGSIN",
    sku: "RM-MCT-C8", skuName: "Coconut MCT oil, C8 fraction", state: "RAW", qty: "9,000 kg", po: "PO-4388", inv: "KC-5480", value: "$138,600", poValue: "$138,600", grn: "$138,600", grnRef: "GRN-9038", variance: "—", matchState: "MATCHED", matchTone: "green",
    incoterm: "FOB Kochi", hs: "1513.19", coo: "IN", etd: "20 Jun", eta: "24 Jul", status: "Received", prog: 1, dutyEst: "$0 (AIFTA)", dutyAct: "$0", entry: "cleared 23 Jul" },
  { ref: "SHP-260728", qtyN: 1200, mode: "OCN", box: "awaiting allocation", vessel: "—", supplier: "Bharat Botanicals", origin: "Nhava Sheva", oc: "IN", dest: "Greenville", dc: "US", originPort: "INNSA", destPort: "USCHS",
    sku: "RM-ASH-KSM", skuName: "Ashwagandha root extract, KSM-66", state: "RAW", qty: "1,200 kg", po: "PO-4444", inv: "pending", value: "$158,400", poValue: "$158,400", grn: "—", grnRef: "ETD 01 Aug", variance: "—", matchState: "NO INVOICE", matchTone: "blue",
    incoterm: "FOB Nhava Sheva", hs: "1302.19", coo: "IN", etd: "01 Aug", eta: "02 Sep", status: "Ready to Ship", prog: 0.22, dutyEst: "$0 (GSP)", dutyAct: "—", entry: "not yet filed",
    flag: { kind: "Docs missing", text: "Packing list and Certificate of Origin are due three days before ETD and have not been uploaded. ETD 01 Aug is at risk and this is the only inbound ashwagandha before the October run.", tone: "danger" },
    docIssues: { "Packing List": "missing", "Certificate of Origin": "missing" } },
  { ref: "SHP-260690", qtyN: 180000, mode: "OCN", box: "CMAU 5580117", vessel: "CMA CGM LOIRE / 117W", supplier: "Jurong Carton Works", origin: "Singapore", oc: "SG", dest: "Greenville", dc: "US", originPort: "SGSIN", destPort: "USCHS",
    sku: "PK-CTN-12", skuName: "Retail carton, 12-count shipper", state: "PACK", qty: "180,000 cartons", po: "PO-4360", inv: "JC-7620", value: "$61,600", poValue: "$61,600", grn: "$61,600", grnRef: "GRN-9029", variance: "—", matchState: "MATCHED", matchTone: "green",
    incoterm: "FOB Singapore", hs: "4819.20", coo: "SG", etd: "02 Jun", eta: "11 Jul", status: "Received", prog: 1, dutyEst: "$0", dutyAct: "$0", entry: "cleared 10 Jul" },
  { ref: "SHP-260736", qtyN: 42000, mode: "OCN", box: "ONEU 4410778", vessel: "ONE HARBOUR / 214E", supplier: "Jurong Co-pack (internal)", origin: "Jurong", oc: "SG", dest: "Greenville", dc: "US", originPort: "SGSIN", destPort: "USCHS",
    sku: "FG-DFT-30", skuName: "Daily Focus, 30-serve pouch, retail", state: "FIN", qty: "42,000 units", po: "PO-4455", inv: "IC-0455", value: "$294,000", poValue: "$294,000", grn: "in transit", grnRef: "ETA 22 Aug", variance: "—", matchState: "AWAITING GRN", matchTone: "blue",
    incoterm: "DAP Greenville", hs: "2106.10", coo: "SG", etd: "18 Jul", eta: "22 Aug", status: "In Transit", prog: 0.35, dutyEst: "$0 (intercompany)", dutyAct: "—", entry: "pre-filed",
    gps: { pos: "6°12′N 78°40′E", lon: 78.67, lat: 6.20, speed: "17.1 kn", next: "Suez transit 06 Aug", age: "11 min ago" } },
  { ref: "SHP-260737", qtyN: 8400, mode: "TRK", box: "IBC totes ×14", vessel: "—", supplier: "Jurong Co-pack (internal)", origin: "Jurong", oc: "SG", dest: "Jurong", dc: "SG", originPort: "SGSIN", destPort: "SGSIN",
    sku: "SF-BLD-DFT", skuName: "Daily Focus blend, unfilled bulk", state: "SEMI", qty: "8,400 kg", po: "PO-4457", inv: "pending", value: "$92,400", poValue: "$92,400", grn: "—", grnRef: "blend order open", variance: "—", matchState: "NO INVOICE", matchTone: "blue",
    incoterm: "DAP Jurong", hs: "2106.10", coo: "SG", etd: "03 Aug", eta: "05 Aug", status: "In Production", prog: 0.12, dutyEst: "domestic", dutyAct: "—", entry: "not required" },
];

// ---------------------------------------------------------------------------
// COVER — per-SKU on-hand / days-of-cover / plant. `days` is authored (trailing
// consumption cover); burn/day is derived as onHandN / days (see projection.ts).
// ---------------------------------------------------------------------------
export interface CoverRow {
  days: number;
  onHandN: number;
  onHand: string;
  plant: string;
}

export const COVER: Record<string, CoverRow> = {
  "PK-POU-500":  { days: 9,  onHandN: 118000, onHand: "118,000 pouches", plant: "Greenville" },
  "RM-MSH-LM8":  { days: 12, onHandN: 410,    onHand: "410 kg",          plant: "Greenville" },
  "SF-BLD-DFT":  { days: 18, onHandN: 6300,   onHand: "6,300 kg",        plant: "Jurong" },
  "RM-RSH-10":   { days: 21, onHandN: 260,    onHand: "260 kg",          plant: "Jurong" },
  "RM-MCT-C8":   { days: 24, onHandN: 4100,   onHand: "4,100 kg",        plant: "Greenville" },
  "RM-CAC-22":   { days: 27, onHandN: 14.2,   onHand: "14.2 MT",         plant: "Greenville" },
  "RM-HMP-50":   { days: 31, onHandN: 2900,   onHand: "2,900 kg",        plant: "Pune" },
  "FG-DFT-30":   { days: 36, onHandN: 19400,  onHand: "19,400 units",    plant: "Greenville" },
  "RM-ASH-KSM":  { days: 44, onHandN: 780,    onHand: "780 kg",          plant: "Jurong" },
  "RM-BAO-P1":   { days: 58, onHandN: 9.4,    onHand: "9.4 MT",          plant: "Jurong" },
  "PK-CTN-12":   { days: 74, onHandN: 96000,  onHand: "96,000 cartons",  plant: "Greenville" },
};

// ---------------------------------------------------------------------------
// PLANTS — plant wall base data (WIP lines + inventory mix). tone: r/a/v/g.
// ---------------------------------------------------------------------------
export interface PlantWip {
  item: string;
  meta: string;
  val: string;
  tone: "r" | "a" | "v" | "g";
}
export interface Plant {
  name: string;
  code: string;
  key: string;
  wip: PlantWip[];
  mix: {
    raw: string; semi: string; fin: string;
    rawPct: string; semiPct: string; finPct: string;
  };
}

export const PLANTS: Plant[] = [
  { name: "Greenville, SC", code: "FTY-US-01", key: "Greenville",
    wip: [{ item: "Daily Focus blend · batch B-2214", meta: "blender 2 · 62% complete", val: "4,100 kg", tone: "v" },
          { item: "Daily Focus filling · line 3", meta: "idle — waiting on pouches", val: "stopped", tone: "r" }],
    mix: { raw: "18.7 MT", semi: "6,300 kg", fin: "19,400 units", rawPct: "44%", semiPct: "22%", finPct: "34%" } },
  { name: "Jurong, Singapore", code: "FTY-SG-01", key: "Jurong",
    wip: [{ item: "Daily Focus blend · batch B-2219", meta: "blender 1 · scheduled 03 Aug", val: "8,400 kg", tone: "a" },
          { item: "Reishi micronising", meta: "mill 2 · on plan", val: "260 kg", tone: "v" }],
    mix: { raw: "10.4 MT", semi: "6,300 kg", fin: "2,200 units", rawPct: "52%", semiPct: "34%", finPct: "14%" } },
  { name: "Pune, India", code: "FTY-IN-01", key: "Pune",
    wip: [{ item: "Hemp protein sieving", meta: "line 1 · on plan", val: "2,900 kg", tone: "v" }],
    mix: { raw: "2.9 MT", semi: "—", fin: "—", rawPct: "100%", semiPct: "0%", finPct: "0%" } },
];

// ---------------------------------------------------------------------------
// VENDORS — scorecard (ot=on-time%, doc=doc accuracy%, qty=qty accuracy%)
// ---------------------------------------------------------------------------
export interface Vendor { ot: number; doc: number; qty: number; spend: string; country: string; }

export const VENDORS: Record<string, Vendor> = {
  "Xi'an Bioceuticals":        { ot: 88, doc: 74, qty: 99,  spend: "$1.42M", country: "CN" },
  "Anhui Flexipack":           { ot: 81, doc: 68, qty: 97,  spend: "$2.06M", country: "CN" },
  "Yunnan Hemp Works":         { ot: 92, doc: 85, qty: 96,  spend: "$0.64M", country: "CN" },
  "Bharat Botanicals":         { ot: 94, doc: 91, qty: 93,  spend: "$1.88M", country: "IN" },
  "Kerala Coco Mills":         { ot: 97, doc: 96, qty: 99,  spend: "$2.44M", country: "IN" },
  "Cape Cacao Collective":     { ot: 76, doc: 62, qty: 98,  spend: "$1.11M", country: "ZA" },
  "Karoo Baobab Co":           { ot: 90, doc: 88, qty: 96,  spend: "$0.82M", country: "ZA" },
  "Jurong Carton Works":       { ot: 99, doc: 98, qty: 100, spend: "$0.71M", country: "SG" },
  "Jurong Co-pack (internal)": { ot: 95, doc: 99, qty: 100, spend: "$1.06M", country: "SG" },
};

// ---------------------------------------------------------------------------
// CONTACTS + fixed non-supplier recipients (request composer routing)
// ---------------------------------------------------------------------------
export interface Contact { name: string; email: string; role: string; }

export const CONTACTS: Record<string, Contact> = {
  "Xi'an Bioceuticals":        { name: "Lin Xiaowei",     email: "export@xianbioceuticals.cn",       role: "Export documentation" },
  "Anhui Flexipack":           { name: "Zhou Kaiming",    email: "docs@anhuiflexipack.cn",           role: "Shipping & documents" },
  "Yunnan Hemp Works":         { name: "Chen Weiliang",   email: "export@yunnanhemp.cn",             role: "Export sales" },
  "Bharat Botanicals":         { name: "Rohit Deshpande", email: "exports@bharatbotanicals.in",      role: "Export cell" },
  "Kerala Coco Mills":         { name: "Priya Raman",     email: "shipping@keralacoco.in",           role: "Logistics" },
  "Cape Cacao Collective":     { name: "Thabo Molefe",    email: "documentation@capecacao.co.za",    role: "Trade documentation" },
  "Karoo Baobab Co":           { name: "Anke Venter",     email: "exports@karoobaobab.co.za",        role: "Export administration" },
  "Jurong Carton Works":       { name: "Daniel Ong",      email: "ops@jurongcarton.sg",              role: "Operations" },
  "Jurong Co-pack (internal)": { name: "Mei Tan",         email: "copack.sg@meridian-nutrition.com", role: "Co-pack scheduling" },
};

export const BROKER: Contact      = { name: "Wexler & Co (broker)", email: "entries@wexlerbrokers.com",       role: "Customs broker" };
export const UNDERWRITER: Contact = { name: "Trident Marine",       email: "certs@tridentmarine.com",         role: "Marine underwriter" };
export const QA: Contact          = { name: "R. Achebe (QA)",       email: "r.achebe@meridian-nutrition.com", role: "Incoming inspection" };
export const BUYER: Contact       = { name: "D. Kestrel",           email: "d.kestrel@meridian-nutrition.com", role: "Supply chain ops" };

export const LOCATIONS: Record<string, string> = {
  Greenville: "FTY · US · blending & filling · FTZ 38",
  Jurong: "FTY · SG · co-pack & filling · bonded",
  Pune: "FTY · IN · extract processing",
};

// ---------------------------------------------------------------------------
// DOC_TYPES — the 9 document envelope rows, in order. 'Bill of Lading' is
// relabeled to 'Air Waybill' (AIR) / 'Delivery Note' (TRK) at render time.
// ---------------------------------------------------------------------------
export const DOC_TYPES = [
  "Purchase Order", "Commercial Invoice", "Packing List", "Bill of Lading",
  "Certificate of Origin", "HS Classification", "Customs Entry",
  "Insurance Certificate", "Inspection Report",
] as const;

// ---------------------------------------------------------------------------
// CLOCK — "Next 72 hours". Authored in the prototype; production should derive
// it (ETAs inside 72h, doc SLA breaches, QC dispositions, demurrage, duty).
// hrs = hours from now; tone a(warning)/r(danger)/b(info).
// ---------------------------------------------------------------------------
export interface ClockEvent { ref: string; hrs: number; label: string; sub: string; tone: "a" | "r" | "b"; }

export const CLOCK: ClockEvent[] = [
  { ref: "SHP-260721", hrs: 6,  label: "MCT oil lands Greenville",     sub: "2,400 kg · air · pre-filed",        tone: "a" },
  { ref: "SHP-260725", hrs: 21, label: "Cartons gate in at Jurong",    sub: "34,000 cartons · truck",            tone: "a" },
  { ref: "SHP-260717", hrs: 26, label: "Hemp QC disposition due",      sub: "3,500 kg quarantined · CAR-0918",   tone: "r" },
  { ref: "SHP-260728", hrs: 26, label: "Ashwagandha ETD at risk",      sub: "packing list and CoO not uploaded", tone: "r" },
  { ref: "SHP-260709", hrs: 46, label: "Pouch demurrage starts",       sub: "CoO Form E missing · line 3 idle",  tone: "r" },
  { ref: "SHP-260711", hrs: 68, label: "Reishi duty query answer due", sub: "reclassified 2106.90 · +$1,280",    tone: "b" },
];

// ---------------------------------------------------------------------------
// ETA_NOTE — per-movement ETA annotation override [text, tone]. Movements not
// listed fall back to a status-derived note (see selectors.ts decorate()).
// ---------------------------------------------------------------------------
export const ETA_NOTE: Record<string, [string, Tone]> = {
  "SHP-260721": ["in 14 h", "warning"], "SHP-260725": ["in 21 h", "warning"], "SHP-260714": ["in 4 d", "neutral"],
  "SHP-260709": ["4 d late", "danger"], "SHP-260711": ["2 d late", "danger"], "SHP-260736": ["in 22 d", "neutral"],
};

// ---------------------------------------------------------------------------
// Document-viewer address books.
// ---------------------------------------------------------------------------
export const BUYER_ADDR: Record<string, string> = {
  Greenville: "Meridian Nutrition Inc.\n1400 Perimeter Rd\nGreenville SC 29605, USA\nFDA FFR 18829440102",
  Jurong: "Meridian Nutrition Asia Pte Ltd\n12 Jurong Port Rd\nSingapore 619092\nUEN 201644821K",
  Pune: "Meridian Botanicals India Pvt Ltd\nPlot 44, Chakan MIDC\nPune 410501, India\nFSSAI 11522004000891",
};
export const SUP_ADDR: Record<string, string> = {
  "Xi'an Bioceuticals": "No. 88 Gaoxin Rd\nXi'an 710075, CN",
  "Anhui Flexipack": "Block C, Hefei Economic Zone\nHefei 230601, CN",
  "Yunnan Hemp Works": "21 Chenggong Industrial Park\nKunming 650500, CN",
  "Bharat Botanicals": "Plot 7, Chakan Phase II\nPune 410501, IN",
  "Kerala Coco Mills": "Willingdon Island\nKochi 682003, IN",
  "Cape Cacao Collective": "14 Paarden Eiland Rd\nCape Town 7405, ZA",
  "Karoo Baobab Co": "Hotazel Rd\nNorthern Cape 8490, ZA",
  "Jurong Carton Works": "21 Gul Crescent\nSingapore 629523, SG",
  "Jurong Co-pack (internal)": "12 Jurong Port Rd\nSingapore 619092, SG",
};

// ---------------------------------------------------------------------------
// Lane-map geography — ports + great-circle-ish routes through chokepoints.
// ---------------------------------------------------------------------------
export const PORTS: Record<string, [number, number, string]> = {
  CNNGB: [121.55, 29.87, "Ningbo"], CNSHA: [121.80, 31.23, "Shanghai"], CNYTN: [114.27, 22.58, "Yantian"],
  CNCAN: [113.26, 23.13, "Guangzhou"], INMAA: [80.29, 13.08, "Chennai"], INNSA: [72.95, 18.95, "Nhava Sheva"],
  INPNQ: [73.85, 18.52, "Pune"], ZADUR: [31.02, -29.87, "Durban"], ZACPT: [18.42, -33.92, "Cape Town"],
  USCHS: [-79.93, 32.78, "Charleston"], USATL: [-84.39, 33.75, "Atlanta"], SGSIN: [103.82, 1.35, "Singapore"],
  INCOK: [76.26, 9.93, "Kochi"],
};

const SUEZ_W: [number, number][] = [[45, 12], [38, 20], [32.55, 29.9], [28, 33], [18, 34], [-5.6, 35.9], [-20, 35], [-45, 34], [-65, 32]];
const PANAMA_E: [number, number][] = [[-160, 35], [-130, 28], [-105, 16], [-85, 11], [-79.55, 9.0], [-77, 15], [-76, 24]];

export const ROUTES: Record<string, [number, number][]> = {
  "CNNGB|USCHS": ([[121.55, 29.87], [123, 27], [118, 18], [110, 10], [105, 4], [100, 2], [90, 5], [75, 6], [60, 10]] as [number, number][]).concat(SUEZ_W),
  "CNSHA|USCHS": ([[121.8, 31.23], [126, 31], [135, 33], [155, 37], [175, 38]] as [number, number][]).concat(PANAMA_E),
  "CNYTN|USCHS": ([[114.27, 22.58], [120, 20], [130, 25], [150, 32], [172, 36]] as [number, number][]).concat(PANAMA_E),
  "INNSA|USCHS": ([[72.95, 18.95], [70, 15], [62, 13], [52, 12]] as [number, number][]).concat(SUEZ_W),
  "ZADUR|USCHS": [[31.02, -29.87], [26, -34], [18.5, -35.5], [8, -28], [-2, -15], [-18, -3], [-32, 8], [-52, 18], [-70, 27]],
  "CNNGB|SGSIN": [[121.55, 29.87], [122, 26], [117, 18], [110, 10], [106, 4], [103.82, 1.35]],
  "INNSA|SGSIN": [[72.95, 18.95], [74, 12], [78, 7], [86, 5], [96, 3], [100, 2], [103.82, 1.35]],
  "INMAA|SGSIN": [[80.29, 13.08], [84, 9], [92, 5], [99, 2], [103.82, 1.35]],
  "ZACPT|CNNGB": [[18.42, -33.92], [24, -34], [38, -30], [55, -18], [72, -6], [88, 2], [99, 2], [105, 7], [113, 17], [121.55, 29.87]],
  "INMAA|USATL": [[80.29, 13.08], [70, 22], [55, 32], [38, 40], [18, 45], [-5, 48], [-32, 47], [-56, 42], [-84.39, 33.75]],
  "CNSHA|USATL": [[121.8, 31.23], [135, 40], [160, 48], [-175, 52], [-150, 55], [-125, 50], [-100, 42], [-84.39, 33.75]],
  "CNCAN|INPNQ": [[113.26, 23.13], [104, 21], [95, 20], [85, 19], [73.85, 18.52]],
  "SGSIN|SGSIN": [[103.82, 1.35], [103.70, 1.32]],
  "INCOK|SGSIN": [[76.26, 9.93], [78, 7], [85, 5], [95, 3], [100, 2], [103.82, 1.35]],
  "INCOK|USATL": [[76.26, 9.93], [68, 18], [55, 29], [38, 38], [16, 44], [-8, 47], [-34, 46], [-58, 41], [-84.39, 33.75]],
  "SGSIN|USCHS": ([[103.82, 1.35], [100, 2], [95, 4], [85, 5], [72, 8], [60, 11]] as [number, number][]).concat(SUEZ_W),
  "ZACPT|SGSIN": [[18.42, -33.92], [24, -34], [40, -30], [60, -20], [78, -8], [92, -1], [100, 1], [103.82, 1.35]],
};

// ---------------------------------------------------------------------------
// Timeline constants — pin "now" to the demo date so all geometry is stable.
// TODAY = 31 Jul 2026; the runway/journeys axes start 28 Jul 2026, span 49 days.
// ---------------------------------------------------------------------------
export const TODAY = Date.UTC(2026, 6, 31);
export const AXIS0 = Date.UTC(2026, 6, 28);
export const AXIS_DAYS = 49;
export const DAY = 86400000;
export const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
export const MNAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The whole demo snapshot the server hands the client through tRPC. */
export interface FreightSnapshot {
  shipments: Shipment[];
  cover: Record<string, CoverRow>;
  plants: Plant[];
  vendors: Record<string, Vendor>;
  contacts: Record<string, Contact>;
  clock: ClockEvent[];
  locations: Record<string, string>;
  etaNote: Record<string, [string, Tone]>;
}

export function freightSnapshot(): FreightSnapshot {
  return {
    shipments: SHIPMENTS,
    cover: COVER,
    plants: PLANTS,
    vendors: VENDORS,
    contacts: CONTACTS,
    clock: CLOCK,
    locations: LOCATIONS,
    etaNote: ETA_NOTE,
  };
}
