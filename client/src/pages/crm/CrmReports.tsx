import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const PRIMARY = "var(--primary)";
const MUTED = "var(--muted-foreground)";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const stageLabel = (s: string) => s.replace(/_/g, " ");
const monthLabel = (k: string) => (k === "unscheduled" ? "No date" : format(new Date(`${k}-01T00:00:00`), "MMM yy"));

/** Sales dashboard: pipeline, weighted forecast, win rate, cycle time, sources, losses, stale deals. */
export function ReportsPanel({ pipelineId, onOpenDeal }: { pipelineId?: number; onOpenDeal?: (id: number) => void }) {
  const { data, isLoading } = trpc.crm.deals.report.useQuery(pipelineId ? { pipelineId } : undefined);
  if (isLoading || !data) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const { forecast } = data;
  const byStage = forecast.byStage.map((b) => ({ ...b, label: stageLabel(b.key) }));
  const byMonth = forecast.byMonth.map((b) => ({ ...b, label: monthLabel(b.key) }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="Open pipeline" value={money(forecast.totalOpen)} />
        <Kpi label="Weighted" value={money(forecast.totalWeighted)} />
        <Kpi label="Win rate" value={data.winRate == null ? "—" : `${data.winRate}%`} sub={`${data.wonCount} won · ${data.lostCount} lost`} />
        <Kpi label="Avg cycle" value={data.avgCycleDays == null ? "—" : `${data.avgCycleDays} days`} sub="created → won" />
        <Kpi label="Stale deals" value={String(data.staleDeals.length)} warn={data.staleDeals.length > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Pipeline by stage" empty={byStage.length === 0}>
          <BarChart data={byStage} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={44} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} width={48} />
            <Tooltip formatter={(v: number, n: string) => [money(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="amount" name="Amount" fill={MUTED} fillOpacity={0.35} />
            <Bar dataKey="weighted" name="Weighted" fill={PRIMARY} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Weighted forecast by expected close month" empty={byMonth.length === 0}>
          <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} width={48} />
            <Tooltip formatter={(v: number, n: string) => [money(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="weighted" name="Weighted" fill={PRIMARY} />
            <Bar dataKey="amount" name="Unweighted" fill={MUTED} fillOpacity={0.35} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="py-3">
          <CardHeader className="pb-1"><CardTitle className="text-sm">Deals by source</CardTitle></CardHeader>
          <CardContent>
            {data.bySource.length === 0 ? <Empty /> : (
              <div className="space-y-1 text-xs">
                {data.bySource.slice(0, 10).map((s) => (
                  <div key={s.source} className="flex items-center justify-between gap-2">
                    <span className="truncate capitalize">{s.source.replace(/_/g, " ")}</span>
                    <span className="tabular-nums text-muted-foreground whitespace-nowrap">{s.count} · {s.won} won · {compact(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="py-3">
          <CardHeader className="pb-1"><CardTitle className="text-sm">Losses by reason</CardTitle></CardHeader>
          <CardContent>
            {data.lossesByReason.length === 0 ? <Empty text="No lost deals yet." /> : (
              <div className="space-y-1.5 text-xs">
                {data.lossesByReason.map((l) => {
                  const pct = data.lostCount ? Math.round((l.count / data.lostCount) * 100) : 0;
                  return (
                    <div key={l.reasonId ?? "none"}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{l.reason}</span>
                        <span className="tabular-nums text-muted-foreground whitespace-nowrap">{l.count} · {compact(l.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded"><div className="h-1.5 rounded bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="py-3">
          <CardHeader className="pb-1"><CardTitle className="text-sm">Avg days in stage</CardTitle></CardHeader>
          <CardContent>
            {data.velocity.length === 0 ? <Empty text="Needs stage moves to measure." /> : (
              <div className="space-y-1 text-xs">
                {data.velocity.map((v) => (
                  <div key={v.stage} className="flex items-center justify-between gap-2">
                    <span className="truncate capitalize">{stageLabel(v.stage)}</span>
                    <span className="tabular-nums text-muted-foreground">{v.avgDays}d <span className="opacity-60">(n={v.samples})</span></span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="py-3">
        <CardHeader className="pb-1"><CardTitle className="text-sm">Stale deals</CardTitle></CardHeader>
        <CardContent>
          {data.staleDeals.length === 0 ? <Empty text="No stale deals. Nice." /> : (
            <div className="divide-y text-xs">
              {data.staleDeals.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="w-full flex items-center justify-between gap-2 py-1.5 text-left hover:bg-muted/50"
                  onClick={() => onOpenDeal?.(d.id)}
                >
                  <span className="min-w-0 truncate font-medium">{d.name}</span>
                  <span className="flex items-center gap-2 shrink-0 text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] capitalize">{stageLabel(d.stage)}</Badge>
                    {d.expectedCloseDate && <span className="hidden sm:inline">close {format(new Date(d.expectedCloseDate), "MMM d")}</span>}
                    <span className="tabular-nums text-foreground">{money(d.amount)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base font-bold tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactElement }) {
  return (
    <Card className="py-3">
      <CardHeader className="pb-1"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {empty ? <Empty /> : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ text = "No data yet." }: { text?: string }) {
  return <p className="text-xs text-muted-foreground italic">{text}</p>;
}
