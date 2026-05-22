import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { PmHeader, PmTabs, StatusBadge, PriorityBadge, fmtDate, fmtMoney } from "./_shared";

export default function PmMarket() {
  const { code } = useParams<{ code: string }>();
  const { data, isLoading } = trpc.pm.byMarket.useQuery({ code });

  if (isLoading || !data) {
    return (
      <div>
        <PmTabs />
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  return (
    <div>
      <PmHeader
        title={data.market.name}
        subtitle={`Market / ${data.market.code}`}
      />
      <PmTabs />

      <div className="px-4 pb-8 space-y-6">
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Tier</div>
              <div className="font-semibold">T{data.market.tier}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Status</div>
              <div className="font-semibold capitalize">{data.market.status}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Entity</div>
              <div className="font-semibold capitalize">{data.market.entityType}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Partner</div>
              <div className="font-semibold">{data.market.partnerName ?? "—"}</div>
            </div>
          </div>
        </Card>

        <section>
          <h2 className="text-lg font-semibold mb-2">Programs</h2>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Name</th>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Status</th>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Target end</th>
                </tr>
              </thead>
              <tbody>
                {data.programs.length === 0 ? (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground text-sm">No programs yet.</td></tr>
                ) : data.programs.map(prog => (
                  <tr key={prog.id} className="border-b">
                    <td className="p-3 font-medium">{prog.name}</td>
                    <td className="p-3"><StatusBadge status={prog.status as any} /></td>
                    <td className="p-3 text-sm">{fmtDate(prog.targetEndDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Projects ({data.projects.length})</h2>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Project</th>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Function</th>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Status</th>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Priority</th>
                  <th className="text-left p-3 text-xs uppercase font-semibold">Target end</th>
                  <th className="text-right p-3 text-xs uppercase font-semibold">Cash event</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">No projects yet.</td></tr>
                ) : data.projects.map(p => (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <Link href={`/pm/project/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">#{p.functionId}</td>
                    <td className="p-3"><StatusBadge status={p.status as any} /></td>
                    <td className="p-3"><PriorityBadge priority={p.priority as any} /></td>
                    <td className="p-3 text-sm">{fmtDate(p.targetEndDate)}</td>
                    <td className="p-3 text-right text-sm font-mono">{fmtMoney(p.cashEventAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </div>
    </div>
  );
}
