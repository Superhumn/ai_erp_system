import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, Download, Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { downloadExport } from "@/lib/downloadExport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScenariosPanel, type ScenarioKnobs, type ScenarioDraft } from "./cashForecast/Scenarios";
import { RecurringExpensesPanel } from "./cashForecast/RecurringExpenses";
import { AccuracyPanel } from "./cashForecast/Accuracy";
import { CollectionsPanel } from "./cashForecast/Collections";
import { CashSettingsPanel } from "./cashForecast/Settings";
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
import { useAuth } from "@/_core/hooks/useAuth";
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
  ["recurring_expenses", "Recurring expenses"],
  ["adjustment_out", "Manual outflows"],
] as const;

// Mirrors the server's adjustment schema so stale or edited storage can never
// produce a request that fails validation.
const MAX_ADJUSTMENTS = 100;
const MAX_LABEL = 200;
const MAX_AMOUNT = 1e12;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Saved state is keyed by user and home entity so one browser never leaks one person's assumptions to the next. */
const storageKey = (userId: number, companyId: number | null) => `cashForecast13w.v2.u${userId}.c${companyId ?? "none"}`;

function sanitizeAdjustment(raw: unknown): Adjustment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim().slice(0, MAX_LABEL) : "";
  const amount = typeof r.amount === "number" ? r.amount : Number(r.amount);
  const direction = r.direction === "in" || r.direction === "out" ? r.direction : null;
  const date = typeof r.date === "string" && DATE_RE.test(r.date) ? r.date : null;
  if (!label || !direction || !date || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  return { label, amount, direction, date };
}

function loadSaved(key: string): { startingCash: string; adjustments: Adjustment[] } {
  const empty = { startingCash: "", adjustments: [] as Adjustment[] };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.adjustments) ? parsed.adjustments : [];
    return {
      startingCash: typeof parsed?.startingCash === "string" ? parsed.startingCash : "",
      adjustments: list.map(sanitizeAdjustment).filter((a: Adjustment | null): a is Adjustment => a !== null).slice(0, MAX_ADJUSTMENTS),
    };
  } catch {
    return empty;
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
  const { user } = useAuth();
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [knobs, setKnobs] = useState<ScenarioKnobs>({});
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioDraft>({ startingCash: "", adjustments: [] });
  if (!user) return null;
  const isAdmin = user.role === "admin";
  return (
    <Tabs defaultValue="forecast" className="space-y-3">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="forecast">Forecast</TabsTrigger>
        <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
        <TabsTrigger value="expenses">Recurring expenses</TabsTrigger>
        <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
        <TabsTrigger value="collections">Collections</TabsTrigger>
        <TabsTrigger value="settings">Alerts &amp; banks</TabsTrigger>
      </TabsList>
      <TabsContent value="forecast">
        <CashForecastPanel storageKey={storageKey(user.id, user.companyId ?? null)} scenarioId={scenarioId} knobs={knobs} scenarioDraft={scenarioDraft} />
      </TabsContent>
      <TabsContent value="scenarios">
        <ScenariosPanel scenarioId={scenarioId} onSelect={setScenarioId} knobs={knobs} onKnobs={setKnobs} draft={scenarioDraft} onDraft={setScenarioDraft} />
      </TabsContent>
      <TabsContent value="expenses">
        <RecurringExpensesPanel />
      </TabsContent>
      <TabsContent value="accuracy">
        <AccuracyPanel />
      </TabsContent>
      <TabsContent value="collections">
        <CollectionsPanel />
      </TabsContent>
      <TabsContent value="settings">
        <CashSettingsPanel isAdmin={isAdmin} />
      </TabsContent>
    </Tabs>
  );
}

