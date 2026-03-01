import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Wallet,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function CashFlowDashboard() {
  const [monthsRange, setMonthsRange] = useState<string>("12");

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt(monthsRange));
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [monthsRange]);

  const { data: cashFlowData, isLoading: cashFlowLoading, error: cashFlowError } =
    trpc.financialMetrics.cashFlow.useQuery({ fromDate, toDate: new Date() });

  const { data: revenueData, isLoading: revenueLoading, error: revenueError } =
    trpc.financialMetrics.revenue.useQuery({ months: parseInt(monthsRange) });

  if (cashFlowError) {
    toast.error("Failed to load cash flow data");
  }
  if (revenueError) {
    toast.error("Failed to load revenue data");
  }

  const payments = cashFlowData?.payments ?? [];
  const bankBalances = cashFlowData?.bankBalances ?? [];
  const invoices = revenueData ?? [];

  // Calculate total cash from bank balances
  const totalCash = useMemo(() => {
    return bankBalances.reduce(
      (sum, account) => sum + parseFloat(account.currentBalance ?? "0"),
      0
    );
  }, [bankBalances]);

  // Group payments by month into inflows / outflows
  const monthlyFlows = useMemo(() => {
    const map = new Map<string, { inflows: number; outflows: number }>();

    for (const payment of payments) {
      if (payment.status === "cancelled" || payment.status === "failed") continue;
      const date = new Date(payment.paymentDate);
      const key = getMonthKey(date);
      const entry = map.get(key) ?? { inflows: 0, outflows: 0 };
      const amount = parseFloat(payment.amount ?? "0");

      if (payment.type === "received") {
        entry.inflows += amount;
      } else {
        entry.outflows += amount;
      }

      map.set(key, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        month: key,
        label: getMonthLabel(key),
        inflows: value.inflows,
        outflows: value.outflows,
        net: value.inflows - value.outflows,
      }));
  }, [payments]);

  // Monthly burn rate: average outflows over available months
  const monthlyBurnRate = useMemo(() => {
    if (monthlyFlows.length === 0) return 0;
    const totalOutflows = monthlyFlows.reduce((sum, m) => sum + m.outflows, 0);
    return totalOutflows / monthlyFlows.length;
  }, [monthlyFlows]);

  // Runway: total cash / monthly burn rate
  const runwayMonths = useMemo(() => {
    if (monthlyBurnRate <= 0) return Infinity;
    return totalCash / monthlyBurnRate;
  }, [totalCash, monthlyBurnRate]);

  // Burn rate trend: last 6 months
  const burnRateTrend = useMemo(() => {
    return monthlyFlows.slice(-6);
  }, [monthlyFlows]);

  // Revenue by month from paid invoices
  const monthlyRevenue = useMemo(() => {
    const map = new Map<string, number>();

    for (const invoice of invoices) {
      const date = new Date(invoice.createdAt);
      const key = getMonthKey(date);
      const current = map.get(key) ?? 0;
      map.set(key, current + parseFloat(invoice.amount ?? "0"));
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        month: key,
        label: getMonthLabel(key),
        revenue: value,
      }));
  }, [invoices]);

  // Average monthly revenue
  const avgMonthlyRevenue = useMemo(() => {
    if (monthlyRevenue.length === 0) return 0;
    const total = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
    return total / monthlyRevenue.length;
  }, [monthlyRevenue]);

  const isLoading = cashFlowLoading || revenueLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-8 w-8" />
            Cash Flow Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor burn rate, runway, and cash flow trends.
          </p>
        </div>
        <Select value={monthsRange} onValueChange={setMonthsRange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
            <SelectItem value="24">Last 24 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cash */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-sm font-medium">
              <DollarSign className="h-4 w-4" />
              Total Cash
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? "..." : formatCurrency(totalCash)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {bankBalances.length} account{bankBalances.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Monthly Burn Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-sm font-medium">
              <Flame className="h-4 w-4" />
              Monthly Burn Rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {isLoading ? "..." : formatCurrency(monthlyBurnRate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg. monthly outflows
            </p>
          </CardContent>
        </Card>

        {/* Runway */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-sm font-medium">
              <Clock className="h-4 w-4" />
              Runway
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading
                ? "..."
                : runwayMonths === Infinity
                  ? "N/A"
                  : `${runwayMonths.toFixed(1)} months`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {runwayMonths !== Infinity && runwayMonths <= 6 ? (
                <span className="text-red-600 font-medium">Low runway warning</span>
              ) : runwayMonths !== Infinity && runwayMonths <= 12 ? (
                <span className="text-amber-600 font-medium">Monitor closely</span>
              ) : (
                "At current burn rate"
              )}
            </p>
          </CardContent>
        </Card>

        {/* Monthly Revenue */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-sm font-medium">
              <TrendingUp className="h-4 w-4" />
              Monthly Revenue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isLoading ? "..." : formatCurrency(avgMonthlyRevenue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg. from paid invoices
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Cash Flow by Month
          </CardTitle>
          <CardDescription>
            Monthly inflows vs. outflows from payment data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading cash flow data...
            </div>
          ) : monthlyFlows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No payment data available</p>
              <p className="text-sm">Record payments to see cash flow trends.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Inflows</TableHead>
                  <TableHead className="text-right">Outflows</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyFlows.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      <span className="inline-flex items-center gap-1">
                        <ArrowUpRight className="h-3 w-3" />
                        {formatCurrency(row.inflows)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      <span className="inline-flex items-center gap-1">
                        <ArrowDownRight className="h-3 w-3" />
                        {formatCurrency(row.outflows)}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-semibold ${
                        row.net >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(row.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Burn Rate Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5" />
              Burn Rate Trend
            </CardTitle>
            <CardDescription>
              Monthly spending over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading burn rate data...
              </div>
            ) : burnRateTrend.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingDown className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No spending data available</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Spending</TableHead>
                    <TableHead className="text-right">vs. Average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {burnRateTrend.map((row) => {
                    const diff = row.outflows - monthlyBurnRate;
                    const pctDiff =
                      monthlyBurnRate > 0
                        ? ((diff / monthlyBurnRate) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.outflows)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            className={
                              diff > 0
                                ? "bg-red-500/10 text-red-600"
                                : "bg-green-500/10 text-green-600"
                            }
                          >
                            {diff > 0 ? "+" : ""}
                            {pctDiff}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Revenue Trend
            </CardTitle>
            <CardDescription>
              Monthly revenue from paid invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading revenue data...
              </div>
            ) : monthlyRevenue.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No revenue data available</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">vs. Average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyRevenue.map((row) => {
                    const diff = row.revenue - avgMonthlyRevenue;
                    const pctDiff =
                      avgMonthlyRevenue > 0
                        ? ((diff / avgMonthlyRevenue) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            className={
                              diff >= 0
                                ? "bg-green-500/10 text-green-600"
                                : "bg-red-500/10 text-red-600"
                            }
                          >
                            {diff >= 0 ? "+" : ""}
                            {pctDiff}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bank Balances */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Bank Balances
          </CardTitle>
          <CardDescription>
            Connected bank account balances
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading bank balances...
            </div>
          ) : bankBalances.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No bank accounts connected</p>
              <p className="text-sm">Connect a bank account to see balances here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bankBalances.map((account) => (
                <Card key={account.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{account.name}</p>
                        <Badge variant="outline" className="mt-1 capitalize">
                          {account.type}
                        </Badge>
                      </div>
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-4 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Balance</span>
                        <span className="font-mono font-semibold">
                          {formatCurrency(parseFloat(account.currentBalance ?? "0"))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Available Balance</span>
                        <span className="font-mono">
                          {formatCurrency(parseFloat(account.availableBalance ?? "0"))}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
