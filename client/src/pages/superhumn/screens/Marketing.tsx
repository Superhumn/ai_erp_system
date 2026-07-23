import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, Segmented, CTA, Sparkline, StatusChip, RightRail, Caps, AICard, Button, type ChipTone } from "../primitives";

type Kpi = { label: string; value: string; points: number[]; accent: boolean; delta: string; valueColor?: string };

const KPIS: Kpi[] = [
  { label: "Active", value: "4", points: [6, 6, 9, 9, 9, 12, 12, 14], accent: false, delta: "+1 this wk" },
  { label: "Spend MTD", value: "$12,400", points: [4, 5, 6, 8, 9, 10, 12, 13], accent: false, delta: "+8% wow" },
  { label: "Leads", value: "320", points: [3, 5, 4, 8, 7, 10, 10, 14], accent: true, delta: "+12% wow" },
  { label: "Blended CPL", value: "$38", points: [13, 11, 12, 9, 8, 8, 6, 5], accent: true, delta: "−9% wow", valueColor: "oklch(0.40 0.21 255)" },
];

type CampRow = { name: string; channel: string; status: string; tone: ChipTone; spend: string; leads: string; cpa: string; roas: string };

const CAMPAIGNS: CampRow[] = [
  { name: "Summer B2B push", channel: "Search", status: "LIVE", tone: "active", spend: "$4,200", leads: "128", cpa: "$33", roas: "4.1×" },
  { name: "Retargeting — cart", channel: "Display", status: "LIVE", tone: "active", spend: "$1,900", leads: "54", cpa: "$35", roas: "3.2×" },
  { name: "LinkedIn — ops leaders", channel: "Social", status: "LIVE", tone: "active", spend: "$3,100", leads: "61", cpa: "$51", roas: "2.4×" },
  { name: "Trade newsletter", channel: "Email", status: "LIVE", tone: "active", spend: "$800", leads: "44", cpa: "$18", roas: "6.0×" },
  { name: "Spring launch", channel: "Search", status: "ENDED", tone: "neutral", spend: "$2,400", leads: "71", cpa: "$34", roas: "3.8×" },
  { name: "Webinar — automation", channel: "Social", status: "DRAFT", tone: "draft", spend: "—", leads: "—", cpa: "—", roas: "—" },
  { name: "Partner co-marketing", channel: "Referral", status: "PAUSED", tone: "neutral", spend: "$0", leads: "12", cpa: "—", roas: "—" },
  { name: "Product Hunt launch", channel: "PR", status: "ENDED", tone: "neutral", spend: "$0", leads: "38", cpa: "$0", roas: "—" },
  { name: "Holiday gift guide", channel: "Email", status: "DRAFT", tone: "draft", spend: "—", leads: "—", cpa: "—", roas: "—" },
  { name: "Sampling — farmers mkts", channel: "Field", status: "LIVE", tone: "active", spend: "$600", leads: "26", cpa: "$23", roas: "3.5×" },
  { name: "SEO refresh — recipes", channel: "Organic", status: "LIVE", tone: "active", spend: "$1,800", leads: "25", cpa: "$72", roas: "1.9×" },
];

type Channel = { name: string; points: number[]; width: string; value: string };
const CHANNELS: Channel[] = [
  { name: "Search", points: [3, 5, 4, 7, 6, 9, 11], width: "100%", value: "199" },
  { name: "Social", points: [4, 3, 5, 6, 5, 7, 8], width: "50%", value: "99" },
  { name: "Display", points: [6, 5, 7, 5, 6, 5, 6], width: "27%", value: "54" },
  { name: "Email", points: [2, 4, 4, 6, 8, 9, 11], width: "22%", value: "44" },
  { name: "Referral", points: [5, 5, 4, 4, 4, 3, 3], width: "6%", value: "12" },
];

const headCell = (align: "left" | "right"): React.CSSProperties => ({
  textAlign: align,
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "oklch(0.62 0.015 260)",
  borderBottom: "1px solid oklch(0.92 0.005 250)",
});
const kpiDivider: React.CSSProperties = { width: 1, background: "linear-gradient(180deg, transparent, oklch(0.90 0.005 250), transparent)" };
const cellMono: React.CSSProperties = { padding: "7px 8px", fontSize: 12.5, color: "oklch(0.45 0.015 260)" };
const channelValue: React.CSSProperties = { width: 34, textAlign: "right", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: font.display };

