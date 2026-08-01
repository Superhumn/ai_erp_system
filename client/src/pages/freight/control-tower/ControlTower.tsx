import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { usePalette } from "./lib/useTokens";
import { v, FONT_MONO, FONT_SANS } from "./lib/tokens";
import {
  decorateAll, filterSort, resultSummary, kpis, runway, plantWall, journeys, clockRows,
  board, isEmpty, docColor, type Decorated, type FocusId, type GroupKey, type Pivot,
} from "./lib/selectors";
import { projectAll } from "@shared/freight-control-tower/projection";
import type { FreightSnapshot } from "@shared/freight-control-tower/fixtures";
import { detailFor, requestFor, dockFor } from "./lib/drawer";
import { paperFor } from "./lib/paper";
import { TodayView } from "./views/TodayView";
import { RunwayView } from "./views/RunwayView";
import { JourneysView } from "./views/JourneysView";
import { PlantWallView } from "./views/PlantWallView";
import { BoardView } from "./views/BoardView";
import { MapView } from "./views/MapView";
import { MovementDrawer } from "./overlays/MovementDrawer";
import { DocumentViewer } from "./overlays/DocumentViewer";
import { RequestComposer, type ComposeState } from "./overlays/RequestComposer";
import { DockMode } from "./overlays/DockMode";

const VIEWS: [string, string][] = [
  ["home", "Today"], ["runway", "Runway"], ["journeys", "Journeys"],
  ["wall", "Plant wall"], ["board", "Board"], ["map", "Map"],
];
const GROUP_OPTS: [GroupKey, string][] = [
  ["none", "Nothing — flat list"], ["location", "Destination factory"], ["lane", "Trade lane"],
  ["supplier", "Supplier"], ["po", "Purchase order"],
];
const SLA = 3;
const FEED_TIME = "31 Jul 09:41 SGT";
const missingSet = new Set(["missing", "pending", "na"]);

