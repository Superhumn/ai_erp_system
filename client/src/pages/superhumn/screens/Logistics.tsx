import { useState, type ReactNode } from "react";
import { color as c, font } from "../tokens";
import {
  Frame,
  Sidebar,
  Main,
  Header,
  Segmented,
  StatusChip,
  MeterRow,
  AICard,
  Button,
  RightRail,
  Caps,
  type ChipTone,
} from "../primitives";

/* ------------------------------------------------------------------ types */

type View = "By run" | "By ingredient" | "By location";
type Fill = "dark" | "blue";

type RunBar = {
  name: string;
  po: string;
  left: number;
  width: number;
  fill: Fill;
  marker?: number;
  status: string;
  tone: ChipTone;
};
type RunGroup = { id: string; product: string; badge: string; pct: number; onDock: string; bars: RunBar[] };

type IngShip = {
  name: string;
  po: string;
  eta: string;
  loc: string;
  feeds: string;
  status: string;
  tone: ChipTone;
  border: boolean;
};
type IngGroup = { name: string; meta: string; pct: number; pctLabel: string; fill: Fill; ships: IngShip[] };

type LocShip = {
  name: string;
  po: string;
  eta: string;
  feeds: string;
  status: string;
  tone: ChipTone;
  border: boolean;
};
type LocGroup = { name: string; meta: string; pct: number; pctLabel: string; fill: Fill; ships: LocShip[] };

type KVRow = { label: string; value: string };

/* -------------------------------------------------------------- view meta */

const META: Record<View, { title: string; subtitle: string }> = {
  "By run": {
    title: "Inbound by production run",
    subtitle: "Ingredient shipments grouped by the run they feed",
  },
  "By ingredient": {
    title: "Inbound by ingredient",
    subtitle: "Coverage per ingredient · destination location on every shipment",
  },
  "By location": {
    title: "Inbound by location",
    subtitle: "Capacity and inbound shipments per warehouse location",
  },
};

/* -------------------------------------------------------------------- data */

const RUN_GROUPS: RunGroup[] = [
  {
    id: "RUN R-0847",
    product: "Oat Blend 500g · Line 2",
    badge: "RUN STARTS AUG 4",
    pct: 75,
    onDock: "3 of 4 on dock",
    bars: [
      { name: "Rolled oats · 2.4t", po: "PO-1038", left: 0, width: 20, fill: "dark", status: "ON DOCK", tone: "neutral" },
      { name: "Packaging film", po: "PO-1041", left: 8, width: 24, fill: "dark", status: "ON DOCK", tone: "neutral" },
      { name: "Cartons · 12k", po: "PO-1043", left: 16, width: 24, fill: "dark", status: "ON DOCK", tone: "neutral" },
      { name: "Oat groats · 1.1t", po: "PO-1042", left: 24, width: 52, fill: "blue", marker: 76, status: "ETA AUG 2", tone: "active" },
    ],
  },
  {
    id: "RUN R-0851",
    product: "Granola Clusters · Line 1",
    badge: "RUN STARTS AUG 11",
    pct: 33,
    onDock: "1 of 3 on dock",
    bars: [
      { name: "Honey · 800kg", po: "PO-1044", left: 12, width: 16, fill: "dark", status: "ON DOCK", tone: "neutral" },
      { name: "Almonds · 600kg", po: "PO-1046", left: 32, width: 36, fill: "blue", marker: 68, status: "IN TRANSIT", tone: "active" },
      { name: "Pouches · 8k", po: "PO-1047", left: 40, width: 40, fill: "blue", marker: 80, status: "PRODUCTION", tone: "neutral" },
    ],
  },
];

const RUN_SLIP: KVRow[] = [
  { label: "Run R-0847", value: "pushes to Aug 8" },
  { label: "Order BL-901 (Whole Foods)", value: "ships 2 days late" },
  { label: "Line 2 idle cost", value: "$3,800" },
];

