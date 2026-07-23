import React from "react";
import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, Segmented, CTA, StatusChip } from "../primitives";

function LCheck({ kind }: { kind: "blue" | "grey" }) {
  const border = kind === "blue" ? "1.5px solid oklch(0.47 0.21 255)" : "1.5px solid oklch(0.85 0.008 250)";
  return <span style={{ height: 12, width: 12, borderRadius: 4, border, flexShrink: 0, boxSizing: "border-box" }} />;
}

type DateKind = "plain" | "pill" | "today" | "bare";

const dateStyles: Record<DateKind, React.CSSProperties> = {
  today: { fontSize: 10, fontWeight: 700, color: "oklch(0.40 0.21 255)", width: 44, textAlign: "right" },
  pill: {
    fontSize: 10,
    fontWeight: 700,
    color: "oklch(0.40 0.21 255)",
    background: "oklch(0.47 0.21 255 / 0.09)",
    borderRadius: 5,
    padding: "1px 5px",
    width: 44,
    textAlign: "center",
  },
  plain: { fontSize: 10, color: "oklch(0.62 0.015 260)", width: 44, textAlign: "right" },
  bare: { fontSize: 10, color: "oklch(0.62 0.015 260)" },
};

type LRow = {
  check: "blue" | "grey";
  label: string;
  labelStyle?: React.CSSProperties;
  blocked?: boolean;
  who?: string;
  date?: string;
  dateKind?: DateKind;
  last?: boolean;
};

function TaskRow({ r }: { r: LRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        padding: "5px 0",
        borderBottom: r.last ? "none" : "1px solid oklch(0.955 0.003 250)",
      }}
    >
      <LCheck kind={r.check} />
      <span style={{ flex: 1, ...r.labelStyle }}>{r.label}</span>
      {r.blocked && <StatusChip tone="dark">BLOCKED</StatusChip>}
      {r.who && <span style={{ fontSize: 10, fontWeight: 600, color: "oklch(0.55 0.015 260)" }}>{r.who}</span>}
      {r.date && <span style={dateStyles[r.dateKind ?? "plain"]}>{r.date}</span>}
    </div>
  );
}

function ProgressHeader({
  name,
  percent,
  percentColor,
  fill,
  blockedChip,
  open,
  due,
}: {
  name: string;
  percent: number;
  percentColor?: string;
  fill: string;
  blockedChip?: boolean;
  open: string;
  due: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1.5px solid oklch(0.16 0.025 262)" }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: font.display }}>{name}</p>
      <div style={{ flex: 1, maxWidth: 90, height: 5, borderRadius: 3, background: "oklch(0.94 0.004 250)" }}>
        <div style={{ height: 5, width: `${percent}%`, borderRadius: 3, background: fill }} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: percentColor }}>{percent}%</span>
      <span style={{ flex: 1 }} />
      {blockedChip && <StatusChip tone="dark">2 BLOCKED</StatusChip>}
      <span style={{ fontSize: 10.5, fontWeight: 700, color: "oklch(0.40 0.21 255)" }}>{open}</span>
      <span style={{ fontSize: 10.5, color: "oklch(0.58 0.015 260)" }}>{due}</span>
    </div>
  );
}

const moreLink: React.CSSProperties = {
  margin: "4px 0 14px",
  fontSize: 10.5,
  fontWeight: 600,
  color: "oklch(0.47 0.21 255)",
  cursor: "pointer",
};

const blueBold: React.CSSProperties = { fontWeight: 600, color: "oklch(0.40 0.21 255)" };
const bold: React.CSSProperties = { fontWeight: 600 };

const Q3_TASKS: LRow[] = [
  { check: "blue", label: "Send revised Erewhon pricing", labelStyle: blueBold, who: "Alex", date: "today", dateKind: "today" },
  { check: "grey", label: "Approve demo-day budget", who: "Alex", date: "Jul 21", dateKind: "pill" },
  { check: "grey", label: "Launch PO plan — 12 stores", who: "Maria", date: "Jul 25", dateKind: "pill" },
  { check: "grey", label: "Demo staffing — 12 stores", who: "Jenna", date: "Jul 28", dateKind: "plain" },
  { check: "grey", label: "Retail-ready case packaging spec", who: "Maria", date: "Jul 30", dateKind: "plain" },
  { check: "grey", label: "Erewhon launch-day merchandising", who: "Jenna", date: "Aug 1", dateKind: "plain" },
  { check: "grey", label: "Wholesale price list v3", who: "Sara", date: "Aug 4", dateKind: "plain", last: true },
];

