/**
 * 1A — Priority queue (recommended primary).
 * One ordered stream of every open task in three columns (Today / This
 * week / Later), a next-7-days strip, and a right rail with burn, AI
 * activity and the "why this order" card.
 */
import React from "react";
import { color as c, type as T, blueTint, shadow } from "../tokens";
import {
  DenseRow,
  Eyebrow,
  Pill,
  LinkChip,
  Check,
  SparkIcon,
  AICardDense,
  ThinBar,
  type DateKind,
} from "../primitives";
import { PROJECT_KEYS, SHORT, type Task } from "./data";
import {
  trackerStore as store,
  bucketOf,
  queueOrder,
  waitingShort,
  type QueueView,
} from "./store";
import { useTracker } from "./useTracker";
import {
  TrackerFrame,
  TrackerHeader,
  SavedViewPills,
  SegmentedDense,
  AddTaskCTA,
  BulkBar,
  Rail,
  RailRule,
} from "./shared";

const QUEUE_TABS: QueueView[] = ["Today", "This week", "Later", "Week grid"];
const WEEK_DAYS = [20, 21, 22, 23, 24, 25, 26];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const dateKindOf = (t: Task): DateKind =>
  t.dueLabel === "today"
    ? "today"
    : t.day >= 20 && t.day <= 26
      ? "week"
      : "plain";

type Group = { key: string; label: string; rows: Task[] };

function QueueRow({ t }: { t: Task }) {
  const { cursor, sel } = useTracker();
  const done = store.isDone(t);
  return (
    <DenseRow
      label={t.label}
      done={done}
      today={t.dueLabel === "today"}
      blocked={!!t.blocked}
      blockedLabel={waitingShort(t.waiting)}
      link={t.link || undefined}
      who={t.owner}
      date={t.blocked ? undefined : t.dueLabel}
      dateKind={dateKindOf(t)}
      cursor={cursor === t.id}
      selected={!!sel[t.id]}
      onClick={e => store.rowClick(t.id, e)}
      onToggle={() => store.toggle(t.id)}
    />
  );
}

function GroupBlock({ g }: { g: Group }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <Eyebrow style={{ marginBottom: 2 }}>{g.label}</Eyebrow>
      {g.rows.map(t => (
        <QueueRow key={t.id} t={t} />
      ))}
    </div>
  );
}

function DayStrip({ day, i, rows }: { day: number; i: number; rows: Task[] }) {
  const today = day === 20;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "6px 8px 7px",
        borderRadius: 10,
        background: today ? blueTint(0.05) : "#fff",
        border: today
          ? `1px solid ${blueTint(0.28)}`
          : "1px solid oklch(0.93 0.004 250 / 0.9)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <p
          style={{
            margin: 0,
            fontSize: T.num,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: today ? c.blueText : c.faint,
          }}
        >
          {DAY_NAMES[i]}
        </p>
        <span style={{ fontSize: T.micro, color: c.faint3 }}>Jul {day}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: T.micro, fontWeight: 700, color: c.blueText }}>
          {rows.length ? rows.length : "—"}
        </span>
      </div>
      {rows.slice(0, 3).map(r => (
        <p
          key={r.id}
          style={{
            margin: "3px 0 0",
            fontSize: T.micro,
            lineHeight: 1.25,
            color: c.inkSoft,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {r.label}
        </p>
      ))}
    </div>
  );
}

function WeekColumn({
  day,
  i,
  rows,
}: {
  day: number;
  i: number;
  rows: Task[];
}) {
  const today = day === 20;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "11px 13px 14px",
        borderRadius: 14,
        background: today ? blueTint(0.05) : "#fff",
        border: today
          ? `1px solid ${blueTint(0.28)}`
          : "1px solid oklch(0.93 0.004 250 / 0.9)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: T.num,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: today ? c.blueText : c.faint,
        }}
      >
        {DAY_NAMES[i]}
      </p>
      <p style={{ margin: "3px 0 11px", fontSize: T.body, color: c.muted3 }}>
        Jul {day}
      </p>
      {rows.map(r => {
        const done = store.isDone(r);
        return (
          <div
            key={r.id}
            style={{
              background: "#fff",
              border: `1px solid ${c.borderLight}`,
              borderRadius: 11,
              padding: "10px 11px",
              marginBottom: 8,
              boxShadow: shadow.row,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Check
                done={done}
                today={r.dueLabel === "today"}
                size={17}
                onClick={() => store.toggle(r.id)}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: T.body,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  color: done ? c.done : c.ink,
                  textDecoration: done ? "line-through" : "none",
                }}
              >
                {r.label}
              </p>
            </div>
            <p
              style={{ margin: "7px 0 0", fontSize: T.micro, color: c.muted3 }}
            >
              {SHORT[r.pk]} · {r.owner}
            </p>
            {r.link && <LinkChip style={{ marginTop: 7 }}>{r.link}</LinkChip>}
          </div>
        );
      })}
    </div>
  );
}

function BurnRow({
  name,
  right,
  value,
  dark = false,
  marginTop = 0,
}: {
  name: string;
  right: string;
  value: number;
  dark?: boolean;
  marginTop?: number;
}) {
  return (
    <div style={{ marginTop }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: T.body,
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 600 }}>{name}</span>
        <span style={{ color: c.muted }}>{right}</span>
      </div>
      <ThinBar value={value} dark={dark} />
    </div>
  );
}

function AIDidItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ display: "flex", gap: 11, fontSize: T.body, lineHeight: 1.45 }}
    >
      <SparkIcon size={15} />
      <span>{children}</span>
    </div>
  );
}

