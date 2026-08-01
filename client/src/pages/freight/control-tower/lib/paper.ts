// ============================================================================
// Document (paper) viewer templates — 9 printable documents assembled from a
// movement. Each returns a Paper the DocumentViewer renders generically.
// ============================================================================

import { BUYER_ADDR, SUP_ADDR } from "@shared/freight-control-tower/fixtures";
import type { Palette } from "./palette";
import type { Decorated, DocStatus } from "./selectors";

export interface Party { role: string; name: string; lines: string; }
export interface Field { k: string; v: string; }
export interface LineHead { label: string; align: "left" | "right"; }
export interface LineCell { v: string; align: "left" | "right"; mono: boolean; }
export interface LineRow { cells: LineCell[]; }
export interface Paper {
  issuer: string; title: string; refLabel: string; refValue: string;
  partyCols: number; parties: Party[];
  fields: Field[]; lineCols: string; lineHead: LineHead[]; lineRows: LineRow[];
  totals: { k: string; v: string }[]; notes: string[]; footer: string;
  sigLeft: string; sigRight: string; stamp: { text: string; color: string } | null;
}

const F = (k: string, v: string): Field => ({ k, v });
const P = (role: string, name: string, lines: string): Party => ({ role, name, lines });
const H = (label: string, align: "left" | "right" = "left"): LineHead => ({ label, align });
const R = (cells: [string, ("left" | "right")?, boolean?][]): LineRow => ({
  cells: cells.map(([v, align, mono]) => ({ v, align: align ?? "left", mono: mono ?? false })),
});

function unit(v: string, q: string): string {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  const qn = Number(String(q).replace(/[^0-9.]/g, ""));
  if (!qn) return "—";
  const u = n / qn;
  return "$" + (u < 10 ? u.toFixed(3) : u.toFixed(2));
}

