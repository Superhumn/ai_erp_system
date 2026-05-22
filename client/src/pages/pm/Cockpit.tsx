import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PmHeader, PmTabs, ProgressBar, daysSince, fmtDate } from "./_shared";

export default function PmCockpit() {
  const { data, isLoading } = trpc.pm.cockpit.useQuery();
  const alert = trpc.pm.workflows.blockerAlert.useMutation({
    onSuccess: (r) => toast.success(r.posted ? `Posted to Google Chat (${r.count} stale)` : `Alert: ${r.reason ?? "no post"}`),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PmHeader
        title="Blocker cockpit"
        subtitle="Cockpit"
        right={
          <Button size="sm" onClick={() => alert.mutate()} disabled={alert.isPending}>
            {alert.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Run blocker alert
          </Button>
        }
      />
      <PmTabs />

      <div className="px-4 pb-8">
        {isLoading || !data ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
        ) : data.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">No blocked projects 🎉</Card>
        ) : (
          <Card className="p-0 divide-y">
            {data.map((p: any) => {
              const days = daysSince(p.blockedSince);
              const severe = days >= 7;
              return (
                <Link key={p.id} href={`/pm/project/${p.id}`}>
                  <div className="py-1.5 px-3 hover:bg-muted/30 cursor-pointer flex items-center gap-3 text-sm leading-tight">
                    {severe ? <AlertTriangle className="w-3 h-3 text-destructive shrink-0" /> : <span className="w-3 h-3 shrink-0" />}
                    <span className={`text-xs font-bold tabular-nums w-12 shrink-0 ${severe ? "text-destructive" : "text-warning"}`}>
                      {days}d
                    </span>
                    <span className="font-medium truncate w-64 shrink-0">{p.name}</span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {p.blockerReason || "No blocker reason logged."}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {p.taskCounts?.done ?? 0}/{p.taskCounts?.total ?? 0}
                    </span>
                    <ProgressBar className="w-12 shrink-0" value={p.taskCounts?.done ?? 0} max={p.taskCounts?.total ?? 0} />
                    <span className="text-[10px] text-muted-foreground shrink-0 w-24 text-right">
                      since {fmtDate(p.blockedSince)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