export default function PriorityQueue() {
  const st = useTracker();
  const qv = st.queueView;
  const open = queueOrder(st.tasks, st.done);
  const pick = (b: ReturnType<typeof bucketOf>) =>
    open.filter(t => bucketOf(t, st.snoozed) === b);
  const todayRows = pick("today");
  const weekRows = pick("week");
  const laterRows = pick("later");
  const blockedRows = pick("blocked");

  let groups: Group[] = [];
  if (qv === "Today")
    groups = [
      {
        key: "a",
        label: "Do now — AI-ordered by what unblocks others",
        rows: todayRows,
      },
      {
        key: "b",
        label: "Blocked — waiting on someone else",
        rows: blockedRows,
      },
      { key: "c", label: "Next up · Jul 21 – Jul 26", rows: weekRows },
      { key: "d", label: "Later · Jul 27 onward", rows: laterRows },
    ];
  else if (qv === "This week")
    groups = [
      { key: "a", label: "Today · Mon Jul 20", rows: todayRows },
      {
        key: "b",
        label: "Blocked — waiting on someone else",
        rows: blockedRows,
      },
      { key: "c", label: "Tue Jul 21 – Sun Jul 26", rows: weekRows },
      { key: "d", label: "Later · Jul 27 onward", rows: laterRows },
    ];
  else if (qv === "Later")
    groups = [
      {
        key: "a",
        label: "Jul 27 – Jul 31",
        rows: laterRows.filter(r => r.day <= 31),
      },
      {
        key: "b",
        label: "August onward",
        rows: laterRows.filter(r => r.day > 31),
      },
    ];

  const cols: Group[][] =
    groups.length === 4
      ? [[groups[0], groups[1]], [groups[2]], [groups[3]]]
      : [[groups[0]].filter(Boolean), [groups[1]].filter(Boolean), []];
  const dayRows = (d: number) => open.filter(t => t.day === d && !t.blocked);
  const isWeekGrid = qv === "Week grid";

  return (
    <TrackerFrame label="1A Priority queue" height={633} pane="1A">
      <TrackerHeader
        title="My queue"
        sub={`${todayRows.length} for today · ${blockedRows.length} blocked · ${open.length} open across ${PROJECT_KEYS.length} projects`}
        right={
          <>
            <SavedViewPills />
            <SegmentedDense
              options={QUEUE_TABS}
              value={qv}
              onChange={v => store.setQueueView(v)}
            />
            <AddTaskCTA />
          </>
        }
      />
      <BulkBar />

      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 11,
          marginTop: 6,
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {!isWeekGrid ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 17,
                  alignItems: "flex-start",
                }}
              >
                {cols.map((col, i) => (
                  <div key={i} style={{ minWidth: 0 }}>
                    {col.map(g => (
                      <GroupBlock key={g.key} g={g} />
                    ))}
                  </div>
                ))}
              </div>
              <Eyebrow style={{ margin: "11px 0 4px" }}>Next 7 days</Eyebrow>
              <div style={{ display: "flex", gap: 7, alignItems: "stretch" }}>
                {WEEK_DAYS.map((d, i) => (
                  <DayStrip key={d} day={d} i={i} rows={dayRows(d)} />
                ))}
              </div>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                gap: 11,
                alignItems: "stretch",
                height: "100%",
              }}
            >
              {WEEK_DAYS.map((d, i) => (
                <WeekColumn key={d} day={d} i={i} rows={dayRows(d)} />
              ))}
            </div>
          )}
        </div>

        <Rail width={322}>
          <div>
            <Eyebrow style={{ marginBottom: 8 }}>
              Burn — budget vs calendar
            </Eyebrow>
            <BurnRow
              name="Shopify Migration"
              right="$36.1k / $40k · 8 days left"
              value={90}
              dark
              marginTop={8}
            />
            <BurnRow
              name="Q3 Retail Expansion"
              right="$13.8k / $24k · 57 days"
              value={58}
              marginTop={10}
            />
            <BurnRow
              name="FDA Audit Prep"
              right="$9.2k / $16k · 26 days"
              value={58}
              marginTop={10}
            />
          </div>
          <RailRule />
          <div>
            <Eyebrow style={{ marginBottom: 8 }}>What AI did today</Eyebrow>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
                marginTop: 6,
              }}
            >
              <AIDidItem>
                Closed <strong>Payment + tax configuration</strong> — QuickBooks
                reconciliation matched.
              </AIDidItem>
              <AIDidItem>
                Created <strong>Supplier COA file audit</strong> — PO-2031
                landed without a COA.
              </AIDidItem>
              <AIDidItem>
                Moved <strong>Cutover rehearsal</strong> to Jul 24 — PO-2044 ETA
                slipped two days.
              </AIDidItem>
            </div>
          </div>
          <AICardDense
            label="Why this order"
            style={{ marginTop: "auto" }}
            actions={
              <>
                <Pill
                  variant="primary"
                  size="sm"
                  onClick={() => store.flash("Nudges sent to Tom, Maria")}
                >
                  Send nudges
                </Pill>
                <Pill
                  variant="secondary"
                  size="sm"
                  onClick={() => store.flash("Re-ordered")}
                >
                  Re-order
                </Pill>
              </>
            }
          >
            Erewhon pricing is first: it gates the Aug 1 launch milestone and
            the buyer replied this morning. The two SOP sign-offs sit below
            because you can't act on them — nudges are queued instead.
          </AICardDense>
        </Rail>
      </div>
    </TrackerFrame>
  );
}
