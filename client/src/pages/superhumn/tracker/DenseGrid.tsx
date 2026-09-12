/**
 * 1E — Dense grid (recommended secondary). All tasks, no scroll, in two
 * side-by-side grids: checkbox · task · project · owner · due · status ·
 * record. Click a status or owner cell to edit inline. Same row rhythm as 1A.
 */
import React from "react";
import {
  color as c,
  type as T,
  blueTint,
  radius,
  shadow,
  font,
} from "../tokens";
import {
  Eyebrow,
  Pill,
  LinkChip,
  Check,
  AICardDense,
  dateStyle,
  labelStyle,
  ThinBar,
} from "../primitives";
import {
  OWNERS,
  PROJ,
  SHORT,
  STATUS_LABEL,
  STATUS_ORDER,
  type Status,
  type Task,
} from "./data";
import { trackerStore as store } from "./store";
import { useTracker } from "./useTracker";
import {
  TrackerFrame,
  TrackerHeader,
  SavedViewPills,
  AddTaskCTA,
  BulkBar,
  KV,
} from "./shared";
import { dateKindOf } from "./PriorityQueue";

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "0 0 4px",
  borderBottom: `1px solid ${c.border}`,
  fontSize: T.micro,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: c.muted3,
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "3px 0",
  lineHeight: 1,
  fontSize: T.body,
  verticalAlign: "middle",
};

function statusChip(s: Status): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    fontSize: T.micro,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    borderRadius: radius.pill,
    padding: "1px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background-color 120ms ease",
  };
  if (s === "in_progress")
    return { ...base, color: c.blueText, background: blueTint(0.12) };
  if (s === "review")
    return {
      ...base,
      color: c.ink,
      background: "#fff",
      border: `1px solid ${c.border}`,
    };
  return { ...base, color: c.ink2, background: c.chip };
}

const POPOVER: React.CSSProperties = {
  position: "absolute",
  zIndex: 5,
  top: 26,
  left: 0,
  background: "#fff",
  border: `1px solid ${c.border}`,
  borderRadius: radius.cardSm,
  boxShadow: shadow.popover,
  padding: 4,
  display: "flex",
  flexDirection: "column",
  minWidth: 130,
};

