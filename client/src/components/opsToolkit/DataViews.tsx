// Item 1 — reusable multi-view surface (grid / kanban / calendar / timeline)
// over any array of ERP records. Persists named views per module via the
// opsViews tRPC router. Drop it onto any page that already has list data.

import { useMemo, useState, useEffect } from "react";
import {
  LayoutGrid, Table as TableIcon, Calendar as CalendarIcon, GanttChartSquare,
  ChevronLeft, ChevronRight, Save, Trash2, Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { ViewConfig, ViewType } from "@shared/opsToolkit";
import {
  inferColumns, groupableFields, dateFields, groupRows, prepareRows,
  coerceDate, displayValue, type Row, type ColumnDescriptor,
} from "@/lib/opsToolkit/viewData";

interface DataViewsProps {
  module: string;
  rows: Row[];
  isLoading?: boolean;
  /** Field rendered as each card/row title. Auto-detected if omitted. */
  titleField?: string;
  defaultGroupByField?: string;
  defaultDateField?: string;
}

const VIEW_TABS: { type: ViewType; label: string; icon: typeof LayoutGrid }[] = [
  { type: "grid", label: "Grid", icon: TableIcon },
  { type: "kanban", label: "Kanban", icon: LayoutGrid },
  { type: "calendar", label: "Calendar", icon: CalendarIcon },
  { type: "timeline", label: "Timeline", icon: GanttChartSquare },
];

function pickTitleField(cols: ColumnDescriptor[], preferred?: string): string {
  if (preferred) return preferred;
  const byName = cols.find((c) => /name$|number$|title$|subject$/i.test(c.key));
  return byName?.key || cols[0]?.key || "id";
}

export default function DataViews({
  module, rows, isLoading, titleField, defaultGroupByField, defaultDateField,
}: DataViewsProps) {
  const columns = useMemo(() => inferColumns(rows), [rows]);
  const groupCols = useMemo(() => groupableFields(columns), [columns]);
  const dateCols = useMemo(() => dateFields(columns), [columns]);
  const resolvedTitle = useMemo(() => pickTitleField(columns, titleField), [columns, titleField]);

  const [viewType, setViewType] = useState<ViewType>("grid");
  const [config, setConfig] = useState<ViewConfig>({
    groupByField: defaultGroupByField,
    dateField: defaultDateField,
    titleField,
  });
  const [newViewName, setNewViewName] = useState("");
  const [activeViewId, setActiveViewId] = useState<number | null>(null);

  // Sensible defaults once columns are known.
  useEffect(() => {
    setConfig((c) => ({
      ...c,
      groupByField: c.groupByField || defaultGroupByField || groupCols.find((g) => /status|stage|state|type/i.test(g.key))?.key || groupCols[0]?.key,
      dateField: c.dateField || defaultDateField || dateCols[0]?.key,
      titleField: c.titleField || resolvedTitle,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length]);

  const utils = trpc.useUtils();
  const { data: savedViews } = trpc.opsViews.list.useQuery({ module });
  const createView = trpc.opsViews.create.useMutation({
    onSuccess: () => { toast.success("View saved"); setNewViewName(""); utils.opsViews.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteView = trpc.opsViews.delete.useMutation({
    onSuccess: () => { toast.success("View deleted"); setActiveViewId(null); utils.opsViews.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const prepared = useMemo(() => prepareRows(rows, config), [rows, config]);

  function applySavedView(id: string) {
    const v = savedViews?.find((s) => String(s.id) === id);
    if (!v) return;
    setActiveViewId(v.id);
    setViewType(v.viewType as ViewType);
    setConfig((v.config as ViewConfig) || {});
  }

  function saveCurrentView() {
    if (!newViewName.trim()) { toast.error("Name your view first"); return; }
    createView.mutate({ module, name: newViewName.trim(), viewType, config });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
          {VIEW_TABS.map((t) => (
            <Button
              key={t.type}
              size="sm"
              variant={viewType === t.type ? "default" : "ghost"}
              className="h-8 gap-1.5"
              onClick={() => setViewType(t.type)}
            >
              <t.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </Button>
          ))}
        </div>

        {(viewType === "kanban") && (
          <FieldSelect
            label="Group by"
            value={config.groupByField}
            options={groupCols}
            onChange={(v) => setConfig((c) => ({ ...c, groupByField: v }))}
          />
        )}
        {(viewType === "calendar" || viewType === "timeline") && (
          <FieldSelect
            label="Date"
            value={config.dateField}
            options={dateCols}
            onChange={(v) => setConfig((c) => ({ ...c, dateField: v }))}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {savedViews && savedViews.length > 0 && (
            <Select value={activeViewId ? String(activeViewId) : undefined} onValueChange={applySavedView}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Saved views" /></SelectTrigger>
              <SelectContent>
                {savedViews.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeViewId && (
            <Button size="icon-sm" variant="ghost" title="Delete view" onClick={() => deleteView.mutate({ id: activeViewId })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Input
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            placeholder="Save view as…"
            className="h-8 w-[140px]"
          />
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={saveCurrentView} disabled={createView.isPending}>
            {createView.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : prepared.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No records to display.
        </div>
      ) : (
        <>
          {viewType === "grid" && <GridView rows={prepared} columns={columns} />}
          {viewType === "kanban" && <KanbanView rows={prepared} config={config} titleField={config.titleField || resolvedTitle} groupCols={groupCols} />}
          {viewType === "calendar" && <CalendarView rows={prepared} config={config} titleField={config.titleField || resolvedTitle} />}
          {viewType === "timeline" && <TimelineView rows={prepared} config={config} titleField={config.titleField || resolvedTitle} />}
        </>
      )}
    </div>
  );
}

function FieldSelect({ label, value, options, onChange }: {
  label: string; value?: string; options: ColumnDescriptor[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Select field" /></SelectTrigger>
        <SelectContent>
          {options.length === 0 && <SelectItem value="__none" disabled>No fields</SelectItem>}
          {options.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---- Grid ----
function GridView({ rows, columns }: { rows: Row[]; columns: ColumnDescriptor[] }) {
  const cols = columns.slice(0, 8);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {cols.map((c) => (
                <TableCell key={c.key} className={cn(c.kind === "number" && "tabular-nums")}>
                  {displayValue(row[c.key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Kanban ----
function KanbanView({ rows, config, titleField, groupCols }: {
  rows: Row[]; config: ViewConfig; titleField: string; groupCols: ColumnDescriptor[];
}) {
  if (!config.groupByField) {
    return <p className="text-sm text-muted-foreground">Pick a “Group by” field to build the board.</p>;
  }
  const groups = groupRows(rows, config);
  const subtitleCols = groupCols.filter((c) => c.key !== config.groupByField && c.key !== titleField).slice(0, 2);
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {groups.map((g) => (
        <div key={g.key} className="w-72 shrink-0">
          <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-3 py-1.5">
            <span className="text-sm font-medium capitalize">{g.key.replace(/_/g, " ")}</span>
            <Badge variant="secondary">{g.rows.length}</Badge>
          </div>
          <div className="space-y-2">
            {g.rows.map((row, i) => (
              <Card key={i} className="border-l-2 border-l-primary/50">
                <CardContent className="space-y-1 p-3">
                  <p className="text-sm font-medium leading-snug">{displayValue(row[titleField]) || "Untitled"}</p>
                  {subtitleCols.map((c) => {
                    const v = displayValue(row[c.key]);
                    return v ? <p key={c.key} className="text-xs text-muted-foreground">{c.label}: {v}</p> : null;
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Calendar (month grid) ----
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarView({ rows, config, titleField }: { rows: Row[]; config: ViewConfig; titleField: string }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  if (!config.dateField) {
    return <p className="text-sm text-muted-foreground">Pick a “Date” field to place records on the calendar.</p>;
  }
  const field = config.dateField;

  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const d = coerceDate(row[field]);
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }, [rows, field]);

  const monthStart = cursor;
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - monthStart.getDay());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d;
  });
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b p-2">
        <Button size="icon-sm" variant="ghost" onClick={() => setCursor((c) => addMonths(c, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setCursor((c) => addMonths(c, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const items = byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) || [];
          return (
            <div key={i} className={cn("min-h-[84px] border-b border-r p-1", !inMonth && "bg-muted/30 text-muted-foreground")}>
              <div className="mb-1 text-right text-xs">{d.getDate()}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((row, j) => (
                  <div key={j} className="truncate rounded bg-primary/10 px-1 py-0.5 text-[11px] text-primary" title={displayValue(row[titleField])}>
                    {displayValue(row[titleField]) || "Untitled"}
                  </div>
                ))}
                {items.length > 3 && <div className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Timeline (chronological, grouped by month) ----
function TimelineView({ rows, config, titleField }: { rows: Row[]; config: ViewConfig; titleField: string }) {
  if (!config.dateField) {
    return <p className="text-sm text-muted-foreground">Pick a “Date” field to build the timeline.</p>;
  }
  const field = config.dateField;
  const dated = rows
    .map((row) => ({ row, date: coerceDate(row[field]) }))
    .filter((x): x is { row: Row; date: Date } => x.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (dated.length === 0) {
    return <p className="text-sm text-muted-foreground">No records have a value for this date field.</p>;
  }

  const groups: { label: string; items: { row: Row; date: Date }[] }[] = [];
  for (const item of dated) {
    const label = item.date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
    g.items.push(item);
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">{g.label}</h4>
          <div className="relative space-y-2 border-l-2 border-muted pl-4">
            {g.items.map((item, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex items-baseline justify-between rounded-md border bg-card px-3 py-1.5">
                  <span className="text-sm">{displayValue(item.row[titleField]) || "Untitled"}</span>
                  <span className="text-xs text-muted-foreground">{item.date.toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
