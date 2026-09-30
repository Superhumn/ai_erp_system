import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers/index";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { DetailSheet } from "@/components/DetailSheet";
import { Receipt, Plus, Loader2, Trash2, Sparkles, Check, Ban, Pencil, DollarSign, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { parseDateInput, toDateInputValue } from "@/lib/dateInput";
import { formatCurrency } from "@/lib/format";
import { getStatusColor } from "@/lib/statusColors";
import { safeExternalUrl } from "@/lib/utils";
import {
  BILL_PAYMENT_METHODS,
  BILL_STATUSES,
  billCanApprove,
  billIsOpen,
  billOutstanding,
  billStatusLabel,
  blankToUndefined,
  buildBillPayload,
  lineItemTotal,
  type BillFormState,
  type BillPaymentMethod,
  type BillStatus,
  type LineItemDraft,
} from "@/lib/bills";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type BillRow = RouterOutputs["bills"]["list"][number];
type BillView = BillRow & { outstanding: number };
type VendorRow = RouterOutputs["vendors"]["list"][number];
type AgingSummary = RouterOutputs["bills"]["aging"];
type FromTextResult = RouterOutputs["bills"]["createFromText"];

const FINANCE_ROLES = ["admin", "finance", "exec"];
const EDIT_ROLES = [...FINANCE_ROLES, "ops"];

const BILL_STATUS_COLORS: Record<BillStatus, string> = {
  draft: getStatusColor("draft"),
  pending_approval: "bg-amber-500/10 text-amber-600",
  approved: getStatusColor("approved"),
  scheduled: "bg-blue-500/10 text-blue-600",
  partially_paid: "bg-amber-500/10 text-amber-600",
  paid: getStatusColor("paid"),
  overdue: getStatusColor("overdue"),
  cancelled: getStatusColor("cancelled"),
  disputed: "bg-red-500/10 text-red-600",
};

const MATCH_COLORS: Record<string, string> = {
  matched: "bg-green-500/10 text-green-600",
  variance: "bg-amber-500/10 text-amber-600",
  unmatched: "bg-gray-500/10 text-gray-500",
};

const PAYMENT_METHOD_LABELS: Record<BillPaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  credit_card: "Credit card",
  ach: "ACH",
  wire: "Wire",
  other: "Other",
};

function isBillStatus(value: string): value is BillStatus {
  return (BILL_STATUSES as readonly string[]).includes(value);
}

function isPaymentMethod(value: string): value is BillPaymentMethod {
  return (BILL_PAYMENT_METHODS as readonly string[]).includes(value);
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy");
}

function money(value: string | number | null | undefined, currency: string | null | undefined): string {
  return formatCurrency(value, { currency: currency ?? undefined });
}

function emptyForm(): BillFormState {
  return {
    vendorId: "",
    billNumber: "",
    billDate: toDateInputValue(new Date()),
    dueDate: "",
    totalAmount: "",
    subtotal: "",
    taxAmount: "",
    shippingAmount: "",
    currency: "USD",
    paymentTerms: "",
    autopay: false,
    notes: "",
    lineItems: [],
  };
}

function formFromBill(bill: BillRow): BillFormState {
  return {
    vendorId: String(bill.vendorId),
    billNumber: bill.billNumber ?? "",
    billDate: toDateInputValue(bill.billDate),
    dueDate: toDateInputValue(bill.dueDate),
    totalAmount: bill.totalAmount ?? "",
    subtotal: bill.subtotal ?? "",
    taxAmount: bill.taxAmount ?? "",
    shippingAmount: bill.shippingAmount ?? "",
    currency: bill.currency ?? "USD",
    paymentTerms: bill.paymentTerms ?? "",
    autopay: Boolean((bill as any).autopay),
    notes: bill.notes ?? "",
    lineItems: (bill.lineItems ?? []).map((li) => ({
      description: li.description,
      quantity: String(li.quantity),
      unitPrice: String(li.unitPrice),
    })),
  };
}

