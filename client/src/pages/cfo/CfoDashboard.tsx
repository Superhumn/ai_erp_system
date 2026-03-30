import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  FileText,
  Loader2,
  Zap,
  Shield,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const severityColors: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-700 border-blue-200",
  warning: "bg-amber-500/10 text-amber-700 border-amber-200",
  critical: "bg-red-500/10 text-red-700 border-red-200",
  opportunity: "bg-green-500/10 text-green-700 border-green-200",
};

const severityIcons: Record<string, any> = {
  info: BarChart3,
  warning: AlertTriangle,
  critical: Shield,
  opportunity: Lightbulb,
};

const categoryLabels: Record<string, string> = {
  cash_flow: "Cash Flow",
  profitability: "Profitability",
  revenue: "Revenue",
  cost_optimization: "Cost Optimization",
  risk: "Risk",
  working_capital: "Working Capital",
  debt: "Debt",
  tax: "Tax",
  growth: "Growth",
  compliance: "Compliance",
};

function formatCurrency(value: number | string | null | undefined) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export default function CfoDashboard() {
  const queryClient = useQueryClient();
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioText, setScenarioText] = useState("");
  const [scenarioResult, setScenarioResult] = useState<any>(null);
  const [insightFilter, setInsightFilter] = useState<string>("all");

  // Fetch financial summary
  const { data: financialSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["cfo-financial-summary"],
    queryFn: () => trpc.cfo.financialSummary.query(),
  });

  // Fetch insights
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["cfo-insights", insightFilter],
    queryFn: () => trpc.cfo.insights.list.query(insightFilter !== "all" ? { category: insightFilter } : undefined),
  });

  // Fetch KPI snapshots
  const { data: kpis } = useQuery({
    queryKey: ["cfo-kpis"],
    queryFn: () => trpc.cfo.kpis.list.query(),
  });

  // Fetch active strategies
  const { data: strategies } = useQuery({
    queryKey: ["cfo-strategies-active"],
    queryFn: () => trpc.cfo.strategies.list.query({ status: "active" }),
  });

  // Generate insights mutation
  const generateInsights = useMutation({
    mutationFn: () => trpc.cfo.insights.generate.mutate(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cfo-insights"] });
      toast.success(`Generated ${data.length} new financial insights`);
    },
    onError: () => toast.error("Failed to generate insights"),
  });

  // Capture KPI snapshot
  const captureKpi = useMutation({
    mutationFn: () => trpc.cfo.kpis.capture.mutate(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cfo-kpis"] });
      toast.success("KPI snapshot captured");
    },
  });

  // Generate board report
  const generateReport = useMutation({
    mutationFn: () => trpc.cfo.boardReport.mutate(),
    onSuccess: (data) => {
      toast.success("Board report generated");
      setScenarioResult(data);
      setScenarioOpen(true);
    },
    onError: () => toast.error("Failed to generate board report"),
  });

  // Scenario analysis
  const runScenario = useMutation({
    mutationFn: (scenario: string) => trpc.cfo.scenarioAnalysis.mutate({ scenario }),
    onSuccess: (data) => {
      setScenarioResult(data);
      toast.success("Scenario analysis complete");
    },
    onError: () => toast.error("Scenario analysis failed"),
  });

  // Update insight status
  const updateInsight = useMutation({
    mutationFn: (params: { id: number; status: "acknowledged" | "in_progress" | "resolved" | "dismissed" }) =>
      trpc.cfo.insights.updateStatus.mutate(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cfo-insights"] });
    },
  });

  const summary = financialSummary;
  const latestKpi = kpis?.[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">CFO Intelligence</h1>
          </div>
          <p className="text-muted-foreground mt-1">AI-powered financial insights, strategy, and reasoning</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => captureKpi.mutate()} disabled={captureKpi.isPending}>
            {captureKpi.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BarChart3 className="h-4 w-4 mr-1" />}
            Snapshot KPIs
          </Button>
          <Button variant="outline" size="sm" onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
            {generateReport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
            Board Report
          </Button>
          <Button onClick={() => generateInsights.mutate()} disabled={generateInsights.isPending}>
            {generateInsights.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
            Generate Insights
          </Button>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Position</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.accounts?.cashBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total Assets: {formatCurrency(summary?.accounts?.totalAssets)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.invoices?.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Outstanding: {formatCurrency(summary?.invoices?.totalOutstanding)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue AR</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(summary?.invoices?.totalOverdue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.orders?.pendingOrders || 0} pending orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Liabilities</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.accounts?.totalLiabilities)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              PO Commitments: {formatCurrency(summary?.purchaseOrders?.totalPOValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPI Quick View */}
      {latestKpi && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Financial Metrics</CardTitle>
            <CardDescription>Latest KPI snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {latestKpi.grossMargin && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Gross Margin</p>
                  <p className="text-xl font-bold">{Number(latestKpi.grossMargin).toFixed(1)}%</p>
                </div>
              )}
              {latestKpi.currentRatio && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Current Ratio</p>
                  <p className="text-xl font-bold">{Number(latestKpi.currentRatio).toFixed(2)}</p>
                </div>
              )}
              {latestKpi.dso && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">DSO</p>
                  <p className="text-xl font-bold">{Number(latestKpi.dso).toFixed(0)} days</p>
                </div>
              )}
              {latestKpi.burnRate && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Burn Rate</p>
                  <p className="text-xl font-bold">{formatCurrency(latestKpi.burnRate)}/mo</p>
                </div>
              )}
              {latestKpi.runway && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Runway</p>
                  <p className="text-xl font-bold">{Number(latestKpi.runway).toFixed(1)} mo</p>
                </div>
              )}
              {latestKpi.ebitda && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">EBITDA</p>
                  <p className="text-xl font-bold">{formatCurrency(latestKpi.ebitda)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation to sub-pages */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/cfo/strategy">
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Financial Strategy</CardTitle>
              </div>
              <CardDescription>AI-generated strategic plans with reasoning</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {strategies?.length || 0} active strategies
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/cfo/cash-flow">
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Cash Flow Forecasting</CardTitle>
              </div>
              <CardDescription>AI-projected cash flows with scenario analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Multi-scenario forecasting engine
              </p>
            </CardContent>
          </Card>
        </Link>

        <Dialog open={scenarioOpen} onOpenChange={setScenarioOpen}>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">What-If Analysis</CardTitle>
                </div>
                <CardDescription>Test financial scenarios with AI reasoning</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Explore decisions before committing
                </p>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>What-If Scenario Analysis</DialogTitle>
              <DialogDescription>Describe a business scenario and the AI CFO will analyze its financial impact</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="e.g., What if we increase prices by 15% and lose 10% of customers? What if we hire 5 new sales reps at $80k each? What if we take on $500k in debt to fund expansion?"
                value={scenarioText}
                onChange={(e) => setScenarioText(e.target.value)}
                rows={4}
              />
              <Button
                onClick={() => runScenario.mutate(scenarioText)}
                disabled={!scenarioText.trim() || runScenario.isPending}
                className="w-full"
              >
                {runScenario.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
                Analyze Scenario
              </Button>
              {scenarioResult && (
                <div className="space-y-4 border-t pt-4">
                  {scenarioResult.executiveSummary ? (
                    // Board report format
                    <>
                      <h3 className="font-semibold text-lg">{scenarioResult.title}</h3>
                      <p className="text-sm whitespace-pre-wrap">{scenarioResult.executiveSummary}</p>
                      {scenarioResult.highlights && (
                        <div>
                          <h4 className="font-medium text-green-700">Highlights</h4>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {scenarioResult.highlights.map((h: string, i: number) => <li key={i}>{h}</li>)}
                          </ul>
                        </div>
                      )}
                      {scenarioResult.concerns && (
                        <div>
                          <h4 className="font-medium text-amber-700">Concerns</h4>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {scenarioResult.concerns.map((c: string, i: number) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      {scenarioResult.outlook && (
                        <div>
                          <h4 className="font-medium">Outlook</h4>
                          <p className="text-sm">{scenarioResult.outlook}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Scenario analysis format
                    <>
                      <h3 className="font-semibold">{scenarioResult.scenario}</h3>
                      <p className="text-sm whitespace-pre-wrap">{scenarioResult.analysis}</p>
                      {scenarioResult.financialProjection && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                            <p className="text-xs text-muted-foreground">Revenue Impact</p>
                            <p className="font-bold">{formatCurrency(scenarioResult.financialProjection.revenueImpact)}</p>
                          </div>
                          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded">
                            <p className="text-xs text-muted-foreground">Cost Impact</p>
                            <p className="font-bold">{formatCurrency(scenarioResult.financialProjection.costImpact)}</p>
                          </div>
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                            <p className="text-xs text-muted-foreground">Net Impact</p>
                            <p className="font-bold">{formatCurrency(scenarioResult.financialProjection.netImpact)}</p>
                          </div>
                          <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                            <p className="text-xs text-muted-foreground">ROI</p>
                            <p className="font-bold">{scenarioResult.financialProjection.roi || "N/A"}</p>
                          </div>
                        </div>
                      )}
                      {scenarioResult.recommendations && (
                        <div>
                          <h4 className="font-medium">Recommendations</h4>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {scenarioResult.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Insights Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Financial Insights</CardTitle>
              <CardDescription>AI-generated analysis and recommendations</CardDescription>
            </div>
            <Select value={insightFilter} onValueChange={setInsightFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {insightsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !insights?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No insights yet. Click "Generate Insights" to analyze your financial data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {insights.map((insight: any) => {
                const Icon = severityIcons[insight.severity] || BarChart3;
                return (
                  <div key={insight.id} className={`border rounded-lg p-4 ${severityColors[insight.severity] || ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{insight.title}</h4>
                            <Badge variant="outline" className="text-xs">{categoryLabels[insight.category] || insight.category}</Badge>
                            {insight.confidence && (
                              <Badge variant="secondary" className="text-xs">{Math.round(Number(insight.confidence) * 100)}% confidence</Badge>
                            )}
                          </div>
                          <p className="text-sm mb-2">{insight.summary}</p>
                          {insight.recommendation && (
                            <p className="text-sm font-medium">
                              <span className="text-muted-foreground">Recommendation:</span> {insight.recommendation}
                            </p>
                          )}
                          {insight.impactAmount && Number(insight.impactAmount) !== 0 && (
                            <p className="text-sm mt-1">
                              <span className="text-muted-foreground">Estimated Impact:</span>{" "}
                              <span className="font-bold">{formatCurrency(insight.impactAmount)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2">
                        {insight.status === "new" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateInsight.mutate({ id: insight.id, status: "acknowledged" })}
                            >
                              Acknowledge
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateInsight.mutate({ id: insight.id, status: "dismissed" })}
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                        {insight.status === "acknowledged" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateInsight.mutate({ id: insight.id, status: "in_progress" })}
                          >
                            Start Working
                          </Button>
                        )}
                        {insight.status === "in_progress" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateInsight.mutate({ id: insight.id, status: "resolved" })}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
