/**
 * Project tracker — seeded design data (handoff "Design Data").
 *
 * Used verbatim for the first implementation so the 1A–1E screens can be
 * compared pixel-for-pixel against the handoff. In production these come from
 * the tasks endpoint (`project`, `owner`, `due`, `status`, `linkedRecord`,
 * `source`; blockers add `waitingOn` + `gates`; projects add budget/burn).
 */

export type Status = "todo" | "in_progress" | "review" | "done";
export type ProjectKey = "Q3" | "FDA" | "SHOP" | "REISHI";

export type Task = {
  id: string;
  label: string;
  pk: ProjectKey;
  owner: string;
  due: string;
  dueLabel: string;
  /** Day index on a Jul-anchored axis: Jul 20 = 20, Aug 1 = 32, blocked = 99. */
  day: number;
  status: Status;
  link: string;
  linkKind: string;
  source: string;
  blocked?: boolean;
  waiting?: string;
  gates?: number;
  mine?: boolean;
  aiMade?: boolean;
};

export type Project = {
  name: string;
  owner: string;
  due: string;
  percent: number;
  chip: "ON TRACK" | "AT RISK" | "ON HOLD";
  budget: string;
  spent: string;
  burn: number;
};

export type Suggestion = {
  id: string;
  verb: "Reschedule" | "Reassign" | "Create";
  text: string;
  why: string;
  apply:
    | { id: string; day?: number; dueLabel?: string; owner?: string }
    | { create: Task };
};

export type SavedView = {
  key: "v1" | "v2" | "v3" | "v4";
  label: string;
  hint: string;
};

export const OWNERS = [
  "Alex",
  "Maria",
  "Jenna",
  "Dev",
  "Tom",
  "Elena",
  "Sara",
  "Ops",
] as const;

export const STATUS_ORDER: Status[] = ["todo", "in_progress", "review", "done"];
export const STATUS_LABEL: Record<Status, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export const SHORT: Record<ProjectKey, string> = {
  Q3: "Q3 Retail",
  FDA: "FDA Audit",
  SHOP: "Shopify",
  REISHI: "Reishi",
};

