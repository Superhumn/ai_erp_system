import React from "react";
import { color as c, font, shadow, tabular } from "../tokens";
import {
  Frame,
  Sidebar,
  Main,
  HDivider,
  Th,
  Td,
  Tr,
  ItemCell,
  StatusChip,
  type ChipTone,
} from "../primitives";

const mono = "'IBM Plex Mono', monospace";

const glass: React.CSSProperties = {
  width: 300,
  flexShrink: 0,
  margin: "14px 14px 14px 0",
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.9)",
  borderRadius: 20,
  padding: 22,
  boxShadow: "0 16px 48px rgba(15,25,70,0.16)",
  display: "flex",
  flexDirection: "column",
};

const tile: React.CSSProperties = {
  background: "rgba(255,255,255,0.85)",
  borderRadius: 11,
  padding: "10px 12px",
};

const RawBadge = () => (
  <span
    style={{
      fontSize: 9.5,
      fontWeight: 700,
      color: "oklch(0.55 0.015 260)",
      border: "1px solid oklch(0.90 0.005 250)",
      borderRadius: 5,
      padding: "1px 5px",
      marginLeft: 4,
    }}
  >
    RAW
  </span>
);

type Kpi = { label: string; value: string; tone: string; valueTone: string };

const KPIS: Kpi[] = [
  { label: "SKUs tracked", value: "38", tone: c.faint, valueTone: c.ink },
  { label: "Total value", value: "$214,760", tone: c.faint, valueTone: c.ink },
  { label: "Low stock", value: "3", tone: "oklch(0.25 0.02 262)", valueTone: "oklch(0.25 0.02 262)" },
  { label: "Out of stock", value: "1", tone: c.ink, valueTone: c.ink },
  { label: "In transit", value: "2", tone: c.faint, valueTone: c.ink },
];

type Row = {
  product: React.ReactNode;
  sku: string;
  location: string;
  available: string;
  reorder: string;
  onOrder: string;
  onOrderBlue: boolean;
  value: string;
  status: { label: string; tone: ChipTone };
  selected?: boolean;
};

const ROWS: Row[] = [
  {
    product: "Lion's Mane Powder 500g",
    sku: "LM-PWD-500",
    location: "Main Warehouse",
    available: "1,060",
    reorder: "400",
    onOrder: "—",
    onOrderBlue: false,
    value: "$10,416",
    status: { label: "OK", tone: "neutral" },
  },
  {
    product: "Reishi Capsules 90ct",
    sku: "RSH-CAP-90",
    location: "Main Warehouse",
    available: "272",
    reorder: "350",
    onOrder: "500",
    onOrderBlue: true,
    value: "$1,903",
    status: { label: "LOW", tone: "neutral" },
    selected: true,
  },
  {
    product: "Cordyceps Powder 250g",
    sku: "CRD-PWD-250",
    location: "Vitala Copack",
    available: "0",
    reorder: "200",
    onOrder: "800",
    onOrderBlue: true,
    value: "—",
    status: { label: "OUT", tone: "dark" },
  },
  {
    product: (
      <>
        Lion's Mane Extract <RawBadge />
      </>
    ),
    sku: "RM-MUSH-LM",
    location: "Production",
    available: "420",
    reorder: "250",
    onOrder: "—",
    onOrderBlue: false,
    value: "$17,280",
    status: { label: "OK", tone: "neutral" },
  },
  {
    product: (
      <>
        Hemp Protein 70% <RawBadge />
      </>
    ),
    sku: "RM-HEMP-P",
    location: "Main Warehouse",
    available: "168",
    reorder: "200",
    onOrder: "1,000",
    onOrderBlue: true,
    value: "$983",
    status: { label: "LOW", tone: "neutral" },
  },
  {
    product: "Amber Glass Jar 250ml",
    sku: "PKG-JAR-250",
    location: "Main Warehouse",
    available: "7,200",
    reorder: "3,000",
    onOrder: "—",
    onOrderBlue: false,
    value: "$5,208",
    status: { label: "OK", tone: "neutral" },
  },
  {
    product: "Label — Lion's Mane",
    sku: "PKG-LBL-LM",
    location: "Vitala Copack",
    available: "2,150",
    reorder: "2,500",
    onOrder: "10,000",
    onOrderBlue: true,
    value: "$237",
    status: { label: "LOW", tone: "neutral" },
  },
  {
    product: "Focus Blend Bulk 5kg",
    sku: "MX-BLND-01",
    location: "Production",
    available: "24",
    reorder: "10",
    onOrder: "—",
    onOrderBlue: false,
    value: "$3,456",
    status: { label: "OK", tone: "neutral" },
  },
];

