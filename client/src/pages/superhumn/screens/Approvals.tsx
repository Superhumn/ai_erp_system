import type { CSSProperties, ReactNode } from "react";
import { color as c, font, shadow } from "../tokens";
import { Frame, Sidebar, Main, Header } from "../primitives";

function ApprovePrimary({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.blueGrad, borderRadius: 9999, padding: "7px 18px", cursor: "pointer", boxShadow: shadow.cta }}>
      {children}
    </span>
  );
}

function ApproveSecondary({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.40 0.02 262)", border: "1px solid oklch(0.90 0.005 250)", background: "#fff", borderRadius: 9999, padding: "7px 18px", cursor: "pointer" }}>
      {children}
    </span>
  );
}

const detailCard: CSSProperties = { background: "oklch(0.965 0.003 250)", borderRadius: 10, padding: "9px 12px" };
const detailLabel: CSSProperties = { margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" };
const detailValue: CSSProperties = { margin: "3px 0 0", fontSize: 12, fontWeight: 600 };
const draftedNote: CSSProperties = { marginLeft: "auto", fontSize: 11.5, color: "oklch(0.58 0.015 260)" };

const DETAILS: { label: string; value: string }[] = [
  { label: "Trigger", value: "Stock ≤ reorder in 9 days" },
  { label: "Unit price", value: "$5.85 / kg · matches last PO" },
  { label: "Lead time", value: "14 days · lands Aug 1" },
  { label: "Confidence", value: "High · 94%" },
];

const AUTO: { label: string; text: string; time: string }[] = [
  { label: "Reconciled payment", text: " — $12,400 → INV-0192 Thrive Market", time: "09:41" },
  { label: "Categorized 9 emails", text: " — 2 invoices imported to drafts", time: "08:12" },
  { label: "Updated tracking", text: " — SHP-308 in transit, ETA Jul 19", time: "07:44" },
  { label: "Demand forecast", text: " — Lion's Mane +22% for August", time: "06:30" },
];

export default function Approvals() {
  return (
    <Frame label="6c Approvals" height={640}>
      <Sidebar active="Finance" />
      <Main>
        <Header
          title="Approvals"
          subtitle="Agent actions over threshold wait here — nothing executes without you"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "oklch(0.50 0.015 260)" }}>
              <span><strong style={{ color: "oklch(0.16 0.025 262)", fontWeight: 700 }}>2</strong> awaiting</span>
              <span style={{ height: 14, width: 1, background: "oklch(0.90 0.005 250)" }} />
              <span><strong style={{ color: "oklch(0.16 0.025 262)", fontWeight: 700 }}>12</strong> auto-executed today</span>
              <span style={{ height: 14, width: 1, background: "oklch(0.90 0.005 250)" }} />
              <span>threshold <strong style={{ color: "oklch(0.16 0.025 262)", fontWeight: 700 }}>$5,000</strong></span>
            </div>
          }
        />

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Card 1 — highlighted approval */}
          <div style={{ background: "#fff", border: "1.5px solid oklch(0.47 0.21 255 / 0.45)", borderRadius: 16, padding: "16px 20px", boxShadow: "0 8px 24px rgba(15,25,70,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.40 0.21 255)", background: "oklch(0.47 0.21 255 / 0.12)", borderRadius: 9999, padding: "3px 10px" }}>AUTO-REORDER</span>
              <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700, fontFamily: font.display }}>Create PO-2045 — Hemp Protein 70%, 1,000 kg, GreenLeaf Supply</p>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: font.display }}>$5,850</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 12 }}>
              {DETAILS.map((d) => (
                <div key={d.label} style={detailCard}>
                  <p style={detailLabel}>{d.label}</p>
                  <p style={detailValue}>{d.value}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
              <ApprovePrimary>Approve &amp; send</ApprovePrimary>
              <ApproveSecondary>Edit quantities</ApproveSecondary>
              <ApproveSecondary>Reject</ApproveSecondary>
              <span style={draftedNote}>drafted 09:52 · agent: supply-chain</span>
            </div>
          </div>

          {/* Card 2 — collections */}
          <div style={{ background: "#fff", border: "1px solid oklch(0.93 0.004 250 / 0.9)", borderRadius: 16, padding: "16px 20px", boxShadow: "0 1px 2px rgba(15,25,70,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.38 0.02 262)", background: "oklch(0.945 0.004 250)", borderRadius: 9999, padding: "3px 10px" }}>COLLECTIONS</span>
              <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700, fontFamily: font.display }}>Send 3 overdue-invoice reminder emails</p>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: font.display }}>$15,160</span>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "oklch(0.50 0.015 260)" }}>Bristol Farms (12d) · Lassens (21d) · GoPuff (34d) — tone: firm but friendly, preview each before send.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <ApprovePrimary>Send all</ApprovePrimary>
              <ApproveSecondary>Preview drafts</ApproveSecondary>
              <span style={draftedNote}>drafted 07:58 · agent: finance</span>
            </div>
          </div>

          {/* Auto-executed list */}
          <div style={{ marginTop: 6 }}>
            <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>Auto-executed today · below threshold</p>
            {AUTO.map((a, i) => (
              <div key={a.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "7px 0", borderBottom: i === AUTO.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                <span><strong style={{ fontWeight: 600 }}>{a.label}</strong>{a.text}</span>
                <span style={{ fontSize: 11, color: "oklch(0.58 0.015 260)" }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </Main>
    </Frame>
  );
}
