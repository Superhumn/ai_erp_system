import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
      className={`group relative overflow-hidden ${onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/20 transition-all duration-200' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary/70" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1.5">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading } = trpc.dashboard.metrics.useQuery();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overview of your business operations and key metrics.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
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
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md hover:border-primary/15 transition-all duration-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Finance Overview</CardTitle>
            <CardDescription className="text-xs">Track invoices, payments, and cash flow</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-muted-foreground">Pending Invoices</span>
              <span className="font-medium tabular-nums">{metrics?.pendingInvoices || 0}</span>
            </div>
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-muted-foreground">Pending POs</span>
              <span className="font-medium tabular-nums">{metrics?.pendingPurchaseOrders || 0}</span>
            </div>
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-muted-foreground">Active Contracts</span>
              <span className="font-medium tabular-nums">{metrics?.activeContracts || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md hover:border-primary/15 transition-all duration-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Operations Summary</CardTitle>
            <CardDescription className="text-xs">Inventory, vendors, and logistics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-muted-foreground">Total Products</span>
              <span className="font-medium tabular-nums">{metrics?.products || 0}</span>
            </div>
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-muted-foreground">Active Vendors</span>
              <span className="font-medium tabular-nums">{metrics?.vendors || 0}</span>
            </div>
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-muted-foreground">Pending POs</span>
              <span className="font-medium tabular-nums">{metrics?.pendingPurchaseOrders || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md hover:border-primary/15 transition-all duration-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Quick Actions</CardTitle>
            <CardDescription className="text-xs">Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <button
              onClick={() => setLocation('/finance/invoices')}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-accent transition-colors duration-150 flex items-center gap-2.5 text-muted-foreground hover:text-foreground"
            >
              <FileText className="h-4 w-4" />
              Create Invoice
            </button>
            <button
              onClick={() => setLocation('/operations/purchase-orders')}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-accent transition-colors duration-150 flex items-center gap-2.5 text-muted-foreground hover:text-foreground"
            >
              <ShoppingCart className="h-4 w-4" />
              New Purchase Order
            </button>
            <button
              onClick={() => setLocation('/ai')}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-accent transition-colors duration-150 flex items-center gap-2.5 text-muted-foreground hover:text-foreground"
            >
              <TrendingUp className="h-4 w-4" />
              Ask AI Assistant
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
