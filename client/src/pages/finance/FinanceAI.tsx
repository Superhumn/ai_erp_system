import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Brain, AlertTriangle, TrendingUp, DollarSign, Shield, Loader2, RefreshCw,
} from "lucide-react";

export default function FinanceAI() {
  const [activeTab, setActiveTab] = useState("anomalies");

  const anomalyMutation = trpc.financeAi.detectAnomalies.useMutation();
  const revenueMutation = trpc.financeAi.forecastRevenue.useMutation();
  const cashFlowMutation = trpc.financeAi.predictCashFlow.useMutation();

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "destructive";
      case "high": return "destructive";
      case "medium": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-600" />
            Finance AI Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered anomaly detection, revenue forecasting, and cash flow prediction
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="anomalies">Anomaly Detection</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Forecast</TabsTrigger>
          <TabsTrigger value="cashflow">Cash Flow Prediction</TabsTrigger>
        </TabsList>

        <TabsContent value="anomalies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Financial Anomaly Detection
              </CardTitle>
              <CardDescription>AI scans transactions, invoices, and payments for unusual patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => anomalyMutation.mutate({})}
                disabled={anomalyMutation.isPending}
              >
                {anomalyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Run Anomaly Scan
              </Button>

              {anomalyMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="text-sm">Risk Score:</div>
                    <Progress value={anomalyMutation.data.riskScore} className="w-48" />
                    <span className="text-sm font-medium">{anomalyMutation.data.riskScore}/100</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{anomalyMutation.data.summary}</p>

                  {anomalyMutation.data.anomalies.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Recommendation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {anomalyMutation.data.anomalies.map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{a.type}</TableCell>
                            <TableCell><Badge variant={severityColor(a.severity)}>{a.severity}</Badge></TableCell>
                            <TableCell className="max-w-xs">{a.description}</TableCell>
                            <TableCell>{a.amount ? `$${a.amount.toFixed(2)}` : "-"}</TableCell>
                            <TableCell className="max-w-xs text-sm">{a.recommendation}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Revenue Forecasting
              </CardTitle>
              <CardDescription>AI-driven revenue, expense, and profit predictions</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => revenueMutation.mutate({})}
                disabled={revenueMutation.isPending}
              >
                {revenueMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
                Generate Forecast
              </Button>

              {revenueMutation.data && (
                <div className="mt-4 space-y-4">
                  {revenueMutation.data.trends.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Trends</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {revenueMutation.data.trends.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Expenses</TableHead>
                        <TableHead>Profit</TableHead>
                        <TableHead>Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenueMutation.data.forecasts.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{f.month}</TableCell>
                          <TableCell className="text-green-600">${f.predictedRevenue.toLocaleString()}</TableCell>
                          <TableCell className="text-red-600">${f.predictedExpenses.toLocaleString()}</TableCell>
                          <TableCell className={f.predictedProfit >= 0 ? "text-green-600" : "text-red-600"}>${f.predictedProfit.toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={f.confidence} className="w-16" />
                              <span className="text-xs">{f.confidence}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="grid grid-cols-2 gap-4">
                    {revenueMutation.data.risks.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-orange-500" /> Risks</h4>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {revenueMutation.data.risks.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    {revenueMutation.data.opportunities.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1"><TrendingUp className="h-4 w-4 text-green-500" /> Opportunities</h4>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {revenueMutation.data.opportunities.map((o, i) => <li key={i}>{o}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cashflow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Cash Flow Prediction
              </CardTitle>
              <CardDescription>Weekly cash flow projections with shortfall alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => cashFlowMutation.mutate({})}
                disabled={cashFlowMutation.isPending}
              >
                {cashFlowMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                Predict Cash Flow
              </Button>

              {cashFlowMutation.data && (
                <div className="mt-4 space-y-4">
                  {cashFlowMutation.data.alerts.length > 0 && (
                    <div className="space-y-2">
                      {cashFlowMutation.data.alerts.map((alert, i) => (
                        <div key={i} className={`p-3 rounded-lg border ${alert.severity === "high" ? "border-red-300 bg-red-50" : alert.severity === "medium" ? "border-orange-300 bg-orange-50" : "border-blue-300 bg-blue-50"}`}>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={`h-4 w-4 ${alert.severity === "high" ? "text-red-600" : "text-orange-600"}`} />
                            <span className="font-medium text-sm">{alert.description}</span>
                          </div>
                          <p className="text-xs mt-1 text-muted-foreground">{alert.suggestedAction}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead>Inflows</TableHead>
                        <TableHead>Outflows</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Cumulative</TableHead>
                        <TableHead>Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashFlowMutation.data.predictions.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.week}</TableCell>
                          <TableCell className="text-green-600">${p.expectedInflows.toLocaleString()}</TableCell>
                          <TableCell className="text-red-600">${p.expectedOutflows.toLocaleString()}</TableCell>
                          <TableCell className={p.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}>${p.netCashFlow.toLocaleString()}</TableCell>
                          <TableCell className={p.cumulativeBalance >= 0 ? "text-green-600" : "text-red-600 font-bold"}>${p.cumulativeBalance.toLocaleString()}</TableCell>
                          <TableCell>{p.confidence}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
