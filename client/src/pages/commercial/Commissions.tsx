import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, Users, Plus, Loader2, Percent, Receipt, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value ?? "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const commissionTypeLabels: Record<string, string> = {
  percentage: "Percentage",
  flat_per_unit: "Flat / Unit",
  flat_per_order: "Flat / Order",
  tiered: "Tiered",
};

const transactionStatusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  approved: "bg-blue-500/10 text-blue-600",
  paid: "bg-green-500/10 text-green-600",
  disputed: "bg-red-500/10 text-red-600",
};

const ruleStatusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  inactive: "bg-gray-500/10 text-gray-600",
  expired: "bg-red-500/10 text-red-600",
};

export default function Commissions() {
  const { toast } = useToast();

  // Rule dialog state
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    brokerName: "",
    brokerId: "",
    customerId: "",
    productId: "",
    commissionType: "percentage" as "percentage" | "flat_per_unit" | "flat_per_order" | "tiered",
    commissionRate: "",
    paymentTerms: "",
    effectiveDate: "",
    expiryDate: "",
    notes: "",
  });

  // Transaction dialog state
  const [isTxDialogOpen, setIsTxDialogOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    commissionRuleId: "",
    orderId: "",
    invoiceId: "",
    orderAmount: "",
    commissionAmount: "",
  });

  // tRPC queries
  const { data: rules, isLoading: rulesLoading, refetch: refetchRules } =
    trpc.qualityManagement.commissions.list.useQuery();
  const { data: transactions, isLoading: txLoading, refetch: refetchTx } =
    trpc.qualityManagement.commissions.transactions.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();

  // tRPC mutations
  const createRule = trpc.qualityManagement.commissions.create.useMutation({
    onSuccess: () => {
      toast({ title: "Commission rule created", description: "The rule has been added successfully." });
      setIsRuleDialogOpen(false);
      setRuleForm({
        brokerName: "", brokerId: "", customerId: "", productId: "",
        commissionType: "percentage", commissionRate: "", paymentTerms: "",
        effectiveDate: "", expiryDate: "", notes: "",
      });
      refetchRules();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createTransaction = trpc.qualityManagement.commissions.transactions.create.useMutation({
    onSuccess: () => {
      toast({ title: "Transaction recorded", description: "The commission transaction has been saved." });
      setIsTxDialogOpen(false);
      setTxForm({ commissionRuleId: "", orderId: "", invoiceId: "", orderAmount: "", commissionAmount: "" });
      refetchTx();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Derived stats
  const activeBrokers = rules
    ? new Set(rules.filter((r: any) => r.status === "active").map((r: any) => r.brokerId || r.brokerName)).size
    : 0;

  const pendingCommissions = transactions
    ? transactions
        .filter((t: any) => t.status === "pending")
        .reduce((sum: number, t: any) => sum + parseFloat(t.commissionAmount ?? "0"), 0)
    : 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const paidThisMonth = transactions
    ? transactions
        .filter((t: any) => t.status === "paid" && t.paidDate && t.paidDate >= monthStart)
        .reduce((sum: number, t: any) => sum + parseFloat(t.commissionAmount ?? "0"), 0)
    : 0;

  const avgRate =
    rules && rules.length > 0
      ? (
          rules
            .filter((r: any) => r.commissionType === "percentage")
            .reduce((sum: number, r: any) => sum + parseFloat(r.commissionRate ?? "0"), 0) /
          (rules.filter((r: any) => r.commissionType === "percentage").length || 1)
        ).toFixed(2)
      : "0.00";

  // Submit handlers
  const handleRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRule.mutate({
      brokerName: ruleForm.brokerName,
      brokerId: ruleForm.brokerId || undefined,
      customerId: ruleForm.customerId ? parseInt(ruleForm.customerId) : undefined,
      productId: ruleForm.productId ? parseInt(ruleForm.productId) : undefined,
      commissionType: ruleForm.commissionType,
      commissionRate: ruleForm.commissionRate,
      paymentTerms: ruleForm.paymentTerms || undefined,
      effectiveDate: ruleForm.effectiveDate || undefined,
      expiryDate: ruleForm.expiryDate || undefined,
      notes: ruleForm.notes || undefined,
    });
  };

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTransaction.mutate({
      commissionRuleId: txForm.commissionRuleId ? parseInt(txForm.commissionRuleId) : undefined,
      orderId: txForm.orderId ? parseInt(txForm.orderId) : undefined,
      invoiceId: txForm.invoiceId || undefined,
      orderAmount: txForm.orderAmount,
      commissionAmount: txForm.commissionAmount,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-8 w-8" />
          Broker &amp; Distributor Commissions
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage commission rules and track payouts for brokers and distributors.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Active Brokers</span>
            </div>
            <div className="text-2xl font-bold mt-2">{activeBrokers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Pending Commissions</span>
            </div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(pendingCommissions)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Paid This Month</span>
            </div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(paidThisMonth)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Average Rate (%)</span>
            </div>
            <div className="text-2xl font-bold mt-2">{avgRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Commission Rules</TabsTrigger>
          <TabsTrigger value="transactions">Commission Transactions</TabsTrigger>
        </TabsList>

        {/* Commission Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Define commission rates for brokers and distributors by customer or product.
            </p>
            <Button onClick={() => setIsRuleDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Rule
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {rulesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Broker Name</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Commission Type</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!rules || rules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No commission rules found. Create one to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rules.map((rule: any) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.brokerName}</TableCell>
                          <TableCell>
                            {rule.customerName ?? (
                              <span className="text-muted-foreground italic">All Customers</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {rule.productName ?? (
                              <span className="text-muted-foreground italic">All Products</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {commissionTypeLabels[rule.commissionType] ?? rule.commissionType}
                          </TableCell>
                          <TableCell>
                            {rule.commissionType === "percentage"
                              ? `${rule.commissionRate}%`
                              : formatCurrency(rule.commissionRate)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={ruleStatusColors[rule.status] ?? ""}
                            >
                              {rule.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(rule.effectiveDate)}</TableCell>
                          <TableCell>{formatDate(rule.expiryDate)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commission Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Track commission transactions tied to orders and invoices.
            </p>
            <Button onClick={() => setIsTxDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Record Transaction
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {txLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Broker</TableHead>
                      <TableHead>Order #</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Order Amount</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Paid Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!transactions || transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No transactions found. Record one to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx: any) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-medium">{tx.brokerName ?? "—"}</TableCell>
                          <TableCell>{tx.orderNumber ?? tx.orderId ?? "—"}</TableCell>
                          <TableCell>{tx.invoiceId ?? "—"}</TableCell>
                          <TableCell>{formatCurrency(tx.orderAmount)}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(tx.commissionAmount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={transactionStatusColors[tx.status] ?? ""}
                            >
                              {tx.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{tx.period ?? "—"}</TableCell>
                          <TableCell>{formatDate(tx.paidDate)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Commission Rule Dialog */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Commission Rule</DialogTitle>
            <DialogDescription>
              Define a commission rate for a broker or distributor.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRuleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brokerName">Broker Name *</Label>
                <Input
                  id="brokerName"
                  placeholder="e.g. Acme Brokerage"
                  value={ruleForm.brokerName}
                  onChange={(e) => setRuleForm({ ...ruleForm, brokerName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brokerId">Broker ID</Label>
                <Input
                  id="brokerId"
                  placeholder="e.g. BRK-001"
                  value={ruleForm.brokerId}
                  onChange={(e) => setRuleForm({ ...ruleForm, brokerId: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerId">Customer (optional)</Label>
                <Select
                  value={ruleForm.customerId}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, customerId: v })}
                >
                  <SelectTrigger id="customerId">
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Customers</SelectItem>
                    {customers?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="productId">Product (optional)</Label>
                <Select
                  value={ruleForm.productId}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, productId: v })}
                >
                  <SelectTrigger id="productId">
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Products</SelectItem>
                    {products?.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="commissionType">Commission Type *</Label>
                <Select
                  value={ruleForm.commissionType}
                  onValueChange={(v) =>
                    setRuleForm({
                      ...ruleForm,
                      commissionType: v as typeof ruleForm.commissionType,
                    })
                  }
                >
                  <SelectTrigger id="commissionType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="flat_per_unit">Flat / Unit</SelectItem>
                    <SelectItem value="flat_per_order">Flat / Order</SelectItem>
                    <SelectItem value="tiered">Tiered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commissionRate">
                  Commission Rate *{" "}
                  <span className="text-muted-foreground text-xs">
                    {ruleForm.commissionType === "percentage" ? "(e.g. 5 = 5%)" : "(USD)"}
                  </span>
                </Label>
                <Input
                  id="commissionRate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={ruleForm.commissionType === "percentage" ? "5.00" : "0.50"}
                  value={ruleForm.commissionRate}
                  onChange={(e) => setRuleForm({ ...ruleForm, commissionRate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Input
                id="paymentTerms"
                placeholder="e.g. Net 30, Monthly, Upon invoice payment"
                value={ruleForm.paymentTerms}
                onChange={(e) => setRuleForm({ ...ruleForm, paymentTerms: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="effectiveDate">Effective Date</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  value={ruleForm.effectiveDate}
                  onChange={(e) => setRuleForm({ ...ruleForm, effectiveDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Expiry Date</Label>
                <Input
                  id="expiryDate"
                  type="date"
                  value={ruleForm.expiryDate}
                  onChange={(e) => setRuleForm({ ...ruleForm, expiryDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Additional notes about this commission rule"
                value={ruleForm.notes}
                onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRuleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createRule.isLoading}>
                {createRule.isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Rule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Commission Transaction Dialog */}
      <Dialog open={isTxDialogOpen} onOpenChange={setIsTxDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Commission Transaction</DialogTitle>
            <DialogDescription>
              Log a commission transaction against an order or invoice.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTxSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="commissionRuleId">Commission Rule</Label>
              <Select
                value={txForm.commissionRuleId}
                onValueChange={(v) => setTxForm({ ...txForm, commissionRuleId: v })}
              >
                <SelectTrigger id="commissionRuleId">
                  <SelectValue placeholder="Select a rule" />
                </SelectTrigger>
                <SelectContent>
                  {rules?.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.brokerName} —{" "}
                      {r.commissionType === "percentage"
                        ? `${r.commissionRate}%`
                        : formatCurrency(r.commissionRate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="txOrderId">Order ID</Label>
                <Input
                  id="txOrderId"
                  type="number"
                  min="1"
                  placeholder="e.g. 1042"
                  value={txForm.orderId}
                  onChange={(e) => setTxForm({ ...txForm, orderId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="txInvoiceId">Invoice ID</Label>
                <Input
                  id="txInvoiceId"
                  placeholder="e.g. INV-2026-001"
                  value={txForm.invoiceId}
                  onChange={(e) => setTxForm({ ...txForm, invoiceId: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="txOrderAmount">Order Amount *</Label>
                <Input
                  id="txOrderAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={txForm.orderAmount}
                  onChange={(e) => setTxForm({ ...txForm, orderAmount: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="txCommissionAmount">Commission Amount *</Label>
                <Input
                  id="txCommissionAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={txForm.commissionAmount}
                  onChange={(e) => setTxForm({ ...txForm, commissionAmount: e.target.value })}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTxDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createTransaction.isLoading}>
                {createTransaction.isLoading && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
