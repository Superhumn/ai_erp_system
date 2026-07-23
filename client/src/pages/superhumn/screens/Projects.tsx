import React from "react";
import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, Segmented, CTA, StatusChip, type ChipTone } from "../primitives";

/* Checkbox glyph used in the inline task lists. */
function Check({ kind }: { kind: "done" | "blue" | "todo" }) {
  if (kind === "done") {
    return (
      <span
        style={{
          height: 13,
          width: 13,
          borderRadius: 4,
          background: "oklch(0.47 0.21 255)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          flexShrink: 0,
        }}
      >
        ✓
      </span>
    );
  }
  const border = kind === "blue" ? "1.5px solid oklch(0.47 0.21 255)" : "1.5px solid oklch(0.85 0.008 250)";
  return <span style={{ height: 13, width: 13, borderRadius: 4, border, flexShrink: 0, boxSizing: "border-box" }} />;
}

type Task = {
  check: "done" | "blue" | "todo";
  label: string;
  labelStyle?: React.CSSProperties;
  who?: string;
  date?: string;
  dateStyle?: React.CSSProperties;
  blocked?: boolean;
};

function CardTask({ t, last }: { t: Task; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        padding: "4px 0",
        borderBottom: last ? "none" : "1px solid oklch(0.96 0.003 250)",
      }}
    >
      <Check kind={t.check} />
      <span style={{ flex: 1, ...t.labelStyle }}>{t.label}</span>
      {t.blocked && <StatusChip tone="dark">BLOCKED</StatusChip>}
      {t.who && <span style={{ fontSize: 10.5, fontWeight: 600, color: "oklch(0.55 0.015 260)" }}>{t.who}</span>}
      {t.date && <span style={{ fontSize: 10.5, color: "oklch(0.62 0.015 260)", ...t.dateStyle }}>{t.date}</span>}
    </div>
  );
}

const doneLabel: React.CSSProperties = { color: "oklch(0.60 0.015 260)", textDecoration: "line-through" };
const blueLabel: React.CSSProperties = { fontWeight: 600, color: "oklch(0.40 0.21 255)" };
const blueDate: React.CSSProperties = { fontWeight: 700, color: "oklch(0.40 0.21 255)" };

type Card = {
  name: string;
  owner: string;
  due: string;
  chip: string;
  tone: ChipTone;
  percent: number;
  fill: string;
  meta: string[];
  tasks: Task[];
  moreLabel: string;
  highlight?: boolean;
};

const CARDS: Card[] = [
  {
    name: "Q3 Retail Expansion",
    owner: "Owner · Alex",
    due: "Due Sep 15",
    chip: "ON TRACK",
    tone: "active",
    percent: 62,
    fill: "oklch(0.47 0.21 255)",
    meta: ["18/29 tasks", "Budget $24k · spent $13.8k", "Next milestone · Erewhon launch Aug 1"],
    tasks: [
      { check: "done", label: "Sprouts category review deck", labelStyle: doneLabel, who: "Jenna", date: "Jul 12" },
      { check: "blue", label: "Send revised Erewhon pricing", labelStyle: blueLabel, who: "Alex", date: "today", dateStyle: blueDate },
      { check: "todo", label: "Approve demo-day budget", who: "Alex", date: "Jul 21" },
      { check: "todo", label: "Launch PO plan — 12 stores", who: "Maria", date: "Jul 25" },
    ],
    moreLabel: "All 29 tasks →",
    highlight: true,
  },
  {
    name: "FDA Facility Audit Prep",
    owner: "Owner · Maria",
    due: "Due Aug 15",
    chip: "AT RISK",
    tone: "dark",
    percent: 38,
    fill: "oklch(0.30 0.02 262)",
    meta: ["9/24 tasks", "2 blockers — SOP sign-offs", "28 days to deadline"],
    tasks: [
      { check: "todo", label: "SOP sign-off — sanitation", blocked: true, who: "Tom" },
      { check: "todo", label: "SOP sign-off — allergen control", blocked: true, who: "Maria" },
      { check: "todo", label: "Mock audit walkthrough", who: "Maria", date: "Aug 5" },
    ],
    moreLabel: "All 24 tasks →",
  },
  {
    name: "Shopify Migration",
    owner: "Owner · Dev",
    due: "Due Jul 31",
    chip: "ON TRACK",
    tone: "active",
    percent: 84,
    fill: "oklch(0.47 0.21 255)",
    meta: ["21/25 tasks", "Cutover rehearsal Jul 24"],
    tasks: [
      { check: "done", label: "Product catalog migration", labelStyle: doneLabel, who: "Dev", date: "Jul 8" },
      { check: "done", label: "Payment + tax configuration", labelStyle: doneLabel, who: "Dev", date: "Jul 15" },
      { check: "todo", label: "Cutover rehearsal", who: "Dev", date: "Jul 24" },
    ],
    moreLabel: "All 25 tasks →",
  },
];