const ING_GROUPS: IngGroup[] = [
  {
    name: "Rolled oats",
    meta: "on hand 3.1t · committed 2.8t",
    pct: 100,
    pctLabel: "112%",
    fill: "dark",
    ships: [
      { name: "Rolled oats · 2.4t", po: "PO-1038 · 4 pallets", eta: "On dock", loc: "Dock A", feeds: "feeds R-0847", status: "ON DOCK", tone: "neutral", border: true },
      { name: "Rolled oats · 1.2t", po: "PO-1049 · 2 pallets", eta: "Aug 12", loc: "Dry store 2", feeds: "feeds R-0855", status: "SCHEDULED", tone: "neutral", border: false },
    ],
  },
  {
    name: "Oat groats",
    meta: "on hand 0.4t · committed 1.5t",
    pct: 64,
    pctLabel: "64%",
    fill: "blue",
    ships: [
      { name: "Oat groats · 1.1t", po: "PO-1042 · 2 pallets", eta: "Aug 2", loc: "Dry store 1", feeds: "feeds R-0847", status: "IN TRANSIT", tone: "active", border: false },
    ],
  },
  {
    name: "Honey",
    meta: "on hand 1.9t · committed 2.0t",
    pct: 96,
    pctLabel: "96%",
    fill: "blue",
    ships: [
      { name: "Honey · 800kg", po: "PO-1044 · drums", eta: "On dock", loc: "Cold store", feeds: "feeds R-0851", status: "ON DOCK", tone: "neutral", border: true },
      { name: "Honey · 400kg", po: "PO-1050 · drums", eta: "Aug 15", loc: "Cold store", feeds: "feeds R-0858", status: "SCHEDULED", tone: "neutral", border: false },
    ],
  },
];

const ING_LOWEST: KVRow[] = [
  { label: "Oat groats", value: "64% · gap 1.1t" },
  { label: "Almonds", value: "71% · gap 180kg" },
  { label: "Pouches", value: "78% · gap 1.8k" },
];

const LOC_GROUPS: LocGroup[] = [
  {
    name: "Dock A",
    meta: "staging · 6 pallets free",
    pct: 88,
    pctLabel: "88%",
    fill: "dark",
    ships: [
      { name: "Rolled oats · 2.4t", po: "PO-1038 · 4 pallets", eta: "On dock", feeds: "feeds R-0847", status: "AWAITING PUTAWAY", tone: "neutral", border: false },
    ],
  },
  {
    name: "Dry store 1",
    meta: "48 rack slots · 18 free",
    pct: 62,
    pctLabel: "62%",
    fill: "blue",
    ships: [
      { name: "Oat groats · 1.1t", po: "PO-1042 · 2 pallets", eta: "Aug 2", feeds: "feeds R-0847", status: "IN TRANSIT", tone: "active", border: true },
      { name: "Almonds · 300kg", po: "PO-1046 · 1 pallet", eta: "Aug 8", feeds: "feeds R-0851", status: "SCHEDULED", tone: "neutral", border: false },
    ],
  },
  {
    name: "Dry store 2",
    meta: "48 rack slots · 28 free",
    pct: 41,
    pctLabel: "41%",
    fill: "blue",
    ships: [
      { name: "Rolled oats · 1.2t", po: "PO-1049 · 2 pallets", eta: "Aug 12", feeds: "feeds R-0855", status: "SCHEDULED", tone: "neutral", border: true },
      { name: "Pouches · 12k units", po: "PO-1051 · 3 pallets", eta: "Aug 5", feeds: "feeds R-0858", status: "IN TRANSIT", tone: "active", border: true },
      { name: "Cartons · 8k units", po: "PO-1053 · 2 pallets", eta: "Aug 19", feeds: "feeds R-0859", status: "SCHEDULED", tone: "neutral", border: false },
    ],
  },
  {
    name: "Cold store",
    meta: "2–8°C · 74% full",
    pct: 74,
    pctLabel: "74%",
    fill: "blue",
    ships: [
      { name: "Honey · 800kg", po: "PO-1044 · drums", eta: "On dock", feeds: "feeds R-0851", status: "AWAITING PUTAWAY", tone: "neutral", border: true },
      { name: "Honey · 400kg", po: "PO-1050 · drums", eta: "Aug 15", feeds: "feeds R-0858", status: "SCHEDULED", tone: "neutral", border: true },
      { name: "Dried apple · 250kg", po: "PO-1052 · 1 pallet", eta: "Aug 9", feeds: "feeds R-0855", status: "IN TRANSIT", tone: "active", border: false },
    ],
  },
];

