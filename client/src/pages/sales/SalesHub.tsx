import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import SpreadsheetTable, { Column } from "@/components/SpreadsheetTable";
import { 
import { AITriggerButton } from "@/components/FloatingAIAssistant";
  ShoppingCart, FileText, Users, CreditCard, Package, Search,
  Send, Download
} from "lucide-react";

const orderStatuses = [
  { value: "pending", label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-100 text-blue-800" },
  { value: "shipped", label: "Shipped", color: "bg-purple-100 text-purple-800" },
  { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

const invoiceStatuses = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-800" },
  { value: "paid", label: "Paid", color: "bg-green-100 text-green-800" },
  { value: "overdue", label: "Overdue", color: "bg-red-100 text-red-800" },
  { value: "partial", label: "Partial", color: "bg-amber-100 text-amber-800" },
];

function ProductDetailPanel({ product }: { product: any }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{product.name}</h3>
          <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">${product.price || "0.00"}</div>
          <p className="text-sm text-muted-foreground">Unit Price</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">In Stock</div>
          <div className="font-medium">{product.stockQuantity || 0}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Category</div>
          <div className="font-medium">{product.category || "N/A"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Status</div>
          <div className="font-medium">{product.isActive ? "Active" : "Inactive"}</div>
        </div>
      </div>
    </div>
  );
}

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

function InvoiceDetailPanel({ invoice, onSendEmail, onDownloadPdf }: { invoice: any; onSendEmail: (inv: any) => void; onDownloadPdf: (inv: any) => void }) {
  const statusOption = invoiceStatuses.find(s => s.value === invoice.status);
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Invoice #{invoice.invoiceNumber}</h3>
          <p className="text-sm text-muted-foreground">{invoice.customer?.name || "No customer"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          <Button size="sm" variant="outline" onClick={() => onDownloadPdf(invoice)}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          {invoice.status !== "paid" && (
            <Button size="sm" variant="outline" onClick={() => onSendEmail(invoice)}>
              <Send className="h-4 w-4 mr-1" /> Email
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Subtotal</div>
          <div className="font-medium">${invoice.subtotal || "0.00"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Tax</div>
          <div className="font-medium">${invoice.tax || "0.00"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Total</div>
          <div className="font-medium">${invoice.totalAmount || "0.00"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Due Date</div>
          <div className="font-medium">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

function CustomerDetailPanel({ customer }: { customer: any }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{customer.name}</h3>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
        <Badge variant={customer.isActive ? "default" : "secondary"}>{customer.isActive ? "Active" : "Inactive"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Phone</div>
          <div className="font-medium">{customer.phone || "N/A"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Company</div>
          <div className="font-medium">{customer.company || "N/A"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Address</div>
          <div className="font-medium">{customer.address || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

function PaymentDetailPanel({ payment }: { payment: any }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Payment #{payment.id}</h3>
          <p className="text-sm text-muted-foreground">{payment.invoice?.invoiceNumber ? `Invoice #${payment.invoice.invoiceNumber}` : "No invoice"}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-green-600">${payment.amount}</div>
          <p className="text-sm text-muted-foreground capitalize">{payment.method}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Date</div>
          <div className="font-medium">{payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : "N/A"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Method</div>
          <div className="font-medium capitalize">{payment.method || "N/A"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Reference</div>
          <div className="font-medium">{payment.reference || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

export default function SalesHub() {

  const [activeTab, setActiveTab] = useState("products");
  const [expandedProductId, setExpandedProductId] = useState<number | string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | string | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<number | string | null>(null);

  const { data: products, isLoading: productsLoading } = trpc.products.list.useQuery();
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = trpc.orders.list.useQuery();
  const { data: invoices, isLoading: invoicesLoading } = trpc.invoices.list.useQuery();
  const { data: customers, isLoading: customersLoading } = trpc.customers.list.useQuery();
  const { data: payments, isLoading: paymentsLoading } = trpc.payments.list.useQuery();

  const updateOrderStatus = trpc.orders.update.useMutation({
    onSuccess: () => { toast.success("Order updated"); refetchOrders(); },
    onError: (err: any) => toast.error(err.message),
  });

  const sendInvoiceEmail = trpc.invoices.sendEmail.useMutation({
    onSuccess: () => toast.success("Invoice emailed"),
    onError: (err: any) => toast.error(err.message),
  });

  const generatePdf = trpc.invoices.generatePdf.useMutation({
    onSuccess: (data) => { if (data.pdf) window.open(data.pdf, "_blank"); },
    onError: (err: any) => toast.error(err.message),
  });

  const productColumns: Column<any>[] = [
    { key: "sku", header: "SKU", type: "text", sortable: true },
    { key: "name", header: "Name", type: "text", sortable: true },
    { key: "category", header: "Category", type: "text" },
    { key: "price", header: "Price", type: "currency", sortable: true },
    { key: "stockQuantity", header: "Stock", type: "number", sortable: true },
    { key: "isActive", header: "Status", type: "badge", render: (val) => val ? "Active" : "Inactive" },
  ];

  const orderColumns: Column<any>[] = [
    { key: "orderNumber", header: "Order #", type: "text", sortable: true },
    { key: "customer.name", header: "Customer", type: "text", sortable: true },
    { key: "orderDate", header: "Date", type: "date", sortable: true },
    { key: "totalAmount", header: "Total", type: "currency", sortable: true },
    { key: "status", header: "Status", type: "badge", sortable: true, render: (val) => orderStatuses.find(s => s.value === val)?.label || val },
  ];

  const invoiceColumns: Column<any>[] = [
    { key: "invoiceNumber", header: "Invoice #", type: "text", sortable: true },
    { key: "customer.name", header: "Customer", type: "text", sortable: true },
    { key: "issueDate", header: "Issued", type: "date", sortable: true },
    { key: "dueDate", header: "Due", type: "date", sortable: true },
    { key: "totalAmount", header: "Amount", type: "currency", sortable: true },
    { key: "status", header: "Status", type: "badge", sortable: true, render: (val) => invoiceStatuses.find(s => s.value === val)?.label || val },
  ];

  const customerColumns: Column<any>[] = [
    { key: "name", header: "Name", type: "text", sortable: true },
    { key: "email", header: "Email", type: "text", sortable: true },
    { key: "phone", header: "Phone", type: "text" },
    { key: "company", header: "Company", type: "text" },
    { key: "isActive", header: "Status", type: "badge", render: (val) => val ? "Active" : "Inactive" },
  ];

  const paymentColumns: Column<any>[] = [
    { key: "id", header: "ID", type: "text", sortable: true },
    { key: "invoice.invoiceNumber", header: "Invoice", type: "text" },
    { key: "paymentDate", header: "Date", type: "date", sortable: true },
    { key: "amount", header: "Amount", type: "currency", sortable: true },
    { key: "method", header: "Method", type: "text" },
  ];

  const stats = useMemo(() => ({
    totalProducts: products?.length || 0,
    pendingOrders: orders?.filter((o: any) => o.status === "pending").length || 0,
    unpaidInvoices: invoices?.filter((i: any) => i.status !== "paid").length || 0,
    totalCustomers: customers?.length || 0,
    recentPayments: payments?.length || 0,
  }), [products, orders, invoices, customers, payments]);

  return (
    <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Sales Hub</h1>
          <AITriggerButton message="Analyze our sales - show pipeline health, predict deal outcomes, and identify growth opportunities" label="AI Sales Insights" />
        </div>
            <p className="text-muted-foreground">Products, Orders, Invoices, Customers, and Payments</p>
          </div>

        </div>

        <div className="grid grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("products")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Products</p><p className="text-2xl font-bold">{stats.totalProducts}</p></div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("orders")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Pending Orders</p><p className="text-2xl font-bold text-amber-600">{stats.pendingOrders}</p></div>
                <ShoppingCart className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("invoices")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Unpaid Invoices</p><p className="text-2xl font-bold text-red-600">{stats.unpaidInvoices}</p></div>
                <FileText className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("customers")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Customers</p><p className="text-2xl font-bold">{stats.totalCustomers}</p></div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("payments")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Payments</p><p className="text-2xl font-bold text-green-600">{stats.recentPayments}</p></div>
                <CreditCard className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="products"><Package className="h-4 w-4 mr-2" /> Products</TabsTrigger>
            <TabsTrigger value="orders"><ShoppingCart className="h-4 w-4 mr-2" /> Orders</TabsTrigger>
            <TabsTrigger value="invoices"><FileText className="h-4 w-4 mr-2" /> Invoices</TabsTrigger>
            <TabsTrigger value="customers"><Users className="h-4 w-4 mr-2" /> Customers</TabsTrigger>
            <TabsTrigger value="payments"><CreditCard className="h-4 w-4 mr-2" /> Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-4">
            <Card><CardContent className="pt-6">
              <SpreadsheetTable data={products || []} columns={productColumns} isLoading={productsLoading} showSearch expandedRowId={expandedProductId} onExpandChange={setExpandedProductId} renderExpanded={(product, onClose) => <ProductDetailPanel product={product} />} />
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <Card><CardContent className="pt-6">
              <SpreadsheetTable data={orders || []} columns={orderColumns} isLoading={ordersLoading} showSearch expandedRowId={expandedOrderId} onExpandChange={setExpandedOrderId} renderExpanded={(order, onClose) => <OrderDetailPanel order={order} onStatusChange={(id, status) => updateOrderStatus.mutate({ id, status } as any)} />} />
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-4">
            <Card><CardContent className="pt-6">
              <SpreadsheetTable data={invoices || []} columns={invoiceColumns} isLoading={invoicesLoading} showSearch expandedRowId={expandedInvoiceId} onExpandChange={setExpandedInvoiceId} renderExpanded={(invoice, onClose) => <InvoiceDetailPanel invoice={invoice} onSendEmail={(inv) => sendInvoiceEmail.mutate({ invoiceId: inv.id })} onDownloadPdf={(inv) => generatePdf.mutate({ invoiceId: inv.id })} />} />
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <Card><CardContent className="pt-6">
              <SpreadsheetTable data={customers || []} columns={customerColumns} isLoading={customersLoading} showSearch expandedRowId={expandedCustomerId} onExpandChange={setExpandedCustomerId} renderExpanded={(customer, onClose) => <CustomerDetailPanel customer={customer} />} />
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <Card><CardContent className="pt-6">
              <SpreadsheetTable data={payments || []} columns={paymentColumns} isLoading={paymentsLoading} showSearch expandedRowId={expandedPaymentId} onExpandChange={setExpandedPaymentId} renderExpanded={(payment, onClose) => <PaymentDetailPanel payment={payment} />} />
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
