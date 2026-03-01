import { useState, useMemo } from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Users,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDetailed(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function calcPercentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatPercentChange(change: number | null): string {
  if (change === null) return "N/A";
  const prefix = change > 0 ? "+" : "";
  return `${prefix}${change.toFixed(1)}%`;
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-muted-foreground text-sm">N/A</span>;
  }
  const isPositive = change >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-sm font-medium ${
        isPositive ? "text-green-600" : "text-red-600"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className="size-4" />
      ) : (
        <ArrowDownRight className="size-4" />
      )}
      {formatPercentChange(change)}
    </span>
  );
}

type MetricTypeFilter = "revenue" | "users" | "sessions" | "conversion" | "retention" | "custom" | "all";

const metricTypeBadgeColors: Record<string, string> = {
  revenue: "bg-green-500/10 text-green-600",
  users: "bg-blue-500/10 text-blue-600",
  sessions: "bg-purple-500/10 text-purple-600",
  conversion: "bg-amber-500/10 text-amber-600",
  retention: "bg-cyan-500/10 text-cyan-600",
  custom: "bg-gray-500/10 text-gray-600",
};

export default function GrowthMetrics() {
  const [period, setPeriod] = useState<string>("monthly");
  const [months, setMonths] = useState<number>(12);

  // Fetch all analytics metrics
  const { data: allMetrics, isLoading: metricsLoading } =
    trpc.analytics.metrics.list.useQuery({ period, limit: 200 });

  // Fetch revenue metrics (invoices)
  const { data: revenueInvoices, isLoading: revenueLoading } =
    trpc.financialMetrics.revenue.useQuery({ months });

  // Fetch specific metric types for KPI cards
  const { data: userMetrics } = trpc.analytics.metrics.list.useQuery({
    metricType: "users",
    period,
    limit: 2,
  });
  const { data: conversionMetrics } = trpc.analytics.metrics.list.useQuery({
    metricType: "conversion",
    period,
    limit: 2,
  });
  const { data: retentionMetrics } = trpc.analytics.metrics.list.useQuery({
    metricType: "retention",
    period,
    limit: 2,
  });

  // Derive MRR from metrics (look for "MRR" metricName) or calculate from revenue
  const mrrData = useMemo(() => {
    const mrrMetric = allMetrics?.find(
      (m) => m.metricName.toUpperCase() === "MRR"
    );
    if (mrrMetric) {
      const current = parseFloat(mrrMetric.value);
      const previous = mrrMetric.previousValue
        ? parseFloat(mrrMetric.previousValue)
        : 0;
      return { current, previous, change: calcPercentChange(current, previous) };
    }

    // Fallback: calculate MRR from revenue invoices
    if (revenueInvoices && revenueInvoices.length > 0) {
      const byMonth = groupInvoicesByMonth(revenueInvoices);
      const sortedMonths = Object.keys(byMonth).sort();
      if (sortedMonths.length >= 1) {
        const latestMonth = sortedMonths[sortedMonths.length - 1];
        const current = byMonth[latestMonth];
        const previous =
          sortedMonths.length >= 2
            ? byMonth[sortedMonths[sortedMonths.length - 2]]
            : 0;
        return {
          current,
          previous,
          change: calcPercentChange(current, previous),
        };
      }
    }
    return { current: 0, previous: 0, change: null };
  }, [allMetrics, revenueInvoices]);

  // Active Users KPI
  const activeUsersData = useMemo(() => {
    if (userMetrics && userMetrics.length > 0) {
      const latest = userMetrics[0];
      const current = parseFloat(latest.value);
      const previous = latest.previousValue
        ? parseFloat(latest.previousValue)
        : userMetrics.length > 1
          ? parseFloat(userMetrics[1].value)
          : 0;
      return { current, previous, change: calcPercentChange(current, previous) };
    }
    return { current: 0, previous: 0, change: null };
  }, [userMetrics]);

  // Conversion Rate KPI
  const conversionData = useMemo(() => {
    if (conversionMetrics && conversionMetrics.length > 0) {
      const latest = conversionMetrics[0];
      const current = parseFloat(latest.value);
      const previous = latest.previousValue
        ? parseFloat(latest.previousValue)
        : conversionMetrics.length > 1
          ? parseFloat(conversionMetrics[1].value)
          : 0;
      return { current, previous, change: calcPercentChange(current, previous) };
    }
    return { current: 0, previous: 0, change: null };
  }, [conversionMetrics]);

  // Net Revenue Retention KPI
  const retentionData = useMemo(() => {
    if (retentionMetrics && retentionMetrics.length > 0) {
      const latest = retentionMetrics[0];
      const current = parseFloat(latest.value);
      const previous = latest.previousValue
        ? parseFloat(latest.previousValue)
        : retentionMetrics.length > 1
          ? parseFloat(retentionMetrics[1].value)
          : 0;
      return { current, previous, change: calcPercentChange(current, previous) };
    }
    return { current: 0, previous: 0, change: null };
  }, [retentionMetrics]);

  // Monthly revenue breakdown from invoices
  const monthlyRevenue = useMemo(() => {
    if (!revenueInvoices || revenueInvoices.length === 0) return [];
    const byMonth = groupInvoicesByMonth(revenueInvoices);
    const sortedMonths = Object.keys(byMonth).sort();
    let cumulative = 0;
    return sortedMonths.map((month, index) => {
      const revenue = byMonth[month];
      const prevRevenue = index > 0 ? byMonth[sortedMonths[index - 1]] : 0;
      const momGrowth =
        index > 0 ? calcPercentChange(revenue, prevRevenue) : null;
      cumulative += revenue;
      return {
        month,
        revenue,
        momGrowth,
        cumulative,
      };
    });
  }, [revenueInvoices]);

  // Users tab data from user metrics
  const monthlyUsersData = useMemo(() => {
    if (!allMetrics) return [];
    const usersMetrics = allMetrics.filter((m) => m.metricType === "users");
    const sorted = [...usersMetrics].sort(
      (a, b) =>
        new Date(a.periodDate).getTime() - new Date(b.periodDate).getTime()
    );

    return sorted.map((m) => {
      const activeUsers = parseFloat(m.value);
      const previousUsers = m.previousValue ? parseFloat(m.previousValue) : 0;
      const newUsers = activeUsers - previousUsers;
      const churnRate =
        previousUsers > 0
          ? (Math.max(0, previousUsers - activeUsers + newUsers) / previousUsers) * 100
          : 0;
      return {
        month: format(new Date(m.periodDate), "MMM yyyy"),
        activeUsers,
        newUsers: Math.max(0, newUsers),
        churnRate,
      };
    });
  }, [allMetrics]);

  // Margins tab data
  const marginsData = useMemo(() => {
    if (!allMetrics) return { grossMargin: null, monthlyMargins: [] };

    // Look for margin/COGS metrics
    const revenueMetrics = allMetrics.filter(
      (m) => m.metricType === "revenue"
    );
    const cogsMetrics = allMetrics.filter(
      (m) =>
        m.metricName.toUpperCase().includes("COGS") ||
        m.metricName.toUpperCase().includes("COST")
    );
    const marginMetrics = allMetrics.filter(
      (m) =>
        m.metricName.toUpperCase().includes("MARGIN") ||
        m.metricName.toUpperCase().includes("GROSS MARGIN")
    );

    // If we have explicit margin metrics, use them
    if (marginMetrics.length > 0) {
      const latestMargin = marginMetrics[0];
      const grossMarginValue = parseFloat(latestMargin.value);
      const previousMarginValue = latestMargin.previousValue
        ? parseFloat(latestMargin.previousValue)
        : null;

      const monthlyMargins = [...marginMetrics]
        .sort(
          (a, b) =>
            new Date(a.periodDate).getTime() -
            new Date(b.periodDate).getTime()
        )
        .map((m) => ({
          month: format(new Date(m.periodDate), "MMM yyyy"),
          grossMargin: parseFloat(m.value),
          revenue: null as number | null,
          cogs: null as number | null,
        }));

      return {
        grossMargin: {
          current: grossMarginValue,
          previous: previousMarginValue,
          change: previousMarginValue
            ? calcPercentChange(grossMarginValue, previousMarginValue)
            : null,
        },
        monthlyMargins,
      };
    }

    // Calculate from revenue and COGS if both available
    if (revenueMetrics.length > 0 && cogsMetrics.length > 0) {
      const monthMap: Record<
        string,
        { revenue: number; cogs: number }
      > = {};

      for (const rm of revenueMetrics) {
        const key = format(new Date(rm.periodDate), "yyyy-MM");
        if (!monthMap[key]) monthMap[key] = { revenue: 0, cogs: 0 };
        monthMap[key].revenue += parseFloat(rm.value);
      }
      for (const cm of cogsMetrics) {
        const key = format(new Date(cm.periodDate), "yyyy-MM");
        if (!monthMap[key]) monthMap[key] = { revenue: 0, cogs: 0 };
        monthMap[key].cogs += parseFloat(cm.value);
      }

      const sortedKeys = Object.keys(monthMap).sort();
      const monthlyMargins = sortedKeys.map((key) => {
        const { revenue, cogs } = monthMap[key];
        const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;
        return {
          month: format(new Date(key + "-01"), "MMM yyyy"),
          grossMargin,
          revenue,
          cogs,
        };
      });

      const latest =
        monthlyMargins.length > 0
          ? monthlyMargins[monthlyMargins.length - 1]
          : null;
      const prev =
        monthlyMargins.length > 1
          ? monthlyMargins[monthlyMargins.length - 2]
          : null;

      return {
        grossMargin: latest
          ? {
              current: latest.grossMargin,
              previous: prev ? prev.grossMargin : null,
              change: prev
                ? calcPercentChange(latest.grossMargin, prev.grossMargin)
                : null,
            }
          : null,
        monthlyMargins,
      };
    }

    // Fallback: calculate from invoice revenue if available
    if (revenueInvoices && revenueInvoices.length > 0) {
      const byMonth = groupInvoicesByMonth(revenueInvoices);
      const sortedMonths = Object.keys(byMonth).sort();
      const monthlyMargins = sortedMonths.map((month) => ({
        month: format(new Date(month + "-01"), "MMM yyyy"),
        grossMargin: null as number | null,
        revenue: byMonth[month],
        cogs: null as number | null,
      }));
      return { grossMargin: null, monthlyMargins };
    }

    return { grossMargin: null, monthlyMargins: [] };
  }, [allMetrics, revenueInvoices]);

  const isLoading = metricsLoading || revenueLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="size-5 animate-spin" />
          <span>Loading growth metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="size-6" />
            Growth & Margin Metrics
          </h1>
          <p className="text-muted-foreground mt-1">
            Track revenue growth, user acquisition, conversion rates, and margin
            performance over time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={months.toString()}
            onValueChange={(v) => setMonths(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="24">Last 24 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <DollarSign className="size-4" />
              Monthly Recurring Revenue
            </CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(mrrData.current)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Previous: {formatCurrency(mrrData.previous)}
              </span>
              <ChangeIndicator change={mrrData.change} />
            </div>
          </CardContent>
        </Card>

        {/* Active Users Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="size-4" />
              Active Users
            </CardDescription>
            <CardTitle className="text-2xl">
              {activeUsersData.current.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Previous: {activeUsersData.previous.toLocaleString()}
              </span>
              <ChangeIndicator change={activeUsersData.change} />
            </div>
          </CardContent>
        </Card>

        {/* Conversion Rate Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Percent className="size-4" />
              Conversion Rate
            </CardDescription>
            <CardTitle className="text-2xl">
              {conversionData.current.toFixed(2)}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Previous: {conversionData.previous.toFixed(2)}%
              </span>
              <ChangeIndicator change={conversionData.change} />
            </div>
          </CardContent>
        </Card>

        {/* Net Revenue Retention Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Activity className="size-4" />
              Net Revenue Retention
            </CardDescription>
            <CardTitle className="text-2xl">
              {retentionData.current.toFixed(1)}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Previous: {retentionData.previous.toFixed(1)}%
              </span>
              <ChangeIndicator change={retentionData.change} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="margins">Margins</TabsTrigger>
          <TabsTrigger value="all">All Metrics</TabsTrigger>
        </TabsList>

        {/* Revenue Tab */}
        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-5" />
                Monthly Revenue
              </CardTitle>
              <CardDescription>
                Revenue breakdown by month with month-over-month growth and
                cumulative totals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyRevenue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No revenue data available for the selected period.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">MoM Growth</TableHead>
                      <TableHead className="text-right">
                        Cumulative Revenue
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRevenue.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">
                          {format(new Date(row.month + "-01"), "MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyDetailed(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <ChangeIndicator change={row.momGrowth} />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyDetailed(row.cumulative)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                User Metrics
              </CardTitle>
              <CardDescription>
                Monthly active users, new user acquisition, and churn rates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyUsersData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No user metrics available for the selected period.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">
                        Active Users
                      </TableHead>
                      <TableHead className="text-right">New Users</TableHead>
                      <TableHead className="text-right">Churn Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyUsersData.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">
                          {row.month}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.activeUsers.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-green-600">
                            +{row.newUsers.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              row.churnRate > 5
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }
                          >
                            {row.churnRate.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Margins Tab */}
        <TabsContent value="margins">
          <div className="space-y-4">
            {/* Gross Margin summary card */}
            {marginsData.grossMargin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Percent className="size-5" />
                    Gross Margin
                  </CardTitle>
                  <CardDescription>
                    Current gross margin with period-over-period comparison.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-3xl font-bold">
                        {marginsData.grossMargin.current.toFixed(1)}%
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Current gross margin
                      </p>
                    </div>
                    {marginsData.grossMargin.previous !== null && (
                      <div>
                        <p className="text-lg text-muted-foreground">
                          {marginsData.grossMargin.previous.toFixed(1)}%
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Previous period
                        </p>
                      </div>
                    )}
                    <div>
                      <ChangeIndicator
                        change={marginsData.grossMargin.change}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monthly margin breakdown table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="size-5" />
                  Monthly Margin Breakdown
                </CardTitle>
                <CardDescription>
                  Detailed margin performance by month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {marginsData.monthlyMargins.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No margin data available. Add revenue and cost metrics to see
                    margin breakdowns.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        {marginsData.monthlyMargins[0]?.revenue !== null && (
                          <TableHead className="text-right">Revenue</TableHead>
                        )}
                        {marginsData.monthlyMargins[0]?.cogs !== null && (
                          <TableHead className="text-right">COGS</TableHead>
                        )}
                        <TableHead className="text-right">
                          Gross Margin
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {marginsData.monthlyMargins.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">
                            {row.month}
                          </TableCell>
                          {row.revenue !== null && (
                            <TableCell className="text-right">
                              {formatCurrencyDetailed(row.revenue)}
                            </TableCell>
                          )}
                          {row.cogs !== null && (
                            <TableCell className="text-right">
                              {formatCurrencyDetailed(row.cogs)}
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            {row.grossMargin !== null ? (
                              <span
                                className={
                                  row.grossMargin >= 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }
                              >
                                {row.grossMargin.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* All Metrics Tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5" />
                All Analytics Metrics
              </CardTitle>
              <CardDescription>
                Complete list of all tracked analytics metrics across all types.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!allMetrics || allMetrics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No analytics metrics found. Connect an analytics provider or
                  add metrics manually.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Previous</TableHead>
                      <TableHead className="text-right">Change %</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allMetrics.map((metric) => {
                      const currentVal = parseFloat(metric.value);
                      const prevVal = metric.previousValue
                        ? parseFloat(metric.previousValue)
                        : null;
                      const change =
                        prevVal !== null
                          ? calcPercentChange(currentVal, prevVal)
                          : null;

                      return (
                        <TableRow key={metric.id}>
                          <TableCell className="font-medium">
                            {metric.metricName}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                metricTypeBadgeColors[metric.metricType] || ""
                              }
                            >
                              {metric.metricType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {metric.metricType === "revenue"
                              ? formatCurrencyDetailed(currentVal)
                              : currentVal.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {prevVal !== null
                              ? metric.metricType === "revenue"
                                ? formatCurrencyDetailed(prevVal)
                                : prevVal.toLocaleString()
                              : "--"}
                          </TableCell>
                          <TableCell className="text-right">
                            <ChangeIndicator change={change} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{metric.period}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(
                              new Date(metric.periodDate),
                              "MMM dd, yyyy"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Groups invoice data by month (YYYY-MM) and sums totalAmount for each month.
 */
function groupInvoicesByMonth(
  invoices: { totalAmount: string | null; createdAt: Date | string | null }[]
): Record<string, number> {
  const byMonth: Record<string, number> = {};
  for (const inv of invoices) {
    if (!inv.createdAt) continue;
    const date = new Date(inv.createdAt);
    const key = format(date, "yyyy-MM");
    const amount = parseFloat(inv.totalAmount || "0");
    byMonth[key] = (byMonth[key] || 0) + amount;
  }
  return byMonth;
}
