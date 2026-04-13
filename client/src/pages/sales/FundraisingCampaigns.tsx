import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Target, Edit, X } from "lucide-react";
import { toast } from "sonner";

const emptyForm = {
  name: "", description: "", targetAmount: "", minimumInvestment: "",
  valuation: "", roundType: "seed" as string, equityOffered: "",
  status: "planning" as string, notes: "",
};

export default function FundraisingCampaigns() {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const { data: campaigns, isLoading, refetch } = (trpc.crm as any).listCampaigns.useQuery();
  const createCampaign = (trpc.crm as any).createCampaign.useMutation({
    onSuccess: () => {
      toast.success("Round created");
      setEditing(false);
      setFormData(emptyForm);
      refetch();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = {
      name: formData.name,
      roundType: formData.roundType,
      status: formData.status,
    };
    if (formData.description) payload.description = formData.description;
    if (formData.targetAmount) payload.targetAmount = formData.targetAmount;
    if (formData.minimumInvestment) payload.minimumInvestment = formData.minimumInvestment;
    if (formData.valuation) payload.valuation = formData.valuation;
    if (formData.equityOffered) payload.equityOffered = formData.equityOffered;
    if (formData.notes) payload.notes = formData.notes;
    createCampaign.mutate(payload);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  // Single round — use the first (most recent) campaign
  const round = campaigns?.[0] || null;

  const statusColors: Record<string, string> = {
    planning: "bg-gray-500/10 text-gray-600",
    active: "bg-emerald-500/10 text-emerald-600",
    paused: "bg-amber-500/10 text-amber-600",
    closed: "bg-blue-500/10 text-blue-600",
    cancelled: "bg-red-500/10 text-red-600",
  };

  // Inline create/edit form
  const roundForm = (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Round Name *</Label>
            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Seed Round 2026" required />
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
              <Label>Target Amount ($)</Label>
              <Input type="number" step="0.01" value={formData.targetAmount} onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })} placeholder="1000000" />
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
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} placeholder="Optional round description" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            {round && (
              <Button type="button" variant="outline" onClick={() => { setEditing(false); setFormData(emptyForm); }}>
                <X className="h-4 w-4 mr-2" />Cancel
              </Button>
            )}
            <Button type="submit" disabled={createCampaign.isPending}>
              {createCampaign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Plus className="h-4 w-4 mr-2" />Create Round
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  // No round yet — show inline create form directly
  if (!round) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-[1.875rem] font-bold tracking-[-0.03em]">Fundraising</h1>
          <p className="text-muted-foreground">Set up your current fundraising round</p>
        </div>
        {roundForm}
      </div>
    );
  }

  // Single round detail view
  const raised = parseFloat(round.raisedAmount || "0");
  const target = parseFloat(round.targetAmount || "1");
  const progress = Math.min((raised / target) * 100, 100);
  const valuation = parseFloat(round.valuation || "0");

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.875rem] font-bold tracking-[-0.03em]">Fundraising</h1>
          <p className="text-muted-foreground text-sm">{round.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusColors[round.status] || statusColors.planning}>
            {round.status}
          </Badge>
          <Badge variant="outline" className="capitalize">{(round.roundType || "seed").replace(/_/g, " ")}</Badge>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />Edit Round
            </Button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && roundForm}

      {/* KPI bar */}
      <div className="flex items-center gap-5 flex-wrap text-sm border rounded-xl px-4 py-3 bg-card">
        <div>
          <span className="text-xs text-muted-foreground">Target</span>
          <div className="font-bold text-base">${target.toLocaleString()}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Raised</span>
          <div className="font-bold text-base text-green-600">${raised.toLocaleString()}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Remaining</span>
          <div className="font-bold text-base">${Math.max(0, target - raised).toLocaleString()}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Progress</span>
          <div className="font-bold text-base">{progress.toFixed(1)}%</div>
        </div>
        {valuation > 0 && (
          <>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="text-xs text-muted-foreground">Valuation</span>
              <div className="font-bold text-base">${valuation.toLocaleString()}</div>
            </div>
          </>
        )}
        {round.equityOffered && (
          <>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="text-xs text-muted-foreground">Equity</span>
              <div className="font-bold text-base">{round.equityOffered}%</div>
            </div>
          </>
        )}
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Round Progress</span>
              <span className="text-muted-foreground">${raised.toLocaleString()} / ${target.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className="bg-green-600 h-3 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Round details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t">
            {round.minimumInvestment && (
              <div>
                <div className="text-xs text-muted-foreground">Min Investment</div>
                <div className="font-semibold">${parseFloat(round.minimumInvestment).toLocaleString()}</div>
              </div>
            )}
            {round.startDate && (
              <div>
                <div className="text-xs text-muted-foreground">Started</div>
                <div className="font-semibold">{new Date(round.startDate).toLocaleDateString()}</div>
              </div>
            )}
            {round.targetCloseDate && (
              <div>
                <div className="text-xs text-muted-foreground">Target Close</div>
                <div className="font-semibold">{new Date(round.targetCloseDate).toLocaleDateString()}</div>
              </div>
            )}
            {round.investorCount !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground">Investors</div>
                <div className="font-semibold">{round.investorCount || 0}</div>
              </div>
            )}
          </div>

          {round.description && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs text-muted-foreground mb-1">Notes</div>
              <p className="text-sm whitespace-pre-wrap">{round.description}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
