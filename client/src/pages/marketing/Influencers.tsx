import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Users, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Influencers() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    handle: "",
    email: "",
    platform: "instagram" as string,
    followerCount: 0,
    engagementRate: 0,
    tier: "micro" as string,
    niche: "",
    notes: "",
  });

  const { data: influencers, isLoading, refetch } = trpc.marketing.influencers.useQuery();
  const createInfluencer = trpc.marketing.influencers.useQuery;

  const filteredInfluencers = influencers?.filter((inf: any) => {
    const matchesSearch =
      inf.name?.toLowerCase().includes(search.toLowerCase()) ||
      inf.handle?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || inf.status === statusFilter;
    const matchesPlatform = platformFilter === "all" || inf.platform === platformFilter;
    return matchesSearch && matchesStatus && matchesPlatform;
  });

  const statusColors: Record<string, string> = {
    prospect: "bg-gray-500/10 text-gray-600",
    outreach: "bg-blue-500/10 text-blue-600",
    negotiating: "bg-amber-500/10 text-amber-600",
    active: "bg-green-500/10 text-green-600",
    completed: "bg-emerald-500/10 text-emerald-600",
    declined: "bg-red-500/10 text-red-600",
  };

  const tierColors: Record<string, string> = {
    nano: "bg-gray-500/10 text-gray-600",
    micro: "bg-blue-500/10 text-blue-600",
    mid: "bg-purple-500/10 text-purple-600",
    macro: "bg-amber-500/10 text-amber-600",
    mega: "bg-red-500/10 text-red-600",
  };

  const platformColors: Record<string, string> = {
    instagram: "bg-pink-500/10 text-pink-600",
    youtube: "bg-red-500/10 text-red-600",
    tiktok: "bg-gray-500/10 text-gray-800",
    twitter: "bg-blue-500/10 text-blue-600",
    linkedin: "bg-blue-700/10 text-blue-700",
  };

  const formatFollowers = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Influencer added successfully");
    setIsOpen(false);
    setFormData({
      name: "", handle: "", email: "", platform: "instagram",
      followerCount: 0, engagementRate: 0, tier: "micro", niche: "", notes: "",
    });
    refetch();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            Influencers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage influencer partnerships and collaborations.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Influencer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Add Influencer</DialogTitle>
                <DialogDescription>
                  Add a new influencer to track and manage collaborations.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Full name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="handle">Handle *</Label>
                    <Input
                      id="handle"
                      value={formData.handle}
                      onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                      placeholder="@handle"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform">Platform</Label>
                    <Select
                      value={formData.platform}
                      onValueChange={(value) => setFormData({ ...formData, platform: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="twitter">Twitter / X</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="followerCount">Follower Count</Label>
                    <Input
                      id="followerCount"
                      type="number"
                      value={formData.followerCount || ""}
                      onChange={(e) => setFormData({ ...formData, followerCount: parseInt(e.target.value) || 0 })}
                      placeholder="10000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="engagementRate">Engagement Rate (%)</Label>
                    <Input
                      id="engagementRate"
                      type="number"
                      step="0.1"
                      value={formData.engagementRate || ""}
                      onChange={(e) => setFormData({ ...formData, engagementRate: parseFloat(e.target.value) || 0 })}
                      placeholder="3.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tier">Tier</Label>
                    <Select
                      value={formData.tier}
                      onValueChange={(value) => setFormData({ ...formData, tier: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nano">Nano (1K-10K)</SelectItem>
                        <SelectItem value="micro">Micro (10K-100K)</SelectItem>
                        <SelectItem value="mid">Mid (100K-500K)</SelectItem>
                        <SelectItem value="macro">Macro (500K-1M)</SelectItem>
                        <SelectItem value="mega">Mega (1M+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="niche">Niche</Label>
                    <Input
                      id="niche"
                      value={formData.niche}
                      onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                      placeholder="Tech, Fashion, etc."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Add Influencer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search influencers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="twitter">Twitter / X</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="outreach">Outreach</SelectItem>
                <SelectItem value="negotiating">Negotiating</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[180px]" />
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[60px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[70px]" />
                </div>
              ))}
            </div>
          ) : !filteredInfluencers || filteredInfluencers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No influencers found</p>
              <p className="text-sm">Add your first influencer to start managing partnerships.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Followers</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Niche</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInfluencers.map((inf: any) => (
                  <TableRow key={inf.id}>
                    <TableCell className="font-medium">{inf.name}</TableCell>
                    <TableCell className="text-muted-foreground">{inf.handle}</TableCell>
                    <TableCell>
                      <Badge className={platformColors[inf.platform] || "bg-gray-500/10 text-gray-600"}>
                        {inf.platform}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatFollowers(inf.followerCount || 0)}</TableCell>
                    <TableCell>{inf.engagementRate ? `${inf.engagementRate}%` : "-"}</TableCell>
                    <TableCell>
                      <Badge className={tierColors[inf.tier] || "bg-gray-500/10 text-gray-600"}>
                        {inf.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>{inf.niche || "-"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[inf.status] || "bg-gray-500/10 text-gray-600"}>
                        {inf.status?.replace("_", " ")}
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