function CashForecastPanel({ storageKey, scenarioId, knobs, scenarioDraft }: { storageKey: string; scenarioId: number | null; knobs: ScenarioKnobs; scenarioDraft: ScenarioDraft }) {
  const saved = useMemo(() => loadSaved(storageKey), [storageKey]);
  const [startingCashText, setStartingCashText] = useState(saved.startingCash);
  const [adjustments, setAdjustments] = useState<Adjustment[]>(saved.adjustments);
  const [draft, setDraft] = useState<Adjustment>({ label: "", amount: 0, direction: "out", date: todayIso() });
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ startingCash: startingCashText, adjustments }));
    } catch {
      /* storage unavailable — keep in memory only */
    }
  }, [storageKey, startingCashText, adjustments]);

  const resetSaved = () => {
    setStartingCashText("");
    setAdjustments([]);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* nothing to clear */
    }
  };

  // Starting cash: this panel's box wins, then the Scenarios tab's live draft, then the bank.
  const parseCash = (t: string) => {
    const n = t.trim() === "" ? null : Number(t.replace(/[$,\s]/g, ""));
    return n !== null && Number.isFinite(n) ? n : null;
  };
  const override = parseCash(startingCashText) ?? parseCash(scenarioDraft.startingCash);
  const hasKnobs = Object.values(knobs).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== 0));
  // With a saved scenario selected, knobs are always sent (including 0 / []) so a live edit can clear a saved value.
  const input = {
    startingCashOverride: override,
    adjustments: [...scenarioDraft.adjustments, ...adjustments],
    scenarioId: scenarioId ?? undefined,
    knobs: scenarioId != null || hasKnobs ? { arSlipDays: knobs.arSlipDays ?? 0, arHaircutPct: knobs.arHaircutPct ?? 0, apSlipDays: knobs.apSlipDays ?? 0, excludeCustomerIds: knobs.excludeCustomerIds ?? [] } : undefined,
  };
  const { data, isLoading, error, refetch, isFetching } = trpc.cashForecast.get.useQuery(input);
  const utils = trpc.useUtils();
  const exportMut = trpc.cashForecast.export.useMutation({
    onSuccess: (res) => downloadExport(res),
    onError: (e) => toast.error(e.message),
  });
  const snapshotMut = trpc.cashForecast.snapshot.useMutation({
    onSuccess: (r) => {
      if (r.created) toast.success("Snapshot saved. It will be graded once the week is over.");
      else toast.info(`This week is already frozen (taken ${String(r.existingAsOf ?? "").slice(0, 10)}). Next snapshot opens Monday.`);
      utils.cashForecast.accuracy.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const chartData = useMemo(
    () => (data?.weeks ?? []).map((w) => ({ week: `W${w.index}`, label: shortDate(w.start), cash: w.closingCash })),
    [data],
  );

  const addAdjustment = () => {
    const next = sanitizeAdjustment(draft);
    if (!next || adjustments.length >= MAX_ADJUSTMENTS) return;
    setAdjustments((a) => [...a, next]);
    setDraft({ label: "", amount: 0, direction: draft.direction, date: draft.date });
  };

  const week = data && selectedWeek ? data.weeks[selectedWeek - 1] : null;

  const manualItemsCard = (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">Manual items</div>
          <p className="text-xs text-muted-foreground">
            Quick one-offs for this session, saved in this browser. To keep them, save them into a scenario.
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
  );

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
        <Button variant="outline" size="sm" onClick={() => exportMut.mutate(input)} disabled={exportMut.isPending || !data}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => snapshotMut.mutate()} disabled={snapshotMut.isPending} title="Freeze this week's base forecast so it can be graded against the bank later">
          <Camera className="h-3.5 w-3.5 mr-1.5" />
          Snapshot
        </Button>
        {data && (
          <Badge variant="secondary" className="text-xs">
            {data.cashSource === "mercury" ? "Bank balance: Mercury" : data.cashSource === "manual" ? "Starting cash: manual" : "No bank balance"}
          </Badge>
        )}
        {scenarioId && <Badge className="text-xs">Scenario applied</Badge>}
        {hasKnobs && <Badge variant="outline" className="text-xs">What-if knobs on</Badge>}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading forecast…</p>}
      {error && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>Could not load forecast: {error.message}</span>
          <Button variant="outline" size="sm" onClick={resetSaved}>
            Clear saved inputs
          </Button>
        </div>
      )}

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

          {manualItemsCard}

          {data.notes.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && manualItemsCard}
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
