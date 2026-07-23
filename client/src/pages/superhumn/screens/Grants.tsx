import type { CSSProperties } from "react";
import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, KpiStrip, Segmented, CTA, StatusChip } from "../primitives";

type Stage = "active" | "neutral" | "awarded";
type GrantRow = {
  grant: string;
  funder: string;
  amount: string;
  stage: string;
  stageTone: Stage;
  deadline: string;
  owner: string;
};

const GRANTS: GrantRow[] = [
  { grant: "Clean Manufacturing Fund", funder: "Dept. of Energy", amount: "$250,000", stage: "SUBMITTED", stageTone: "active", deadline: "Aug 15", owner: "Sara" },
  { grant: "Small Producer Grant", funder: "State Ag Board", amount: "$75,000", stage: "AWARDED", stageTone: "awarded", deadline: "—", owner: "Alex" },
  { grant: "R&D Tax Credit", funder: "Federal", amount: "$120,000", stage: "DRAFTING", stageTone: "neutral", deadline: "Sep 1", owner: "Sara" },
  { grant: "Green Packaging Pilot", funder: "EPA", amount: "$90,000", stage: "REVIEW", stageTone: "neutral", deadline: "Aug 30", owner: "Maria" },
  { grant: "Workforce Training", funder: "Labor Dept", amount: "$60,000", stage: "SUBMITTED", stageTone: "active", deadline: "Jul 28", owner: "HR" },
  { grant: "Rural Export Boost", funder: "Commerce", amount: "$180,000", stage: "ELIGIBLE", stageTone: "neutral", deadline: "Sep 20", owner: "Alex" },
  { grant: "Women-Owned Biz Fund", funder: "SBA", amount: "$50,000", stage: "AWARDED", stageTone: "awarded", deadline: "—", owner: "Alex" },
  { grant: "Energy Efficiency Rebate", funder: "Utility co-op", amount: "$45,000", stage: "DRAFTING", stageTone: "neutral", deadline: "Oct 5", owner: "Maria" },
  { grant: "Local Food Systems", funder: "USDA", amount: "$110,000", stage: "ELIGIBLE", stageTone: "neutral", deadline: "Oct 18", owner: "Sara" },
];

const th: CSSProperties = {
  textAlign: "left",
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "oklch(0.62 0.015 260)",
  borderBottom: "1px solid oklch(0.92 0.005 250)",
};

function StageChip({ stage, tone }: { stage: string; tone: Stage }) {
  if (tone === "awarded") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: "#fff", background: "oklch(0.16 0.025 262)", borderRadius: 9999, padding: "2px 9px", whiteSpace: "nowrap" }}>
        {stage}
      </span>
    );
  }
  return <StatusChip tone={tone}>{stage}</StatusChip>;
}

export default function Grants() {
  return (
    <Frame label="10f Grants" height={680}>
      <Sidebar active="Grants" />
      <Main>
        <Header
          title="Grants"
          subtitle="Applications, deadlines & reporting"
          right={
            <>
              <Segmented options={["Pipeline", "Awarded", "Reporting"]} value="Pipeline" />
              <CTA>+ New application</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Pipeline value", value: "$1.2M" },
            { label: "Submitted", value: "5" },
            { label: "Awarded YTD", value: "$340K" },
            { label: "Deadlines 30d", value: "3", highlight: true },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          <div style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={th}>Grant</th>
                  <th style={th}>Funder</th>
                  <th style={th}>Amount</th>
                  <th style={th}>Stage</th>
                  <th style={th}>Deadline</th>
                  <th style={th}>Owner</th>
                </tr>
              </thead>
              <tbody>
                {GRANTS.map((r, i) => (
                  <tr key={r.grant} style={{ borderBottom: i === GRANTS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                    <td style={{ padding: "7px 8px", fontSize: 12.5 }}><span style={{ fontWeight: 600 }}>{r.grant}</span></td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, color: "oklch(0.45 0.015 260)" }}>{r.funder}</td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, fontWeight: 600, fontFamily: font.display }}>{r.amount}</td>
                    <td style={{ padding: "7px 8px" }}><StageChip stage={r.stage} tone={r.stageTone} /></td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, color: "oklch(0.50 0.015 260)" }}>{r.deadline}</td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, color: "oklch(0.45 0.015 260)" }}>{r.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
