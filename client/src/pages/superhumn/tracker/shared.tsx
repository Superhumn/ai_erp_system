/**
 * Project tracker — chrome shared by the 1A–1E frames: frame + sidebar,
 * header bar, saved-view pills, bulk-edit bar with the keyboard legend, and
 * the AI suggestion strip. All read/write the shared store.
 */
import React from "react";
import {
  color as c,
  font,
  shadow,
  type as T,
  blueTint,
  radius,
} from "../tokens";
import {
  Frame,
  Sidebar,
  Toast,
  Pill,
  Kbd,
  SparkIcon,
  BUTTON_RESET,
} from "../primitives";
import { SAVED_VIEWS } from "./data";
import { trackerStore as store, type Pane } from "./store";
import { useTracker, useTrackerKeyboard } from "./useTracker";

export const TRACKER_W = 1792;
export const SIDEBAR_W = 128;

/** Dense frame: 1792 wide, 128px sidebar, `8px 12px` main padding, toast slot. */
export function TrackerFrame({
  label,
  height,
  pane,
  children,
  padded = true,
}: {
  label: string;
  height: number;
  pane?: Pane;
  children: React.ReactNode;
  padded?: boolean;
}) {
  useTrackerKeyboard();
  const { toast, activeFrame } = useTracker();
  return (
    <Frame
      label={label}
      width={TRACKER_W}
      height={height}
      onMouseEnter={() => {
        store.setActiveFrame(label);
        if (pane) store.setPane(pane);
      }}
    >
      <Sidebar active="Projects" width={SIDEBAR_W} />
      <div
        onFocusCapture={() => {
          store.setActiveFrame(label);
          if (pane) store.setPane(pane);
        }}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          padding: padded ? "8px 12px" : 0,
        }}
      >
        {children}
      </div>
      {/* One toast slot: only the frame the pointer is in shows it. */}
      {activeFrame === label && <Toast message={toast} />}
    </Frame>
  );
}

/** Header bar (32px prototype → ~45px): title 18/700 DM Sans + 11px sub. */
export function TrackerHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 22,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: T.title,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            fontFamily: font.display,
          }}
        >
          {title}
        </h2>
        <p style={{ margin: "2px 0 0", fontSize: T.micro, color: c.muted3 }}>
          {sub}
        </p>
      </div>
      {right && (
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {right}
        </div>
      )}
    </div>
  );
}

