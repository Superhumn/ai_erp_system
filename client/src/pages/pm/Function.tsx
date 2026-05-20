import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { PmHeader, PmTabs, StatusBadge, PriorityBadge, fmtDate } from "./_shared";

export default function PmFunction() {
  const { code } = useParams<{ code: string }>();
  const { data, isLoading } = trpc.pm.byFunction.useQuery({ code });
  const { data: markets } = trpc.pm.markets.list.useQuery();

  if (isLoading || !data) {
    return (
      <div>
        <PmTabs />
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  const marketLookup = new Map((markets ?? []).map(m => [m.id, m]));

  return (
    <div>
      <PmHeader title={data.function.name} subtitle={`Function / ${data.function.code}`} />
      <PmTabs />

      <div className="px-4 pb-8">
        <Card className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 text-xs uppercase font-semibold">Market</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Project</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Status</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Priority</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Target end</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No projects in this function.</td></tr>
              ) : data.projects.map(p => {
                const market = marketLookup.get(p.marketId);
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-sm">
                      {market ? (
                        <Link href={`/pm/market/${market.code}`} className="hover:underline">{market.name}</Link>
                      ) : `#${p.marketId}`}
                    </td>
                    <td className="p-3">
                      <Link href={`/pm/project/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    </td>
                    <td className="p-3"><StatusBadge status={p.status as any} /></td>
                    <td className="p-3"><PriorityBadge priority={p.priority as any} /></td>
                    <td className="p-3 text-sm">{fmtDate(p.targetEndDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
