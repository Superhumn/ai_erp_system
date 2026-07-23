import React from "react";
import { color as c, font, shadow, tabular } from "../tokens";
import {
  Frame,
  Sidebar,
  Main,
  HDivider,
  Segmented,
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

type Kpi = { label: string; value: string };

const KPIS: Kpi[] = [
  { label: "Open POs", value: "12" },
  { label: "Pending value", value: "$52,300" },
  { label: "Active vendors", value: "17" },
  { label: "Avg lead time", value: "12 days" },
];

type Row = {
  po: string;
  vendor: string;
  status: { label: string; tone: ChipTone };
  ordered: string;
  expected: string;
  total: string;
  selected?: boolean;
};

const ROWS: Row[] = [
  { po: "PO-2044", vendor: "Fresh Farms", status: { label: "SENT", tone: "active" }, ordered: "Jul 14", expected: "Jul 24", total: "$8,960", selected: true },
  { po: "PO-2043", vendor: "GreenLeaf Supply", status: { label: "DRAFT", tone: "neutral" }, ordered: "Jul 13", expected: "Aug 1", total: "$4,212" },
  { po: "PO-2042", vendor: "PrintWorks", status: { label: "SENT", tone: "active" }, ordered: "Jul 10", expected: "Jul 21", total: "$1,100" },
  { po: "PO-2041", vendor: "PackRight Co", status: { label: "CONFIRMED", tone: "neutral" }, ordered: "Jul 8", expected: "Jul 19", total: "$3,050" },
  { po: "PO-2038", vendor: "GreenLeaf Supply", status: { label: "PARTIAL", tone: "neutral" }, ordered: "Jun 30", expected: "Jul 15", total: "$5,850" },
  { po: "PO-2035", vendor: "Fresh Farms", status: { label: "RECEIVED", tone: "neutral" }, ordered: "Jun 22", expected: "Jul 2", total: "$12,800" },
];

const LINE_ITEMS: { name: string; spec: string; amount: string }[] = [
  { name: "Lion's Mane Extract", spec: "200 kg × $32.00", amount: "$6,400" },
  { name: "Cordyceps (raw)", spec: "80 kg × $32.00", amount: "$2,560" },
];

export default function Procurement() {
  return (
    <Frame label="5b Procurement" height={880}>
      <Sidebar active="Procurement" />
      <Main>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.035em", fontFamily: font.display }}>
              Procurement
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: c.muted3 }}>
              Purchase orders, vendors, materials & quotes
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Segmented options={["Purchase orders", "Vendors", "Materials", "Quotes"]} value="Purchase orders" />
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
              + New PO
            </span>
          </div>
        </div>

        {/* AI banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, background: "oklch(0.47 0.21 255 / 0.06)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 14, padding: "12px 18px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="oklch(0.47 0.21 255)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          </svg>
          <p style={{ margin: 0, flex: 1, fontSize: 13, color: "oklch(0.30 0.02 262)" }}>
            <strong style={{ fontWeight: 700 }}>3 AI-drafted POs</strong> from demand forecast & reorder points — hemp protein, cordyceps, LM labels · est. $18,400
          </p>
          <span style={{ fontSize: 12, fontWeight: 600, color: c.blueText, background: "#fff", border: "1px solid oklch(0.47 0.21 255 / 0.3)", borderRadius: 9999, padding: "6px 15px", cursor: "pointer" }}>
            Review drafts
          </span>
        </div>

        {/* KPI strip */}
        <div style={{ display: "flex", alignItems: "stretch", marginTop: 14 }}>
          {KPIS.map((k, i) => (
            <React.Fragment key={k.label}>
              {i > 0 && (
                <div style={{ width: 1, background: "linear-gradient(180deg, transparent, oklch(0.90 0.005 250), transparent)" }} />
              )}
              <div style={{ flex: 1, paddingLeft: i === 0 ? 0 : 16, paddingRight: i === KPIS.length - 1 ? 0 : 16 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: c.faint }}>
                  {k.label}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: "-0.04em", fontFamily: font.display, color: c.ink }}>
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
                <Th>PO</Th>
                <Th>Status</Th>
                <Th>Ordered</Th>
                <Th>Expected</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const last = i === ROWS.length - 1;
                if (r.selected) {
                  return (
                    <tr key={r.po} style={{ background: "oklch(0.47 0.21 255 / 0.05)", borderBottom: `1px solid ${c.rowSep}` }}>
                      <td style={{ padding: "7px 0", verticalAlign: "middle" }}>
                        <p style={{ margin: 0, fontSize: 12, fontFamily: mono, fontWeight: 600, color: c.blueText }}>{r.po}</p>
                        <p style={{ margin: "1px 0 0", fontSize: 10.5, color: c.muted3 }}>{r.vendor}</p>
                      </td>
                      <td style={{ padding: "7px 0", verticalAlign: "middle" }}>
                        <StatusChip tone={r.status.tone}>{r.status.label}</StatusChip>
                      </td>
                      <td style={{ padding: "7px 0", fontSize: 12, color: c.muted, verticalAlign: "middle" }}>{r.ordered}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, color: c.muted, verticalAlign: "middle" }}>{r.expected}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, textAlign: "right", fontWeight: 600, verticalAlign: "middle", ...tabular }}>{r.total}</td>
                    </tr>
                  );
                }
                return (
                  <Tr key={r.po} last={last}>
                    <ItemCell
                      name={<span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600 }}>{r.po}</span>}
                      sub={r.vendor}
                    />
                    <Td>
                      <StatusChip tone={r.status.tone}>{r.status.label}</StatusChip>
                    </Td>
                    <Td style={{ color: c.muted }}>{r.ordered}</Td>
                    <Td style={{ color: c.muted }}>{r.expected}</Td>
                    <Td align="right" style={{ fontWeight: 600, ...tabular }}>{r.total}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Main>

      {/* Glass PO detail */}
      <div style={glass}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>PO-2044</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: c.muted2 }}>Fresh Farms · Maria Lopez</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.blueText, background: c.blueTint, borderRadius: 9999, padding: "3px 10px" }}>
            SENT
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <div style={tile}>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>Total</p>
            <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, fontFamily: font.display }}>$8,960</p>
          </div>
          <div style={tile}>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>Expected</p>
            <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, fontFamily: font.display }}>Jul 24</p>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>
            Line items
          </p>
          {LINE_ITEMS.map((li, i) => (
            <div
              key={li.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12.5,
                padding: "8px 0",
                borderBottom: i === LINE_ITEMS.length - 1 ? "none" : "1px solid rgba(255,255,255,0.9)",
              }}
            >
              <span style={{ fontWeight: 600 }}>{li.name}</span>
              <span style={{ color: c.muted2 }}>{li.spec}</span>
              <span style={{ fontWeight: 600, ...tabular }}>{li.amount}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, background: "oklch(0.47 0.21 255 / 0.07)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 12, padding: "12px 14px" }}>
          <p style={{ margin: 0, fontSize: 12, color: "oklch(0.35 0.02 262)", lineHeight: 1.55 }}>
            <strong style={{ color: c.blueText }}>AI:</strong> Fresh Farms confirmed the last 6 POs within 24h. Price is 4% below their trailing average — good buy.
          </p>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.blueGrad, borderRadius: 9999, padding: "10px 0", cursor: "pointer", boxShadow: shadow.cta }}>
            Nudge vendor to confirm
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: c.ink2, border: `1px solid ${c.border}`, background: "#fff", borderRadius: 9999, padding: "8px 0", cursor: "pointer" }}>
              Edit PO
            </span>
            <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: c.ink2, border: `1px solid ${c.border}`, background: "#fff", borderRadius: 9999, padding: "8px 0", cursor: "pointer" }}>
              Documents
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
