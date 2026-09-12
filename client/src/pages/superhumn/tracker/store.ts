/**
 * Project tracker — single shared store.
 *
 * Every tracker view (1A–1E) reads and writes this one store so they stay in
 * sync (checking a task off in one carries to all). It is a tiny external
 * store (subscribe / getState) consumed through `useSyncExternalStore`, with
 * the mutations from the handoff's logic class as methods. Pure helpers are
 * exported separately so the ordering / bucketing rules are unit-testable.
 */
import {
  AI_SUGGESTIONS,
  OWNERS,
  SAVED_VIEWS,
  TASKS,
  type SavedView,
  type Status,
  type Suggestion,
  type Task,
  type ProjectKey,
} from "./data";

export type Pane = "1A" | "1E";
export type QueueView = "Today" | "This week" | "Later" | "Week grid";
export type Bucket = "today" | "week" | "later" | "blocked";

export type TrackerState = {
  tasks: Task[];
  cursor: string;
  sel: Record<string, true>;
  /** Completion overlay on top of `task.status` — undoable with a second `x`. */
  done: Record<string, true>;
  pane: Pane;
  savedView: SavedView["key"];
  suggestions: Suggestion[];
  toast: string;
  queueView: QueueView;
  openBlocker: string | null;
  nudged: Record<string, true>;
  kSel: string;
  snoozed: Record<string, true>;
  statusOv: Record<string, Status>;
  ownerOv: Record<string, string>;
  tlSel: ProjectKey;
  gSel: string;
  editing: { id: string; field: "status" | "owner" } | null;
};

export const TOAST_MS = 1600;

/* ----------------------------------------------------------- pure helpers */

export const isDone = (st: Pick<TrackerState, "done">, t: Task) =>
  !!st.done[t.id] || t.status === "done";

/** Ordering rule (implement exactly): due-today/imminent first, blockers
 *  second, this week third, later last. */
export const rank = (t: Task) =>
  t.blocked ? 1 : t.day <= 21 ? 0 : t.day <= 26 ? 2 : 3;

export function queueOrder(tasks: Task[], done: Record<string, true>): Task[] {
  const open = tasks.filter(t => t.status !== "done" && !done[t.id]);
  return open.slice().sort((a, b) => rank(a) - rank(b) || a.day - b.day);
}

export function bucketOf(t: Task, snoozed: Record<string, true>): Bucket {
  if (t.blocked) return "blocked";
  if (snoozed[t.id]) return "later";
  if (t.day <= 21) return "today";
  if (t.day <= 26) return "week";
  return "later";
}

/** Day index → "Jul N" / "Aug N" label (Jul has 31 days on this axis). */
export const dueLabelFor = (day: number) =>
  day > 31 ? "Aug " + (day - 31) : "Jul " + day;

export function shiftDays(tasks: Task[], ids: string[], n: number): Task[] {
  const set = new Set(ids);
  return tasks.map(t => {
    if (!set.has(t.id) || t.blocked) return t;
    const day = t.day + n;
    return { ...t, day, dueLabel: dueLabelFor(day), due: dueLabelFor(day) };
  });
}

export const nextOwner = (owner: string) =>
  OWNERS[
    (OWNERS.indexOf(owner as (typeof OWNERS)[number]) + 1) % OWNERS.length
  ];

export function applySuggestion(tasks: Task[], s: Suggestion): Task[] {
  if ("create" in s.apply) return tasks.concat([s.apply.create]);
  const patch = s.apply;
  return tasks.map(t =>
    t.id === patch.id ? { ...t, ...patch, due: patch.dueLabel ?? t.due } : t
  );
}

/** "Tom · 9 days" → "Tom · 9d"; "Fresh Farms · 11 days" → "Fresh · 11d". */
export function waitingShort(waiting?: string) {
  if (!waiting) return "";
  const who = waiting.split(" · ")[0].split(" ")[0];
  const n = (waiting.match(/\d+/) || [""])[0];
  return `${who} · ${n}d`;
}

export const statusOf = (
  st: Pick<TrackerState, "done" | "statusOv">,
  t: Task
): Status => (st.done[t.id] ? "done" : st.statusOv[t.id] || t.status);