function Row({ t }: { t: Task }) {
  const { cursor, sel, editing } = useTracker();
  const done = store.isDone(t);
  const st = store.statusOf(t);
  const who = store.ownerOf(t);
  const today = t.dueLabel === "today";
  const isCursor = cursor === t.id;
  const editingStatus = editing?.id === t.id && editing.field === "status";
  const editingOwner = editing?.id === t.id && editing.field === "owner";
  const select = () => store.selectRow(t.id);
  return (
    <tr
      onClick={e => store.rowClick(t.id, e)}
      style={{
        borderBottom: `1px solid ${c.rowSepSoft}`,
        background: sel[t.id]
          ? blueTint(0.14)
          : isCursor
            ? blueTint(0.08)
            : "transparent",
        boxShadow: isCursor ? `inset 2px 0 0 ${c.blue}` : "none",
        cursor: "pointer",
        transition: "background-color 120ms ease",
        height: 26,
      }}
    >
      <td style={{ ...TD, width: 28 }}>
        <Check
          done={done}
          today={today}
          size={17}
          onClick={() => store.toggle(t.id)}
        />
      </td>
      <td
        style={{
          ...TD,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 280,
        }}
        onClick={select}
      >
        <span
          style={{
            ...labelStyle({ done, today, blocked: !!t.blocked }),
            display: "inline",
          }}
        >
          {t.label}
        </span>
      </td>
      <td style={{ ...TD, color: c.muted2 }} onClick={select}>
        {SHORT[t.pk]}
      </td>
      <td style={{ ...TD, position: "relative" }}>
        <span
          style={{
            fontWeight: 600,
            cursor: "pointer",
            borderBottom: "1px dashed oklch(0.88 0.008 250)",
          }}
          onClick={e => {
            e.stopPropagation();
            store.editCell(t.id, "owner");
          }}
        >
          {who}
        </span>
        {editingOwner && (
          <span style={POPOVER} onClick={e => e.stopPropagation()}>
            {OWNERS.map(o => (
              <span
                key={o}
                onClick={() => store.setOwner(t.id, o)}
                style={{
                  padding: "4px 13px",
                  fontSize: T.body,
                  fontWeight: o === who ? 600 : 500,
                  color: o === who ? c.blueText : c.inkMid,
                  cursor: "pointer",
                }}
              >
                {o}
              </span>
            ))}
          </span>
        )}
      </td>
      <td style={{ ...TD, textAlign: "right" }} onClick={select}>
        {t.blocked ? (
          <span
            style={{ fontSize: T.micro, color: c.faint3, whiteSpace: "nowrap" }}
          >
            {t.dueLabel || "—"}
          </span>
        ) : (
          <span
            style={{ ...dateStyle(dateKindOf(t)), display: "inline-block" }}
          >
            {t.dueLabel}
          </span>
        )}
      </td>
      <td style={{ ...TD, padding: "3px 0 3px 14px", position: "relative" }}>
        <span
          style={statusChip(st)}
          onClick={e => {
            e.stopPropagation();
            store.editCell(t.id, "status");
          }}
        >
          {STATUS_LABEL[st]}
        </span>
        {editingStatus && (
          <span
            style={{ ...POPOVER, left: 14, minWidth: 146 }}
            onClick={e => e.stopPropagation()}
          >
            {STATUS_ORDER.map(o => (
              <span
                key={o}
                onClick={() => store.setStatus(t.id, o)}
                style={{
                  padding: "4px 13px",
                  fontSize: T.body,
                  fontWeight: o === st ? 600 : 500,
                  color: o === st ? c.blueText : c.inkMid,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_LABEL[o]}
              </span>
            ))}
          </span>
        )}
      </td>
      <td style={TD} onClick={select}>
        {t.link && <LinkChip>{t.link}</LinkChip>}
      </td>
    </tr>
  );
}

function Grid({ rows }: { rows: Task[] }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 28 }} />
            <th style={TH}>Task</th>
            <th style={{ ...TH, width: 87 }}>Project</th>
            <th style={{ ...TH, width: 62 }}>Owner</th>
            <th style={{ ...TH, width: 62, textAlign: "right" }}>Due</th>
            <th style={{ ...TH, width: 98, paddingLeft: 14 }}>Status</th>
            <th style={{ ...TH, width: 76 }}>Record</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <Row key={t.id} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectFoot({
  name,
  tag,
  dark,
  value,
  fill,
  sub,
}: {
  name: string;
  tag: React.ReactNode;
  dark?: boolean;
  value: number;
  fill?: string;
  sub: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontSize: T.body,
            fontWeight: 700,
            fontFamily: font.display,
          }}
        >
          {name}
        </span>
        {tag}
      </div>
      <div style={{ marginTop: 4 }}>
        <ThinBar value={value} dark={dark} height={6} fill={fill} />
      </div>
      <p style={{ margin: "4px 0 0", fontSize: T.micro, color: c.muted3 }}>
        {sub}
      </p>
    </div>
  );
}

const DarkTag = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      fontSize: T.micro,
      fontWeight: 700,
      color: "#fff",
      background: c.darkChip,
      borderRadius: 5,
      padding: "0 6px",
    }}
  >
    {children}
  </span>
);
const FaintTag = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: T.micro, color: c.muted3 }}>{children}</span>
);

