import { color as c, font } from "../tokens";
import { Frame, Sidebar, Main, Header, KpiStrip, Segmented, CTA, StatusChip, type ChipTone } from "../primitives";

const th: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "oklch(0.62 0.015 260)",
  borderBottom: "1px solid oklch(0.92 0.005 250)",
};

type Tone = ChipTone | "pending";
type Row = {
  contract: string;
  counterparty: string;
  type: string;
  renewal: string;
  status: string;
  tone: Tone;
  highlight?: boolean;
};

const ROWS: Row[] = [
  { contract: "Copack MSA", counterparty: "Vitala Copack", type: "Vendor", renewal: "Aug 12 · 25 days", status: "RENEWING", tone: "active", highlight: true },
  { contract: "Wholesale agreement", counterparty: "Whole Foods NorCal", type: "Customer", renewal: "Jun 2027", status: "ACTIVE", tone: "neutral" },
  { contract: "Supply agreement", counterparty: "Fresh Farms", type: "Vendor", renewal: "Aug 9 · 22 days", status: "RENEWING", tone: "active" },
  { contract: "NDA — Hearthstone", counterparty: "Hearthstone Capital", type: "NDA", renewal: "—", status: "PENDING SIG", tone: "pending" },
  { contract: "Warehouse lease", counterparty: "Compton Industrial LLC", type: "Lease", renewal: "Mar 2028", status: "ACTIVE", tone: "neutral" },
  { contract: "Freight damage claim", counterparty: "Saia LTL", type: "Dispute", renewal: "Filed Jul 2", status: "OPEN", tone: "dark" },
  { contract: "Wholesale agreement", counterparty: "Thrive Market", type: "Customer", renewal: "Jan 2027", status: "ACTIVE", tone: "neutral" },
  { contract: "Supply agreement", counterparty: "PackRight Co", type: "Vendor", renewal: "Dec 2026", status: "ACTIVE", tone: "neutral" },
  { contract: "Employment — E. Rossi", counterparty: "Elena Rossi", type: "Employment", renewal: "—", status: "ACTIVE", tone: "neutral" },
  { contract: "SendGrid DPA", counterparty: "Twilio Inc", type: "Service", renewal: "Auto-renews", status: "ACTIVE", tone: "neutral" },
  { contract: "Broker agreement", counterparty: "Coast Foods Brokerage", type: "Partnership", renewal: "Oct 2026", status: "ACTIVE", tone: "neutral" },
];

const KEY_DATES: { label: string; right: string; last?: boolean }[] = [
  { label: "Fresh Farms renewal notice", right: "Aug 9" },
  { label: "Vitala MSA renegotiation", right: "Aug 12" },
  { label: "Saia claim response due", right: "Jul 30", last: true },
];

function Chip({ status, tone }: { status: string; tone: Tone }) {
  if (tone === "pending") {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "oklch(0.48 0.015 260)",
          background: "oklch(0.93 0.004 250)",
          borderRadius: 9999,
          padding: "2px 9px",
        }}
      >
        {status}
      </span>
    );
  }
  return <StatusChip tone={tone}>{status}</StatusChip>;
}

export default function Legal() {
  return (
    <Frame label="7c Legal" height={640}>
      <Sidebar active="Legal" />
      <Main>
        <Header
          title="Legal"
          subtitle="Contracts, disputes & documents"
          right={
            <>
              <Segmented options={["Contracts", "Disputes", "Documents"]} value="Contracts" />
              <CTA>+ New contract</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Active contracts", value: "12" },
            { label: "Renewing ≤ 30d", value: "2", highlight: true },
            { label: "Awaiting signature", value: "1" },
            { label: "Open disputes", value: "1" },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 24, marginTop: 10, minHeight: 0 }}>
          <div style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Contract</th>
                  <th style={{ ...th, textAlign: "left" }}>Counterparty</th>
                  <th style={{ ...th, textAlign: "left" }}>Type</th>
                  <th style={{ ...th, textAlign: "left" }}>Renewal</th>
                  <th style={{ ...th, textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr
                    key={`${r.contract}-${r.counterparty}`}
                    style={{
                      background: r.highlight ? "oklch(0.47 0.21 255 / 0.05)" : undefined,
                      borderBottom: i === ROWS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)",
                    }}
                  >
                    <td style={{ padding: "7px 8px", fontWeight: 600, color: r.highlight ? c.blueText : undefined }}>{r.contract}</td>
                    <td style={{ padding: "7px 8px" }}>{r.counterparty}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{r.type}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{r.renewal}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center" }}>
                      <Chip status={r.status} tone={r.tone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, fontFamily: font.display }}>Key dates</p>
              {KEY_DATES.map((r) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "6px 0",
                    borderBottom: r.last ? "none" : "1px solid oklch(0.95 0.003 250)",
                  }}
                >
                  <span>{r.label}</span>
                  <span style={{ fontWeight: 600 }}>{r.right}</span>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, oklch(0.92 0.005 250), transparent)" }} />

            <div
              style={{
                background: "oklch(0.47 0.21 255 / 0.06)",
                border: "1px solid oklch(0.47 0.21 255 / 0.2)",
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "oklch(0.35 0.02 262)", lineHeight: 1.55 }}>
                <strong style={{ color: c.blueText }}>AI:</strong> Vitala's proposed 2026 MSA raises run fees 8%. Your volume grew 3× — leverage for a
                volume-tier counter. Draft ready for review.
              </p>
              <span
                style={{
                  display: "inline-flex",
                  marginTop: 10,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: c.blueText,
                  background: "#fff",
                  border: "1px solid oklch(0.47 0.21 255 / 0.3)",
                  borderRadius: 9999,
                  padding: "5px 13px",
                  cursor: "pointer",
                }}
              >
                Open counter draft
              </span>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