export const ownerOf = (st: Pick<TrackerState, "ownerOv">, t: Task) =>
  st.ownerOv[t.id] || t.owner;

/* ------------------------------------------------------------------ store */

type Listener = () => void;

export function initialState(): TrackerState {
  return {
    tasks: TASKS.slice(),
    cursor: "t1",
    sel: {},
    done: { t20: true, t21: true, t22: true },
    pane: "1A",
    savedView: "v1",
    suggestions: AI_SUGGESTIONS.slice(),
    toast: "",
    queueView: "Today",
    openBlocker: "t8",
    nudged: {},
    kSel: "t3",
    snoozed: {},
    statusOv: {},
    ownerOv: {},
    tlSel: "FDA",
    gSel: "t8",
    editing: null,
  };
}

export class TrackerStore {
  private state: TrackerState;
  private listeners = new Set<Listener>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(state: TrackerState = initialState()) {
    this.state = state;
  }

  getState = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  setState = (
    patch: Partial<TrackerState> | ((s: TrackerState) => Partial<TrackerState>)
  ) => {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach(l => l());
  };

  reset = () => this.setState(initialState());

  /* ---- toast (single slot, auto-dismiss) */
  flash = (msg: string) => {
    this.setState({ toast: msg });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.setState({ toast: "" }), TOAST_MS);
  };

  /* ---- selectors */
  isDone = (t: Task) => isDone(this.state, t);
  statusOf = (t: Task) => statusOf(this.state, t);
  ownerOf = (t: Task) => ownerOf(this.state, t);
  queueOrder = () => queueOrder(this.state.tasks, this.state.done);
  paneIds = () =>
    this.state.pane === "1E"
      ? this.state.tasks.map(t => t.id)
      : this.queueOrder().map(t => t.id);
  find = (id: string) => this.state.tasks.find(t => t.id === id);
  selOrCursor = () => {
    const s = Object.keys(this.state.sel);
    return s.length ? s : [this.state.cursor];
  };

  /* ---- cursor / selection */
  setPane = (pane: Pane) => this.setState({ pane });
  setCursor = (id: string) => this.setState({ cursor: id, gSel: id, kSel: id });
  toggleSel = (id: string) =>
    this.setState(st => {
      const sel = { ...st.sel };
      if (sel[id]) delete sel[id];
      else sel[id] = true;
      return { sel };
    });
  clearSel = () => this.setState({ sel: {} });
  /** Cmd/shift-click toggles selection; plain click moves the cursor. */
  rowClick = (
    id: string,
    e?: { metaKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean }
  ) =>
    e && (e.metaKey || e.shiftKey || e.ctrlKey)
      ? this.toggleSel(id)
      : this.setCursor(id);

  /* ---- task mutations */
  toggle = (id: string) =>
    this.setState(st => {
      const done = { ...st.done };
      if (done[id]) delete done[id];
      else done[id] = true;
      return { done };
    });

  cycleOwner = (id: string) =>
    this.setState(st => ({
      tasks: st.tasks.map(t =>
        t.id === id ? { ...t, owner: nextOwner(t.owner) } : t
      ),
    }));

  shiftDays = (ids: string[], n: number) =>
    this.setState(st => ({ tasks: shiftDays(st.tasks, ids, n), sel: {} }));

  bulkOwner = (ids: string[], owner: string) => {
    const set = new Set(ids);
    this.setState(st => ({
      tasks: st.tasks.map(t => (set.has(t.id) ? { ...t, owner } : t)),
      sel: {},
    }));
    this.flash("Reassigned to " + owner);
  };

  bulkComplete = (ids: string[]) => {
    this.setState(st => {
      const done = { ...st.done };
      ids.forEach(i => (done[i] = true));
      return { done, sel: {} };
    });
    this.flash(ids.length + " completed");
  };

  addTask = () => {
    const n = this.state.tasks.filter(t => t.id.startsWith("new")).length + 1;
    const t: Task = {
      id: "new" + n,
      label: "New task " + n,
      pk: "Q3",
      owner: "Alex",
      due: "Jul 27",
      dueLabel: "Jul 27",
      day: 27,
      status: "todo",
      link: "",
      linkKind: "",
      source: "Typed · press a",
    };
    this.setState(st => ({
      tasks: st.tasks.concat([t]),
      cursor: t.id,
      gSel: t.id,
    }));
    this.flash("Task added");
  };

  acceptSuggestion = (s?: Suggestion) => {
    if (!s) return;
    this.setState(st => ({
      tasks: applySuggestion(st.tasks, s),
      suggestions: st.suggestions.filter(x => x.id !== s.id),
    }));
    this.flash(s.verb + " applied");
  };

  rejectSuggestion = (s?: Suggestion) => {
    if (!s) return;
    this.setState(st => ({
      suggestions: st.suggestions.filter(x => x.id !== s.id),
    }));
  };

  setSavedView = (key: SavedView["key"]) => this.setState({ savedView: key });
  setQueueView = (queueView: QueueView) => this.setState({ queueView });
  snooze = (id: string) =>
    this.setState(st => ({ snoozed: { ...st.snoozed, [id]: true } }));

  /* ---- 1B */
  openBlocker = (id: string) =>
    this.setState(st => ({ openBlocker: st.openBlocker === id ? null : id }));
  nudge = (id: string) =>
    this.setState(st => ({ nudged: { ...st.nudged, [id]: true } }));

  /* ---- 1C */
  selectCard = (id: string) => this.setState({ kSel: id });
  moveStatus = (id: string, dir: 1 | -1) => {
    const t = this.find(id);
    if (!t) return;
    const order: Status[] = ["todo", "in_progress", "review", "done"];
    const idx = order.indexOf(this.statusOf(t));
    const next = order[Math.max(0, Math.min(3, idx + dir))];
    this.setState(st => ({ statusOv: { ...st.statusOv, [id]: next } }));
  };

  /* ---- 1D */
  selectProject = (pk: ProjectKey) => this.setState({ tlSel: pk });

  /* ---- 1E */
  selectRow = (id: string) => this.setState({ gSel: id, editing: null });
  editCell = (id: string, field: "status" | "owner") =>
    this.setState(st => ({
      gSel: id,
      editing:
        st.editing && st.editing.id === id && st.editing.field === field
          ? null
          : { id, field },
    }));
  setStatus = (id: string, status: Status) =>
    this.setState(st => ({
      statusOv: { ...st.statusOv, [id]: status },
      editing: null,
    }));
  setOwner = (id: string, owner: string) =>
    this.setState(st => ({
      ownerOv: { ...st.ownerOv, [id]: owner },
      editing: null,
    }));

  /* ---- keyboard layer (global; ignored while an input is focused) */
  handleKey = (e: KeyboardEvent) => {
    const el = typeof document !== "undefined" ? document.activeElement : null;
    const tag = (el && el.tagName) || "";
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (el as HTMLElement | null)?.isContentEditable
    )
      return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ids = this.paneIds();
    if (!ids.length) return;
    const at = Math.max(0, ids.indexOf(this.state.cursor));
    const k = e.key;
    if (k === "j" || k === "ArrowDown") {
      this.setCursor(ids[Math.min(at + 1, ids.length - 1)]);
      e.preventDefault();
    } else if (k === "k" || k === "ArrowUp") {
      this.setCursor(ids[Math.max(at - 1, 0)]);
      e.preventDefault();
    } else if (k === "x") {
      this.toggle(this.state.cursor);
      this.flash(this.state.done[this.state.cursor] ? "Completed" : "Reopened");
    } else if (k === " ") {
      this.toggleSel(this.state.cursor);
      e.preventDefault();
    } else if (k === "e") {
      this.cycleOwner(this.state.cursor);
    } else if (k === "d") {
      this.shiftDays(this.selOrCursor(), 3);
      this.flash("Pushed 3 days");
    } else if (k === "a") {
      this.addTask();
    } else if (k === "y") {
      this.acceptSuggestion(this.state.suggestions[0]);
    } else if (k === "n") {
      this.rejectSuggestion(this.state.suggestions[0]);
    } else if (k === "Escape") {
      this.setState({ sel: {}, editing: null });
    } else if (k >= "1" && k <= "4") {
      this.setSavedView(SAVED_VIEWS[+k - 1].key);
    }
  };
}

/** The module-level store every tracker frame shares. */
export const trackerStore = new TrackerStore();
