import React from "react";
import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, Segmented, CTA, KpiStrip, Caps, AICard } from "../primitives";

function Tag({ children, blue }: { children: React.ReactNode; blue?: boolean }) {
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
        color: blue ? "oklch(0.40 0.21 255)" : "oklch(0.38 0.02 262)",
        background: blue ? "oklch(0.47 0.21 255 / 0.12)" : "oklch(0.945 0.004 250)",
      }}
    >
      {children}
    </span>
  );
}

type Meeting = { time: string; title: string; tag: string; tagBlue?: boolean; who: string; now?: boolean };

const TODAY: Meeting[] = [
  { time: "09:30", title: "Q3 Ops Review", tag: "Operations", tagBlue: true, who: "Maria, Dev, Alex +2", now: true },
  { time: "11:00", title: "Vendor call — Nordic Steel", tag: "Procurement", who: "Alex, Omar" },
  { time: "14:00", title: "Design sync", tag: "Product", who: "Dev, Priya" },
];

const MONDAY: Meeting[] = [
  { time: "10:00", title: "Board prep", tag: "Finance", who: "Alex, Sara" },
  { time: "13:30", title: "Candidate — Ops Coordinator", tag: "Recruiting", who: "Maria, HR" },
  { time: "16:00", title: "Weekly all-hands", tag: "Company", who: "All team" },
];

function MeetingRow({ m }: { m: Meeting }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        borderRadius: 10,
        ...(m.now
          ? { background: "#fff", boxShadow: "0 1px 3px rgba(15,25,70,0.07)", border: "1px solid oklch(0.47 0.21 255 / 0.18)" }
          : { borderBottom: "1px solid oklch(0.95 0.003 250)" }),
      }}
    >
      <div style={{ width: 52, flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, fontFamily: font.display }}>{m.time}</p>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{m.title}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          <Tag blue={m.tagBlue}>{m.tag}</Tag>
          <span style={{ fontSize: 11, color: "oklch(0.58 0.015 260)" }}>{m.who}</span>
        </div>
      </div>
      {m.now ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "oklch(0.40 0.21 255)" }}>
          <span style={{ height: 7, width: 7, borderRadius: 9999, background: "oklch(0.47 0.21 255)" }} />
          Now
        </span>
      ) : (
        <span style={{ fontSize: 11, color: "oklch(0.50 0.015 260)" }}>Join</span>
      )}
    </div>
  );
}

const ACTIONS: { label: string; sub: string }[] = [
  { label: "Raise PO for secondary steel supplier", sub: "→ Procurement · PO draft" },
  { label: "Schedule Line 2 maintenance Aug 4", sub: "→ Manufacturing · Work order" },
  { label: "Update Q3 throughput in board deck", sub: "→ Investors · Update" },
];

export default function Meetings() {
  return (
    <Frame label="10a Meetings" height={680}>
      <Sidebar active="Meetings" />
      <Main>
        <Header
          title="Meetings"
          subtitle="Calendar, notes & AI action items"
          right={
            <>
              <Segmented options={["Upcoming", "Past", "Recordings"]} value="Upcoming" />
              <CTA>+ Schedule</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "This week", value: "9" },
            { label: "Focus time", value: "4.5h" },
            { label: "Open actions", value: "3", highlight: true },
            { label: "Recordings", value: "6" },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 24, marginTop: 12, minHeight: 0 }}>
          {/* Calendar */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Caps>Today · Fri Jul 18</Caps>
            {TODAY.map((m) => (
              <MeetingRow key={m.time} m={m} />
            ))}
            <Caps marginTop={12}>Mon Jul 21</Caps>
            {MONDAY.map((m) => (
              <MeetingRow key={m.time} m={m} />
            ))}
          </div>

          {/* Notes + actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflow: "hidden" }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: font.display }}>Q3 Ops Review</p>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "oklch(0.58 0.015 260)" }}>
                09:30–10:15 · Maria Lopez, Dev Patel, Alex Chen +2
              </p>
            </div>
            <div>
              <Caps>Action items → ERP</Caps>
              {ACTIONS.map((a) => (
                <div key={a.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: "1px solid oklch(0.95 0.003 250)" }}>
                  <span style={{ height: 15, width: 15, borderRadius: 5, border: "1.5px solid oklch(0.75 0.02 260)", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.35 }}>{a.label}</p>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "oklch(0.40 0.21 255)" }}>{a.sub}</span>
                  </div>
                </div>
              ))}
            </div>
            <AICard label="AI notes">
              Throughput +12% vs Q2. Nordic Steel lead time slipping — dual-source agreed. Line 2 maintenance moved to Aug 4.
            </AICard>
            <div style={{ marginTop: "auto", display: "flex", gap: 6 }}>
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
                  color: "oklch(0.16 0.025 262)",
                  background: "#fff",
                  border: "1px solid oklch(0.90 0.005 250)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Share notes
              </span>
              <CTA>Push 3 actions</CTA>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
