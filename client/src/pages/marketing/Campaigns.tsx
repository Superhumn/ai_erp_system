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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, Plus, Search, Loader2, BarChart3, Eye, MousePointer, Target } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Campaigns() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "digital" as string,
    budget: 0,
    startDate: "",
    endDate: "",
    description: "",
    channels: "",
  });

  const { data: campaigns, isLoading, refetch } = trpc.marketing.campaigns.useQuery();

  const filteredCampaigns = campaigns?.filter((c: any) => {
    const matchesSearch = c.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    planned: "bg-blue-500/10 text-blue-600",
    active: "bg-green-500/10 text-green-600",
    paused: "bg-amber-500/10 text-amber-600",
    completed: "bg-emerald-500/10 text-emerald-600",
    cancelled: "bg-red-500/10 text-red-600",
  };

  const typeColors: Record<string, string> = {
    digital: "bg-blue-500/10 text-blue-600",
    social: "bg-pink-500/10 text-pink-600",
    email: "bg-amber-500/10 text-amber-600",
    content: "bg-purple-500/10 text-purple-600",
    event: "bg-green-500/10 text-green-600",
    influencer: "bg-red-500/10 text-red-600",
    pr: "bg-indigo-500/10 text-indigo-600",
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Campaign created successfully");
    setIsOpen(false);
    setFormData({
      name: "", type: "digital", budget: 0, startDate: "", endDate: "", description: "", channels: "",
    });
    refetch();
  };

  // Aggregate metrics
  const totalImpressions = campaigns?.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0) || 0;
  const totalClicks = campaigns?.reduce((sum: number, c: any) => sum + (c.clicks || 0), 0) || 0;
  const totalConversions = campaigns?.reduce((sum: number, c: any) => sum + (c.conversions || 0), 0) || 0;
  const totalBudget = campaigns?.reduce((sum: number, c: any) => sum + (c.budget || 0), 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-8 w-8" />
            Campaigns
          </h1>
          <p className="text-muted-foreground mt-1">
            Plan, execute, and track marketing campaigns.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
                <DialogDescription>
                  Set up a new marketing campaign with budget and timeline.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Q1 Product Launch"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Campaign Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="digital">Digital</SelectItem>
                        <SelectItem value="social">Social Media</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="content">Content</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="influencer">Influencer</SelectItem>
                        <SelectItem value="pr">PR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget">Budget ($)</Label>
                    <Input
                      id="budget"
                      type="number"
                      value={formData.budget || ""}
                      onChange={(e) => setFormData({ ...formData, budget: parseFloat(e.target.value) || 0 })}
                      placeholder="10000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channels">Channels</Label>
                  <Input
                    id="channels"
                    value={formData.channels}
                    onChange={(e) => setFormData({ ...formData, channels: e.target.value })}
                    placeholder="Google Ads, Facebook, Instagram..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Campaign goals and details..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Create Campaign
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Impressions</p>
                <p className="text-2xl font-bold">{formatNumber(totalImpressions)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <MousePointer className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Clicks</p>
                <p className="text-2xl font-bold">{formatNumber(totalClicks)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Conversions</p>
                <p className="text-2xl font-bold">{formatNumber(totalConversions)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <BarChart3 className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[120px]" />
                  <Skeleton className="h-4 w-[80px]" />
                </div>
              ))}
            </div>
          ) : !filteredCampaigns || filteredCampaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No campaigns found</p>
              <p className="text-sm">Create your first campaign to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Impressions</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Conversions</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign: any) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[campaign.type] || "bg-gray-500/10 text-gray-600"}>
                        {campaign.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{campaign.budget ? formatCurrency(campaign.budget) : "-"}</TableCell>
                    <TableCell>
                      {campaign.startDate && campaign.endDate
                        ? `${format(new Date(campaign.startDate), "MMM d")} - ${format(new Date(campaign.endDate), "MMM d, yyyy")}`
                        : campaign.startDate
                          ? format(new Date(campaign.startDate), "MMM d, yyyy")
                          : "-"}
                    </TableCell>
                    <TableCell>{campaign.impressions ? formatNumber(campaign.impressions) : "-"}</TableCell>
                    <TableCell>{campaign.clicks ? formatNumber(campaign.clicks) : "-"}</TableCell>
                    <TableCell>{campaign.conversions ? formatNumber(campaign.conversions) : "-"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[campaign.status] || "bg-gray-500/10 text-gray-600"}>
                        {campaign.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
