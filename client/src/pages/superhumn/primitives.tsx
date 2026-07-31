/**
 * Superhumn ERP — shared design primitives.
 *
 * Faithful, reusable building blocks for the canonical screens. Values match
 * the design handoff tokens exactly. Inline style objects are used
 * deliberately: the handoff is high-fidelity with every value readable off the
 * element, and inline styles keep each primitive self-contained and scoped.
 */
import React from "react";
import { color as c, shadow, font, tabular, microCaps } from "./tokens";

/* ------------------------------------------------------------------ Frame */

export function Frame({
  label,
  height = 680,
  children,
}: {
  label: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      data-screen-label={label}
      style={{
        width: 1360,
        height,
        background: c.frame,
        border: `1px solid ${c.border}`,
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        boxShadow: shadow.frame,
        fontFamily: font.body,
        color: c.ink,
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Sidebar */

export type NavGroup = { label: string; items: (string | { label: string; badge?: string })[] };

/** Canonical nav shown in the design (Home 14a). Groups are label-only —
 *  this is the design reference sidebar, distinct from the app's locked nav. */
export const CANONICAL_NAV: NavGroup[] = [
  { label: "Overview", items: ["Home", "Projects", "Meetings", "Messaging"] },
  { label: "Sales", items: ["Orders", "CRM", "Marketing", "CX"] },
  { label: "Finance", items: ["Finance", "Grants", "Fundraising", "Investors", "Data Rooms"] },
  { label: "Operations", items: ["Inventory", "Manufacturing", "Procurement", "Logistics"] },
  { label: "People", items: ["HR", "Recruiting", "Legal"] },
  { label: "Workspace", items: ["SOPs", "Import", "EDI"] },
];

export function Sidebar({
  active,
  groups = CANONICAL_NAV,
  user = "Alex",
}: {
  active: string;
  groups?: NavGroup[];
  user?: string;
}) {
  return (
    <div
      style={{
        width: 110,
        boxSizing: "border-box",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${c.divider}`,
        background: c.sidebar,
        padding: "12px 6px",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px" }}>
        <div
          style={{
            height: 22,
            width: 22,
            borderRadius: 7,
            background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.42 0.21 255))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: 12,
            fontFamily: font.display,
          }}
        >
          S
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>
          superhumn
        </span>
      </div>

      {/* Groups */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {groups.map((g) => (
          <div key={g.label}>
            <p style={{ ...microCaps(9), padding: "0 8px", marginBottom: 2 }}>{g.label}</p>
            {g.items.map((raw) => {
              const item = typeof raw === "string" ? { label: raw } : raw;
              const isActive = item.label === active;
              if (isActive) {
                return (
                  <div
                    key={item.label}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 8,
                      background: "#fff",
                      color: c.blueText,
                      fontSize: 12.5,
                      fontWeight: 600,
                      boxShadow: shadow.card,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 5,
                        bottom: 5,
                        width: 3,
                        borderRadius: 2,
                        background: c.blue,
                      }}
                    />
                    {item.label}
                  </div>
                );
              }
              return (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    fontSize: 12.5,
                    color: c.ink2,
                  }}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        background: c.blue,
                        borderRadius: 9999,
                        padding: "1px 6px",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* User chip */}
      <div
        style={{
          borderTop: `1px solid ${c.divider}`,
          paddingTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 6,
        }}
      >
        <div
          style={{
            height: 24,
            width: 24,
            borderRadius: 9999,
            background: c.blueTint,
            color: c.blueText,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {user[0]}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{user}</p>
      </div>
    </div>
  );
}

/** Main content column (flex, padding 14px 22px per the layout system). */
export function Main({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        padding: "14px 22px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Header */

export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            fontFamily: font.display,
          }}
        >
          {title}
        </h2>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 12, color: c.muted3 }}>{subtitle}</p>}
      </div>
      {right && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ KPIs */

export type Kpi = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  highlight?: boolean; // blue number = the "needs-you" metric
  spark?: React.ReactNode;
};

export function KpiStrip({ items, marginTop = 14 }: { items: Kpi[]; marginTop?: number }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "stretch", marginTop }}>
        {items.map((k, i) => (
          <React.Fragment key={k.label}>
            {i > 0 && (
              <div
                style={{
                  width: 1,
                  background: `linear-gradient(180deg, transparent, ${c.border}, transparent)`,
                }}
              />
            )}
            <div
              style={{
                flex: 1,
                padding: "0 16px",
                paddingLeft: i === 0 ? 0 : 16,
                paddingRight: i === items.length - 1 ? 0 : 16,
              }}
            >
              <p style={microCaps(10)}>{k.label}</p>
              <p
                style={{
                  margin: "5px 0 0",
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  fontFamily: font.display,
                  color: k.highlight ? c.blueText : c.ink,
                  ...tabular,
                }}
              >
                {k.value}
              </p>
              {k.spark && <div style={{ marginTop: 6 }}>{k.spark}</div>}
              {k.sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: c.muted2 }}>{k.sub}</p>}
            </div>
          </React.Fragment>
        ))}
      </div>
      <HDivider marginTop={12} />
    </>
  );
}

/* -------------------------------------------------------------- Dividers */

export function HDivider({ marginTop = 0 }: { marginTop?: number }) {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${c.border} 15%, ${c.border} 85%, transparent)`,
        marginTop,
      }}
    />
  );
}

/* ------------------------------------------------------------ StatusChip */

export type ChipTone = "neutral" | "active" | "draft" | "dark";

export function StatusChip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: ChipTone }) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    borderRadius: 9999,
    padding: "2px 9px",
    whiteSpace: "nowrap",
  };
  const tones: Record<ChipTone, React.CSSProperties> = {
    neutral: { color: c.ink2, background: c.chip },
    active: { color: c.blueText, background: c.blueTint },
    draft: { color: c.ink2, background: "#fff", border: `1px solid ${c.border}` },
    dark: { color: "#fff", background: c.darkChip },
  };
  return <span style={{ ...base, ...tones[tone] }}>{children}</span>;
}

