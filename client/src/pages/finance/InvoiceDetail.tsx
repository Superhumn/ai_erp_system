import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, FileText, DollarSign, Calendar,
  CheckCircle, Mail, Download, CreditCard, User, Clock,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  sent: "bg-blue-500/10 text-blue-600",
  approved: "bg-purple-500/10 text-purple-600",
  paid: "bg-green-500/10 text-green-600",
  overdue: "bg-red-500/10 text-red-600",
  cancelled: "bg-red-500/10 text-red-600",
  partially_paid: "bg-yellow-500/10 text-yellow-700",
};

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = parseInt(id || "0");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentMethod: "bank_transfer",
    reference: "",
    notes: "",
  });

  const { data: invoice, isLoading, refetch } = trpc.invoices.get.useQuery({ id: invoiceId });
  const { data: customers } = trpc.customers.list.useQuery();

  const approveInvoice = trpc.invoices.approve.useMutation({
    onSuccess: () => { toast.success("Invoice approved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const sendEmail = trpc.invoices.sendEmail.useMutation({
    onSuccess: () => toast.success("Invoice sent via email"),
    onError: (err) => toast.error(err.message),
  });

  const recordPayment = trpc.invoices.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded");
      setIsPaymentOpen(false);
      setPaymentForm({ amount: "", paymentMethod: "bank_transfer", reference: "", notes: "" });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Link href="/finance/invoices">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Invoice not found.</p>
      </div>
    );
  }

  const customer = customers?.find((c) => c.id === invoice.customerId);
  const totalPaid = parseFloat(String(invoice.paidAmount || 0));
  const totalDue = parseFloat(String(invoice.totalAmount || 0));
  const balance = totalDue - totalPaid;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/finance/invoices">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Invoices</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              {invoice.invoiceNumber || `Invoice #${invoice.id}`}
            </h1>
            <p className="text-muted-foreground capitalize">{invoice.type} Invoice</p>
          </div>
          <Badge className={statusColors[invoice.status || "draft"]}>{invoice.status}</Badge>
        </div>
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <Button variant="outline" onClick={() => approveInvoice.mutate({ id: invoiceId })} disabled={approveInvoice.isPending}>
              <CheckCircle className="h-4 w-4 mr-2" />Approve
            </Button>
          )}
          {(invoice.status === "approved" || invoice.status === "sent") && (
            <Button variant="outline" onClick={() => sendEmail.mutate({ invoiceId })} disabled={sendEmail.isPending}>
              <Mail className="h-4 w-4 mr-2" />Send Email
            </Button>
          )}
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <Button onClick={() => {
              setPaymentForm({ ...paymentForm, amount: String(balance) });
              setIsPaymentOpen(true);
            }}>
              <DollarSign className="h-4 w-4 mr-2" />Record Payment
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {customer ? (
              <Link href={`/sales/customers/${customer.id}`}>
                <span className="font-semibold text-primary hover:underline cursor-pointer">{customer.name}</span>
              </Link>
            ) : <span className="font-semibold">-</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-semibold">
              {invoice.dueDate ? format(new Date(invoice.dueDate), "MMM d, yyyy") : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance Due</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(balance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.items && invoice.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.description || "-"}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.taxAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No line items.</p>
          )}

          <div className="mt-4 pt-4 border-t space-y-1 text-right">
            <div className="flex justify-end gap-8">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-sm font-medium w-28">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.taxAmount && parseFloat(String(invoice.taxAmount)) > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-sm text-muted-foreground">Tax</span>
                <span className="text-sm font-medium w-28">{formatCurrency(invoice.taxAmount)}</span>
              </div>
            )}
            {invoice.discountAmount && parseFloat(String(invoice.discountAmount)) > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-sm text-muted-foreground">Discount</span>
                <span className="text-sm font-medium w-28 text-red-600">-{formatCurrency(invoice.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-end gap-8 pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-lg w-28">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            {totalPaid > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-sm text-green-600">Paid</span>
                <span className="text-sm font-medium w-28 text-green-600">{formatCurrency(totalPaid)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{invoice.notes}</p></CardContent>
        </Card>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                placeholder="Transaction reference"
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancel</Button>
            <Button
              onClick={() => recordPayment.mutate({
                invoiceId,
                amount: paymentForm.amount,
                paymentMethod: paymentForm.paymentMethod,
                reference: paymentForm.reference || undefined,
                notes: paymentForm.notes || undefined,
              })}
              disabled={recordPayment.isPending || !paymentForm.amount}
            >
              {recordPayment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
