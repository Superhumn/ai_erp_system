import { color as c } from "../tokens";
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

const caps: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: c.faint,
};

type Tone = ChipTone | "dark16";

type Partner = { partner: string; protocol: string; docs: string; last: string; status: string; tone: Tone };
const PARTNERS: Partner[] = [
  { partner: "Whole Foods Market", protocol: "AS2", docs: "850, 855, 856, 810", last: "2m ago", status: "LIVE", tone: "active" },
  { partner: "UNFI", protocol: "SFTP / X12", docs: "850, 856, 810", last: "18m ago", status: "LIVE", tone: "active" },
  { partner: "KeHE", protocol: "AS2", docs: "850, 855, 810", last: "1h ago", status: "LIVE", tone: "active" },
  { partner: "Target DVS", protocol: "AS2", docs: "850, 856, 810, 753", last: "3h ago", status: "LIVE", tone: "active" },
  { partner: "Kroger", protocol: "SFTP / X12", docs: "850, 810", last: "yesterday", status: "TESTING", tone: "neutral" },
  { partner: "McLane", protocol: "VAN", docs: "850, 855", last: "Jul 12", status: "SETUP", tone: "draft" },
];

type Doc = { doc: string; direction: string; partner: string; time: string; status: string; tone: Tone };
const DOCS: Doc[] = [
  { doc: "850", direction: "Inbound · PO", partner: "Whole Foods", time: "09:42", status: "ACCEPTED", tone: "neutral" },
  { doc: "856", direction: "Outbound · ASN", partner: "UNFI", time: "09:30", status: "SENT", tone: "neutral" },
  { doc: "810", direction: "Outbound · Invoice", partner: "Target DVS", time: "08:55", status: "REJECTED", tone: "dark16" },
];

function Chip({ status, tone }: { status: string; tone: Tone }) {
  if (tone === "dark16") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "#fff",
          background: "oklch(0.16 0.025 262)",
          borderRadius: 9999,
          padding: "2px 9px",
          whiteSpace: "nowrap",
        }}
      >
        {status}
      </span>
    );
  }
  return <StatusChip tone={tone}>{status}</StatusChip>;
}

export default function EDI() {
  return (
    <Frame label="10j EDI" height={680}>
      <Sidebar active="EDI" />
      <Main>
        <Header
          title="EDI"
          subtitle="Trading-partner connections & documents"
          right={
            <>
              <Segmented options={["Connections", "Documents", "Errors"]} value="Connections" />
              <CTA>+ Add partner</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Partners", value: "6" },
            { label: "Docs today", value: "142" },
            { label: "Acceptance", value: "99.2%" },
            { label: "Needs attention", value: "1", highlight: true },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <p style={caps}>Trading partners</p>
            <div style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Partner</th>
                    <th style={{ ...th, textAlign: "left" }}>Protocol</th>
                    <th style={{ ...th, textAlign: "left" }}>Documents</th>
                    <th style={{ ...th, textAlign: "left" }}>Last activity</th>
                    <th style={{ ...th, textAlign: "right" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {PARTNERS.map((p, i) => (
                    <tr key={p.partner} style={{ borderBottom: i === PARTNERS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                      <td style={{ padding: "7px 8px" }}>
                        <span style={{ fontWeight: 600 }}>{p.partner}</span>
                      </td>
                      <td style={{ padding: "7px 8px", color: "oklch(0.45 0.015 260)" }}>{p.protocol}</td>
                      <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)", fontSize: 11.5 }}>{p.docs}</td>
                      <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{p.last}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right" }}>
                        <Chip status={p.status} tone={p.tone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14 }}>
              <p style={caps}>Recent documents</p>
            </div>
            <div style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Doc</th>
                    <th style={{ ...th, textAlign: "left" }}>Direction</th>
                    <th style={{ ...th, textAlign: "left" }}>Partner</th>
                    <th style={{ ...th, textAlign: "left" }}>Time</th>
                    <th style={{ ...th, textAlign: "right" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DOCS.map((d, i) => (
                    <tr key={d.doc} style={{ borderBottom: i === DOCS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                      <td style={{ padding: "7px 8px" }}>
                        <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11.5, fontWeight: 600 }}>{d.doc}</span>
                      </td>
                      <td style={{ padding: "7px 8px", color: "oklch(0.45 0.015 260)" }}>{d.direction}</td>
                      <td style={{ padding: "7px 8px", color: "oklch(0.45 0.015 260)" }}>{d.partner}</td>
                      <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{d.time}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right" }}>
                        <Chip status={d.status} tone={d.tone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