export function paperFor(r: Decorated, docName: string, status: DocStatus, C: Palette): Paper {
  const seller = P("Seller / exporter", r.supplier, SUP_ADDR[r.supplier] || "");
  const consignee = P("Consignee", "", BUYER_ADDR[r.dest] || "");
  const itemHead: LineHead[] = [H("SKU / description"), H("HS"), H("Qty", "right"), H("Unit", "right"), H("Amount", "right")];
  const itemCols = "minmax(0, 1.9fr) 84px 96px 84px 100px";
  const itemRow = R([
    [`${r.sku} — ${r.skuName}`], [r.hs, "left", true], [r.qty, "right", true],
    [unit(r.value, r.qty), "right", true], [r.value, "right", true],
  ]);

  const base: Paper = {
    issuer: r.supplier, title: docName, refLabel: "Ref", refValue: r.ref,
    partyCols: 2, parties: [seller, consignee],
    fields: [], lineCols: itemCols, lineHead: [], lineRows: [], totals: [], notes: [],
    footer: `Meridian document vault · movement ${r.ref} · retained 7 years per 19 CFR 163`,
    sigLeft: "Authorised signatory", sigRight: "Date", stamp: null,
  };

  const shipMode = r.mode === "AIR" ? "Air freight" : r.mode === "TRK" ? "Road" : "Ocean FCL";
  const coForm = r.coo === "CN" ? "Form E" : r.coo === "IN" ? "Form AI" : r.coo === "ZA" ? "Form A" : "Form D";

  switch (docName) {
    case "Purchase Order":
      return {
        ...base, issuer: "Meridian Nutrition Inc.", title: "Purchase order", refLabel: "PO", refValue: r.po,
        partyCols: 3, parties: [P("Buyer / bill-to", "Meridian Nutrition Inc.", BUYER_ADDR.Greenville), seller, consignee],
        fields: [
          F("PO date", "12 Jun 2026"), F("Currency", "USD"), F("Payment terms", "Net 45 from B/L"),
          F("Incoterm", r.incoterm), F("Required at plant", r.eta), F("Ship mode", shipMode),
          F("Material state", r.state), F("Buyer", "D. Kestrel"),
        ],
        lineHead: itemHead, lineRows: [itemRow],
        totals: [{ k: "Goods value", v: r.poValue }, { k: "Order total", v: r.poValue }],
        notes: [`Certificate of origin due before ETD ${r.etd}. Supplier to confirm acceptance.`],
        sigLeft: "Meridian authorised buyer", sigRight: "Supplier acceptance / date",
      };

    case "Commercial Invoice":
      return {
        ...base, issuer: r.supplier, title: "Commercial invoice", refLabel: "Invoice", refValue: r.inv === "pending" ? "—" : r.inv,
        fields: [
          F("Invoice date", r.etd), F("PO ref", r.po), F("Incoterm", r.incoterm), F("Currency", "USD"),
          F("HS code", r.hs), F("Country of origin", r.coo), F("Port of loading", r.originPort), F("Port of discharge", r.destPort),
        ],
        lineHead: itemHead, lineRows: [itemRow],
        totals: [
          { k: "Goods value (FOB)", v: r.value },
          { k: "Freight", v: r.incoterm.indexOf("FOB") === 0 ? "buyer account" : "included" },
          { k: "Invoice total", v: r.value },
        ],
        notes: [`We certify this invoice is true and that the goods originate in ${r.coo}.`],
      };

    case "Packing List":
      return {
        ...base, issuer: r.supplier, title: "Packing list", refLabel: "PL", refValue: `PL-${r.ref.slice(4)}`,
        fields: [
          F("Date", r.etd), F("PO ref", r.po), F("Invoice", r.inv === "pending" ? "—" : r.inv), F("Container / AWB", r.box),
          F("Marks & numbers", `MERIDIAN / ${r.dest.toUpperCase()} / ${r.po}`),
          F("Packages", r.mode === "AIR" ? "14 cartons" : "1 x 40HC"),
          F("Net weight", r.qty.indexOf("MT") >= 0 ? r.qty : "18,420 kg"),
          F("Gross weight", r.qty.indexOf("MT") >= 0 ? r.qty : "19,180 kg"),
        ],
        lineCols: "110px minmax(0,1.6fr) 100px 96px 96px",
        lineHead: [H("Cartons"), H("Contents"), H("Qty", "right"), H("Net kg", "right"), H("Gross kg", "right")],
        lineRows: [
          R([["1–7"], [r.skuName], ["50%", "right"], ["9,210", "right", true], ["9,590", "right", true]]),
          R([["8–14"], [r.skuName], ["50%", "right"], ["9,210", "right", true], ["9,590", "right", true]]),
        ],
        sigLeft: "Packed & checked by",
      };

    case "Bill of Lading":
    case "Air Waybill":
    case "Delivery Note": {
      const isAir = r.mode === "AIR", isTrk = r.mode === "TRK";
      const nm = isAir ? "Air Waybill" : isTrk ? "Delivery Note" : "Bill of Lading";
      const issuer = isAir ? "IATA agent · Kuehne consolidation" : isTrk ? "Sentosa Logistics Pte Ltd" : "Ocean carrier · " + r.vessel.split(" / ")[0];
      return {
        ...base, issuer, title: nm, refLabel: nm, refValue: r.box,
        partyCols: 3, parties: [P("Shipper", r.supplier, SUP_ADDR[r.supplier] || ""), consignee, P("Notify party", "Wexler & Co", `Customs broker\nRef ${r.po}`)],
        fields: [
          F(isAir ? "Flight" : "Vessel", r.vessel), F("Port of loading", r.originPort), F("Port of discharge", r.destPort),
          F("Place of delivery", `${r.dest} (${r.dc})`), F("Freight terms", r.incoterm.indexOf("FOB") === 0 ? "Freight collect" : "Freight prepaid"),
          F("Shipped on board", r.etd), F("ETA", r.eta), F("Originals", isAir ? "3 (non-negotiable)" : "3/3"),
        ],
        lineCols: "150px 108px minmax(0,1.5fr) 110px",
        lineHead: [H("Container / ID"), H("Packages"), H("Description"), H("Qty", "right")],
        lineRows: [R([[r.box], [isAir ? "14 ctns" : "1 x 40HC"], [`${r.skuName} — HS ${r.hs}`], [r.qty, "right", true]])],
        notes: ["SHIPPED on board in apparent good order and condition unless otherwise stated."],
        stamp: r.prog >= 0.3 ? { text: "ON BOARD", color: C.green } : null,
      };
    }

    case "Certificate of Origin": {
      const authority = r.coo === "CN" ? "CCPIT" : r.coo === "IN" ? "FIEO" : r.coo === "ZA" ? "SARS" : "Singapore Business Federation";
      const transport = r.mode === "AIR" ? "By air" : r.mode === "TRK" ? "By road" : "By sea";
      return {
        ...base, issuer: authority, title: "Certificate of origin", refLabel: "Cert", refValue: `CO-${r.ref.slice(4)}-${r.coo}`,
        partyCols: 3, parties: [seller, consignee, P("Issuing authority", authority, `${coForm}\nIssued ${r.etd}`)],
        fields: [
          F("Country of origin", r.coo), F("Country of destination", r.dc), F("Transport", transport), F("Departure", r.etd),
          F("Vessel / flight", r.vessel), F("Port of discharge", r.destPort), F("Invoice ref", r.inv === "pending" ? "—" : r.inv),
          F("Preference claimed", /FTA/.test(r.dutyEst) ? "Yes" : "No"),
        ],
        lineCols: "70px minmax(0,1.7fr) 110px 110px",
        lineHead: [H("Item"), H("Description"), H("Origin criterion"), H("Qty", "right")],
        lineRows: [R([["1"], [`${r.skuName} — HS ${r.hs}`], ["WO"], [r.qty, "right", true]])],
        notes: ["It is hereby certified that the goods described originate in the stated country."],
        stamp: { text: "CERTIFIED", color: C.green },
      };
    }

    case "Customs Entry": {
      const dutyLine = r.dutyAct === "—" || r.dutyAct === "held" ? r.dutyEst : r.dutyAct;
      const entryType = r.dc === "US" ? "01 — consumption" : r.dc === "SG" ? "IN-permit" : "Bill of entry";
      return {
        ...base, issuer: "Wexler & Co Customs Brokers", title: "Customs entry summary", refLabel: "Entry", refValue: `ENT-${r.ref.slice(4)}-${r.dc}`,
        partyCols: 3, parties: [P("Importer of record", "Meridian Nutrition", BUYER_ADDR[r.dest] || ""), seller, P("Broker", "Wexler & Co", "Filer code WXL")],
        fields: [
          F("Entry type", entryType), F("Port of entry", r.destPort), F("Entry date", r.eta),
          F("Release", r.status === "At Customs" ? "PENDING" : r.eta), F("Country of origin", r.coo), F("Declared value", r.value),
          F("Duty rate", /FTA/.test(r.dutyEst) ? "0% (FTA)" : "3.1%"), F("Status", r.entry),
        ],
        lineCols: "60px 96px minmax(0,1.4fr) 108px 78px 100px",
        lineHead: [H("Line"), H("HS"), H("Description"), H("Value", "right"), H("Rate", "right"), H("Duty", "right")],
        lineRows: [R([["001"], [r.hs, "left", true], [r.skuName], [r.value, "right", true], [/FTA/.test(r.dutyEst) ? "0%" : "3.1%", "right"], [dutyLine, "right", true]])],
        totals: [{ k: "Duty", v: dutyLine }, { k: "MPF", v: "$88.42" }, { k: "Total payable", v: dutyLine }],
        notes: r.flag && r.flag.kind === "Duty variance" ? [r.flag.text] : [],
        stamp: r.status === "At Customs" ? { text: "PENDING", color: C.red } : r.prog >= 0.92 ? { text: "RELEASED", color: C.green } : null,
      };
    }

    case "HS Classification":
      return {
        ...base, issuer: "Meridian Nutrition · Trade Compliance", title: "HS classification", refLabel: "Worksheet", refValue: `HSC-${r.sku}`,
        partyCols: 2, parties: [P("Product", r.sku, r.skuName), P("Classified for", "Meridian Nutrition", BUYER_ADDR[r.dest] || "")],
        fields: [
          F("HS code", r.hs), F("Duty rate", /FTA/.test(r.dutyEst) ? "0% (FTA)" : "3.1%"), F("Basis", "GRI 1 / GRI 6"),
          F("Binding ruling", r.flag && r.flag.kind === "Duty variance" ? "RECOMMENDED" : "not required"),
          F("Classified by", "D. Kestrel"), F("Reviewed", "Wexler & Co"), F("Effective", r.etd), F("Review due", "12 Jun 2027"),
        ],
        lineCols: "110px minmax(0,2fr) 120px",
        lineHead: [H("Level"), H("Description"), H("Code", "right")],
        lineRows: [
          R([["Chapter"], [`Chapter ${r.hs.split(".")[0].slice(0, 2)}`], [r.hs.split(".")[0], "right", true]]),
          R([["Heading"], [r.skuName], [r.hs, "right", true]]),
        ],
        notes: r.flag && r.flag.kind === "Duty variance" ? [r.flag.text] : [],
        sigLeft: "Classifier",
      };

    case "Insurance Certificate":
      return {
        ...base, issuer: "Trident Marine Underwriters", title: "Insurance certificate", refLabel: "Cert", refValue: `INS-${r.ref.slice(4)}`,
        fields: [
          F("Insured value", r.value), F("Coverage", "ICC (A) all risks"), F("Conveyance", r.vessel),
          F("From", r.originPort), F("To", `${r.dest} (${r.dc})`), F("Deductible", "nil"),
          F("Claims agent", "Trident " + r.dc), F("Valid from", r.etd),
        ],
        notes: ["Claims payable at destination in the currency of this certificate."],
      };

    case "Inspection Report": {
      const fail = r.status === "QC Hold";
      return {
        ...base, issuer: "Meridian Nutrition · Quality Assurance", title: "Inspection report", refLabel: "Report", refValue: `QIR-${r.ref.slice(4)}`,
        partyCols: 2, parties: [P("Lot", r.sku, r.skuName), P("Supplier", r.supplier, SUP_ADDR[r.supplier] || "")],
        fields: [
          F("Inspection date", r.eta), F("Inspector", "R. Achebe"), F("Sample size", "20"), F("AQL", "1.0 / normal II"),
          F("Result", fail ? "REJECT" : "ACCEPT"), F("Goods receipt", r.grnRef),
          F("Disposition", fail ? "Quarantine" : "Release to stores"), F("CAR", fail ? "CAR-0918" : "—"),
        ],
        lineCols: "minmax(0,1.5fr) 130px 130px 100px",
        lineHead: [H("Test"), H("Spec"), H("Measured"), H("Verdict", "right")],
        lineRows: [
          R([["Identity"], ["Conforms"], ["Conforms"], ["Pass", "right"]]),
          R([["Protein assay"], ["≥ 50%"], [fail ? "46.2 %" : "51.4 %"], [fail ? "FAIL" : "Pass", "right"]]),
          R([["Heavy metals"], ["< limit"], ["< limit"], ["Pass", "right"]]),
          R([["Total plate count"], ["< 10³ cfu/g"], ["< 10³ cfu/g"], ["Pass", "right"]]),
        ],
        notes: fail ? [r.flag?.text ?? "Lot rejected — see CAR-0918."] : [],
        stamp: fail ? { text: "REJECTED", color: C.red } : { text: "ACCEPTED", color: C.green },
      };
    }

    default:
      return { ...base, title: docName, fields: [F("Movement", r.ref), F("PO", r.po), F("Status", r.status)] };
  }
}
