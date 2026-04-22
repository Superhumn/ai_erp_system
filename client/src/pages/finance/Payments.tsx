import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { CreditCard, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";

const typeOptions = [
  { value: "received", label: "Received", color: "bg-green-500/10 text-green-600" },
  { value: "made", label: "Made", color: "bg-blue-500/10 text-blue-600" },
];

const statusOptions = [
  { value: "pending", label: "Pending", color: "bg-amber-500/8 text-amber-600" },
  { value: "completed", label: "Completed", color: "bg-emerald-500/8 text-emerald-600" },
  { value: "failed", label: "Failed", color: "bg-red-500/8 text-red-600" },
  { value: "cancelled", label: "Cancelled", color: "bg-gray-500/8 text-gray-600" },
];

function PaymentSummaryBody({ p }: { p: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Date</div>
          <div className="font-medium">
            {p.paymentDate ? format(new Date(p.paymentDate), "MMM d, yyyy") : "—"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Method</div>
          <div className="font-medium capitalize">
            {p.paymentMethod?.replace(/_/g, " ") || "—"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Reference</div>
          <div className="font-mono text-sm">{p.referenceNumber || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Amount</div>
          <div className="font-mono font-semibold">{formatCurrency(p.amount)}</div>
        </div>
      </div>
      {p.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
            {p.notes}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Payments() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    type: "received" as "received" | "made",
    amount: "",
    paymentMethod: "bank_transfer" as "bank_transfer" | "check" | "credit_card" | "cash" | "other",
    referenceNumber: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: payments, isLoading } = trpc.payments.list.useQuery();
  const createPayment = trpc.payments.create.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      setIsOpen(false);
      setFormData({ type: "received", amount: "", paymentMethod: "bank_transfer", referenceNumber: "", notes: "" });
      utils.payments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const columns: Column<any>[] = [
    { key: "paymentNumber", header: "Payment #", type: "text", sortable: true },
    { key: "type", header: "Type", type: "badge", options: typeOptions, filterable: true },
    { key: "paymentDate", header: "Date", type: "date", sortable: true },
    {
      key: "paymentMethod",
      header: "Method",
      type: "text",
      render: (_row, val) => (typeof val === "string" ? val.replace(/_/g, " ") : "—"),
    },
    { key: "referenceNumber", header: "Reference", type: "text" },
    { key: "amount", header: "Amount", type: "currency", sortable: true },
    { key: "status", header: "Status", type: "status", options: statusOptions, filterable: true },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPayment.mutate({
      type: formData.type,
      amount: formData.amount,
      paymentMethod: formData.paymentMethod,
      paymentDate: new Date(),
      referenceNumber: formData.referenceNumber || undefined,
      notes: formData.notes || undefined,
    });
  };

  const selectedStatus = selectedPayment
    ? statusOptions.find((s) => s.value === selectedPayment.status)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-8 w-8" />
            Payments
          </h1>
          <p className="text-muted-foreground mt-1">
            Track incoming and outgoing payments — click any row for details.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>Record a new payment transaction.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="made">Made</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Method</Label>
                    <Select
                      value={formData.paymentMethod}
                      onValueChange={(value: any) => setFormData({ ...formData, paymentMethod: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referenceNumber">Reference (Optional)</Label>
                  <Input
                    id="referenceNumber"
                    value={formData.referenceNumber}
                    onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                    placeholder="Check number, transaction ID..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional details..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPayment.isPending}>
                  {createPayment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={(payments || []) as any[]}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No payments yet — record your first payment to get started."
            showSearch
            showFilters
            showExport
            onRowClick={(row) => setSelectedPayment(row)}
            expandedRowId={selectedPayment?.id ?? null}
            compact
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedPayment}
        onOpenChange={(o) => !o && setSelectedPayment(null)}
        width="md"
        title={
          selectedPayment && (
            <span className="flex items-center gap-2 font-mono">
              {selectedPayment.paymentNumber}
              {selectedStatus && <Badge className={selectedStatus.color}>{selectedStatus.label}</Badge>}
            </span>
          )
        }
        subtitle={selectedPayment?.type === "received" ? "Received" : selectedPayment?.type === "made" ? "Made" : undefined}
      >
        {selectedPayment && <PaymentSummaryBody p={selectedPayment} />}
      </DetailSheet>
    </div>
  );
}
