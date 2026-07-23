import { color as c, font } from "../tokens";
import {
  Frame,
  Sidebar,
  Main,
  Header,
  KpiStrip,
  AskBar,
  StatusChip,
  AICard,
  Button,
  RightRail,
  Caps,
  MeterRow,
  type ChipTone,
} from "../primitives";

type NeedsRow = { title: string; sub: string; chip: string; tone: ChipTone };

const NEEDS: NeedsRow[] = [
  { title: "Approve PO-1042 · Nordic Mills", sub: "$9,800 · oat groats for R-0847 · ETA slips if not sent today", chip: "APPROVE", tone: "active" },
  { title: "Q4 media plan", sub: "$24,000 · Priya requested review by Thu", chip: "REVIEW", tone: "active" },
  { title: "Offer — Warehouse lead", sub: "Marcus Bell · comp within band · expires Fri", chip: "SIGN OFF", tone: "active" },
  { title: "Grant report — AgriFund", sub: "Q2 spend attestation · due Jul 25", chip: "DUE JUL 25", tone: "neutral" },
  { title: "Invoice mismatch · PO-1038", sub: "packing slip 4 pallets vs invoice 5 · $1,140 delta", chip: "RESOLVE", tone: "neutral" },
  { title: "SOP update — allergen handling", sub: "2 acknowledgements outstanding", chip: "NUDGE", tone: "neutral" },
];

const TODAY: { time: string; title: string; note: string }[] = [
  { time: "09:00", title: "Ops stand-up", note: "Line 2 · 15 min" },
  { time: "10:30", title: "Nordic Mills QBR", note: "video · Sara joins" },
  { time: "13:00", title: "R-0847 pre-run review", note: "BOM & staffing" },
  { time: "15:30", title: "Investor update draft", note: "with Elena" },
  { time: "16:30", title: "Offer debrief — Marcus Bell", note: "with Leo · 20 min" },
  { time: "17:00", title: "Approve payroll run", note: "due 18:00" },
];

const WEEK: { label: string; value: string }[] = [
  { label: "Orders shipped", value: "14 of 21" },
  { label: "Invoices due in", value: "$31,500" },
  { label: "Candidates in final round", value: "3" },
  { label: "Grant reports due", value: "1 · Jul 25" },
];

export default function Home() {
  return (
    <Frame label="14a Home" height={680}>
      <Sidebar active="Home" />
      <Main>
        <Header
          title="Good morning, Alex"
          subtitle="Tuesday, July 22 · 6 items need you before 10:00"
          right={<AskBar />}
        />
        <KpiStrip
          items={[
            { label: "Cash on hand", value: "$412k", sub: "runway 14 mo" },
            { label: "Open orders", value: "38", sub: "$86k committed" },
            { label: "Runs this week", value: "3", sub: "R-0847 starts Aug 4" },
            { label: "Needs you", value: "6", sub: "2 over $5,000", highlight: true },
          ]}
        />

        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1.8fr 1fr",
            gap: 24,
            marginTop: 12,
            minHeight: 0,
          }}
        >
          {/* Left: needs-you queue + today */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Caps marginBottom={2}>Needs you</Caps>
            {NEEDS.map((n, i) => (
              <div
                key={n.title}
                className="shumn-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 4px",
                  borderBottom: i === NEEDS.length - 1 ? "none" : `1px solid ${c.rowSep}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{n.title}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10.5, color: c.muted3 }}>{n.sub}</p>
                </div>
                <StatusChip tone={n.tone}>{n.chip}</StatusChip>
              </div>
            ))}

            <Caps marginTop={12} marginBottom={2}>Today</Caps>
            {TODAY.map((t, i) => (
              <div
                key={t.time}
                className="shumn-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 4px",
                  borderBottom: i === TODAY.length - 1 ? "none" : `1px solid ${c.rowSep}`,
                }}
              >
                <span
                  style={{
                    width: 52,
                    fontSize: 11.5,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: c.ink2,
                    flexShrink: 0,
                  }}
                >
                  {t.time}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{t.title}</p>
                </div>
                <span style={{ fontSize: 11, color: c.muted3, whiteSpace: "nowrap" }}>{t.note}</span>
              </div>
            ))}
          </div>

          {/* Right rail */}
          <RightRail>
            <AICard
              label="Morning brief"
              actions={
                <>
                  <Button variant="secondary">Open queue</Button>
                  <Button variant="primary">Approve PO-1042</Button>
                </>
              }
            >
              R-0847 is fully covered if PO-1042 ships today — approval is the only blocker. Cash impact this week:
              $14,200 out, $31,500 in (2 invoices due). No overdue CX tickets.
            </AICard>

            <div>
              <Caps>Live now</Caps>
              <MeterRow label="R-0846 · Line 1" right="packaging · 82%" value={82} marginTop={0} />
              <MeterRow label="Dock A" right="88% · putaway queued" value={88} marginTop={10} />
              <MeterRow label="R-0847 staging" right="3 of 4 POs covered" value={75} marginTop={10} />
              <MeterRow label="CX queue" right="4 open · none overdue" value={18} marginTop={10} />
            </div>

            <div style={{ marginTop: "auto" }}>
              <Caps>This week</Caps>
              {WEEK.map((w, i) => (
                <div
                  key={w.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 12,
                    padding: "6px 0",
                    borderBottom: i === WEEK.length - 1 ? "none" : `1px solid ${c.rowSep}`,
                  }}
                >
                  <span style={{ color: "oklch(0.30 0.02 262)" }}>{w.label}</span>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap", fontFamily: font.body }}>{w.value}</span>
                </div>
              ))}
            </div>
          </RightRail>
        </div>
      </Main>
    </Frame>
  );
}
