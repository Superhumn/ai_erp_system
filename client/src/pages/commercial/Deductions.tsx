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
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, AlertTriangle, Plus, Loader2, FileWarning, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value ?? "0"));
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function generateDeductionNumber() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `DED-${num}`;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-500/10 text-red-600",
  investigating: "bg-yellow-500/10 text-yellow-700",
  approved: "bg-green-500/10 text-green-600",
  partially_approved: "bg-blue-500/10 text-blue-600",
  denied: "bg-gray-500/10 text-gray-500",
  credited: "bg-green-600/10 text-green-700",
  written_off: "bg-gray-400/10 text-gray-400",
};

const TYPE_COLORS: Record<string, string> = {
  shortage: "bg-orange-500/10 text-orange-600",
  quality_claim: "bg-red-500/10 text-red-600",
  pricing_discrepancy: "bg-purple-500/10 text-purple-600",
  damage: "bg-amber-500/10 text-amber-700",
  late_delivery: "bg-blue-500/10 text-blue-600",
  unauthorized_deduction: "bg-rose-500/10 text-rose-600",
  promotion: "bg-teal-500/10 text-teal-600",
  freight_claim: "bg-cyan-500/10 text-cyan-600",
  other: "bg-gray-500/10 text-gray-500",
};

const TYPE_LABELS: Record<string, string> = {
  shortage: "Shortage",
  quality_claim: "Quality Claim",
  pricing_discrepancy: "Pricing Discrepancy",
  damage: "Damage",
  late_delivery: "Late Delivery",
  unauthorized_deduction: "Unauthorized Deduction",
  promotion: "Promotion",
  freight_claim: "Freight Claim",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  investigating: "Investigating",
  approved: "Approved",
  partially_approved: "Partially Approved",
  denied: "Denied",
  credited: "Credited",
  written_off: "Written Off",
};

type DeductionType =
  | "shortage"
  | "quality_claim"
  | "pricing_discrepancy"
  | "damage"
  | "late_delivery"
  | "unauthorized_deduction"
  | "promotion"
  | "freight_claim"
  | "other";

type DeductionStatus =
  | "open"
  | "investigating"
  | "approved"
  | "partially_approved"
  | "denied"
  | "credited"
  | "written_off";

interface CreateFormData {
  deductionNumber: string;
  customerId: string;
  invoiceId: string;
  orderId: string;
  type: DeductionType;
  claimAmount: string;
  description: string;
  lotNumber: string;
  productId: string;
  quantityClaimed: string;
  customerReference: string;
  assignedTo: string;
}

interface UpdateFormData {
  status: DeductionStatus;
  approvedAmount: string;
  rootCause: string;
  resolution: string;
  creditMemoNumber: string;
}

const DEFAULT_CREATE_FORM: CreateFormData = {
  deductionNumber: generateDeductionNumber(),
  customerId: "",
  invoiceId: "",
  orderId: "",
  type: "shortage",
  claimAmount: "",
  description: "",
  lotNumber: "",
  productId: "",
  quantityClaimed: "",
  customerReference: "",
  assignedTo: "",
};

const DEFAULT_UPDATE_FORM: UpdateFormData = {
  status: "open",
  approvedAmount: "",
  rootCause: "",
  resolution: "",
  creditMemoNumber: "",
};