const TILES: { label: string; value: string }[] = [
  { label: "On hand", value: "312" },
  { label: "Reserved", value: "40" },
  { label: "Reorder point", value: "350" },
  { label: "Unit cost", value: "$6.10" },
];

const SUPPLY: { id: string; note: string; chip: string; tone: ChipTone }[] = [
  { id: "PO-2041", note: "PackRight · 500u", chip: "CONFIRMED", tone: "neutral" },
  { id: "SHP-308", note: "Arrives Jul 19", chip: "IN TRANSIT", tone: "active" },
];

export default function Inventory() {
  return (
    <Frame label="5a Inventory" height={880}>
      <Sidebar active="Inventory" />
      <Main>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.035em", fontFamily: font.display }}>
              Inventory
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: c.muted3 }}>
              Unified — stock, POs, shipments, costing, vendors
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: 260,
                height: 36,
                padding: "0 14px",
                borderRadius: 9999,
                border: "1px solid oklch(0.92 0.005 250)",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(15,25,70,0.04)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="oklch(0.60 0.015 260)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <span style={{ fontSize: 12.5, color: "oklch(0.60 0.015 260)" }}>Search SKU, vendor, category…</span>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 36,
                padding: "0 16px",
                borderRadius: 9999,
                border: "1px solid oklch(0.92 0.005 250)",
                background: "#fff",
                fontSize: 12.5,
                fontWeight: 600,
                color: c.ink2,
                cursor: "pointer",
              }}
            >
              All status ⌄
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 36,
                padding: "0 18px",
                borderRadius: 9999,
                fontSize: 12.5,
                fontWeight: 600,
                color: "#fff",
                background: c.blueGrad,
                cursor: "pointer",
                boxShadow: shadow.cta,
              }}
            >
              + New item
            </span>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: "flex", alignItems: "stretch", marginTop: 14 }}>
          {KPIS.map((k, i) => (
            <React.Fragment key={k.label}>
              {i > 0 && (
                <div style={{ width: 1, background: "linear-gradient(180deg, transparent, oklch(0.90 0.005 250), transparent)" }} />
              )}
              <div
                style={{
                  flex: 1,
                  paddingLeft: i === 0 ? 0 : 16,
                  paddingRight: i === KPIS.length - 1 ? 0 : 16,
                }}
              >
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: k.tone }}>
                  {k.label}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: "-0.04em", fontFamily: font.display, color: k.valueTone }}>
                  {k.value}
                </p>
              </div>
            </React.Fragment>
          ))}
        </div>
        <HDivider marginTop={12} />

        {/* Table */}
        <div style={{ flex: 1, marginTop: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Location</Th>
                <Th align="right">Available</Th>
                <Th align="right">Reorder</Th>
                <Th align="right">On order</Th>
                <Th align="right">Value</Th>
                <th style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: c.faint, textAlign: "center", padding: "0 0 6px", borderBottom: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const last = i === ROWS.length - 1;
                if (r.selected) {
                  return (
                    <tr key={r.sku} style={{ background: "oklch(0.47 0.21 255 / 0.05)", borderBottom: `1px solid ${c.rowSep}` }}>
                      <td style={{ padding: "7px 0" }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: c.blueText }}>{r.product}</p>
                      </td>
                      <td style={{ padding: "7px 0", fontSize: 11.5, fontFamily: mono, color: "oklch(0.42 0.21 255)", verticalAlign: "middle" }}>{r.sku}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, color: c.ink3, verticalAlign: "middle" }}>{r.location}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, textAlign: "right", fontWeight: 600, verticalAlign: "middle", ...tabular }}>{r.available}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, textAlign: "right", color: c.muted3, verticalAlign: "middle", ...tabular }}>{r.reorder}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, textAlign: "right", color: "oklch(0.42 0.21 255)", fontWeight: 600, verticalAlign: "middle", ...tabular }}>{r.onOrder}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, textAlign: "right", fontWeight: 600, verticalAlign: "middle", ...tabular }}>{r.value}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, textAlign: "center", verticalAlign: "middle" }}>
                        <StatusChip tone={r.status.tone}>{r.status.label}</StatusChip>
                      </td>
                    </tr>
                  );
                }
                return (
                  <Tr key={r.sku} last={last}>
                    <ItemCell name={r.product} />
                    <Td style={{ fontFamily: mono, fontSize: 11.5, color: c.ink3 }}>{r.sku}</Td>
                    <Td style={{ color: c.ink3 }}>{r.location}</Td>
                    <Td align="right" style={{ fontWeight: 600, ...tabular }}>{r.available}</Td>
                    <Td align="right" style={{ color: c.muted3, ...tabular }}>{r.reorder}</Td>
                    <Td align="right" style={{ color: r.onOrderBlue ? "oklch(0.42 0.21 255)" : c.muted3, fontWeight: r.onOrderBlue ? 600 : 400, ...tabular }}>
                      {r.onOrder}
                    </Td>
                    <Td align="right" style={{ color: r.value === "—" ? c.muted3 : c.ink, fontWeight: r.value === "—" ? 400 : 600, ...tabular }}>
                      {r.value}
                    </Td>
                    <Td style={{ textAlign: "center" }}>
                      <StatusChip tone={r.status.tone}>{r.status.label}</StatusChip>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Main>

      {/* Glass detail panel */}
      <div style={glass}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>
              Reishi Capsules 90ct
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 11.5, fontFamily: mono, color: c.muted2 }}>RSH-CAP-90</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.35 0.02 262)", background: "oklch(0.945 0.004 250)", borderRadius: 9999, padding: "3px 10px" }}>
            LOW STOCK
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
          {TILES.map((t) => (
            <div key={t.label} style={tile}>
              <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>
                {t.label}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, fontFamily: font.display }}>{t.value}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, background: "oklch(0.47 0.21 255 / 0.07)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="oklch(0.47 0.21 255)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            </svg>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: c.blueText }}>AI insight</p>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "oklch(0.35 0.02 262)", lineHeight: 1.55 }}>
            At the current sell-through (26/wk) you'll stock out around <strong>Aug 9</strong>. PO-2041 (500 units) lands Jul 19 — coverage through October.
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>
            Open supply
          </p>
          {SUPPLY.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12.5,
                padding: "7px 0",
                borderBottom: i === SUPPLY.length - 1 ? "none" : "1px solid rgba(255,255,255,0.9)",
              }}
            >
              <span style={{ fontFamily: mono, fontSize: 11.5 }}>{s.id}</span>
              <span style={{ color: c.muted2 }}>{s.note}</span>
              <StatusChip tone={s.tone}>{s.chip}</StatusChip>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
          <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: "#fff", background: c.blueGrad, borderRadius: 9999, padding: "9px 0", cursor: "pointer", boxShadow: shadow.cta }}>
            Create PO
          </span>
          <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: c.ink2, border: `1px solid ${c.border}`, background: "#fff", borderRadius: 9999, padding: "9px 0", cursor: "pointer" }}>
            Transfer
          </span>
        </div>
      </div>
    </Frame>
  );
}
