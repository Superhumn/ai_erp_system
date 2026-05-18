import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { PmHeader, PmTabs, PriorityBadge, ProgressBar, STATUS_COLOR, type PmStatus } from "./_shared";

export default function PmMatrix() {
  const [tier, setTier] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading } = trpc.pm.matrix.useQuery({
    tier: tier === "all" ? undefined : Number(tier),
    status: status === "all" ? undefined : (status as PmStatus),
  });

  const marketTotals = useMemo(() => {
    if (!data) return new Map<number, number>();
    const totals = new Map<number, number>();
    for (const c of data.cells) {
      totals.set(c.marketId, (totals.get(c.marketId) ?? 0) + c.projects.length);
    }
    return totals;
  }, [data]);

  return (
    <div>
      <PmHeader
        title="Market × Function matrix"
        subtitle="Matrix"
        right={
          <Link href="/pm/admin">
            <Button variant="outline" size="sm">Manage markets & functions</Button>
          </Link>
        }
      />
      <PmTabs />

      <div className="px-4 flex items-center gap-3 mb-4">
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="1">Tier 1 (active)</SelectItem>
            <SelectItem value="2">Tier 2 (next 6-18mo)</SelectItem>
            <SelectItem value="3">Tier 3 (watchlist)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="not_started">Not started</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="px-4 pb-8">
        {isLoading || !data ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wide p-1.5 sticky left-0 bg-muted/40 z-10">Market</th>
                  {data.functions.map(f => (
                    <th key={f.id} className="text-left text-[10px] font-semibold uppercase tracking-wide p-1.5">
                      <Link href={`/pm/function/${f.code}`} className="hover:underline">{f.name}</Link>
                    </th>
                  ))}
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wide p-1.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map(m => (
                  <tr key={m.id} className="border-b align-top">
                    <td className="p-1.5 sticky left-0 bg-background z-10 border-r">
                      <Link href={`/pm/market/${m.code}`} className="block leading-tight">
                        <div className="text-xs font-semibold">{m.name}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">
                          T{m.tier} · {m.status} · {m.entityType}
                        </div>
                      </Link>
                    </td>
                    {data.functions.map(f => {
                      const cell = data.cells.find(c => c.marketId === m.id && c.functionId === f.id);
                      const projects = cell?.projects ?? [];
                      return (
                        <td key={f.id} className="p-1 min-w-[180px] align-top">
                          {projects.length === 0 ? (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          ) : (
                            <div className="space-y-0.5">
                              {projects.map((p: any) => (
                                <Link key={p.id} href={`/pm/project/${p.id}`}>
                                  <div className="border rounded px-1.5 py-1 hover:bg-muted/50 cursor-pointer flex items-center gap-1.5 leading-tight">
                                    <PriorityBadge priority={p.priority as any} />
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_COLOR[p.status as PmStatus].split(" ")[0]}`} />
                                    <span className="flex-1 truncate font-medium">{p.name}</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                      {p.taskCounts?.done ?? 0}/{p.taskCounts?.total ?? 0}
                                    </span>
                                    <ProgressBar
                                      className="w-8 shrink-0"
                                      value={p.taskCounts?.done ?? 0}
                                      max={p.taskCounts?.total ?? 0}
                                    />
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-1.5 text-right text-xs font-mono text-muted-foreground">
                      {marketTotals.get(m.id) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
