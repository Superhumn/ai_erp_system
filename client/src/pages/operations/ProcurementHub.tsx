import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { QuickCreateButton } from "@/components/QuickCreateDialog";
import {
  ShoppingCart,
  Users,
  Package,
  TruckIcon,
  Loader2,
  Send,
  FileText,
  Mail,
  X,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Truck,
  XCircle,
  Bot,
  Sparkles,
  Scale,
  Plug,
  CloudUpload,
  FileSpreadsheet,
  RefreshCw,
  ShoppingBag,
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
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const poStatusOptions = [
  { value: "draft", label: "Draft", color: "bg-muted text-muted-foreground" },
  { value: "sent", label: "Sent", color: "bg-primary/10 text-primary" },
  { value: "confirmed", label: "Confirmed", color: "bg-primary/10 text-primary" },
  { value: "shipped", label: "Shipped", color: "bg-primary/10 text-primary" },
  { value: "received", label: "Received", color: "bg-muted text-muted-foreground" },
  { value: "cancelled", label: "Cancelled", color: "bg-[oklch(0.30_0.02_262)] text-white" },
];

// Vendor Quotes Tab Component
// Incoterms 2020, in increasing order of seller obligation. Mirrors
// INCOTERM_CODES in server/quoteNormalization.ts.
const INCOTERM_OPTIONS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'INR', 'CAD', 'AUD', 'MXN', 'CHF'] as const;

const EMPTY_QUOTE_FORM = {
  vendorId: '',
  unitPrice: '',
  quantity: '',
  totalPrice: '',
  currency: 'USD',
  incoterms: '',
  namedPlace: '',
  minimumOrderQty: '',
  shippingCost: '',
  handlingFee: '',
  insuranceCost: '',
  customsDutyAmount: '',
  taxAmount: '',
  otherCharges: '',
  toolingCost: '',
  toolingAmortizationUnits: '',
  toolingIsRefundable: false,
  leadTimeDays: '',
  validUntil: '',
  paymentTerms: '',
  notes: '',
};

