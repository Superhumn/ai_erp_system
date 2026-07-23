import React from "react";
import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, Segmented, CTA, StatusChip, AICard, SparkIcon, Caps } from "../primitives";

function GhostPill({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </span>
  );
}

function Avatar({ letter }: { letter: string }) {
  return (
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
      {letter}
    </span>
  );
}

function ChannelRow({ label, active, badge }: { label: string; active?: boolean; badge?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 8px",
        borderRadius: 8,
        ...(active ? { background: "#fff", boxShadow: "0 1px 2px rgba(15,25,70,0.06)" } : {}),
      }}
    >
      <span style={{ fontSize: 12.5, color: active ? "oklch(0.40 0.21 255)" : "oklch(0.40 0.02 262)", fontWeight: active ? 700 : 400 }}>
        {label}
      </span>
      {badge && (
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#fff", background: "oklch(0.47 0.21 255)", borderRadius: 9999, padding: "0 6px" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function Msg({ letter, name, time, children, mine }: { letter: string; name: string; time: string; children: React.ReactNode; mine?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 9, ...(mine ? { flexDirection: "row-reverse" } : {}) }}>
      <Avatar letter={letter} />
      <div style={{ maxWidth: "74%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, ...(mine ? { flexDirection: "row-reverse" } : {}) }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{name}</span>
          <span style={{ fontSize: 10, color: "oklch(0.58 0.015 260)" }}>{time}</span>
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 12.5,
            lineHeight: 1.45,
            padding: "8px 11px",
            borderRadius: 12,
            ...(mine
              ? { background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.45 0.21 255))", color: "#fff", borderTopRightRadius: 4 }
              : { background: "#fff", border: "1px solid oklch(0.92 0.005 250)", borderTopLeftRadius: 4 }),
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

const LINK_ROWS: { type: string; name: string; nameBlue?: boolean; sub: string; first?: boolean }[] = [
  { type: "PO", name: "PO-1042", nameBlue: true, sub: "Nordic Steel · $18,400", first: true },
  { type: "VENDOR", name: "Nordic Steel", sub: "6-wk lead time · 3 open POs" },
  { type: "SHIPMENT", name: "SHP-2210", sub: "Nordic Steel · ETA Aug 2" },
  { type: "SOP", name: "Raw material receiving", sub: "v3 · needs review" },
];

export default function Messaging() {
  return (
    <Frame label="10b Messaging" height={680}>
      <Sidebar active="Messaging" />
      <Main>
        <Header
          title="Messaging"
          subtitle="Team chat linked to your records"
          right={
            <>
              <Segmented options={["Channels", "Direct", "Threads"]} value="Channels" />
              <GhostPill>+ New</GhostPill>
            </>
          }
        />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "150px 1fr 290px", gap: 18, marginTop: 14, minHeight: 0 }}>
          {/* Channels */}
          <div style={{ borderRight: "1px solid oklch(0.93 0.004 250 / 0.7)", paddingRight: 12, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ padding: "0 8px" }}>
              <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.64 0.012 260)" }}>
                Channels
              </p>
            </div>
            <ChannelRow label="# operations" active badge="2" />
            <ChannelRow label="# procurement" />
            <ChannelRow label="# sales" badge="5" />
            <ChannelRow label="# eng-product" />
            <ChannelRow label="# finance" />
            <div style={{ padding: "0 8px", marginTop: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.64 0.012 260)" }}>
                Direct
              </p>
            </div>
            <ChannelRow label="Maria Lopez" badge="1" />
            <ChannelRow label="Dev Patel" />
            <ChannelRow label="Sara Kim" />
          </div>

          {/* Chat */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 9, borderBottom: "1px solid oklch(0.95 0.003 250)" }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: font.display }}># operations</p>
                <p style={{ margin: "1px 0 0", fontSize: 11, color: "oklch(0.58 0.015 260)" }}>6 members · linked to PO-1042</p>
              </div>
              <div style={{ display: "flex" }}>
                <Avatar letter="M" />
                <span style={{ marginLeft: -6 }}>
                  <Avatar letter="D" />
                </span>
                <span style={{ marginLeft: -6 }}>
                  <Avatar letter="A" />
                </span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, padding: "12px 4px", overflow: "hidden" }}>
              <Msg letter="M" name="Maria Lopez" time="09:41">
                Nordic Steel pushed lead time to 6 weeks. We should dual-source before the next run.
              </Msg>
              <Msg letter="D" name="Dev Patel" time="09:43">
                Agreed. I flagged it on the Q3 review notes too.
              </Msg>
              <Msg letter="A" name="Alex Chen" time="09:45" mine>
                I’ll raise a PO for the backup supplier today — linked{" "}
                <span style={{ display: "inline-flex", alignItems: "center", fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.22)", borderRadius: 6, padding: "0 5px" }}>
                  @PO-1042
                </span>{" "}
                for context.
              </Msg>
              <Msg letter="M" name="Maria Lopez" time="09:47">
                Perfect. Linking the shipment ETA here once it’s in.
              </Msg>
            </div>

            {/* Record-link popover */}
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 0,
                  width: 320,
                  background: "rgba(255,255,255,0.72)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid oklch(0.92 0.005 250)",
                  borderRadius: 12,
                  padding: 6,
                  boxShadow: "0 12px 32px -12px rgba(15,25,70,0.25)",
                }}
              >
                <p style={{ margin: "2px 0 4px", padding: "0 9px", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.64 0.012 260)" }}>
                  Link a record · @nor
                </p>
                {LINK_ROWS.map((r) => (
                  <div
                    key={r.type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "6px 9px",
                      borderRadius: 8,
                      ...(r.first ? { background: "oklch(0.47 0.21 255 / 0.08)" } : {}),
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "oklch(0.38 0.02 262)", background: "oklch(0.945 0.004 250)", borderRadius: 5, padding: "2px 6px", width: 56, textAlign: "center", flexShrink: 0 }}>
                      {r.type}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, ...(r.nameBlue ? { color: "oklch(0.40 0.21 255)" } : {}) }}>{r.name}</span>
                    <span style={{ fontSize: 11, color: "oklch(0.58 0.015 260)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Composer */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid oklch(0.47 0.21 255)", background: "#fff", borderRadius: 12, padding: "8px 12px", boxShadow: "0 0 0 3px oklch(0.47 0.21 255 / 0.10)" }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "oklch(0.30 0.02 262)" }}>
                Shipment update on <span style={{ fontWeight: 700, color: "oklch(0.40 0.21 255)" }}>@nor</span>
                <span style={{ display: "inline-block", width: 1.5, height: 13, background: "oklch(0.40 0.21 255)", verticalAlign: "text-bottom", marginLeft: 1 }} />
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "oklch(0.40 0.21 255)" }}>
                <SparkIcon /> Draft
              </span>
            </div>
          </div>

          {/* Right rail */}
          <div style={{ borderLeft: "1px solid oklch(0.93 0.004 250 / 0.7)", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Caps>Linked record</Caps>
              <div style={{ border: "1px solid oklch(0.92 0.005 250)", borderRadius: 11, padding: "10px 11px", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>PO-1042</p>
                  <StatusChip tone="active">OPEN</StatusChip>
                </div>
                <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "oklch(0.58 0.015 260)" }}>Nordic Steel · $18,400 · ETA slipping</p>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 10.5, color: "oklch(0.58 0.015 260)", lineHeight: 1.45 }}>
                Type <span style={{ fontWeight: 700, color: "oklch(0.40 0.21 255)" }}>@</span> in the composer to link any ERP record — POs, orders, invoices, SOPs, shipments.
              </p>
            </div>

            <AICard label="Suggested" actions={<><GhostPill>Not now</GhostPill><CTA>Draft PO</CTA></>}>
              Nordic Steel appears in 3 open threads with delivery concerns. Want me to draft a dual-source PO to Baltic Metals?
            </AICard>

            <div>
              <Caps>Pinned</Caps>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "6px 0", borderBottom: "1px solid oklch(0.95 0.003 250)" }}>
                <span style={{ color: "oklch(0.30 0.02 262)" }}>Run schedule v3</span>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>pdf</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "6px 0" }}>
                <span style={{ color: "oklch(0.30 0.02 262)" }}>Q3 throughput sheet</span>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>link</span>
              </div>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