/* ------------------------------------------------------------------ Meter */

export function Meter({ value, height = 7 }: { value: number; height?: number }) {
  const dark = value >= 85;
  return (
    <div style={{ height, borderRadius: 9999, background: c.track, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${Math.min(value, 100)}%`,
          borderRadius: 9999,
          background: dark ? c.darkFill : c.blueGradBar,
        }}
      />
    </div>
  );
}

export function MeterRow({
  label,
  right,
  value,
  marginTop = 0,
}: {
  label: React.ReactNode;
  right?: React.ReactNode;
  value: number;
  marginTop?: number;
}) {
  return (
    <div style={{ marginTop }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {right && <span style={{ color: c.muted }}>{right}</span>}
      </div>
      <Meter value={value} />
    </div>
  );
}

/* -------------------------------------------------------------- Sparkline */

export function Sparkline({
  points,
  width = 56,
  height = 18,
  accent = false,
}: {
  points: number[];
  width?: number;
  height?: number;
  accent?: boolean;
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1 || 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / span) * (height - 2) - 1;
    return [x, y] as const;
  });
  const d = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const stroke = accent ? c.blue : c.muted;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <polyline points={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={c.blue} />
    </svg>
  );
}

/* -------------------------------------------------------------- AI card */

export function SparkIcon({ size = 11, fill = c.blueText }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
    </svg>
  );
}

export function AICard({
  label = "AI insight",
  children,
  actions,
}: {
  label?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid oklch(0.47 0.21 255 / 0.20)",
        background: "linear-gradient(180deg, oklch(0.985 0.01 258), #fff)",
        borderRadius: 12,
        padding: "11px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <SparkIcon />
        <span style={{ ...microCaps(9, c.blueText), letterSpacing: "0.12em" }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: "oklch(0.34 0.02 262)", lineHeight: 1.5 }}>{children}</p>
      {actions && <div style={{ display: "flex", gap: 6, marginTop: 9 }}>{actions}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Buttons */

export function Button({
  children,
  variant = "secondary",
  onClick,
  style,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 30,
    padding: "0 14px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    whiteSpace: "nowrap",
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { color: "#fff", background: c.blueGrad, boxShadow: shadow.cta },
    secondary: { color: c.ink, background: "#fff", border: `1px solid ${c.border}` },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

/** Large gradient CTA pill (34px) used in headers. */
export function CTA({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 34,
        padding: "0 16px",
        borderRadius: 9999,
        fontSize: 12.5,
        fontWeight: 600,
        color: "#fff",
        background: c.blueGrad,
        cursor: "pointer",
        boxShadow: shadow.cta,
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------- Segmented control */

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", background: c.seg, borderRadius: 9999, padding: 3 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <span
            key={o}
            onClick={() => onChange?.(o)}
            style={{
              fontSize: 12,
              fontWeight: on ? 600 : 500,
              color: on ? c.ink : c.muted,
              background: on ? "#fff" : "transparent",
              borderRadius: 9999,
              padding: "5px 14px",
              boxShadow: on ? shadow.pill : "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {o}
          </span>
        );
      })}
    </div>
  );
}

/** The ⌘K "Ask or search anything" pill shown in headers. */
export function AskBar() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 14px",
        borderRadius: 9999,
        fontSize: 12,
        color: c.muted,
        background: "#fff",
        border: `1px solid ${c.border}`,
        boxShadow: "0 1px 3px rgba(15,25,70,0.05)",
      }}
    >
      Ask or search anything
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: c.ink3,
          background: c.seg,
          borderRadius: 5,
          padding: "2px 6px",
        }}
      >
        ⌘K
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- Tables */

export function Th({ children, align = "left", width }: { children?: React.ReactNode; align?: "left" | "right"; width?: number | string }) {
  return (
    <th
      style={{
        ...microCaps(9),
        textAlign: align,
        padding: "0 0 6px",
        borderBottom: `1px solid ${c.border}`,
        width,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  style,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) {
  return (
    <td style={{ padding: "7px 0", fontSize: 12, textAlign: align, verticalAlign: "middle", ...style }}>{children}</td>
  );
}

export function Tr({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
  return (
    <tr className="shumn-row" style={{ borderBottom: last ? "none" : `1px solid ${c.rowSep}` }}>
      {children}
    </tr>
  );
}

/** First-column item cell: bold name + muted sub-line. */
export function ItemCell({ name, sub }: { name: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <td style={{ padding: "7px 0" }}>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{name}</p>
      {sub && <p style={{ margin: "1px 0 0", fontSize: 10.5, color: c.muted3 }}>{sub}</p>}
    </td>
  );
}

/* ------------------------------------------------------------- SidePanel */

/** In-flow glass side panel (pushes content — never a centered/dimmed modal). */
export function SidePanel({
  width = 320,
  children,
  glass = true,
}: {
  width?: number;
  children: React.ReactNode;
  glass?: boolean;
}) {
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        borderLeft: `1px solid ${c.divider}`,
        background: glass ? "rgba(255,255,255,0.72)" : "#fff",
        backdropFilter: glass ? "blur(24px)" : undefined,
        WebkitBackdropFilter: glass ? "blur(24px)" : undefined,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

/** Right rail column: 1px left border + 18px left padding (per layout system). */
export function RightRail({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderLeft: `1px solid oklch(0.93 0.004 250 / 0.7)`,
        paddingLeft: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Micro-caps section label used throughout the right rail + lists. */
export function Caps({ children, marginTop = 0, marginBottom = 6 }: { children: React.ReactNode; marginTop?: number; marginBottom?: number }) {
  return <p style={{ ...microCaps(10), letterSpacing: "0.1em", marginTop, marginBottom }}>{children}</p>;
}
