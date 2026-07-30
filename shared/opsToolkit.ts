// ============================================================================
// Ops Toolkit — shared types for the Stackby-style capabilities layered on top
// of the ERP: saved views, intake forms, lightweight automations, and pivot
// reports. Imported by both the React client and the Express/tRPC server so the
// JSON-column shapes stay in sync on both sides.
// ============================================================================

// ---------------------------------------------------------------------------
// Item 1 — Saved views (grid / kanban / calendar / timeline over module data)
// ---------------------------------------------------------------------------

export type ViewType = "grid" | "kanban" | "calendar" | "timeline";

export interface ViewConfig {
  /** Field used to bucket records into kanban columns / timeline lanes. */
  groupByField?: string;
  /** Field (ISO date-ish) used to place records on the calendar / timeline. */
  dateField?: string;
  /** End-date field for timeline bars (falls back to dateField). */
  endDateField?: string;
  /** Field rendered as the card / row title. */
  titleField?: string;
  /** Secondary fields shown on kanban / gallery cards. */
  subtitleFields?: string[];
  /** Explicit ordering of group buckets (kanban columns). */
  groupOrder?: string[];
  /** Columns hidden in grid mode. */
  hiddenColumns?: string[];
  /** Simple client-side filters (ANDed). */
  filters?: ViewFilter[];
  /** Sort applied before rendering. */
  sort?: { field: string; dir: "asc" | "desc" };
}

export interface ViewFilter {
  field: string;
  op: FilterOp;
  value: string | number | boolean | null;
}

export type FilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "not_empty";

// ---------------------------------------------------------------------------
// Item 2 — Intake forms
// ---------------------------------------------------------------------------

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox";

export interface FormField {
  /** Stable key used in the submission payload. */
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  /** Options for select / multiselect. */
  options?: string[];
}

// ---------------------------------------------------------------------------
// Item 3 — Automations (trigger -> conditions -> action)
// ---------------------------------------------------------------------------

export type AutomationTriggerType =
  | "record_created"
  | "record_updated"
  | "field_changed"
  | "form_submitted"
  | "scheduled";

export interface AutomationTriggerConfig {
  /** For field_changed: which field to watch. */
  field?: string;
  /** For field_changed: only fire when the field becomes this value. */
  toValue?: string;
  /** For form_submitted: the intake form id. */
  formId?: number;
  /** For scheduled: cron-ish expression (informational; engine runs on demand). */
  cron?: string;
}

export type AutomationConditionOp = FilterOp;

export interface AutomationCondition {
  field: string;
  op: AutomationConditionOp;
  value?: string | number | boolean | null;
}

export type AutomationActionType =
  | "send_email"
  | "create_notification"
  | "webhook";

export interface AutomationActionConfig {
  // send_email
  to?: string;
  subject?: string;
  body?: string;
  // create_notification
  notifyUserId?: number;
  message?: string;
  // webhook
  url?: string;
}

// ---------------------------------------------------------------------------
// Item 4 — Pivot reports
// ---------------------------------------------------------------------------

export type PivotAggregation = "count" | "sum" | "avg" | "min" | "max";

export interface PivotConfig {
  /** Field whose distinct values become pivot rows. */
  rowField: string;
  /** Optional field whose distinct values become pivot columns. */
  colField?: string;
  /** Field aggregated into each cell (not needed for count). */
  valueField?: string;
  aggregation: PivotAggregation;
  filters?: ViewFilter[];
}

// A single evaluated pivot cell/grid, returned by the client pivot engine.
export interface PivotResult {
  rowKeys: string[];
  colKeys: string[];
  /** cells[rowKey][colKey] = aggregated number. */
  cells: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

// ---------------------------------------------------------------------------
// Module registry — the ERP datasets these tools can point at. Keeping this in
// shared code lets both the view/report pickers and the automation engine agree
// on which modules exist and which tRPC query feeds each.
// ---------------------------------------------------------------------------

export interface ModuleDescriptor {
  key: string;
  label: string;
}

export const OPS_TOOLKIT_MODULES: ModuleDescriptor[] = [
  { key: "orders", label: "Orders" },
  { key: "recruiting", label: "Recruiting" },
  { key: "grants", label: "Grants" },
  { key: "procurement", label: "Procurement (POs)" },
  { key: "custom", label: "Custom / Form intake" },
];
