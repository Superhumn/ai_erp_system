/**
 * 1D — Timeline. One row per project with bars over a Jul 20-anchored
 * axis; selecting a project expands its open tasks (hatched = blocked) and
 * shows budget vs calendar burn plus the critical-path card.
 *
 * Every row (axis, project, task) uses the same four-column template so
 * ticks and bars share x coordinates: label · graph · owner · due.
 */
import React, { useState } from "react";
import {
  color as c,
  type as T,
  blueTint,
  radius,
  font,
  tabular,
} from "../tokens";
import { Eyebrow, Pill, AICardDense, ThinBar } from "../primitives";
import { PROJ, PROJECT_END_DAY, PROJECT_KEYS, type ProjectKey } from "./data";
import { trackerStore as store, dueLabelFor } from "./store";
import { useTracker } from "./useTracker";
import { TrackerFrame, TrackerHeader, SegmentedDense } from "./shared";

const START = 20; // Jul 20 = "today"
type Range = "Weeks" | "8 weeks" | "Quarter";
/** Window length in days and tick spacing for each range. */
const RANGES: Record<Range, { days: number; step: number }> = {
  Weeks: { days: 28, step: 7 },
  "8 weeks": { days: 57, step: 7 },
  Quarter: { days: 91, step: 14 },
};

const COLS = { label: 316, owner: 104, due: 165, gap: 14 } as const;

/** One row of the shared template. */
function Row({
  label,
  graph,
  owner,
  due,
  style,
  onClick,
}: {
  label: React.ReactNode;
  graph: React.ReactNode;
  owner?: React.ReactNode;
  due?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: COLS.gap, ...style }}
    >
      <div
        style={{
          width: COLS.label,
          flexShrink: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          minWidth: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {graph}
      </div>
      <span
        style={{
          width: COLS.owner,
          flexShrink: 0,
          textAlign: "right",
          fontSize: T.micro,
          color: c.muted3,
        }}
      >
        {owner}
      </span>
      <span
        style={{
          width: COLS.due,
          flexShrink: 0,
          textAlign: "right",
          fontSize: T.micro,
          color: c.muted3,
          whiteSpace: "nowrap",
        }}
      >
        {due}
      </span>
    </div>
  );
}