export default function ControlTower() {
  const C = usePalette();
  // tRPC serialisation widens every field to optional; the payload is the
  // shared FreightSnapshot verbatim, so re-assert its precise type here.
  const { data, isLoading } = trpc.freightControlTower.snapshot.useQuery();
  const snapshot = data as FreightSnapshot | undefined;

  const [view, setView] = useState("home");
  const [group, setGroup] = useState<GroupKey>("none");
  const [cut, setCut] = useState<FocusId | null>(null);
  const [focusKind, setFocusKind] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [doc, setDoc] = useState<number | null>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [sent, setSent] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dock, setDock] = useState(false);
  const [count, setCount] = useState(240000);
  const [cond, setCond] = useState("Good");
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ping = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  // Clear any pending toast timer on unmount so it can't setState after teardown.
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // restore persisted view
  useEffect(() => {
    try {
      const stored = localStorage.getItem("meridian.view");
      if (stored && VIEWS.some((x) => x[0] === stored)) setView(stored);
    } catch { /* ignore */ }
  }, []);

  const pickView = (k: string) => {
    try { localStorage.setItem("meridian.view", k); } catch { /* ignore */ }
    setView(k); setSel(null); setDoc(null);
  };
  const applyPivot = (p: Pivot) => {
    setQuery(p.label); setGroup(p.group); setFocusKind(p.kind); setSel(null); setDoc(null); setCollapsed({});
  };
  const clearFocus = () => { setQuery(""); setFocusKind(null); };
  const onQuery = (val: string) => { setQuery(val); setFocusKind(val ? "Search" : null); };
  const toggleGroup = (key: string) => setCollapsed((c) => ({ ...c, [group + "|" + key]: !c[group + "|" + key] }));

  const openCompose = (r: Decorated, docName: string) => {
    const req = requestFor(r, docName, SLA);
    setCompose({ ref: r.ref, docName, to: req.to, cc: req.cc, subject: req.subject, body: req.body, attachments: req.attachments, history: "" });
  };

  // Escape closes the top-most overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (compose) setCompose(null);
      else if (doc != null) setDoc(null);
      else if (sel) setSel(null);
      else if (dock) setDock(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compose, doc, sel, dock]);

  // ── derivations (all read one snapshot) ──────────────────────────────────
  const all = useMemo<Decorated[]>(() => snapshot ? decorateAll(snapshot.shipments, C) : [], [snapshot, C]);
  const proj = useMemo(() => snapshot ? projectAll(snapshot.cover, snapshot.shipments, {}) : {}, [snapshot]);
  const rows = useMemo(() => filterSort(all, cut, query), [all, cut, query]);
  const kpiTiles = useMemo(() => kpis(all, cut, C, SLA), [all, cut, C]);
  const run = useMemo(() => snapshot ? runway(snapshot.cover, all, proj, C) : { rows: [], note: "", ticks: [] }, [snapshot, all, proj, C]);
  const wall = useMemo(() => snapshot ? plantWall(run.rows, snapshot.cover, snapshot.plants, C) : [], [snapshot, run.rows, C]);
  const jour = useMemo(() => journeys(all, C), [all, C]);
  const clk = useMemo(() => snapshot ? clockRows(snapshot.clock, all, C) : [], [snapshot, all, C]);
  const groups = useMemo(() => board(rows, group, collapsed, C), [rows, group, collapsed, C]);

  const selRow = sel ? all.find((r) => r.ref === sel) ?? null : null;
  const detail = useMemo(() => selRow ? detailFor(selRow, C, SLA) : null, [selRow, C]);

  // paper viewer model
  const paperModel = useMemo(() => {
    if (!selRow || doc == null || !selRow._docs[doc]) return null;
    const d = selRow._docs[doc];
    const n = selRow._docs.length;
    const col = docColor(d.status, C);
    const present = !missingSet.has(d.status);
    const paper = paperFor(selRow, d.name, d.status, C);
    const key = selRow.ref + "|" + d.name;
    const extra = sent[key] || 0;
    const incotermWord = selRow.incoterm.split(" ")[0];
    let missingNote = "";
    if (d.status === "na") missingNote = `Not required under ${incotermWord} terms for this movement.`;
    else if (d.status === "pending") missingNote = "This document is produced by an event that has not happened yet — it will appear automatically once that milestone is reached.";
    else if (d.status === "missing") {
      const req = requestFor(selRow, d.name, SLA);
      missingNote = `Held by ${req.to.name} (${req.to.role.toLowerCase()}). Requested ${3 + extra}×, last ${extra ? "31 Jul" : "29 Jul"}. ${req.consequence}`;
    }
    return {
      paper, docName: d.name, statusLabel: d.status.toUpperCase(), badgeColor: col, counter: `${doc + 1} / ${n}`,
      present, missingNote,
      actLabel: d.status === "missing" ? "Request by email" : present ? "Download PDF" : "Set reminder",
      actBg: d.status === "missing" ? C.red : C.amber,
    };
  }, [selRow, doc, sent, C]);

  const dockModel = useMemo(() => dockFor(count, cond, submitted, C), [count, cond, submitted, C]);

  if (isLoading || !snapshot) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasFocus = !!query && !!focusKind;
  const summary = resultSummary(rows, all);

  // drawer action
  const drawerAction = () => {
    if (!detail || !selRow) return;
    if (detail.actKind === "compose" && detail.missingDocName) openCompose(selRow, detail.missingDocName);
    else ping(selRow.ref + " — action queued, supplier notified");
  };
  // paper action
  const paperAction = () => {
    if (!selRow || doc == null) return;
    const d = selRow._docs[doc];
    if (d.status === "missing") openCompose(selRow, d.name);
    else ping(`${d.name} — ${paperModel?.present ? "downloaded" : "reminder set"} for ${selRow.ref}`);
  };
  // compose send/escalate
  const finishCompose = (escalate: boolean) => {
    if (!compose) return;
    const key = compose.ref + "|" + compose.docName;
    setSent((s) => ({ ...s, [key]: (s[key] || 0) + 1 }));
    ping(`${compose.docName} requested from ${compose.to.name}${escalate ? " · escalated to account manager" : ""} — ${compose.ref}`);
    setCompose(null);
  };

  const composeWithHistory: ComposeState | null = compose
    ? { ...compose, history: `requested ${3 + (sent[compose.ref + "|" + compose.docName] || 0)}× · last ${sent[compose.ref + "|" + compose.docName] ? "31 Jul" : "29 Jul"}` }
    : null;

  const dockSubmit = () => { setSubmitted(true); ping("GRN-9046 posted — three-way match updated, quantity moved to on-hand"); };

  return (
    <div
      className="not-compact fct-root"
      style={{ height: "calc(100vh - 5rem)", minHeight: 640, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", background: v("bg"), color: v("text"), fontFamily: FONT_SANS, fontSize: 13, border: `1px solid ${v("border")}`, borderRadius: 12 }}
    >
      {/* header */}
      <header style={{ flex: "none", height: 54, borderBottom: `1px solid ${v("border")}`, background: v("surface"), display: "flex", alignItems: "center", gap: 14, padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 21, height: 21, borderRadius: 5, background: `linear-gradient(150deg, ${v("warning")}, ${v("warning-dark")})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: v("bg") }}>M</div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px" }}>Meridian</div>
          <div style={{ width: 1, height: 16, background: v("border-strong"), margin: "0 4px" }} />
        </div>
        <div style={{ width: 1, height: 20, background: v("border"), margin: "0 2px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {VIEWS.map(([k, lbl]) => {
            const active = view === k;
            return (
              <button key={k} type="button" role="tab" aria-selected={active} onClick={() => pickView(k)} style={{ appearance: "none", font: "inherit", border: "none", padding: "7px 13px", borderRadius: 7, fontSize: 12.5, fontWeight: active ? 600 : 500, color: active ? v("text") : v("text-3"), background: active ? v("surface-2") : "transparent", boxShadow: active ? `inset 0 0 0 1px ${v("border")}` : "none", cursor: "pointer", whiteSpace: "nowrap" }}>{lbl}</button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: `1px solid ${v("border-strong")}`, borderRadius: 7, background: v("surface-2"), flex: "0 1 260px", minWidth: 150 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: v("text-faint") }}>⌕</span>
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Ref, PO, SKU, supplier, port…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: v("text"), fontFamily: FONT_MONO, fontSize: 11.5, minWidth: 0 }} />
        </div>
        <button type="button" aria-pressed={dock} onClick={() => setDock((d) => !d)} style={{ appearance: "none", font: "inherit", display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 7, border: `1px solid ${v("control")}`, background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 500, color: v("text-3") }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11 }}>▤</span> Dock
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none", whiteSpace: "nowrap", fontFamily: FONT_MONO, fontSize: 10, color: v("text-dim") }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", flex: "none", background: v("success"), animation: "fctPulse 2.4s ease-in-out infinite" }} />{FEED_TIME}
        </div>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: v("border-strong"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 600, color: v("text-3") }}>DK</div>
      </header>

      {/* filter bar */}
      <div style={{ flex: "none", padding: "10px 20px", borderBottom: `1px solid ${v("border")}`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {view === "board" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1.1px", textTransform: "uppercase", color: v("text-faint") }}>Group</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)} style={{ appearance: "none", padding: "6px 26px 6px 10px", borderRadius: 6, border: `1px solid ${v("border-strong")}`, background: v("surface-2"), color: v("text"), fontFamily: FONT_SANS, fontSize: 11.5, fontWeight: 500, cursor: "pointer", outline: "none" }}>
              {GROUP_OPTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
            </select>
          </div>
        )}
        {hasFocus && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: `color-mix(in srgb, ${v("warning")} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${v("warning")} 40%, transparent)` }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("warning") }}>{focusKind}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: v("text") }}>{query}</span>
            <span onClick={clearFocus} style={{ cursor: "pointer", color: v("text-3"), fontSize: 12, paddingLeft: 2 }}>✕</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-dim") }}>{summary}</div>
      </div>

      {/* KPI strip */}
      <div style={{ flex: "none", padding: "14px 20px", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, borderBottom: `1px solid ${v("border")}` }}>
        {kpiTiles.map((k) => (
          <div key={k.id} onClick={() => setCut((c) => (c === k.id ? null : k.id))} style={{ border: `1px solid ${k.border}`, borderRadius: 8, background: k.bg, padding: "11px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "border-color 140ms ease, background 140ms ease" }}>
            <div style={{ width: 2, height: 30, borderRadius: 2, background: k.color }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1.1px", textTransform: "uppercase", color: v("text-dim") }}>{k.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 3 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 18, letterSpacing: "-.6px", color: k.color }}>{k.value}</span>
              </div>
              <div style={{ fontSize: 10.5, marginTop: 2, color: k.noteColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.note}</div>
            </div>
          </div>
        ))}
      </div>

      {/* active view */}
      {view === "home" && <TodayView clock={clk} runwayTop={run.rows.slice(0, 5)} runwayNote={run.note} palette={C} onOpen={setSel} />}
      {view === "runway" && <RunwayView rows={run.rows} ticks={run.ticks} note={run.note} palette={C} onOpen={setSel} />}
      {view === "journeys" && <JourneysView rows={jour.rows} ticks={jour.ticks} todayLeft={jour.todayLeft} palette={C} onOpen={setSel} />}
      {view === "wall" && <PlantWallView cards={wall} palette={C} onOpen={setSel} />}
      {view === "board" && <BoardView groups={groups} empty={isEmpty(rows, view)} palette={C} collapsed={collapsed} onOpen={setSel} onPivot={applyPivot} onDocs={(ref) => { setSel(ref); setDoc(0); }} onToggle={toggleGroup} />}
      {view === "map" && <MapView rows={rows} palette={C} onSelect={setSel} />}

      {/* overlays */}
      {detail && doc == null && !compose && (
        <MovementDrawer detail={detail} palette={C} onClose={() => setSel(null)} onPivot={applyPivot} onOpenDoc={(i) => setDoc(i)} onAction={drawerAction} />
      )}
      {paperModel && !compose && (
        <DocumentViewer
          model={paperModel}
          onPrev={() => setDoc((d) => (d == null ? 0 : (d - 1 + selRow!._docs.length) % selRow!._docs.length))}
          onNext={() => setDoc((d) => (d == null ? 0 : (d + 1) % selRow!._docs.length))}
          onClose={() => setDoc(null)}
          onAction={paperAction}
        />
      )}
      {composeWithHistory && (
        <RequestComposer compose={composeWithHistory} onSubject={(vv) => setCompose((c) => (c ? { ...c, subject: vv } : c))} onBody={(vv) => setCompose((c) => (c ? { ...c, body: vv } : c))} onSend={() => finishCompose(false)} onEscalate={() => finishCompose(true)} onClose={() => setCompose(null)} />
      )}
      {dock && (
        <DockMode model={dockModel} palette={C} onInc={() => setCount((n) => n + 1000)} onDec={() => setCount((n) => Math.max(0, n - 1000))} onPickCond={setCond} onSubmit={dockSubmit} onClose={() => setDock(false)} />
      )}

      {/* toast */}
      {toast && (
        <div style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 50, background: v("text"), color: v("bg"), padding: "10px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 500, boxShadow: "0 12px 34px rgba(0,0,0,.28)", animation: "fctFadeUp 200ms ease both", maxWidth: "90%" }}>{toast}</div>
      )}
    </div>
  );
}
