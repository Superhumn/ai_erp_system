import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Handshake,
  MessageSquare,
  Sparkles,
  Plus,
  DollarSign,
  Target,
  Clock,
  Loader2,
  Send,
  Bot,
  ArrowRightLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const typeLabels: Record<string, string> = {
  price_reduction: "Price Reduction",
  volume_discount: "Volume Discount",
  payment_terms: "Payment Terms",
  lead_time: "Lead Time",
  contract_renewal: "Contract Renewal",
  new_contract: "New Contract",
};

const statusColors: Record<string, string> = {
  draft: "secondary",
  analyzing: "outline",
  ready: "default",
  in_progress: "default",
  counter_offered: "outline",
  accepted: "default",
  rejected: "destructive",
  expired: "secondary",
};

export default function VendorNegotiations() {
  const [activeTab, setActiveTab] = useState("negotiations");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [roundDialogOpen, setRoundDialogOpen] = useState(false);
  const [selectedNegotiationId, setSelectedNegotiationId] = useState<number | null>(null);

  // Create form state
  const [formVendorId, setFormVendorId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState("price_reduction");
  const [formCurrentPrice, setFormCurrentPrice] = useState("");
  const [formCurrentTerms, setFormCurrentTerms] = useState("");
  const [formCurrentLeadTime, setFormCurrentLeadTime] = useState("");
  const [formAnnualVolume, setFormAnnualVolume] = useState("");
  const [formAutoAnalyze, setFormAutoAnalyze] = useState(true);

  // Round form state
  const [roundDirection, setRoundDirection] = useState<"outbound" | "inbound">("outbound");
  const [roundType, setRoundType] = useState("initial_offer");
  const [roundPrice, setRoundPrice] = useState("");
  const [roundTerms, setRoundTerms] = useState("");
  const [roundMessage, setRoundMessage] = useState("");
  const [roundGenerateAi, setRoundGenerateAi] = useState(true);

  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Queries
  const { data: negotiations, isLoading } = trpc.vendorNegotiations.list.useQuery({});
  const { data: stats } = trpc.vendorNegotiations.stats.useQuery({});
  const { data: vendors } = trpc.vendors.list.useQuery({});

  const { data: selectedDetail } = trpc.vendorNegotiations.get.useQuery(
    { id: selectedNegotiationId! },
    { enabled: !!selectedNegotiationId }
  );

  // Mutations
  const createMutation = trpc.vendorNegotiations.create.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Negotiation Created",
        description: `Negotiation ${data.negotiationNumber} has been initiated.`,
      });
      setCreateDialogOpen(false);
      resetCreateForm();
      utils.vendorNegotiations.list.invalidate();
      utils.vendorNegotiations.stats.invalidate();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addRoundMutation = trpc.vendorNegotiations.addRound.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Round Recorded",
        description: `Round ${data.roundNumber} has been added to the negotiation.`,
      });
      setRoundDialogOpen(false);
      resetRoundForm();
      utils.vendorNegotiations.get.invalidate();
      utils.vendorNegotiations.list.invalidate();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function resetCreateForm() {
    setFormVendorId("");
    setFormTitle("");
    setFormType("price_reduction");
    setFormCurrentPrice("");
    setFormCurrentTerms("");
    setFormCurrentLeadTime("");
    setFormAnnualVolume("");
    setFormAutoAnalyze(true);
  }

  function resetRoundForm() {
    setRoundDirection("outbound");
    setRoundType("initial_offer");
    setRoundPrice("");
    setRoundTerms("");
    setRoundMessage("");
    setRoundGenerateAi(true);
  }

  function getVendorName(vendorId: number): string {
    const vendor = vendors?.find((v: any) => v.id === vendorId);
    return vendor?.name || `Vendor #${vendorId}`;
  }

  function openDetail(negotiationId: number) {
    setSelectedNegotiationId(negotiationId);
    setDetailDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automated Vendor Negotiations</h1>
          <p className="text-muted-foreground">
            AI-powered negotiation strategy, analysis, and communication drafting
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Negotiation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <MessageSquare className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Target className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completed || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <Clock className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.rejected || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Savings</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(stats?.totalEstimatedSavings || 0).toFixed(0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="negotiations">
            <Handshake className="h-4 w-4 mr-2" />
            All Negotiations
          </TabsTrigger>
          <TabsTrigger value="active">
            <MessageSquare className="h-4 w-4 mr-2" />
            Active
          </TabsTrigger>
        </TabsList>

        <TabsContent value="negotiations" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (negotiations?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Handshake className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No Negotiations Yet</h3>
                <p className="text-muted-foreground text-center max-w-sm mt-2">
                  Start your first automated vendor negotiation. AI will analyze your vendor relationship and recommend strategies.
                </p>
                <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Start Negotiation
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Number</th>
                        <th className="text-left p-3 font-medium">Title</th>
                        <th className="text-left p-3 font-medium">Vendor</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Current Price</th>
                        <th className="text-right p-3 font-medium">Target Price</th>
                        <th className="text-right p-3 font-medium">Est. Savings</th>
                        <th className="text-center p-3 font-medium">AI Score</th>
                        <th className="text-center p-3 font-medium">Rounds</th>
                        <th className="text-left p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {negotiations?.map((neg: any) => (
                        <tr key={neg.id} className="border-b hover:bg-muted/25">
                          <td className="p-3 font-mono text-xs">{neg.negotiationNumber}</td>
                          <td className="p-3">
                            <button
                              onClick={() => openDetail(neg.id)}
                              className="text-left hover:underline font-medium"
                            >
                              {neg.title}
                            </button>
                          </td>
                          <td className="p-3">{getVendorName(neg.vendorId)}</td>
                          <td className="p-3">
                            <Badge variant="outline">{typeLabels[neg.type] || neg.type}</Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant={(statusColors[neg.status] || "secondary") as any}>
                              {neg.status.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            {neg.currentUnitPrice ? `$${parseFloat(neg.currentUnitPrice).toFixed(2)}` : "-"}
                          </td>
                          <td className="p-3 text-right">
                            {neg.targetUnitPrice ? (
                              <span className="text-green-600">
                                ${parseFloat(neg.targetUnitPrice).toFixed(2)}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="p-3 text-right">
                            {neg.estimatedSavings ? (
                              <span className="text-green-600 font-medium">
                                ${parseFloat(neg.estimatedSavings).toFixed(0)}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="p-3 text-center">
                            {neg.aiConfidenceScore ? (
                              <Badge variant={parseFloat(neg.aiConfidenceScore) >= 70 ? "default" : "outline"}>
                                {parseFloat(neg.aiConfidenceScore).toFixed(0)}%
                              </Badge>
                            ) : "-"}
                          </td>
                          <td className="p-3 text-center">{neg.negotiationRounds || 0}</td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openDetail(neg.id)}
                              >
                                View
                              </Button>
                              {["draft", "ready", "in_progress", "counter_offered"].includes(neg.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedNegotiationId(neg.id);
                                    setRoundDialogOpen(true);
                                  }}
                                >
                                  <Send className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4">
              {negotiations
                ?.filter((n: any) => ["in_progress", "counter_offered", "ready", "analyzing"].includes(n.status))
                .map((neg: any) => {
                  const aiAnalysis = neg.aiAnalysis ? (() => { try { return JSON.parse(neg.aiAnalysis); } catch { return null; }})() : null;
                  return (
                    <Card key={neg.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(neg.id)}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{neg.title}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {getVendorName(neg.vendorId)} &middot; {neg.negotiationNumber}
                            </p>
                          </div>
                          <div className="flex gap-2 items-center">
                            <Badge variant={(statusColors[neg.status] || "secondary") as any}>
                              {neg.status.replace(/_/g, " ")}
                            </Badge>
                            {neg.aiConfidenceScore && (
                              <Badge variant="outline">
                                <Bot className="h-3 w-3 mr-1" />
                                {parseFloat(neg.aiConfidenceScore).toFixed(0)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Current Price</p>
                            <p className="font-medium">
                              {neg.currentUnitPrice ? `$${parseFloat(neg.currentUnitPrice).toFixed(2)}` : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Target Price</p>
                            <p className="font-medium text-green-600">
                              {neg.targetUnitPrice ? `$${parseFloat(neg.targetUnitPrice).toFixed(2)}` : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Est. Savings</p>
                            <p className="font-medium text-green-600">
                              {neg.estimatedSavings ? `$${parseFloat(neg.estimatedSavings).toFixed(0)}` : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Rounds</p>
                            <p className="font-medium">{neg.negotiationRounds || 0} / {neg.maxRounds || 5}</p>
                          </div>
                        </div>
                        {neg.aiStrategy && (
                          <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                            <Sparkles className="h-3 w-3 inline mr-1" />
                            <strong>AI Strategy:</strong> {neg.aiStrategy}
                          </div>
                        )}
                        {aiAnalysis?.leveragePoints?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {aiAnalysis.leveragePoints.slice(0, 3).map((point: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {point}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              {negotiations?.filter((n: any) => ["in_progress", "counter_offered", "ready", "analyzing"].includes(n.status)).length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <ArrowRightLeft className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No Active Negotiations</h3>
                    <p className="text-muted-foreground">Start a negotiation to see it here.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Negotiation Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start Vendor Negotiation</DialogTitle>
            <DialogDescription>
              AI will analyze your vendor relationship and recommend a negotiation strategy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendor</Label>
              <Select value={formVendorId} onValueChange={setFormVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors?.map((v: any) => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Q1 2026 Pricing Review"
              />
            </div>
            <div>
              <Label>Negotiation Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price_reduction">Price Reduction</SelectItem>
                  <SelectItem value="volume_discount">Volume Discount</SelectItem>
                  <SelectItem value="payment_terms">Payment Terms</SelectItem>
                  <SelectItem value="lead_time">Lead Time Improvement</SelectItem>
                  <SelectItem value="contract_renewal">Contract Renewal</SelectItem>
                  <SelectItem value="new_contract">New Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Current Unit Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formCurrentPrice}
                  onChange={(e) => setFormCurrentPrice(e.target.value)}
                  placeholder="25.00"
                />
              </div>
              <div>
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  value={formCurrentTerms}
                  onChange={(e) => setFormCurrentTerms(e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  value={formCurrentLeadTime}
                  onChange={(e) => setFormCurrentLeadTime(e.target.value)}
                  placeholder="14"
                />
              </div>
              <div>
                <Label>Annual Volume ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formAnnualVolume}
                  onChange={(e) => setFormAnnualVolume(e.target.value)}
                  placeholder="100000"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formAutoAnalyze}
                onChange={(e) => setFormAutoAnalyze(e.target.checked)}
                id="auto-analyze"
                className="rounded"
              />
              <Label htmlFor="auto-analyze" className="cursor-pointer">
                <Sparkles className="h-3 w-3 inline mr-1" />
                Auto-analyze with AI (recommended)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!formVendorId || !formTitle) return;
                createMutation.mutate({
                  vendorId: parseInt(formVendorId),
                  title: formTitle,
                  type: formType as any,
                  currentUnitPrice: formCurrentPrice ? parseFloat(formCurrentPrice) : undefined,
                  currentPaymentTerms: formCurrentTerms ? parseInt(formCurrentTerms) : undefined,
                  currentLeadTimeDays: formCurrentLeadTime ? parseInt(formCurrentLeadTime) : undefined,
                  currentAnnualVolume: formAnnualVolume ? parseFloat(formAnnualVolume) : undefined,
                  autoAnalyze: formAutoAnalyze,
                });
              }}
              disabled={!formVendorId || !formTitle || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {formAutoAnalyze ? "Analyze & Create" : "Create Negotiation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Negotiation Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDetail?.negotiation?.title || "Negotiation Details"}
            </DialogTitle>
            <DialogDescription>
              {selectedDetail?.negotiation?.negotiationNumber} &middot;{" "}
              {getVendorName(selectedDetail?.negotiation?.vendorId || 0)}
            </DialogDescription>
          </DialogHeader>
          {selectedDetail?.negotiation && (
            <div className="space-y-4">
              {/* Status & Terms */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={(statusColors[selectedDetail.negotiation.status] || "secondary") as any}>
                    {selectedDetail.negotiation.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{typeLabels[selectedDetail.negotiation.type] || selectedDetail.negotiation.type}</p>
                </div>
              </div>

              {/* Pricing Comparison */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Terms Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1">Current</p>
                      <p>Price: {selectedDetail.negotiation.currentUnitPrice ? `$${parseFloat(selectedDetail.negotiation.currentUnitPrice).toFixed(2)}` : "N/A"}</p>
                      <p>Terms: {selectedDetail.negotiation.currentPaymentTerms || "N/A"} days</p>
                      <p>Lead: {selectedDetail.negotiation.currentLeadTimeDays || "N/A"} days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Target</p>
                      <p className="text-green-600">Price: {selectedDetail.negotiation.targetUnitPrice ? `$${parseFloat(selectedDetail.negotiation.targetUnitPrice).toFixed(2)}` : "N/A"}</p>
                      <p>Terms: {selectedDetail.negotiation.targetPaymentTerms || "N/A"} days</p>
                      <p>Lead: {selectedDetail.negotiation.targetLeadTimeDays || "N/A"} days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Agreed</p>
                      <p className="font-medium">Price: {selectedDetail.negotiation.agreedUnitPrice ? `$${parseFloat(selectedDetail.negotiation.agreedUnitPrice).toFixed(2)}` : "-"}</p>
                      <p>Terms: {selectedDetail.negotiation.agreedPaymentTerms || "-"} days</p>
                      <p>Lead: {selectedDetail.negotiation.agreedLeadTimeDays || "-"} days</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Strategy */}
              {selectedDetail.negotiation.aiStrategy && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1">
                      <Sparkles className="h-4 w-4" />
                      AI Strategy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{selectedDetail.negotiation.aiStrategy}</p>
                    {selectedDetail.negotiation.aiConfidenceScore && (
                      <Badge variant="outline" className="mt-2">
                        Confidence: {parseFloat(selectedDetail.negotiation.aiConfidenceScore).toFixed(0)}%
                      </Badge>
                    )}
                    {selectedDetail.negotiation.estimatedSavings && (
                      <Badge variant="outline" className="mt-2 ml-2">
                        Est. Savings: ${parseFloat(selectedDetail.negotiation.estimatedSavings).toFixed(0)}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Rounds Timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Negotiation Rounds</CardTitle>
                    {["draft", "ready", "in_progress", "counter_offered"].includes(selectedDetail.negotiation.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRoundDialogOpen(true);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Round
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedDetail.rounds.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No rounds yet. Add the first round to start negotiations.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedDetail.rounds.map((round: any) => (
                        <div
                          key={round.id}
                          className={`p-3 rounded border ${round.direction === "outbound" ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-gray-50/50"}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={round.direction === "outbound" ? "default" : "secondary"} className="text-xs">
                                {round.direction === "outbound" ? "Sent" : "Received"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Round {round.roundNumber} &middot; {round.messageType.replace(/_/g, " ")}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {round.sentAt ? new Date(round.sentAt).toLocaleDateString() : round.receivedAt ? new Date(round.receivedAt).toLocaleDateString() : ""}
                            </span>
                          </div>
                          {round.proposedUnitPrice && (
                            <p className="text-sm">
                              Proposed price: <strong>${parseFloat(round.proposedUnitPrice).toFixed(2)}</strong>
                              {round.proposedPaymentTerms && ` | ${round.proposedPaymentTerms} day terms`}
                            </p>
                          )}
                          {round.messageContent && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {round.messageContent}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Round Dialog */}
      <Dialog open={roundDialogOpen} onOpenChange={setRoundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Negotiation Round</DialogTitle>
            <DialogDescription>
              Record a sent or received message in this negotiation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Direction</Label>
              <Select value={roundDirection} onValueChange={(v) => setRoundDirection(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound (We sent)</SelectItem>
                  <SelectItem value="inbound">Inbound (They responded)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Message Type</Label>
              <Select value={roundType} onValueChange={setRoundType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial_offer">Initial Offer</SelectItem>
                  <SelectItem value="counter_offer">Counter Offer</SelectItem>
                  <SelectItem value="info_request">Information Request</SelectItem>
                  <SelectItem value="final_offer">Final Offer</SelectItem>
                  <SelectItem value="acceptance">Acceptance</SelectItem>
                  <SelectItem value="rejection">Rejection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Proposed Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={roundPrice}
                  onChange={(e) => setRoundPrice(e.target.value)}
                  placeholder="22.50"
                />
              </div>
              <div>
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  value={roundTerms}
                  onChange={(e) => setRoundTerms(e.target.value)}
                  placeholder="45"
                />
              </div>
            </div>
            <div>
              <Label>Message/Notes</Label>
              <Input
                value={roundMessage}
                onChange={(e) => setRoundMessage(e.target.value)}
                placeholder="Summary of the communication..."
              />
            </div>
            {roundDirection === "outbound" && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={roundGenerateAi}
                  onChange={(e) => setRoundGenerateAi(e.target.checked)}
                  id="generate-ai"
                  className="rounded"
                />
                <Label htmlFor="generate-ai" className="cursor-pointer">
                  <Bot className="h-3 w-3 inline mr-1" />
                  Generate AI draft for email
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoundDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedNegotiationId) return;
                addRoundMutation.mutate({
                  negotiationId: selectedNegotiationId,
                  direction: roundDirection,
                  messageType: roundType as any,
                  proposedUnitPrice: roundPrice ? parseFloat(roundPrice) : undefined,
                  proposedPaymentTerms: roundTerms ? parseInt(roundTerms) : undefined,
                  messageContent: roundMessage || undefined,
                  generateAiDraft: roundDirection === "outbound" ? roundGenerateAi : undefined,
                });
              }}
              disabled={addRoundMutation.isPending}
            >
              {addRoundMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Round
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