const PUTAWAY_QUEUE: { name: string; sub: string; status: string; tone: ChipTone; border: boolean }[] = [
  { name: "PO-1038 → Dry store 1", sub: "4 pallets · Leo Grant", status: "ASSIGNED", tone: "active", border: true },
  { name: "PO-1044 → Cold store", sub: "drums · forklift 2", status: "QUEUED", tone: "neutral", border: true },
  { name: "Empty pallets → yard", sub: "release 6 from Dock A", status: "QUEUED", tone: "neutral", border: false },
];

const DOCK_SCHEDULE: KVRow[] = [
  { label: "08:00 · Unload PO-1038", value: "done" },
  { label: "11:30 · Putaway PO-1044", value: "forklift 2" },
  { label: "15:00 · Pallet release", value: "6 to yard" },
];

const ARRIVALS: KVRow[] = [
  { label: "Aug 2 · PO-1042", value: "Dry store 1" },
  { label: "Aug 5 · PO-1051", value: "Dry store 2" },
  { label: "Aug 8 · PO-1046", value: "Dry store 1" },
];

/* ------------------------------------------------------------- small bits */

function MapPin({ size = 9, stroke = c.muted, width = 2.4 }: { size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width}>
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

function LocPill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10.5,
        fontWeight: 600,
        color: "oklch(0.38 0.02 262)",
        background: "#fff",
        border: "1px solid oklch(0.92 0.005 250)",
        borderRadius: 6,
        padding: "2px 8px",
        flexShrink: 0,
      }}
    >
      <MapPin />
      {children}
    </span>
  );
}

function KV({ label, value, last }: { label: string; value: string; last: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        fontSize: 12,
        padding: "6px 0",
        borderBottom: last ? "none" : `1px solid ${c.rowSep}`,
      }}
    >
      <span style={{ color: "oklch(0.30 0.02 262)" }}>{label}</span>
      <span style={{ fontWeight: 600, whiteSpace: "nowrap", fontFamily: font.body }}>{value}</span>
    </div>
  );
}