export default function Deductions() {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormData>(DEFAULT_CREATE_FORM);

  const [selectedDeduction, setSelectedDeduction] = useState<any>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState<UpdateFormData>(DEFAULT_UPDATE_FORM);

  const { data: deductions, isLoading, refetch } = trpc.qualityManagement.deductions.list.useQuery();
  const { data: stats } = trpc.qualityManagement.deductions.stats.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();

  const createMutation = trpc.qualityManagement.deductions.create.useMutation({
    onSuccess: () => {
      toast({ title: "Deduction created", description: "The claim has been recorded successfully." });
      setCreateOpen(false);
      setCreateForm({ ...DEFAULT_CREATE_FORM, deductionNumber: generateDeductionNumber() });
      refetch();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = trpc.qualityManagement.deductions.update.useMutation({
    onSuccess: () => {
      toast({ title: "Deduction updated", description: "The claim has been updated successfully." });
      setUpdateOpen(false);
      setSelectedDeduction(null);
      refetch();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredDeductions = deductions?.filter((d: any) => {
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    const matchesType = typeFilter === "all" || d.type === typeFilter;
    const matchesCustomer = customerFilter === "all" || String(d.customerId) === customerFilter;
    const matchesSearch =
      !search ||
      d.deductionNumber?.toLowerCase().includes(search.toLowerCase()) ||
      d.customerReference?.toLowerCase().includes(search.toLowerCase()) ||
      d.description?.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesType && matchesCustomer && matchesSearch;
  });

  function handleRowClick(deduction: any) {
    setSelectedDeduction(deduction);
    setUpdateForm({
      status: deduction.status ?? "open",
      approvedAmount: deduction.approvedAmount ?? "",
      rootCause: deduction.rootCause ?? "",
      resolution: deduction.resolution ?? "",
      creditMemoNumber: deduction.creditMemoNumber ?? "",
    });
    setUpdateOpen(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      deductionNumber: createForm.deductionNumber,
      customerId: createForm.customerId ? Number(createForm.customerId) : undefined,
      invoiceId: createForm.invoiceId ? Number(createForm.invoiceId) : undefined,
      orderId: createForm.orderId ? Number(createForm.orderId) : undefined,
      type: createForm.type,
      claimAmount: createForm.claimAmount,
      description: createForm.description || undefined,
      lotNumber: createForm.lotNumber || undefined,
      productId: createForm.productId ? Number(createForm.productId) : undefined,
      quantityClaimed: createForm.quantityClaimed || undefined,
      customerReference: createForm.customerReference || undefined,
      assignedTo: createForm.assignedTo || undefined,
    });
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      id: selectedDeduction.id,
      status: updateForm.status,
      approvedAmount: updateForm.approvedAmount || undefined,
      rootCause: updateForm.rootCause || undefined,
      resolution: updateForm.resolution || undefined,
      creditMemoNumber: updateForm.creditMemoNumber || undefined,
    });
  }

  const openCount = deductions?.filter((d: any) => d.status === "open").length ?? 0;
  const totalValue = stats?.totalClaimValue ?? deductions?.reduce((sum: number, d: any) => sum + parseFloat(d.claimAmount ?? "0"), 0) ?? 0;
  const approvedValue = stats?.approvedValue ?? deductions?.filter((d: any) => ["approved", "credited", "partially_approved"].includes(d.status)).reduce((sum: number, d: any) => sum + parseFloat(d.approvedAmount ?? d.claimAmount ?? "0"), 0) ?? 0;
  const deniedValue = stats?.deniedValue ?? deductions?.filter((d: any) => d.status === "denied").reduce((sum: number, d: any) => sum + parseFloat(d.claimAmount ?? "0"), 0) ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileWarning className="h-8 w-8" />
            Customer Deductions &amp; Claims
          </h1>
          <p className="text-muted-foreground mt-1">
            Track shortages, quality claims, pricing discrepancies, and other customer deductions.
          </p>
        </div>
        <Button onClick={() => { setCreateForm({ ...DEFAULT_CREATE_FORM, deductionNumber: generateDeductionNumber() }); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Claim
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Claims</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Requiring attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Claim Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">All open &amp; resolved claims</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved / Credited</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(approvedValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Accepted &amp; credited to customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Denied</CardTitle>
            <XCircle className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{formatCurrency(deniedValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Rejected claims</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="claims">
        <TabsList>
          <TabsTrigger value="claims">All Claims</TabsTrigger>
        </TabsList>
        <TabsContent value="claims" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap gap-3 items-center">
                <Input
                  placeholder="Search by deduction #, reference, description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="partially_approved">Partially Approved</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                    <SelectItem value="credited">Credited</SelectItem>
                    <SelectItem value="written_off">Written Off</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="shortage">Shortage</SelectItem>
                    <SelectItem value="quality_claim">Quality Claim</SelectItem>
                    <SelectItem value="pricing_discrepancy">Pricing Discrepancy</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="late_delivery">Late Delivery</SelectItem>
                    <SelectItem value="unauthorized_deduction">Unauthorized Deduction</SelectItem>
                    <SelectItem value="promotion">Promotion</SelectItem>
                    <SelectItem value="freight_claim">Freight Claim</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredDeductions || filteredDeductions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium">No claims found</p>
                  <p className="text-sm mt-1">Adjust your filters or create a new claim.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deduction #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Claim Amount</TableHead>
                      <TableHead className="text-right">Approved Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Claim Date</TableHead>
                      <TableHead>Resolution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeductions.map((d: any) => {
                      const customer = customers?.find((c: any) => c.id === d.customerId);
                      return (
                        <TableRow
                          key={d.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleRowClick(d)}
                        >
                          <TableCell className="font-mono text-sm">{d.deductionNumber}</TableCell>
                          <TableCell className="font-medium">
                            {customer?.name ?? d.customerName ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge className={TYPE_COLORS[d.type] ?? TYPE_COLORS.other} variant="secondary">
                              {TYPE_LABELS[d.type] ?? d.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(d.claimAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {d.approvedAmount ? formatCurrency(d.approvedAmount) : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[d.status] ?? STATUS_COLORS.open} variant="secondary">
                              {STATUS_LABELS[d.status] ?? d.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {d.claimDate
                              ? format(new Date(d.claimDate), "MMM d, yyyy")
                              : d.createdAt
                              ? format(new Date(d.createdAt), "MMM d, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {d.resolution ?? "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Deduction Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New Deduction / Claim</DialogTitle>
              <DialogDescription>
                Record a customer deduction or claim for investigation and resolution.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deductionNumber">Deduction Number *</Label>
                  <Input
                    id="deductionNumber"
                    value={createForm.deductionNumber}
                    onChange={(e) => setCreateForm({ ...createForm, deductionNumber: e.target.value })}
                    placeholder="DED-XXXX"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerReference">Customer Reference</Label>
                  <Input
                    id="customerReference"
                    value={createForm.customerReference}
                    onChange={(e) => setCreateForm({ ...createForm, customerReference: e.target.value })}
                    placeholder="Customer's deduction #"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customerId">Customer *</Label>
                  <Select
                    value={createForm.customerId}
                    onValueChange={(v) => setCreateForm({ ...createForm, customerId: v })}
                  >
                    <SelectTrigger id="customerId">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Claim Type *</Label>
                  <Select
                    value={createForm.type}
                    onValueChange={(v) => setCreateForm({ ...createForm, type: v as DeductionType })}
                  >
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shortage">Shortage</SelectItem>
                      <SelectItem value="quality_claim">Quality Claim</SelectItem>
                      <SelectItem value="pricing_discrepancy">Pricing Discrepancy</SelectItem>
                      <SelectItem value="damage">Damage</SelectItem>
                      <SelectItem value="late_delivery">Late Delivery</SelectItem>
                      <SelectItem value="unauthorized_deduction">Unauthorized Deduction</SelectItem>
                      <SelectItem value="promotion">Promotion</SelectItem>
                      <SelectItem value="freight_claim">Freight Claim</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoiceId">Invoice (optional)</Label>
                  <Input
                    id="invoiceId"
                    value={createForm.invoiceId}
                    onChange={(e) => setCreateForm({ ...createForm, invoiceId: e.target.value })}
                    placeholder="Invoice ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orderId">Order (optional)</Label>
                  <Input
                    id="orderId"
                    value={createForm.orderId}
                    onChange={(e) => setCreateForm({ ...createForm, orderId: e.target.value })}
                    placeholder="Order ID"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="claimAmount">Claim Amount *</Label>
                  <Input
                    id="claimAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={createForm.claimAmount}
                    onChange={(e) => setCreateForm({ ...createForm, claimAmount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantityClaimed">Quantity Claimed</Label>
                  <Input
                    id="quantityClaimed"
                    value={createForm.quantityClaimed}
                    onChange={(e) => setCreateForm({ ...createForm, quantityClaimed: e.target.value })}
                    placeholder="e.g. 10 cases"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productId">Product (optional)</Label>
                  <Select
                    value={createForm.productId}
                    onValueChange={(v) => setCreateForm({ ...createForm, productId: v })}
                  >
                    <SelectTrigger id="productId">
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lotNumber">Lot Number (optional)</Label>
                  <Input
                    id="lotNumber"
                    value={createForm.lotNumber}
                    onChange={(e) => setCreateForm({ ...createForm, lotNumber: e.target.value })}
                    placeholder="Lot / batch #"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedTo">Assigned To</Label>
                <Input
                  id="assignedTo"
                  value={createForm.assignedTo}
                  onChange={(e) => setCreateForm({ ...createForm, assignedTo: e.target.value })}
                  placeholder="Team member name or email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe the claim in detail..."
                  rows={3}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Claim
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Update / Resolve Dialog */}
      <Dialog open={updateOpen} onOpenChange={(open) => { setUpdateOpen(open); if (!open) setSelectedDeduction(null); }}>
        <DialogContent className="max-w-2xl">
          {selectedDeduction && (
            <form onSubmit={handleUpdate}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-base">{selectedDeduction.deductionNumber}</span>
                  <Badge className={STATUS_COLORS[selectedDeduction.status] ?? ""} variant="secondary">
                    {STATUS_LABELS[selectedDeduction.status] ?? selectedDeduction.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Update the status and resolution details for this claim.
                </DialogDescription>
              </DialogHeader>

              {/* Current Details Summary */}
              <div className="rounded-md bg-muted/50 p-3 mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Type: </span>
                  <Badge className={TYPE_COLORS[selectedDeduction.type] ?? ""} variant="secondary">
                    {TYPE_LABELS[selectedDeduction.type] ?? selectedDeduction.type}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Claim Amount: </span>
                  <span className="font-mono font-medium">{formatCurrency(selectedDeduction.claimAmount)}</span>
                </div>
                {selectedDeduction.customerReference && (
                  <div>
                    <span className="text-muted-foreground">Customer Ref: </span>
                    <span>{selectedDeduction.customerReference}</span>
                  </div>
                )}
                {selectedDeduction.claimDate || selectedDeduction.createdAt ? (
                  <div>
                    <span className="text-muted-foreground">Claim Date: </span>
                    <span>{format(new Date(selectedDeduction.claimDate ?? selectedDeduction.createdAt), "MMM d, yyyy")}</span>
                  </div>
                ) : null}
                {selectedDeduction.description && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Description: </span>
                    <span>{selectedDeduction.description}</span>
                  </div>
                )}
                {selectedDeduction.lotNumber && (
                  <div>
                    <span className="text-muted-foreground">Lot: </span>
                    <span className="font-mono">{selectedDeduction.lotNumber}</span>
                  </div>
                )}
                {selectedDeduction.assignedTo && (
                  <div>
                    <span className="text-muted-foreground">Assigned To: </span>
                    <span>{selectedDeduction.assignedTo}</span>
                  </div>
                )}
              </div>

              <div className="grid gap-4 py-4 max-h-[50vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="updateStatus">Status *</Label>
                    <Select
                      value={updateForm.status}
                      onValueChange={(v) => setUpdateForm({ ...updateForm, status: v as DeductionStatus })}
                    >
                      <SelectTrigger id="updateStatus">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="investigating">Investigating</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="partially_approved">Partially Approved</SelectItem>
                        <SelectItem value="denied">Denied</SelectItem>
                        <SelectItem value="credited">Credited</SelectItem>
                        <SelectItem value="written_off">Written Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="approvedAmount">Approved Amount</Label>
                    <Input
                      id="approvedAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={updateForm.approvedAmount}
                      onChange={(e) => setUpdateForm({ ...updateForm, approvedAmount: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="creditMemoNumber">Credit Memo Number</Label>
                  <Input
                    id="creditMemoNumber"
                    value={updateForm.creditMemoNumber}
                    onChange={(e) => setUpdateForm({ ...updateForm, creditMemoNumber: e.target.value })}
                    placeholder="CM-XXXX"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rootCause">Root Cause</Label>
                  <Textarea
                    id="rootCause"
                    value={updateForm.rootCause}
                    onChange={(e) => setUpdateForm({ ...updateForm, rootCause: e.target.value })}
                    placeholder="Describe the root cause of the issue..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resolution">Resolution</Label>
                  <Textarea
                    id="resolution"
                    value={updateForm.resolution}
                    onChange={(e) => setUpdateForm({ ...updateForm, resolution: e.target.value })}
                    placeholder="Describe how the claim was resolved..."
                    rows={2}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setUpdateOpen(false); setSelectedDeduction(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
