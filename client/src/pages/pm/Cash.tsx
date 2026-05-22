import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Bar, BarChart } from "recharts";
import { PmHeader, PmTabs, fmtMoney, fmtDate } from "./_shared";

export default function PmCash() {
  const { data, isLoading } = trpc.pm.cashForecast.useQuery();

  if (isLoading || !data) {
    return (
      <div>
        <PmTabs />
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  const chartData = data.byMonth.map(m => ({
    label: `${m.year}-${String(m.month).padStart(2, "0")}`,
    total: m.total,
  }));

  return (
    <div>
      <PmHeader title="Cash event forecast" subtitle="Cash" />
      <PmTabs />

      <div className="px-4 pb-8 space-y-6">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">PM cash impact by month</div>
          <div className="text-xs text-muted-foreground mb-2">
            Sum of <code>cash_event_amount</code> on pm_projects, bucketed by <code>cash_event_date</code> month. On project completion the same row is pushed into <code>financial_model</code>.
          </div>
          {chartData.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">No cash events scheduled.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Bar dataKey="total" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b font-semibold text-sm">Pending cash events</div>
          <table className="w-full">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 text-xs uppercase font-semibold">Project</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Type</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Date</th>
                <th className="text-right p-3 text-xs uppercase font-semibold">Amount</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No projects with cash events.</td></tr>
              ) : data.rows.map(p => (
                <tr key={p.id} className="border-b">
                  <td className="p-3">
                    <Link href={`/pm/project/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  </td>
                  <td className="p-3 capitalize text-sm">{p.cashEventType ?? "—"}</td>
                  <td className="p-3 text-sm">{fmtDate(p.cashEventDate)}</td>
                  <td className="p-3 text-right font-mono text-sm">{fmtMoney(p.cashEventAmount)}</td>
                  <td className="p-3 text-sm capitalize">{p.status.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b font-semibold text-sm">Synced rows in financial_model</div>
          <table className="w-full">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 text-xs uppercase font-semibold">Metric</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Category</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Period</th>
                <th className="text-right p-3 text-xs uppercase font-semibold">Actual</th>
              </tr>
            </thead>
            <tbody>
              {(data.financialModelRows ?? []).length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-sm">Nothing synced yet.</td></tr>
              ) : (data.financialModelRows ?? []).map(r => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 text-sm">{r.metricName}</td>
                  <td className="p-3 text-sm capitalize">{r.category}</td>
                  <td className="p-3 text-sm">{r.year}-{String(r.month).padStart(2, "0")}</td>
                  <td className="p-3 text-right font-mono text-sm">{fmtMoney(r.actualValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