function BillStatusBadge({ status }: { status: string | null | undefined }) {
  const cls = status && isBillStatus(status) ? BILL_STATUS_COLORS[status] : getStatusColor(status);
  return <Badge className={cls}>{billStatusLabel(status)}</Badge>;
}

function MatchBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant="outline" className={MATCH_COLORS[status] ?? ""}>{billStatusLabel(status)}</Badge>;
}

// ── Aging tiles ──────────────────────────────────────────────────

function AgingTiles({ aging, isLoading }: { aging: AgingSummary | undefined; isLoading: boolean }) {
  const tiles: { label: string; value: string; accent?: string }[] = [
    { label: "Current", value: formatCurrency(aging?.current ?? 0) },
    { label: "1-30 days", value: formatCurrency(aging?.days1to30 ?? 0) },
    { label: "31-60 days", value: formatCurrency(aging?.days31to60 ?? 0), accent: "text-amber-600" },
    { label: "61-90 days", value: formatCurrency(aging?.days61to90 ?? 0), accent: "text-amber-600" },
    { label: "90+ days", value: formatCurrency(aging?.days90plus ?? 0), accent: "text-red-600" },
    { label: "Total outstanding", value: formatCurrency(aging?.totalOutstanding ?? 0) },
    { label: "Overdue bills", value: String(aging?.overdueCount ?? 0), accent: (aging?.overdueCount ?? 0) > 0 ? "text-red-600" : undefined },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" aria-label="Bills aging summary">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className={`text-lg font-semibold font-mono mt-1 ${t.accent ?? ""}`}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : t.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Detail body ──────────────────────────────────────────────────

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{children}</div>
    </div>
  );
}