/* prettier-ignore */
export const TASKS: Task[] = [
  { id: "t1", label: "Send revised Erewhon pricing", pk: "Q3", owner: "Alex", due: "Jul 20", dueLabel: "today", day: 20, status: "in_progress", link: "SO-1182", linkKind: "Sales order", source: "Email · Erewhon buyer", mine: true },
  { id: "t2", label: "Approve demo-day budget", pk: "Q3", owner: "Alex", due: "Jul 21", dueLabel: "Jul 21", day: 21, status: "todo", link: "APR-88", linkKind: "Approval · $6,200", source: "Approvals queue", mine: true },
  { id: "t3", label: "Launch PO plan — 12 stores", pk: "Q3", owner: "Maria", due: "Jul 25", dueLabel: "Jul 25", day: 25, status: "todo", link: "PO-2044", linkKind: "Purchase order · $18,400", source: "AI · reorder point hit" },
  { id: "t4", label: "Demo staffing — 12 stores", pk: "Q3", owner: "Jenna", due: "Jul 28", dueLabel: "Jul 28", day: 28, status: "todo", link: "", linkKind: "", source: "Meeting · Retail sync" },
  { id: "t5", label: "Retail-ready case packaging spec", pk: "Q3", owner: "Maria", due: "Jul 30", dueLabel: "Jul 30", day: 30, status: "todo", link: "WO-318", linkKind: "Work order", source: "Manufacturing" },
  { id: "t6", label: "Erewhon launch-day merchandising", pk: "Q3", owner: "Jenna", due: "Aug 1", dueLabel: "Aug 1", day: 32, status: "todo", link: "", linkKind: "", source: "Milestone · Erewhon launch" },
  { id: "t7", label: "Wholesale price list v3", pk: "Q3", owner: "Sara", due: "Aug 4", dueLabel: "Aug 4", day: 35, status: "todo", link: "", linkKind: "", source: "Finance" },
  { id: "t8", label: "SOP sign-off — sanitation", pk: "FDA", owner: "Tom", due: "", dueLabel: "", day: 99, status: "todo", blocked: true, waiting: "Tom · 9 days", link: "SOP-114", linkKind: "SOP document", source: "Compliance calendar", gates: 6 },
  { id: "t9", label: "SOP sign-off — allergen control", pk: "FDA", owner: "Maria", due: "", dueLabel: "", day: 99, status: "todo", blocked: true, waiting: "Maria · 6 days", link: "SOP-119", linkKind: "SOP document", source: "Compliance calendar", gates: 4 },
  { id: "t10", label: "Batch record template update", pk: "FDA", owner: "Elena", due: "Jul 23", dueLabel: "Jul 23", day: 23, status: "in_progress", link: "WO-318", linkKind: "Work order", source: "AI · created from Ops standup", aiMade: true },
  { id: "t11", label: "Supplier COA file audit", pk: "FDA", owner: "Elena", due: "Jul 25", dueLabel: "Jul 25", day: 25, status: "todo", link: "PO-2031", linkKind: "Purchase order", source: "AI · missing COA detected", aiMade: true },
  { id: "t12", label: "Pest-control log reconciliation", pk: "FDA", owner: "Tom", due: "Jul 28", dueLabel: "Jul 28", day: 28, status: "todo", link: "", linkKind: "", source: "Compliance calendar" },
  { id: "t13", label: "Recall mock-drill documentation", pk: "FDA", owner: "Maria", due: "Aug 1", dueLabel: "Aug 1", day: 32, status: "todo", link: "", linkKind: "", source: "Compliance calendar" },
  { id: "t14", label: "Mock audit walkthrough", pk: "FDA", owner: "Maria", due: "Aug 5", dueLabel: "Aug 5", day: 36, status: "review", link: "", linkKind: "", source: "Compliance calendar" },
  { id: "t15", label: "Cutover rehearsal", pk: "SHOP", owner: "Dev", due: "Jul 24", dueLabel: "Jul 24", day: 24, status: "in_progress", link: "", linkKind: "", source: "Migration plan" },
  { id: "t16", label: "Redirect map + SEO checks", pk: "SHOP", owner: "Dev", due: "Jul 26", dueLabel: "Jul 26", day: 26, status: "todo", link: "", linkKind: "", source: "Migration plan" },
  { id: "t17", label: "Subscription plans migration", pk: "SHOP", owner: "Dev", due: "Jul 29", dueLabel: "Jul 29", day: 29, status: "todo", link: "", linkKind: "", source: "Migration plan" },
  { id: "t18", label: "Go-live + DNS cutover", pk: "SHOP", owner: "Dev", due: "Jul 31", dueLabel: "Jul 31", day: 31, status: "review", link: "", linkKind: "", source: "Migration plan" },
  { id: "t19", label: "Follow up with Fresh Farms on COA", pk: "REISHI", owner: "Ops", due: "", dueLabel: "waiting 11d", day: 99, status: "todo", blocked: true, waiting: "Fresh Farms · 11 days", link: "PO-2031", linkKind: "Purchase order", source: "Vendor portal", gates: 3 },
  { id: "t20", label: "Product catalog migration", pk: "SHOP", owner: "Dev", due: "Jul 8", dueLabel: "Jul 8", day: 8, status: "done", link: "", linkKind: "", source: "Migration plan" },
  { id: "t21", label: "Payment + tax configuration", pk: "SHOP", owner: "Dev", due: "Jul 15", dueLabel: "Jul 15", day: 15, status: "done", link: "", linkKind: "", source: "AI · closed after QBO match", aiMade: true },
  { id: "t22", label: "Sprouts category review deck", pk: "Q3", owner: "Jenna", due: "Jul 12", dueLabel: "Jul 12", day: 12, status: "done", link: "", linkKind: "", source: "Retail sync" },
];

