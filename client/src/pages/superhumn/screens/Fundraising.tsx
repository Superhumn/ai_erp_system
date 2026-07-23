import type { CSSProperties } from "react";
import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, CTA, StatusChip, type ChipTone } from "../primitives";

type PipelineRow = {
  name: string;
  nameBlue?: boolean;
  chip: string;
  tone: ChipTone;
  amount: string;
  amountMuted?: boolean;
  last: string;
  next: string;
  highlight?: boolean;
};

const PIPELINE: PipelineRow[] = [
  { name: "Coastline Ventures", chip: "SIGNED", tone: "neutral", amount: "$500,000", last: "Jul 10", next: "Wire scheduled Jul 25" },
  { name: "Meridian Angels", chip: "SIGNED", tone: "neutral", amount: "$250,000", last: "Jul 8", next: "Countersign SAFE" },
  { name: "Hearthstone Capital", nameBlue: true, chip: "DILIGENCE", tone: "active", amount: "$400,000", last: "Jul 16", next: "Data room Q&A due Mon", highlight: true },
  { name: "J. Okafor (angel)", chip: "VERBAL", tone: "active", amount: "$100,000", last: "Jul 14", next: "Send SAFE docs" },
  { name: "Bluewater Fund", chip: "MEETING", tone: "neutral", amount: "$250k target", amountMuted: true, last: "Jul 15", next: "Partner meeting Jul 22" },
  { name: "Northgate Family Office", chip: "CONTACTED", tone: "neutral", amount: "—", amountMuted: true, last: "Jul 3", next: "Follow up — 15 days quiet" },
  { name: "Palisade Partners", chip: "SIGNED", tone: "neutral", amount: "$150,000", last: "Jul 2", next: "Wire received" },
  { name: "L. Marchetti (angel)", chip: "SIGNED", tone: "neutral", amount: "$40,000", last: "Jun 28", next: "Wire received" },
  { name: "Kessler Group", chip: "VERBAL", tone: "active", amount: "$200,000", last: "Jul 11", next: "Confirm allocation size" },
  { name: "Sable Ridge Capital", chip: "PASSED", tone: "neutral", amount: "—", amountMuted: true, last: "Jun 20", next: "Revisit at Series A" },
];

const ACTIVITY: { name: string; rest: string; time: string }[] = [
  { name: "Hearthstone", rest: " viewed financial model", time: "2h" },
  { name: "Bluewater", rest: " downloaded deck v4", time: "1d" },
  { name: "Hearthstone", rest: " · 3 new Q&A questions", time: "1d" },
];

const REMINDERS: { label: string; day: string }[] = [
  { label: "Answer Hearthstone Q&A", day: "Mon" },
  { label: "SAFE docs → J. Okafor", day: "Tue" },
  { label: "Nudge Northgate (quiet 15d)", day: "Wed" },
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

const sectionTitle: CSSProperties = { margin: "0 0 8px", fontSize: 13, fontWeight: 700, fontFamily: font.display };
const softDivider: CSSProperties = { height: 1, background: "linear-gradient(90deg, transparent, oklch(0.92 0.005 250), transparent)" };

export default function Fundraising() {
  return (
    <Frame label="6d Fundraising" height={640}>
      <Sidebar active="Fundraising" />
      <Main>
        <Header
          title="Fundraising · Seed II"
          subtitle="Opened May 2026 · target close Sep 30"
          right={
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 16px", borderRadius: 9999, border: "1px solid oklch(0.92 0.005 250)", background: "#fff", fontSize: 12.5, fontWeight: 600, color: "oklch(0.40 0.02 262)", cursor: "pointer" }}>Data room</span>
              <CTA>+ Add investor</CTA>
            </>
          }
        />

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.04em", fontFamily: font.display }}>
              $1,240,000 <span style={{ fontSize: 13, fontWeight: 500, color: "oklch(0.55 0.015 260)", fontFamily: font.body }}>committed of $2,000,000</span>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "oklch(0.55 0.015 260)" }}>62% · 11 commitments</p>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "oklch(0.94 0.004 250)", marginTop: 8, overflow: "hidden", display: "flex" }}>
            <div style={{ width: "47%", background: "oklch(0.47 0.21 255)" }} />
            <div style={{ width: "15%", background: "oklch(0.68 0.11 255)" }} />
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "oklch(0.58 0.015 260)", marginTop: 6 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ height: 6, width: 6, borderRadius: 2, background: "oklch(0.47 0.21 255)" }} />Signed $940k</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ height: 6, width: 6, borderRadius: 2, background: "oklch(0.68 0.11 255)" }} />Verbal $300k</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ height: 6, width: 6, borderRadius: 2, background: "oklch(0.94 0.004 250)" }} />Remaining $760k</span>
          </div>
        </div>

        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, oklch(0.90 0.005 250) 15%, oklch(0.90 0.005 250) 85%, transparent)", margin: "14px 0 0" }} />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          {/* Pipeline table */}
          <div style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={th("left")}>Investor</th>
                  <th style={th("left")}>Stage</th>
                  <th style={th("right")}>Amount</th>
                  <th style={th("left")}>Last touch</th>
                  <th style={th("left")}>Next step</th>
                </tr>
              </thead>
              <tbody>
                {PIPELINE.map((r, i) => (
                  <tr key={r.name} style={{ background: r.highlight ? "oklch(0.47 0.21 255 / 0.05)" : undefined, borderBottom: i === PIPELINE.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 600, color: r.nameBlue ? "oklch(0.40 0.21 255)" : undefined }}>{r.name}</td>
                    <td style={{ padding: "7px 8px" }}><StatusChip tone={r.tone}>{r.chip}</StatusChip></td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: r.amountMuted ? undefined : 600, color: r.amountMuted ? "oklch(0.55 0.015 260)" : undefined }}>{r.amount}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{r.last}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{r.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
            <div>
              <p style={sectionTitle}>Data room activity</p>
              {ACTIVITY.map((a, i) => (
                <div key={a.name + a.rest} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: i === ACTIVITY.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                  <span><strong style={{ fontWeight: 600 }}>{a.name}</strong>{a.rest}</span>
                  <span style={{ color: "oklch(0.58 0.015 260)" }}>{a.time}</span>
                </div>
              ))}
            </div>
            <div style={softDivider} />
            <div>
              <p style={sectionTitle}>Reminders</p>
              {REMINDERS.map((r, i) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: i === REMINDERS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                  <span>{r.label}</span>
                  <span style={{ fontWeight: 600 }}>{r.day}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "auto", background: "oklch(0.47 0.21 255 / 0.06)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 12, padding: "12px 14px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "oklch(0.35 0.02 262)", lineHeight: 1.55 }}>
                <strong style={{ color: "oklch(0.40 0.21 255)" }}>AI:</strong> At the current pace you close $1.8M by Sep 30. Hearthstone converting would clear the gap — their Q&A response time is your critical path.
              </p>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
