import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAIAgent } from "@/contexts/AIAgentContext";
import {
  Users,
  Building2,
  Package,
  DollarSign,
  FileText,
  FolderKanban,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
  UserCog,
  Sparkles,
  Bot,
  BarChart3,
  Mail,
  Truck,
  Factory,
} from "lucide-react";
import { useLocation } from "wouter";

function formatCurrency(value: number | string | null | undefined) {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function KPICard({
  title,
  value,
  icon: Icon,
  description,
  onClick,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  return (
    <Card
      className={`${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AIQuickButton({ icon: Icon, label, message }: { icon: React.ElementType; label: string; message: string }) {
  const { openAssistant, sendMessage } = useAIAgent();
  return (
    <button
      onClick={() => {
        openAssistant();
        setTimeout(() => sendMessage(message), 150);
      }}
      className="w-full text-left text-sm p-2 rounded-md hover:bg-muted transition-colors flex items-center gap-2"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </button>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading } = trpc.dashboard.metrics.useQuery();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your business operations and key metrics.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Revenue This Month"
          value={formatCurrency(metrics?.revenueThisMonth)}
          icon={DollarSign}
          description="From all sales orders"
          onClick={() => setLocation('/sales/orders')}
          loading={isLoading}
        />
        <KPICard
          title="Invoices Paid"
          value={formatCurrency(metrics?.invoicesPaid)}
          icon={TrendingUp}
          description="Total collected"
          onClick={() => setLocation('/finance/invoices')}
          loading={isLoading}
        />
        <KPICard
          title="Pending Invoices"
          value={metrics?.pendingInvoices || 0}
          icon={FileText}
          description="Awaiting payment"
          onClick={() => setLocation('/finance/invoices')}
          loading={isLoading}
        />
        <KPICard
          title="Open Disputes"
          value={metrics?.openDisputes || 0}
          icon={AlertTriangle}
          description="Requiring attention"
          onClick={() => setLocation('/legal/disputes')}
          loading={isLoading}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title="Customers"
          value={metrics?.customers || 0}
          icon={Users}
          onClick={() => setLocation('/sales/customers')}
          loading={isLoading}
        />
        <KPICard
          title="Vendors"
          value={metrics?.vendors || 0}
          icon={Building2}
          onClick={() => setLocation('/operations/vendors')}
          loading={isLoading}
        />
        <KPICard
          title="Products"
          value={metrics?.products || 0}
          icon={Package}
          onClick={() => setLocation('/operations/products')}
          loading={isLoading}
        />
        <KPICard
          title="Active Employees"
          value={metrics?.activeEmployees || 0}
          icon={UserCog}
          onClick={() => setLocation('/hr/employees')}
          loading={isLoading}
        />
        <KPICard
          title="Active Projects"
          value={metrics?.activeProjects || 0}
          icon={FolderKanban}
          onClick={() => setLocation('/projects')}
          loading={isLoading}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Finance Overview</CardTitle>
            <CardDescription>Track invoices, payments, and cash flow</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pending Invoices</span>
              <span className="font-medium">{metrics?.pendingInvoices || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pending POs</span>
              <span className="font-medium">{metrics?.pendingPurchaseOrders || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active Contracts</span>
              <span className="font-medium">{metrics?.activeContracts || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Operations Summary</CardTitle>
            <CardDescription>Inventory, vendors, and logistics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Products</span>
              <span className="font-medium">{metrics?.products || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active Vendors</span>
              <span className="font-medium">{metrics?.vendors || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pending POs</span>
              <span className="font-medium">{metrics?.pendingPurchaseOrders || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Quick Actions
            </CardTitle>
            <CardDescription>Ask AI to analyze, email, track, or manage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <AIQuickButton
              icon={BarChart3}
              label="Analyze sales trends"
              message="Analyze sales data for this month and show key metrics and trends"
            />
            <AIQuickButton
              icon={Package}
              label="Check low stock items"
              message="Show me all inventory items that are low in stock and recommend reorder quantities"
            />
            <AIQuickButton
              icon={Mail}
              label="Draft vendor follow-up"
              message="Help me draft follow-up emails to vendors with pending purchase orders"
            />
            <AIQuickButton
              icon={Truck}
              label="Track shipments"
              message="Show me the status of all active shipments and any delayed deliveries"
            />
            <button
              onClick={() => setLocation('/ai/hub')}
              className="w-full text-left text-sm p-2 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors flex items-center gap-2 text-primary font-medium"
            >
              <Bot className="h-4 w-4" />
              Open AI Command Center
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
