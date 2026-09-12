/**
 * 1B — Blocker triage. Cards for each blocked task (click to expand: gated
 * downstream list, impact, Nudge / Reassign / Escalate), a partners list,
 * and a right rail with approvals waiting, aging and the AI recommendation.
 */
import React from "react";
import {
  color as c,
  type as T,
  blueTint,
  radius,
  shadow,
  font,
  tabular,
} from "../tokens";
import {
  Eyebrow,
  Pill,
  LinkChip,
  StatusChip,
  AICardDense,
  ThinBar,
} from "../primitives";
import { BLOCKER_DOWNSTREAM, BLOCKER_META, PROJ } from "./data";
import { trackerStore as store } from "./store";
import { useTracker } from "./useTracker";
import { TrackerFrame, TrackerHeader, AskPill, Rail, RailRule } from "./shared";

function BlockerCard({ id }: { id: string }) {
  const { tasks, openBlocker, nudged } = useTracker();
  const t = tasks.find(x => x.id === id);
  if (!t) return null;
  const meta = BLOCKER_META[id] ?? {
    days: Number((t.waiting?.match(/\d+/) || [0])[0]),
    channel: t.source,
    impact: `Gates ${t.gates ?? 0} downstream tasks`,
  };
  const down = BLOCKER_DOWNSTREAM[id] ?? [];
  const open = openBlocker === id;
  const isNudged = !!nudged[id];
  return (
    <div
      onClick={() => store.openBlocker(id)}
      style={{
        border: open
          ? `1.5px solid ${blueTint(0.45)}`
          : "1px solid oklch(0.93 0.004 250 / 0.9)",
        background: open
          ? `linear-gradient(180deg, ${blueTint(0.04)}, #fff 60%)`
          : "#fff",
        borderRadius: radius.cardSm,
        padding: "7px 11px",
        boxShadow: shadow.row,
        cursor: "pointer",
        transition: "background-color 120ms ease, border-color 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <StatusChip tone="dark" size={T.micro} style={{ padding: "1px 11px" }}>
          {meta.days}d
        </StatusChip>
        <p
          style={{
            margin: 0,
            flex: 1,
            fontSize: T.cardTitle,
            fontWeight: 700,
            fontFamily: font.display,
          }}
        >
          {t.label}
        </p>
        <span style={{ fontSize: T.body, color: c.muted2 }}>
          {PROJ[t.pk].name}
        </span>
        <LinkChip>{t.link}</LinkChip>
        <span
          style={{
            fontSize: T.body,
            fontWeight: 600,
            color: c.ink,
            whiteSpace: "nowrap",
          }}
        >
          gates {down.length || t.gates || 0}
        </span>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}
      >
        <div style={{ flex: 1 }}>
          <ThinBar
            value={Math.min(meta.days * 9, 100)}
            height={6}
            fill={c.darkChip}
          />
        </div>
        <span
          style={{ fontSize: T.body, color: c.muted2, whiteSpace: "nowrap" }}
        >
          Waiting on {t.waiting}
        </span>
        <span
          style={{ fontSize: T.body, color: c.faint3, whiteSpace: "nowrap" }}
        >
          {meta.channel}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 160ms ease-out",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: `1px solid ${c.rowSep}`,
              display: "flex",
              gap: 17,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow style={{ marginBottom: 4 }}>Gated downstream</Eyebrow>
              {down.map(d => (
                <div
                  key={d}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: T.body,
                    lineHeight: 1,
                    padding: "2px 0",
                  }}
                >
                  <span
                    style={{
                      height: 6,
                      width: 6,
                      borderRadius: radius.pill,
                      background: c.darkChip,
                      flexShrink: 0,
                    }}
                  />
                  {d}
                </div>
              ))}
            </div>
            <div style={{ width: 420, flexShrink: 0 }}>
              <Eyebrow style={{ marginBottom: 4 }}>Impact</Eyebrow>
              <p
                style={{
                  margin: "0 0 11px",
                  fontSize: T.body,
                  color: c.inkSoft,
                  lineHeight: 1.45,
                }}
              >
                {meta.impact}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {isNudged ? (
                  <Pill variant="tint" size="sm">
                    Nudge sent · 2:41p
                  </Pill>
                ) : (
                  <Pill
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      store.nudge(id);
                      store.flash("Nudge sent");
                    }}
                  >
                    Send AI nudge
                  </Pill>
                )}
                <Pill
                  variant="secondary"
                  size="sm"
                  onClick={() => store.bulkOwner([id], "Elena")}
                >
                  Reassign
                </Pill>
                <Pill
                  variant="secondary"
                  size="sm"
                  onClick={() => store.flash("Escalated to Alex")}
                >
                  Escalate
                </Pill>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartnerRow({
  name,
  link,
  days,
  last = false,
}: {
  name: string;
  link: string;
  days: string;
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
        borderBottom: last ? "none" : `1px solid ${c.rowSepSoft}`,
      }}
    >
      <span style={{ flex: 1 }}>{name}</span>
      <span style={{ fontSize: T.micro, fontWeight: 700, color: c.blueText }}>
        {link}
      </span>
      <span
        style={{
          fontSize: T.micro,
          color: c.muted3,
          width: 92,
          textAlign: "right",
        }}
      >
        {days}
      </span>
    </div>
  );
}

