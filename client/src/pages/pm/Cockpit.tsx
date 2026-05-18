import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PmHeader, PmTabs, daysSince, fmtDate } from "./_shared";

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
          <Card className="p-12 text-center text-muted-foreground">No blocked projects 🎉</Card>
        ) : (
          <div className="space-y-2">
            {data.map(p => {
              const days = daysSince(p.blockedSince);
              const severe = days >= 7;
              return (
                <Link key={p.id} href={`/pm/project/${p.id}`}>
                  <Card className="p-4 hover:bg-muted/30 cursor-pointer">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {severe && <AlertTriangle className="w-4 h-4 text-destructive" />}
                          <span className="font-semibold">{p.name}</span>
                          <span className={severe ? "text-destructive text-xs font-bold uppercase" : "text-warning text-xs font-bold uppercase"}>
                            {days} day{days === 1 ? "" : "s"} blocked
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {p.blockerReason || "No blocker reason logged."}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        Blocked since {fmtDate(p.blockedSince)}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
