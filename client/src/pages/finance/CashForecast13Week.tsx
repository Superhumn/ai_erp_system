import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Direction = "in" | "out";
interface Adjustment {
  label: string;
  amount: number;
  direction: Direction;
  date: string;
}

const IN_ROWS = [
  ["customer_receipts", "Customer invoices"],
  ["recurring_billing", "Recurring billing"],
  ["adjustment_in", "Manual inflows"],
] as const;
const OUT_ROWS = [
  ["vendor_bills", "Vendor bills"],
  ["purchase_orders", "Open purchase orders"],
  ["payroll", "Payroll"],
  ["adjustment_out", "Manual outflows"],
] as const;

const STORAGE_KEY = "cashForecast13w.v1";

function loadSaved(): { startingCash: string; adjustments: Adjustment[] } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { startingCash: "", adjustments: [] };
    const parsed = JSON.parse(raw);
    return {
      startingCash: typeof parsed.startingCash === "string" ? parsed.startingCash : "",
      adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
    };
  } catch {
    return { startingCash: "", adjustments: [] };
  }
}

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money = (n: number) => usd0.format(Math.round(n));
const cell = (n: number | undefined) => (n ? usd0.format(Math.round(n)) : "–");
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function CashForecast13Week() {
  const saved = useMemo(loadSaved, []);
  const [startingCashText, setStartingCashText] = useState(saved.startingCash);
  const [adjustments, setAdjustments] = useState<Adjustment[]>(saved.adjustments);
  const [draft, setDraft] = useState<Adjustment>({ label: "", amount: 0, direction: "out", date: todayIso() });
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ startingCash: startingCashText, adjustments }));
    } catch {
      /* storage unavailable — keep in memory only */
    }
  }, [startingCashText, adjustments]);

  const override = startingCashText.trim() === "" ? null : Number(startingCashText.replace(/[$,\s]/g, ""));
  const input = {
    startingCashOverride: override !== null && Number.isFinite(override) ? override : null,
    adjustments,
  };
  const { data, isLoading, error, refetch, isFetching } = trpc.cashForecast.get.useQuery(input);

  const chartData = useMemo(
    () => (data?.weeks ?? []).map((w) => ({ week: `W${w.index}`, label: shortDate(w.start), cash: w.closingCash })),
    [data],
  );

  const addAdjustment = () => {
    if (!draft.label.trim() || !(draft.amount > 0) || !draft.date) return;
    setAdjustments((a) => [...a, { ...draft, label: draft.label.trim() }]);
    setDraft({ label: "", amount: 0, direction: draft.direction, date: draft.date });
  };

  const week = data && selectedWeek ? data.weeks[selectedWeek - 1] : null;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Starting cash (blank = live bank balance)</label>
          <Input
            className="w-48 h-8 text-sm"
            placeholder={data?.cashSource === "mercury" ? money(data.startingCash) : "$0"}
            value={startingCashText}
            onChange={(e) => setStartingCashText(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {data && (
          <Badge variant="secondary" className="text-xs">
            {data.cashSource === "mercury" ? "Bank balance: Mercury" : data.cashSource === "manual" ? "Starting cash: manual" : "No bank balance"}
          </Badge>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading forecast…</p>}
      {error && <p className="text-sm text-destructive">Could not load forecast: {error.message}</p>}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="Starting cash" value={money(data.startingCash)} />
            <Tile label="Money in (13 wks)" value={money(data.totalIn)} />
            <Tile label="Money out (13 wks)" value={money(data.totalOut)} />
            <Tile
              label={`Lowest point (W${data.lowestWeek})`}
              value={money(data.lowestCash)}
              danger={data.lowestCash < 0}
            />
            <Tile label="Cash at week 13" value={money(data.endingCash)} danger={data.endingCash < 0} />
          </div>

          {data.firstNegativeWeek && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Cash goes below zero in week {data.firstNegativeWeek} (
              {shortDate(data.weeks[data.firstNegativeWeek - 1].start)}).
            </div>
          )}

          {/* Chart */}
          <Card>
            <CardContent className="pt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} width={56} />
                  <Tooltip formatter={(v: number) => money(v)} labelFormatter={(l) => `Week of ${l}`} />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="cash" name="Closing cash" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Weekly table */}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-muted/50">
                <tr>
                  <th className="sticky left-0 bg-muted/50 px-2 py-2 text-left font-medium min-w-[150px]">Week of</th>
                  {data.weeks.map((w) => (
                    <th key={w.index} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                      <button
                        className={`underline-offset-2 hover:underline ${selectedWeek === w.index ? "text-primary underline" : ""}`}
                        onClick={() => setSelectedWeek(selectedWeek === w.index ? null : w.index)}
                      >
                        W{w.index} · {shortDate(w.start)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Opening cash" values={data.weeks.map((w) => w.openingCash)} bold />
                <SectionRow label="Money in" span={data.weeks.length} />
                {IN_ROWS.map(([k, label]) => (
                  <Row key={k} label={label} values={data.weeks.map((w) => w.inflows[k] ?? 0)} indent />
                ))}
                <Row label="Total in" values={data.weeks.map((w) => w.totalIn)} bold />
                <SectionRow label="Money out" span={data.weeks.length} />
                {OUT_ROWS.map(([k, label]) => (
                  <Row key={k} label={label} values={data.weeks.map((w) => w.outflows[k] ?? 0)} indent />
                ))}
                <Row label="Total out" values={data.weeks.map((w) => w.totalOut)} bold />
                <Row label="Net change" values={data.weeks.map((w) => w.net)} signed />
                <Row label="Closing cash" values={data.weeks.map((w) => w.closingCash)} bold signed highlight />
              </tbody>
            </table>
          </div>

          {/* Week detail */}
          {week && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="text-sm font-semibold">
                  Week {week.index}: {week.start} to {week.end}
                </div>
                {week.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No scheduled cash movements.</p>
                ) : (
                  <table className="w-full text-xs tabular-nums">
                    <tbody>
                      {week.events.map((e, i) => (
                        <tr key={`${e.ref}-${i}`} className="border-b border-border/40 last:border-0">
                          <td className="py-1 pr-2 whitespace-nowrap">{e.date}</td>
                          <td className="py-1 pr-2">
                            {e.label}
                            {e.overdue && <Badge variant="destructive" className="ml-2 text-[10px] px-1 py-0">past due</Badge>}
                          </td>
                          <td className={`py-1 text-right whitespace-nowrap ${e.direction === "in" ? "text-emerald-600" : "text-destructive"}`}>
                            {e.direction === "in" ? "+" : "−"}
                            {money(e.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Manual items */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <div className="text-sm font-semibold">Manual items</div>
                <p className="text-xs text-muted-foreground">
                  Add cash the system can't see: legal reserves, funding closes, one-off costs. Saved in this browser.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  className="h-8 w-56 text-sm"
                  placeholder="Description"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
                <Input
                  className="h-8 w-32 text-sm"
                  placeholder="Amount"
                  type="number"
                  min={0}
                  value={draft.amount || ""}
                  onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                />
                <Select value={draft.direction} onValueChange={(v) => setDraft({ ...draft, direction: v as Direction })}>
                  <SelectTrigger className="h-8 w-28 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="out">Money out</SelectItem>
                    <SelectItem value="in">Money in</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 w-40 text-sm"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
                <Button size="sm" onClick={addAdjustment}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
              {adjustments.length > 0 && (
                <table className="w-full text-xs tabular-nums">
                  <tbody>
                    {adjustments.map((a, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        <td className="py-1 pr-2 whitespace-nowrap">{a.date}</td>
                        <td className="py-1 pr-2">{a.label}</td>
                        <td className={`py-1 pr-2 text-right ${a.direction === "in" ? "text-emerald-600" : "text-destructive"}`}>
                          {a.direction === "in" ? "+" : "−"}
                          {money(a.amount)}
                        </td>
                        <td className="py-1 w-8 text-right">
                          <button
                            aria-label="Remove"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setAdjustments(adjustments.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {data.notes.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={`text-base font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <td className="sticky left-0 bg-background px-2 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </td>
      <td colSpan={span} />
    </tr>
  );
}

function Row({
  label,
  values,
  bold,
  indent,
  signed,
  highlight,
}: {
  label: string;
  values: number[];
  bold?: boolean;
  indent?: boolean;
  signed?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={`border-t border-border/40 ${highlight ? "bg-muted/40" : ""}`}>
      <td
        className={`sticky left-0 px-2 py-1.5 whitespace-nowrap ${highlight ? "bg-muted/40" : "bg-background"} ${bold ? "font-semibold" : ""} ${indent ? "pl-5" : ""}`}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-2 py-1.5 text-right whitespace-nowrap ${bold ? "font-semibold" : ""} ${signed && v < 0 ? "text-destructive" : ""}`}
        >
          {bold || signed ? money(v) : cell(v)}
        </td>
      ))}
    </tr>
  );
}