function GroupTrack({ pct, fill }: { pct: number; fill: Fill }) {
  return (
    <div style={{ width: 110, height: 6, borderRadius: 9999, background: "oklch(0.92 0.005 250)", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 9999,
          background: fill === "dark" ? c.darkFill : c.blueGradBar,
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- By run */

function ByRun() {
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 24, marginTop: 10, minHeight: 0 }}>
      {/* Left: timeline */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 220, paddingRight: 96 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: c.faint,
            }}
          >
            <span>JUL 14</span>
            <span>JUL 21</span>
            <span>JUL 28</span>
            <span>AUG 4</span>
          </div>
        </div>

        {RUN_GROUPS.map((g) => (
          <div key={g.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 10px",
                background: c.groupHeader,
                borderRadius: 10,
                margin: "12px 0 4px",
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: font.display }}>{g.id}</span>
              <span style={{ fontSize: 12, color: c.ink3 }}>{g.product}</span>
              <StatusChip tone="active">{g.badge}</StatusChip>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <GroupTrack pct={g.pct} fill="blue" />
                <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{g.onDock}</span>
              </div>
            </div>

            {g.bars.map((b) => (
              <div
                key={b.po}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: `1px solid ${c.rowSep}`,
                }}
              >
                <div style={{ width: 210, flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{b.name}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10.5, color: c.muted3 }}>{b.po}</p>
                </div>
                <div style={{ flex: 1, position: "relative", height: 22 }}>
                  <div style={{ position: "absolute", inset: "8px 0", borderRadius: 9999, background: "oklch(0.965 0.003 250)" }} />
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      bottom: 8,
                      left: `${b.left}%`,
                      width: `${b.width}%`,
                      borderRadius: 9999,
                      background: b.fill === "dark" ? c.darkFill : c.blueGradBar,
                    }}
                  />
                  {b.marker !== undefined && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        left: `calc(${b.marker}% - 5px)`,
                        height: 14,
                        width: 2,
                        borderRadius: 2,
                        background: "oklch(0.40 0.21 255)",
                      }}
                    />
                  )}
                </div>
                <div style={{ width: 86, textAlign: "right", flexShrink: 0 }}>
                  <StatusChip tone={b.tone}>{b.status}</StatusChip>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Right rail: readiness */}
      <RightRail>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: font.display }}>RUN R-0847 readiness</p>
          <StatusChip tone="neutral">17 DAYS OUT</StatusChip>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke="oklch(0.93 0.005 250)" strokeWidth="8" />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="oklch(0.47 0.21 255)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="123 200"
              transform="rotate(-90 32 32)"
            />
            <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="oklch(0.16 0.025 262)" fontFamily="DM Sans">
              75%
            </text>
          </svg>
          <div>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>Ingredient coverage</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: c.muted }}>3 of 4 ingredients on dock</p>
          </div>
        </div>

        <AICard
          label="Risk"
          actions={
            <>
              <Button variant="secondary">Watch</Button>
              <Button variant="primary">Expedite quote</Button>
            </>
          }
        >
          Oat groats (PO-1042) ETA Aug 2 leaves a 2-day buffer before the Aug 4 run. Nordic Steel has slipped 2 of its last 5
          shipments — a 4-day slip stops Line 2.
        </AICard>

        <div>
          <Caps>If PO-1042 slips 4 days</Caps>
          {RUN_SLIP.map((r, i) => (
            <KV key={r.label} label={r.label} value={r.value} last={i === RUN_SLIP.length - 1} />
          ))}
        </div>
      </RightRail>
    </div>
  );
}

/* ---------------------------------------------------------- By ingredient */

function ByIngredient() {
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 24, marginTop: 10, minHeight: 0 }}>
      {/* Left: coverage per ingredient */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {ING_GROUPS.map((g) => (
          <div key={g.name}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 10px",
                background: c.groupHeader,
                borderRadius: 10,
                margin: "12px 0 4px",
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: font.display }}>{g.name}</span>
              <span style={{ fontSize: 11, color: c.ink3 }}>{g.meta}</span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <GroupTrack pct={g.pct} fill={g.fill} />
                <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{g.pctLabel}</span>
              </div>
            </div>

            {g.ships.map((s) => (
              <div
                key={s.po}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 4px",
                  borderBottom: s.border ? `1px solid ${c.rowSep}` : "none",
                }}
              >
                <div style={{ width: 190, flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{s.name}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10.5, color: c.muted3 }}>{s.po}</p>
                </div>
                <span style={{ width: 78, fontSize: 11.5, color: c.muted, flexShrink: 0 }}>{s.eta}</span>
                <LocPill>{s.loc}</LocPill>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: c.muted3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.feeds}
                </span>
                <StatusChip tone={s.tone}>{s.status}</StatusChip>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Right rail: capacity + putaway */}
      <RightRail>
        <div>
          <Caps>Warehouse capacity</Caps>
          <MeterRow label="Dock A" right="88% · 6 pallets free" value={88} />
          <MeterRow label="Dry store 1" right="62% full" value={62} marginTop={10} />
          <MeterRow label="Dry store 2" right="41% full" value={41} marginTop={10} />
          <MeterRow label="Cold store" right="74% full" value={74} marginTop={10} />
        </div>

        <AICard
          label="Putaway"
          actions={
            <>
              <Button variant="secondary">Change location</Button>
              <Button variant="primary">Create putaway task</Button>
            </>
          }
        >
          PO-1042 (2 pallets) is routed to Dry store 1 — closest to Line 2 staging. Dock A will exceed 95% when it lands; release 6
          empty pallets first.
        </AICard>

        <div style={{ marginTop: "auto" }}>
          <Caps>Lowest coverage</Caps>
          {ING_LOWEST.map((r, i) => (
            <KV key={r.label} label={r.label} value={r.value} last={i === ING_LOWEST.length - 1} />
          ))}
        </div>
      </RightRail>
    </div>
  );
}