/** Four saved-view pills; `1`–`4` switch them. Selected = solid blue. */
export function SavedViewPills() {
  const { savedView } = useTracker();
  return (
    <div
      style={{ display: "flex", gap: 6 }}
      role="group"
      aria-label="Saved views"
    >
      {SAVED_VIEWS.map((v, i) => {
        const on = v.key === savedView;
        return (
          <button
            key={v.key}
            type="button"
            title={v.hint}
            aria-pressed={on}
            onClick={() => store.setSavedView(v.key)}
            style={{
              ...BUTTON_RESET,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              height: 27,
              padding: "0 11px",
              borderRadius: radius.pill,
              fontSize: T.body,
              fontWeight: on ? 700 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              color: on ? "#fff" : c.ink2,
              background: on ? c.blue : "#fff",
              border: `1px solid ${on ? c.blue : c.border}`,
              transition: "background-color 120ms ease, color 120ms ease",
              boxSizing: "border-box",
            }}
          >
            {v.label}
            <span style={{ opacity: 0.55, fontWeight: 600 }}>{i + 1}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control at tracker density (13px, `4px 13px`). Native buttons
 *  with `aria-pressed` so it is keyboard-operable. */
export function SegmentedDense<Tv extends string>({
  options,
  value,
  onChange,
}: {
  options: Tv[];
  value: Tv;
  onChange?: (v: Tv) => void;
}) {
  return (
    <div
      role="group"
      style={{
        display: "flex",
        background: c.sunken,
        borderRadius: radius.pill,
        padding: 4,
      }}
    >
      {options.map(o => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange?.(o)}
            style={{
              ...BUTTON_RESET,
              fontSize: T.body,
              fontWeight: on ? 600 : 500,
              color: on ? c.ink : c.muted,
              background: on ? "#fff" : "transparent",
              borderRadius: radius.pill,
              padding: "4px 13px",
              boxShadow: on ? shadow.pill : "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background-color 120ms ease",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** `+ Task` header CTA (24px prototype → 34px). */
export function AddTaskCTA() {
  return (
    <Pill variant="primary" size="md" glow onClick={() => store.addTask()}>
      + Task
    </Pill>
  );
}

/** The ⌘K ask pill at tracker density. */
export function AskPill() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 11,
        height: 34,
        padding: "0 13px",
        borderRadius: radius.pill,
        fontSize: T.body,
        color: c.muted,
        background: "#fff",
        border: `1px solid ${c.border}`,
      }}
    >
      Ask or search anything
      <span
        style={{
          fontSize: T.micro,
          fontWeight: 700,
          color: c.ink3,
          background: c.sunken,
          borderRadius: 7,
          padding: "1px 7px",
        }}
      >
        ⌘K
      </span>
    </span>
  );
}

/**
 * Bulk-edit bar. Empty selection → keyboard legend; otherwise `<count>` in
 * blue then Complete (solid) · Push 3d · Reassign → Elena · Clear. The AI
 * suggestion strip sits on the right: verb → text → Accept y → Skip n → count.
 */
export function BulkBar() {
  const { sel, suggestions } = useTracker();
  const ids = Object.keys(sel);
  const s0 = suggestions[0];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 7,
        padding: "4px 10px",
        borderRadius: radius.cardSm,
        background: c.groupHeader,
        border: `1px solid ${c.borderLight}`,
        minHeight: 35,
        boxSizing: "border-box",
      }}
    >
      {ids.length > 0 ? (
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{ fontSize: T.body, fontWeight: 700, color: c.blueText }}
          >
            {ids.length} selected
          </span>
          <Pill
            variant="solid"
            size="xs"
            onClick={() => store.bulkComplete(ids)}
          >
            Complete
          </Pill>
          <Pill
            variant="secondary"
            size="xs"
            onClick={() => store.shiftDays(ids, 3)}
          >
            Push 3d
          </Pill>
          <Pill
            variant="secondary"
            size="xs"
            onClick={() => store.bulkOwner(ids, "Elena")}
          >
            Reassign → Elena
          </Pill>
          <Pill variant="text" size="xs" onClick={() => store.clearSel()}>
            Clear
          </Pill>
        </span>
      ) : (
        <span
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: T.micro,
            color: c.muted,
          }}
        >
          <Kbd>j k</Kbd>move<Kbd>x</Kbd>done<Kbd>space</Kbd>select<Kbd>e</Kbd>
          owner<Kbd>d</Kbd>+3d<Kbd>a</Kbd>add
        </span>
      )}
      <span style={{ flex: 1 }} />
      {s0 && (
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SparkIcon size={13} />
          <span
            style={{
              fontSize: T.body,
              fontWeight: 700,
              color: c.blueText,
              whiteSpace: "nowrap",
            }}
          >
            {s0.verb}
          </span>
          <span
            style={{ fontSize: T.body, color: c.inkSoft, whiteSpace: "nowrap" }}
            title={s0.why}
          >
            {s0.text}
          </span>
          <Pill
            variant="solid"
            size="xs"
            onClick={() => store.acceptSuggestion(s0)}
          >
            Accept y
          </Pill>
          <Pill
            variant="secondary"
            size="xs"
            onClick={() => store.rejectSuggestion(s0)}
          >
            Skip n
          </Pill>
          <span
            style={{ fontSize: T.micro, color: c.muted3, whiteSpace: "nowrap" }}
          >
            {suggestions.length} queued
          </span>
        </span>
      )}
    </div>
  );
}

/** Right rail: 1px left rule + 11px left padding, 7px gap. */
export function Rail({
  width,
  children,
  style,
}: {
  width: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 7,
        borderLeft: `1px solid oklch(0.93 0.004 250 / 0.7)`,
        paddingLeft: 11,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Soft gradient rule used between rail sections. */
export function RailRule() {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${c.border} 15%, ${c.border} 85%, transparent)`,
      }}
    />
  );
}

/** Key/value line in a detail panel (label column 81 or 87 wide). */
export function KV({
  k,
  children,
  labelWidth = 81,
  last = false,
}: {
  k: string;
  children: React.ReactNode;
  labelWidth?: number;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        fontSize: T.body,
        padding: "3px 0",
        borderBottom: last ? "none" : `1px solid ${c.rowSep}`,
      }}
    >
      <span style={{ width: labelWidth, color: c.muted3, flexShrink: 0 }}>
        {k}
      </span>
      {children}
    </div>
  );
}

export const tintBg = (a: number) => blueTint(a);
