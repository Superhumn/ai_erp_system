import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Target, TrendingUp, Calendar, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function FundraisingCampaigns() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    targetAmount: "",
    minimumInvestment: "",
    valuation: "",
    roundType: "seed" as "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "bridge" | "other",
    equityOffered: "",
    status: "planning" as "planning" | "active" | "paused" | "closed" | "cancelled",
    notes: "",
  });

  const { data: campaignsRaw, isLoading, refetch } = trpc.crm.listCampaigns.useQuery();
  const campaigns = campaignsRaw as any[] | undefined;
  
  const createCampaign = trpc.crm.createCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campaign created successfully");
      setIsOpen(false);
      setFormData({
        name: "", description: "", targetAmount: "", minimumInvestment: "",
        valuation: "", roundType: "seed", equityOffered: "", status: "planning", notes: "",
      });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate(formData);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planning: "bg-gray-100 text-gray-800",
      active: "bg-green-100 text-green-800",
      paused: "bg-yellow-100 text-yellow-800",
      closed: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const calculateProgress = (raised: string, target: string) => {
    const raisedNum = parseFloat(raised || '0');
    const targetNum = parseFloat(target || '1');
    return Math.min((raisedNum / targetNum) * 100, 100);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fundraising Campaigns</h1>
          <p className="text-muted-foreground">Manage your fundraising rounds and track progress</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Fundraising Campaign</DialogTitle>
              <DialogDescription>Set up a new fundraising round</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Seed Round 2024"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="roundType">Round Type *</Label>
                  <Select value={formData.roundType} onValueChange={(value: any) => setFormData({ ...formData, roundType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                      <SelectItem value="seed">Seed</SelectItem>
                      <SelectItem value="series_a">Series A</SelectItem>
                      <SelectItem value="series_b">Series B</SelectItem>
                      <SelectItem value="series_c">Series C</SelectItem>
                      <SelectItem value="bridge">Bridge</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetAmount">Target Amount ($) *</Label>
                  <Input
                    id="targetAmount"
                    type="number"
                    step="0.01"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                    placeholder="1000000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minimumInvestment">Minimum Investment ($)</Label>
                  <Input
                    id="minimumInvestment"
                    type="number"
                    step="0.01"
                    value={formData.minimumInvestment}
                    onChange={(e) => setFormData({ ...formData, minimumInvestment: e.target.value })}
                    placeholder="25000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valuation">Valuation ($)</Label>
                  <Input
                    id="valuation"
                    type="number"
                    step="0.01"
                    value={formData.valuation}
                    onChange={(e) => setFormData({ ...formData, valuation: e.target.value })}
                    placeholder="10000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="equityOffered">Equity Offered (%)</Label>
                  <Input
                    id="equityOffered"
                    type="number"
                    step="0.01"
                    max="100"
                    value={formData.equityOffered}
                    onChange={(e) => setFormData({ ...formData, equityOffered: e.target.value })}
                    placeholder="10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCampaign.isPending}>
                  {createCampaign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Campaign
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground mb-4">Create your first fundraising campaign to get started</p>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const progress = calculateProgress(campaign.raisedAmount || '0', campaign.targetAmount);
            const raised = parseFloat(campaign.raisedAmount || '0');
            const target = parseFloat(campaign.targetAmount || '0');
            
            return (
              <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{campaign.name}</CardTitle>
                      <CardDescription className="mt-1">
                        <Badge variant="outline" className="capitalize">
                          {campaign.roundType.replace('_', ' ')}
                        </Badge>
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(campaign.status)}>
                      {campaign.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {campaign.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {campaign.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{progress.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-green-600 font-semibold">
                        <DollarSign className="h-4 w-4" />
                        ${raised.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">
                        of ${target.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    {campaign.valuation && (
                      <div>
                        <div className="text-xs text-muted-foreground">Valuation</div>
                        <div className="font-semibold">
                          ${parseFloat(campaign.valuation).toLocaleString()}
                        </div>
                      </div>
                    )}
                    {campaign.equityOffered && (
                      <div>
                        <div className="text-xs text-muted-foreground">Equity</div>
                        <div className="font-semibold">{campaign.equityOffered}%</div>
                      </div>
                    )}
                  </div>

                  {campaign.minimumInvestment && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Min. Investment: </span>
                      <span className="font-medium">
                        ${parseFloat(campaign.minimumInvestment).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {(campaign.startDate || campaign.targetCloseDate) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                      <Calendar className="h-4 w-4" />
                      {campaign.startDate && (
                        <span>Started {new Date(campaign.startDate).toLocaleDateString()}</span>
                      )}
                      {campaign.targetCloseDate && (
                        <span>· Target {new Date(campaign.targetCloseDate).toLocaleDateString()}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
