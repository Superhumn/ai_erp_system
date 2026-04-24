import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// Admin-only: invite investor-type stakeholders to the portal. Creates a
// team_invites row with role='investor' and a link back to the stakeholder;
// when the investor accepts, localAuth attaches the new user to that
// cap-table row so their portal resolves on first login.
//
// Non-investor stakeholder types are hidden here — this is about investor
// portal access, not employee options or founder accounts.
export default function InvestorPortalAdmin() {
  const utils = trpc.useUtils();
  const { data: stakeholders, isLoading } = trpc.capTable.stakeholders.list.useQuery(undefined);

  const inviteMutation = trpc.investorPortal.inviteToPortal.useMutation({
    onSuccess: () => {
      toast.success("Portal invitation sent");
      utils.capTable.stakeholders.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  type StakeholderRow = {
    id: number;
    name: string;
    email: string | null | undefined;
    type: string | undefined;
    userId: number | null | undefined;
    relationship: string | null | undefined;
  };
  const investors = ((stakeholders ?? []) as unknown as StakeholderRow[])
    .filter((s) => s.type === "investor");
  const unlinked = investors.filter((s) => !s.userId);
  const linked = investors.filter((s) => !!s.userId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite investors to the portal</CardTitle>
          <CardDescription>
            Sends a secure login link so each investor can check their equity position and
            the company's current financials whenever they'd like. Invitations expire in 14 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every investor stakeholder already has portal access. New ones added to the cap
              table will appear here for inviting.
            </p>
          ) : (
            <div className="space-y-2">
              {unlinked.map((s) => {
                const pendingForThisRow = inviteMutation.isPending
                  && (inviteMutation.variables as { stakeholderId?: number } | undefined)?.stakeholderId === s.id;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.email || <span className="italic">no email on file</span>}
                        {s.relationship ? ` · ${s.relationship}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!s.email || pendingForThisRow}
                      onClick={() => inviteMutation.mutate({ stakeholderId: s.id })}
                    >
                      {pendingForThisRow ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Invite
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {linked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Already activated</CardTitle>
            <CardDescription>
              These investors have accepted their invitations and can log in to the portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {linked.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Activated
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
