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
import { LineChart, Plus, Search, Loader2, Sparkles, Send, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function InvestorComms() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUpdate, setPreviewUpdate] = useState<any>(null);
  const [generateForm, setGenerateForm] = useState({
    type: "monthly" as string,
    period: "",
    highlights: "",
    metrics: "",
    challenges: "",
    askOrNotes: "",
  });

  const { data: investorUpdates, isLoading, refetch } = trpc.marketing.investorUpdates.useQuery();
  const generateInvestorUpdate = trpc.marketing.generateInvestorUpdate.useMutation({
    onSuccess: () => {
      toast.success("Investor update generated successfully");
      setIsGenerateOpen(false);
      setGenerateForm({
        type: "monthly", period: "", highlights: "", metrics: "", challenges: "", askOrNotes: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredUpdates = investorUpdates?.filter((update: any) => {
    const matchesSearch =
      update.title?.toLowerCase().includes(search.toLowerCase()) ||
      update.period?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || update.type === typeFilter;
    const matchesStatus = statusFilter === "all" || update.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    generated: "bg-blue-500/10 text-blue-600",
    review: "bg-amber-500/10 text-amber-600",
    approved: "bg-green-500/10 text-green-600",
    sent: "bg-emerald-500/10 text-emerald-600",
  };

  const typeColors: Record<string, string> = {
    monthly: "bg-blue-500/10 text-blue-600",
    quarterly: "bg-purple-500/10 text-purple-600",
    annual: "bg-amber-500/10 text-amber-600",
    board_deck: "bg-green-500/10 text-green-600",
    ad_hoc: "bg-gray-500/10 text-gray-600",
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    generateInvestorUpdate.mutate({
      type: generateForm.type,
      period: generateForm.period,
      highlights: generateForm.highlights,
      metrics: generateForm.metrics,
      challenges: generateForm.challenges,
      askOrNotes: generateForm.askOrNotes,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LineChart className="h-8 w-8" />
            Investor Communications
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate and manage investor updates and reporting packs.
          </p>
        </div>
        <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Update
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleGenerate}>
              <DialogHeader>
                <DialogTitle>Generate Investor Update</DialogTitle>
                <DialogDescription>
                  AI will craft a professional investor update from your inputs.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="updateType">Update Type</Label>
                    <Select
                      value={generateForm.type}
                      onValueChange={(value) => setGenerateForm({ ...generateForm, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly Update</SelectItem>
                        <SelectItem value="quarterly">Quarterly Report</SelectItem>
                        <SelectItem value="annual">Annual Report</SelectItem>
                        <SelectItem value="board_deck">Board Deck</SelectItem>
                        <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="period">Period *</Label>
                    <Input
                      id="period"
                      value={generateForm.period}
                      onChange={(e) => setGenerateForm({ ...generateForm, period: e.target.value })}
                      placeholder="March 2026, Q1 2026..."
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="highlights">Key Highlights *</Label>
                  <Textarea
                    id="highlights"
                    value={generateForm.highlights}
                    onChange={(e) => setGenerateForm({ ...generateForm, highlights: e.target.value })}
                    placeholder="Major achievements, milestones, wins..."
                    rows={3}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metrics">Key Metrics</Label>
                  <Textarea
                    id="metrics"
                    value={generateForm.metrics}
                    onChange={(e) => setGenerateForm({ ...generateForm, metrics: e.target.value })}
                    placeholder="ARR: $2M, MRR growth: 15%, Users: 5K..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="challenges">Challenges & Learnings</Label>
                  <Textarea
                    id="challenges"
                    value={generateForm.challenges}
                    onChange={(e) => setGenerateForm({ ...generateForm, challenges: e.target.value })}
                    placeholder="Obstacles, pivots, areas for improvement..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="askOrNotes">Ask / Additional Notes</Label>
                  <Textarea
                    id="askOrNotes"
                    value={generateForm.askOrNotes}
                    onChange={(e) => setGenerateForm({ ...generateForm, askOrNotes: e.target.value })}
                    placeholder="Intros needed, hiring help, strategic advice..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsGenerateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={generateInvestorUpdate.isPending}>
                  {generateInvestorUpdate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewUpdate?.title || "Investor Update Preview"}</DialogTitle>
            <DialogDescription>
              {previewUpdate?.type?.replace("_", " ")} &middot; {previewUpdate?.period}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap">
              {previewUpdate?.body || previewUpdate?.generatedContent || "No content available."}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Close
            </Button>
            <Button>
              <Send className="h-4 w-4 mr-2" />
              Send to Investors
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search updates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="board_deck">Board Deck</SelectItem>
                <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="generated">Generated</SelectItem>
                <SelectItem value="review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
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
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[100px]" />
                </div>
              ))}
            </div>
          ) : !filteredUpdates || filteredUpdates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LineChart className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No investor updates found</p>
              <p className="text-sm">Generate your first investor update to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUpdates.map((update: any) => (
                  <TableRow key={update.id}>
                    <TableCell className="font-medium">{update.title || "Untitled"}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[update.type] || "bg-gray-500/10 text-gray-600"}>
                        {update.type?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{update.period || "-"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[update.status] || "bg-gray-500/10 text-gray-600"}>
                        {update.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {update.createdAt
                        ? format(new Date(update.createdAt), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewUpdate(update);
                            setIsPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
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