const SHOPIFY_TASKS: LRow[] = [
  { check: "grey", label: "Cutover rehearsal", who: "Dev", date: "Jul 24", dateKind: "pill" },
  { check: "grey", label: "Redirect map + SEO checks", who: "Dev", date: "Jul 26", dateKind: "plain" },
  { check: "grey", label: "Subscription plans migration", who: "Dev", date: "Jul 29", dateKind: "plain" },
  { check: "grey", label: "Go-live + DNS cutover", who: "Dev", date: "Jul 31", dateKind: "plain", last: true },
];

const FDA_TASKS: LRow[] = [
  { check: "grey", label: "SOP sign-off — sanitation", labelStyle: bold, blocked: true, who: "Tom" },
  { check: "grey", label: "SOP sign-off — allergen control", labelStyle: bold, blocked: true, who: "Maria" },
  { check: "grey", label: "Batch record template update", who: "Elena", date: "Jul 23", dateKind: "pill" },
  { check: "grey", label: "Supplier COA file audit", who: "Elena", date: "Jul 25", dateKind: "pill" },
  { check: "grey", label: "Pest-control log reconciliation", who: "Tom", date: "Jul 28", dateKind: "plain" },
  { check: "grey", label: "Recall mock-drill documentation", who: "Maria", date: "Aug 1", dateKind: "plain" },
  { check: "grey", label: "Mock audit walkthrough", who: "Maria", date: "Aug 5", dateKind: "plain", last: true },
];

export default function TaskList() {
  return (
    <Frame label="8a Task List" height={540}>
      <Sidebar active="Projects" />
      <Main>
        <Header
          title="Projects"
          subtitle="31 open tasks · 2 blocked · 3 due this week"
          right={
            <>
              <Segmented options={["By project", "By due date", "By category", "By assignee"]} value="By project" />
              <CTA>+ Task</CTA>
            </>
          }
        />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginTop: 12, alignContent: "start" }}>
          {/* Col A */}
          <div>
            <ProgressHeader
              name="Q3 Retail Expansion"
              percent={62}
              percentColor="oklch(0.40 0.21 255)"
              fill="oklch(0.47 0.21 255)"
              open="11 open"
              due="due Sep 15"
            />
            {Q3_TASKS.map((r) => (
              <TaskRow key={r.label} r={r} />
            ))}
            <p style={moreLink}>+4 more · open project →</p>

            <ProgressHeader
              name="Shopify Migration"
              percent={84}
              percentColor="oklch(0.40 0.21 255)"
              fill="oklch(0.47 0.21 255)"
              open="4 open"
              due="due Jul 31"
            />
            {SHOPIFY_TASKS.map((r) => (
              <TaskRow key={r.label} r={r} />
            ))}
          </div>

          {/* Col B */}
          <div>
            <ProgressHeader
              name="FDA Facility Audit Prep"
              percent={38}
              fill="oklch(0.30 0.02 262)"
              blockedChip
              open="15 open"
              due="due Aug 15"
            />
            {FDA_TASKS.map((r) => (
              <TaskRow key={r.label} r={r} />
            ))}
            <p style={moreLink}>+8 more · open project →</p>

            {/* Reishi — on hold */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1.5px solid oklch(0.16 0.025 262)",
                opacity: 0.8,
              }}
            >
              <p style={{ margin: 0, flex: 1, fontSize: 13, fontWeight: 700, fontFamily: font.display }}>Reishi Reformulation</p>
              <StatusChip tone="dark">ON HOLD</StatusChip>
              <span style={{ fontSize: 10.5, color: "oklch(0.58 0.015 260)" }}>1 open</span>
            </div>
            <TaskRow r={{ check: "grey", label: "Follow up with Fresh Farms on COA", who: "Ops", date: "waiting 11d", dateKind: "bare", last: true }} />

            <div
              style={{
                marginTop: 14,
                background: "oklch(0.47 0.21 255 / 0.06)",
                border: "1px solid oklch(0.47 0.21 255 / 0.2)",
                borderRadius: 12,
                padding: "11px 13px",
              }}
            >
              <p style={{ margin: 0, fontSize: 11.5, color: "oklch(0.35 0.02 262)", lineHeight: 1.5 }}>
                <strong style={{ color: "oklch(0.40 0.21 255)" }}>AI:</strong> The 2 blocked SOP sign-offs gate 6 downstream audit
                tasks — clearing them this week keeps Aug 15 feasible. Nudge drafts ready for Tom and Maria.
              </p>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
