import { describe, expect, it, beforeEach, vi } from "vitest";
import { TASKS, AI_SUGGESTIONS } from "./data";
import {
  TrackerStore,
  applySuggestion,
  bucketOf,
  dueLabelFor,
  queueOrder,
  rank,
  shiftDays,
  waitingShort,
  TOAST_MS,
} from "./store";

describe("tracker ordering rule", () => {
  it("ranks due-today/imminent, then blocked, then this week, then later", () => {
    const byId = Object.fromEntries(TASKS.map(t => [t.id, t]));
    expect(rank(byId.t1)).toBe(0); // Jul 20
    expect(rank(byId.t2)).toBe(0); // Jul 21
    expect(rank(byId.t8)).toBe(1); // blocked
    expect(rank(byId.t3)).toBe(2); // Jul 25
    expect(rank(byId.t4)).toBe(3); // Jul 28
  });

  it("queueOrder excludes done tasks (status or overlay) and sorts by rank then day", () => {
    const ids = queueOrder(TASKS, { t1: true }).map(t => t.id);
    expect(ids).not.toContain("t1");
    expect(ids).not.toContain("t20");
    expect(ids.length).toBe(18);
    expect(ids.slice(0, 4)).toEqual(["t2", "t8", "t9", "t19"]);
    expect(ids.slice(4, 9)).toEqual(["t10", "t15", "t3", "t11", "t16"]);
  });

  it("buckets by day and honours snooze", () => {
    const byId = Object.fromEntries(TASKS.map(t => [t.id, t]));
    expect(bucketOf(byId.t1, {})).toBe("today");
    expect(bucketOf(byId.t10, {})).toBe("week");
    expect(bucketOf(byId.t4, {})).toBe("later");
    expect(bucketOf(byId.t8, {})).toBe("blocked");
    expect(bucketOf(byId.t10, { t10: true })).toBe("later");
  });
});

describe("tracker mutations", () => {
  it("dueLabelFor walks the calendar past August", () => {
    expect(dueLabelFor(31)).toBe("Jul 31");
    expect(dueLabelFor(32)).toBe("Aug 1");
    expect(dueLabelFor(62)).toBe("Aug 31");
    expect(dueLabelFor(63)).toBe("Sep 1");
    expect(dueLabelFor(93)).toBe("Oct 1");
    expect(dueLabelFor(184)).toBe("Dec 31");
    expect(dueLabelFor(185)).toBe("Jan 1");
  });

  it("shiftDays skips blocked tasks and rolls Jul into Aug", () => {
    const out = shiftDays(TASKS, ["t18", "t8"], 3);
    const t18 = out.find(t => t.id === "t18")!;
    const t8 = out.find(t => t.id === "t8")!;
    expect(t18.day).toBe(34);
    expect(t18.dueLabel).toBe("Aug 3");
    expect(t8.day).toBe(99);
    expect(dueLabelFor(31)).toBe("Jul 31");
  });

  it("applies each seeded AI suggestion", () => {
    const [reschedule, reassign, create] = AI_SUGGESTIONS;
    expect(
      applySuggestion(TASKS, reschedule).find(t => t.id === "t15")!.dueLabel
    ).toBe("Jul 26");
    expect(
      applySuggestion(TASKS, reassign).find(t => t.id === "t12")!.owner
    ).toBe("Elena");
    const created = applySuggestion(TASKS, create);
    expect(created.length).toBe(TASKS.length + 1);
    expect(created.at(-1)!.label).toBe("Erewhon launch-day staffing confirm");
  });

  it("shortens waiting-on text for the row pill", () => {
    expect(waitingShort("Tom · 9 days")).toBe("Tom · 9d");
    expect(waitingShort("Fresh Farms · 11 days")).toBe("Fresh · 11d");
    expect(waitingShort(undefined)).toBe("");
  });
});

