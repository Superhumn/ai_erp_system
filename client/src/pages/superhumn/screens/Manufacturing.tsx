import React from "react";
import { color as c, font, shadow, tabular } from "../tokens";
import {
  Frame,
  Sidebar,
  Main,
  Header,
  KpiStrip,
  Segmented,
  CTA,
  Th,
  Td,
  Tr,
  ItemCell,
  StatusChip,
  Meter,
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
  padding: 18,
  boxShadow: "0 16px 48px rgba(15,25,70,0.16)",
  display: "flex",
  flexDirection: "column",
};

function MiniChip({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: dark ? "#fff" : "oklch(0.38 0.02 262)",
        background: dark ? "oklch(0.30 0.02 262)" : "oklch(0.945 0.004 250)",
        borderRadius: 9999,
        padding: "1px 7px",
      }}
    >
      {children}
    </span>
  );
}

type Row = {
  wo: string;
  product: string;
  site: string;
  qty: string;
  progress: number;
  due: string;
  status: { label: string; tone: ChipTone };
  selected?: boolean;
};

const ROWS: Row[] = [
  { wo: "WO-91", product: "Focus Blend Bulk 5kg", site: "Production", qty: "40", progress: 70, due: "Jul 19", status: { label: "RUNNING", tone: "active" }, selected: true },
  { wo: "WO-90", product: "Reishi Capsules 90ct", site: "Vitala Copack", qty: "5,000", progress: 35, due: "Jul 24", status: { label: "RUNNING", tone: "active" } },
  { wo: "WO-89", product: "Lion's Mane Powder 500g", site: "Production", qty: "1,200", progress: 0, due: "Jul 26", status: { label: "SCHEDULED", tone: "neutral" } },
  { wo: "WO-88", product: "Focus Blend Bulk 5kg", site: "Production", qty: "36", progress: 100, due: "Jul 17", status: { label: "DONE 97.2%", tone: "neutral" } },
  { wo: "WO-87", product: "Cordyceps Powder 250g", site: "Vitala Copack", qty: "800", progress: 100, due: "Jul 12", status: { label: "DONE 95.1%", tone: "neutral" } },
  { wo: "WO-86", product: "Reishi Capsules 90ct", site: "Vitala Copack", qty: "4,500", progress: 100, due: "Jul 5", status: { label: "DONE 96.8%", tone: "neutral" } },
];

const BOM: { name: string; qty: string; low: boolean }[] = [
  { name: "Lion's Mane Extract", qty: "18 kg", low: false },
  { name: "Cordyceps Powder", qty: "9 kg", low: false },
  { name: "Hemp Protein 70%", qty: "12 kg", low: true },
  { name: "Amber Jar 250ml", qty: "40 ea", low: false },
];

export default function Manufacturing() {
  return (
    <Frame label="9a Manufacturing" height={660}>
      <Sidebar active="Manufacturing" />
      <Main>
        <Header
          title="Manufacturing"
          subtitle="Work orders, BOMs & production runs"
          right={
            <>
              <Segmented options={["Work orders", "BOMs", "Batches"]} value="Work orders" />
              <CTA>+ Work order</CTA>
            </>
          }
        />

        <KpiStrip
          items={[
            { label: "In progress", value: "4", highlight: true },
            { label: "Scheduled", value: "6" },
            { label: "Units this month", value: "18,400" },
            { label: "Avg yield", value: "96.4%" },
          ]}
        />

        <div style={{ flex: 1, marginTop: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <Th>WO</Th>
                <Th>Product</Th>
                <Th>Site</Th>
                <Th align="right">Qty</Th>
                <Th width={110}>Progress</Th>
                <Th>Due</Th>
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
                    <tr key={r.wo} style={{ background: "oklch(0.47 0.21 255 / 0.05)", borderBottom: `1px solid ${c.rowSep}` }}>
                      <td style={{ padding: "7px 0", fontSize: 11.5, fontFamily: mono, color: c.blueText, verticalAlign: "middle" }}>{r.wo}</td>
                      <td style={{ padding: "7px 0", fontSize: 12.5, fontWeight: 600, verticalAlign: "middle" }}>{r.product}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, color: c.muted, verticalAlign: "middle" }}>{r.site}</td>
                      <td style={{ padding: "7px 0", fontSize: 12, textAlign: "right", verticalAlign: "middle", ...tabular }}>{r.qty}</td>
                      <td style={{ padding: "7px 0", verticalAlign: "middle" }}>
                        <Meter value={r.progress} height={5} />
                      </td>
                      <td style={{ padding: "7px 0", fontSize: 12, color: c.muted, verticalAlign: "middle" }}>{r.due}</td>
                      <td style={{ padding: "7px 0", textAlign: "center", verticalAlign: "middle" }}>
                        <StatusChip tone={r.status.tone}>{r.status.label}</StatusChip>
                      </td>
                    </tr>
                  );
                }
                return (
                  <Tr key={r.wo} last={last}>
                    <Td style={{ fontFamily: mono, fontSize: 11.5, color: c.ink3 }}>{r.wo}</Td>
                    <ItemCell name={r.product} />
                    <Td style={{ color: c.muted }}>{r.site}</Td>
                    <Td align="right" style={tabular}>{r.qty}</Td>
                    <Td>
                      <Meter value={r.progress} height={5} />
                    </Td>
                    <Td style={{ color: c.muted }}>{r.due}</Td>
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

      {/* BOM glass panel */}
      <div style={glass}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>
              WO-91 · Focus Blend
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: c.muted2 }}>40 units · Production · due Jul 19</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.blueText, background: c.blueTint, borderRadius: 9999, padding: "3px 10px" }}>
            70%
          </span>
        </div>

        <p style={{ margin: "16px 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>
          Bill of materials · per batch
        </p>
        {BOM.map((b, i) => (
          <div
            key={b.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              padding: "6px 0",
              borderBottom: i === BOM.length - 1 ? "none" : "1px solid rgba(255,255,255,0.9)",
            }}
          >
            <span style={{ fontWeight: 600 }}>{b.name}</span>
            <span style={{ color: c.muted2 }}>{b.qty}</span>
            <MiniChip dark={b.low}>{b.low ? "LOW" : "OK"}</MiniChip>
          </div>
        ))}

        <div style={{ marginTop: 14, background: "oklch(0.47 0.21 255 / 0.06)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 12, padding: "11px 13px" }}>
          <p style={{ margin: 0, fontSize: 11.5, color: "oklch(0.35 0.02 262)", lineHeight: 1.5 }}>
            <strong style={{ color: c.blueText }}>AI:</strong> Hemp protein covers this batch but drops below reorder after. PO-2043 (draft) would restock — approve in queue.
          </p>
        </div>

        <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
          <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: "#fff", background: c.blueGrad, borderRadius: 9999, padding: "9px 0", cursor: "pointer", boxShadow: shadow.cta }}>
            Complete run
          </span>
          <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: c.ink2, border: `1px solid ${c.border}`, background: "#fff", borderRadius: 9999, padding: "9px 0", cursor: "pointer" }}>
            Pause
          </span>
        </div>
      </div>
    </Frame>
  );
}
