import type { CSSProperties } from "react";
import { font } from "../tokens";
import {
  Frame,
  Sidebar,
  Main,
  Header,
  KpiStrip,
  Segmented,
  CTA,
  StatusChip,
  type ChipTone,
} from "../primitives";

type InvoiceRow = {
  id: string;
  customer: string;
  due: string;
  amount: string;
  chip: string;
  tone: ChipTone;
};

const INVOICES: InvoiceRow[] = [
  { id: "INV-0197", customer: "Erewhon Market", due: "Aug 17", amount: "$12,840", chip: "SENT", tone: "active" },
  { id: "INV-0196", customer: "Thrive Market", due: "Aug 16", amount: "$18,220", chip: "DRAFT", tone: "neutral" },
  { id: "INV-0192", customer: "Thrive Market", due: "Jul 15", amount: "$12,400", chip: "PAID", tone: "neutral" },
  { id: "INV-0184", customer: "Bristol Farms", due: "Jul 6 · 12d late", amount: "$8,200", chip: "OVERDUE", tone: "dark" },
  { id: "INV-0179", customer: "Lassens", due: "Jun 27 · 21d late", amount: "$4,650", chip: "OVERDUE", tone: "dark" },
  { id: "INV-0171", customer: "GoPuff Wellness", due: "Jun 14 · 34d late", amount: "$2,310", chip: "OVERDUE", tone: "dark" },
];

const PAYABLES: { label: string; value: string }[] = [
  { label: "PackRight Co · PO-2041", value: "$3,050 · Jul 19" },
  { label: "Vitala Copack · run fee", value: "$8,400 · Jul 22" },
  { label: "Fresh Farms · PO-2044", value: "$8,960 · Jul 24" },
];

const th = (align: CSSProperties["textAlign"]): CSSProperties => ({
  textAlign: align,
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "oklch(0.62 0.015 260)",
  borderBottom: "1px solid oklch(0.92 0.005 250)",
});

const softDivider: CSSProperties = {
  height: 1,
  background: "linear-gradient(90deg, transparent, oklch(0.92 0.005 250), transparent)",
};

const sectionTitle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: font.display,
};

function AgeRow({ label, value, width, fill, marginTop = 0 }: { label: string; value: string; width: string; fill: string; marginTop?: number }) {
  return (
    <div style={{ marginTop }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "oklch(0.50 0.015 260)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "oklch(0.94 0.004 250)" }}>
        <div style={{ height: 6, width, borderRadius: 3, background: fill }} />
      </div>
    </div>
  );
}

export default function Finance() {
  return (
    <Frame label="6b Finance" height={640}>
      <Sidebar active="Finance" />
      <Main>
        <Header
          title="Finance"
          subtitle="Invoices, payments & ledger · QuickBooks synced"
          right={
            <>
              <Segmented options={["Invoices", "Payments", "Accounts", "Reports"]} value="Invoices" />
              <CTA>+ New invoice</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Cash", value: "$412,580" },
            { label: "Receivable", value: "$64,120" },
            { label: "Payable", value: "$38,900" },
            { label: "Gross margin", value: "41%" },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          {/* Invoices table */}
          <div style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={th("left")}>Invoice</th>
                  <th style={th("left")}>Customer</th>
                  <th style={th("left")}>Due</th>
                  <th style={th("right")}>Amount</th>
                  <th style={th("center")}>Status</th>
                </tr>
              </thead>
              <tbody>
                {INVOICES.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i === INVOICES.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                    <td style={{ padding: "7px 8px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: "oklch(0.45 0.015 260)" }}>{r.id}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>{r.customer}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{r.due}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.amount}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center" }}>
                      <StatusChip tone={r.tone}>{r.chip}</StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, background: "oklch(0.47 0.21 255 / 0.06)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 12, padding: "10px 14px" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="oklch(0.47 0.21 255)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              </svg>
              <p style={{ margin: 0, flex: 1, fontSize: 12.5, color: "oklch(0.30 0.02 262)" }}>Reminder emails drafted for all 3 overdue invoices — $15,160 total.</p>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.40 0.21 255)", background: "#fff", border: "1px solid oklch(0.47 0.21 255 / 0.3)", borderRadius: 9999, padding: "5px 13px", cursor: "pointer" }}>Send all</span>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
            <div>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, fontFamily: font.display }}>AR ageing</p>
              <AgeRow label="Current" value="$48,960" width="76%" fill="oklch(0.47 0.21 255)" />
              <AgeRow label="1–30 days" value="$8,200" width="14%" fill="oklch(0.65 0.12 255)" marginTop={8} />
              <AgeRow label="30+ days" value="$6,960" width="11%" fill="oklch(0.30 0.02 262)" marginTop={8} />
            </div>
            <div style={softDivider} />
            <div>
              <p style={sectionTitle}>Upcoming payables</p>
              {PAYABLES.map((p, i) => (
                <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: i === PAYABLES.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                  <span>{p.label}</span>
                  <span style={{ fontWeight: 600 }}>{p.value}</span>
                </div>
              ))}
            </div>
            <div style={softDivider} />
            <div>
              <p style={sectionTitle}>Net cash · 6 mo</p>
              <svg viewBox="0 0 260 70" style={{ width: "100%", height: 70 }} preserveAspectRatio="none">
                <polyline points="0,52 43,48 86,50 130,38 173,34 216,26 260,14" fill="none" stroke="oklch(0.47 0.21 255)" strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={260} cy={14} r={4} fill="oklch(0.47 0.21 255)" />
              </svg>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
