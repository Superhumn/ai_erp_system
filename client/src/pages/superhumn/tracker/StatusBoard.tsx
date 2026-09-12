/**
 * 1C — Status board. Todo / In progress / Review / Done columns grouped by
 * a segmented control; ‹ › on a card moves it between columns (writes
 * `status`). Selected card details in a glass right panel.
 */
import React, { useState } from "react";
import {
  color as c,
  type as T,
  blueTint,
  radius,
  shadow,
  font,
} from "../tokens";
import { Eyebrow, Pill, LinkChip } from "../primitives";
import { PROJ, SHORT, STATUS_LABEL, type Status, type Task } from "./data";
import { trackerStore as store } from "./store";
import { useTracker } from "./useTracker";
import {
  TrackerFrame,
  TrackerHeader,
  SegmentedDense,
  AddTaskCTA,
  KV,
} from "./shared";

const COLS: { key: Status; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];
const MAX_CARDS = 9;
type GroupBy = "Status" | "Project" | "Assignee";

function Card({ t, colKey }: { t: Task; colKey: Status }) {
  const { kSel, ownerOv } = useTracker();
  const sel = kSel === t.id;
  const isDone = colKey === "done";
  const who = ownerOv[t.id] || t.owner;
  return (
    <div
      onClick={() => store.selectCard(t.id)}
      style={{
        background: "#fff",
        border: sel
          ? `1.5px solid ${blueTint(0.5)}`
          : `1px solid ${c.borderLight}`,
        borderRadius: radius.cardSm,
        padding: "6px 8px",
        marginBottom: 4,
        boxShadow: sel ? shadow.raised : shadow.row,
        cursor: "pointer",
        transition: "box-shadow 120ms ease, border-color 120ms ease",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: T.body,
          fontWeight: 600,
          lineHeight: 1.35,
          color: isDone ? c.done : c.ink,
          textDecoration: isDone ? "line-through" : "none",
        }}
      >
        {t.label}
      </p>
      <div
        style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}
      >
        <span
          style={{
            fontSize: T.micro,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: c.muted3,
          }}
        >
          {SHORT[t.pk]}
        </span>
        {t.link && (
          <LinkChip style={{ borderRadius: 5, padding: "0 6px" }}>
            {t.link}
          </LinkChip>
        )}
        {t.blocked && (
          <span
            style={{
              fontSize: T.micro,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#fff",
              background: c.darkChip,
              borderRadius: 5,
              padding: "0 6px",
            }}
          >
            Blkd
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: T.micro, fontWeight: 600, color: c.muted2 }}>
          {who}
        </span>
        <span style={{ fontSize: T.micro, color: c.faint3 }}>{t.dueLabel}</span>
        <span
          title="Move left"
          style={{
            fontSize: T.body,
            fontWeight: 700,
            color: c.muted3,
            cursor: "pointer",
            padding: "0 3px",
          }}
          onClick={e => {
            e.stopPropagation();
            store.moveStatus(t.id, -1);
          }}
        >
          ‹
        </span>
        <span
          title="Move right"
          style={{
            fontSize: T.body,
            fontWeight: 700,
            color: c.blueText,
            cursor: "pointer",
            padding: "0 3px",
          }}
          onClick={e => {
            e.stopPropagation();
            store.moveStatus(t.id, 1);
          }}
        >
          ›
        </span>
      </div>
    </div>
  );
}