function PortfolioCard({ card }: { card: Card }) {
  return (
    <div
      style={
        card.highlight
          ? {
              background: "linear-gradient(180deg, oklch(0.47 0.21 255 / 0.045), #fff 40%)",
              border: "1.5px solid oklch(0.47 0.21 255 / 0.4)",
              borderRadius: 14,
              padding: "12px 18px",
              boxShadow: "0 8px 24px rgba(15,25,70,0.08)",
            }
          : {
              background: "#fff",
              border: "1px solid oklch(0.93 0.004 250 / 0.9)",
              borderRadius: 14,
              padding: "14px 18px",
              boxShadow: "0 1px 2px rgba(15,25,70,0.05)",
            }
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700, fontFamily: font.display }}>{card.name}</p>
        <span style={{ fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>{card.owner}</span>
        <span style={{ fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>{card.due}</span>
        <StatusChip tone={card.tone}>{card.chip}</StatusChip>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "oklch(0.94 0.004 250)" }}>
          <div style={{ height: 6, width: `${card.percent}%`, borderRadius: 3, background: card.fill }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: font.display }}>
          {card.percent}%
        </span>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>
        {card.meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid oklch(0.95 0.003 250)" }}>
        {card.tasks.map((t, i) => (
          <CardTask key={t.label} t={t} last={i === card.tasks.length - 1} />
        ))}
        <p style={{ margin: "6px 0 0", fontSize: 11, fontWeight: 600, color: "oklch(0.47 0.21 255)", cursor: "pointer" }}>
          {card.moreLabel}
        </p>
      </div>
    </div>
  );
}

type Milestone = { title: string; sub: string; dot: "done" | "current" | "future"; connector?: "blue" | "grey"; titleColor?: string };

const MILESTONES: Milestone[] = [
  { title: "Whole Foods NorCal onboarding", sub: "Done · Jun 20", dot: "done", connector: "blue" },
  { title: "Sprouts category review", sub: "Done · Jul 12", dot: "done", connector: "grey" },
  { title: "Erewhon launch", sub: "Aug 1 · pricing due today", dot: "current", connector: "grey", titleColor: "oklch(0.40 0.21 255)" },
  { title: "Demo program · 12 stores", sub: "Sep 1–15", dot: "future", titleColor: "oklch(0.50 0.015 260)" },
];

function MilestoneDot({ dot }: { dot: Milestone["dot"] }) {
  if (dot === "done")
    return <span style={{ height: 10, width: 10, borderRadius: 9999, background: "oklch(0.47 0.21 255)", flexShrink: 0 }} />;
  if (dot === "current")
    return (
      <span
        style={{ height: 10, width: 10, borderRadius: 9999, border: "2px solid oklch(0.47 0.21 255)", background: "#fff", flexShrink: 0, boxSizing: "border-box" }}
      />
    );
  return (
    <span
      style={{ height: 10, width: 10, borderRadius: 9999, border: "2px solid oklch(0.88 0.008 250)", background: "#fff", flexShrink: 0, boxSizing: "border-box" }}
    />
  );
}

export default function Projects() {
  return (
    <Frame label="7a Projects" height={826}>
      <Sidebar active="Projects" />
      <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
        <Main>
          <Header
            title="Projects"
            subtitle="4 active · 2 on track · 1 at risk · 1 on hold"
            right={
              <>
                <Segmented options={["Active", "All", "Archived"]} value="Active" />
                <CTA>+ New project</CTA>
              </>
            }
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 10,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {CARDS.map((card) => (
              <PortfolioCard key={card.name} card={card} />
            ))}

            {/* On-hold card */}
            <div
              style={{
                background: "#fff",
                border: "1px solid oklch(0.93 0.004 250 / 0.9)",
                borderRadius: 14,
                padding: "8px 18px",
                boxShadow: "0 1px 2px rgba(15,25,70,0.05)",
                opacity: 0.75,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700, fontFamily: font.display }}>Reishi Reformulation</p>
                <span style={{ fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>Owner · Ops</span>
                <span style={{ fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>Paused</span>
                <StatusChip tone="dark">ON HOLD</StatusChip>
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>
                <span>Awaiting supplier COA — blocked 11 days</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 12,
                  padding: "8px 0 0",
                  marginTop: 6,
                  borderTop: "1px solid oklch(0.95 0.003 250)",
                }}
              >
                <Check kind="todo" />
                <span style={{ flex: 1 }}>Follow up with Fresh Farms on COA</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "oklch(0.55 0.015 260)" }}>Ops</span>
                <span style={{ fontSize: 10.5, color: "oklch(0.62 0.015 260)" }}>waiting 11d</span>
              </div>
            </div>
          </div>
        </Main>

        {/* Milestones floating glass panel */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            margin: "14px 14px 14px 0",
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.9)",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 16px 48px rgba(15,25,70,0.16)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>
            Q3 Retail Expansion
          </p>
          <p style={{ margin: "3px 0 14px", fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>Milestones</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {MILESTONES.map((m, i) => (
              <div key={m.title} style={{ display: "flex", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <MilestoneDot dot={m.dot} />
                  {i < MILESTONES.length - 1 && (
                    <span
                      style={{
                        width: 1.5,
                        flex: 1,
                        background: m.connector === "blue" ? "oklch(0.47 0.21 255)" : "oklch(0.90 0.005 250)",
                      }}
                    />
                  )}
                </div>
                <div style={{ paddingBottom: i < MILESTONES.length - 1 ? 14 : 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: m.titleColor }}>{m.title}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "oklch(0.55 0.015 260)" }}>{m.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>
              My tasks
            </p>
            {["Send revised Erewhon pricing", "Approve demo-day budget", "Review launch PO plan"].map((label, i, arr) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  padding: "6px 0",
                  borderBottom: i === arr.length - 1 ? "none" : "1px solid rgba(255,255,255,0.9)",
                }}
              >
                <span style={{ height: 12, width: 12, border: "1.5px solid oklch(0.85 0.008 250)", borderRadius: 4, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "auto",
              background: "oklch(0.47 0.21 255 / 0.06)",
              border: "1px solid oklch(0.47 0.21 255 / 0.2)",
              borderRadius: 12,
              padding: "11px 13px",
            }}
          >
            <p style={{ margin: 0, fontSize: 11.5, color: "oklch(0.35 0.02 262)", lineHeight: 1.5 }}>
              <strong style={{ color: "oklch(0.40 0.21 255)" }}>AI:</strong> Erewhon launch depends on PO-2044 arriving Jul 24
              — 3 days of buffer. I'll flag if tracking slips.
            </p>
          </div>
        </div>
      </div>
    </Frame>
  );
}
