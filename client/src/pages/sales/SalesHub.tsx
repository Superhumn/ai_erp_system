import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import SpreadsheetTable, { Column } from "@/components/SpreadsheetTable";
import {
  ShoppingCart, FileText, Users, CreditCard, Package, Search,
  Send, Download, RefreshCw, ShoppingBag, Plug, Loader2, Mail, CloudUpload
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";

const orderStatuses = [
  { value: "pending", label: "Pending", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "shipped", label: "Shipped", color: "bg-violet-500/8 text-violet-600 dark:text-violet-400" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
];

const invoiceStatuses = [
  { value: "draft", label: "Draft", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
  { value: "sent", label: "Sent", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "paid", label: "Paid", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "overdue", label: "Overdue", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
  { value: "partial", label: "Partial", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
];

const paymentStatuses = [
  { value: "unpaid", label: "Unpaid", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
  { value: "partial", label: "Partial", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "paid", label: "Paid", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
];

function OrderDetailPanel({ order, onStatusChange }: { order: any; onStatusChange: (id: number, status: string) => void }) {
  const statusOption = orderStatuses.find(s => s.value === order.status);
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Order #{order.orderNumber}</h3>
          <p className="text-sm text-muted-foreground">{order.customer?.name || "No customer"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          {order.status === "pending" && (
            <Button size="sm" onClick={() => onStatusChange(order.id, "confirmed")}>Confirm</Button>
          )}
          {order.status === "confirmed" && (
            <Button size="sm" onClick={() => onStatusChange(order.id, "shipped")}>Ship</Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Subtotal</div>
          <div className="font-medium">${order.subtotal || "0.00"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Tax</div>
          <div className="font-medium">${order.tax || "0.00"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Total</div>
          <div className="font-medium">${order.totalAmount || "0.00"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Date</div>
          <div className="font-medium">{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

export default function SalesHub() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<number | string | null>(null);

  const { data: products } = trpc.products.list.useQuery();
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = trpc.orders.list.useQuery();
  const { data: invoices } = trpc.invoices.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: payments } = trpc.payments.list.useQuery();

  const updateOrderStatus = trpc.orders.update.useMutation({
    onSuccess: () => { toast.success("Order updated"); refetchOrders(); },
    onError: (err: any) => toast.error(err.message),
  });

  // Integration status
  const { data: integrationStatus } = trpc.integrations.getStatus.useQuery();

  // Shopify sync mutations
  const syncShopifyOrders = trpc.shopify.sync.orders.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.imported} new orders, updated ${data.updated}`);
      refetchOrders();
      setIsSyncing(false);
    },
    onError: (err: any) => { toast.error(err.message); setIsSyncing(false); },
  });

  const syncShopifyProducts = trpc.shopify.sync.products.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.imported} new products, updated ${data.updated}`);
      setIsSyncing(false);
    },
    onError: (err: any) => { toast.error(err.message); setIsSyncing(false); },
  });

  const syncShopifyCustomers = trpc.shopify.sync.customers.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.imported} new customers, updated ${data.updated}`);
      setIsSyncing(false);
    },
    onError: (err: any) => { toast.error(err.message); setIsSyncing(false); },
  });

  const handleSyncOrders = () => { setIsSyncing(true); syncShopifyOrders.mutate({}); };
  const handleSyncProducts = () => { setIsSyncing(true); syncShopifyProducts.mutate({}); };
  const handleSyncCustomers = () => { setIsSyncing(true); syncShopifyCustomers.mutate({}); };
  const handleSyncAll = () => {
    setIsSyncing(true);
    syncShopifyOrders.mutate({});
    syncShopifyProducts.mutate({});
    syncShopifyCustomers.mutate({});
  };

  const sendInvoiceEmail = trpc.invoices.sendEmail.useMutation({
    onSuccess: () => toast.success("Invoice emailed"),
    onError: (err: any) => toast.error(err.message),
  });

  const generatePdf = trpc.invoices.generatePdf.useMutation({
    onSuccess: (data) => { if (data.pdf) window.open(data.pdf, "_blank"); },
    onError: (err: any) => toast.error(err.message),
  });

  // Build a lookup for invoices and payments by order
  const invoiceByOrder = useMemo(() => {
    const map: Record<number, any> = {};
    invoices?.forEach((inv: any) => {
      if (inv.orderId) map[inv.orderId] = inv;
    });
    return map;
  }, [invoices]);

  const paymentsByInvoice = useMemo(() => {
    const map: Record<number, any[]> = {};
    payments?.forEach((p: any) => {
      if (p.invoiceId) {
        if (!map[p.invoiceId]) map[p.invoiceId] = [];
        map[p.invoiceId].push(p);
      }
    });
    return map;
  }, [payments]);

  // Enrich orders with invoice/payment data
  const enrichedOrders = useMemo(() => {
    return (orders || []).map((order: any) => {
      const invoice = invoiceByOrder[order.id];
      const orderPayments = invoice ? (paymentsByInvoice[invoice.id] || []) : [];
      const totalPaid = orderPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);
      const orderTotal = parseFloat(order.totalAmount || "0");
      let paymentStatus = "unpaid";
      if (totalPaid >= orderTotal && orderTotal > 0) paymentStatus = "paid";
      else if (totalPaid > 0) paymentStatus = "partial";

      return {
        ...order,
        _invoiceNumber: invoice?.invoiceNumber || "-",
        _invoiceStatus: invoice?.status || null,
        _paymentStatus: paymentStatus,
        _itemCount: order.items?.length || order.lineItems?.length || "-",
        _subtotal: order.subtotal || "0.00",
        _tax: order.tax || "0.00",
        _channel: order.shopifyOrderId ? "Shopify" : "Manual",
      };
    });
  }, [orders, invoiceByOrder, paymentsByInvoice]);

  const orderColumns: Column<any>[] = [
    { key: "orderNumber", header: "Order #", type: "text", sortable: true },
    { key: "orderDate", header: "Date", type: "date", sortable: true },
    { key: "customer.name", header: "Customer", type: "text", sortable: true },
    { key: "_itemCount", header: "Items", type: "text" },
    { key: "_subtotal", header: "Subtotal", type: "currency", sortable: true },
    { key: "_tax", header: "Tax", type: "currency" },
    { key: "totalAmount", header: "Total", type: "currency", sortable: true },
    { key: "status", header: "Status", type: "status", options: orderStatuses, filterable: true },
    { key: "_invoiceNumber", header: "Invoice #", type: "text" },
    { key: "_paymentStatus", header: "Payment", type: "status", options: paymentStatuses, filterable: true },
    { key: "_channel", header: "Channel", type: "badge", options: [
      { value: "Shopify", label: "Shopify", color: "bg-green-500/8 text-green-600 dark:text-green-400" },
      { value: "Manual", label: "Manual", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
    ]},
  ];

  const stats = useMemo(() => {
    const totalRevenue = (orders || []).reduce((sum: number, o: any) => sum + parseFloat(o.totalAmount || "0"), 0);
    return {
      totalProducts: products?.length || 0,
      totalOrders: orders?.length || 0,
      pendingOrders: orders?.filter((o: any) => o.status === "pending").length || 0,
      unpaidInvoices: invoices?.filter((i: any) => i.status !== "paid").length || 0,
      totalCustomers: customers?.length || 0,
      totalRevenue,
    };
  }, [products, orders, invoices, customers]);

  return (
    <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">Sales Hub</h1>
            <p className="text-muted-foreground">Sales overview -- orders, invoices, and payments</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Shopify Integration Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isSyncing}>
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-4 w-4 mr-2" />
                  )}
                  Shopify
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-green-600" />
                  Shopify Sync
                  {integrationStatus?.shopify?.configured ? (
                    <Badge variant="outline" className="ml-auto text-xs bg-green-50 text-green-700">Connected</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-auto text-xs">Not Set Up</Badge>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {integrationStatus?.shopify?.configured ? (
                  <>
                    <DropdownMenuItem onClick={handleSyncOrders}>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Sync Orders
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSyncProducts}>
                      <Package className="h-4 w-4 mr-2" />
                      Sync Products
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSyncCustomers}>
                      <Users className="h-4 w-4 mr-2" />
                      Sync Customers
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSyncAll}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync All Data
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href="/settings/integrations">
                      <Plug className="h-4 w-4 mr-2" />
                      Configure Shopify
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More Integrations Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Plug className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>More Integrations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/import">
                    <CloudUpload className="h-4 w-4 mr-2" />
                    Import from Google Sheets
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">
                    <Plug className="h-4 w-4 mr-2" />
                    All Integrations
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Revenue</p><p className="text-xl font-semibold tracking-[-0.02em] text-green-600">${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                <CreditCard className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Total Orders</p><p className="text-xl font-semibold tracking-[-0.02em]">{stats.totalOrders}</p></div>
                <ShoppingCart className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Pending Orders</p><p className="text-xl font-semibold tracking-[-0.02em] text-amber-600">{stats.pendingOrders}</p></div>
                <ShoppingCart className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Unpaid Invoices</p><p className="text-xl font-semibold tracking-[-0.02em] text-red-600">{stats.unpaidInvoices}</p></div>
                <FileText className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Customers</p><p className="text-xl font-semibold tracking-[-0.02em]">{stats.totalCustomers}</p></div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Single Orders Table */}
        <Card>
          <CardContent className="pt-6">
            <SpreadsheetTable
              data={enrichedOrders}
              columns={orderColumns}
              isLoading={ordersLoading}
              emptyMessage="No orders found"
              showSearch
              showFilters
              showExport
              expandable
              expandedRowId={expandedOrderId}
              onExpandChange={setExpandedOrderId}
              renderExpanded={(order, onClose) => (
                <OrderDetailPanel
                  order={order}
                  onStatusChange={(id, status) => updateOrderStatus.mutate({ id, status } as any)}
                />
              )}
              compact
            />
          </CardContent>
        </Card>
      </div>
  );
}
