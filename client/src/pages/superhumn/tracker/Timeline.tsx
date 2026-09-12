/**
 * 1D — Timeline. One row per project with bars over a Jul 20 – Sep 14
 * axis; selecting a project expands its open tasks (hatched = blocked) and
 * shows budget vs calendar burn plus the critical-path card.
 */
import React from "react";
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
import { trackerStore as store } from "./store";
import { useTracker } from "./useTracker";
import { TrackerFrame, TrackerHeader, SegmentedDense } from "./shared";

const WIN = 57; // days on the axis (Jul 20 → Sep 14)
const pos = (d: number) => ((d - 20) / WIN) * 100;
const TICKS: [number, string][] = [
  [20, "Jul 20"],
  [27, "Jul 27"],
  [34, "Aug 3"],
  [41, "Aug 10"],
  [48, "Aug 17"],
  [55, "Aug 24"],
  [62, "Aug 31"],
  [69, "Sep 7"],
  [76, "Sep 14"],
];
const LABEL_W = 316;

function TickLines() {
  return (
    <>
      {TICKS.map(([d]) => (
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
}

function ProjectRow({ pk }: { pk: ProjectKey }) {
  const { tlSel } = useTracker();
  const p = PROJ[pk];
  const sel = tlSel === pk;
  const endDay = PROJECT_END_DAY[pk];
  const atRisk = p.chip === "AT RISK";
  const onHold = p.chip === "ON HOLD";
  return (
    <div
      onClick={() => store.selectProject(pk)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "3px 8px",
        borderRadius: 7,
        background: sel ? blueTint(0.05) : "transparent",
        cursor: "pointer",
        borderBottom: "1px solid oklch(0.96 0.003 250)",
        transition: "background-color 120ms ease",
      }}
    >
      <div
        style={{
          width: LABEL_W,
          flexShrink: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: T.body,
            fontWeight: 700,
            fontFamily: font.display,
          }}
        >
          {p.name}
        </p>
        <span style={{ fontSize: T.micro, color: c.muted3 }}>{p.owner}</span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: T.micro,
            fontWeight: 700,
            color: c.blueText,
            ...tabular,
          }}
        >
          {p.percent}%
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", height: 20 }}>
        <TickLines />
        <span
          style={{
            position: "absolute",
            left: `${pos(20)}%`,
            width: `${pos(endDay)}%`,
            top: 1,
            height: 17,
            borderRadius: 10,
            background: onHold ? c.border : atRisk ? c.darkChip : c.blueGradBar,
            opacity: onHold ? 0.8 : 1,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: `${pos(20)}%`,
            width: `${(pos(endDay) * p.percent) / 100}%`,
            top: 1,
            height: 17,
            borderRadius: 10,
            background: "rgba(255,255,255,0.35)",
          }}
        />
      </div>
      <span
        style={{
          width: 104,
          flexShrink: 0,
          textAlign: "right",
          fontSize: T.micro,
          color: c.muted3,
        }}
      >
        Due {p.due}
      </span>
    </div>
  );
}

export default function Timeline() {
  const st = useTracker();
  const selPk = st.tlSel;
  const p = PROJ[selPk];
  const taskBars = st.tasks.filter(
    t => t.pk === selPk && store.statusOf(t) !== "done"
  );
  const atRiskCount = PROJECT_KEYS.filter(
    k => PROJ[k].chip === "AT RISK"
  ).length;

  return (
    <TrackerFrame label="1D Timeline" height={518}>
      <TrackerHeader
        title="Timeline"
        sub={`Jul 20 – Sep 14 · ${PROJECT_KEYS.length} projects · ${atRiskCount} deadline at risk`}
        right={
          <>
            <SegmentedDense
              options={["Weeks", "8 weeks", "Quarter"]}
              value="8 weeks"
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
      <div
        style={{
          display: "flex",
          marginTop: 8,
          paddingBottom: 3,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: "relative", height: 17 }}>
          {TICKS.map(([d, label]) => (
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
                transform: "translateX(3px)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <div style={{ width: 104, flexShrink: 0 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
        {PROJECT_KEYS.map(pk => (
          <ProjectRow key={pk} pk={pk} />
        ))}
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
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "0 8px",
                borderBottom: "1px solid oklch(0.965 0.003 250)",
              }}
            >
              <div
                style={{
                  width: LABEL_W,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: T.body, lineHeight: "22px" }}>
                  {t.label}
                </span>
              </div>
              <div style={{ flex: 1, position: "relative", height: 15 }}>
                <TickLines />
                <span
                  style={{
                    position: "absolute",
                    left: `${pos(Math.max(d - 4, 20))}%`,
                    width: "9%",
                    top: 1,
                    height: 13,
                    borderRadius: 7,
                    background: blocked
                      ? "repeating-linear-gradient(45deg, oklch(0.30 0.02 262), oklch(0.30 0.02 262) 4px, oklch(0.45 0.02 262) 4px, oklch(0.45 0.02 262) 8px)"
                      : c.blue,
                  }}
                />
              </div>
              <span
                style={{
                  width: 104,
                  flexShrink: 0,
                  textAlign: "right",
                  fontSize: T.micro,
                  color: c.muted3,
                }}
              >
                {t.owner}
              </span>
              <span
                style={{
                  width: 165,
                  flexShrink: 0,
                  textAlign: "right",
                  fontSize: T.micro,
                  color: c.muted3,
                  whiteSpace: "nowrap",
                }}
              >
                {blocked ? "blocked · " + t.waiting : t.dueLabel}
              </span>
            </div>
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
