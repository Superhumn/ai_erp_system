import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAIAgent } from "@/contexts/AIAgentContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  DollarSign,
  ShoppingCart,
  Factory,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Eye,
} from "lucide-react";

function formatCurrency(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : (value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

// ============================================
// ANALYSIS PANEL
// ============================================

function AnalysisPanel({
  title,
  icon: Icon,
  color,
  dataType,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  dataType: string;
}) {
  const { data, isLoading, refetch } = trpc.ai.quickAnalysis.useQuery({ dataType: dataType as any });
  const { openAssistant, sendMessage } = useAIAgent();

  const handleDrillDown = (question: string) => {
    openAssistant();
    setTimeout(() => sendMessage(question), 150);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleDrillDown(`Give me a detailed ${title.toLowerCase()} with insights and recommendations`)}
            >
              <Sparkles className="h-3 w-3" />
              Deep Dive
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : data ? (
          <div className="space-y-3">
            {/* Render metrics based on data type */}
            {renderAnalysisMetrics(data, dataType, handleDrillDown)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data available</p>
        )}
      </CardContent>
    </Card>
  );
}

function renderAnalysisMetrics(data: any, dataType: string, handleDrillDown: (q: string) => void) {
  switch (dataType) {
    case "sales":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Total Revenue" value={formatCurrency(data.totalRevenue)} />
            <MetricItem label="Orders" value={data.orderCount || 0} />
            <MetricItem label="Avg Order Value" value={formatCurrency(data.avgOrderValue)} />
          </div>
          <DrillDownButton label="View sales breakdown" onClick={() => handleDrillDown("Break down sales by product and customer segment")} />
        </>
      );

    case "inventory":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Total Items" value={data.totalItems || 0} />
            <MetricItem
              label="Low Stock"
              value={data.lowStockCount || 0}
              alert={data.lowStockCount > 0}
            />
            <MetricItem label="Total Value" value={formatCurrency(data.totalValue)} />
          </div>
          {data.lowStockCount > 0 && (
            <DrillDownButton
              label={`View ${data.lowStockCount} low stock items`}
              onClick={() => handleDrillDown("Show me all low stock items and suggest reorder quantities")}
              variant="warning"
            />
          )}
        </>
      );

    case "vendors":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Total Vendors" value={data.totalVendors || 0} />
            <MetricItem label="Active" value={data.activeVendors || 0} />
            <MetricItem label="POs This Period" value={data.poCountInPeriod || 0} />
          </div>
          <DrillDownButton label="View vendor performance" onClick={() => handleDrillDown("Rank vendors by performance and spending")} />
        </>
      );

    case "customers":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Total Customers" value={data.totalCustomers || 0} />
            <MetricItem label="Active" value={data.activeCustomers || 0} />
            <MetricItem label="Orders" value={data.ordersInPeriod || 0} />
          </div>
          <DrillDownButton label="View customer insights" onClick={() => handleDrillDown("Analyze customer ordering patterns and identify top customers")} />
        </>
      );

    case "finances":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Total Billed" value={formatCurrency(data.totalBilled)} />
            <MetricItem label="Collected" value={formatCurrency(data.totalPaid)} />
            <MetricItem label="Pending" value={formatCurrency(data.totalPending)} />
            <MetricItem
              label="Overdue"
              value={data.overdueCount || 0}
              alert={data.overdueCount > 0}
            />
          </div>
          {data.overdueCount > 0 && (
            <DrillDownButton
              label={`${data.overdueCount} overdue invoices (${formatCurrency(data.overdueAmount)})`}
              onClick={() => handleDrillDown("Show overdue invoices and draft payment reminder emails")}
              variant="warning"
            />
          )}
        </>
      );

    case "orders":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Total Orders" value={data.totalOrders || 0} />
            <MetricItem label="Pending" value={data.pendingOrders || 0} alert={data.pendingOrders > 5} />
            <MetricItem label="Completed" value={data.completedOrders || 0} />
          </div>
          <DrillDownButton label="View order details" onClick={() => handleDrillDown("Show me pending orders and their fulfillment status")} />
        </>
      );

    case "procurement":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Total POs" value={data.totalPOs || 0} />
            <MetricItem label="Pending" value={data.pendingPOs || 0} />
            <MetricItem label="Total Spent" value={formatCurrency(data.totalSpent)} />
          </div>
          <DrillDownButton label="View procurement details" onClick={() => handleDrillDown("Analyze procurement spending by vendor and category")} />
        </>
      );

    case "production":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="Work Orders" value={data.totalWorkOrders || 0} />
            <MetricItem label="In Progress" value={data.inProgress || 0} />
            <MetricItem label="Completed" value={data.completed || 0} />
          </div>
          <DrillDownButton label="View production status" onClick={() => handleDrillDown("Show detailed production status and work order progress")} />
        </>
      );

    default:
      return <p className="text-sm text-muted-foreground">Analysis not available</p>;
  }
}