export default function DenseGrid() {
  const st = useTracker();
  const openCount = st.tasks.filter(t => !store.isDone(t)).length;
  const blockedCount = st.tasks.filter(
    t => t.blocked && !store.isDone(t)
  ).length;
  const half = Math.ceil(st.tasks.length / 2) + 1; // 12 / 10 split on the seeded 22
  const left = st.tasks.slice(0, half);
  const right = st.tasks.slice(half);
  const selected = st.tasks.find(t => t.id === st.gSel) ?? null;
  const openIn = (pk: keyof typeof PROJ) =>
    st.tasks.filter(t => t.pk === pk && !store.isDone(t)).length;
  const blockedIn = (pk: keyof typeof PROJ) =>
    st.tasks.filter(t => t.pk === pk && t.blocked && !store.isDone(t)).length;
  const selIds = Object.keys(st.sel);
  const targets = selIds.length ? selIds : selected ? [selected.id] : [];

  return (
    <TrackerFrame label="1E Dense grid" height={680} pane="1E" padded={false}>
      <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            padding: "8px 12px",
          }}
        >
          <TrackerHeader
            title="All tasks"
            sub={`${openCount} open · ${blockedCount} blocked · sorted by due date`}
            right={
              <>
                <SavedViewPills />
                <Pill
                  variant="secondary"
                  size="md"
                  onClick={() => store.flash("Filters coming to the grid")}
                >
                  Filter
                </Pill>
                <AddTaskCTA />
              </>
            }
          />
          <BulkBar />
          <div
            style={{
              flex: 1,
              marginTop: 7,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Grid rows={left} />
              <Grid rows={right} />
            </div>
            <div
              style={{
                display: "flex",
                gap: 14,
                marginTop: 8,
                paddingTop: 6,
                borderTop: `1px solid ${c.border}`,
              }}
            >
              <ProjectFoot
                name={PROJ.Q3.name}
                tag={<FaintTag>{openIn("Q3")} open</FaintTag>}
                value={PROJ.Q3.percent}
                sub={`${PROJ.Q3.spent} / ${PROJ.Q3.budget} · due ${PROJ.Q3.due}`}
              />
              <ProjectFoot
                name={PROJ.FDA.name}
                tag={<DarkTag>{blockedIn("FDA")} blocked</DarkTag>}
                value={PROJ.FDA.percent}
                dark
                sub={`${PROJ.FDA.spent} / ${PROJ.FDA.budget} · due ${PROJ.FDA.due}`}
              />
              <ProjectFoot
                name={PROJ.SHOP.name}
                tag={<FaintTag>{openIn("SHOP")} open</FaintTag>}
                value={PROJ.SHOP.percent}
                sub={`${PROJ.SHOP.spent} / ${PROJ.SHOP.budget} · due ${PROJ.SHOP.due}`}
              />
              <ProjectFoot
                name={PROJ.REISHI.name}
                tag={<DarkTag>on hold</DarkTag>}
                value={PROJ.REISHI.percent}
                fill={c.border}
                sub="waiting 11d on Fresh Farms COA"
              />
            </div>
          </div>
        </div>

        <div
          style={{
            width: 302,
            flexShrink: 0,
            borderLeft: "1px solid oklch(0.93 0.004 250 / 0.6)",
            background: "#fff",
            padding: "8px 11px",
            display: "flex",
            flexDirection: "column",
            gap: 7,
            overflow: "hidden",
          }}
        >
          {selected && (
            <>
              <div>
                <Eyebrow tracking="0.12em" style={{ marginBottom: 6 }}>
                  Row detail
                </Eyebrow>
                <p
                  style={{
                    margin: 0,
                    fontSize: T.cardTitle,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    fontFamily: font.display,
                    lineHeight: 1.25,
                  }}
                >
                  {selected.label}
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: T.body,
                    color: c.muted2,
                  }}
                >
                  {PROJ[selected.pk].name} · {store.ownerOf(selected)}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <KV k="Record">
                  <span style={{ fontWeight: 600, color: c.blueText }}>
                    {selected.link || "—"}
                  </span>
                </KV>
                <KV k="Type">
                  <span>{selected.linkKind || "—"}</span>
                </KV>
                <KV k="Origin" last={!selected.blocked}>
                  <span>{selected.source}</span>
                </KV>
                {selected.blocked && (
                  <KV k="Waiting" last>
                    <span style={{ fontWeight: 600 }}>{selected.waiting}</span>
                  </KV>
                )}
              </div>
              <div>
                <Eyebrow tracking="0.12em" style={{ marginBottom: 4 }}>
                  Bulk actions
                </Eyebrow>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  <Pill
                    variant="secondary"
                    size="xs"
                    style={{ height: 29 }}
                    onClick={() => store.bulkOwner(targets, "Elena")}
                  >
                    Reassign
                  </Pill>
                  <Pill
                    variant="secondary"
                    size="xs"
                    style={{ height: 29 }}
                    onClick={() => {
                      store.shiftDays(targets, 3);
                      store.flash("Pushed 3 days");
                    }}
                  >
                    Shift dates +3d
                  </Pill>
                  <Pill
                    variant="secondary"
                    size="xs"
                    style={{ height: 29 }}
                    onClick={() => store.flash("CSV exported")}
                  >
                    Export CSV
                  </Pill>
                </div>
              </div>
              <AICardDense label="AI upkeep" style={{ marginTop: "auto" }}>
                Two rows were created from documents this week and one closed
                itself on a QuickBooks match. Origins stay in the grid so every
                AI-made row is auditable.
              </AICardDense>
            </>
          )}
        </div>
      </div>
    </TrackerFrame>
  );
}