function VendorQuotesTab({ vendors, rawMaterials }: { vendors: any[]; rawMaterials: any[] }) {
  const utils = trpc.useUtils();
  const [activeSubTab, setActiveSubTab] = useState<'rfqs' | 'quotes'>('rfqs');
  const [isCreateRfqOpen, setIsCreateRfqOpen] = useState(false);
  const [selectedRfqId, setSelectedRfqId] = useState<number | null>(null);
  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [isEnterQuoteOpen, setIsEnterQuoteOpen] = useState(false);
  const [isFxRatesOpen, setIsFxRatesOpen] = useState(false);
  const [fxPaste, setFxPaste] = useState('');
  const [fxForm, setFxForm] = useState({ fromCurrency: 'EUR', toCurrency: 'USD', rate: '', asOf: '' });
  const [quoteForm, setQuoteForm] = useState(EMPTY_QUOTE_FORM);
  const [rfqForm, setRfqForm] = useState({
    materialName: '',
    rawMaterialId: '',
    materialDescription: '',
    quantity: '',
    unit: 'kg',
    specifications: '',
    requiredDeliveryDate: '',
    deliveryLocation: '',
    quoteDueDate: '',
    priority: 'normal',
    notes: '',
    // Comparison basis — how quotes on this RFQ get leveled against each other.
    baseCurrency: 'USD',
    targetIncoterms: 'DDP',
    freightAllowancePerUnit: '',
    freightAllowancePct: '',
    dutyRatePct: '',
    insuranceRatePct: '',
    amortizeToolingOverUnits: '',
  });

  // Queries
  const { data: rfqs, isLoading: rfqsLoading } = trpc.vendorQuotes.rfqs.list.useQuery();
  const { data: quotes, isLoading: quotesLoading } = trpc.vendorQuotes.quotes.list.useQuery();
  const { data: selectedRfqQuotes } = trpc.vendorQuotes.quotes.getWithVendorInfo.useQuery(
    { rfqId: selectedRfqId! },
    { enabled: !!selectedRfqId }
  );
  const { data: selectedRfqInvitations } = trpc.vendorQuotes.rfqs.getInvitations.useQuery(
    { rfqId: selectedRfqId! },
    { enabled: !!selectedRfqId }
  );
  // Quotes joined to freshly computed landed costs, so the table never shows a
  // stale rank after an FX rate or an allowance rate changes.
  const { data: comparison } = trpc.vendorQuotes.quotes.comparison.useQuery(
    { rfqId: selectedRfqId! },
    { enabled: !!selectedRfqId }
  );

  // Mutations
  const createRfq = trpc.vendorQuotes.rfqs.create.useMutation({
    onSuccess: () => {
      toast.success('RFQ created successfully');
      utils.vendorQuotes.rfqs.list.invalidate();
      setIsCreateRfqOpen(false);
      setRfqForm({ materialName: '', rawMaterialId: '', materialDescription: '', quantity: '', unit: 'kg', specifications: '', requiredDeliveryDate: '', deliveryLocation: '', quoteDueDate: '', priority: 'normal', notes: '', baseCurrency: 'USD', targetIncoterms: 'DDP', freightAllowancePerUnit: '', freightAllowancePct: '', dutyRatePct: '', insuranceRatePct: '', amortizeToolingOverUnits: '' });
    },
    onError: (err) => toast.error(err.message),
  });

  const sendToVendors = trpc.vendorQuotes.rfqs.sendToVendors.useMutation({
    onSuccess: (result) => {
      if (result.emailConfigured) {
        toast.success(`RFQ sent to ${result.sent} vendors`);
      } else {
        toast.info(`Email drafts created for ${result.sent + result.failed} vendors (SendGrid not configured)`);
      }
      utils.vendorQuotes.rfqs.list.invalidate();
      utils.vendorQuotes.rfqs.getInvitations.invalidate();
      setSelectedVendorIds([]);
    },
    onError: (err) => toast.error(err.message),
  });

  const sendReminder = trpc.vendorQuotes.rfqs.sendReminder.useMutation({
    onSuccess: () => {
      toast.success('Reminder sent');
      utils.vendorQuotes.rfqs.getInvitations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createQuote = trpc.vendorQuotes.quotes.create.useMutation({
    onSuccess: () => {
      toast.success('Quote recorded successfully');
      utils.vendorQuotes.quotes.list.invalidate();
      utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
      utils.vendorQuotes.rfqs.list.invalidate();
      setIsEnterQuoteOpen(false);
      setQuoteForm(EMPTY_QUOTE_FORM);
    },
    onError: (err) => toast.error(err.message),
  });

  const acceptQuote = trpc.vendorQuotes.quotes.accept.useMutation({
    onSuccess: (result) => {
      toast.success(result.poId ? `Quote accepted and PO #${result.poId} created` : 'Quote accepted');
      utils.vendorQuotes.quotes.list.invalidate();
      utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
      utils.vendorQuotes.rfqs.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectQuote = trpc.vendorQuotes.quotes.reject.useMutation({
    onSuccess: () => {
      toast.success('Quote rejected');
      utils.vendorQuotes.quotes.list.invalidate();
      utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const levelBids = trpc.vendorQuotes.quotes.levelBids.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Leveled ${res.leveledCount} quote${res.leveledCount === 1 ? '' : 's'} to ${res.basis.baseCurrency} / ${res.basis.targetIncoterm}` +
        (res.excludedCount > 0 ? ` (${res.excludedCount} excluded from ranking)` : ''),
      );
      utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
      utils.vendorQuotes.rfqs.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: fxRates } = trpc.currency.list.useQuery(undefined, { enabled: isFxRatesOpen });

  const upsertFxRate = trpc.currency.upsert.useMutation({
    onSuccess: () => {
      toast.success('Rate saved');
      utils.currency.list.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
      setFxForm({ fromCurrency: 'EUR', toCurrency: 'USD', rate: '', asOf: '' });
    },
    onError: (err) => toast.error(err.message),
  });

  const removeFxRate = trpc.currency.remove.useMutation({
    onSuccess: () => {
      toast.success('Rate removed');
      utils.currency.list.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: fxFeedConfig } = trpc.currency.feedConfig.useQuery(undefined, { enabled: isFxRatesOpen });

  // Pulls ECB reference rates. Rates entered by hand are left alone — see
  // server/fxFeed.ts for why a typed rate outranks a published one.
  const refreshFxFeed = trpc.currency.refreshFromFeed.useMutation({
    onSuccess: (res: any) => {
      const day = new Date(res.asOf).toISOString().slice(0, 10);
      toast.success(
        `Stored ${res.written.length} rate${res.written.length === 1 ? '' : 's'} as of ${day}` +
        (res.skippedManual.length > 0
          ? ` — kept ${res.skippedManual.length} you had entered by hand`
          : ''),
      );
      utils.currency.list.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const testFxFeed = trpc.currency.testFeed.useMutation({
    onSuccess: (res: any) => {
      if (res.ok) {
        toast.success(
          `Feed reachable — ${res.currencyCount} currencies as of ${new Date(res.asOf).toISOString().slice(0, 10)}`,
        );
      } else {
        toast.error(res.error, { description: res.detail });
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const importFxPaste = trpc.currency.importPaste.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Imported ${res.count} rate${res.count === 1 ? '' : 's'}`);
      setFxPaste('');
      utils.currency.list.invalidate();
      utils.vendorQuotes.quotes.comparison.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const normalizeQuotes = trpc.vendorQuotes.quotes.normalize.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Recomputed landed cost for ${res.comparableCount} quote${res.comparableCount === 1 ? '' : 's'}` +
        (res.excludedCount > 0 ? ` — ${res.excludedCount} could not be put on the common basis` : ''),
      );
      utils.vendorQuotes.quotes.comparison.invalidate();
      utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedRfq = rfqs?.find((r: any) => r.id === selectedRfqId);

  const rfqColumns: Column<any>[] = [
    { key: 'rfqNumber', header: 'RFQ #', type: 'text', width: '120px' },
    { key: 'materialName', header: 'Material', type: 'text', width: '200px' },
    { key: 'quantity', header: 'Qty', type: 'number', width: '100px', render: (v, row) => `${v} ${row.unit}` },
    { key: 'status', header: 'Status', type: 'text', width: '120px', render: (v) => {
      const colors: Record<string, string> = {
        draft: 'bg-muted text-muted-foreground',
        sent: 'bg-primary/10 text-primary',
        partially_received: 'bg-muted text-foreground font-semibold',
        all_received: 'bg-muted text-muted-foreground',
        awarded: 'bg-primary/10 text-primary',
        cancelled: 'bg-[oklch(0.30_0.02_262)] text-white',
      };
      return <Badge className={colors[v] || 'bg-muted text-muted-foreground'}>{v?.replace(/_/g, ' ')}</Badge>;
    }},
    { key: 'quoteDueDate', header: 'Due Date', type: 'date', width: '120px', render: (v) => formatDate(v) },
    { key: 'createdAt', header: 'Created', type: 'date', width: '120px', render: (v) => formatDate(v) },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs for RFQs vs All Quotes */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={activeSubTab === 'rfqs' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubTab('rfqs')}
          >
            <FileText className="h-4 w-4 mr-1" />
            RFQs ({rfqs?.length || 0})
          </Button>
          <Button
            variant={activeSubTab === 'quotes' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubTab('quotes')}
          >
            <DollarSign className="h-4 w-4 mr-1" />
            All Quotes ({quotes?.length || 0})
          </Button>
        </div>
        <Button onClick={() => setIsCreateRfqOpen(true)}>
          <Mail className="h-4 w-4 mr-1" />
          Create RFQ
        </Button>
      </div>

      {activeSubTab === 'rfqs' && (
        <div className="grid grid-cols-3 gap-4">
          {/* RFQ List */}
          <Card className="col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Request for Quotes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto">
                {rfqsLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : rfqs?.length === 0 ? (
                  <div className="text-center text-muted-foreground p-8">
                    No RFQs yet. Create one to get started.
                  </div>
                ) : (
                  rfqs?.map((rfq: any) => (
                    <div
                      key={rfq.id}
                      className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${selectedRfqId === rfq.id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedRfqId(rfq.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{rfq.rfqNumber}</span>
                        <Badge variant="outline" className="text-xs">
                          {rfq.status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{rfq.materialName}</div>
                      <div className="text-xs text-muted-foreground">{rfq.quantity} {rfq.unit}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* RFQ Detail & Quotes */}
          <Card className="col-span-2">
            <CardContent className="p-4">
              {selectedRfq ? (
                <div className="space-y-4">
                  {/* RFQ Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedRfq.rfqNumber}</h3>
                      <p className="text-sm text-muted-foreground">{selectedRfq.materialName}</p>
                    </div>
                    <div className="flex gap-2">
                      {selectedRfq.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (selectedVendorIds.length === 0) {
                              toast.error('Select vendors to send RFQ');
                              return;
                            }
                            sendToVendors.mutate({ rfqId: selectedRfq.id, vendorIds: selectedVendorIds });
                          }}
                          disabled={sendToVendors.isPending}
                        >
                          {sendToVendors.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                          <Send className="h-4 w-4 mr-1" />
                          Send to Vendors
                        </Button>
                      )}
                      {['sent', 'partially_received'].includes(selectedRfq.status) && (
                        <Button size="sm" variant="outline" onClick={() => setIsEnterQuoteOpen(true)}>
                          <DollarSign className="h-4 w-4 mr-1" />
                          Enter Quote
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* RFQ Details */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-xs text-muted-foreground">Quantity</div>
                      <div className="font-semibold">{selectedRfq.quantity} {selectedRfq.unit}</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-xs text-muted-foreground">Due Date</div>
                      <div className="font-semibold">{formatDate(selectedRfq.quoteDueDate)}</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-xs text-muted-foreground">Delivery Date</div>
                      <div className="font-semibold">{formatDate(selectedRfq.requiredDeliveryDate)}</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-xs text-muted-foreground">Priority</div>
                      <div className="font-semibold capitalize">{selectedRfq.priority || 'Normal'}</div>
                    </div>
                  </div>

                  {/* Vendor Selection (for draft RFQs) */}
                  {selectedRfq.status === 'draft' && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Select Vendors to Invite</h4>
                      <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto">
                        {vendors.map((vendor: any) => (
                          <label
                            key={vendor.id}
                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 ${selectedVendorIds.includes(vendor.id) ? 'border-primary bg-primary/5' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedVendorIds.includes(vendor.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedVendorIds([...selectedVendorIds, vendor.id]);
                                } else {
                                  setSelectedVendorIds(selectedVendorIds.filter(id => id !== vendor.id));
                                }
                              }}
                              className="rounded"
                            />
                            <div>
                              <div className="text-sm font-medium">{vendor.name}</div>
                              <div className="text-xs text-muted-foreground">{vendor.email}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Invited Vendors Status */}
                  {selectedRfq.status !== 'draft' && selectedRfqInvitations && selectedRfqInvitations.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Invited Vendors</h4>
                      <div className="space-y-2">
                        {selectedRfqInvitations.map((inv: any) => (
                          <div key={inv.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                            <div>
                              <div className="text-sm font-medium">{inv.vendor?.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Invited: {formatDate(inv.invitedAt)}
                                {inv.reminderCount > 0 && ` • ${inv.reminderCount} reminder(s) sent`}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {inv.status === 'responded' ? 'Quoted' : inv.status}
                              </Badge>
                              {inv.status === 'sent' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => sendReminder.mutate({ rfqId: selectedRfq.id, vendorId: inv.vendorId })}
                                  disabled={sendReminder.isPending}
                                >
                                  <Mail className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Received Quotes — side by side on one leveled basis */}
                  {comparison && comparison.rows.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">Received Quotes ({comparison.rows.length})</h4>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => normalizeQuotes.mutate({ rfqId: selectedRfq.id })}
                            disabled={normalizeQuotes.isPending}
                          >
                            {normalizeQuotes.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Scale className="h-3.5 w-3.5 mr-1" />
                            )}
                            Recompute Landed Cost
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => levelBids.mutate({ rfqId: selectedRfq.id })}
                            disabled={levelBids.isPending}
                          >
                            {levelBids.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 mr-1" />
                            )}
                            Level Bids (AI)
                          </Button>
                        </div>
                      </div>

                      {/* The basis every landed cost below was computed against. */}
                      <div className="mb-2 rounded border bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Comparison basis:</span>{' '}
                        {comparison.basis.baseCurrency} · leveled to {comparison.basis.targetIncoterm} ·{' '}
                        freight {comparison.basis.freightAllowancePerUnit != null
                          ? `${comparison.basis.freightAllowancePerUnit}/unit`
                          : comparison.basis.freightAllowancePct != null
                            ? `${comparison.basis.freightAllowancePct}% of goods`
                            : 'not set'} ·{' '}
                        duty {comparison.basis.dutyRatePct != null ? `${comparison.basis.dutyRatePct}%` : 'not set'} ·{' '}
                        insurance {comparison.basis.insuranceRatePct != null ? `${comparison.basis.insuranceRatePct}%` : 'not set'} ·{' '}
                        tooling over {comparison.basis.amortizeToolingOverUnits != null
                          ? `${comparison.basis.amortizeToolingOverUnits} units`
                          : 'this order only'}
                        {comparison.excludedCount > 0 && (
                          <span className="ml-1 text-foreground">
                            · {comparison.excludedCount} quote{comparison.excludedCount === 1 ? '' : 's'} excluded from ranking
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="link"
                          className="h-auto p-0 ml-2 text-xs"
                          onClick={() => setIsFxRatesOpen(true)}
                        >
                          FX rates
                        </Button>
                      </div>

                      {selectedRfq.levelingSummary && (
                        <div className="mb-2 rounded border border-primary/20 bg-primary/10 p-2 text-xs text-foreground">
                          <div className="flex items-center gap-1 font-medium mb-0.5">
                            <Sparkles className="h-3.5 w-3.5" /> Bid leveling summary
                          </div>
                          <p className="whitespace-pre-wrap">{selectedRfq.levelingSummary}</p>
                        </div>
                      )}

                      <div className="border rounded overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left px-1.5 py-1">Rank</th>
                              <th className="text-left px-1.5 py-1">Vendor</th>
                              <th className="text-right px-1.5 py-1">Unit Price</th>
                              <th className="text-center px-1.5 py-1">Ccy</th>
                              <th className="text-center px-1.5 py-1">Incoterm</th>
                              <th className="text-right px-1.5 py-1">MOQ</th>
                              <th className="text-right px-1.5 py-1">Tooling/unit</th>
                              <th className="text-right px-1.5 py-1">Landed Total</th>
                              <th className="text-right px-1.5 py-1">Landed/unit</th>
                              <th className="text-center px-1.5 py-1">Flags</th>
                              <th className="text-center px-1.5 py-1">Lead Time</th>
                              <th className="text-center px-1.5 py-1">Valid Until</th>
                              <th className="text-center px-1.5 py-1">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparison.rows.map((row: any) => {
                              const quote = row.quote;
                              const n = row.normalized;
                              const deviations: any[] = (() => {
                                try { return quote.scopeDeviations ? JSON.parse(quote.scopeDeviations) : []; }
                                catch { return []; }
                              })();
                              const highSeverity = deviations.some((d: any) => d.severity === 'high');
                              const understated = (n?.warnings ?? []).filter((w: any) => w.understatesCost);
                              const isBest = n?.rank === 1;
                              return (
                              <tr key={quote.id} className={`border-t ${isBest ? 'bg-primary/10' : ''}`}>
                                <td className="px-1.5 py-0.5">
                                  {isBest ? (
                                    <Badge className="bg-primary text-primary-foreground">Best</Badge>
                                  ) : n?.rank ? (
                                    <span className="text-muted-foreground">#{n.rank}</span>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-foreground font-semibold"
                                      title={(n?.warnings ?? []).map((w: any) => w.message).join('\n') || 'Not comparable'}
                                    >
                                      n/c
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-1.5 py-0.5 font-medium">{row.vendor?.name ?? `Vendor ${quote.vendorId}`}</td>
                                <td className="px-1.5 py-0.5 text-right font-mono">
                                  {quote.unitPrice != null ? Number(quote.unitPrice).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-'}
                                </td>
                                <td className="px-1.5 py-0.5 text-center">
                                  {/* FX provenance matters as much as the converted number. */}
                                  <span
                                    className={n?.fx && n.fx.rate !== 1 ? 'underline decoration-dotted' : ''}
                                    title={n?.fx && n.fx.rate !== 1
                                      ? `1 ${n.quoteCurrency} = ${n.fx.rate} ${n.baseCurrency} (${n.fx.source}, ${n.fx.provider}, as of ${formatDate(n.fx.asOf)})`
                                      : undefined}
                                  >
                                    {n?.quoteCurrency ?? quote.currency ?? '-'}
                                  </span>
                                </td>
                                <td className="px-1.5 py-0.5 text-center">
                                  {n?.incoterms?.quoted ? (
                                    <span title={n.incoterms.gaps.length > 0
                                      ? `Buyer covers: ${n.incoterms.gaps.join(', ')}`
                                      : `Meets the ${n.incoterms.target} basis`}>
                                      {n.incoterms.quoted}
                                      {n.incoterms.namedPlace ? ` ${n.incoterms.namedPlace}` : ''}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="px-1.5 py-0.5 text-right font-mono">
                                  {quote.minimumOrderQty != null ? (
                                    <span
                                      className={n?.moqShortfallUnits > 0 ? 'text-foreground font-semibold' : ''}
                                      title={n?.moqShortfallUnits > 0
                                        ? `${n.moqShortfallUnits} surplus units above the ${n.requiredQuantity} required`
                                        : undefined}
                                    >
                                      {Number(quote.minimumOrderQty).toLocaleString()}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="px-1.5 py-0.5 text-right font-mono">
                                  {n?.toolingPerUnit ? n.toolingPerUnit.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-'}
                                </td>
                                <td className="px-1.5 py-0.5 text-right font-mono font-semibold">
                                  {n?.landedTotalCost != null ? (
                                    // Landed cost is in the RFQ's base currency, which is
                                    // not necessarily USD.
                                    <span title={n.breakdown.map((b: any) => `${b.label}: ${b.amount} ${n.quoteCurrency}`).join('\n')}>
                                      {formatCurrency(n.landedTotalCost, { currency: n.baseCurrency })}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="px-1.5 py-0.5 text-right font-mono">
                                  {n?.landedUnitCost != null
                                    ? n.landedUnitCost.toLocaleString(undefined, { maximumFractionDigits: 4 })
                                    : <span className="text-muted-foreground">-</span>}
                                </td>
                                <td className="px-1.5 py-0.5 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {understated.length > 0 && (
                                      <Badge
                                        variant="outline"
                                        className="text-foreground font-semibold"
                                        title={understated.map((w: any) => w.message).join('\n')}
                                      >
                                        under
                                      </Badge>
                                    )}
                                    {quote.leveledAt && deviations.length > 0 && (
                                      <Badge
                                        variant={highSeverity ? 'destructive' : 'outline'}
                                        className={highSeverity ? '!bg-[oklch(0.30_0.02_262)] !text-white !border-transparent font-semibold' : 'text-foreground font-semibold'}
                                        title={deviations.map((d: any) => `${d.requirement}: ${d.finding} (${d.severity})`).join('\n')}
                                      >
                                        {deviations.length}
                                      </Badge>
                                    )}
                                    {quote.leveledAt && deviations.length === 0 && understated.length === 0 && (
                                      <Badge variant="outline" className="text-muted-foreground">OK</Badge>
                                    )}
                                    {!quote.leveledAt && understated.length === 0 && (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-1.5 py-0.5 text-center">{quote.leadTimeDays ? `${quote.leadTimeDays} days` : '-'}</td>
                                <td className="px-1.5 py-0.5 text-center">{formatDate(quote.validUntil)}</td>
                                <td className="px-1.5 py-0.5 text-center">
                                  {quote.status === 'received' && (
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-primary hover:text-primary/80"
                                        onClick={() => acceptQuote.mutate({ id: quote.id, createPO: true })}
                                        disabled={acceptQuote.isPending}
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-foreground hover:text-foreground/80"
                                        onClick={() => rejectQuote.mutate({ id: quote.id, sendNotification: true })}
                                        disabled={rejectQuote.isPending}
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                  {quote.status === 'accepted' && <Badge className="bg-primary text-primary-foreground">Accepted</Badge>}
                                  {quote.status === 'rejected' && <Badge variant="destructive" className="!bg-[oklch(0.30_0.02_262)] !text-white">Rejected</Badge>}
                                  {quote.status === 'converted_to_po' && <Badge className="bg-muted text-foreground font-medium">PO Created</Badge>}
                                </td>
                              </tr>
                            );})}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Select an RFQ to view details and quotes
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeSubTab === 'quotes' && (
        <Card>
          <CardContent className="pt-6">
            {quotesLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : quotes?.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">
                No quotes received yet.
              </div>
            ) : (
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-1.5 py-1">Quote #</th>
                      <th className="text-left px-1.5 py-1">RFQ</th>
                      <th className="text-left px-1.5 py-1">Vendor</th>
                      <th className="text-right px-1.5 py-1">Unit Price</th>
                      <th className="text-right px-1.5 py-1">Total</th>
                      <th className="text-center px-1.5 py-1">Status</th>
                      <th className="text-center px-1.5 py-1">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes?.map((quote: any) => {
                      const rfq = rfqs?.find((r: any) => r.id === quote.rfqId);
                      const vendor = vendors.find((v: any) => v.id === quote.vendorId);
                      return (
                        <tr key={quote.id} className="border-t hover:bg-muted/50">
                          <td className="px-1.5 py-0.5 font-mono">{quote.quoteNumber || `Q-${quote.id}`}</td>
                          <td className="px-1.5 py-0.5">{rfq?.rfqNumber || '-'}</td>
                          <td className="px-1.5 py-0.5 font-medium">{vendor?.name || '-'}</td>
                          <td className="px-1.5 py-0.5 text-right font-mono">{formatCurrency(quote.unitPrice)}</td>
                          <td className="px-1.5 py-0.5 text-right font-mono font-semibold">{formatCurrency(quote.totalPrice)}</td>
                          <td className="px-1.5 py-0.5 text-center">
                            <Badge variant="outline">{quote.status}</Badge>
                          </td>
                          <td className="px-1.5 py-0.5 text-center text-muted-foreground">{formatDate(quote.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create RFQ Dialog */}
      <Dialog open={isCreateRfqOpen} onOpenChange={setIsCreateRfqOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Request for Quote</DialogTitle>
            <DialogDescription>Send an RFQ to vendors for material pricing</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Material *</Label>
              <Select
                value={rfqForm.rawMaterialId}
                onValueChange={(v) => {
                  const mat = rawMaterials.find((m: any) => m.id.toString() === v);
                  setRfqForm({
                    ...rfqForm,
                    rawMaterialId: v,
                    materialName: mat?.name || '',
                    unit: mat?.unit || 'kg',
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select material or enter custom" />
                </SelectTrigger>
                <SelectContent>
                  {rawMaterials.map((m: any) => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.name} ({m.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!rfqForm.rawMaterialId && (
                <Input
                  className="mt-2"
                  placeholder="Or enter custom material name"
                  value={rfqForm.materialName}
                  onChange={(e) => setRfqForm({ ...rfqForm, materialName: e.target.value })}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={rfqForm.quantity}
                  onChange={(e) => setRfqForm({ ...rfqForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={rfqForm.unit} onValueChange={(v) => setRfqForm({ ...rfqForm, unit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lbs">lbs</SelectItem>
                    <SelectItem value="units">units</SelectItem>
                    <SelectItem value="cases">cases</SelectItem>
                    <SelectItem value="pallets">pallets</SelectItem>
                    <SelectItem value="liters">liters</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Specifications</Label>
              <Textarea
                value={rfqForm.specifications}
                onChange={(e) => setRfqForm({ ...rfqForm, specifications: e.target.value })}
                placeholder="Quality requirements, certifications, etc."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quote Due Date</Label>
                <Input
                  type="date"
                  value={rfqForm.quoteDueDate}
                  onChange={(e) => setRfqForm({ ...rfqForm, quoteDueDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Required Delivery Date</Label>
                <Input
                  type="date"
                  value={rfqForm.requiredDeliveryDate}
                  onChange={(e) => setRfqForm({ ...rfqForm, requiredDeliveryDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={rfqForm.priority} onValueChange={(v) => setRfqForm({ ...rfqForm, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* How quotes on this RFQ will be leveled against each other. */}
            <div className="rounded border p-3 space-y-3">
              <div>
                <Label className="text-sm font-medium">Comparison basis</Label>
                <p className="text-xs text-muted-foreground">
                  Quotes are converted to this currency and topped up to this Incoterm before ranking.
                  Leave an allowance blank and any gap it would cover is reported as unpriced rather than guessed.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Base currency</Label>
                  <Select value={rfqForm.baseCurrency} onValueChange={(v) => setRfqForm({ ...rfqForm, baseCurrency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Level to Incoterm</Label>
                  <Select value={rfqForm.targetIncoterms} onValueChange={(v) => setRfqForm({ ...rfqForm, targetIncoterms: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCOTERM_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Freight allowance / unit</Label>
                  <Input type="number" step="0.0001" placeholder="e.g., 0.15"
                    value={rfqForm.freightAllowancePerUnit}
                    onChange={(e) => setRfqForm({ ...rfqForm, freightAllowancePerUnit: e.target.value })} />
                </div>
                <div>
                  <Label>…or freight as % of goods</Label>
                  <Input type="number" step="0.001" placeholder="e.g., 8"
                    value={rfqForm.freightAllowancePct}
                    onChange={(e) => setRfqForm({ ...rfqForm, freightAllowancePct: e.target.value })} />
                </div>
                <div>
                  <Label>Duty rate %</Label>
                  <Input type="number" step="0.001" placeholder="e.g., 6"
                    value={rfqForm.dutyRatePct}
                    onChange={(e) => setRfqForm({ ...rfqForm, dutyRatePct: e.target.value })} />
                </div>
                <div>
                  <Label>Insurance rate %</Label>
                  <Input type="number" step="0.001" placeholder="e.g., 0.5"
                    value={rfqForm.insuranceRatePct}
                    onChange={(e) => setRfqForm({ ...rfqForm, insuranceRatePct: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Amortize tooling over (units)</Label>
                <Input type="number" step="0.0001" placeholder="Program volume — blank charges tooling to this order alone"
                  value={rfqForm.amortizeToolingOverUnits}
                  onChange={(e) => setRfqForm({ ...rfqForm, amortizeToolingOverUnits: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateRfqOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!rfqForm.materialName || !rfqForm.quantity) {
                  toast.error('Material and quantity are required');
                  return;
                }
                createRfq.mutate({
                  materialName: rfqForm.materialName,
                  rawMaterialId: rfqForm.rawMaterialId ? parseInt(rfqForm.rawMaterialId) : undefined,
                  materialDescription: rfqForm.materialDescription || undefined,
                  quantity: rfqForm.quantity,
                  unit: rfqForm.unit,
                  specifications: rfqForm.specifications || undefined,
                  requiredDeliveryDate: rfqForm.requiredDeliveryDate ? new Date(rfqForm.requiredDeliveryDate) : undefined,
                  deliveryLocation: rfqForm.deliveryLocation || undefined,
                  quoteDueDate: rfqForm.quoteDueDate ? new Date(rfqForm.quoteDueDate) : undefined,
                  priority: rfqForm.priority as any,
                  notes: rfqForm.notes || undefined,
                  baseCurrency: rfqForm.baseCurrency || undefined,
                  targetIncoterms: rfqForm.targetIncoterms || undefined,
                  freightAllowancePerUnit: rfqForm.freightAllowancePerUnit || undefined,
                  freightAllowancePct: rfqForm.freightAllowancePct || undefined,
                  dutyRatePct: rfqForm.dutyRatePct || undefined,
                  insuranceRatePct: rfqForm.insuranceRatePct || undefined,
                  amortizeToolingOverUnits: rfqForm.amortizeToolingOverUnits || undefined,
                });
              }}
              disabled={createRfq.isPending}
            >
              {createRfq.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create RFQ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enter Quote Dialog */}
      <Dialog open={isEnterQuoteOpen} onOpenChange={setIsEnterQuoteOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter Vendor Quote</DialogTitle>
            <DialogDescription>Record a quote received from a vendor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendor *</Label>
              <Select value={quoteForm.vendorId} onValueChange={(v) => setQuoteForm({ ...quoteForm, vendorId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {selectedRfqInvitations?.map((inv: any) => (
                    <SelectItem key={inv.vendorId} value={inv.vendorId.toString()}>
                      {inv.vendor?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unit Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={quoteForm.unitPrice}
                  onChange={(e) => {
                    const unitPrice = e.target.value;
                    const qty = selectedRfq?.quantity || quoteForm.quantity;
                    const total = unitPrice && qty ? (parseFloat(unitPrice) * parseFloat(qty)).toFixed(2) : '';
                    setQuoteForm({ ...quoteForm, unitPrice, totalPrice: total });
                  }}
                />
              </div>
              <div>
                <Label>Total Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={quoteForm.totalPrice}
                  onChange={(e) => setQuoteForm({ ...quoteForm, totalPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Currency</Label>
                <Select value={quoteForm.currency} onValueChange={(v) => setQuoteForm({ ...quoteForm, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Incoterm</Label>
                <Select value={quoteForm.incoterms} onValueChange={(v) => setQuoteForm({ ...quoteForm, incoterms: v })}>
                  <SelectTrigger><SelectValue placeholder="As quoted" /></SelectTrigger>
                  <SelectContent>
                    {INCOTERM_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Named Place</Label>
                <Input
                  value={quoteForm.namedPlace}
                  onChange={(e) => setQuoteForm({ ...quoteForm, namedPlace: e.target.value })}
                  placeholder="e.g., Ningbo"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Minimum Order Qty</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={quoteForm.minimumOrderQty}
                  onChange={(e) => setQuoteForm({ ...quoteForm, minimumOrderQty: e.target.value })}
                />
              </div>
              <div>
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  value={quoteForm.leadTimeDays}
                  onChange={(e) => setQuoteForm({ ...quoteForm, leadTimeDays: e.target.value })}
                />
              </div>
              <div>
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  value={quoteForm.validUntil}
                  onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })}
                />
              </div>
            </div>

            {/* Charges the vendor quoted. Anything left blank is filled from the
                RFQ's allowance rates when the Incoterm leaves it with us. */}
            <div>
              <Label className="text-xs text-muted-foreground">Quoted charges ({quoteForm.currency})</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <Input type="number" step="0.01" placeholder="Shipping"
                  value={quoteForm.shippingCost}
                  onChange={(e) => setQuoteForm({ ...quoteForm, shippingCost: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Handling"
                  value={quoteForm.handlingFee}
                  onChange={(e) => setQuoteForm({ ...quoteForm, handlingFee: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Insurance"
                  value={quoteForm.insuranceCost}
                  onChange={(e) => setQuoteForm({ ...quoteForm, insuranceCost: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Customs duty"
                  value={quoteForm.customsDutyAmount}
                  onChange={(e) => setQuoteForm({ ...quoteForm, customsDutyAmount: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Tax"
                  value={quoteForm.taxAmount}
                  onChange={(e) => setQuoteForm({ ...quoteForm, taxAmount: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Other"
                  value={quoteForm.otherCharges}
                  onChange={(e) => setQuoteForm({ ...quoteForm, otherCharges: e.target.value })} />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Tooling / NRE</Label>
              <div className="grid grid-cols-3 gap-2 mt-1 items-center">
                <Input type="number" step="0.01" placeholder="Tooling cost"
                  value={quoteForm.toolingCost}
                  onChange={(e) => setQuoteForm({ ...quoteForm, toolingCost: e.target.value })} />
                <Input type="number" step="0.0001" placeholder="Amortize over units"
                  value={quoteForm.toolingAmortizationUnits}
                  onChange={(e) => setQuoteForm({ ...quoteForm, toolingAmortizationUnits: e.target.value })} />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={quoteForm.toolingIsRefundable}
                    onChange={(e) => setQuoteForm({ ...quoteForm, toolingIsRefundable: e.target.checked })}
                  />
                  Refundable
                </label>
              </div>
            </div>
            <div>
              <Label>Payment Terms</Label>
              <Input
                value={quoteForm.paymentTerms}
                onChange={(e) => setQuoteForm({ ...quoteForm, paymentTerms: e.target.value })}
                placeholder="e.g., Net 30, 50% upfront"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={quoteForm.notes}
                onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEnterQuoteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!quoteForm.vendorId || !quoteForm.unitPrice) {
                  toast.error('Vendor and unit price are required');
                  return;
                }
                createQuote.mutate({
                  rfqId: selectedRfqId!,
                  vendorId: parseInt(quoteForm.vendorId),
                  unitPrice: quoteForm.unitPrice,
                  quantity: quoteForm.quantity || selectedRfq?.quantity,
                  totalPrice: quoteForm.totalPrice || undefined,
                  currency: quoteForm.currency || undefined,
                  incoterms: (quoteForm.incoterms || undefined) as any,
                  namedPlace: quoteForm.namedPlace || undefined,
                  minimumOrderQty: quoteForm.minimumOrderQty || undefined,
                  shippingCost: quoteForm.shippingCost || undefined,
                  handlingFee: quoteForm.handlingFee || undefined,
                  insuranceCost: quoteForm.insuranceCost || undefined,
                  customsDutyAmount: quoteForm.customsDutyAmount || undefined,
                  taxAmount: quoteForm.taxAmount || undefined,
                  otherCharges: quoteForm.otherCharges || undefined,
                  toolingCost: quoteForm.toolingCost || undefined,
                  toolingAmortizationUnits: quoteForm.toolingAmortizationUnits || undefined,
                  toolingIsRefundable: quoteForm.toolingIsRefundable || undefined,
                  leadTimeDays: quoteForm.leadTimeDays ? parseInt(quoteForm.leadTimeDays) : undefined,
                  validUntil: quoteForm.validUntil ? new Date(quoteForm.validUntil) : undefined,
                  paymentTerms: quoteForm.paymentTerms || undefined,
                  receivedVia: 'manual',
                  notes: quoteForm.notes || undefined,
                });
              }}
              disabled={createQuote.isPending}
            >
              {createQuote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FX Rates — the basis for converting foreign-currency quotes. A quote in
          a currency with no rate on file is excluded from ranking, not guessed. */}
      <Dialog open={isFxRatesOpen} onOpenChange={setIsFxRatesOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Currency Rates</DialogTitle>
            <DialogDescription>
              Rates used to convert vendor quotes into an RFQ's base currency. Each quote is
              converted at the newest rate dated on or before it, and the rate and date are
              recorded alongside the converted number.
            </DialogDescription>
          </DialogHeader>

          {/* ECB reference rates. Published once a day and dated, which is what
              makes a conversion defensible months later. */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">European Central Bank reference rates</p>
                <p className="text-xs text-muted-foreground">
                  Covers roughly 30 currencies. Anything else — CNY, INR, VND — you enter below.
                  Rates you typed yourself are never overwritten.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testFxFeed.isPending}
                  onClick={() => testFxFeed.mutate({})}
                >
                  {testFxFeed.isPending ? 'Checking…' : 'Test'}
                </Button>
                <Button
                  size="sm"
                  disabled={refreshFxFeed.isPending}
                  onClick={() => refreshFxFeed.mutate({})}
                >
                  {refreshFxFeed.isPending ? 'Fetching…' : 'Fetch latest'}
                </Button>
              </div>
            </div>
            {fxFeedConfig && (
              <p className="text-xs text-muted-foreground font-mono">{fxFeedConfig.url}</p>
            )}
          </div>

          {/* Bulk entry for everything the feed does not publish. */}
          <div className="rounded-lg border p-3 space-y-2">
            <Label htmlFor="fxPaste" className="text-sm font-medium">Paste rates</Label>
            <p className="text-xs text-muted-foreground">
              One per line. <code>CNY 7.24</code>, <code>USD/CNY 7.24</code> and{' '}
              <code>1 EUR = 1.08 USD</code> all work; a bare code converts from USD.
              If any line cannot be read, nothing is imported.
            </p>
            <Textarea
              id="fxPaste"
              rows={4}
              value={fxPaste}
              onChange={(e) => setFxPaste(e.target.value)}
              placeholder={'CNY 7.24\nINR 83.12\nVND 25400'}
              className="font-mono text-sm"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!fxPaste.trim() || importFxPaste.isPending}
                onClick={() => importFxPaste.mutate({ text: fxPaste })}
              >
                {importFxPaste.isPending ? 'Importing…' : 'Import pasted rates'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 items-end">
            <div>
              <Label>From</Label>
              <Select value={fxForm.fromCurrency} onValueChange={(v) => setFxForm({ ...fxForm, fromCurrency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMON_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To</Label>
              <Select value={fxForm.toCurrency} onValueChange={(v) => setFxForm({ ...fxForm, toCurrency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMON_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rate</Label>
              <Input
                type="number"
                step="0.00000001"
                placeholder="1.0850"
                value={fxForm.rate}
                onChange={(e) => setFxForm({ ...fxForm, rate: e.target.value })}
              />
            </div>
            <div>
              <Label>As of</Label>
              <Input
                type="date"
                value={fxForm.asOf}
                onChange={(e) => setFxForm({ ...fxForm, asOf: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              1 {fxForm.fromCurrency} = {fxForm.rate || '?'} {fxForm.toCurrency}. The inverse pair and
              USD-triangulated pairs are derived automatically.
            </p>
            <Button
              size="sm"
              onClick={() => {
                const rate = parseFloat(fxForm.rate);
                if (!Number.isFinite(rate) || rate <= 0) {
                  toast.error('Enter a positive rate');
                  return;
                }
                if (fxForm.fromCurrency === fxForm.toCurrency) {
                  toast.error('Pick two different currencies');
                  return;
                }
                upsertFxRate.mutate({
                  fromCurrency: fxForm.fromCurrency,
                  toCurrency: fxForm.toCurrency,
                  rate,
                  asOf: fxForm.asOf ? new Date(fxForm.asOf) : undefined,
                });
              }}
              disabled={upsertFxRate.isPending}
            >
              {upsertFxRate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Rate
            </Button>
          </div>

          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-1.5 py-1">Pair</th>
                  <th className="text-right px-1.5 py-1">Rate</th>
                  <th className="text-center px-1.5 py-1">As of</th>
                  <th className="text-left px-1.5 py-1">Source</th>
                  <th className="text-center px-1.5 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {(fxRates ?? []).length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-4">
                    No rates yet. Quotes in a foreign currency stay out of the ranking until one is added.
                  </td></tr>
                )}
                {(fxRates ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-1.5 py-0.5 font-mono">{r.fromCurrency} → {r.toCurrency}</td>
                    <td className="px-1.5 py-0.5 text-right font-mono">{Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                    <td className="px-1.5 py-0.5 text-center">{formatDate(r.asOf)}</td>
                    <td className="px-1.5 py-0.5 text-muted-foreground">{r.source}</td>
                    <td className="px-1.5 py-0.5 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => removeFxRate.mutate({ id: r.id })}
                        disabled={removeFxRate.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// PO Detail Panel Component
function PoDetailPanel({ po, onClose, onSendToSupplier, onStatusChange }: { 
  po: any; 
  onClose: () => void;
  onSendToSupplier: (po: any) => void;
  onStatusChange: (poId: number, status: string) => void;
}) {
  const { data: poItems } = trpc.purchaseOrders.getItems.useQuery({ purchaseOrderId: po.id });
  const statusOption = poStatusOptions.find(s => s.value === po.status);

  return (
    <div className="p-6 space-y-4">
      {/* Header with actions */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            PO #{po.poNumber}
            <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">{po.vendor?.name || "No vendor"}</p>
        </div>
        <div className="flex items-center gap-2">
          {po.status === "draft" && (
            <Button size="sm" onClick={() => onSendToSupplier(po)}>
              <Send className="h-4 w-4 mr-1" />
              Send to Supplier
            </Button>
          )}
          {po.status === "sent" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(po.id, "confirmed")}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Mark Confirmed
            </Button>
          )}
          {po.status === "confirmed" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(po.id, "shipped")}>
              <Truck className="h-4 w-4 mr-1" />
              Mark Shipped
            </Button>
          )}
          {po.status === "shipped" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(po.id, "received")}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Mark Received
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <DollarSign className="h-3 w-3" />
            Total Value
          </div>
          <div className="font-semibold">{formatCurrency(po.totalAmount)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Calendar className="h-3 w-3" />
            Expected Date
          </div>
          <div className="font-semibold">{formatDate(po.expectedDate)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Package className="h-3 w-3" />
            Line Items
          </div>
          <div className="font-semibold">{poItems?.length || 0}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3 w-3" />
            Created
          </div>
          <div className="font-semibold">{formatDate(po.createdAt)}</div>
        </div>
      </div>

      {/* Line items table */}
      {poItems && poItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Line Items</h4>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-1.5 py-1 font-medium">Material</th>
                  <th className="text-right px-1.5 py-1 font-medium">Qty</th>
                  <th className="text-right px-1.5 py-1 font-medium">Unit Price</th>
                  <th className="text-right px-1.5 py-1 font-medium">Total</th>
                  <th className="text-right px-1.5 py-1 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {poItems.map((item: any) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-1.5 py-0.5">{item.rawMaterial?.name || item.description || "-"}</td>
                    <td className="px-1.5 py-0.5 text-right">{item.quantity} {item.rawMaterial?.unit || ""}</td>
                    <td className="px-1.5 py-0.5 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-1.5 py-0.5 text-right font-mono">{formatCurrency(item.totalAmount)}</td>
                    <td className="px-1.5 py-0.5 text-right">
                      {item.receivedQuantity || 0} / {item.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {po.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2">{po.notes}</p>
        </div>
      )}
    </div>
  );
}

// Vendor Detail Panel
function VendorDetailPanel({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const { data: vendorPos } = trpc.purchaseOrders.list.useQuery();
  const relatedPos = vendorPos?.filter((po: any) => po.vendorId === vendor.id) || [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{vendor.name}</h3>
          <p className="text-sm text-muted-foreground">{vendor.email}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Contact</div>
          <div className="font-semibold text-sm">{vendor.contactPerson || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Phone</div>
          <div className="font-semibold text-sm">{vendor.phone || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Lead Time</div>
          <div className="font-semibold text-sm">{vendor.leadTimeDays || 14} days</div>
        </div>
      </div>

      {vendor.address && (
        <div>
          <h4 className="text-sm font-medium mb-1">Address</h4>
          <p className="text-sm text-muted-foreground">{vendor.address}</p>
        </div>
      )}

      {relatedPos.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Recent Purchase Orders ({relatedPos.length})</h4>
          <div className="space-y-1">
            {relatedPos.slice(0, 5).map((po: any) => (
              <div key={po.id} className="flex items-center justify-between text-sm bg-muted/30 rounded p-2">
                <span>PO #{po.poNumber}</span>
                <span className="font-mono">{formatCurrency(po.totalAmount)}</span>
                <Badge variant="outline" className="text-xs">{po.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Material Detail Panel
function MaterialDetailPanel({ material, onClose }: { material: any; onClose: () => void }) {
  const stockLevel = material.quantityOnHand || 0;
  const reorderPoint = material.reorderPoint || 0;
  const isLowStock = stockLevel < reorderPoint;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {material.name}
            {isLowStock && (
              <Badge variant="destructive" className="text-xs !bg-[oklch(0.30_0.02_262)] !text-white !border-transparent">
                <AlertCircle className="h-3 w-3 mr-1" />
                Low Stock
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">SKU: {material.sku || "-"}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">On Hand</div>
          <div className="font-semibold">{stockLevel} {material.unitOfMeasure}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Reorder Point</div>
          <div className="font-semibold">{reorderPoint} {material.unitOfMeasure}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Unit Cost</div>
          <div className="font-semibold">{formatCurrency(material.unitCost)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Lead Time</div>
          <div className="font-semibold">{material.leadTimeDays || 14} days</div>
        </div>
      </div>

      {material.preferredVendor && (
        <div>
          <h4 className="text-sm font-medium mb-1">Preferred Vendor</h4>
          <p className="text-sm">{material.preferredVendor.name}</p>
        </div>
      )}
    </div>
  );
}

export default function ProcurementHub() {
  const [isPoDialogOpen, setIsPoDialogOpen] = useState(false);
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [isSendPoDialogOpen, setIsSendPoDialogOpen] = useState(false);
  const [poToSend, setPoToSend] = useState<any>(null);
  const [emailMessage, setEmailMessage] = useState("");
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);

  // Queries
  const { data: purchaseOrders, isLoading: posLoading, refetch: refetchPos } = trpc.purchaseOrders.list.useQuery();
  const { data: vendors, isLoading: vendorsLoading, refetch: refetchVendors } = trpc.vendors.list.useQuery();
  const { data: rawMaterials, isLoading: materialsLoading, refetch: refetchMaterials } = trpc.rawMaterials.list.useQuery();

  // Keep selected detail objects in sync when lists refetch.
  useEffect(() => {
    if (!selectedPo) return;
    const fresh = (purchaseOrders || []).find((p: any) => p.id === selectedPo.id);
    if (fresh) setSelectedPo(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrders]);

  useEffect(() => {
    if (!selectedVendor) return;
    const fresh = (vendors || []).find((v: any) => v.id === selectedVendor.id);
    if (fresh) setSelectedVendor(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  useEffect(() => {
    if (!selectedMaterial) return;
    const fresh = (rawMaterials || []).find((m: any) => m.id === selectedMaterial.id);
    if (fresh) setSelectedMaterial(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMaterials]);
  
  // Bulk selection state
  const [selectedPos, setSelectedPos] = useState<Set<number | string>>(new Set());
  const [selectedVendors, setSelectedVendors] = useState<Set<number | string>>(new Set());
  const [selectedMaterials, setSelectedMaterials] = useState<Set<number | string>>(new Set());
  
  const [poForm, setPoForm] = useState({
    vendorId: "",
    expectedDate: "",
    notes: "",
  });
  const [vendorForm, setVendorForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    contactPerson: "",
    leadTimeDays: "14",
  });
  const [materialForm, setMaterialForm] = useState({
    name: "",
    sku: "",
    unitOfMeasure: "kg",
    unitCost: "",
    preferredVendorId: "",
    reorderPoint: "100",
    leadTimeDays: "14",
  });

  // Integration status
  const { data: integrationStatus } = trpc.integrations.getStatus.useQuery();

  // Mutations
  const createPo = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase order created");
      setIsPoDialogOpen(false);
      setPoForm({ vendorId: "", expectedDate: "", notes: "" });
      refetchPos();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updatePoStatus = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => {
      toast.success("PO status updated");
      refetchPos();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const sendPoToSupplier = trpc.purchaseOrders.sendToSupplier.useMutation({
    onSuccess: () => {
      toast.success("PO sent to supplier");
      setIsSendPoDialogOpen(false);
      setPoToSend(null);
      refetchPos();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createVendor = trpc.vendors.create.useMutation({
    onSuccess: () => {
      toast.success("Vendor created");
      setIsVendorDialogOpen(false);
      setVendorForm({ name: "", email: "", phone: "", address: "", contactPerson: "", leadTimeDays: "14" });
      refetchVendors();
    },
    onError: (err) => toast.error(err.message),
  });

  const createMaterial = trpc.rawMaterials.create.useMutation({
    onSuccess: () => {
      toast.success("Raw material created");
      setIsMaterialDialogOpen(false);
      setMaterialForm({ name: "", sku: "", unitOfMeasure: "kg", unitCost: "", preferredVendorId: "", reorderPoint: "100", leadTimeDays: "14" });
      refetchMaterials();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMaterial = trpc.rawMaterials.update.useMutation({
    onSuccess: () => {
      toast.success("Material updated");
      refetchMaterials();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateVendor = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated");
      refetchVendors();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // AI Agent mutations
  const generatePoSuggestion = trpc.aiAgent.generatePoSuggestion.useMutation({
    onSuccess: (task) => {
      toast.success("PO suggestion created! Check Approval Queue to review.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const generateRfqSuggestion = trpc.aiAgent.generateRfqSuggestion.useMutation({
    onSuccess: (task) => {
      toast.success("RFQ suggestion created! Check Approval Queue to review.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Inline edit handlers
  const handleMaterialCellEdit = (rowId: number | string, key: string, value: any) => {
    updateMaterial.mutate({ id: rowId as number, [key]: value });
  };

  const handleVendorCellEdit = (rowId: number | string, key: string, value: any) => {
    updateVendor.mutate({ id: rowId as number, [key]: value });
  };

  const handlePoCellEdit = (rowId: number | string, key: string, value: any) => {
    updatePoStatus.mutate({ id: rowId as number, [key]: value } as any);
  };

  // Bulk action handlers
  const handlePoBulkAction = (action: string, selectedIds: Set<number | string>) => {
    const ids = Array.from(selectedIds) as number[];
    if (action === "send") {
      // Update PO status to sent
      ids.forEach(id => {
        updatePoStatus.mutate({ id, status: "sent" });
      });
      toast.success(`${ids.length} POs marked as sent to suppliers`);
      setSelectedPos(new Set());
    } else if (action === "approve") {
      ids.forEach(id => updatePoStatus.mutate({ id, status: "confirmed" }));
      setSelectedPos(new Set());
    } else if (action === "cancel") {
      ids.forEach(id => updatePoStatus.mutate({ id, status: "cancelled" }));
      setSelectedPos(new Set());
    } else if (action === "export") {
      toast.info(`Exporting ${ids.length} POs...`);
    }
  };

  const handleVendorBulkAction = (action: string, selectedIds: Set<number | string>) => {
    const ids = Array.from(selectedIds) as number[];
    if (action === "activate") {
      ids.forEach(id => updateVendor.mutate({ id, status: "active" }));
      setSelectedVendors(new Set());
    } else if (action === "deactivate") {
      ids.forEach(id => updateVendor.mutate({ id, status: "inactive" }));
      setSelectedVendors(new Set());
    } else if (action === "request_quotes") {
      // Create AI tasks to request quotes from vendors
      // For now, show info that user needs to select materials first
      toast.info(`Select materials first, then use 'AI: Create Reorder PO' to generate RFQs`);
    }
  };

  const handleMaterialBulkAction = (action: string, selectedIds: Set<number | string>) => {
    const ids = Array.from(selectedIds) as number[];
    if (action === "reorder") {
      // Create AI-driven PO suggestions for each material
      ids.forEach(id => {
        const material = rawMaterials?.find((m: any) => m.id === id);
        if (material && material.preferredVendorId) {
          generatePoSuggestion.mutate({
            rawMaterialId: id,
            quantity: material.minOrderQty?.toString() || "100",
            vendorId: material.preferredVendorId,
            reason: `Low stock reorder for ${material.name}`,
          });
        } else {
          toast.warning(`Material ${material?.name || id} has no preferred vendor`);
        }
      });
      setSelectedMaterials(new Set());
    } else if (action === "mark_received") {
      ids.forEach(id => updateMaterial.mutate({ id, receivingStatus: "received" }));
      setSelectedMaterials(new Set());
    } else if (action === "mark_inspected") {
      ids.forEach(id => updateMaterial.mutate({ id, receivingStatus: "inspected" }));
      setSelectedMaterials(new Set());
    }
  };

  // Bulk action definitions
  const poBulkActions = [
    { key: "send", label: "Send to Suppliers", icon: <Send className="h-3 w-3 mr-1" /> },
    { key: "approve", label: "Approve", icon: <CheckCircle className="h-3 w-3 mr-1" /> },
    { key: "cancel", label: "Cancel", variant: "destructive" as const, icon: <XCircle className="h-3 w-3 mr-1" /> },
  ];

  const vendorBulkActions = [
    { key: "activate", label: "Activate" },
    { key: "deactivate", label: "Deactivate" },
    { key: "request_quotes", label: "Request Quotes" },
  ];

  const materialBulkActions = [
    { key: "reorder", label: "AI: Create Reorder PO", icon: <Sparkles className="h-3 w-3 mr-1" /> },
    { key: "mark_received", label: "Mark Received" },
    { key: "mark_inspected", label: "Mark Inspected" },
  ];

  // Column definitions
  const poColumns: Column<any>[] = [
    { key: "poNumber", header: "PO #", type: "text", sortable: true, width: "100px" },
    { key: "vendor", header: "Vendor", type: "text", sortable: true, render: (row) => row.vendor?.name || "-" },
    { key: "totalAmount", header: "Total", type: "currency", sortable: true, width: "120px" },
    { key: "status", header: "Status", type: "status", options: poStatusOptions, editable: true, filterable: true, width: "120px" },
    { key: "expectedDate", header: "Expected", type: "date", sortable: true, width: "120px" },
    { key: "createdAt", header: "Created", type: "date", sortable: true, width: "120px" },
  ];

  const vendorColumns: Column<any>[] = [
    { key: "name", header: "Name", type: "text", sortable: true, editable: true },
    { key: "email", header: "Email", type: "text", sortable: true, editable: true },
    { key: "contactName", header: "Contact", type: "text", editable: true },
    { key: "phone", header: "Phone", type: "text", editable: true },
    { key: "leadTimeDays", header: "Lead Time", type: "number", editable: true, render: (row) => `${row.leadTimeDays || 14} days` },
    { key: "status", header: "Status", type: "status", editable: true, options: [
      { value: "active", label: "Active", color: "bg-primary/10 text-primary" },
      { value: "inactive", label: "Inactive", color: "bg-muted text-muted-foreground" },
    ]},
  ];

  const receivingStatusOptions = [
    { value: "none", label: "None", color: "bg-muted text-muted-foreground" },
    { value: "ordered", label: "Ordered", color: "bg-primary/10 text-primary" },
    { value: "in_transit", label: "In Transit", color: "bg-primary/10 text-primary" },
    { value: "received", label: "Received", color: "bg-muted text-muted-foreground" },
    { value: "inspected", label: "Inspected", color: "bg-muted text-muted-foreground" },
  ];

  const materialColumns: Column<any>[] = [
    { key: "name", header: "Material", type: "text", sortable: true, editable: true },
    { key: "sku", header: "SKU", type: "text", sortable: true, width: "80px", editable: true },
    { key: "quantityOnHand", header: "On Hand", type: "number", sortable: true, width: "80px", render: (row) => (
      <span className={row.quantityOnHand < (row.reorderPoint || 0) ? "text-foreground font-semibold" : ""}>
        {row.quantityOnHand || 0}
      </span>
    )},
    { key: "quantityOnOrder", header: "On Order", type: "number", sortable: true, width: "80px", render: (row) => (
      <span className={parseFloat(row.quantityOnOrder || "0") > 0 ? "text-primary" : "text-muted-foreground"}>
        {parseFloat(row.quantityOnOrder || "0")}
      </span>
    )},
    { key: "receivingStatus", header: "Receiving", type: "status", options: receivingStatusOptions, filterable: true, width: "100px", editable: true },
    { key: "expectedDeliveryDate", header: "Expected", type: "date", sortable: true, width: "100px" },
    { key: "unitCost", header: "Cost", type: "currency", sortable: true, width: "80px", editable: true },
    { key: "preferredVendor", header: "Vendor", type: "text", render: (row) => row.preferredVendor?.name || "-", width: "120px" },
  ];

  // Handlers
  const handleCreatePo = () => {
    if (!poForm.vendorId) {
      toast.error("Please select a vendor");
      return;
    }
    createPo.mutate({
      vendorId: parseInt(poForm.vendorId),
      orderDate: new Date(),
      expectedDate: poForm.expectedDate ? new Date(poForm.expectedDate) : undefined,
      notes: poForm.notes || undefined,
      subtotal: "0",
      totalAmount: "0",
    });
  };

  const handleCreateVendor = () => {
    if (!vendorForm.name || !vendorForm.email) {
      toast.error("Name and email are required");
      return;
    }
    createVendor.mutate({
      name: vendorForm.name,
      email: vendorForm.email,
      phone: vendorForm.phone || undefined,
      address: vendorForm.address || undefined,
      contactName: vendorForm.contactPerson || undefined,
      
    });
  };

  const handleCreateMaterial = () => {
    if (!materialForm.name) {
      toast.error("Name is required");
      return;
    }
    createMaterial.mutate({
      name: materialForm.name,
      sku: materialForm.sku || undefined,
      unit: materialForm.unitOfMeasure,
      unitCost: materialForm.unitCost || "0",
      preferredVendorId: materialForm.preferredVendorId ? parseInt(materialForm.preferredVendorId) : undefined,
      leadTimeDays: parseInt(materialForm.leadTimeDays) || 14,
    });
  };

  const handleUpdatePoStatus = (poId: number, status: string) => {
    updatePoStatus.mutate({ id: poId, status } as any);
  };

  const handleSendPoToSupplier = () => {
    if (!poToSend) return;
    sendPoToSupplier.mutate({
      poId: poToSend.id,
      message: emailMessage || undefined,
    });
  };

  const openSendDialog = (po: any) => {
    setPoToSend(po);
    setEmailMessage("");
    setIsSendPoDialogOpen(true);
  };

  // Stats
  const stats = {
    totalPos: purchaseOrders?.length || 0,
    pendingPos: purchaseOrders?.filter((p: any) => p.status === "sent" || p.status === "confirmed").length || 0,
    totalVendors: vendors?.length || 0,
    activeVendors: vendors?.filter((v: any) => v.status === "active").length || 0,
    totalMaterials: rawMaterials?.length || 0,
    lowStock: rawMaterials?.filter((m: any) => (m.quantityOnHand || 0) < (m.reorderPoint || 0)).length || 0,
    inTransit: rawMaterials?.filter((m: any) => m.receivingStatus === "ordered" || m.receivingStatus === "in_transit").length || 0,
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <ShoppingCart className="h-8 w-8" />
              Procurement Hub
            </h1>
            <p className="text-muted-foreground mt-1">
              Click any row to expand details and take actions
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Integration Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Plug className="h-4 w-4 mr-2" />
                  Integrations
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-2">
                  External Services
                  {(integrationStatus?.sendgrid?.configured || integrationStatus?.google?.configured) && (
                    <Badge variant="outline" className="ml-auto text-xs bg-primary/10 text-primary">Active</Badge>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/import">
                    <CloudUpload className="h-4 w-4 mr-2" />
                    Import from Google Sheets
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export to Google Sheets
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Settings (SendGrid)
                    {integrationStatus?.sendgrid?.configured && (
                      <Badge variant="outline" className="ml-auto text-xs bg-primary/10 text-primary">On</Badge>
                    )}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">
                    <ShoppingBag className="h-4 w-4 mr-2" />
                    Shopify Settings
                    {integrationStatus?.shopify?.configured && (
                      <Badge variant="outline" className="ml-auto text-xs bg-primary/10 text-primary">On</Badge>
                    )}
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

            <Button variant="outline" onClick={() => { refetchPos(); refetchVendors(); refetchMaterials(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="p-4">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{stats.totalPos}</div>
            <div className="text-xs text-muted-foreground">Total POs</div>
          </Card>
          <Card className="p-4">
            <div className="text-xl font-semibold tracking-[-0.02em] text-primary font-display tabular-nums">{stats.pendingPos}</div>
            <div className="text-xs text-muted-foreground">Pending POs</div>
          </Card>
          <Card className="p-4">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{stats.totalVendors}</div>
            <div className="text-xs text-muted-foreground">Vendors</div>
          </Card>
          <Card className="p-4">
            <div className="text-xl font-semibold tracking-[-0.02em] text-foreground font-display tabular-nums">{stats.activeVendors}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </Card>
          <Card className="p-4">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{stats.totalMaterials}</div>
            <div className="text-xs text-muted-foreground">Materials</div>
          </Card>
          <Card className="p-4">
            <div className="text-xl font-semibold tracking-[-0.02em] text-foreground font-display tabular-nums">{stats.lowStock}</div>
            <div className="text-xs text-muted-foreground">Low Stock</div>
          </Card>
          <Card className="p-4">
            <div className="text-xl font-semibold tracking-[-0.02em] text-primary font-display tabular-nums">{stats.inTransit}</div>
            <div className="text-xs text-muted-foreground">In Transit</div>
          </Card>
        </div>

        {/* Purchase Orders */}
        <Card>
          <CardContent className="pt-6">
            <SpreadsheetTable
              data={purchaseOrders || []}
              columns={poColumns}
              isLoading={posLoading}
              emptyMessage="No purchase orders found"
              showSearch
              showFilters
              showExport
              onAdd={() => setIsPoDialogOpen(true)}
              addLabel="New PO"
              onRowClick={(po) => setSelectedPo(po)}
              expandedRowId={selectedPo?.id ?? null}
              onCellEdit={handlePoCellEdit}
              selectedRows={selectedPos}
              onSelectionChange={setSelectedPos}
              bulkActions={poBulkActions}
              onBulkAction={handlePoBulkAction}
              compact
            />
          </CardContent>
        </Card>

        {/* Vendors */}
        <Card>
          <CardContent className="pt-6">
            <SpreadsheetTable
              data={vendors || []}
              columns={vendorColumns}
              isLoading={vendorsLoading}
              emptyMessage="No vendors found. Add your first vendor to start managing suppliers."
              emptyAction={
                <QuickCreateButton
                  entityType="vendor"
                  label="Create First Vendor"
                  variant="default"
                  onCreated={() => refetchVendors()}
                />
              }
              showSearch
              showExport
              onAdd={() => setIsVendorDialogOpen(true)}
              addLabel="New Vendor"
              onRowClick={(vendor) => setSelectedVendor(vendor)}
              expandedRowId={selectedVendor?.id ?? null}
              onCellEdit={handleVendorCellEdit}
              selectedRows={selectedVendors}
              onSelectionChange={setSelectedVendors}
              bulkActions={vendorBulkActions}
              onBulkAction={handleVendorBulkAction}
              compact
            />
          </CardContent>
        </Card>

        {/* Raw Materials */}
        <Card>
          <CardContent className="pt-6">
            <SpreadsheetTable
              data={rawMaterials || []}
              columns={materialColumns}
              isLoading={materialsLoading}
              emptyMessage="No raw materials found. Add materials to track inventory and create purchase orders."
              emptyAction={
                <QuickCreateButton
                  entityType="material"
                  label="Create First Material"
                  variant="default"
                  onCreated={() => refetchMaterials()}
                />
              }
              showSearch
              showExport
              onAdd={() => setIsMaterialDialogOpen(true)}
              addLabel="New Material"
              onRowClick={(material) => setSelectedMaterial(material)}
              expandedRowId={selectedMaterial?.id ?? null}
              onCellEdit={handleMaterialCellEdit}
              selectedRows={selectedMaterials}
              onSelectionChange={setSelectedMaterials}
              bulkActions={materialBulkActions}
              onBulkAction={handleMaterialBulkAction}
              compact
            />
          </CardContent>
        </Card>

        {/* Vendor Quotes */}
        <VendorQuotesTab vendors={vendors || []} rawMaterials={rawMaterials || []} />

        {/* Side panels for PO / Vendor / Material */}
        <DetailSheet
          open={!!selectedPo}
          onOpenChange={(o) => !o && setSelectedPo(null)}
          width="lg"
        >
          {selectedPo && (
            <PoDetailPanel
              po={selectedPo}
              onClose={() => setSelectedPo(null)}
              onSendToSupplier={openSendDialog}
              onStatusChange={handleUpdatePoStatus}
            />
          )}
        </DetailSheet>

        <DetailSheet
          open={!!selectedVendor}
          onOpenChange={(o) => !o && setSelectedVendor(null)}
          width="md"
        >
          {selectedVendor && (
            <VendorDetailPanel vendor={selectedVendor} onClose={() => setSelectedVendor(null)} />
          )}
        </DetailSheet>

        <DetailSheet
          open={!!selectedMaterial}
          onOpenChange={(o) => !o && setSelectedMaterial(null)}
          width="md"
        >
          {selectedMaterial && (
            <MaterialDetailPanel material={selectedMaterial} onClose={() => setSelectedMaterial(null)} />
          )}
        </DetailSheet>

        {/* Create PO Dialog */}
        <Dialog open={isPoDialogOpen} onOpenChange={setIsPoDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>Create a new purchase order for a vendor</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Vendor *</Label>
                <Select value={poForm.vendorId} onValueChange={(v) => setPoForm({ ...poForm, vendorId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors?.map((v: any) => (
                      <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expected Date</Label>
                <Input 
                  type="date" 
                  value={poForm.expectedDate} 
                  onChange={(e) => setPoForm({ ...poForm, expectedDate: e.target.value })} 
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea 
                  value={poForm.notes} 
                  onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPoDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreatePo} disabled={createPo.isPending}>
                {createPo.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create PO
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Vendor Dialog */}
        <Dialog open={isVendorDialogOpen} onOpenChange={setIsVendorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Vendor</DialogTitle>
              <DialogDescription>Add a new vendor to your system</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Contact Person</Label>
                  <Input value={vendorForm.contactPerson} onChange={(e) => setVendorForm({ ...vendorForm, contactPerson: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Textarea value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} />
              </div>
              <div>
                <Label>Lead Time (days)</Label>
                <Input type="number" value={vendorForm.leadTimeDays} onChange={(e) => setVendorForm({ ...vendorForm, leadTimeDays: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsVendorDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateVendor} disabled={createVendor.isPending}>
                {createVendor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Vendor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Material Dialog */}
        <Dialog open={isMaterialDialogOpen} onOpenChange={setIsMaterialDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Raw Material</DialogTitle>
              <DialogDescription>Add a new raw material to inventory</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input value={materialForm.sku} onChange={(e) => setMaterialForm({ ...materialForm, sku: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Unit of Measure</Label>
                  <Select value={materialForm.unitOfMeasure} onValueChange={(v) => setMaterialForm({ ...materialForm, unitOfMeasure: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                      <SelectItem value="unit">unit</SelectItem>
                      <SelectItem value="liter">liter</SelectItem>
                      <SelectItem value="gallon">gallon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unit Cost</Label>
                  <Input type="number" step="0.01" value={materialForm.unitCost} onChange={(e) => setMaterialForm({ ...materialForm, unitCost: e.target.value })} />
                </div>
                <div>
                  <Label>Reorder Point</Label>
                  <Input type="number" value={materialForm.reorderPoint} onChange={(e) => setMaterialForm({ ...materialForm, reorderPoint: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Preferred Vendor</Label>
                  <Select value={materialForm.preferredVendorId} onValueChange={(v) => setMaterialForm({ ...materialForm, preferredVendorId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.map((v: any) => (
                        <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lead Time (days)</Label>
                  <Input type="number" value={materialForm.leadTimeDays} onChange={(e) => setMaterialForm({ ...materialForm, leadTimeDays: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsMaterialDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateMaterial} disabled={createMaterial.isPending}>
                {createMaterial.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Material
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send PO to Supplier Dialog */}
        <Dialog open={isSendPoDialogOpen} onOpenChange={setIsSendPoDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send PO to Supplier</DialogTitle>
              <DialogDescription>
                Send PO #{poToSend?.poNumber} to {poToSend?.vendor?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Custom Message (optional)</Label>
                <Textarea 
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Add a custom message to include in the email..."
                  rows={4}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                This will email the PO details to the vendor and automatically create a shipment order and freight quote request.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSendPoDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSendPoToSupplier} disabled={sendPoToSupplier.isPending}>
                {sendPoToSupplier.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Mail className="h-4 w-4 mr-2" />
                Send to Supplier
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