function MetricItem({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-muted/50">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${alert ? "text-red-500" : ""}`}>
        {value}
        {alert && <AlertTriangle className="h-3 w-3 inline ml-1 mb-0.5" />}
      </p>
    </div>
  );
}

function DrillDownButton({
  label, onClick, variant = "default",
}: {
  label: string; onClick: () => void; variant?: "default" | "warning";
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
        variant === "warning"
          ? "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"
          : "bg-primary/5 text-primary hover:bg-primary/10"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" />
        {label}
      </span>
      <ChevronRight className="h-3 w-3" />
    </button>
  );
}

// ============================================
// MAIN AI INSIGHTS PAGE
// ============================================

export default function AIInsights() {
  const { openAssistant, sendMessage } = useAIAgent();

  const handleAskAI = (message: string) => {
    openAssistant();
    setTimeout(() => sendMessage(message), 150);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            AI Insights
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-time analysis of all business data with AI-powered drill-down capabilities.
          </p>
        </div>
        <Button onClick={() => handleAskAI("Generate a comprehensive business health report")} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Full Report
        </Button>
      </div>

      {/* Analysis Panels Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnalysisPanel
          title="Sales Analysis"
          icon={TrendingUp}
          color="bg-green-500/10 text-green-500"
          dataType="sales"
        />
        <AnalysisPanel
          title="Inventory Status"
          icon={Package}
          color="bg-blue-500/10 text-blue-500"
          dataType="inventory"
        />
        <AnalysisPanel
          title="Financial Overview"
          icon={DollarSign}
          color="bg-emerald-500/10 text-emerald-500"
          dataType="finances"
        />
        <AnalysisPanel
          title="Vendor Analysis"
          icon={Users}
          color="bg-purple-500/10 text-purple-500"
          dataType="vendors"
        />
        <AnalysisPanel
          title="Customer Analysis"
          icon={Users}
          color="bg-indigo-500/10 text-indigo-500"
          dataType="customers"
        />
        <AnalysisPanel
          title="Order Tracking"
          icon={ShoppingCart}
          color="bg-orange-500/10 text-orange-500"
          dataType="orders"
        />
        <AnalysisPanel
          title="Procurement"
          icon={ShoppingCart}
          color="bg-pink-500/10 text-pink-500"
          dataType="procurement"
        />
        <AnalysisPanel
          title="Production"
          icon={Factory}
          color="bg-amber-500/10 text-amber-500"
          dataType="production"
        />
      </div>

      {/* Quick Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Ask About Your Data
          </CardTitle>
          <CardDescription>Click any question to get an AI-powered analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {[
              "What's driving revenue growth this month?",
              "Which products have the highest margins?",
              "Are there any cash flow concerns?",
              "Which vendors are delivering late?",
              "What raw materials need reordering?",
              "How are our copacker relationships performing?",
              "Which customers are most profitable?",
              "What orders are at risk of missing delivery dates?",
              "Give me a complete business health score",
            ].map((question, idx) => (
              <button
                key={idx}
                onClick={() => handleAskAI(question)}
                className="flex items-center gap-2 text-left text-sm px-3 py-2.5 rounded-lg border hover:bg-muted transition-colors"
              >
                <Eye className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{question}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
