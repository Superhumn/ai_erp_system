import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { PmHeader, PmTabs, STATUS_COLOR, fmtDate, type PmStatus } from "./_shared";

// Lightweight Gantt that doesn't pull in a new dep. Each bar is positioned
// by (start, end) along a single horizontal axis spanning the visible window.

type Bar = {
  id: number;
  name: string;
  start: Date;
  end: Date;
  status: PmStatus;
  groupKey: string;
  groupLabel: string;
  donePct: number;
};

export default function PmTimeline() {
  const [groupBy, setGroupBy] = useState<"market" | "function">("market");

  const { data: projectsData, isLoading: pLoading } = trpc.pm.projects.list.useQuery({});
  const { data: markets } = trpc.pm.markets.list.useQuery();
  const { data: functions } = trpc.pm.functions.list.useQuery();

  const bars: Bar[] = useMemo(() => {
    if (!projectsData || !markets || !functions) return [];
    const mMap = new Map(markets.map(m => [m.id, m]));
    const fMap = new Map(functions.map(f => [f.id, f]));
    const today = new Date();
    return projectsData
      .filter(p => p.startDate || p.targetEndDate)
      .map((p: any) => {
        const start = p.startDate ? new Date(p.startDate) : today;
        const end = p.actualEndDate ? new Date(p.actualEndDate)
          : p.targetEndDate ? new Date(p.targetEndDate)
          : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
        const market = mMap.get(p.marketId);
        const fn = fMap.get(p.functionId);
        const groupKey = groupBy === "market" ? `m-${p.marketId}` : `f-${p.functionId}`;
        const groupLabel = groupBy === "market"
          ? (market?.name ?? `#${p.marketId}`)
          : (fn?.name ?? `#${p.functionId}`);
        const total = p.taskCounts?.total ?? 0;
        const done = p.taskCounts?.done ?? 0;
        const donePct = p.status === "complete" ? 100 : total === 0 ? 0 : Math.round((done / total) * 100);
        return { id: p.id, name: p.name, start, end, status: p.status as PmStatus, groupKey, groupLabel, donePct };
      });
  }, [projectsData, markets, functions, groupBy]);

  const { axisStart, axisEnd, totalMs } = useMemo(() => {
    if (bars.length === 0) {
      const now = new Date();
      return { axisStart: now, axisEnd: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000), totalMs: 1 };
    }
    const minTs = Math.min(...bars.map(b => b.start.getTime()));
    const maxTs = Math.max(...bars.map(b => b.end.getTime()));
    const start = new Date(minTs);
    const end = new Date(maxTs);
    return { axisStart: start, axisEnd: end, totalMs: Math.max(1, end.getTime() - start.getTime()) };
  }, [bars]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; bars: Bar[] }>();
    for (const b of bars) {
      if (!map.has(b.groupKey)) map.set(b.groupKey, { label: b.groupLabel, bars: [] });
      map.get(b.groupKey)!.bars.push(b);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bars]);

  return (
    <div>
      <PmHeader
        title="Project timeline"
        subtitle="Timeline"
        right={
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "market" | "function")}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="market">Group by market</SelectItem>
              <SelectItem value="function">Group by function</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <PmTabs />

      <div className="px-4 pb-8">
        {pLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
        ) : bars.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">No projects with dates yet.</Card>
        ) : (
          <Card className="p-4 overflow-x-auto">
            <div className="text-xs text-muted-foreground mb-3 flex justify-between">
              <span>{fmtDate(axisStart)}</span>
              <span>{fmtDate(axisEnd)}</span>
            </div>
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.label}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{g.label}</div>
                  <div className="space-y-0.5">
                    {g.bars.map(b => {
                      const left = ((b.start.getTime() - axisStart.getTime()) / totalMs) * 100;
                      const width = Math.max(2, ((b.end.getTime() - b.start.getTime()) / totalMs) * 100);
                      return (
                        <Link key={b.id} href={`/pm/project/${b.id}`}>
                          <div className="relative h-5 bg-muted/20 rounded hover:bg-muted/40 cursor-pointer">
                            <div
                              className={`absolute top-0 bottom-0 rounded ${STATUS_COLOR[b.status]} overflow-hidden whitespace-nowrap`}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${b.name} (${fmtDate(b.start)} → ${fmtDate(b.end)}) — ${b.donePct}% done`}
                            >
                              <div
                                className="absolute inset-y-0 left-0 bg-success/40"
                                style={{ width: `${b.donePct}%` }}
                              />
                              <div className="relative h-full flex items-center px-1.5 text-[11px] font-medium leading-none">
                                {b.name}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