/* ------------------------------------------------------------ By location */

function ByLocation() {
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 24, marginTop: 10, minHeight: 0 }}>
      {/* Left: capacity + inbound per warehouse */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {LOC_GROUPS.map((g) => (
          <div key={g.name}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 10px",
                background: c.groupHeader,
                borderRadius: 10,
                margin: "12px 0 4px",
              }}
            >
              <MapPin size={10} stroke="oklch(0.35 0.02 262)" width={2.2} />
              <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: font.display }}>{g.name}</span>
              <span style={{ fontSize: 11, color: c.ink3 }}>{g.meta}</span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <GroupTrack pct={g.pct} fill={g.fill} />
                <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{g.pctLabel}</span>
              </div>
            </div>

            {g.ships.map((s) => (
              <div
                key={s.po}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 4px",
                  borderBottom: s.border ? `1px solid ${c.rowSep}` : "none",
                }}
              >
                <div style={{ width: 190, flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{s.name}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10.5, color: c.muted3 }}>{s.po}</p>
                </div>
                <span style={{ width: 78, fontSize: 11.5, color: c.muted, flexShrink: 0 }}>{s.eta}</span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: c.muted3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.feeds}
                </span>
                <StatusChip tone={s.tone}>{s.status}</StatusChip>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Right rail: putaway queue, dock schedule, arrivals */}
      <RightRail>
        <div>
          <Caps>Putaway queue</Caps>
          {PUTAWAY_QUEUE.map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: r.border ? `1px solid ${c.rowSep}` : "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.name}
                </p>
                <p style={{ margin: "1px 0 0", fontSize: 10.5, color: c.muted3 }}>{r.sub}</p>
              </div>
              <StatusChip tone={r.tone}>{r.status}</StatusChip>
            </div>
          ))}
        </div>

        <AICard
          label="Putaway"
          actions={
            <>
              <Button variant="secondary">Change location</Button>
              <Button variant="primary">Create putaway task</Button>
            </>
          }
        >
          Dock A hits 95% when PO-1042 lands Aug 2. Moving PO-1038's 4 pallets to Dry store 1 today frees a third of the dock before
          the truck arrives.
        </AICard>

        <div>
          <Caps>Dock schedule today</Caps>
          {DOCK_SCHEDULE.map((r, i) => (
            <KV key={r.label} label={r.label} value={r.value} last={i === DOCK_SCHEDULE.length - 1} />
          ))}
        </div>

        <div style={{ marginTop: "auto" }}>
          <Caps>Arrivals this week</Caps>
          {ARRIVALS.map((r, i) => (
            <KV key={r.label} label={r.label} value={r.value} last={i === ARRIVALS.length - 1} />
          ))}
        </div>
      </RightRail>
    </div>
  );
}

/* --------------------------------------------------------------- Screen */

export default function Logistics() {
  const [view, setView] = useState<View>("By run");
  const meta = META[view];

  return (
    <Frame label="Logistics" height={680}>
      <Sidebar active="Logistics" />
      <Main>
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          right={
            <Segmented
              options={["By run", "By ingredient", "By location"]}
              value={view}
              onChange={(v) => setView(v as View)}
            />
          }
        />
        {view === "By run" && <ByRun />}
        {view === "By ingredient" && <ByIngredient />}
        {view === "By location" && <ByLocation />}
      </Main>
    </Frame>
  );
}
