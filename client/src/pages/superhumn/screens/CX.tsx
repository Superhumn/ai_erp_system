import { color as c } from "../tokens";
import { Frame, Sidebar, Main, Header, KpiStrip, Segmented } from "../primitives";

type Priority = "URGENT" | "HIGH" | "NORMAL" | "LOW";

type Ticket = {
  customer: string;
  subject: string;
  priority: Priority;
  agent: string;
  age: string;
  sla: string;
  slaBlue?: boolean;
  highlight?: boolean;
};

const TICKETS: Ticket[] = [
  { customer: "Brightline Foods", subject: "Order BL-882 short by 3 cases", priority: "URGENT", agent: "Jenna", age: "18m", sla: "12m left", slaBlue: true, highlight: true },
  { customer: "Verde Coffee", subject: "Invoice mismatch on INV-204", priority: "HIGH", agent: "Omar", age: "1h", sla: "2h left" },
  { customer: "Nordic Kitchen", subject: "Requesting COA for lot 7742", priority: "NORMAL", agent: "Jenna", age: "2h", sla: "5h left" },
  { customer: "Peak Provisions", subject: "Damaged pallet — claim", priority: "URGENT", agent: "—", age: "40m", sla: "30m left", slaBlue: true },
  { customer: "Harbor Supply", subject: "Change ship-to address", priority: "LOW", agent: "Sam", age: "3h", sla: "1d left" },
  { customer: "Maple & Co", subject: "How to reorder subscription", priority: "NORMAL", agent: "Sam", age: "5h", sla: "8h left" },
  { customer: "Union Market", subject: "Missing tracking number", priority: "NORMAL", agent: "Omar", age: "6h", sla: "6h left" },
  { customer: "Cedar Bakery", subject: "Tax exemption on account", priority: "LOW", agent: "Jenna", age: "1d", sla: "2d left" },
  { customer: "Golden Grain", subject: "Bulk pricing inquiry", priority: "NORMAL", agent: "—", age: "1d", sla: "1d left" },
  { customer: "Riverside Deli", subject: "Late delivery apology", priority: "LOW", agent: "Sam", age: "2d", sla: "—" },
];

const PRIORITY_STYLE: Record<Priority, React.CSSProperties> = {
  URGENT: { color: "#fff", background: "oklch(0.16 0.025 262)" },
  HIGH: { color: "oklch(0.40 0.21 255)", background: "oklch(0.47 0.21 255 / 0.12)" },
  NORMAL: { color: "oklch(0.38 0.02 262)", background: "oklch(0.945 0.004 250)" },
  LOW: { color: "oklch(0.38 0.02 262)", background: "oklch(0.945 0.004 250)" },
};

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

function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        borderRadius: 9999,
        padding: "2px 9px",
        whiteSpace: "nowrap",
        ...PRIORITY_STYLE[priority],
      }}
    >
      {priority}
    </span>
  );
}

export default function CX() {
  return (
    <Frame label="10d CX Support" height={680}>
      <Sidebar active="CX" />
      <Main>
        <Header
          title="Customer Support"
          subtitle="Tickets, SLAs & AI-drafted replies"
          right={
            <>
              <Segmented options={["Queue", "Assigned", "Resolved"]} value="Queue" />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 9999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: c.ink,
                  background: "#fff",
                  border: `1px solid ${c.border}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Filters
              </span>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Open", value: "18" },
            { label: "First response", value: "22m" },
            { label: "CSAT", value: "96%" },
            { label: "Breaching SLA", value: "2", highlight: true },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          <div style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={headCell("left")}>Customer</th>
                  <th style={headCell("left")}>Subject</th>
                  <th style={headCell("left")}>Priority</th>
                  <th style={headCell("left")}>Agent</th>
                  <th style={headCell("left")}>Age</th>
                  <th style={headCell("right")}>SLA</th>
                </tr>
              </thead>
              <tbody>
                {TICKETS.map((t, i) => (
                  <tr
                    key={t.customer}
                    style={{
                      background: t.highlight ? "oklch(0.47 0.21 255 / 0.06)" : undefined,
                      borderBottom: i === TICKETS.length - 1 ? undefined : "1px solid oklch(0.95 0.003 250)",
                    }}
                  >
                    <td style={{ padding: "7px 8px", fontSize: 12.5 }}><span style={{ fontWeight: 600 }}>{t.customer}</span></td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5 }}><span style={{ color: "oklch(0.45 0.015 260)" }}>{t.subject}</span></td>
                    <td style={{ padding: "7px 8px" }}><PriorityChip priority={t.priority} /></td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, color: "oklch(0.45 0.015 260)" }}>{t.agent}</td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, color: "oklch(0.50 0.015 260)" }}>{t.age}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.slaBlue ? "oklch(0.40 0.21 255)" : "oklch(0.50 0.015 260)" }}>{t.sla}</span>
                    </td>
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
