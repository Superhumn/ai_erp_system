import React from "react";
import { color as c } from "../tokens";
import { Frame, Sidebar, Main, Header, Segmented, HDivider, StatusChip } from "../primitives";

const th: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "oklch(0.62 0.015 260)",
  borderBottom: "1px solid oklch(0.92 0.005 250)",
};

type Step = { n: string; label: string; state: "done" | "current" | "todo" };
const STEPS: Step[] = [
  { n: "✓", label: "Upload", state: "done" },
  { n: "2", label: "Map fields", state: "current" },
  { n: "3", label: "Validate", state: "todo" },
  { n: "4", label: "Import", state: "todo" },
];

type MapRow = { source: string; field: string; sample: string; status: "MAPPED" | "CHECK" };
const ROWS: MapRow[] = [
  { source: "sku_code", field: "SKU", sample: "OAT-500-CS", status: "MAPPED" },
  { source: "product_name", field: "Name", sample: "Oat Blend 500g", status: "MAPPED" },
  { source: "unit_cost", field: "Unit cost", sample: "$4.20", status: "MAPPED" },
  { source: "qty_on_hand", field: "On hand", sample: "1,240", status: "MAPPED" },
  { source: "reorder_pt", field: "Reorder point", sample: "300", status: "MAPPED" },
  { source: "vendor", field: "Vendor", sample: "Nordic Steel", status: "CHECK" },
  { source: "category_raw", field: "Category", sample: "Dry goods", status: "CHECK" },
  { source: "lead_days", field: "Lead time (days)", sample: "21", status: "MAPPED" },
];

function StepDot({ step }: { step: Step }) {
  const base: React.CSSProperties = {
    height: 24,
    width: 24,
    borderRadius: 9999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
  };
  const styles: Record<Step["state"], React.CSSProperties> = {
    done: { background: c.blue, color: "#fff" },
    current: { background: "#fff", color: c.blueText, border: `2px solid ${c.blue}`, boxSizing: "border-box" },
    todo: { background: "oklch(0.945 0.004 250)", color: c.muted },
  };
  return <span style={{ ...base, ...styles[step.state] }}>{step.n}</span>;
}

export default function Import() {
  return (
    <Frame label="10i Import" height={680}>
      <Sidebar active="Import" />
      <Main>
        <Header
          title="Import"
          subtitle="Bring data into Superhumn"
          right={
            <>
              <Segmented options={["CSV / Excel", "From another app", "API"]} value="CSV / Excel" />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 9999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: c.ink,
                  background: "#fff",
                  border: `1px solid ${c.border}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Download templates
              </span>
            </>
          }
        />

        <div style={{ display: "flex", alignItems: "center", marginTop: 16, maxWidth: 760 }}>
          {STEPS.map((step, i) => (
            <React.Fragment key={step.label}>
              {i > 0 && <div style={{ flex: 1, height: 2, background: "oklch(0.92 0.005 250)", margin: "0 10px", borderRadius: 2 }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StepDot step={step} />
                <span style={{ fontSize: 12.5, fontWeight: step.state === "todo" ? 500 : 700, color: step.state === "todo" ? c.muted : c.ink }}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        <HDivider marginTop={12} />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.75fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: c.faint,
              }}
            >
              Map columns · products.csv → Inventory
            </p>
            <div style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Source column</th>
                    <th style={{ ...th, textAlign: "left" }}></th>
                    <th style={{ ...th, textAlign: "left" }}>ERP field</th>
                    <th style={{ ...th, textAlign: "left" }}>Sample</th>
                    <th style={{ ...th, textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr key={r.source} style={{ borderBottom: i === ROWS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                      <td style={{ padding: "7px 8px" }}>
                        <span style={{ fontWeight: 600, fontFamily: "ui-monospace,monospace", fontSize: 11.5 }}>{r.source}</span>
                      </td>
                      <td style={{ padding: "7px 8px", color: c.muted }}>→</td>
                      <td style={{ padding: "7px 8px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            border: r.status === "CHECK" ? "1px solid oklch(0.47 0.21 255 / 0.4)" : "1px solid oklch(0.92 0.005 250)",
                            borderRadius: 7,
                            padding: "3px 9px",
                            background: "#fff",
                            fontSize: 12,
                          }}
                        >
                          {r.field}
                          <span style={{ color: c.muted, fontSize: 10 }}>▾</span>
                        </span>
                      </td>
                      <td style={{ padding: "7px 8px", color: "oklch(0.45 0.015 260)" }}>{r.sample}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right" }}>
                        <StatusChip tone={r.status === "CHECK" ? "active" : "neutral"}>{r.status}</StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11, color: c.muted3 }}>2 columns need review before validation.</p>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
