import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Plus, Search, Loader2, Trash2, Mail, Send, Download, DollarSign, RefreshCw, Calendar, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | null | undefined) {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

type LineItem = {
  productId?: number;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
};

export default function Invoices() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [emailMessage, setEmailMessage] = useState("");
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: "",
    paymentMethod: "bank_transfer" as const,
    notes: "",
  });
  const [recurringData, setRecurringData] = useState({
    customerId: 0,
    templateName: "",
    frequency: "monthly" as const,
    dayOfMonth: 1,
    startDate: "",
    autoSend: false,
    daysUntilDue: 30,
  });
  const [recurringLineItems, setRecurringLineItems] = useState<LineItem[]>([]);
  const [activeTab, setActiveTab] = useState("invoices");
  const [formData, setFormData] = useState({
    customerId: 0,
    dueDate: "",
    notes: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  
  // Text-based invoice creation
  const [isTextInvoiceDialogOpen, setIsTextInvoiceDialogOpen] = useState(false);
  const [invoiceText, setInvoiceText] = useState("");
  const [parsedInvoiceData, setParsedInvoiceData] = useState<any>(null);
  const [draftInvoiceId, setDraftInvoiceId] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { data: invoices, isLoading, refetch } = trpc.invoices.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  
  const createInvoice = trpc.invoices.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created successfully");
      setIsOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const { data: recurringInvoices, refetch: refetchRecurring } = trpc.recurringInvoices.list.useQuery();

  const generatePdf = trpc.invoices.generatePdf.useMutation({
    onSuccess: (data) => {
      // Download the PDF
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${data.pdf}`;
      link.download = data.filename;
      link.click();
      toast.success("PDF downloaded");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const recordPayment = trpc.invoices.recordPayment.useMutation({
    onSuccess: (data) => {
      toast.success(`Payment recorded. Invoice status: ${data.newStatus}`);
      setIsPaymentDialogOpen(false);
      setPaymentData({ amount: "", paymentMethod: "bank_transfer", notes: "" });
      setSelectedInvoiceId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createRecurringInvoice = trpc.recurringInvoices.create.useMutation({
    onSuccess: () => {
      toast.success("Recurring invoice created");
      setIsRecurringDialogOpen(false);
      setRecurringData({
        customerId: 0,
        templateName: "",
        frequency: "monthly",
        dayOfMonth: 1,
        startDate: "",
        autoSend: false,
        daysUntilDue: 30,
      });
      setRecurringLineItems([]);
      refetchRecurring();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const generateNow = trpc.recurringInvoices.generateNow.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} generated`);
      refetch();
      refetchRecurring();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const toggleRecurringActive = trpc.recurringInvoices.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("Recurring invoice updated");
      refetchRecurring();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const sendInvoiceEmail = trpc.invoices.sendEmail.useMutation({
    onSuccess: () => {
      toast.success("Invoice sent to customer");
      setIsEmailDialogOpen(false);
      setEmailMessage("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createFromText = trpc.invoices.createFromText.useMutation({
    onSuccess: (data) => {
      setParsedInvoiceData(data.parsed);
      setDraftInvoiceId(data.invoiceId);
      setIsTextInvoiceDialogOpen(false);
      setIsPreviewOpen(true);
      toast.success("Invoice draft created - please review and approve");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const approveAndEmail = trpc.invoices.approveAndEmail.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} approved and emailed to customer`);
      setIsPreviewOpen(false);
      setParsedInvoiceData(null);
      setDraftInvoiceId(null);
      setInvoiceText("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({ customerId: 0, dueDate: "", notes: "" });
    setLineItems([]);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      productId: undefined,
      description: "",
      quantity: "1",
      unitPrice: "0",
      taxRate: "0",
      taxAmount: "0",
      totalAmount: "0",
    }]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number | undefined) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Recalculate totals
    const qty = parseFloat(updated[index].quantity) || 0;
    const price = parseFloat(updated[index].unitPrice) || 0;
    const taxRate = parseFloat(updated[index].taxRate) || 0;
    const subtotal = qty * price;
    const taxAmount = subtotal * (taxRate / 100);
    updated[index].taxAmount = taxAmount.toFixed(2);
    updated[index].totalAmount = (subtotal + taxAmount).toFixed(2);
    
    setLineItems(updated);
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products?.find(p => p.id === parseInt(productId));
    if (product) {
      const updated = [...lineItems];
      updated[index] = {
        ...updated[index],
        productId: product.id,
        description: product.name,
        unitPrice: product.unitPrice || "0",
      };
      // Recalculate
      const qty = parseFloat(updated[index].quantity) || 0;
      const price = parseFloat(updated[index].unitPrice) || 0;
      const taxRate = parseFloat(updated[index].taxRate) || 0;
      const subtotal = qty * price;
      const taxAmount = subtotal * (taxRate / 100);
      updated[index].taxAmount = taxAmount.toFixed(2);
      updated[index].totalAmount = (subtotal + taxAmount).toFixed(2);
      setLineItems(updated);
    }
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
    const tax = lineItems.reduce((sum, item) => sum + (parseFloat(item.taxAmount) || 0), 0);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const filteredInvoices = invoices?.filter((invoice) => {
    const matchesSearch =
      invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    sent: "bg-blue-500/10 text-blue-600",
    paid: "bg-green-500/10 text-green-600",
    overdue: "bg-red-500/10 text-red-600",
    cancelled: "bg-gray-500/10 text-gray-500",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lineItems.length === 0) {
      toast.error("Please add at least one line item");
      return;
    }
    const totals = calculateTotals();
    createInvoice.mutate({
      customerId: formData.customerId,
      issueDate: new Date(),
      subtotal: totals.subtotal.toFixed(2),
      taxAmount: totals.tax.toFixed(2),
      totalAmount: totals.total.toFixed(2),
      dueDate: new Date(formData.dueDate),
      notes: formData.notes || undefined,
      items: lineItems.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        totalAmount: item.totalAmount,
      })),
    });
  };

  const openPaymentDialog = (invoiceId: number, totalAmount: string, paidAmount: string | null) => {
    const remaining = parseFloat(totalAmount) - parseFloat(paidAmount || "0");
    setSelectedInvoiceId(invoiceId);
    setPaymentData({ ...paymentData, amount: remaining.toFixed(2) });
    setIsPaymentDialogOpen(true);
  };

  const handleRecordPayment = () => {
    if (!selectedInvoiceId || !paymentData.amount) return;
    recordPayment.mutate({
      invoiceId: selectedInvoiceId,
      amount: paymentData.amount,
      paymentMethod: paymentData.paymentMethod,
      notes: paymentData.notes,
    });
  };

  const handleCreateRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recurringData.customerId || !recurringData.templateName || recurringLineItems.length === 0) {
      toast.error("Please fill all required fields and add at least one line item");
      return;
    }
    createRecurringInvoice.mutate({
      ...recurringData,
      startDate: new Date(recurringData.startDate),
      items: recurringLineItems.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
      })),
    });
  };

  const addRecurringLineItem = () => {
    setRecurringLineItems([...recurringLineItems, {
      description: "",
      quantity: "1",
      unitPrice: "0",
      taxRate: "0",
      taxAmount: "0",
      totalAmount: "0",
    }]);
  };

  const handleSendEmail = () => {
    if (!selectedInvoiceId) return;
    sendInvoiceEmail.mutate({
      invoiceId: selectedInvoiceId,
      message: emailMessage || undefined,
    });
  };

  const openEmailDialog = (invoiceId: number) => {
    setSelectedInvoiceId(invoiceId);
    setIsEmailDialogOpen(true);
  };

  const handleCreateFromText = () => {
    if (!invoiceText.trim()) {
      toast.error("Please enter invoice details");
      return;
    }
    createFromText.mutate({ text: invoiceText });
  };

  const handleApproveAndEmail = () => {
    if (!draftInvoiceId) {
      toast.error("No draft invoice to approve");
      return;
    }
    approveAndEmail.mutate({ invoiceId: draftInvoiceId });
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Invoices
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage customer invoices and track payments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsRecurringDialogOpen(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Recurring
          </Button>
          <Button variant="outline" onClick={() => setIsTextInvoiceDialogOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Quick Create
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Invoice</DialogTitle>
                <DialogDescription>
                  Select products and create an invoice for a customer.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer">Customer</Label>
                    <Select
                      value={formData.customerId.toString()}
                      onValueChange={(value) => setFormData({ ...formData, customerId: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            {customer.name} {customer.email ? `(${customer.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Line Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      <Plus className="h-3 w-3 mr-1" /> Add Item
                    </Button>
                  </div>
                  
                  {lineItems.length === 0 ? (
                    <div className="border rounded-md p-4 text-center text-muted-foreground">
                      No items added. Click "Add Item" to add products to this invoice.
                    </div>
                  ) : (
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">Product</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[80px]">Qty</TableHead>
                            <TableHead className="w-[100px]">Price</TableHead>
                            <TableHead className="w-[80px]">Tax %</TableHead>
                            <TableHead className="w-[100px]">Total</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Select
                                  value={item.productId?.toString() || ""}
                                  onValueChange={(value) => selectProduct(index, value)}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products?.map((product) => (
                                      <SelectItem key={product.id} value={product.id.toString()}>
                                        {product.name} - {formatCurrency(product.unitPrice)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  value={item.description}
                                  onChange={(e) => updateLineItem(index, "description", e.target.value)}
                                  placeholder="Description"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  type="number"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  type="number"
                                  step="0.01"
                                  value={item.taxRate}
                                  onChange={(e) => updateLineItem(index, "taxRate", e.target.value)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {formatCurrency(item.totalAmount)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLineItem(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Totals */}
                {lineItems.length > 0 && (
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span>{formatCurrency(totals.subtotal.toFixed(2))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tax:</span>
                        <span>{formatCurrency(totals.tax.toFixed(2))}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base border-t pt-2">
                        <span>Total:</span>
                        <span>{formatCurrency(totals.total.toFixed(2))}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Payment terms, special instructions..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createInvoice.isPending || lineItems.length === 0}>
                  {createInvoice.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Invoice
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Email Dialog */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Invoice to Customer</DialogTitle>
            <DialogDescription>
              Send this invoice via email to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Message (Optional)</Label>
              <Textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Add a personal message to include with the invoice..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={sendInvoiceEmail.isPending}>
              {sendInvoiceEmail.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment received for this invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select 
                value={paymentData.paymentMethod} 
                onValueChange={(v: any) => setPaymentData({ ...paymentData, paymentMethod: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Label>Notes (Optional)</Label>
              <Textarea
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                placeholder="Payment reference or notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recurring Invoice Dialog */}
      <Dialog open={isRecurringDialogOpen} onOpenChange={setIsRecurringDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Recurring Invoice</DialogTitle>
            <DialogDescription>
              Set up automatic invoice generation on a schedule.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRecurring}>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input
                    value={recurringData.templateName}
                    onChange={(e) => setRecurringData({ ...recurringData, templateName: e.target.value })}
                    placeholder="Monthly Subscription"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <Select 
                    value={recurringData.customerId?.toString() || ""} 
                    onValueChange={(v) => setRecurringData({ ...recurringData, customerId: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Frequency *</Label>
                  <Select 
                    value={recurringData.frequency} 
                    onValueChange={(v: any) => setRecurringData({ ...recurringData, frequency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={recurringData.dayOfMonth}
                    onChange={(e) => setRecurringData({ ...recurringData, dayOfMonth: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input
                    type="date"
                    value={recurringData.startDate}
                    onChange={(e) => setRecurringData({ ...recurringData, startDate: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Days Until Due</Label>
                  <Input
                    type="number"
                    value={recurringData.daysUntilDue}
                    onChange={(e) => setRecurringData({ ...recurringData, daysUntilDue: parseInt(e.target.value) })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    checked={recurringData.autoSend}
                    onChange={(e) => setRecurringData({ ...recurringData, autoSend: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label>Auto-send to customer</Label>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addRecurringLineItem}>
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                </div>
                {recurringLineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => {
                        const updated = [...recurringLineItems];
                        updated[idx].description = e.target.value;
                        setRecurringLineItems(updated);
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => {
                        const updated = [...recurringLineItems];
                        updated[idx].quantity = e.target.value;
                        setRecurringLineItems(updated);
                      }}
                      className="w-20"
                    />
                    <Input
                      type="number"
                      placeholder="Price"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const updated = [...recurringLineItems];
                        updated[idx].unitPrice = e.target.value;
                        setRecurringLineItems(updated);
                      }}
                      className="w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRecurringLineItems(recurringLineItems.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRecurringDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createRecurringInvoice.isPending}>
                {createRecurringInvoice.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Recurring Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInvoices?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No invoices found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices?.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customer?.name || "-"}</TableCell>
                    <TableCell>
                      {invoice.issueDate ? format(new Date(invoice.issueDate), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      {invoice.dueDate ? format(new Date(invoice.dueDate), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[invoice.status] || ""}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => generatePdf.mutate({ invoiceId: invoice.id })}>
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => openEmailDialog(invoice.id)}
                            disabled={invoice.status === "paid" || invoice.status === "cancelled"}
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Email Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => openPaymentDialog(invoice.id, invoice.totalAmount, invoice.paidAmount)}
                            disabled={invoice.status === "paid" || invoice.status === "cancelled"}
                          >
                            <DollarSign className="h-4 w-4 mr-2" />
                            Record Payment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Text-based Invoice Creation Dialog */}
      <Dialog open={isTextInvoiceDialogOpen} onOpenChange={setIsTextInvoiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Create Invoice</DialogTitle>
            <DialogDescription>
              Create an invoice from simple text. For example: "$8500 invoice for 300lbs beef barbacoa bill to sysco net 30"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-text">Invoice Details</Label>
              <Textarea
                id="invoice-text"
                placeholder="e.g., $8500 invoice for 300lbs beef barbacoa bill to sysco net 30"
                value={invoiceText}
                onChange={(e) => setInvoiceText(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsTextInvoiceDialogOpen(false);
                setInvoiceText("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateFromText}
              disabled={createFromText.isPending || !invoiceText.trim()}
            >
              {createFromText.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview and Approval Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Invoice Draft</DialogTitle>
            <DialogDescription>
              Review the parsed invoice details and approve to send to customer.
            </DialogDescription>
          </DialogHeader>
          {parsedInvoiceData && draftInvoiceId && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Customer</Label>
                  <p className="font-medium">{parsedInvoiceData.customerName}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Amount</Label>
                  <p className="font-medium text-lg">{formatCurrency(parsedInvoiceData.amount.toString())}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Description</Label>
                <p>{parsedInvoiceData.description}</p>
              </div>
              {parsedInvoiceData.quantity && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Quantity</Label>
                    <p>{parsedInvoiceData.quantity} {parsedInvoiceData.unit || ""}</p>
                  </div>
                </div>
              )}
              {parsedInvoiceData.paymentTerms && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Payment Terms</Label>
                  <p>{parsedInvoiceData.paymentTerms}</p>
                </div>
              )}
              <div className="bg-muted p-4 rounded-md space-y-2">
                <p className="text-sm text-muted-foreground">
                  This invoice will be sent via email to the customer after approval.
                  A PDF will be generated and attached to the email.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsPreviewOpen(false);
                setParsedInvoiceData(null);
                setDraftInvoiceId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApproveAndEmail}
              disabled={approveAndEmail.isPending}
            >
              {approveAndEmail.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve & Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
