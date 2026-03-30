import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  Target,
  DollarSign,
  Package,
  Truck,
  Users,
  Factory,
  Zap,
  RefreshCw,
  MessageSquare,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function HealthBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500/20 text-emerald-700 border-emerald-500/30",
    yellow: "bg-amber-500/20 text-amber-700 border-amber-500/30",
    red: "bg-red-500/20 text-red-700 border-red-500/30",
  };
  return <Badge className={colors[status] ?? "bg-gray-500/20 text-gray-600"}>{status.toUpperCase()}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-amber-500 text-white",
    low: "bg-blue-500 text-white",
  };
  return <Badge className={colors[severity] ?? "bg-gray-500 text-white"}>{severity}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    immediate: "bg-red-500/20 text-red-700",
    short_term: "bg-amber-500/20 text-amber-700",
    medium_term: "bg-blue-500/20 text-blue-700",
  };
  return <Badge className={colors[priority] ?? "bg-gray-500/20 text-gray-600"}>{priority.replace("_", " ")}</Badge>;
}

export default function ExecutiveDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [question, setQuestion] = useState("");
  const [focusArea, setFocusArea] = useState("");

  // Queries
  const kpisQuery = trpc.executive.getKPIs.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Mutations
  const analysisMutation = trpc.executive.strategicAnalysis.useMutation();
  const briefingMutation = trpc.executive.executiveBriefing.useMutation();
  const questionMutation = trpc.executive.askQuestion.useMutation();
  const deepDiveMutation = trpc.executive.departmentDeepDive.useMutation();

  const kpis = kpisQuery.data;
  const analysis = analysisMutation.data;
  const briefing = briefingMutation.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Brain className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Executive Intelligence</h1>
            <p className="text-muted-foreground text-sm">COO-level strategic reasoning and operational intelligence</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => kpisQuery.refetch()}
            disabled={kpisQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${kpisQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh KPIs
          </Button>
          <Button
            size="sm"
            onClick={() => analysisMutation.mutate({ focusArea: focusArea || undefined })}
            disabled={analysisMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Brain className={`h-4 w-4 mr-1 ${analysisMutation.isPending ? "animate-pulse" : ""}`} />
            {analysisMutation.isPending ? "Analyzing..." : "Run Strategic Analysis"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => briefingMutation.mutate({ focusArea: focusArea || undefined })}
            disabled={briefingMutation.isPending}
          >
            <BarChart3 className={`h-4 w-4 mr-1 ${briefingMutation.isPending ? "animate-pulse" : ""}`} />
            {briefingMutation.isPending ? "Generating..." : "Executive Briefing"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3 w-3" /> Revenue
              </div>
              <div className="text-lg font-bold">{formatCurrency(kpis.finance.totalRevenue)}</div>
              <div className="text-xs text-muted-foreground">{kpis.finance.invoiceCount} invoices</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" /> Receivables
              </div>
              <div className="text-lg font-bold">{formatCurrency(kpis.finance.outstandingReceivables)}</div>
              <div className="text-xs text-red-500">{kpis.finance.overdueInvoiceCount} overdue</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Target className="h-3 w-3" /> Pipeline
              </div>
              <div className="text-lg font-bold">{formatCurrency(kpis.sales.pipelineValue)}</div>
              <div className="text-xs text-muted-foreground">{kpis.operations.openOrderCount} open orders</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Package className="h-3 w-3" /> Inventory
              </div>
              <div className="text-lg font-bold">{formatCurrency(kpis.supplyChain.totalInventoryValue)}</div>
              <div className="text-xs text-amber-600">{kpis.supplyChain.lowStockItems} low stock</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Factory className="h-3 w-3" /> Work Orders
              </div>
              <div className="text-lg font-bold">{kpis.operations.activeWorkOrders}</div>
              <div className="text-xs text-muted-foreground">{kpis.operations.workOrderCompletionRate}% completion</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Zap className="h-3 w-3" /> Automation
              </div>
              <div className="text-lg font-bold">{kpis.automation.automationSuccessRate}%</div>
              <div className="text-xs text-muted-foreground">{kpis.automation.recentWorkflowRuns} runs (30d)</div>
            </CardContent>
          </Card>
        </div>
      ) : kpisQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4 pb-3 px-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Strategic Analysis</TabsTrigger>
          <TabsTrigger value="briefing">Executive Briefing</TabsTrigger>
          <TabsTrigger value="ask">Ask COO</TabsTrigger>
          <TabsTrigger value="deepdive">Department Deep Dive</TabsTrigger>
        </TabsList>

        {/* STRATEGIC ANALYSIS TAB */}
        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Focus area (optional): e.g. 'cash flow risk', 'supply chain delays'"
              className="flex-1 px-3 py-2 rounded-md border text-sm"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => analysisMutation.mutate({ focusArea: focusArea || undefined })}
              disabled={analysisMutation.isPending}
            >
              {analysisMutation.isPending ? "Analyzing..." : "Analyze"}
            </Button>
          </div>

          {analysisMutation.isPending && (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-8 w-8 mx-auto mb-3 text-purple-500 animate-pulse" />
                <p className="text-muted-foreground">Running COO-level strategic analysis across all departments...</p>
              </CardContent>
            </Card>
          )}

          {analysis && (
            <>
              {/* Operational Health */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5" /> Operational Health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-sm font-medium">Overall:</span>
                    <Badge className={
                      analysis.operationalHealth.overall === "excellent" ? "bg-emerald-600 text-white" :
                      analysis.operationalHealth.overall === "good" ? "bg-green-500 text-white" :
                      analysis.operationalHealth.overall === "needs_attention" ? "bg-amber-500 text-white" :
                      "bg-red-600 text-white"
                    }>
                      {analysis.operationalHealth.overall.replace("_", " ").toUpperCase()}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    {(["finance", "operations", "supplyChain", "sales"] as const).map((dept) => (
                      <div key={dept} className="flex items-center justify-between p-2 rounded-lg border">
                        <span className="text-sm capitalize">{dept === "supplyChain" ? "Supply Chain" : dept}</span>
                        <HealthBadge status={analysis.operationalHealth[dept]} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Executive Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Executive Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{analysis.executiveSummary}</p>
                </CardContent>
              </Card>

              {/* Critical Risks */}
              {analysis.criticalRisks?.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-5 w-5" /> Critical Risks ({analysis.criticalRisks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysis.criticalRisks.map((risk: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={risk.severity} />
                          <span className="text-sm font-medium">{risk.area}</span>
                        </div>
                        <p className="text-sm mb-1">{risk.risk}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ArrowRight className="h-3 w-3" />
                          <span>{risk.recommendation}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Bottlenecks */}
              {analysis.bottlenecks?.length > 0 && (
                <Card className="border-amber-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
                      <Clock className="h-5 w-5" /> Bottlenecks ({analysis.bottlenecks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysis.bottlenecks.map((bn: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border bg-muted/30">
                        <p className="text-sm font-medium mb-1">{bn.process}</p>
                        <p className="text-sm text-muted-foreground mb-1">Impact: {bn.impact}</p>
                        <p className="text-sm text-muted-foreground mb-1">Root cause: {bn.rootCause}</p>
                        <div className="flex items-center gap-1 text-xs text-purple-600">
                          <ArrowRight className="h-3 w-3" />
                          <span>{bn.suggestedAction}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Opportunities */}
              {analysis.opportunities?.length > 0 && (
                <Card className="border-emerald-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-emerald-700">
                      <TrendingUp className="h-5 w-5" /> Opportunities ({analysis.opportunities.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysis.opportunities.map((opp: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <PriorityBadge priority={opp.priority} />
                          <span className="text-sm font-medium">{opp.area}</span>
                        </div>
                        <p className="text-sm mb-1">{opp.opportunity}</p>
                        <p className="text-xs text-emerald-600">Estimated impact: {opp.estimatedImpact}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Action Items */}
              {analysis.actionItems?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" /> Priority Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analysis.actionItems.map((item: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold shrink-0">
                            {item.priority}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{item.action}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span>{item.department}</span>
                              <span>-</span>
                              <span>{item.owner}</span>
                              <span>-</span>
                              <span>{item.deadline}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* EXECUTIVE BRIEFING TAB */}
        <TabsContent value="briefing" className="space-y-4">
          <Button
            onClick={() => briefingMutation.mutate({ focusArea: focusArea || undefined })}
            disabled={briefingMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <BarChart3 className={`h-4 w-4 mr-1 ${briefingMutation.isPending ? "animate-pulse" : ""}`} />
            {briefingMutation.isPending ? "Generating Briefing..." : "Generate Executive Briefing"}
          </Button>

          {briefingMutation.isPending && (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-8 w-8 mx-auto mb-3 text-purple-500 animate-pulse" />
                <p className="text-muted-foreground">Preparing your executive briefing...</p>
              </CardContent>
            </Card>
          )}

          {briefing && (
            <Card>
              <CardHeader>
                <CardTitle>{briefing.title}</CardTitle>
                <CardDescription>Generated {new Date(briefing.generatedAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                  {briefing.narrativeBriefing}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ASK COO TAB */}
        <TabsContent value="ask" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Ask Your AI COO
              </CardTitle>
              <CardDescription>
                Ask strategic questions and get data-driven answers grounded in real operational metrics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="e.g. 'Should we increase production capacity this quarter?' or 'What's our biggest cash flow risk right now?'"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    if (question.trim()) questionMutation.mutate({ question: question.trim() });
                  }}
                  disabled={questionMutation.isPending || !question.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Brain className={`h-4 w-4 mr-1 ${questionMutation.isPending ? "animate-pulse" : ""}`} />
                  {questionMutation.isPending ? "Thinking..." : "Ask"}
                </Button>
                <div className="flex flex-wrap gap-1">
                  {[
                    "What are our top 3 operational risks?",
                    "How is cash flow looking?",
                    "Where should we focus this week?",
                    "Are we on track for production targets?",
                  ].map((q) => (
                    <Button
                      key={q}
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setQuestion(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {questionMutation.isPending && (
            <Card>
              <CardContent className="py-8 text-center">
                <Brain className="h-8 w-8 mx-auto mb-3 text-purple-500 animate-pulse" />
                <p className="text-muted-foreground">Analyzing operational data to answer your question...</p>
              </CardContent>
            </Card>
          )}

          {questionMutation.data && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">COO Analysis</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Confidence: {questionMutation.data.confidence === "high" ? "High" : "Limited Data"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                  {questionMutation.data.answer}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DEPARTMENT DEEP DIVE TAB */}
        <TabsContent value="deepdive" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              { key: "finance", label: "Finance", icon: DollarSign, color: "text-green-600" },
              { key: "operations", label: "Operations", icon: Factory, color: "text-blue-600" },
              { key: "supply_chain", label: "Supply Chain", icon: Truck, color: "text-orange-600" },
              { key: "sales", label: "Sales", icon: Target, color: "text-purple-600" },
              { key: "workforce", label: "Workforce", icon: Users, color: "text-indigo-600" },
            ] as const).map(({ key, label, icon: Icon, color }) => (
              <Button
                key={key}
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => deepDiveMutation.mutate({ department: key })}
                disabled={deepDiveMutation.isPending}
              >
                <Icon className={`h-6 w-6 ${color}`} />
                <span className="text-sm">{label}</span>
              </Button>
            ))}
          </div>

          {deepDiveMutation.isPending && (
            <Card>
              <CardContent className="py-8 text-center">
                <Brain className="h-8 w-8 mx-auto mb-3 text-purple-500 animate-pulse" />
                <p className="text-muted-foreground">Performing deep-dive analysis...</p>
              </CardContent>
            </Card>
          )}

          {deepDiveMutation.data && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Department Deep Dive</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                  {deepDiveMutation.data.analysis}
                </div>
                {Object.keys(deepDiveMutation.data.metrics).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Raw Metrics</h4>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">
                        {JSON.stringify(deepDiveMutation.data.metrics, null, 2)}
                      </pre>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
