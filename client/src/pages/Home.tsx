import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Landmark,
  TrendingDown,
  Clock,
  DollarSign,
  FileText,
  CreditCard,
  Package,
  ShoppingCart,
  Factory,
  ListChecks,
  Mail,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  AlertTriangle,
} from "lucide-react";
import { useLocation } from "wouter";
import { isThisMonth } from "date-fns";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
type KPIVariant = "green" | "amber" | "blue" | "default";

function KPICard({
  label,
  value,
  icon: Icon,
  subtitle,
  onClick,
  loading,
  variant = "default",
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
  onClick?: () => void;
  loading?: boolean;
  variant?: KPIVariant;
  trend?: "up" | "down" | null;
}) {
  const iconColors: Record<KPIVariant, string> = {
    green: "text-emerald-500",
    amber: "text-amber-500",
    blue: "text-blue-500",
    default: "text-muted-foreground/50",
  };

  return (
    <Card
      className={`group relative ${onClick ? "cursor-pointer hover:border-border/80 transition-colors duration-100" : ""}`}
      onClick={onClick}
    >
      <CardContent className="pt-3 pb-2.5 px-3">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <Icon className={`h-3.5 w-3.5 ${iconColors[variant]}`} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tracking-[-0.02em]">
                {value}
              </span>
              {trend === "up" && (
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              )}
              {trend === "down" && (
                <ArrowDownRight className="h-4 w-4 text-red-500" />
              )}
            </div>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {subtitle}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Home() {
  const [, setLocation] = useLocation();

  // ---- Data queries ----
  const { data: bankBalances, isLoading: bankLoading } =
    trpc.banking.balances.useQuery();

  const { data: invoices, isLoading: invoicesLoading } =
    trpc.invoices.list.useQuery();

  const { data: purchaseOrders, isLoading: posLoading } =
    trpc.purchaseOrders.list.useQuery();

  const { data: inventory, isLoading: invLoading } =
    trpc.inventory.list.useQuery();

  const { data: workOrders, isLoading: woLoading } =
    trpc.workOrders.list.useQuery();

  const { data: notifications } = trpc.notifications.list.useQuery();

  const { data: emails } = trpc.emailScanning.list.useQuery({
    status: "pending",
  });

  const { data: auditEntries } = trpc.auditLogs.list.useQuery(undefined, {
    retry: false,
  });
  const { data: aiTasks, isLoading: aiTasksLoading } = trpc.aiAgent.tasks.list.useQuery();

  // KPI Goals
  const { data: kpiGoals } = trpc.kpiGoals.list.useQuery(undefined, {
    retry: false,
  });

  // Aggregate KPI goals by metric for current year
  const kpiSummary = useMemo(() => {
    if (!kpiGoals || !Array.isArray(kpiGoals) || kpiGoals.length === 0) return [];
    const currentYear = new Date().getFullYear();
    const thisYear = (kpiGoals as any[]).filter((k: any) => k.year === currentYear);
    const grouped = new Map<string, { target: number; actual: number; unit: string; category: string; count: number }>();
    (thisYear.length > 0 ? thisYear : kpiGoals as any[]).forEach((k: any) => {
      const key = k.metricName || k.category;
      const existing = grouped.get(key) || { target: 0, actual: 0, unit: k.unit || "", category: k.category || "", count: 0 };
      existing.target += parseFloat(k.targetValue || "0");
      existing.actual += parseFloat(k.actualValue || "0");
      existing.count += 1;
      existing.unit = k.unit || existing.unit;
      existing.category = k.category || existing.category;
      grouped.set(key, existing);
    });
    // For percentage/rate metrics, average instead of sum
    return Array.from(grouped.entries()).map(([name, data]) => {
      const isRate = data.unit === "percent" || data.unit === "USD_per_lb" || data.unit === "ratio";
      return {
        name,
        target: isRate ? data.target / data.count : data.target,
        actual: isRate ? data.actual / data.count : data.actual,
        unit: data.unit,
        category: data.category,
        pct: data.target > 0 ? Math.min(100, (data.actual / data.target) * 100) : 0,
      };
    }).filter(k => ["Revenue", "Volume", "Gross Margin", "COGS", "Net Cash Flow", "Contribution"].includes(k.name))
      .sort((a, b) => {
        const order = ["Revenue", "Volume", "Gross Margin", "COGS", "Net Cash Flow", "Contribution"];
        return order.indexOf(a.name) - order.indexOf(b.name);
      });
  }, [kpiGoals]);

  // ---- Derived KPIs ----

  // Financial Health
  const cashOnHand =
    bankBalances?.accounts?.reduce(
      (sum: number, a: any) => sum + (a.currentBalance ?? a.availableBalance ?? 0),
      0,
    ) ?? 0;

  const revenueThisMonth =
    invoices
      ?.filter(
        (i: any) =>
          i.status === "paid" && i.paidDate && isThisMonth(new Date(i.paidDate)),
      )
      ?.reduce((sum: number, i: any) => sum + parseFloat(i.totalAmount || "0"), 0) ?? 0;

  // Burn rate: sum of POs marked as received/paid this month as a rough proxy
  const recentExpenses =
    purchaseOrders
      ?.filter(
        (po: any) =>
          ["received", "completed", "paid"].includes(po.status) &&
          po.updatedAt &&
          isThisMonth(new Date(po.updatedAt)),
      )
      ?.reduce((sum: number, po: any) => sum + parseFloat(po.totalAmount || "0"), 0) ?? 0;

  const monthlyBurn = recentExpenses || 0;
  const runwayMonths =
    monthlyBurn > 0 ? Math.round((cashOnHand / monthlyBurn) * 10) / 10 : null;

  // Operations
  const outstandingAR =
    invoices
      ?.filter((i: any) => ["sent", "overdue"].includes(i.status))
      ?.reduce((sum: number, i: any) => sum + parseFloat(i.totalAmount || "0"), 0) ?? 0;

  const outstandingAP =
    purchaseOrders
      ?.filter((po: any) => ["sent", "confirmed", "received"].includes(po.status))
      ?.reduce((sum: number, po: any) => sum + parseFloat(po.totalAmount || "0"), 0) ?? 0;

  const inventoryValue =
    inventory?.reduce(
      (sum: number, item: any) =>
        sum + (parseFloat(item.quantityOnHand || item.quantity || "0") * parseFloat(item.unitCost || item.costPerUnit || "0")),
      0,
    ) ?? 0;

  const openPOs = purchaseOrders?.filter((po: any) =>
    ["draft", "sent", "confirmed"].includes(po.status),
  );
  const openPOCount = openPOs?.length ?? 0;
  const openPOValue =
    openPOs?.reduce(
      (sum: number, po: any) => sum + parseFloat(po.totalAmount || "0"),
      0,
    ) ?? 0;

  // Activity
  const activeWorkOrders =
    workOrders?.filter((wo: any) =>
      ["in_progress", "started"].includes(wo.status),
    )?.length ?? 0;

  const pendingTasks = notifications?.length ?? 0;

  const emailsToProcess = emails?.length ?? 0;

  // Loading states
  const financialLoading = bankLoading || invoicesLoading || posLoading;
  const opsLoading = invoicesLoading || posLoading || invLoading;
  const activityLoading = woLoading;

  // Recent activity (last 10 audit entries)
  const recentActivity = (auditEntries as any[])?.slice(0, 10) ?? [];

  const importantTasks = useMemo(() => {
    return ((aiTasks as any[]) ?? [])
      .filter(
        (task) =>
          ["high", "urgent"].includes(task.priority) &&
          ["pending_approval", "approved", "in_progress"].includes(task.status),
      )
      .slice(0, 5)
      .map((task) => {
        let taskData: Record<string, any> = {};
        try {
          taskData = JSON.parse(task.taskData || "{}");
        } catch {
          taskData = {};
        }
        return {
          id: task.id,
          title:
            taskData.name ||
            taskData.subject ||
            taskData.title ||
            task.aiReasoning ||
            task.taskType,
          taskType: task.taskType,
          status: task.status,
          priority: task.priority,
          createdAt: task.createdAt,
        };
      });
  }, [aiTasks]);

  return (
    <div className="space-y-2 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-bold tracking-[-0.02em]">Dashboard</h1>
      </div>

      {/* Important Tasks */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Important Tasks
          </h2>
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => setLocation("/ai/approvals")}
          >
            View all
          </button>
        </div>
        <Card>
          <CardContent className="pt-3 pb-2.5 px-3">
            {aiTasksLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : importantTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                No high-priority tasks right now
              </p>
            ) : (
              <div className="divide-y divide-border/50">
                {importantTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setLocation("/ai/approvals")}
                    className="w-full text-left py-2 first:pt-0 last:pb-0 hover:bg-muted/40 rounded-sm px-1 -mx-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">{task.title}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">
                          {task.taskType.replaceAll("_", " ")} ·{" "}
                          {task.createdAt
                            ? formatDistanceToNow(new Date(task.createdAt), {
                                addSuffix: true,
                              })
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 capitalize">
                          {task.priority}
                        </span>
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 capitalize">
                          {task.status.replaceAll("_", " ")}
                        </span>
                        {task.priority === "urgent" && (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 1 — Financial Health */}
      <div>
        <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Financial Health
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Cash on Hand"
            value={formatCurrency(cashOnHand, { whole: true })}
            icon={Landmark}
            subtitle="Mercury account balances"
            onClick={() => setLocation("/finance/banking")}
            loading={bankLoading}
            variant="green"
          />
          <KPICard
            label="Monthly Burn"
            value={formatCurrency(monthlyBurn, { whole: true })}
            icon={TrendingDown}
            subtitle="Expenses this month"
            onClick={() => setLocation("/operations/purchase-orders")}
            loading={posLoading}
            variant="amber"
          />
          <KPICard
            label="Runway"
            value={runwayMonths !== null ? `${runwayMonths} mo` : "--"}
            icon={Clock}
            subtitle={
              runwayMonths !== null
                ? runwayMonths > 12
                  ? "Healthy runway"
                  : runwayMonths > 6
                    ? "Monitor closely"
                    : "Needs attention"
                : "Insufficient data"
            }
            loading={financialLoading}
            variant={
              runwayMonths === null
                ? "default"
                : runwayMonths > 12
                  ? "green"
                  : runwayMonths > 6
                    ? "amber"
                    : "amber"
            }
          />
          <KPICard
            label="Revenue This Month"
            value={formatCurrency(revenueThisMonth, { whole: true })}
            icon={DollarSign}
            subtitle="From paid invoices"
            onClick={() => setLocation("/finance/invoices")}
            loading={invoicesLoading}
            variant="green"
            trend={revenueThisMonth > 0 ? "up" : null}
          />
        </div>
      </div>

      {/* Row 2 — Operations */}
      <div>
        <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Operations
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Outstanding AR"
            value={formatCurrency(outstandingAR, { whole: true })}
            icon={FileText}
            subtitle={`${invoices?.filter((i: any) => ["sent", "overdue"].includes(i.status))?.length ?? 0} unpaid invoices`}
            onClick={() => setLocation("/finance/invoices")}
            loading={invoicesLoading}
            variant="amber"
          />
          <KPICard
            label="Outstanding AP"
            value={formatCurrency(outstandingAP, { whole: true })}
            icon={CreditCard}
            subtitle="Payable to vendors"
            onClick={() => setLocation("/operations/purchase-orders")}
            loading={posLoading}
            variant="amber"
          />
          <KPICard
            label="Inventory Value"
            value={formatCurrency(inventoryValue, { whole: true })}
            icon={Package}
            subtitle={`${inventory?.length ?? 0} SKUs tracked`}
            onClick={() => setLocation("/operations/inventory")}
            loading={invLoading}
            variant="blue"
          />
          <KPICard
            label="Open POs"
            value={openPOCount}
            icon={ShoppingCart}
            subtitle={formatCurrency(openPOValue, { whole: true }) + " total value"}
            onClick={() => setLocation("/operations/purchase-orders")}
            loading={posLoading}
            variant="blue"
          />
        </div>
      </div>

      {/* Row 3 — Activity */}
      <div>
        <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Activity
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <KPICard
            label="Active Work Orders"
            value={activeWorkOrders}
            icon={Factory}
            subtitle="Production in progress"
            onClick={() => setLocation("/operations/work-orders")}
            loading={activityLoading}
            variant="blue"
          />
          <KPICard
            label="Pending Tasks"
            value={pendingTasks}
            icon={ListChecks}
            subtitle="Notifications to review"
            onClick={() => setLocation("/notifications")}
            variant="blue"
          />
          <KPICard
            label="Emails to Process"
            value={emailsToProcess}
            icon={Mail}
            subtitle="Pending email actions"
            onClick={() => setLocation("/operations/email-inbox")}
            variant={emailsToProcess > 0 ? "amber" : "blue"}
          />
        </div>
      </div>

      {/* KPI Targets */}
      {kpiSummary.length > 0 && (
        <div>
          <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            KPI Targets
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kpiSummary.map((kpi) => {
              const fmtVal = (v: number, unit: string) => {
                if (unit === "USD") return formatCurrency(v, { whole: true });
                if (unit === "percent") return v.toFixed(1) + "%";
                if (unit === "USD_per_lb") return "$" + v.toFixed(2) + "/lb";
                if (unit === "lbs") return v.toLocaleString() + " lbs";
                return v.toLocaleString();
              };
              const barColor = kpi.pct >= 80 ? "bg-emerald-500" : kpi.pct >= 50 ? "bg-amber-500" : kpi.pct > 0 ? "bg-blue-500" : "bg-gray-300";
              return (
                <Card key={kpi.name}>
                  <CardContent className="pt-3 pb-2.5 px-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {kpi.name}
                      </span>
                      <Target className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-lg font-semibold tracking-[-0.02em]">
                        {fmtVal(kpi.actual, kpi.unit)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        / {fmtVal(kpi.target, kpi.unit)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, kpi.pct)}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {kpi.pct > 0 ? `${kpi.pct.toFixed(0)}% of target` : "No actuals yet"}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity Feed */}
      <div>
        <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Recent Activity
        </h2>
        <Card>
          <CardContent className="pt-4 pb-2">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No recent activity recorded yet
              </p>
            ) : (
              <div className="divide-y divide-border/50">
                {recentActivity.map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <Activity className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-snug">
                        <span className="font-medium capitalize">
                          {entry.action}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {entry.entityType}
                        </span>
                        {entry.entityName && (
                          <span className="text-foreground">
                            {" "}
                            &middot; {entry.entityName}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {entry.createdAt
                        ? formatDistanceToNow(new Date(entry.createdAt), {
                            addSuffix: true,
                          })
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