export const PROJ: Record<ProjectKey, Project> = {
  Q3: {
    name: "Q3 Retail Expansion",
    owner: "Alex",
    due: "Sep 15",
    percent: 62,
    chip: "ON TRACK",
    budget: "$24k",
    spent: "$13.8k",
    burn: 58,
  },
  FDA: {
    name: "FDA Facility Audit Prep",
    owner: "Maria",
    due: "Aug 15",
    percent: 38,
    chip: "AT RISK",
    budget: "$16k",
    spent: "$9.2k",
    burn: 58,
  },
  SHOP: {
    name: "Shopify Migration",
    owner: "Dev",
    due: "Jul 31",
    percent: 84,
    chip: "ON TRACK",
    budget: "$40k",
    spent: "$36.1k",
    burn: 90,
  },
  REISHI: {
    name: "Reishi Reformulation",
    owner: "Ops",
    due: "Paused",
    percent: 20,
    chip: "ON HOLD",
    budget: "$12k",
    spent: "$2.4k",
    burn: 20,
  },
};

export const PROJECT_KEYS: ProjectKey[] = ["Q3", "FDA", "SHOP", "REISHI"];

export const AI_SUGGESTIONS: Suggestion[] = [
  {
    id: "s1",
    verb: "Reschedule",
    text: "Move Cutover rehearsal to Jul 26 — PO-2044 ETA slipped",
    why: "Vendor confirmation came in 2 days late",
    apply: { id: "t15", day: 26, dueLabel: "Jul 26" },
  },
  {
    id: "s2",
    verb: "Reassign",
    text: "Give Pest-control log reconciliation to Elena",
    why: "Tom holds 2 blockers already",
    apply: { id: "t12", owner: "Elena" },
  },
  {
    id: "s3",
    verb: "Create",
    text: "Add Erewhon launch-day staffing confirm",
    why: "Launch milestone has no owner task in week of Aug 1",
    apply: {
      create: {
        id: "n1",
        label: "Erewhon launch-day staffing confirm",
        pk: "Q3",
        owner: "Jenna",
        due: "Jul 29",
        dueLabel: "Jul 29",
        day: 29,
        status: "todo",
        link: "",
        linkKind: "",
        source: "AI · milestone gap",
      },
    },
  },
];

export const SAVED_VIEWS: SavedView[] = [
  { key: "v1", label: "My day", hint: "mine · due ≤ 7d" },
  { key: "v2", label: "Blocked", hint: "waiting on others" },
  { key: "v3", label: "Audit prep", hint: "FDA · all owners" },
  { key: "v4", label: "Money out", hint: "POs + approvals" },
];

/** 1B blocker cards — what each blocker gates and how it is being chased. */
export const BLOCKER_IDS = ["t8", "t9", "t19"] as const;
export const BLOCKER_DOWNSTREAM: Record<string, string[]> = {
  t8: [
    "Batch record template update",
    "Supplier COA file audit",
    "Pest-control log reconciliation",
    "Recall mock-drill documentation",
    "Mock audit walkthrough",
    "Audit binder assembly",
  ],
  t9: [
    "Allergen matrix refresh",
    "Label review — 4 SKUs",
    "Line changeover SOP",
    "Mock audit walkthrough",
  ],
  t19: [
    "Reishi trial batch WO-322",
    "Reformulation cost model",
    "Reishi launch date",
  ],
};
export const BLOCKER_META: Record<
  string,
  { days: number; channel: string; impact: string }
> = {
  t8: {
    days: 9,
    channel: "Slack DM · read Jul 17",
    impact: "Pushes FDA audit past Aug 15 in 3 days",
  },
  t9: {
    days: 6,
    channel: "Email · no reply",
    impact: "Label review can't start",
  },
  t19: {
    days: 11,
    channel: "Vendor portal · Fresh Farms",
    impact: "Reishi reformulation frozen",
  },
};

/** 1D timeline — project end day on the Jul-20-anchored axis. */
export const PROJECT_END_DAY: Record<ProjectKey, number> = {
  Q3: 77,
  FDA: 46,
  SHOP: 31,
  REISHI: 40,
};
