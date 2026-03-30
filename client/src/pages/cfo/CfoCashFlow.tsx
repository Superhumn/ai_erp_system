import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function formatCurrency(value: number | string | null | undefined) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const scenarioColors: Record<string, string> = {
  base: "text-blue-700 bg-blue-50",
  optimistic: "text-green-700 bg-green-50",
  pessimistic: "text-red-700 bg-red-50",
};

export default function CfoCashFlow() {
  const queryClient = useQueryClient();
  const [months, setMonths] = useState(6);
  const [granularity, setGranularity] = useState<"monthly" | "weekly" | "quarterly">("monthly");
  const [scenarioType, setScenarioType] = useState<"base" | "optimistic" | "pessimistic">("base");
  const [viewScenario, setViewScenario] = useState<string>("all");

  // Fetch existing projections
  const { data: projections, isLoading } = useQuery({
    queryKey: ["cfo-cash-flow-projections", viewScenario],
    queryFn: () => trpc.cfo.cashFlow.projections.query(
      viewScenario !== "all" ? { scenarioType: viewScenario } : undefined
    ),
  });

  // Generate forecast
  const generateForecast = useMutation({
    mutationFn: () => trpc.cfo.cashFlow.forecast.mutate({ months, granularity, scenarioType }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cfo-cash-flow-projections"] });
      toast.success(`Generated ${data.length} cash flow projections (${scenarioType} scenario)`);
    },
    onError: () => toast.error("Failed to generate forecast"),
  });

  // Compute summary
  const totalInflow = projections?.reduce((sum: number, p: any) => sum + (Number(p.projectedInflow) || 0), 0) || 0;
  const totalOutflow = projections?.reduce((sum: number, p: any) => sum + (Number(p.projectedOutflow) || 0), 0) || 0;
  const totalNet = projections?.reduce((sum: number, p: any) => sum + (Number(p.projectedNetCash) || 0), 0) || 0;

  // Running balance for chart-like view
  let runningBalance = 0;
  const withRunning = projections?.map((p: any) => {
    runningBalance += Number(p.projectedNetCash) || 0;
    return { ...p, runningBalance };
  }) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Cash Flow Forecasting</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            AI-projected cash flows with multi-scenario analysis
            <span className="mx-2">|</span>
            <Link href="/cfo" className="text-primary hover:underline">Back to CFO Dashboard</Link>
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate Forecast</CardTitle>
          <CardDescription>Configure and generate AI-powered cash flow projections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-sm font-medium block mb-1">Months Ahead</label>
              <Select value={months.toString()} onValueChange={(v) => setMonths(parseInt(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                  <SelectItem value="24">24 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Granularity</label>
              <Select value={granularity} onValueChange={(v) => setGranularity(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Scenario</label>
              <Select value={scenarioType} onValueChange={(v) => setScenarioType(v as any)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base Case</SelectItem>
                  <SelectItem value="optimistic">Optimistic</SelectItem>
                  <SelectItem value="pessimistic">Pessimistic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => generateForecast.mutate()} disabled={generateForecast.isPending}>
              {generateForecast.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
              Generate Forecast
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Projected Inflow</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalInflow)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Projected Outflow</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalOutflow)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cumulative Net Cash</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalNet >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(totalNet)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View filter */}
      <div className="flex gap-2">
        <label className="text-sm font-medium self-center mr-2">View:</label>
        {["all", "base", "optimistic", "pessimistic"].map((s) => (
          <Button
            key={s}
            variant={viewScenario === s ? "default" : "outline"}
            size="sm"
            onClick={() => setViewScenario(s)}
          >
            {s === "all" ? "All Scenarios" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Projections Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow Projections</CardTitle>
          <CardDescription>
            {projections?.length || 0} periods projected
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !projections?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No projections yet. Generate a forecast above to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Scenario</TableHead>
                    <TableHead className="text-right">Inflow</TableHead>
                    <TableHead className="text-right">Outflow</TableHead>
                    <TableHead className="text-right">Net Cash</TableHead>
                    <TableHead className="text-right">AR Collections</TableHead>
                    <TableHead className="text-right">AP Payments</TableHead>
                    <TableHead className="text-right">Payroll</TableHead>
                    <TableHead className="text-right">CapEx</TableHead>
                    <TableHead className="text-right">Running Balance</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withRunning.map((p: any, idx: number) => (
                    <TableRow key={p.id || idx}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(p.periodStart)} - {formatDate(p.periodEnd)}
                      </TableCell>
                      <TableCell>
                        <Badge className={scenarioColors[p.scenarioType] || ""}>
                          {p.scenarioType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {formatCurrency(p.projectedInflow)}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {formatCurrency(p.projectedOutflow)}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${Number(p.projectedNetCash) >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatCurrency(p.projectedNetCash)}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(p.arCollections)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.apPayments)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.payrollExpense)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.capitalExpenditure)}</TableCell>
                      <TableCell className={`text-right font-bold ${p.runningBalance >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatCurrency(p.runningBalance)}
                      </TableCell>
                      <TableCell>
                        {p.confidence && (
                          <Badge variant="secondary">{Math.round(Number(p.confidence) * 100)}%</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Cash Flow Bar Chart (simple CSS-based) */}
      {withRunning.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cash Flow Visualization</CardTitle>
            <CardDescription>Period-by-period net cash flow</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {withRunning.map((p: any, idx: number) => {
                const net = Number(p.projectedNetCash) || 0;
                const maxVal = Math.max(...withRunning.map((x: any) => Math.abs(Number(x.projectedNetCash) || 0)), 1);
                const widthPct = Math.min(Math.abs(net) / maxVal * 100, 100);
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">
                      {formatDate(p.periodStart)}
                    </span>
                    <div className="flex-1 flex items-center">
                      {net >= 0 ? (
                        <div
                          className="bg-green-500/80 rounded-r h-6 transition-all duration-300 flex items-center justify-end pr-2"
                          style={{ width: `${widthPct}%`, minWidth: net > 0 ? "2rem" : 0 }}
                        >
                          <span className="text-xs text-white font-medium">{formatCurrency(net)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-end w-full">
                          <div
                            className="bg-red-500/80 rounded-l h-6 transition-all duration-300 flex items-center justify-start pl-2"
                            style={{ width: `${widthPct}%`, minWidth: "2rem" }}
                          >
                            <span className="text-xs text-white font-medium">{formatCurrency(net)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
