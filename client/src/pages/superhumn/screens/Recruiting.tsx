import { color as c, font } from "../tokens";
import { Frame, Sidebar, Main, Header, KpiStrip, Segmented, CTA, StatusChip, SidePanel, SparkIcon } from "../primitives";

type Card = { initial: string; name: string; role: string; time: string; chip?: { label: string; dark?: boolean } };
type Col = { title: string; count: number; cards: Card[] };

const COLUMNS: Col[] = [
  {
    title: "Applied",
    count: 14,
    cards: [
      { initial: "R", name: "Rosa Nunez", role: "Ops Coordinator", time: "2d", chip: { label: "NEW" } },
      { initial: "K", name: "Ken Ito", role: "Ops Coordinator", time: "3d", chip: { label: "NEW" } },
      { initial: "A", name: "Aisha Bello", role: "Warehouse Lead", time: "4d" },
      { initial: "P", name: "Priya Nair", role: "Ops Coordinator", time: "5d" },
    ],
  },
  {
    title: "Screen",
    count: 8,
    cards: [
      { initial: "J", name: "James Ford", role: "Ops Coordinator", time: "call Thu" },
      { initial: "L", name: "Lena Voss", role: "Warehouse Lead", time: "call Fri" },
      { initial: "D", name: "Diego Ruiz", role: "Ops Coordinator", time: "to review" },
    ],
  },
  {
    title: "Interview",
    count: 6,
    cards: [
      { initial: "N", name: "Nora Ahmed", role: "Ops Coordinator", time: "Mon 10:00", chip: { label: "ROUND 2" } },
      { initial: "S", name: "Sam Okoro", role: "Warehouse Lead", time: "Tue 14:00", chip: { label: "ROUND 1" } },
      { initial: "E", name: "Emma Cole", role: "Ops Coordinator", time: "Wed 11:30", chip: { label: "ROUND 1" } },
    ],
  },
  {
    title: "Offer",
    count: 1,
    cards: [{ initial: "W", name: "Will Tran", role: "Ops Coordinator", time: "expires Jul 22", chip: { label: "SENT JUL 15" } }],
  },
  {
    title: "Hired",
    count: 5,
    cards: [
      { initial: "L", name: "Leo Grant", role: "Warehouse Lead", time: "started Jul 14", chip: { label: "ONBOARDING", dark: true } },
      { initial: "G", name: "Grace Liu", role: "Production", time: "started Jun 30" },
    ],
  },
];

const fieldLabel: React.CSSProperties = {
  margin: "0 0 3px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: c.faint,
};

const fieldBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid oklch(0.92 0.005 250)",
  background: "#fff",
  borderRadius: 9,
  padding: "6px 10px",
  fontSize: 12.5,
  fontWeight: 600,
};

function CardTile({ card }: { card: Card }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid oklch(0.92 0.005 250)",
        borderRadius: 11,
        padding: "9px 10px",
        boxShadow: "0 1px 2px rgba(15,25,70,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            height: 22,
            width: 22,
            borderRadius: 9999,
            background: "oklch(0.93 0.01 260)",
            color: "oklch(0.35 0.02 262)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9.5,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {card.initial}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{card.name}</p>
          <p style={{ margin: 0, fontSize: 10.5, color: c.muted3 }}>{card.role}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {card.chip ? (
          card.chip.dark ? (
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
              {card.chip.label}
            </span>
          ) : (
            <StatusChip tone="active">{card.chip.label}</StatusChip>
          )
        ) : (
          <span />
        )}
        <span style={{ fontSize: 10, color: c.muted }}>{card.time}</span>
      </div>
    </div>
  );
}

export default function Recruiting() {
  return (
    <Frame label="10e Recruiting" height={680}>
      <Sidebar active="Recruiting" />
      <Main>
        <Header
          title="Recruiting"
          subtitle="Candidate pipeline across open roles"
          right={
            <>
              <Segmented options={["Pipeline", "Roles", "Interviews"]} value="Pipeline" />
              <CTA>+ Add candidate</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Open roles", value: "2" },
            { label: "Candidates", value: "34" },
            { label: "Interviews this wk", value: "6" },
            { label: "Offers out", value: "1", highlight: true },
          ]}
        />

        <div style={{ flex: 1, display: "flex", gap: 16, marginTop: 12, minHeight: 0 }}>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, minHeight: 0, alignContent: "start" }}>
            {COLUMNS.map((col) => (
              <div key={col.title} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "oklch(0.38 0.02 262)",
                    }}
                  >
                    {col.title}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: c.muted,
                      background: "oklch(0.945 0.004 250)",
                      borderRadius: 9999,
                      padding: "1px 7px",
                    }}
                  >
                    {col.count}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {col.cards.map((card) => (
                    <CardTile key={card.name} card={card} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <SidePanel width={296}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: font.display }}>Add candidate</p>
              <span style={{ fontSize: 14, color: c.muted3, cursor: "pointer" }}>✕</span>
            </div>

            <div>
              <p style={fieldLabel}>Paste a profile URL</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${c.blue}`,
                  background: "#fff",
                  borderRadius: 9,
                  padding: "7px 10px",
                  fontSize: 12,
                  boxShadow: "0 0 0 3px oklch(0.47 0.21 255 / 0.10)",
                }}
              >
                <span style={{ color: "oklch(0.30 0.02 262)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  linkedin.com/in/marisol-vega
                </span>
              </div>
            </div>

            <div
              style={{
                border: "1px solid oklch(0.47 0.21 255 / 0.20)",
                background: "linear-gradient(180deg, oklch(0.985 0.01 258), #fff)",
                borderRadius: 12,
                padding: "9px 10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <SparkIcon />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: c.blueText }}>
                  Pulled from profile
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={fieldLabel}>Name</p>
                    <div style={fieldBox}>
                      Marisol Vega
                      <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <SparkIcon />
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={fieldLabel}>Current role</p>
                    <div style={fieldBox}>
                      Ops Lead · Verde Coffee
                      <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <SparkIcon />
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "none", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={fieldLabel}>Location</p>
                    <div style={fieldBox}>
                      Portland, OR
                      <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <SparkIcon />
                      </span>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={fieldLabel}>Exp.</p>
                    <div style={fieldBox}>
                      7 yrs
                      <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <SparkIcon />
                      </span>
                    </div>
                  </div>
                </div>
                <p style={{ margin: "7px 0 0", fontSize: 11, color: "oklch(0.34 0.02 262)", lineHeight: 1.5 }}>
                  Matches 4 of 5 <span style={{ fontWeight: 700 }}>Ops Coordinator</span> requirements.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <p style={fieldLabel}>Role</p>
                <div style={fieldBox}>Ops Coordinator ▾</div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={fieldLabel}>Stage</p>
                <div style={fieldBox}>Applied ▾</div>
              </div>
            </div>

            <div style={{ marginTop: "auto", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 9999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: c.ink,
                  background: "#fff",
                  border: `1px solid ${c.border}`,
                  cursor: "pointer",
                }}
              >
                Edit details
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 34,
                  padding: "0 16px",
                  borderRadius: 9999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#fff",
                  background: c.blueGrad,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px oklch(0.47 0.21 255 / 0.35)",
                }}
              >
                Add to pipeline
              </span>
            </div>
          </SidePanel>
        </div>
      </Main>
    </Frame>
  );
}