function BillDetailBody({ bill }: { bill: BillView }) {
  const attachment = safeExternalUrl(bill.attachmentUrl);
  const lineItems = bill.lineItems ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendor">{bill.vendorName ?? `Vendor #${bill.vendorId}`}</Field>
        <Field label="PO number" mono>{bill.poNumber ?? "—"}</Field>
        <Field label="Bill date">{fmtDate(bill.billDate)}</Field>
        <Field label="Due date">{fmtDate(bill.dueDate)}</Field>
        <Field label="Status"><BillStatusBadge status={bill.status} /></Field>
        <Field label="Match status"><MatchBadge status={bill.matchStatus} /></Field>
        <Field label="Subtotal" mono>{money(bill.subtotal, bill.currency)}</Field>
        <Field label="Tax" mono>{money(bill.taxAmount, bill.currency)}</Field>
        <Field label="Shipping" mono>{money(bill.shippingAmount, bill.currency)}</Field>
        <Field label="Total" mono>{money(bill.totalAmount, bill.currency)}</Field>
        <Field label="Paid" mono>{money(bill.amountPaid, bill.currency)}</Field>
        <Field label="Outstanding" mono>{money(bill.outstanding, bill.currency)}</Field>
        <Field label="Currency" mono>{bill.currency ?? "USD"}</Field>
        <Field label="Payment terms">{bill.paymentTerms ?? "—"}</Field>
        <Field label="Autopay">{(bill as any).autopay ? "Yes" : "No"}</Field>
        <Field label="Source">{billStatusLabel(bill.sourceType)}</Field>
        <Field label="Approved">{fmtDate(bill.approvedAt)}</Field>
        <Field label="Paid at">{fmtDate(bill.paidAt)}</Field>
        <Field label="Created">{fmtDate(bill.createdAt)}</Field>
      </div>

      {attachment && (
        <a
          href={attachment}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View attachment
        </a>
      )}

      <div>
        <h4 className="text-sm font-medium mb-2">Line items</h4>
        {lineItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No line items.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((li, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {li.description}
                      {li.sku && <span className="ml-2 text-xs text-muted-foreground font-mono">{li.sku}</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{li.quantity}{li.unit ? ` ${li.unit}` : ""}</TableCell>
                    <TableCell className="text-right font-mono">{money(li.unitPrice, bill.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{money(li.totalPrice, bill.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {bill.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">{bill.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Create / edit form ───────────────────────────────────────────

function BillFormDialog({
  open,
  onOpenChange,
  vendors,
  initial,
  editing,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: VendorRow[];
  initial: BillFormState;
  editing: boolean;
  isPending: boolean;
  onSubmit: (form: BillFormState) => void;
}) {
  const [form, setForm] = useState<BillFormState>(initial);
  // Reset the draft whenever the dialog is (re)opened with a different bill.
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setForm(initial);
  }

  const set = <K extends keyof BillFormState>(key: K, value: BillFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateLine = (index: number, key: keyof LineItemDraft, value: string) =>
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((li, i) => (i === index ? { ...li, [key]: value } : li)),
    }));
  const addLine = () =>
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, { description: "", quantity: "1", unitPrice: "" }] }));
  const removeLine = (index: number) =>
    setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== index) }));

  const lineSum = form.lineItems.reduce((sum, li) => sum + lineItemTotal(li), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit bill" : "New bill"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the vendor bill details." : "Record a bill received from a vendor."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bill-vendor">Vendor *</Label>
                <Select value={form.vendorId} onValueChange={(v) => set("vendorId", v)}>
                  <SelectTrigger id="bill-vendor" aria-label="Vendor">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-number">Bill number</Label>
                <Input
                  id="bill-number"
                  value={form.billNumber}
                  onChange={(e) => set("billNumber", e.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-date">Bill date *</Label>
                <Input id="bill-date" type="date" value={form.billDate} onChange={(e) => set("billDate", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-due">Due date</Label>
                <Input id="bill-due" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bill-subtotal">Subtotal</Label>
                <Input id="bill-subtotal" type="number" step="0.01" min="0" value={form.subtotal} onChange={(e) => set("subtotal", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-tax">Tax</Label>
                <Input id="bill-tax" type="number" step="0.01" min="0" value={form.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-shipping">Shipping</Label>
                <Input id="bill-shipping" type="number" step="0.01" min="0" value={form.shippingAmount} onChange={(e) => set("shippingAmount", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-total">Total amount *</Label>
                <Input id="bill-total" type="number" step="0.01" min="0" value={form.totalAmount} onChange={(e) => set("totalAmount", e.target.value)} placeholder={lineSum > 0 ? lineSum.toFixed(2) : "0.00"} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bill-currency">Currency</Label>
                <Input id="bill-currency" value={form.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} placeholder="USD" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-terms">Payment terms</Label>
                <Input id="bill-terms" value={form.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Net 30" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill-autopay">Autopay / direct debit</Label>
                <div className="flex items-center gap-2 h-9">
                  <input id="bill-autopay" type="checkbox" className="h-4 w-4" checked={form.autopay} onChange={(e) => set("autopay", e.target.checked)} />
                  <span className="text-xs text-muted-foreground">Leaves the bank on the due date exactly</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                </Button>
              </div>
              {form.lineItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-24">Qty</TableHead>
                        <TableHead className="w-32">Unit price</TableHead>
                        <TableHead className="w-28 text-right">Total</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.lineItems.map((li, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Input className="h-8" aria-label={`Line ${i + 1} description`} value={li.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Description" />
                          </TableCell>
                          <TableCell>
                            <Input className="h-8" aria-label={`Line ${i + 1} quantity`} type="number" step="any" min="0" value={li.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-8" aria-label={`Line ${i + 1} unit price`} type="number" step="0.01" min="0" value={li.unitPrice} onChange={(e) => updateLine(i, "unitPrice", e.target.value)} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(lineItemTotal(li))}</TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => removeLine(i)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {form.lineItems.length > 0 && (
                <div className="text-xs text-muted-foreground text-right">
                  Line total: <span className="font-mono">{formatCurrency(lineSum)}</span>
                  {!form.totalAmount.trim() && " — used as the total amount if left blank"}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-notes">Notes</Label>
              <Textarea id="bill-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Internal notes" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save changes" : "Create bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Section ──────────────────────────────────────────────────────

export function BillsSection() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const isFinance = FINANCE_ROLES.includes(role);
  const canEdit = EDIT_ROLES.includes(role);

  const [statusFilter, setStatusFilter] = useState<"all" | BillStatus>("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [dueAfter, setDueAfter] = useState("");
  const [dueBefore, setDueBefore] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<BillFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", paymentDate: "", paymentMethod: "bank_transfer" as BillPaymentMethod, referenceNumber: "", notes: "" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [text, setText] = useState("");
  const [createMissingVendor, setCreateMissingVendor] = useState(false);
  const [textResult, setTextResult] = useState<FromTextResult | null>(null);

  const listInput = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      vendorId: vendorFilter === "all" ? undefined : Number(vendorFilter),
      dueAfter: parseDateInput(dueAfter),
      dueBefore: parseDateInput(dueBefore),
    }),
    [statusFilter, vendorFilter, dueAfter, dueBefore],
  );

  const utils = trpc.useUtils();
  const agingQuery = trpc.bills.aging.useQuery();
  const listQuery = trpc.bills.list.useQuery(listInput);
  const vendorsQuery = trpc.vendors.list.useQuery();
  const detailQuery = trpc.bills.get.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId != null });

  const bills: BillRow[] = listQuery.data ?? [];
  const vendors: VendorRow[] = vendorsQuery.data ?? [];
  const selectedRow = selectedId != null ? bills.find((b) => b.id === selectedId) ?? null : null;
  const loaded = detailQuery.data;
  const detail: BillView | null = loaded
    ? { ...loaded, outstanding: loaded.outstanding ?? billOutstanding(loaded) }
    : selectedRow
      ? { ...selectedRow, outstanding: billOutstanding(selectedRow) }
      : null;

  const invalidate = (id?: number | null) => {
    void utils.bills.list.invalidate();
    void utils.bills.aging.invalidate();
    if (id != null) void utils.bills.get.invalidate({ id });
  };

  const createBill = trpc.bills.create.useMutation({
    onSuccess: (bill) => {
      toast.success(`Bill ${bill?.billNumber ?? ""} created`.trim());
      setFormOpen(false);
      invalidate(bill?.id);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateBill = trpc.bills.update.useMutation({
    onSuccess: () => {
      toast.success("Bill updated");
      setFormOpen(false);
      invalidate(editingId);
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const approveBill = trpc.bills.approve.useMutation({
    onSuccess: () => {
      toast.success("Bill approved");
      invalidate(selectedId);
    },
    onError: (err) => toast.error(err.message),
  });
  const markPaid = trpc.bills.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayOpen(false);
      invalidate(selectedId);
    },
    onError: (err) => toast.error(err.message),
  });
  const cancelBill = trpc.bills.cancel.useMutation({
    onSuccess: () => {
      toast.success("Bill cancelled");
      setCancelOpen(false);
      setCancelReason("");
      invalidate(selectedId);
    },
    onError: (err) => toast.error(err.message),
  });
  const createFromText = trpc.bills.createFromText.useMutation({
    onSuccess: (result) => {
      toast.success(result.createdVendor ? "Bill drafted and vendor added" : "Bill drafted from text");
      setTextResult(result);
      invalidate(result.bill?.id);
    },
    onError: (err) => toast.error(err.message),
  });

  const openNewForm = () => {
    setEditingId(null);
    setFormInitial(emptyForm());
    setFormOpen(true);
  };
  const openEditForm = (bill: BillRow) => {
    setEditingId(bill.id);
    setFormInitial(formFromBill(bill));
    setFormOpen(true);
  };
  const submitForm = (form: BillFormState) => {
    const result = buildBillPayload(form, parseDateInput);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (editingId != null) updateBill.mutate({ id: editingId, ...result.payload });
    else createBill.mutate(result.payload);
  };

  const openPayDialog = (bill: BillView) => {
    setPay({
      amount: bill.outstanding > 0 ? bill.outstanding.toFixed(2) : "",
      paymentDate: toDateInputValue(new Date()),
      paymentMethod: "bank_transfer",
      referenceNumber: "",
      notes: "",
    });
    setPayOpen(true);
  };
  const submitPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedId == null) return;
    const amountText = pay.amount.trim();
    const amount = amountText ? Number(amountText) : undefined;
    if (amountText && (!Number.isFinite(amount) || (amount ?? 0) <= 0)) {
      toast.error("Amount must be greater than zero");
      return;
    }
    markPaid.mutate({
      id: selectedId,
      amount,
      paymentDate: parseDateInput(pay.paymentDate),
      paymentMethod: pay.paymentMethod,
      referenceNumber: blankToUndefined(pay.referenceNumber),
      notes: blankToUndefined(pay.notes),
    });
  };

  const submitFromText = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 10) {
      toast.error("Paste the bill text first (at least 10 characters)");
      return;
    }
    createFromText.mutate({ text, createMissingVendor });
  };

  const showActions = detail != null && billIsOpen(detail.status);
  const confidencePct =
    textResult && typeof textResult.confidence === "number"
      ? Math.round(textResult.confidence <= 1 ? textResult.confidence * 100 : textResult.confidence)
      : null;

  return (
    <div className="space-y-4">
      <AgingTiles aging={agingQuery.data} isLoading={agingQuery.isLoading} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="bills-status-filter" className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(isBillStatus(v) ? v : "all")}>
            <SelectTrigger id="bills-status-filter" aria-label="Status filter" className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {BILL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{billStatusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bills-vendor-filter" className="text-xs">Vendor</Label>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger id="bills-vendor-filter" aria-label="Vendor filter" className="w-52">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bills-due-after" className="text-xs">Due after</Label>
          <Input id="bills-due-after" type="date" value={dueAfter} onChange={(e) => setDueAfter(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bills-due-before" className="text-xs">Due before</Label>
          <Input id="bills-due-before" type="date" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} className="w-40" />
        </div>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => { setTextResult(null); setTextOpen(true); }}>
              <Sparkles className="h-4 w-4 mr-2" /> From text
            </Button>
            <Button onClick={openNewForm}>
              <Plus className="h-4 w-4 mr-2" /> New bill
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No bills match these filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill date</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>PO #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill) => (
                  <TableRow
                    key={bill.id}
                    onClick={() => setSelectedId(bill.id)}
                    data-selected={selectedId === bill.id ? "true" : undefined}
                    className={`cursor-pointer transition-colors ${selectedId === bill.id ? "bg-muted/60" : "hover:bg-muted/40"}`}
                  >
                    <TableCell className="font-mono font-medium">{bill.billNumber}</TableCell>
                    <TableCell>{bill.vendorName ?? `Vendor #${bill.vendorId}`}</TableCell>
                    <TableCell>{fmtDate(bill.billDate)}</TableCell>
                    <TableCell>{fmtDate(bill.dueDate)}</TableCell>
                    <TableCell className="text-right font-mono">{money(bill.totalAmount, bill.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{money(billOutstanding(bill), bill.currency)}</TableCell>
                    <TableCell><BillStatusBadge status={bill.status} /></TableCell>
                    <TableCell><MatchBadge status={bill.matchStatus} /></TableCell>
                    <TableCell className="font-mono text-sm">{bill.poNumber ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DetailSheet
        open={selectedId != null}
        onOpenChange={(o) => !o && setSelectedId(null)}
        width="lg"
        title={
          detail && (
            <span className="flex items-center gap-2 font-mono">
              {detail.billNumber}
              <BillStatusBadge status={detail.status} />
            </span>
          )
        }
        subtitle={detail ? `${detail.vendorName ?? `Vendor #${detail.vendorId}`} · ${money(detail.outstanding, detail.currency)} outstanding` : undefined}
        footer={
          detail && showActions ? (
            <>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => openEditForm(detail)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                </Button>
              )}
              {isFinance && (
                <Button variant="outline" size="sm" onClick={() => { setCancelReason(""); setCancelOpen(true); }}>
                  <Ban className="h-3.5 w-3.5 mr-1.5" /> Cancel bill
                </Button>
              )}
              {isFinance && billCanApprove(detail.status) && (
                <Button size="sm" onClick={() => approveBill.mutate({ id: detail.id })} disabled={approveBill.isPending}>
                  {approveBill.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                  Approve
                </Button>
              )}
              {isFinance && (
                <Button size="sm" onClick={() => openPayDialog(detail)}>
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" /> Mark paid
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {detail ? <BillDetailBody bill={detail} /> : (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </DetailSheet>

      <BillFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingId(null); }}
        vendors={vendors}
        initial={formInitial}
        editing={editingId != null}
        isPending={createBill.isPending || updateBill.isPending}
        onSubmit={submitForm}
      />

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <form onSubmit={submitPay}>
            <DialogHeader>
              <DialogTitle>Mark bill paid</DialogTitle>
              <DialogDescription>
                Records a payment against {detail?.billNumber ?? "this bill"}. Leave the amount blank to pay the full outstanding balance.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pay-amount">Amount</Label>
                  <Input id="pay-amount" type="number" step="0.01" min="0" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pay-date">Payment date</Label>
                  <Input id="pay-date" type="date" value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-method">Method</Label>
                <Select value={pay.paymentMethod} onValueChange={(v) => { if (isPaymentMethod(v)) setPay({ ...pay, paymentMethod: v }); }}>
                  <SelectTrigger id="pay-method" aria-label="Payment method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILL_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-ref">Reference</Label>
                <Input id="pay-ref" value={pay.referenceNumber} onChange={(e) => setPay({ ...pay, referenceNumber: e.target.value })} placeholder="Check number, transaction ID..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-notes">Notes</Label>
                <Textarea id="pay-notes" rows={2} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={markPaid.isPending}>
                {markPaid.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel bill</DialogTitle>
            <DialogDescription>Cancel {detail?.billNumber ?? "this bill"}. The reason is appended to the bill's notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea id="cancel-reason" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Duplicate, disputed, vendor credit..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep bill</Button>
            <Button
              variant="destructive"
              disabled={cancelBill.isPending || selectedId == null}
              onClick={() => selectedId != null && cancelBill.mutate({ id: selectedId, reason: blankToUndefined(cancelReason) })}
            >
              {cancelBill.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={textOpen} onOpenChange={setTextOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submitFromText}>
            <DialogHeader>
              <DialogTitle>Bill from text</DialogTitle>
              <DialogDescription>Paste an invoice email or OCR text. The parser drafts a bill and matches the vendor by name or email.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bill-text">Bill text</Label>
                <Textarea id="bill-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Invoice #4521 from Acme Supplies... Total due $1,250.00 by Oct 15" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="bill-text-create-vendor" checked={createMissingVendor} onCheckedChange={(c) => setCreateMissingVendor(c === true)} />
                <Label htmlFor="bill-text-create-vendor">Add vendor if missing</Label>
              </div>
              {textResult && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="font-medium flex items-center gap-2">
                    Drafted {textResult.bill?.billNumber ?? "bill"}
                    {confidencePct != null && <Badge variant="outline">{confidencePct}% confidence</Badge>}
                    {textResult.createdVendor && <Badge className="bg-blue-500/10 text-blue-600">Vendor added</Badge>}
                  </div>
                  <div className="text-muted-foreground">
                    {textResult.bill?.vendorName ?? "Vendor"} · {money(textResult.bill?.totalAmount, textResult.bill?.currency)}
                    {textResult.bill?.dueDate ? ` · due ${fmtDate(textResult.bill.dueDate)}` : ""}
                  </div>
                  {textResult.bill && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="px-0 h-auto"
                      onClick={() => {
                        const id = textResult.bill?.id;
                        if (id == null) return;
                        setTextOpen(false);
                        setSelectedId(id);
                      }}
                    >
                      Open bill
                    </Button>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTextOpen(false)}>Close</Button>
              <Button type="submit" disabled={createFromText.isPending}>
                {createFromText.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Draft bill
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Bills() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="h-8 w-8" />
          Bills
        </h1>
        <p className="text-muted-foreground mt-1">
          Vendor bills (accounts payable) — approve, pay, and track what's outstanding. Click any row for details.
        </p>
      </div>
      <BillsSection />
    </div>
  );
}
