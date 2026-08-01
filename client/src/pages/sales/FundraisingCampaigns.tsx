import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Target, Edit, Building2, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";

const NONE = "none";

const blankForm = {
  name: "", description: "", targetAmount: "", minimumInvestment: "",
  valuation: "", roundType: "seed" as string, equityOffered: "",
  status: "planning" as string, notes: "", companyId: "",
};

const statusColors: Record<string, string> = {
  planning: "bg-gray-500/10 text-gray-600",
  active: "bg-emerald-500/10 text-emerald-600",
  paused: "bg-amber-500/10 text-amber-600",
  closed: "bg-blue-500/10 text-blue-600",
  cancelled: "bg-red-500/10 text-red-600",
};

export default function FundraisingCampaigns() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ ...blankForm });
  const [investorsRound, setInvestorsRound] = useState<any | null>(null);

  const { data: campaigns, isLoading, refetch } = (trpc.crm as any).listCampaigns.useQuery();
  const { data: companies } = (trpc as any).companies.list.useQuery();

  const companyName = (id: number | null | undefined) =>
    id == null ? null : (companies?.find((c: any) => c.id === id)?.name ?? `Company #${id}`);

  const createCampaign = (trpc.crm as any).createCampaign.useMutation({
    onSuccess: () => { toast.success("Round created"); setIsOpen(false); refetch(); },
    onError: (error: any) => toast.error(error.message),
  });
  const updateCampaign = (trpc.crm as any).updateCampaign.useMutation({
    onSuccess: () => { toast.success("Round updated"); setIsOpen(false); refetch(); },
    onError: (error: any) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setFormData({ ...blankForm });
    setIsOpen(true);
  };

  const openEdit = (round: any) => {
    setEditingId(round.id);
    setFormData({
      name: round.name || "",
      description: round.description || "",
      targetAmount: round.targetAmount || "",
      minimumInvestment: round.minimumInvestment || "",
      valuation: round.valuation || "",
      roundType: round.roundType || "seed",
      equityOffered: round.equityOffered || "",
      status: round.status || "planning",
      notes: round.notes || "",
      companyId: round.companyId != null ? String(round.companyId) : "",
    });
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { companyId, ...rest } = formData;
    const payload: Record<string, any> = { ...rest };
    if (companyId) payload.companyId = parseInt(companyId);
    if (editingId) {
      updateCampaign.mutate({ id: editingId, ...payload });
    } else {
      createCampaign.mutate(payload);
    }
  };

  const rounds: any[] = campaigns || [];

  const dialog = (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Round" : "Create Fundraising Round"}</DialogTitle>
          <DialogDescription>Each round can be scoped to a regional subsidiary</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Round Name *</Label>
            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Asia Seed 2026" required />
          </div>
          <div className="space-y-2">
            <Label>Company / Subsidiary</Label>
            <Select
              value={formData.companyId || NONE}
              onValueChange={(v) => setFormData({ ...formData, companyId: v === NONE ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="Parent company" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Parent company (no subsidiary)</SelectItem>
                {(companies || []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.type && c.type !== "parent" ? ` · ${c.type}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Round Type</Label>
              <Select value={formData.roundType} onValueChange={(v) => setFormData({ ...formData, roundType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                  <SelectItem value="seed">Seed</SelectItem>
                  <SelectItem value="series_a">Series A</SelectItem>
                  <SelectItem value="series_b">Series B</SelectItem>
                  <SelectItem value="bridge">Bridge</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Amount ($) *</Label>
              <Input type="number" step="0.01" value={formData.targetAmount} onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })} placeholder="1000000" required />
            </div>
            <div className="space-y-2">
              <Label>Valuation ($)</Label>
              <Input type="number" step="0.01" value={formData.valuation} onChange={(e) => setFormData({ ...formData, valuation: e.target.value })} placeholder="10000000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Equity Offered (%)</Label>
              <Input type="number" step="0.01" max="100" value={formData.equityOffered} onChange={(e) => setFormData({ ...formData, equityOffered: e.target.value })} placeholder="10" />
            </div>
            <div className="space-y-2">
              <Label>Min Investment ($)</Label>
              <Input type="number" step="0.01" value={formData.minimumInvestment} onChange={(e) => setFormData({ ...formData, minimumInvestment: e.target.value })} placeholder="25000" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createCampaign.isPending || updateCampaign.isPending}>
              {(createCampaign.isPending || updateCampaign.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Save" : "Create Round"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-sm font-bold tracking-[-0.02em]">Fundraising</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New Round</Button>
      </div>

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Target className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No fundraising rounds</h3>
            <p className="text-muted-foreground mb-4 text-sm">Create a round — scope it to a regional subsidiary or the parent company</p>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create Round</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rounds.map((round: any) => {
            const raised = parseFloat(round.raisedAmount || "0");
            const target = parseFloat(round.targetAmount || "1");
            const progress = Math.min((raised / target) * 100, 100);
            const valuation = parseFloat(round.valuation || "0");
            const subsidiary = companyName(round.companyId);
            return (
              <Card key={round.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{round.name}</span>
                        <Badge className={statusColors[round.status] || statusColors.planning}>{round.status}</Badge>
                        <Badge variant="outline" className="capitalize">{(round.roundType || "seed").replace(/_/g, " ")}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {subsidiary || "Parent company"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setInvestorsRound(round)} title="Investors" aria-label="Investors">
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(round)} title="Edit round" aria-label="Edit round">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">${raised.toLocaleString()} / ${target.toLocaleString()}</span>
                    <span className="font-medium">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {valuation > 0 && <span>Valuation <span className="font-semibold text-foreground">${valuation.toLocaleString()}</span></span>}
                    {round.equityOffered && <span>Equity <span className="font-semibold text-foreground">{round.equityOffered}%</span></span>}
                    {round.minimumInvestment && <span>Min <span className="font-semibold text-foreground">${parseFloat(round.minimumInvestment).toLocaleString()}</span></span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {dialog}
      {investorsRound && (
        <RoundInvestorsDialog round={investorsRound} onClose={() => setInvestorsRound(null)} />
      )}
    </div>
  );
}

// Investors linked to a single round, pulled from and added to the investor CRM.
function RoundInvestorsDialog({ round, onClose }: { round: any; onClose: () => void }) {
  const { data: links, refetch } = (trpc.crm as any).listCampaignInvestors.useQuery({ campaignId: round.id });
  const { data: investors } = (trpc.crm as any).listInvestors.useQuery();
  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("");

  const add = (trpc.crm as any).addCampaignInvestment.useMutation({
    onSuccess: () => { toast.success("Investor added to round"); setInvestorId(""); setAmount(""); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = (trpc.crm as any).removeCampaignInvestment.useMutation({
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.message),
  });

  const rows: any[] = links || [];
  const total = rows.reduce((s, r) => s + (parseFloat(r.amount || "0") || 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Investors — {round.name}</DialogTitle>
          <DialogDescription>
            {rows.length} investor{rows.length === 1 ? "" : "s"} · ${total.toLocaleString()} committed
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No investors linked yet — add one from your CRM below.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.investorName || `Investor #${r.investorId}`}</div>
                    {r.investorStatus && <div className="text-xs text-muted-foreground capitalize">{r.investorStatus}</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">${(parseFloat(r.amount || "0") || 0).toLocaleString()}</span>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: r.id })} title="Remove" aria-label={`Remove ${r.investorName || "investor"}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border p-3 space-y-2">
            <Label className="text-xs">Add investor from CRM</Label>
            <div className="flex gap-2">
              <Select value={investorId} onValueChange={setInvestorId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select investor" /></SelectTrigger>
                <SelectContent>
                  {(investors || []).map((inv: any) => (
                    <SelectItem key={inv.id} value={String(inv.id)}>
                      {inv.name}{inv.status ? ` · ${inv.status}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number" step="0.01" placeholder="Amount" className="w-32"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                disabled={!investorId || !amount || add.isPending}
                onClick={() => add.mutate({ campaignId: round.id, investorId: parseInt(investorId), amount })}
              >
                {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </div>
            {(!investors || investors.length === 0) && (
              <p className="text-xs text-muted-foreground">No investors in your CRM yet — add them in the Investors area first.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
