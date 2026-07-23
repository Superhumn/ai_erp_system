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

type Row = { name: string; role: string; team: string; started: string; status: string; tone: ChipTone };

const ROWS: Row[] = [
  { name: "Maria Lopez", role: "Head of Ops", team: "Operations", started: "Mar 2024", status: "ACTIVE", tone: "neutral" },
  { name: "Dev Patel", role: "Engineering Lead", team: "Product", started: "Jan 2025", status: "ACTIVE", tone: "neutral" },
  { name: "Jenna Cole", role: "Sales Manager", team: "Sales", started: "Jun 2024", status: "PTO TODAY", tone: "active" },
  { name: "Tom Nakamura", role: "Production Supervisor", team: "Plant", started: "Sep 2024", status: "ACTIVE", tone: "neutral" },
  { name: "Sara Kim", role: "Finance Manager", team: "Finance", started: "Feb 2025", status: "ACTIVE", tone: "neutral" },
  { name: "Leo Grant", role: "Warehouse Associate", team: "Plant", started: "Jul 14, 2026", status: "ONBOARDING", tone: "active" },
  { name: "Priya Shah", role: "Marketing Lead", team: "Sales", started: "Apr 2025", status: "ACTIVE", tone: "neutral" },
  { name: "Marcus Bell", role: "Warehouse Associate", team: "Plant", started: "Nov 2024", status: "ACTIVE", tone: "neutral" },
  { name: "Elena Rossi", role: "QA Specialist", team: "Plant", started: "May 2025", status: "ACTIVE", tone: "neutral" },
  { name: "Omar Haddad", role: "Account Manager", team: "Sales", started: "Aug 2025", status: "ACTIVE", tone: "neutral" },
  { name: "Grace Liu", role: "Ops Coordinator", team: "Operations", started: "Oct 2025", status: "ACTIVE", tone: "neutral" },
];

const PAYROLL: { label: string; value: string; last?: boolean }[] = [
  { label: "Salaries · 12 people", value: "$58,200" },
  { label: "Hourly · 2 people", value: "$6,140" },
  { label: "Contractors", value: "$4,060", last: true },
];

const COMING: { label: string; right: string; last?: boolean }[] = [
  { label: "Leo Grant · 30-day check-in", right: "Aug 13" },
  { label: "Maria Lopez · review cycle", right: "Sep 1" },
  { label: "Ops Coordinator · 4 candidates", right: "interviews", last: true },
];

export default function HR() {
  return (
    <Frame label="7b HR" height={640}>
      <Sidebar active="HR" />
      <Main>
        <Header
          title="HR"
          subtitle="People, payroll & time off"
          right={
            <>
              <Segmented options={["People", "Payroll", "Time off", "Recruiting"]} value="People" />
              <CTA>+ Add person</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Headcount", value: "14" },
            { label: "Monthly payroll", value: "$68,400" },
            { label: "Open roles", value: "2", highlight: true },
            { label: "Out today", value: "1" },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 24, marginTop: 10, minHeight: 0 }}>
          <div style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Name</th>
                  <th style={{ ...th, textAlign: "left" }}>Role</th>
                  <th style={{ ...th, textAlign: "left" }}>Team</th>
                  <th style={{ ...th, textAlign: "left" }}>Started</th>
                  <th style={{ ...th, textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr key={r.name} style={{ borderBottom: i === ROWS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.45 0.015 260)" }}>{r.role}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{r.team}</td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.50 0.015 260)" }}>{r.started}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center" }}>
                      <StatusChip tone={r.tone}>{r.status}</StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, fontFamily: font.display }}>Next payroll · Jul 31</p>
              {PAYROLL.map((p) => (
                <div
                  key={p.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "6px 0",
                    borderBottom: p.last ? "none" : "1px solid oklch(0.95 0.003 250)",
                  }}
                >
                  <span>{p.label}</span>
                  <span style={{ fontWeight: 600 }}>{p.value}</span>
                </div>
              ))}
              <span
                style={{
                  display: "inline-flex",
                  marginTop: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  background: c.blueGrad,
                  borderRadius: 9999,
                  padding: "6px 16px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px oklch(0.47 0.21 255 / 0.35)",
                }}
              >
                Run payroll
              </span>
            </div>

            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, oklch(0.92 0.005 250), transparent)" }} />

            <div>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, fontFamily: font.display }}>Coming up</p>
              {COMING.map((r) => (
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
                  <span style={{ color: "oklch(0.58 0.015 260)" }}>{r.right}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
