import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
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
  ArrowUpRight,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

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
      className={`group relative ${onClick ? 'cursor-pointer hover:border-border/80 transition-colors duration-100' : ''}`}
      onClick={onClick}
    >
      <CardContent className="pt-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {title}
              </span>
              <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <div className="text-2xl font-semibold tracking-[-0.02em]">{value}</div>
            {description && (
              <p className="text-[11px] text-muted-foreground mt-1.5">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickLink({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-100 group"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">{label}</span>
      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity duration-100" />
    </button>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading } = trpc.dashboard.metrics.useQuery();

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overview of your business operations
        </p>
      </div>

      {/* Primary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Revenue This Month"
          value={formatCurrency(metrics?.revenueThisMonth, { whole: true })}
          icon={DollarSign}
          description="This month"
          onClick={() => setLocation('/sales/orders')}
          loading={isLoading}
        />
        <KPICard
          title="Invoices Paid"
          value={formatCurrency(metrics?.invoicesPaid, { whole: true })}
          icon={TrendingUp}
          description="Invoices paid"
          onClick={() => setLocation('/finance/invoices')}
          loading={isLoading}
        />
        <KPICard
          title="Pending"
          value={metrics?.pendingInvoices || 0}
          icon={FileText}
          description="Invoices awaiting payment"
          onClick={() => setLocation('/finance/invoices')}
          loading={isLoading}
        />
        <KPICard
          title="Disputes"
          value={metrics?.openDisputes || 0}
          icon={AlertTriangle}
          description="Requiring attention"
          onClick={() => setLocation('/legal/disputes')}
          loading={isLoading}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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
          title="Employees"
          value={metrics?.activeEmployees || 0}
          icon={UserCog}
          onClick={() => setLocation('/hr/employees')}
          loading={isLoading}
        />
        <KPICard
          title="Projects"
          value={metrics?.activeProjects || 0}
          icon={FolderKanban}
          onClick={() => setLocation('/projects')}
          loading={isLoading}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Finance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-muted-foreground">Pending Invoices</span>
              <span className="font-medium tabular-nums">{metrics?.pendingInvoices || 0}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-muted-foreground">Pending POs</span>
              <span className="font-medium tabular-nums">{metrics?.pendingPurchaseOrders || 0}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-muted-foreground">Active Contracts</span>
              <span className="font-medium tabular-nums">{metrics?.activeContracts || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-muted-foreground">Total Products</span>
              <span className="font-medium tabular-nums">{metrics?.products || 0}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-muted-foreground">Active Vendors</span>
              <span className="font-medium tabular-nums">{metrics?.vendors || 0}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-muted-foreground">Pending POs</span>
              <span className="font-medium tabular-nums">{metrics?.pendingPurchaseOrders || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <QuickLink
              icon={FileText}
              label="Create Invoice"
              onClick={() => setLocation('/finance/invoices')}
            />
            <QuickLink
              icon={ShoppingCart}
              label="New Purchase Order"
              onClick={() => setLocation('/operations/purchase-orders')}
            />
            <QuickLink
              icon={Sparkles}
              label="Ask AI Assistant"
              onClick={() => setLocation('/ai')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
