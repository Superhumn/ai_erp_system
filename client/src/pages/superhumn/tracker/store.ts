/**
 * Project tracker — single shared store.
 *
 * Every tracker view (1A–1E) reads and writes this one store so they stay in
 * sync (checking a task off in one carries to all). It is a tiny external
 * store (subscribe / getState) consumed through `useSyncExternalStore`, with
 * the mutations from the handoff's logic class as methods. Pure helpers are
 * exported separately so the ordering / bucketing rules are unit-testable.
 *
 * Owner and status edits write to the task itself; completion (`x`) is an
 * overlay so it can be undone with a second `x`.
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

/** Which frame the keyboard layer walks: 1A = the visible queue view; 1C
 *  and 1E = every task (board order / grid order). */
export type Pane = "1A" | "1C" | "1E";
export type QueueView = "Today" | "This week" | "Later" | "Week grid";
export type Bucket = "today" | "week" | "later" | "blocked";

export type TrackerState = {
  tasks: Task[];
  /** Frame label under the pointer / holding focus — the single toast slot
   *  renders there; `null` (pointer and focus outside every tracker frame)
   *  disables the keyboard layer. */
  activeFrame: string | null;
  /** Visible card ids the board reports (column order, collapsed tails
   *  excluded) — the 1C keyboard order. */
  boardIds: string[];
  cursor: string;
  sel: Record<string, true>;
  /** Completion overlay on top of `task.status` — undoable with a second `x`. */
  done: Record<string, true>;
  /** `null` while a frame without task rows (1B, 1D) is active. */
  pane: Pane | null;
  savedView: SavedView["key"];
  suggestions: Suggestion[];
  toast: string;
  queueView: QueueView;
  openBlocker: string | null;
  nudged: Record<string, true>;
  kSel: string;
  snoozed: Record<string, true>;
  tlSel: ProjectKey;
  gSel: string;
  editing: { id: string; field: "status" | "owner" } | null;
};

export const TOAST_MS = 1600;

/* ----------------------------------------------------------- pure helpers */

/** Effective status: the `done` overlay wins, then the task's own status. */
export const statusOf = (st: Pick<TrackerState, "done">, t: Task): Status =>
  st.done[t.id] ? "done" : t.status;

/** One completion selector for every view (overlay OR status "done"). */
export const isDone = (st: Pick<TrackerState, "done">, t: Task) =>
  statusOf(st, t) === "done";

/** Ordering rule (implement exactly): due-today/imminent first, blockers
 *  second, this week third, later last. */
export const rank = (t: Task) =>
  t.blocked ? 1 : t.day <= 21 ? 0 : t.day <= 26 ? 2 : 3;

export function queueOrder(tasks: Task[], done: Record<string, true>): Task[] {
  const open = tasks.filter(t => !isDone({ done }, t));
  return open.slice().sort((a, b) => rank(a) - rank(b) || a.day - b.day);
}

/** 1E order: open rows by day (blocked carry day 99 so they sit last),
 *  completed rows after them. Shared by the grid and the keyboard layer. */
export function gridOrder(tasks: Task[], done: Record<string, true>): Task[] {
  return tasks
    .slice()
    .sort(
      (a, b) =>
        Number(isDone({ done }, a)) - Number(isDone({ done }, b)) ||
        a.day - b.day
    );
}