function ApprovalRow({
  name,
  amount,
  last = false,
}: {
  name: string;
  amount: string;
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
        lineHeight: 1,
        borderBottom: last ? "none" : `1px solid ${c.rowSepSoft}`,
      }}
    >
      <span style={{ flex: 1 }}>{name}</span>
      <span style={{ fontSize: T.body, fontWeight: 700, ...tabular }}>
        {amount}
      </span>
    </div>
  );
}

export default function BlockerTriage() {
  const { tasks } = useTracker();
  const blocked = tasks.filter(t => t.blocked && !store.isDone(t));
  const gated = blocked.reduce(
    (n, t) => n + (BLOCKER_DOWNSTREAM[t.id]?.length || t.gates || 0),
    0
  );
  const waitingDays = blocked.reduce(
    (n, t) => n + (BLOCKER_META[t.id]?.days ?? 0),
    0
  );
  return (
    <TrackerFrame label="1B Blocker triage" height={524}>
      <TrackerHeader
        title="Blocked first"
        sub={`${blocked.length} blocked · ${gated} downstream tasks gated · ${waitingDays} days of waiting accumulated`}
        right={
          <>
            <AskPill />
            <Pill
              variant="primary"
              size="md"
              glow
              onClick={() => {
                blocked.forEach(t => store.nudge(t.id));
                store.flash(`Nudged ${blocked.length}`);
              }}
            >
              Nudge all {blocked.length}
            </Pill>
          </>
        }
      />

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
            gap: 4,
          }}
        >
          {blocked.map(t => (
            <BlockerCard key={t.id} id={t.id} />
          ))}

          <Eyebrow style={{ margin: "8px 0 3px" }}>Waiting on partners</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <PartnerRow
              name="Fresh Farms — COA for lot FF-2209"
              link="PO-2031"
              days="11 days"
            />
            <PartnerRow
              name="Pacific Copack — production confirmation"
              link="WO-318"
              days="4 days"
            />
            <PartnerRow
              name="Erewhon — signed pricing sheet"
              link="SO-1182"
              days="2 days"
              last
            />
          </div>
        </div>

        <Rail width={325}>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>
              Approvals waiting on you
            </Eyebrow>
            <ApprovalRow name="PO-2044 · Fresh Farms" amount="$18,400" />
            <ApprovalRow name="Demo-day budget" amount="$6,200" />
            <ApprovalRow name="WO-318 overtime · Maria" amount="$1,150" last />
            <Pill
              variant="secondary"
              size="lg"
              style={{ marginTop: 11 }}
              onClick={() => store.flash("Approval queue is in the top bar")}
            >
              Open approval queue
            </Pill>
          </div>
          <RailRule />
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>Aging</Eyebrow>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: T.body,
                marginBottom: 4,
              }}
            >
              <span style={{ fontWeight: 600 }}>Over 7 days</span>
              <span style={{ color: c.muted }}>2 of 3</span>
            </div>
            <ThinBar value={67} dark />
            <p
              style={{
                margin: "11px 0 0",
                fontSize: T.body,
                color: c.muted,
                lineHeight: 1.45,
              }}
            >
              Median clear time after a nudge is 1.4 days. Unnudged blockers sit
              8.2 days.
            </p>
          </div>
          <AICardDense label="AI recommendation" style={{ marginTop: 6 }}>
            Clear the sanitation SOP first — it alone gates 6 tasks and the Aug
            15 audit date. Drafts for Tom and Maria are written and ready to
            send.
          </AICardDense>
        </Rail>
      </div>
    </TrackerFrame>
  );
}