export default function Marketing() {
  return (
    <Frame label="13b Marketing sparklines" height={680}>
      <Sidebar active="Marketing" />
      <Main>
        <Header
          title="Marketing"
          subtitle="Campaigns, audiences & content"
          right={
            <>
              <Segmented options={["Campaigns", "Audiences", "Content"]} value="Campaigns" />
              <CTA>+ New campaign</CTA>
            </>
          }
        />

        {/* KPI strip with sparklines */}
        <div style={{ display: "flex", alignItems: "stretch", marginTop: 14 }}>
          {KPIS.map((k, i) => (
            <div key={k.label} style={{ display: "contents" }}>
              {i > 0 && <div style={kpiDivider} />}
              <div style={{ flex: 1, padding: "0 16px", paddingLeft: i === 0 ? 0 : 16, paddingRight: i === KPIS.length - 1 ? 0 : 16 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.64 0.012 260)" }}>{k.label}</p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 5 }}>
                  <p style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.04em", fontFamily: font.display, color: k.valueColor }}>{k.value}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 3 }}>
                    <Sparkline points={k.points} width={56} height={18} accent={k.accent} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: "oklch(0.50 0.015 260)", fontVariantNumeric: "tabular-nums" }}>{k.delta}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, oklch(0.90 0.005 250) 15%, oklch(0.90 0.005 250) 85%, transparent)", margin: "12px 0 0" }} />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.75fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          {/* Campaigns table */}
          <div style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={headCell("left")}>Campaign</th>
                  <th style={headCell("left")}>Channel</th>
                  <th style={headCell("left")}>Status</th>
                  <th style={headCell("left")}>Spend</th>
                  <th style={headCell("left")}>Leads</th>
                  <th style={headCell("left")}>CPA</th>
                  <th style={headCell("right")}>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {CAMPAIGNS.map((r, i) => (
                  <tr key={r.name} style={{ borderBottom: i === CAMPAIGNS.length - 1 ? undefined : "1px solid oklch(0.95 0.003 250)" }}>
                    <td style={{ padding: "7px 8px", fontSize: 12.5 }}><span style={{ fontWeight: 600 }}>{r.name}</span></td>
                    <td style={cellMono}>{r.channel}</td>
                    <td style={{ padding: "7px 8px" }}><StatusChip tone={r.tone}>{r.status}</StatusChip></td>
                    <td style={cellMono}>{r.spend}</td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, fontWeight: 600 }}>{r.leads}</td>
                    <td style={cellMono}>{r.cpa}</td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, fontWeight: 700, textAlign: "right", fontFamily: font.display }}>{r.roas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right rail */}
          <RightRail>
            <div>
              <Caps marginBottom={4}>Leads by channel · 8 wk</Caps>
              {CHANNELS.map((ch, i) => (
                <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i === CHANNELS.length - 1 ? undefined : "1px solid oklch(0.95 0.003 250)" }}>
                  <span style={{ width: 64, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{ch.name}</span>
                  <Sparkline points={ch.points} width={44} height={16} accent={false} />
                  <div style={{ flex: 1, height: 6, borderRadius: 9999, background: "oklch(0.945 0.004 250)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: ch.width, borderRadius: 9999, background: "linear-gradient(90deg, oklch(0.55 0.22 258), oklch(0.45 0.21 255))" }} />
                  </div>
                  <span style={channelValue}>{ch.value}</span>
                </div>
              ))}
            </div>

            <AICard
              label="Budget insight"
              actions={
                <>
                  <Button variant="secondary">Review split</Button>
                  <Button variant="primary">Shift $1,000</Button>
                </>
              }
            >
              Trade newsletter converts at $18 CPL vs $51 on LinkedIn. Shifting $1,000 of August budget adds ~40 leads at current rates.
            </AICard>

            <div>
              <Caps>Needs approval</Caps>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid oklch(0.95 0.003 250)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>Q4 media plan</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10.5, color: "oklch(0.58 0.015 260)" }}>$24,000 · needs you</p>
                </div>
                <StatusChip tone="active">REVIEW</StatusChip>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>Webinar — automation</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10.5, color: "oklch(0.58 0.015 260)" }}>launch date · owner Priya</p>
                </div>
                <StatusChip tone="draft">DRAFT</StatusChip>
              </div>
            </div>

            <div style={{ marginTop: "auto" }}>
              <Caps>Best CPL this month</Caps>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "6px 0", borderBottom: "1px solid oklch(0.95 0.003 250)" }}>
                <span style={{ color: "oklch(0.30 0.02 262)" }}>Trade newsletter</span>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>$18 · 6.0×</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "6px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "6px 0", borderBottom: "1px solid oklch(0.95 0.003 250)" }}>
                  <span style={{ color: "oklch(0.30 0.02 262)" }}>Sampling — farmers mkts</span>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>$23 · 3.5×</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "6px 0" }}>
                  <span style={{ color: "oklch(0.30 0.02 262)" }}>Summer B2B push</span>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>$33 · 4.1×</span>
                </div>
              </div>
            </div>
          </RightRail>
        </div>
      </Main>
    </Frame>
  );
}
