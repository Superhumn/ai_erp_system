import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Flame,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatPercent(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return `${num.toFixed(1)}%`;
}

export default function FinancialDashboard() {
  const [period, setPeriod] = useState<string>("monthly");

  const { data: snapshots, isLoading: snapshotsLoading, refetch: refetchSnapshots } =
    trpc.financeDashboard.snapshots.useQuery({ period });
  const { data: dashboards, isLoading: dashboardsLoading, refetch: refetchDashboards } =
    trpc.financeDashboard.dashboards.useQuery();

  const isLoading = snapshotsLoading || dashboardsLoading;

  const latestSnapshot = snapshots?.[0];

  const kpiCards = [
    {
      title: "Revenue",
      value: formatCurrency(latestSnapshot?.totalRevenue),
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Expenses",
      value: formatCurrency(latestSnapshot?.totalExpenses),
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-500/10",
    },
    {
      title: "Gross Profit",
      value: formatCurrency(latestSnapshot?.grossProfit),
      icon: TrendingUp,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Net Income",
      value: formatCurrency(latestSnapshot?.netIncome),
      icon: BarChart3,
      color: "text-purple-600",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Cash Balance",
      value: formatCurrency(latestSnapshot?.cashBalance),
      icon: Wallet,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Burn Rate",
      value: formatCurrency(latestSnapshot?.burnRate),
      icon: Flame,
      color: "text-orange-600",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Runway",
      value: latestSnapshot?.runwayMonths ? `${parseFloat(String(latestSnapshot.runwayMonths)).toFixed(1)} months` : "N/A",
      icon: Clock,
      color: "text-cyan-600",
      bgColor: "bg-cyan-500/10",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Financial Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time financial reporting and key metrics.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              refetchSnapshots();
              refetchDashboards();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {kpiCards.map((kpi) => (
              <Card key={kpi.title}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-2 rounded-md ${kpi.bgColor}`}>
                      <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{kpi.title}</p>
                  <p className="text-lg font-bold">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* P&L Summary and AR/AP Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* P&L Summary */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">P&L Summary</h3>
              </CardHeader>
              <CardContent>
                {latestSnapshot ? (
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Total Revenue</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(latestSnapshot.totalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Cost of Goods Sold</span>
                      <span className="font-medium text-red-600">
                        {formatCurrency(latestSnapshot.costOfGoodsSold)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="font-semibold">Gross Profit</span>
                      <span className="font-semibold">
                        {formatCurrency(latestSnapshot.grossProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Operating Expenses</span>
                      <span className="font-medium text-red-600">
                        {formatCurrency(latestSnapshot.operatingExpenses)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Total Expenses</span>
                      <span className="font-medium text-red-600">
                        {formatCurrency(latestSnapshot.totalExpenses)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-t-2">
                      <span className="font-bold text-lg">Net Income</span>
                      <span
                        className={`font-bold text-lg ${
                          parseFloat(String(latestSnapshot.netIncome || "0")) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(latestSnapshot.netIncome)}
                      </span>
                    </div>
                    {latestSnapshot.grossMarginPercent && (
                      <div className="flex justify-between py-2">
                        <span className="text-muted-foreground">Gross Margin</span>
                        <Badge className="bg-blue-500/10 text-blue-600">
                          {formatPercent(latestSnapshot.grossMarginPercent)}
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No snapshot data available for this period.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AR/AP Overview */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">AR/AP Overview</h3>
              </CardHeader>
              <CardContent>
                {latestSnapshot ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                        Accounts Receivable
                      </h4>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">AR Balance</span>
                        <span className="font-medium text-green-600">
                          {formatCurrency(latestSnapshot.accountsReceivable)}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                        Accounts Payable
                      </h4>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">AP Balance</span>
                        <span className="font-medium text-red-600">
                          {formatCurrency(latestSnapshot.accountsPayable)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between py-2 border-t-2">
                      <span className="font-bold">Net Position (AR - AP)</span>
                      <span
                        className={`font-bold ${
                          parseFloat(String(latestSnapshot.accountsReceivable || "0")) -
                            parseFloat(String(latestSnapshot.accountsPayable || "0")) >=
                          0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(
                          parseFloat(String(latestSnapshot.accountsReceivable || "0")) -
                            parseFloat(String(latestSnapshot.accountsPayable || "0"))
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No snapshot data available for this period.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gross Margin Trend */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Gross Margin Trend</h3>
            </CardHeader>
            <CardContent>
              {snapshots && snapshots.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    {[...snapshots].reverse().map((snapshot: any, idx: number) => {
                      const margin = parseFloat(String(snapshot.grossMarginPercent || "0"));
                      const barHeight = Math.max(margin, 0);
                      return (
                        <div key={idx} className="flex flex-col items-center gap-1 min-w-[60px]">
                          <span className="text-xs text-muted-foreground">
                            {formatPercent(margin)}
                          </span>
                          <div className="w-10 bg-muted rounded-t-sm relative" style={{ height: "100px" }}>
                            <div
                              className={`absolute bottom-0 w-full rounded-t-sm ${
                                margin >= 0 ? "bg-green-500" : "bg-red-500"
                              }`}
                              style={{ height: `${Math.min(Math.abs(barHeight), 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {snapshot.snapshotDate
                              ? format(new Date(snapshot.snapshotDate), "MMM d")
                              : `#${idx + 1}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No trend data available.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Snapshot History */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Snapshot History</h3>
            </CardHeader>
            <CardContent>
              {snapshots && snapshots.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Expenses</TableHead>
                      <TableHead>Net Income</TableHead>
                      <TableHead>Cash Balance</TableHead>
                      <TableHead>Gross Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((snapshot: any) => (
                      <TableRow key={snapshot.id}>
                        <TableCell>
                          {snapshot.snapshotDate
                            ? format(new Date(snapshot.snapshotDate), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{snapshot.periodType || period}</Badge>
                        </TableCell>
                        <TableCell className="text-green-600">
                          {formatCurrency(snapshot.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-red-600">
                          {formatCurrency(snapshot.totalExpenses)}
                        </TableCell>
                        <TableCell
                          className={
                            parseFloat(String(snapshot.netIncome || "0")) >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {formatCurrency(snapshot.netIncome)}
                        </TableCell>
                        <TableCell>{formatCurrency(snapshot.cashBalance)}</TableCell>
                        <TableCell>
                          <Badge className="bg-blue-500/10 text-blue-600">
                            {formatPercent(snapshot.grossMarginPercent)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No snapshots found for the selected period.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dashboards */}
          {dashboards && dashboards.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Saved Dashboards</h3>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboards.map((dashboard: any) => (
                      <TableRow key={dashboard.id}>
                        <TableCell className="font-medium">{dashboard.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {dashboard.description || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{dashboard.dashboardType || "custom"}</Badge>
                        </TableCell>
                        <TableCell>
                          {dashboard.createdAt
                            ? format(new Date(dashboard.createdAt), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
