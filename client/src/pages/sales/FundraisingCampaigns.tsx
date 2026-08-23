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
import { Plus, Loader2, Target, Edit, Building2, Users, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

const NONE = "none";

const blankForm = {
  name: "", description: "", targetAmount: "", minimumInvestment: "",
  valuation: "", roundType: "seed" as string, equityOffered: "",
  status: "planning" as string, notes: "", companyId: "",
};

const statusColors: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  paused: "bg-muted text-foreground",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-[oklch(0.30_0.02_262)] text-white",
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
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
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


const blankInvestor = {
  name: "", email: "", company: "", title: "",
  type: "angel" as string, status: "lead" as string,
};

// Mirrors the server-side constraint on `crm.addCampaignInvestment.amount`.
// Checked before the investor is created so a malformed amount can't leave a
// CRM row behind with no link to the round.
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const AMOUNT_ERROR = "Amount must be a positive number with up to 2 decimals";

// Investors linked to a single round, pulled from and added to the investor CRM.
// New investors can be created inline here — they land in the CRM and, when an
// amount is given, are linked to this round in the same step.
function RoundInvestorsDialog({ round, onClose }: { round: any; onClose: () => void }) {
  const { data: links, refetch } = (trpc.crm as any).listCampaignInvestors.useQuery({ campaignId: round.id });
  const { data: investors, refetch: refetchInvestors } = (trpc.crm as any).listInvestors.useQuery();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("");
  const [newInvestor, setNewInvestor] = useState({ ...blankInvestor });
  const [newAmount, setNewAmount] = useState("");
  // Set once the CRM row exists but linking it to the round hasn't succeeded
  // yet, so retrying links that investor instead of creating a duplicate.
  const [createdId, setCreatedId] = useState<number | null>(null);

  // These run as chained awaits below, so success/error is reported by the
  // caller rather than in per-mutation callbacks (avoids double toasts).
  const add = (trpc.crm as any).addCampaignInvestment.useMutation();
  const createInvestor = (trpc.crm as any).createInvestor.useMutation();
  const remove = (trpc.crm as any).removeCampaignInvestment.useMutation({
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.message),
  });

  const addExisting = async () => {
    if (!AMOUNT_RE.test(amount.trim())) {
      toast.error(AMOUNT_ERROR);
      return;
    }
    try {
      await add.mutateAsync({ campaignId: round.id, investorId: parseInt(investorId), amount });
      toast.success("Investor added to round");
      setInvestorId("");
      setAmount("");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const createAndAdd = async () => {
    const name = newInvestor.name.trim();
    if (!name) return;
    const committed = newAmount.trim();
    if (committed && !AMOUNT_RE.test(committed)) {
      toast.error(AMOUNT_ERROR);
      return;
    }
    try {
      let linkId = createdId;
      if (linkId == null) {
        const created = await createInvestor.mutateAsync({
          name,
          email: newInvestor.email.trim() || undefined,
          company: newInvestor.company.trim() || undefined,
          title: newInvestor.title.trim() || undefined,
          type: newInvestor.type,
          status: newInvestor.status,
        });
        linkId = created.id;
        setCreatedId(linkId);
        // Surface the new record in the picker right away, so it stays
        // reachable even if the link below fails.
        refetchInvestors();
      }
      if (committed) {
        await add.mutateAsync({ campaignId: round.id, investorId: linkId, amount: committed });
      }
      toast.success(committed ? `${name} added to your CRM and this round` : `${name} added to your CRM`);
      setNewInvestor({ ...blankInvestor });
      setNewAmount("");
      setCreatedId(null);
      setMode("existing");
      refetchInvestors();
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const rows: any[] = links || [];
  const total = rows.reduce((s, r) => s + (parseFloat(r.amount || "0") || 0), 0);
  const busy = add.isPending || createInvestor.isPending;

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
              No investors linked yet — pick one from your CRM below, or add a new one.
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
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">
                {mode === "existing" ? "Add investor from CRM" : "New investor"}
              </Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setMode(mode === "existing" ? "new" : "existing")}
              >
                {mode === "existing" ? (
                  <><UserPlus className="h-3.5 w-3.5 mr-1.5" />New investor</>
                ) : (
                  "Pick from CRM"
                )}
              </Button>
            </div>

            {mode === "existing" ? (
              <>
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
                  <Button disabled={!investorId || !amount || busy} onClick={addExisting}>
                    {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                </div>
                {(!investors || investors.length === 0) && (
                  <p className="text-xs text-muted-foreground">
                    No investors in your CRM yet — use “New investor” to add your first one.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Name *" aria-label="Investor name"
                    value={newInvestor.name}
                    onChange={(e) => {
                      setCreatedId(null);
                      setNewInvestor({ ...newInvestor, name: e.target.value });
                    }}
                  />
                  <Input
                    type="email" placeholder="Email" aria-label="Investor email"
                    value={newInvestor.email}
                    onChange={(e) => setNewInvestor({ ...newInvestor, email: e.target.value })}
                  />
                  <Input
                    placeholder="Firm" aria-label="Investor firm"
                    value={newInvestor.company}
                    onChange={(e) => setNewInvestor({ ...newInvestor, company: e.target.value })}
                  />
                  <Input
                    placeholder="Title" aria-label="Investor title"
                    value={newInvestor.title}
                    onChange={(e) => setNewInvestor({ ...newInvestor, title: e.target.value })}
                  />
                  <Select value={newInvestor.type} onValueChange={(v) => setNewInvestor({ ...newInvestor, type: v })}>
                    <SelectTrigger aria-label="Investor type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="angel">Angel</SelectItem>
                      <SelectItem value="vc">VC</SelectItem>
                      <SelectItem value="family_office">Family Office</SelectItem>
                      <SelectItem value="strategic">Strategic</SelectItem>
                      <SelectItem value="accelerator">Accelerator</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={newInvestor.status} onValueChange={(v) => setNewInvestor({ ...newInvestor, status: v })}>
                    <SelectTrigger aria-label="Investor status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="committed">Committed</SelectItem>
                      <SelectItem value="invested">Invested</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number" step="0.01" placeholder="Amount (optional)" className="flex-1"
                    aria-label="Committed amount"
                    value={newAmount} onChange={(e) => setNewAmount(e.target.value)}
                  />
                  <Button disabled={!newInvestor.name.trim() || busy} onClick={createAndAdd}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to CRM"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Saved to your investor CRM. Add an amount to commit them to this round now.
                </p>
              </div>
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
