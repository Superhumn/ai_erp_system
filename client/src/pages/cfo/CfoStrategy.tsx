import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Target,
  Brain,
  Plus,
  Loader2,
  Clock,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const statusIcons: Record<string, any> = {
  draft: Clock,
  active: ArrowUpRight,
  completed: CheckCircle2,
  paused: PauseCircle,
  archived: AlertCircle,
};

const categoryLabels: Record<string, string> = {
  growth: "Growth",
  cost_reduction: "Cost Reduction",
  capital_allocation: "Capital Allocation",
  risk_management: "Risk Management",
  cash_optimization: "Cash Optimization",
  debt_strategy: "Debt Strategy",
  tax_planning: "Tax Planning",
  m_and_a: "M&A",
  fundraising: "Fundraising",
  operational_efficiency: "Operational Efficiency",
};

const timeHorizonLabels: Record<string, string> = {
  short_term: "Short Term (0-6 months)",
  medium_term: "Medium Term (6-18 months)",
  long_term: "Long Term (18+ months)",
};

export default function CfoStrategy() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    objective: "",
    category: "growth" as const,
    timeHorizon: "medium_term" as const,
    constraints: "",
  });

  const { data: strategies, isLoading } = useQuery({
    queryKey: ["cfo-strategies", statusFilter],
    queryFn: () => trpc.cfo.strategies.list.query(statusFilter !== "all" ? { status: statusFilter } : undefined),
  });

  const generateStrategy = useMutation({
    mutationFn: () => trpc.cfo.strategies.generate.mutate(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cfo-strategies"] });
      toast.success("Strategy generated with AI reasoning");
      setCreateOpen(false);
      setFormData({ objective: "", category: "growth", timeHorizon: "medium_term", constraints: "" });
    },
    onError: () => toast.error("Failed to generate strategy"),
  });

  const updateStrategy = useMutation({
    mutationFn: (params: { id: number; status?: string; priority?: string }) =>
      trpc.cfo.strategies.update.mutate(params as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cfo-strategies"] });
      toast.success("Strategy updated");
    },
  });

  function parseSafe(val: string | null | undefined) {
    if (!val) return [];
    try { return JSON.parse(val); } catch { return []; }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <Target className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Financial Strategy</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            AI-generated strategic plans with deep financial reasoning
            <span className="mx-2">|</span>
            <Link href="/cfo" className="text-primary hover:underline">Back to CFO Dashboard</Link>
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> New Strategy</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate Financial Strategy</DialogTitle>
              <DialogDescription>Describe your objective and the AI CFO will develop a comprehensive strategy with reasoning</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Strategic Objective</label>
                <Textarea
                  placeholder="e.g., Improve cash conversion cycle by 20% over the next 6 months"
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Time Horizon</label>
                  <Select value={formData.timeHorizon} onValueChange={(v) => setFormData({ ...formData, timeHorizon: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short_term">Short Term</SelectItem>
                      <SelectItem value="medium_term">Medium Term</SelectItem>
                      <SelectItem value="long_term">Long Term</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Constraints (optional)</label>
                <Input
                  placeholder="e.g., Budget limited to $50k, no new hires"
                  value={formData.constraints}
                  onChange={(e) => setFormData({ ...formData, constraints: e.target.value })}
                />
              </div>
              <Button
                onClick={() => generateStrategy.mutate()}
                disabled={!formData.objective.trim() || generateStrategy.isPending}
                className="w-full"
              >
                {generateStrategy.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
                Generate Strategy with AI Reasoning
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "draft", "active", "completed", "paused"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* Strategies List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !strategies?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No strategies yet. Click "New Strategy" to generate one with AI reasoning.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {strategies.map((strategy: any) => {
            const StatusIcon = statusIcons[strategy.status] || Clock;
            const isExpanded = expandedId === strategy.id;
            const milestones = parseSafe(strategy.milestones);
            const kpis = parseSafe(strategy.kpis);

            return (
              <Card key={strategy.id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : strategy.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <StatusIcon className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                      <div>
                        <CardTitle className="text-lg">{strategy.title}</CardTitle>
                        <CardDescription className="mt-1">{strategy.objective}</CardDescription>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">{categoryLabels[strategy.category] || strategy.category}</Badge>
                          <Badge variant="outline">{timeHorizonLabels[strategy.timeHorizon] || strategy.timeHorizon}</Badge>
                          <Badge className={priorityColors[strategy.priority]}>{strategy.priority}</Badge>
                          <Badge variant="secondary">{strategy.status}</Badge>
                          {strategy.estimatedImpact && (
                            <Badge variant="outline" className="text-green-700">
                              Est. Impact: ${Number(strategy.estimatedImpact).toLocaleString()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t pt-4 space-y-4">
                    <Tabs defaultValue="reasoning">
                      <TabsList>
                        <TabsTrigger value="reasoning">AI Reasoning</TabsTrigger>
                        <TabsTrigger value="milestones">Milestones</TabsTrigger>
                        <TabsTrigger value="kpis">KPIs</TabsTrigger>
                        <TabsTrigger value="risks">Risks & Assumptions</TabsTrigger>
                      </TabsList>

                      <TabsContent value="reasoning" className="mt-4">
                        <div className="bg-muted/50 rounded-lg p-4">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Brain className="h-4 w-4" /> Strategic Reasoning
                          </h4>
                          <p className="text-sm whitespace-pre-wrap">{strategy.reasoning}</p>
                        </div>
                      </TabsContent>

                      <TabsContent value="milestones" className="mt-4">
                        {milestones.length > 0 ? (
                          <div className="space-y-3">
                            {milestones.map((m: any, i: number) => (
                              <div key={i} className="flex items-start gap-3 border rounded p-3">
                                <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                  {i + 1}
                                </div>
                                <div>
                                  <p className="font-medium">{m.name}</p>
                                  <p className="text-sm text-muted-foreground">{m.target}</p>
                                  {m.timeline && <p className="text-xs text-muted-foreground mt-1">{m.timeline}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No milestones defined</p>
                        )}
                      </TabsContent>

                      <TabsContent value="kpis" className="mt-4">
                        {kpis.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {kpis.map((k: any, i: number) => (
                              <div key={i} className="border rounded p-3">
                                <p className="font-medium">{k.metric}</p>
                                <div className="flex justify-between text-sm mt-1">
                                  <span className="text-muted-foreground">Current: {k.current}</span>
                                  <span className="text-primary font-medium">Target: {k.target}</span>
                                </div>
                                {k.timeline && <p className="text-xs text-muted-foreground mt-1">{k.timeline}</p>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No KPIs defined</p>
                        )}
                      </TabsContent>

                      <TabsContent value="risks" className="mt-4 space-y-4">
                        {strategy.assumptions && (
                          <div>
                            <h4 className="font-medium mb-1">Assumptions</h4>
                            <p className="text-sm whitespace-pre-wrap">{strategy.assumptions}</p>
                          </div>
                        )}
                        {strategy.risks && (
                          <div>
                            <h4 className="font-medium mb-1 text-amber-700">Risks</h4>
                            <p className="text-sm whitespace-pre-wrap">{strategy.risks}</p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2 border-t">
                      {strategy.status === "draft" && (
                        <Button size="sm" onClick={() => updateStrategy.mutate({ id: strategy.id, status: "active" })}>
                          Activate Strategy
                        </Button>
                      )}
                      {strategy.status === "active" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => updateStrategy.mutate({ id: strategy.id, status: "paused" })}>
                            Pause
                          </Button>
                          <Button size="sm" onClick={() => updateStrategy.mutate({ id: strategy.id, status: "completed" })}>
                            Mark Completed
                          </Button>
                        </>
                      )}
                      {strategy.status === "paused" && (
                        <Button size="sm" onClick={() => updateStrategy.mutate({ id: strategy.id, status: "active" })}>
                          Resume
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