describe("TrackerStore keyboard layer", () => {
  let store: TrackerStore;
  const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
    store.handleKey({
      key: k,
      preventDefault: () => {},
      ...extra,
    } as KeyboardEvent);

  beforeEach(() => {
    store = new TrackerStore();
    vi.useFakeTimers();
  });

  it("j/k move the cursor through the queue order", () => {
    expect(store.getState().cursor).toBe("t1");
    key("j");
    expect(store.getState().cursor).toBe("t2");
    key("j");
    expect(store.getState().cursor).toBe("t8");
    key("k");
    expect(store.getState().cursor).toBe("t2");
    key("ArrowUp");
    key("ArrowUp");
    expect(store.getState().cursor).toBe("t1");
  });

  it("x toggles completion as an overlay and flashes a toast that clears", () => {
    key("x");
    expect(store.getState().done.t1).toBe(true);
    expect(store.getState().toast).toBe("Completed");
    vi.advanceTimersByTime(TOAST_MS);
    expect(store.getState().toast).toBe("");
    key("x");
    expect(store.getState().done.t1).toBeUndefined();
  });

  it("space selects, d pushes the selection 3 days and clears it, esc clears", () => {
    key(" ");
    key("j");
    key(" ");
    expect(Object.keys(store.getState().sel)).toEqual(["t1", "t2"]);
    key("d");
    expect(store.getState().tasks.find(t => t.id === "t2")!.dueLabel).toBe(
      "Jul 24"
    );
    expect(store.getState().sel).toEqual({});
    key(" ");
    key("Escape");
    expect(store.getState().sel).toEqual({});
  });

  it("e cycles the owner, a appends a task at the cursor, 1–4 switch saved views", () => {
    key("e");
    expect(store.getState().tasks[0].owner).toBe("Maria");
    key("a");
    expect(store.getState().cursor).toBe("new1");
    expect(store.getState().tasks.at(-1)!.label).toBe("New task 1");
    key("3");
    expect(store.getState().savedView).toBe("v3");
  });

  it("y accepts and n rejects the first suggestion", () => {
    key("n");
    expect(store.getState().suggestions.map(s => s.id)).toEqual(["s2", "s3"]);
    key("y");
    expect(store.getState().tasks.find(t => t.id === "t12")!.owner).toBe(
      "Elena"
    );
    expect(store.getState().suggestions.map(s => s.id)).toEqual(["s3"]);
  });

  it("j after completing the cursor row lands on the next row, not the one after", () => {
    key("x"); // t1 leaves the queue
    key("j");
    expect(store.getState().cursor).toBe("t2");
  });

  it("x reopens a seeded done row and a card moved to Done, and status writes clear the overlay", () => {
    store.setPane("1E");
    store.setCursor("t20");
    key("x");
    expect(store.isDone(store.find("t20")!)).toBe(false);
    expect(store.find("t20")!.status).toBe("todo");
    store.setStatus("t3", "done");
    expect(store.queueOrder().map(t => t.id)).not.toContain("t3");
    store.setCursor("t3");
    key("x");
    expect(store.isDone(store.find("t3")!)).toBe(false);
    store.bulkComplete(["t4"]);
    store.setStatus("t4", "review");
    expect(store.isDone(store.find("t4")!)).toBe(false);
    expect(store.statusOf(store.find("t4")!)).toBe("review");
  });

  it("global keys still work when the queue is empty", () => {
    store.setState({ tasks: [] });
    key("a");
    expect(store.getState().tasks.length).toBe(1);
    store.setState({ tasks: [] });
    key("3");
    expect(store.getState().savedView).toBe("v3");
    key("n");
    expect(store.getState().suggestions.length).toBe(2);
  });

  it("opening an inline editor moves the keyboard cursor to that row", () => {
    store.setPane("1E");
    store.editCell("t5", "owner");
    expect(store.getState().cursor).toBe("t5");
    key("e");
    expect(store.find("t5")!.owner).toBe("Jenna");
  });

  it("owner edits are one source of truth across views", () => {
    store.setOwner("t1", "Sara");
    expect(store.find("t1")!.owner).toBe("Sara");
    key("e");
    expect(store.find("t1")!.owner).toBe("Ops");
  });

  it("1E pane walks every task, and ‹ › move a card between board columns", () => {
    store.setPane("1E");
    store.setCursor("t22");
    key("j");
    expect(store.getState().cursor).toBe("t22");
    store.moveStatus("t3", 1);
    expect(store.statusOf(store.find("t3")!)).toBe("in_progress");
    store.moveStatus("t3", -1);
    store.moveStatus("t3", -1);
    expect(store.statusOf(store.find("t3")!)).toBe("todo");
  });
});