function Column({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: c.groupHeader,
        borderRadius: radius.cardSm,
        padding: "6px 6px 3px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 3px 6px",
        }}
      >
        <Eyebrow tone={c.muted}>{label}</Eyebrow>
        <span
          style={{
            fontSize: T.micro,
            fontWeight: 700,
            color: c.ink2,
            background: "#fff",
            borderRadius: radius.pill,
            padding: "0 8px",
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

export default function StatusBoard() {
  const st = useTracker();
  const [groupBy, setGroupBy] = useState<GroupBy>("Status");
  const selected = st.tasks.find(t => t.id === st.kSel) ?? null;

  // Column definitions by grouping mode. Status is the canonical board; the
  // other two regroup the same cards by project / owner.
  const groups: {
    key: string;
    label: string;
    rows: Task[];
    statusKey: Status;
  }[] =
    groupBy === "Status"
      ? COLS.map(col => ({
          key: col.key,
          label: col.label,
          statusKey: col.key,
          rows: st.tasks.filter(t => store.statusOf(t) === col.key),
        }))
      : groupBy === "Project"
        ? (Object.keys(PROJ) as (keyof typeof PROJ)[]).map(pk => ({
            key: pk,
            label: SHORT[pk],
            statusKey: "todo" as Status,
            rows: st.tasks.filter(t => t.pk === pk),
          }))
        : Array.from(new Set(st.tasks.map(t => store.ownerOf(t)))).map(o => ({
            key: o,
            label: o,
            statusKey: "todo" as Status,
            rows: st.tasks.filter(t => store.ownerOf(t) === o),
          }));

  return (
    <TrackerFrame label="1C Status board" height={784} padded={false}>
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
            title="Board"
            sub={`todo → in progress → review → completed · all ${Object.keys(PROJ).length} projects`}
            right={
              <>
                <SegmentedDense
                  options={["Status", "Project", "Assignee"] as GroupBy[]}
                  value={groupBy}
                  onChange={setGroupBy}
                />
                <AddTaskCTA />
              </>
            }
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              gap: 8,
              marginTop: 6,
              minHeight: 0,
            }}
          >
            {groups.map(g => (
              <Column key={g.key} label={g.label} count={g.rows.length}>
                {g.rows.slice(0, MAX_CARDS).map(t => (
                  <Card
                    key={t.id}
                    t={t}
                    colKey={
                      groupBy === "Status" ? g.statusKey : store.statusOf(t)
                    }
                  />
                ))}
                {g.rows.length > MAX_CARDS && (
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: T.micro,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: c.blueText,
                      cursor: "pointer",
                    }}
                  >
                    +{g.rows.length - MAX_CARDS} more
                  </p>
                )}
              </Column>
            ))}
          </div>
        </div>

        {/* Glass side panel — in flow, never a dimmed modal */}
        <div
          style={{
            width: 314,
            flexShrink: 0,
            borderLeft: `1px solid oklch(0.93 0.004 250 / 0.6)`,
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
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
                  Selected task
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
                  {PROJ[selected.pk].name} · {store.ownerOf(selected)} ·{" "}
                  {STATUS_LABEL[store.statusOf(selected)]}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <KV k="Due" labelWidth={87}>
                  <span style={{ fontWeight: 600 }}>
                    {selected.dueLabel || "—"}
                  </span>
                </KV>
                <KV k="Record" labelWidth={87}>
                  <span style={{ fontWeight: 600, color: c.blueText }}>
                    {selected.link || "—"}
                  </span>
                  <span style={{ color: c.muted3 }}>{selected.linkKind}</span>
                </KV>
                <KV k="Origin" labelWidth={87} last={!selected.blocked}>
                  <span>{selected.source}</span>
                </KV>
                {selected.blocked && (
                  <KV k="Waiting" labelWidth={87} last>
                    <span style={{ fontWeight: 600 }}>{selected.waiting}</span>
                  </KV>
                )}
              </div>
              <div>
                <Eyebrow tracking="0.12em" style={{ marginBottom: 6 }}>
                  Activity
                </Eyebrow>
                {[
                  ["2:41p", "AI attached PO-2044 vendor confirmation"],
                  ["11:02a", "Maria moved to In progress"],
                  ["Jul 18", "Created from the reorder-point workflow"],
                ].map(([when, what]) => (
                  <div
                    key={when}
                    style={{
                      display: "flex",
                      gap: 10,
                      fontSize: T.body,
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ color: c.faint3, whiteSpace: "nowrap" }}>
                      {when}
                    </span>
                    <span>{what}</span>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Pill
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    store.toggle(selected.id);
                    store.flash(
                      st.done[selected.id] ? "Reopened" : "Completed"
                    );
                  }}
                >
                  {st.done[selected.id] ? "Reopen" : "Complete"}
                </Pill>
                {selected.link && (
                  <Pill
                    variant="secondary"
                    size="sm"
                    onClick={() => store.flash(`Opening ${selected.link}`)}
                  >
                    Open {selected.link}
                  </Pill>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </TrackerFrame>
  );
}