export default function Timeline() {
  const st = useTracker();
  const [range, setRange] = useState<Range>("8 weeks");
  const { days: WIN, step } = RANGES[range];
  const pos = (d: number) => ((d - START) / WIN) * 100;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const ticks: number[] = [];
  for (let d = START; d < START + WIN; d += step) ticks.push(d);
  const endLabel = dueLabelFor(START + WIN - 1);

  const selPk = st.tlSel;
  const p = PROJ[selPk];
  const taskBars = st.tasks.filter(t => t.pk === selPk && !store.isDone(t));
  const atRiskCount = PROJECT_KEYS.filter(
    k => PROJ[k].chip === "AT RISK"
  ).length;

  const tickLines = (
    <>
      {ticks.map(d => (
        <span
          key={d}
          style={{
            position: "absolute",
            left: `${pos(d)}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: c.rowSep,
          }}
        />
      ))}
    </>
  );

  return (
    <TrackerFrame label="1D Timeline" height={518}>
      <TrackerHeader
        title="Timeline"
        sub={`Jul 20 – ${endLabel} · ${PROJECT_KEYS.length} projects · ${atRiskCount} deadline at risk`}
        right={
          <>
            <SegmentedDense
              options={["Weeks", "8 weeks", "Quarter"] as Range[]}
              value={range}
              onChange={setRange}
            />
            <Pill
              variant="secondary"
              size="md"
              onClick={() => store.flash("Critical path highlighted")}
            >
              Critical path
            </Pill>
          </>
        }
      />

      {/* Axis */}
      <Row
        style={{
          marginTop: 8,
          paddingBottom: 3,
          borderBottom: `1px solid ${c.border}`,
        }}
        label={null}
        graph={
          <div style={{ position: "relative", height: 17 }}>
            {ticks.map(d => (
              <span
                key={d}
                style={{
                  position: "absolute",
                  left: `${pos(d)}%`,
                  fontSize: T.micro,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: c.faint,
                  // Labels near the right edge hang left of their tick so
                  // they are not clipped by the graph column.
                  transform:
                    pos(d) > 85
                      ? "translateX(calc(-100% - 3px))"
                      : "translateX(3px)",
                  whiteSpace: "nowrap",
                }}
              >
                {dueLabelFor(d)}
              </span>
            ))}
          </div>
        }
      />

      {/* Projects */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
        {PROJECT_KEYS.map(pk => {
          const proj = PROJ[pk];
          const sel = st.tlSel === pk;
          const endDay = PROJECT_END_DAY[pk];
          const atRisk = proj.chip === "AT RISK";
          const onHold = proj.chip === "ON HOLD";
          const width = clamp(pos(endDay));
          return (
            <Row
              key={pk}
              onClick={() => store.selectProject(pk)}
              style={{
                padding: "3px 8px",
                borderRadius: 7,
                background: sel ? blueTint(0.05) : "transparent",
                cursor: "pointer",
                borderBottom: "1px solid oklch(0.96 0.003 250)",
                transition: "background-color 120ms ease",
              }}
              label={
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: T.body,
                      fontWeight: 700,
                      fontFamily: font.display,
                    }}
                  >
                    {proj.name}
                  </p>
                  <span style={{ fontSize: T.micro, color: c.muted3 }}>
                    {proj.owner}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: T.micro,
                      fontWeight: 700,
                      color: c.blueText,
                      ...tabular,
                    }}
                  >
                    {proj.percent}%
                  </span>
                </>
              }
              graph={
                <div style={{ position: "relative", height: 20 }}>
                  {tickLines}
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      width: `${width}%`,
                      top: 1,
                      height: 17,
                      borderRadius: 10,
                      background: onHold
                        ? c.border
                        : atRisk
                          ? c.darkChip
                          : c.blueGradBar,
                      opacity: onHold ? 0.8 : 1,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      width: `${(width * proj.percent) / 100}%`,
                      top: 1,
                      height: 17,
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.35)",
                    }}
                  />
                </div>
              }
              due={`Due ${proj.due}`}
            />
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 11,
          marginTop: 7,
        }}
      >
        <Eyebrow>{p.name} — tasks</Eyebrow>
        <span style={{ fontSize: T.body, color: c.muted3 }}>
          hatched bars are blocked and can't start
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
        {taskBars.map(t => {
          const blocked = !!t.blocked;
          const d = blocked ? 22 : t.day;
          return (
            <Row
              key={t.id}
              style={{
                padding: "0 8px",
                borderBottom: "1px solid oklch(0.965 0.003 250)",
              }}
              label={
                <span style={{ fontSize: T.body, lineHeight: "22px" }}>
                  {t.label}
                </span>
              }
              graph={
                <div style={{ position: "relative", height: 15 }}>
                  {tickLines}
                  <span
                    style={{
                      position: "absolute",
                      left: `${clamp(pos(Math.max(d - 4, START)))}%`,
                      width: `${(4 / WIN) * 100 * 1.3}%`,
                      top: 1,
                      height: 13,
                      borderRadius: 7,
                      background: blocked
                        ? "repeating-linear-gradient(45deg, oklch(0.30 0.02 262), oklch(0.30 0.02 262) 4px, oklch(0.45 0.02 262) 4px, oklch(0.45 0.02 262) 8px)"
                        : c.blue,
                    }}
                  />
                </div>
              }
              owner={t.owner}
              due={blocked ? "blocked · " + t.waiting : t.dueLabel}
            />
          );
        })}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 7,
          display: "flex",
          gap: 11,
          alignItems: "stretch",
        }}
      >
        <AICardDense
          label="Critical path"
          style={{ flex: 1, borderRadius: radius.panel - 4 }}
        >
          Sanitation SOP → batch records → mock audit walkthrough. The chain
          needs 19 working days; 26 remain, and every day the SOP waits burns
          one of the seven days of float.
        </AICardDense>
        <div
          style={{
            width: 420,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 7,
            borderLeft: "1px solid oklch(0.93 0.004 250 / 0.7)",
            paddingLeft: 15,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: T.body,
            }}
          >
            <span style={{ color: c.muted3 }}>Budget spent</span>
            <span style={{ fontWeight: 700, ...tabular }}>
              {p.spent} of {p.budget}
            </span>
          </div>
          <ThinBar value={p.burn} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: T.body,
              marginTop: 6,
            }}
          >
            <span style={{ color: c.muted3 }}>Calendar elapsed</span>
            <span style={{ fontWeight: 700, ...tabular }}>31 of 57 days</span>
          </div>
          <ThinBar value={54} dark />
          <p style={{ margin: "6px 0 0", fontSize: T.body, color: c.muted }}>
            Spend tracks the calendar; only progress lags.
          </p>
        </div>
      </div>
    </TrackerFrame>
  );
}
