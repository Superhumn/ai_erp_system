import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ShoppingCart, Users, Package, Search,
  ShoppingBag, Plug, Loader2, Mail, CloudUpload, RefreshCw,
  ArrowUpDown, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";

// ── Status badge config ──

const orderStatusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  confirmed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  processing: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  shipped: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  delivered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
  refunded: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

const invoiceStatusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

const shipStatusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_transit: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  delivered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  returned: "bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

function StatusBadge({ value, colorMap }: { value: string | null | undefined; colorMap: Record<string, string> }) {
  if (!value) return <span className="text-muted-foreground">&mdash;</span>;
  const color = colorMap[value] ?? "bg-gray-500/10 text-gray-600";
  return (
    <Badge variant="secondary" className={`${color} text-[11px] font-medium whitespace-nowrap`}>
      {value.replace(/_/g, " ")}
    </Badge>
  );
}

function fmtCurrency(v: string | number | null | undefined): string {
  if (v == null || v === "") return "\u2014";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "\u2014";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "\u2014";
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Sorting ──
type SortDir = "asc" | "desc";
type SortKey = string;

export default function SalesHub() {
  const [, navigate] = useLocation();
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("orderDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Data queries ──
  const { data: products } = trpc.products.list.useQuery();
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = trpc.orders.list.useQuery();
  const { data: invoices } = trpc.invoices.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: payments } = trpc.payments.list.useQuery();
  const { data: shipments } = trpc.shipments.list.useQuery();

  // Integration status
  const { data: integrationStatus } = trpc.integrations.getStatus.useQuery();

  // ── Mutations ──
  const syncShopifyOrders = trpc.shopify.sync.orders.useMutation({
    onSuccess: (data) => { toast.success(`Synced ${data.imported} new orders, updated ${data.updated}`); refetchOrders(); setIsSyncing(false); },
    onError: (err: any) => { toast.error(err.message); setIsSyncing(false); },
  });
  const syncShopifyProducts = trpc.shopify.sync.products.useMutation({
    onSuccess: (data) => { toast.success(`Synced ${data.imported} new products, updated ${data.updated}`); setIsSyncing(false); },
    onError: (err: any) => { toast.error(err.message); setIsSyncing(false); },
  });
  const syncShopifyCustomers = trpc.shopify.sync.customers.useMutation({
    onSuccess: (data) => { toast.success(`Synced ${data.imported} new customers, updated ${data.updated}`); setIsSyncing(false); },
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

  // ── Client-side lookups ──

  const customerMap = useMemo(() => {
    const m: Record<number, { name: string; email: string | null }> = {};
    (customers as any[] | undefined)?.forEach((c: any) => {
      m[c.id] = { name: c.name, email: c.email ?? null };
    });
    return m;
  }, [customers]);

  // Invoice lookup by invoice id (orders store invoiceId)
  const invoiceById = useMemo(() => {
    const m: Record<number, any> = {};
    (invoices as any[] | undefined)?.forEach((inv: any) => {
      m[inv.id] = inv;
    });
    return m;
  }, [invoices]);

  // Payments grouped by invoiceId
  const paymentsByInvoice = useMemo(() => {
    const m: Record<number, any[]> = {};
    (payments as any[] | undefined)?.forEach((p: any) => {
      if (p.invoiceId) {
        if (!m[p.invoiceId]) m[p.invoiceId] = [];
        m[p.invoiceId].push(p);
      }
    });
    return m;
  }, [payments]);

  // Shipments grouped by orderId
  const shipmentsByOrder = useMemo(() => {
    const m: Record<number, any[]> = {};
    (shipments as any[] | undefined)?.forEach((s: any) => {
      if (s.orderId) {
        if (!m[s.orderId]) m[s.orderId] = [];
        m[s.orderId].push(s);
      }
    });
    return m;
  }, [shipments]);

  // ── Enriched rows ──

  interface EnrichedOrder {
    id: number;
    orderNumber: string;
    orderDate: string | Date | null;
    customerName: string;
    customerEmail: string;
    itemCount: number | string;
    subtotal: string;
    tax: string;
    total: string;
    status: string;
    invoiceNumber: string;
    invoiceStatus: string;
    amountPaid: string;
    balanceDue: string;
    paymentDate: string | Date | null;
    shipStatus: string;
    trackingNumber: string;
    carrier: string;
    channel: string;
  }

  const enrichedOrders: EnrichedOrder[] = useMemo(() => {
    return (orders as any[] | undefined || []).map((order: any) => {
      const cust = order.customerId ? customerMap[order.customerId] : null;
      const invoice = order.invoiceId ? invoiceById[order.invoiceId] : null;
      const invPayments = invoice ? (paymentsByInvoice[invoice.id] || []) : [];
      const totalPaid = invPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);
      const orderTotal = parseFloat(order.totalAmount || "0");
      const balanceDue = Math.max(0, orderTotal - totalPaid);

      // Most recent payment date
      const latestPayment = invPayments.length > 0
        ? invPayments.sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]
        : null;

      // Shipment data (use first/primary shipment for this order)
      const orderShipments = shipmentsByOrder[order.id] || [];
      const primaryShipment = orderShipments[0] || null;

      const channel = order.shopifyOrderId ? "Shopify" : "Manual";

      return {
        id: order.id,
        orderNumber: order.orderNumber || "\u2014",
        orderDate: order.orderDate,
        customerName: cust?.name || "\u2014",
        customerEmail: cust?.email || "\u2014",
        itemCount: order.items?.length || order.lineItems?.length || "\u2014",
        subtotal: order.subtotal || "0",
        tax: order.taxAmount || "0",
        total: order.totalAmount || "0",
        status: order.status || "pending",
        invoiceNumber: invoice?.invoiceNumber || "\u2014",
        invoiceStatus: invoice?.status || "\u2014",
        amountPaid: totalPaid > 0 ? totalPaid.toFixed(2) : "\u2014",
        balanceDue: invoice ? balanceDue.toFixed(2) : "\u2014",
        paymentDate: latestPayment?.paymentDate || null,
        shipStatus: primaryShipment?.status || "\u2014",
        trackingNumber: primaryShipment?.trackingNumber || "\u2014",
        carrier: primaryShipment?.carrier || "\u2014",
        channel,
      } satisfies EnrichedOrder;
    });
  }, [orders, customerMap, invoiceById, paymentsByInvoice, shipmentsByOrder]);

  // ── Search filter ──
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return enrichedOrders;
    const q = searchQuery.toLowerCase();
    return enrichedOrders.filter((r) =>
      r.orderNumber.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      r.customerEmail.toLowerCase().includes(q) ||
      r.invoiceNumber.toLowerCase().includes(q) ||
      r.trackingNumber.toLowerCase().includes(q) ||
      r.carrier.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q) ||
      r.channel.toLowerCase().includes(q)
    );
  }, [enrichedOrders, searchQuery]);

  // ── Sorting ──
  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders];
    sorted.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      // Dates
      if (sortKey === "orderDate" || sortKey === "paymentDate") {
        const da = new Date(av).getTime();
        const db = new Date(bv).getTime();
        return sortDir === "asc" ? da - db : db - da;
      }
      // Numbers
      if (["subtotal", "tax", "total", "amountPaid", "balanceDue", "itemCount"].includes(sortKey)) {
        const na = parseFloat(av) || 0;
        const nb = parseFloat(bv) || 0;
        return sortDir === "asc" ? na - nb : nb - na;
      }
      // Strings
      const sa = String(av).toLowerCase();
      const sb = String(bv).toLowerCase();
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return sorted;
  }, [filteredOrders, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp className="inline h-3 w-3 ml-1" />
      : <ChevronDown className="inline h-3 w-3 ml-1" />;
  }

  // ── KPI stats ──
  const stats = useMemo(() => {
    const totalRevenue = (orders as any[] | undefined || []).reduce((sum: number, o: any) => sum + parseFloat(o.totalAmount || "0"), 0);
    return {
      totalProducts: (products as any[] | undefined)?.length || 0,
      totalOrders: (orders as any[] | undefined)?.length || 0,
      pendingOrders: (orders as any[] | undefined)?.filter((o: any) => o.status === "pending").length || 0,
      unpaidInvoices: (invoices as any[] | undefined)?.filter((i: any) => i.status !== "paid").length || 0,
      totalCustomers: (customers as any[] | undefined)?.length || 0,
      totalRevenue,
    };
  }, [products, orders, invoices, customers]);

  // ── Column definitions for the table header ──
  const columns: { key: string; label: string; align?: "right" | "left" | "center"; sortable?: boolean }[] = [
    { key: "orderNumber", label: "Order#", sortable: true },
    { key: "orderDate", label: "Date", sortable: true },
    { key: "customerName", label: "Customer", sortable: true },
    { key: "customerEmail", label: "Email", sortable: true },
    { key: "itemCount", label: "Items", align: "right", sortable: true },
    { key: "subtotal", label: "Subtotal", align: "right", sortable: true },
    { key: "tax", label: "Tax", align: "right", sortable: true },
    { key: "total", label: "Total", align: "right", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "invoiceNumber", label: "Invoice#", sortable: true },
    { key: "invoiceStatus", label: "Invoice Status", sortable: true },
    { key: "amountPaid", label: "Amount Paid", align: "right", sortable: true },
    { key: "balanceDue", label: "Balance Due", align: "right", sortable: true },
    { key: "paymentDate", label: "Payment Date", sortable: true },
    { key: "shipStatus", label: "Ship Status", sortable: true },
    { key: "trackingNumber", label: "Tracking#", sortable: true },
    { key: "carrier", label: "Carrier", sortable: true },
    { key: "channel", label: "Channel", sortable: true },
  ];

  // ── Channel badge colors ──
  const channelColors: Record<string, string> = {
    Shopify: "bg-green-500/10 text-green-600 dark:text-green-400",
    Manual: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
    Wholesale: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };

  // ── Render cell ──
  function renderCell(row: EnrichedOrder, key: string) {
    const val = (row as any)[key];
    switch (key) {
      case "orderDate":
      case "paymentDate":
        return fmtDate(val);
      case "subtotal":
      case "tax":
      case "total":
        return fmtCurrency(val);
      case "amountPaid":
      case "balanceDue":
        return val === "\u2014" ? "\u2014" : fmtCurrency(val);
      case "status":
        return <StatusBadge value={val} colorMap={orderStatusColors} />;
      case "invoiceStatus":
        return val === "\u2014" ? <span className="text-muted-foreground">&mdash;</span> : <StatusBadge value={val} colorMap={invoiceStatusColors} />;
      case "shipStatus":
        return val === "\u2014" ? <span className="text-muted-foreground">&mdash;</span> : <StatusBadge value={val} colorMap={shipStatusColors} />;
      case "channel":
        return <Badge variant="secondary" className={`${channelColors[val] ?? channelColors.Manual} text-[11px] font-medium`}>{val}</Badge>;
      case "orderNumber":
        return val && val !== "\u2014" ? (
          <span className="text-primary font-semibold">{val}</span>
        ) : "\u2014";
      case "customerName":
        return val && val !== "\u2014" ? (
          <a href="/crm/hub" onClick={(e) => { e.preventDefault(); navigate("/crm/hub"); }} className="text-primary hover:underline cursor-pointer">
            {val}
          </a>
        ) : "\u2014";
      case "invoiceNumber":
        return val && val !== "\u2014" ? (
          <a href="/finance/invoices" onClick={(e) => { e.preventDefault(); navigate("/finance/invoices"); }} className="text-primary hover:underline cursor-pointer">
            {val}
          </a>
        ) : "\u2014";
      case "trackingNumber":
        return val && val !== "\u2014" ? (
          <a href="/operations/shipments" onClick={(e) => { e.preventDefault(); navigate("/operations/shipments"); }} className="text-primary hover:underline cursor-pointer">
            {val}
          </a>
        ) : "\u2014";
      case "itemCount":
        return val;
      default:
        return val ?? "\u2014";
    }
  }

  return (
    <div className="p-6 space-y-2">
      {/* Header — single consolidated row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em]">Orders &amp; Sales</h1>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Revenue</span> <span className="font-bold text-green-600">${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Orders</span> <span className="font-bold">{stats.totalOrders}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Pending</span> <span className="font-bold text-amber-600">{stats.pendingOrders}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Unpaid</span> <span className="font-bold text-red-600">{stats.unpaidInvoices}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Customers</span> <span className="font-bold">{stats.totalCustomers}</span></div>
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

      {/* Unified Orders & Sales Table */}
      <Card>
        <CardContent className="pt-4">
          {/* Search */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders, customers, invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">{sortedOrders.length} orders</span>
          </div>

          {/* Scrollable table */}
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-1.5 py-1 font-medium text-xs whitespace-nowrap select-none ${
                        col.align === "right" ? "text-right" : "text-left"
                      } ${col.sortable ? "cursor-pointer hover:bg-muted/80" : ""}`}
                      onClick={() => col.sortable && toggleSort(col.key)}
                    >
                      {col.label}
                      {col.sortable && <SortIcon col={col.key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Loading orders...
                    </td>
                  </tr>
                ) : sortedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  sortedOrders.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-1.5 py-0.5 whitespace-nowrap ${
                            col.align === "right" ? "text-right tabular-nums" : "text-left"
                          }`}
                        >
                          {renderCell(row, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