export function bucketOf(t: Task, snoozed: Record<string, true>): Bucket {
  if (t.blocked) return "blocked";
  if (snoozed[t.id]) return "later";
  if (t.day <= 21) return "today";
  if (t.day <= 26) return "week";
  return "later";
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** The seeded axis is anchored on Jul 2026 ("today" = Mon Jul 20). */
const AXIS_YEAR = 2026;

/** Day index (Jul 1 = 1, Aug 1 = 32, Sep 1 = 63 …) → "Mon N" label, via
 *  real calendar arithmetic so any offset the `d` shortcut reaches is valid. */
export function dueLabelFor(day: number): string {
  const dt = new Date(Date.UTC(AXIS_YEAR, 6, day));
  return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

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

/* ------------------------------------------------------------------ store */

type Listener = () => void;

export function initialState(): TrackerState {
  return {
    tasks: TASKS.slice(),
    // No frame owns the keyboard until one is hovered or focused.
    activeFrame: null,
    boardIds: [],
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
  queueOrder = () => queueOrder(this.state.tasks, this.state.done);
  openBlockers = () =>
    this.state.tasks.filter(t => t.blocked && !this.isDone(t));
  gridOrder = () => gridOrder(this.state.tasks, this.state.done);
  /** Ids the keyboard layer may land on: exactly the rows the active
   *  frame renders, in its visible order. */
  paneIds = () => {
    const { pane, queueView, snoozed } = this.state;
    if (pane === null) return [];
    if (pane === "1E") return this.gridOrder().map(t => t.id);
    if (pane === "1C") return this.state.boardIds;
    const queue = this.queueOrder();
    if (queueView === "Later")
      return queue.filter(t => bucketOf(t, snoozed) === "later").map(t => t.id);
    if (queueView === "Week grid")
      return queue
        .filter(t => !t.blocked && t.day >= 20 && t.day <= 26)
        .map(t => t.id);
    return queue.map(t => t.id);
  };
  find = (id: string) => this.state.tasks.find(t => t.id === id);
  selOrCursor = () => {
    const s = Object.keys(this.state.sel);
    return s.length ? s : [this.state.cursor];
  };

  /* ---- cursor / selection */
  setPane = (pane: Pane | null) => {
    if (this.state.pane !== pane) this.setState({ pane });
  };
  setActiveFrame = (activeFrame: string | null) => {
    if (this.state.activeFrame !== activeFrame) this.setState({ activeFrame });
  };
  setBoardIds = (ids: string[]) => {
    const cur = this.state.boardIds;
    if (cur.length === ids.length && cur.every((id, i) => id === ids[i]))
      return;
    this.setState({ boardIds: ids });
  };
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
  /** Complete / reopen. Completion is an overlay (undone by a second `x`);
   *  reopening a row whose own `status` is already "done" (seeded rows, or a
   *  card moved to the Done column) writes it back to "todo". */
  toggle = (id: string) =>
    this.setState(st => {
      const t = st.tasks.find(x => x.id === id);
      if (!t) return {};
      const done = { ...st.done };
      if (isDone(st, t)) {
        delete done[id];
        const tasks =
          t.status === "done"
            ? st.tasks.map(x =>
                x.id === id ? { ...x, status: "todo" as Status } : x
              )
            : st.tasks;
        return { done, tasks };
      }
      done[id] = true;
      // A completed row leaves the open lists, so it leaves the selection too.
      const sel = { ...st.sel };
      delete sel[id];
      return { done, sel };
    });

  /** Checkbox path: move the cursor to the row, then toggle it, so the
   *  keyboard undo (`x`) and `e`/`d` target the same task. */
  check = (id: string) => {
    this.setCursor(id);
    this.toggle(id);
  };

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
      kSel: t.id,
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
  /** Selecting a card also moves the keyboard cursor so x/e/d act on it. */
  selectCard = (id: string) => this.setCursor(id);
  moveStatus = (id: string, dir: 1 | -1) => {
    const t = this.find(id);
    if (!t) return;
    const order: Status[] = ["todo", "in_progress", "review", "done"];
    const idx = order.indexOf(this.statusOf(t));
    this.setStatus(id, order[Math.max(0, Math.min(3, idx + dir))]);
  };

  /* ---- 1D */
  selectProject = (pk: ProjectKey) => this.setState({ tlSel: pk });

  /* ---- 1E */
  selectRow = (id: string) =>
    this.setState({ cursor: id, gSel: id, kSel: id, editing: null });
  editCell = (id: string, field: "status" | "owner") =>
    this.setState(st => ({
      cursor: id,
      gSel: id,
      kSel: id,
      editing:
        st.editing && st.editing.id === id && st.editing.field === field
          ? null
          : { id, field },
    }));
  /** Writes `status` on the task itself. Leaving "done" also clears the
   *  completion overlay so the row really reopens everywhere. */
  setStatus = (id: string, status: Status) =>
    this.setState(st => {
      const done = { ...st.done };
      const sel = { ...st.sel };
      if (status !== "done") delete done[id];
      else delete sel[id]; // completed rows leave the selection
      return {
        tasks: st.tasks.map(t => (t.id === id ? { ...t, status } : t)),
        done,
        sel,
        editing: null,
      };
    });
  setOwner = (id: string, owner: string) =>
    this.setState(st => ({
      tasks: st.tasks.map(t => (t.id === id ? { ...t, owner } : t)),
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
    // Keys only act while a tracker frame is under the pointer or holds
    // focus; elsewhere in the gallery the tracker store is left alone.
    if (this.state.activeFrame === null) return;
    // A focused button / checkbox activates natively on Space or Enter.
    if (
      (e.key === " " || e.key === "Enter") &&
      (tag === "BUTTON" ||
        el?.getAttribute("role") === "checkbox" ||
        el?.getAttribute("role") === "button")
    )
      return;
    const ids = this.paneIds();
    // -1 when the cursor row just left the list (completed): j/k then land
    // on the first remaining row instead of skipping it.
    const at = ids.indexOf(this.state.cursor);
    const k = e.key;
    // Navigation / selection need a visible row; `x` only needs the cursor
    // to resolve, so completing the last open row can still be undone.
    const rowKeys = ["j", "k", "ArrowDown", "ArrowUp", " ", "e", "d"];
    if (rowKeys.includes(k) && !ids.length) return;
    if (
      k === "x" &&
      (this.state.pane === null || !this.find(this.state.cursor))
    )
      return;
    if (k === "j" || k === "ArrowDown") {
      this.setCursor(ids[Math.min(at + 1, ids.length - 1)]);
      e.preventDefault();
    } else if (k === "k" || k === "ArrowUp") {
      this.setCursor(ids[Math.max(at - 1, 0)]);
      e.preventDefault();
    } else if (k === "x") {
      this.toggle(this.state.cursor);
      const t = this.find(this.state.cursor);
      this.flash(t && this.isDone(t) ? "Completed" : "Reopened");
    } else if (k === " ") {
      // The cursor may still point at a row that just left the list
      // (completed, kept for undo); never select an invisible row.
      if (at >= 0) this.toggleSel(this.state.cursor);
      e.preventDefault();
    } else if (k === "e") {
      if (at >= 0) this.cycleOwner(this.state.cursor);
    } else if (k === "d") {
      const targets = Object.keys(this.state.sel).length
        ? this.selOrCursor()
        : at >= 0
          ? [this.state.cursor]
          : [];
      if (targets.length) {
        this.shiftDays(targets, 3);
        this.flash("Pushed 3 days");
      }
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
