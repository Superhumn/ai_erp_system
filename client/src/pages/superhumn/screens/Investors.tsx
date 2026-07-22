import type { CSSProperties } from "react";
import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, KpiStrip, Segmented, CTA } from "../primitives";

type CapRow = { holder: string; klass: string; shares: string; pct: string; invested: string };

const CAP: CapRow[] = [
  { holder: "Founders (2)", klass: "Common", shares: "4,600,000", pct: "46.0%", invested: "—" },
  { holder: "Northwind Ventures", klass: "Seed Preferred", shares: "2,400,000", pct: "24.0%", invested: "$6,000,000" },
  { holder: "Angel syndicate", klass: "Seed Preferred", shares: "900,000", pct: "9.0%", invested: "$2,250,000" },
  { holder: "Ridge Capital", klass: "SAFE", shares: "500,000", pct: "5.0%", invested: "$950,000" },
  { holder: "ESOP pool", klass: "Options", shares: "1,200,000", pct: "12.0%", invested: "—" },
  { holder: "Advisors", klass: "Common", shares: "400,000", pct: "4.0%", invested: "—" },
];

const BAR: { width: string; background: string }[] = [
  { width: "46%", background: "oklch(0.30 0.03 262)" },
  { width: "24%", background: "oklch(0.47 0.21 255)" },
  { width: "9%", background: "oklch(0.62 0.16 255)" },
  { width: "5%", background: "oklch(0.72 0.10 257)" },
  { width: "12%", background: "oklch(0.80 0.06 258)" },
  { width: "4%", background: "oklch(0.90 0.02 260)" },
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

export default function Investors() {
  return (
    <Frame label="10g Investors" height={680}>
      <Sidebar active="Investors" />
      <Main>
        <Header
          title="Investors"
          subtitle="Cap table, updates & data room"
          right={
            <>
              <Segmented options={["Cap table", "Updates", "Documents"]} value="Cap table" />
              <CTA>Send update</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Post-money", value: "$48M" },
            { label: "Raised to date", value: "$9.2M" },
            { label: "Investors", value: "14" },
            { label: "Runway", value: "19 mo", highlight: true },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", height: 14, borderRadius: 9999, overflow: "hidden", marginBottom: 5 }}>
              {BAR.map((s) => (
                <div key={s.background} style={{ width: s.width, background: s.background }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10.5, color: "oklch(0.45 0.015 260)", marginBottom: 10 }}>
              <span>■ Founders 46%</span>
              <span style={{ color: "oklch(0.40 0.21 255)" }}>■ Seed 24%</span>
              <span>■ Angels 9%</span>
              <span>■ SAFE 5%</span>
              <span>■ ESOP 12%</span>
              <span>■ Advisors 4%</span>
            </div>
            <div style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={th("left")}>Holder</th>
                    <th style={th("left")}>Class</th>
                    <th style={th("right")}>Shares</th>
                    <th style={th("right")}>%</th>
                    <th style={th("right")}>Invested</th>
                  </tr>
                </thead>
                <tbody>
                  {CAP.map((r, i) => (
                    <tr key={r.holder} style={{ borderBottom: i === CAP.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                      <td style={{ padding: "7px 8px", fontSize: 12.5 }}><span style={{ fontWeight: 600 }}>{r.holder}</span></td>
                      <td style={{ padding: "7px 8px", fontSize: 12.5, color: "oklch(0.45 0.015 260)" }}>{r.klass}</td>
                      <td style={{ padding: "7px 8px", fontSize: 12.5, textAlign: "right", fontFamily: font.display }}>{r.shares}</td>
                      <td style={{ padding: "7px 8px", fontSize: 12.5, textAlign: "right", fontWeight: 600 }}>{r.pct}</td>
                      <td style={{ padding: "7px 8px", fontSize: 12.5, textAlign: "right", color: "oklch(0.45 0.015 260)" }}>{r.invested}</td>
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
