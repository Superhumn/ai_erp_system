// Item 4 — self-serve pivot/report builder. Configure row/column/value fields +
// aggregation over any ERP dataset, render as a heat-shaded matrix, and save the
// configuration as a named report via the opsReports tRPC router.

import { useMemo, useState, useEffect, type ReactNode } from "react";
import { Save, Trash2, Loader2, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PivotConfig, PivotAggregation } from "@shared/opsToolkit";
import { computePivot } from "@/lib/opsToolkit/pivot";
import { inferColumns, numberFields, type Row } from "@/lib/opsToolkit/viewData";

interface PivotTableProps {
  module: string;
  rows: Row[];
  isLoading?: boolean;
}

const AGGS: { value: PivotAggregation; label: string }[] = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

const NONE = "__none";

export default function PivotTable({ module, rows, isLoading }: PivotTableProps) {
  const columns = useMemo(() => inferColumns(rows), [rows]);
  const numCols = useMemo(() => numberFields(columns), [columns]);

  const [config, setConfig] = useState<PivotConfig>({
    rowField: "",
    colField: undefined,
    valueField: undefined,
    aggregation: "count",
  });
  const [reportName, setReportName] = useState("");
  const [activeReportId, setActiveReportId] = useState<number | null>(null);

  useEffect(() => {
    setConfig((c) => ({
      ...c,
      rowField: c.rowField || columns.find((k) => /status|stage|type|category/i.test(k.key))?.key || columns[0]?.key || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length]);

  const utils = trpc.useUtils();
  const { data: savedReports } = trpc.opsReports.list.useQuery({ module });
  const createReport = trpc.opsReports.create.useMutation({
    onSuccess: () => { toast.success("Report saved"); setReportName(""); utils.opsReports.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteReport = trpc.opsReports.delete.useMutation({
    onSuccess: () => { toast.success("Report deleted"); setActiveReportId(null); utils.opsReports.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const result = useMemo(() => {
    if (!config.rowField) return null;
    try { return computePivot(rows, config); } catch { return null; }
  }, [rows, config]);

  const maxCell = useMemo(() => {
    if (!result) return 0;
    let m = 0;
    for (const rk of result.rowKeys) for (const ck of result.colKeys) m = Math.max(m, Math.abs(result.cells[rk][ck]));
    return m || 1;
  }, [result]);

  function applyReport(id: string) {
    const r = savedReports?.find((s) => String(s.id) === id);
    if (!r) return;
    setActiveReportId(r.id);
    setConfig((r.pivotConfig as PivotConfig) || config);
  }

  function saveReport() {
    if (!reportName.trim()) { toast.error("Name your report first"); return; }
    if (!config.rowField) { toast.error("Choose a row field first"); return; }
    createReport.mutate({ module, name: reportName.trim(), pivotConfig: config });
  }

  function exportCsv() {
    if (!result) return;
    const header = ["", ...result.colKeys, "Total"];
    const lines = [header.join(",")];
    for (const rk of result.rowKeys) {
      const cells = result.colKeys.map((ck) => result.cells[rk][ck]);
      lines.push([csv(rk), ...cells, result.rowTotals[rk]].join(","));
    }
    lines.push(["Total", ...result.colKeys.map((ck) => result.colTotals[ck]), result.grandTotal].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${module}-report.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Config bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <ConfigField label="Rows">
          <Select value={config.rowField || undefined} onValueChange={(v) => setConfig((c) => ({ ...c, rowField: v }))}>
            <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Field" /></SelectTrigger>
            <SelectContent>{columns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </ConfigField>
        <ConfigField label="Columns">
          <Select
            value={config.colField ?? NONE}
            onValueChange={(v) => setConfig((c) => ({ ...c, colField: v === NONE ? undefined : v }))}
          >
            <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="(none)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>(none)</SelectItem>
              {columns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </ConfigField>
        <ConfigField label="Measure">
          <Select value={config.aggregation} onValueChange={(v) => setConfig((c) => ({ ...c, aggregation: v as PivotAggregation }))}>
            <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>{AGGS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
        </ConfigField>
        {config.aggregation !== "count" && (
          <ConfigField label="Of field">
            <Select value={config.valueField ?? NONE} onValueChange={(v) => setConfig((c) => ({ ...c, valueField: v === NONE ? undefined : v }))}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Numeric field" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>(choose)</SelectItem>
                {numCols.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </ConfigField>
        )}
        <div className="ml-auto flex items-end gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCsv} disabled={!result}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {/* Saved reports row */}
      <div className="flex flex-wrap items-center gap-2">
        {savedReports && savedReports.length > 0 && (
          <Select value={activeReportId ? String(activeReportId) : undefined} onValueChange={applyReport}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Saved reports" /></SelectTrigger>
            <SelectContent>{savedReports.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {activeReportId && (
          <Button size="icon-sm" variant="ghost" title="Delete report" onClick={() => deleteReport.mutate({ id: activeReportId })}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Input value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="Save report as…" className="h-8 w-[160px]" />
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={saveReport} disabled={createReport.isPending}>
            {createReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </div>
      </div>

      {/* Pivot grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>
      ) : !result || result.rowKeys.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">Choose a row field to build a report.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left font-medium">{labelFor(columns, config.rowField)}</th>
                {result.colKeys.map((ck) => <th key={ck} className="p-2 text-right font-medium capitalize">{ck.replace(/_/g, " ")}</th>)}
                <th className="p-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.rowKeys.map((rk) => (
                <tr key={rk} className="border-b last:border-0">
                  <td className="p-2 font-medium capitalize">{rk.replace(/_/g, " ")}</td>
                  {result.colKeys.map((ck) => {
                    const val = result.cells[rk][ck];
                    const intensity = Math.min(1, Math.abs(val) / maxCell);
                    return (
                      <td key={ck} className="p-2 text-right tabular-nums" style={{ backgroundColor: `rgba(99,102,241,${intensity * 0.28})` }}>
                        {fmt(val)}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-semibold tabular-nums">{fmt(result.rowTotals[rk])}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/50">
                <td className="p-2 font-semibold">Total</td>
                {result.colKeys.map((ck) => <td key={ck} className="p-2 text-right font-semibold tabular-nums">{fmt(result.colTotals[ck])}</td>)}
                <td className="p-2 text-right font-semibold tabular-nums">{fmt(result.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConfigField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function labelFor(columns: { key: string; label: string }[], key: string) {
  return columns.find((c) => c.key === key)?.label || key;
}
function fmt(n: number) {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function csv(s: string) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
