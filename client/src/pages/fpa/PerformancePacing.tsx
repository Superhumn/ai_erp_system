import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  RefreshCw,
  Loader2,
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Gauge,
  Calendar,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Zap,
} from "lucide-react";

export default function PerformancePacing() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Queries
  const { data: currentPacing, refetch: refetchCurrent } = trpc.fpa.pacing.getCurrent.useQuery();
  const { data: pacingHistory, refetch: refetchHistory } = trpc.fpa.pacing.getHistory.useQuery();

  // Mutations
  const refreshMutation = trpc.fpa.pacing.refresh.useMutation({
    onSuccess: () => {
      toast.success("Pacing data refreshed with latest actuals.");
      refetchCurrent();
      refetchHistory();
      setIsRefreshing(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshMutation.mutate({});
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatPct = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return `${num.toFixed(1)}%`;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; label: string }
    > = {
      on_track: {
        variant: "default",
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
        label: "On Track",
      },
      ahead: {
        variant: "default",
        icon: <TrendingUp className="h-3 w-3 mr-1" />,
        label: "Ahead",
      },
      behind: {
        variant: "destructive",
        icon: <TrendingDown className="h-3 w-3 mr-1" />,
        label: "Behind",
      },
      at_risk: {
        variant: "destructive",
        icon: <AlertTriangle className="h-3 w-3 mr-1" />,
        label: "At Risk",
      },
    };
    const c = config[status] || { variant: "secondary", icon: null, label: status };
    return (
      <Badge variant={c.variant} className="flex items-center w-fit">
        {c.icon}
        {c.label}
      </Badge>
    );
  };

  const revenuePacePct = Number(currentPacing?.revenuePacePct) || 0;
  const expensePacePct = Number(currentPacing?.expensePacePct) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Performance Pacing</h1>
          <p className="text-muted-foreground">
            Track actual performance against budget and plan targets
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Pacing
              </>
            )}
          </Button>
        </div>
      </div>

      {currentPacing ? (
        <>
          {/* Current Month Pacing Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue Pace
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  <span className="text-2xl font-bold">{formatPct(revenuePacePct)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(currentPacing.revenueActual)} of{" "}
                  {formatCurrency(currentPacing.revenueBudget)} budget
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Expense Pace
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <Gauge className="h-4 w-4 text-orange-500" />
                  <span className="text-2xl font-bold">{formatPct(expensePacePct)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(currentPacing.expenseActual)} of{" "}
                  {formatCurrency(currentPacing.expenseBudget)} budget
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Projected Month-End EBITDA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <span
                    className={`text-2xl font-bold ${
                      Number(currentPacing.projectedEbitda) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(currentPacing.projectedEbitda)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Target: {formatCurrency(currentPacing.ebitdaTarget)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2">{getStatusBadge(currentPacing.status)}</div>
                <p className="text-xs text-muted-foreground">
                  Day {currentPacing.dayOfMonth || "-"} of month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Pacing Progress Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Revenue Pacing
                </CardTitle>
                <CardDescription>
                  Actual revenue vs. budget through current date
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Actual: {formatCurrency(currentPacing.revenueActual)}</span>
                    <span>Budget: {formatCurrency(currentPacing.revenueBudget)}</span>
                  </div>
                  <Progress
                    value={Math.min(revenuePacePct, 100)}
                    className="h-3"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {formatPct(revenuePacePct)} of monthly target
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expected pace</span>
                    <span className="font-medium">
                      {formatPct(currentPacing.expectedPacePct)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Projected month-end</span>
                    <span className="font-medium">
                      {formatCurrency(currentPacing.projectedRevenue)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-orange-500" />
                  Expense Pacing
                </CardTitle>
                <CardDescription>
                  Actual expenses vs. budget through current date
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Actual: {formatCurrency(currentPacing.expenseActual)}</span>
                    <span>Budget: {formatCurrency(currentPacing.expenseBudget)}</span>
                  </div>
                  <Progress
                    value={Math.min(expensePacePct, 100)}
                    className="h-3"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {formatPct(expensePacePct)} of monthly budget
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expected pace</span>
                    <span className="font-medium">
                      {formatPct(currentPacing.expectedPacePct)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Projected month-end</span>
                    <span className="font-medium">
                      {formatCurrency(currentPacing.projectedExpense)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Gauge className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pacing data available.</p>
              <p className="text-sm">Click "Refresh Pacing" to calculate current performance metrics.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pacing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Monthly Pacing History
          </CardTitle>
          <CardDescription>
            Historical performance pacing by month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pacingHistory && pacingHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue Actual</TableHead>
                  <TableHead className="text-right">Revenue Budget</TableHead>
                  <TableHead className="text-right">Revenue Pace %</TableHead>
                  <TableHead className="text-right">Expense Actual</TableHead>
                  <TableHead className="text-right">Expense Budget</TableHead>
                  <TableHead className="text-right">EBITDA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pacingHistory.map((entry: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{entry.month}</TableCell>
                    <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.revenueActual)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.revenueBudget)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        Number(entry.revenuePacePct) >= 100 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatPct(entry.revenuePacePct)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.expenseActual)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.expenseBudget)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        Number(entry.ebitda) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(entry.ebitda)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pacing history available yet.</p>
              <p className="text-sm">History will appear after pacing data is refreshed.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
