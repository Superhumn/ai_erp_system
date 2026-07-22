import { font } from "../tokens";
import { Frame, Sidebar, Main } from "../primitives";

type Pill = { text: string; color: string; bg: string };
type Card = { name: string; meta: string; amount: string; pill: Pill };

const GREY_PILL = { color: "oklch(0.58 0.015 260)", bg: "oklch(0.955 0.004 250)" };

const DISCOVERY: Card[] = [
  { name: "Bristol Farms", meta: "Nate Ford · intro deck sent", amount: "$30,000", pill: { text: "7d in stage", ...GREY_PILL } },
  { name: "GoPuff Wellness", meta: "Chris Doyle · awaiting buyer", amount: "$21,000", pill: { text: "15d stale", color: "oklch(0.35 0.02 262)", bg: "oklch(0.945 0.004 250)" } },
];
const QUALIFIED: Card[] = [
  { name: "Sprouts (SoCal)", meta: "Alicia Gomez · category review", amount: "$48,500", pill: { text: "4d in stage", ...GREY_PILL } },
];
const PROPOSAL: Card[] = [
  { name: "Thrive Market", meta: "Kevin Ma · sample feedback", amount: "$52,000", pill: { text: "2d in stage", ...GREY_PILL } },
  { name: "Lassens", meta: "Priya Nair · promo calendar", amount: "$27,000", pill: { text: "9d in stage", ...GREY_PILL } },
];

const KPIS: { label: string; value: string; color?: string }[] = [
  { label: "Pipeline", value: "$284,500" },
  { label: "Won this quarter", value: "$96,000", color: "oklch(0.38 0.02 262)" },
  { label: "Win rate", value: "38%" },
  { label: "Avg deal size", value: "$20,300" },
];

const capLabel: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "oklch(0.64 0.012 260)",
};
const kpiValue: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: "-0.04em",
  fontFamily: font.display,
};
const kpiDivider: React.CSSProperties = { width: 1, background: "linear-gradient(180deg, transparent, oklch(0.90 0.005 250), transparent)" };
const stdCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid oklch(0.93 0.004 250 / 0.9)",
  borderRadius: 13,
  padding: "13px 15px",
  boxShadow: "0 1px 2px rgba(15,25,70,0.05), 0 8px 20px rgba(15,25,70,0.04)",
};
const cardAmount: React.CSSProperties = { fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: font.display };

function StdCard({ card }: { card: Card }) {
  return (
    <div style={stdCard}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{card.name}</p>
      <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "oklch(0.58 0.015 260)" }}>{card.meta}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <span style={cardAmount}>{card.amount}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: card.pill.color, background: card.pill.bg, borderRadius: 9999, padding: "2px 8px" }}>{card.pill.text}</span>
      </div>
    </div>
  );
}

function ColumnHead({ label, amount, accent }: { label: string; amount: string; accent?: boolean }) {
  const tone = accent ? "oklch(0.42 0.21 255)" : undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tone ?? "oklch(0.55 0.015 260)" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: tone ?? "oklch(0.60 0.015 260)" }}>{amount}</span>
    </div>
  );
}

export default function CRM() {
  return (
    <Frame label="5c CRM" height={880}>
      <Sidebar active="CRM" user="Alex Chen" />
      <Main>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.035em", fontFamily: font.display }}>CRM</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "oklch(0.58 0.015 260)" }}>142 contacts · 14 open deals</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", background: "oklch(0.955 0.004 250)", borderRadius: 9999, padding: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.16 0.025 262)", background: "#fff", borderRadius: 9999, padding: "6px 14px", boxShadow: "0 1px 3px rgba(15,25,70,0.08)", cursor: "pointer" }}>Sales</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.50 0.015 260)", padding: "6px 14px", cursor: "pointer" }}>Partners</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.50 0.015 260)", padding: "6px 14px", cursor: "pointer" }}>Vendors</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.50 0.015 260)", padding: "6px 14px", cursor: "pointer" }}>Investors</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.50 0.015 260)", padding: "6px 14px", cursor: "pointer" }}>Donors</span>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 18px", borderRadius: 9999, fontSize: 12.5, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.44 0.21 255))", cursor: "pointer", boxShadow: "0 4px 12px oklch(0.47 0.21 255 / 0.35)" }}>+ New deal</span>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", alignItems: "stretch", marginTop: 14 }}>
          {KPIS.map((k, i) => (
            <div key={k.label} style={{ display: "contents" }}>
              {i > 0 && <div style={kpiDivider} />}
              <div style={{ flex: 1, padding: "0 16px", paddingLeft: i === 0 ? 0 : 16, paddingRight: i === KPIS.length - 1 ? 0 : 16 }}>
                <p style={capLabel}>{k.label}</p>
                <p style={{ ...kpiValue, color: k.color }}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, oklch(0.90 0.005 250) 15%, oklch(0.90 0.005 250) 85%, transparent)", margin: "12px 0 0" }} />

        {/* Kanban */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginTop: 18, minHeight: 0, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ColumnHead label="Discovery" amount="$51,000" />
            {DISCOVERY.map((card) => <StdCard key={card.name} card={card} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ColumnHead label="Qualified" amount="$48,500" />
            {QUALIFIED.map((card) => <StdCard key={card.name} card={card} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ColumnHead label="Proposal" amount="$79,000" />
            {PROPOSAL.map((card) => <StdCard key={card.name} card={card} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ColumnHead label="Negotiation" amount="$64,000" accent />
            <div style={{ background: "linear-gradient(180deg, oklch(0.47 0.21 255 / 0.05), #fff 45%)", border: "1.5px solid oklch(0.47 0.21 255 / 0.45)", borderRadius: 13, padding: "13px 15px", boxShadow: "0 8px 24px rgba(15,25,70,0.10)" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Erewhon Market</p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "oklch(0.58 0.015 260)" }}>Tara Singh · revised pricing due</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <span style={cardAmount}>$64,000</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "oklch(0.42 0.21 255)", background: "oklch(0.47 0.21 255 / 0.1)", borderRadius: 9999, padding: "2px 8px" }}>due today</span>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid oklch(0.94 0.004 250)", display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="oklch(0.47 0.21 255)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.40 0.21 255)", cursor: "pointer" }}>Draft pricing email ready — open</span>
              </div>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
