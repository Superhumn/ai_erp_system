import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { PmHeader, PmTabs, StatusBadge, PriorityBadge, type PmStatus } from "./_shared";

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
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left text-xs font-semibold uppercase tracking-wide p-3 sticky left-0 bg-muted/40 z-10">Market</th>
                  {data.functions.map(f => (
                    <th key={f.id} className="text-left text-xs font-semibold uppercase tracking-wide p-3">
                      <Link href={`/pm/function/${f.code}`} className="hover:underline">{f.name}</Link>
                    </th>
                  ))}
                  <th className="text-right text-xs font-semibold uppercase tracking-wide p-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map(m => (
                  <tr key={m.id} className="border-b align-top">
                    <td className="p-3 sticky left-0 bg-background z-10 border-r">
                      <Link href={`/pm/market/${m.code}`} className="block">
                        <div className="text-sm font-semibold">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">
                          T{m.tier} · {m.status} · {m.entityType}
                        </div>
                      </Link>
                    </td>
                    {data.functions.map(f => {
                      const cell = data.cells.find(c => c.marketId === m.id && c.functionId === f.id);
                      const projects = cell?.projects ?? [];
                      return (
                        <td key={f.id} className="p-2 min-w-[200px]">
                          {projects.length === 0 ? (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          ) : (
                            <div className="space-y-1">
                              {projects.map(p => (
                                <Link key={p.id} href={`/pm/project/${p.id}`}>
                                  <div className="border rounded p-2 hover:bg-muted/50 cursor-pointer text-xs space-y-1">
                                    <div className="flex items-center gap-1 justify-between">
                                      <PriorityBadge priority={p.priority as any} />
                                      <StatusBadge status={p.status as any} />
                                    </div>
                                    <div className="font-medium leading-tight">{p.name}</div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3 text-right text-sm font-mono text-muted-foreground">
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
