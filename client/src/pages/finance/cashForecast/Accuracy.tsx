import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money = (n: number) => usd0.format(Math.round(n));
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

export function AccuracyPanel() {
  const { data, isLoading } = trpc.cashForecast.accuracy.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const snap = data?.snapshots.find((s) => s.id === selected) ?? data?.latest ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="text-sm font-semibold">Forecast vs. what hit the bank</div>
          <p className="text-xs text-muted-foreground">
            A snapshot is frozen every Monday (or when you press Snapshot). Once a week has passed, its forecast is graded against Mercury credits and debits. Error = actual − forecast. MAPE is the average miss as a percentage; under 15% is good for a 13-week view.
          </p>
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {data && data.snapshots.length === 0 && <p className="text-xs text-muted-foreground">No snapshots yet. Press Snapshot on the Forecast tab, then come back next week.</p>}
          {data && data.snapshots.length > 0 && (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="py-1 text-left font-medium">Snapshot</th>
                  <th className="py-1 text-left font-medium">Source</th>
                  <th className="py-1 text-right font-medium">Start</th>
                  <th className="py-1 text-right font-medium">Forecast low</th>
                  <th className="py-1 text-right font-medium">Weeks graded</th>
                  <th className="py-1 text-right font-medium">Money-in MAPE</th>
                  <th className="py-1 text-right font-medium">Money-out MAPE</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((s) => (
                  <tr key={s.id} className={`border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/40 ${snap?.id === s.id ? "bg-muted/40" : ""}`} onClick={() => setSelected(s.id)}>
                    <td className="py-1.5">{s.asOf}</td>
                    <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{s.source}</Badge></td>
                    <td className="py-1.5 text-right">{money(s.startingCash)}</td>
                    <td className={`py-1.5 text-right ${s.lowestCash < 0 ? "text-destructive" : ""}`}>{money(s.lowestCash)}</td>
                    <td className="py-1.5 text-right">{s.summary.weeks}</td>
                    <td className="py-1.5 text-right">{pct(s.summary.inMape)}</td>
                    <td className="py-1.5 text-right">{pct(s.summary.outMape)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {snap && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="text-sm font-semibold">Snapshot {snap.asOf}: week by week</div>
            {snap.weeks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No finished weeks to grade yet.</p>
            ) : (
              <table className="w-full text-xs tabular-nums">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-1 text-left font-medium">Week of</th>
                    <th className="py-1 text-right font-medium">In: forecast</th>
                    <th className="py-1 text-right font-medium">In: actual</th>
                    <th className="py-1 text-right font-medium">Miss</th>
                    <th className="py-1 text-right font-medium pl-4">Out: forecast</th>
                    <th className="py-1 text-right font-medium">Out: actual</th>
                    <th className="py-1 text-right font-medium">Miss</th>
                    <th className="py-1 text-right font-medium pl-4">Net miss</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.weeks.map((w) => (
                    <tr key={w.start} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5">{w.start}</td>
                      <td className="py-1.5 text-right">{money(w.forecastIn)}</td>
                      <td className="py-1.5 text-right">{money(w.actualIn)}</td>
                      <td className={`py-1.5 text-right ${w.inError < 0 ? "text-destructive" : "text-emerald-600"}`}>{signed(w.inError)}</td>
                      <td className="py-1.5 text-right pl-4">{money(w.forecastOut)}</td>
                      <td className="py-1.5 text-right">{money(w.actualOut)}</td>
                      <td className={`py-1.5 text-right ${w.outError > 0 ? "text-destructive" : "text-emerald-600"}`}>{signed(w.outError)}</td>
                      <td className={`py-1.5 text-right pl-4 font-medium ${w.netError < 0 ? "text-destructive" : "text-emerald-600"}`}>{signed(w.netError)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
