import { useState } from "react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
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

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const poStatusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-800" },
  { value: "confirmed", label: "Confirmed", color: "bg-green-100 text-green-800" },
  { value: "shipped", label: "Shipped", color: "bg-purple-100 text-purple-800" },
  { value: "received", label: "Received", color: "bg-emerald-100 text-emerald-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

// Vendor Quotes Tab Component
function VendorQuotesTab({ vendors, rawMaterials }: { vendors: any[]; rawMaterials: any[] }) {
  const utils = trpc.useUtils();
  const [activeSubTab, setActiveSubTab] = useState<'rfqs' | 'quotes'>('rfqs');
  const [isCreateRfqOpen, setIsCreateRfqOpen] = useState(false);
  const [selectedRfqId, setSelectedRfqId] = useState<number | null>(null);
  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [isEnterQuoteOpen, setIsEnterQuoteOpen] = useState(false);
  const [isPasteEmailOpen, setIsPasteEmailOpen] = useState(false);
  const [isScanningInbox, setIsScanningInbox] = useState(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [emailForm, setEmailForm] = useState({
    fromEmail: '',
    subject: '',
    body: '',
  });
  const [quoteForm, setQuoteForm] = useState({
    vendorId: '',
    unitPrice: '',
    quantity: '',
    totalPrice: '',
    leadTimeDays: '',
    validUntil: '',
    paymentTerms: '',
    notes: '',
  });
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

  // Mutations
  const createRfq = trpc.vendorQuotes.rfqs.create.useMutation({
    onSuccess: () => {
      toast.success('RFQ created successfully');
      utils.vendorQuotes.rfqs.list.invalidate();
      setIsCreateRfqOpen(false);
      setRfqForm({ materialName: '', rawMaterialId: '', materialDescription: '', quantity: '', unit: 'kg', specifications: '', requiredDeliveryDate: '', deliveryLocation: '', quoteDueDate: '', priority: 'normal', notes: '' });
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
      utils.vendorQuotes.rfqs.list.invalidate();
      setIsEnterQuoteOpen(false);
      setQuoteForm({ vendorId: '', unitPrice: '', quantity: '', totalPrice: '', leadTimeDays: '', validUntil: '', paymentTerms: '', notes: '' });
    },
    onError: (err) => toast.error(err.message),
  });

  const acceptQuote = trpc.vendorQuotes.quotes.accept.useMutation({
    onSuccess: (result) => {
      toast.success(result.poId ? `Quote accepted and PO #${result.poId} created` : 'Quote accepted');
      utils.vendorQuotes.quotes.list.invalidate();
      utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
      utils.vendorQuotes.rfqs.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectQuote = trpc.vendorQuotes.quotes.reject.useMutation({
    onSuccess: () => {
      toast.success('Quote rejected');
      utils.vendorQuotes.quotes.list.invalidate();
      utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const parseIncoming = trpc.vendorQuotes.emails.parseIncoming.useMutation({
    onSuccess: (result) => {
      setParseResult(result);
      if (result.quote) {
        toast.success(
          `Quote auto-created from ${result.matchedVendor?.name || result.extractedData?.fromEmail || 'vendor'}` +
          (result.matchedRfq ? ` for ${result.matchedRfq.rfqNumber}` : '')
        );
        utils.vendorQuotes.quotes.list.invalidate();
        utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
        utils.vendorQuotes.rfqs.list.invalidate();
        utils.vendorQuotes.rfqs.getInvitations.invalidate();
      } else if (result.extractedData?.isQuoteResponse === false) {
        toast.info('Email parsed but does not appear to contain quote pricing data');
      } else {
        toast.info('Email parsed but could not match to a vendor and RFQ');
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const scanInbox = trpc.vendorQuotes.emails.scanInbox.useMutation({
    onSuccess: (result) => {
      setIsScanningInbox(false);
      if (result.quotesCreated > 0) {
        toast.success(`Inbox scanned: ${result.quotesCreated} quote(s) auto-created from ${result.vendorQuoteEmails} vendor email(s)`);
        utils.vendorQuotes.quotes.list.invalidate();
        utils.vendorQuotes.quotes.getWithVendorInfo.invalidate();
        utils.vendorQuotes.rfqs.list.invalidate();
        utils.vendorQuotes.rfqs.getInvitations.invalidate();
      } else if (result.vendorQuoteEmails > 0) {
        toast.info(`Scanned ${result.scannedEmails} emails. Found ${result.vendorQuoteEmails} vendor emails but no new quotes extracted.`);
      } else {
        toast.info(`Scanned ${result.scannedEmails} emails. No vendor quote replies found.`);
      }
      if (result.errors.length > 0) {
        toast.error(`Errors: ${result.errors.join('; ')}`);
      }
    },
    onError: (err) => {
      setIsScanningInbox(false);
      toast.error(err.message);
    },
  });

  const selectedRfq = rfqs?.find((r: any) => r.id === selectedRfqId);

  const rfqColumns: Column<any>[] = [
    { key: 'rfqNumber', header: 'RFQ #', type: 'text', width: '120px' },
    { key: 'materialName', header: 'Material', type: 'text', width: '200px' },
    { key: 'quantity', header: 'Qty', type: 'number', width: '100px', render: (v, row) => `${v} ${row.unit}` },
    { key: 'status', header: 'Status', type: 'text', width: '120px', render: (v) => {
      const colors: Record<string, string> = {
        draft: 'bg-gray-100 text-gray-800',
        sent: 'bg-blue-100 text-blue-800',
        partially_received: 'bg-yellow-100 text-yellow-800',
        all_received: 'bg-green-100 text-green-800',
        awarded: 'bg-purple-100 text-purple-800',
        cancelled: 'bg-red-100 text-red-800',
      };
      return <Badge className={colors[v] || 'bg-gray-100'}>{v?.replace(/_/g, ' ')}</Badge>;
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setIsScanningInbox(true);
              scanInbox.mutate();
            }}
            disabled={scanInbox.isPending}
          >
            {scanInbox.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Scan Inbox
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsPasteEmailOpen(true)}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Paste & Parse Email
          </Button>
          <Button onClick={() => setIsCreateRfqOpen(true)}>
            <Mail className="h-4 w-4 mr-1" />
            Create RFQ
          </Button>
        </div>
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
                        <>
                          <Button size="sm" variant="outline" onClick={() => setIsPasteEmailOpen(true)}>
                            <Sparkles className="h-4 w-4 mr-1" />
                            Parse Email
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setIsEnterQuoteOpen(true)}>
                            <DollarSign className="h-4 w-4 mr-1" />
                            Enter Quote
                          </Button>
                        </>
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

                  {/* Received Quotes Comparison */}
                  {selectedRfqQuotes && selectedRfqQuotes.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Received Quotes ({selectedRfqQuotes.length})</h4>
                      <div className="border rounded overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2">Rank</th>
                              <th className="text-left p-2">Vendor</th>
                              <th className="text-right p-2">Unit Price</th>
                              <th className="text-right p-2">Total</th>
                              <th className="text-center p-2">Lead Time</th>
                              <th className="text-center p-2">Valid Until</th>
                              <th className="text-center p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRfqQuotes.map((quote: any, idx: number) => (
                              <tr key={quote.id} className={`border-t ${idx === 0 ? 'bg-green-50' : ''}`}>
                                <td className="p-2">
                                  {idx === 0 ? (
                                    <Badge className="bg-green-500">Best</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">#{quote.overallRank || idx + 1}</span>
                                  )}
                                </td>
                                <td className="p-2 font-medium">{quote.vendor?.name}</td>
                                <td className="p-2 text-right font-mono">{formatCurrency(quote.unitPrice)}</td>
                                <td className="p-2 text-right font-mono font-semibold">{formatCurrency(quote.totalPrice)}</td>
                                <td className="p-2 text-center">{quote.leadTimeDays ? `${quote.leadTimeDays} days` : '-'}</td>
                                <td className="p-2 text-center">{formatDate(quote.validUntil)}</td>
                                <td className="p-2 text-center">
                                  {quote.status === 'received' && (
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-green-600 hover:text-green-700"
                                        onClick={() => acceptQuote.mutate({ id: quote.id, createPO: true })}
                                        disabled={acceptQuote.isPending}
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-red-600 hover:text-red-700"
                                        onClick={() => rejectQuote.mutate({ id: quote.id, sendNotification: true })}
                                        disabled={rejectQuote.isPending}
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                  {quote.status === 'accepted' && <Badge className="bg-green-500">Accepted</Badge>}
                                  {quote.status === 'rejected' && <Badge variant="destructive">Rejected</Badge>}
                                  {quote.status === 'converted_to_po' && <Badge className="bg-purple-500">PO Created</Badge>}
                                </td>
                              </tr>
                            ))}
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
                      <th className="text-left p-2">Quote #</th>
                      <th className="text-left p-2">RFQ</th>
                      <th className="text-left p-2">Vendor</th>
                      <th className="text-right p-2">Unit Price</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-center p-2">Status</th>
                      <th className="text-center p-2">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes?.map((quote: any) => {
                      const rfq = rfqs?.find((r: any) => r.id === quote.rfqId);
                      const vendor = vendors.find((v: any) => v.id === quote.vendorId);
                      return (
                        <tr key={quote.id} className="border-t hover:bg-muted/50">
                          <td className="p-2 font-mono">{quote.quoteNumber || `Q-${quote.id}`}</td>
                          <td className="p-2">{rfq?.rfqNumber || '-'}</td>
                          <td className="p-2 font-medium">{vendor?.name || '-'}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(quote.unitPrice)}</td>
                          <td className="p-2 text-right font-mono font-semibold">{formatCurrency(quote.totalPrice)}</td>
                          <td className="p-2 text-center">
                            <Badge variant="outline">{quote.status}</Badge>
                          </td>
                          <td className="p-2 text-center text-muted-foreground">{formatDate(quote.createdAt)}</td>
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
        <DialogContent className="max-w-lg">
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
        <DialogContent>
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
            <div className="grid grid-cols-2 gap-4">
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

      {/* Paste & Parse Email Dialog */}
      <Dialog open={isPasteEmailOpen} onOpenChange={(open) => { setIsPasteEmailOpen(open); if (!open) setParseResult(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Auto-Parse Vendor Quote Email
            </DialogTitle>
            <DialogDescription>
              Paste a vendor's quote email and AI will extract pricing, lead times, and terms automatically
            </DialogDescription>
          </DialogHeader>
          {!parseResult ? (
            <div className="space-y-4">
              <div>
                <Label>From Email Address *</Label>
                <Input
                  value={emailForm.fromEmail}
                  onChange={(e) => setEmailForm({ ...emailForm, fromEmail: e.target.value })}
                  placeholder="vendor@example.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Vendor and RFQ will be auto-detected from this email address
                </p>
              </div>
              <div>
                <Label>Subject *</Label>
                <Input
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="e.g., Re: Request for Quote: RFQ-2024-001 - Steel Plate"
                />
              </div>
              <div>
                <Label>Email Body *</Label>
                <Textarea
                  value={emailForm.body}
                  onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                  placeholder="Paste the full email body here..."
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Parse Results */}
              <div className={`p-4 rounded-lg border ${parseResult.quote ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {parseResult.quote ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <span className="font-medium">
                    {parseResult.quote ? 'Quote auto-created successfully' : 'Email parsed, no quote created'}
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  <p>Vendor: {parseResult.matchedVendor ? <Badge variant="outline">{parseResult.matchedVendor.name}</Badge> : <span className="text-muted-foreground">Not matched</span>}</p>
                  <p>RFQ: {parseResult.matchedRfq ? <Badge variant="outline">{parseResult.matchedRfq.rfqNumber}</Badge> : <span className="text-muted-foreground">Not matched</span>}</p>
                </div>
              </div>

              {parseResult.extractedData && (
                <div>
                  <Label className="text-sm font-medium">Extracted Data</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                    {parseResult.extractedData.unitPrice && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Unit Price:</span>{' '}
                        <span className="font-medium">{parseResult.extractedData.currency || 'USD'} {parseResult.extractedData.unitPrice}</span>
                      </div>
                    )}
                    {parseResult.extractedData.totalPrice && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Total Price:</span>{' '}
                        <span className="font-medium">{parseResult.extractedData.currency || 'USD'} {parseResult.extractedData.totalPrice}</span>
                      </div>
                    )}
                    {parseResult.extractedData.quantity && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Quantity:</span>{' '}
                        <span className="font-medium">{parseResult.extractedData.quantity}</span>
                      </div>
                    )}
                    {parseResult.extractedData.leadTimeDays && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Lead Time:</span>{' '}
                        <span className="font-medium">{parseResult.extractedData.leadTimeDays} days</span>
                      </div>
                    )}
                    {parseResult.extractedData.paymentTerms && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Payment:</span>{' '}
                        <span className="font-medium">{parseResult.extractedData.paymentTerms}</span>
                      </div>
                    )}
                    {parseResult.extractedData.validUntil && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Valid Until:</span>{' '}
                        <span className="font-medium">{new Date(parseResult.extractedData.validUntil).toLocaleDateString()}</span>
                      </div>
                    )}
                    {parseResult.extractedData.shippingCost && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Shipping:</span>{' '}
                        <span className="font-medium">{parseResult.extractedData.currency || 'USD'} {parseResult.extractedData.shippingCost}</span>
                      </div>
                    )}
                    {parseResult.extractedData.minimumOrderQty && (
                      <div className="bg-muted p-2 rounded">
                        <span className="text-muted-foreground">MOQ:</span>{' '}
                        <span className="font-medium">{parseResult.extractedData.minimumOrderQty}</span>
                      </div>
                    )}
                  </div>
                  {parseResult.extractedData.notes && (
                    <div className="mt-2 p-2 bg-muted rounded text-sm">
                      <span className="text-muted-foreground">Notes:</span> {parseResult.extractedData.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {!parseResult ? (
              <>
                <Button variant="outline" onClick={() => setIsPasteEmailOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (!emailForm.fromEmail || !emailForm.body) {
                      toast.error('Email address and body are required');
                      return;
                    }
                    parseIncoming.mutate({
                      rfqId: selectedRfqId || undefined,
                      fromEmail: emailForm.fromEmail,
                      subject: emailForm.subject,
                      body: emailForm.body,
                    });
                  }}
                  disabled={parseIncoming.isPending}
                >
                  {parseIncoming.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <Bot className="h-4 w-4 mr-2" />
                      Parse with AI
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => {
                  setParseResult(null);
                  setEmailForm({ fromEmail: '', subject: '', body: '' });
                }}>
                  Parse Another
                </Button>
                <Button onClick={() => {
                  setIsPasteEmailOpen(false);
                  setParseResult(null);
                  setEmailForm({ fromEmail: '', subject: '', body: '' });
                }}>
                  Done
                </Button>
              </>
            )}
          </DialogFooter>
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
                  <th className="text-left p-2 font-medium">Material</th>
                  <th className="text-right p-2 font-medium">Qty</th>
                  <th className="text-right p-2 font-medium">Unit Price</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  <th className="text-right p-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {poItems.map((item: any) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2">{item.rawMaterial?.name || item.description || "-"}</td>
                    <td className="p-2 text-right">{item.quantity} {item.rawMaterial?.unitOfMeasure || ""}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(item.totalPrice)}</td>
                    <td className="p-2 text-right">
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
              <Badge variant="destructive" className="text-xs">
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
  const [activeTab, setActiveTab] = useState("purchase-orders");
  const [isPoDialogOpen, setIsPoDialogOpen] = useState(false);
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [isSendPoDialogOpen, setIsSendPoDialogOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<any>(null);
  const [emailMessage, setEmailMessage] = useState("");
  const [expandedPoId, setExpandedPoId] = useState<number | string | null>(null);
  const [expandedVendorId, setExpandedVendorId] = useState<number | string | null>(null);
  const [expandedMaterialId, setExpandedMaterialId] = useState<number | string | null>(null);
  
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

  // Queries
  const { data: purchaseOrders, isLoading: posLoading, refetch: refetchPos } = trpc.purchaseOrders.list.useQuery();
  const { data: vendors, isLoading: vendorsLoading, refetch: refetchVendors } = trpc.vendors.list.useQuery();
  const { data: rawMaterials, isLoading: materialsLoading, refetch: refetchMaterials } = trpc.rawMaterials.list.useQuery();

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
      setSelectedPo(null);
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
      { value: "active", label: "Active", color: "bg-green-100 text-green-800" },
      { value: "inactive", label: "Inactive", color: "bg-gray-100 text-gray-800" },
    ]},
  ];

  const receivingStatusOptions = [
    { value: "none", label: "None", color: "bg-gray-100 text-gray-800" },
    { value: "ordered", label: "Ordered", color: "bg-blue-100 text-blue-800" },
    { value: "in_transit", label: "In Transit", color: "bg-purple-100 text-purple-800" },
    { value: "received", label: "Received", color: "bg-green-100 text-green-800" },
    { value: "inspected", label: "Inspected", color: "bg-emerald-100 text-emerald-800" },
  ];

  const materialColumns: Column<any>[] = [
    { key: "name", header: "Material", type: "text", sortable: true, editable: true },
    { key: "sku", header: "SKU", type: "text", sortable: true, width: "80px", editable: true },
    { key: "quantityOnHand", header: "On Hand", type: "number", sortable: true, width: "80px", render: (row) => (
      <span className={row.quantityOnHand < (row.reorderPoint || 0) ? "text-red-600 font-medium" : ""}>
        {row.quantityOnHand || 0}
      </span>
    )},
    { key: "quantityOnOrder", header: "On Order", type: "number", sortable: true, width: "80px", render: (row) => (
      <span className={parseFloat(row.quantityOnOrder || "0") > 0 ? "text-blue-600" : "text-muted-foreground"}>
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
    if (!selectedPo) return;
    sendPoToSupplier.mutate({
      poId: selectedPo.id,
      message: emailMessage || undefined,
    });
  };

  const openSendDialog = (po: any) => {
    setSelectedPo(po);
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
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
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
                    <Badge variant="outline" className="ml-auto text-xs bg-green-50 text-green-700">Active</Badge>
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
                      <Badge variant="outline" className="ml-auto text-xs bg-green-50 text-green-700">On</Badge>
                    )}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">
                    <ShoppingBag className="h-4 w-4 mr-2" />
                    Shopify Settings
                    {integrationStatus?.shopify?.configured && (
                      <Badge variant="outline" className="ml-auto text-xs bg-green-50 text-green-700">On</Badge>
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
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("purchase-orders")}>
            <div className="text-2xl font-bold">{stats.totalPos}</div>
            <div className="text-xs text-muted-foreground">Total POs</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("purchase-orders")}>
            <div className="text-2xl font-bold text-blue-600">{stats.pendingPos}</div>
            <div className="text-xs text-muted-foreground">Pending POs</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("vendors")}>
            <div className="text-2xl font-bold">{stats.totalVendors}</div>
            <div className="text-xs text-muted-foreground">Vendors</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("vendors")}>
            <div className="text-2xl font-bold text-green-600">{stats.activeVendors}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("materials")}>
            <div className="text-2xl font-bold">{stats.totalMaterials}</div>
            <div className="text-xs text-muted-foreground">Materials</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("materials")}>
            <div className="text-2xl font-bold text-orange-600">{stats.lowStock}</div>
            <div className="text-xs text-muted-foreground">Low Stock</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("materials")}>
            <div className="text-2xl font-bold text-purple-600">{stats.inTransit}</div>
            <div className="text-xs text-muted-foreground">In Transit</div>
          </Card>
        </div>

        {/* Tabs with Expandable Spreadsheet Views */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="purchase-orders" className="gap-2">
              <FileText className="h-4 w-4" />
              Purchase Orders
            </TabsTrigger>
            <TabsTrigger value="vendors" className="gap-2">
              <Users className="h-4 w-4" />
              Vendors
            </TabsTrigger>
            <TabsTrigger value="materials" className="gap-2">
              <Package className="h-4 w-4" />
              Raw Materials
            </TabsTrigger>
            <TabsTrigger value="quotes" className="gap-2">
              <Mail className="h-4 w-4" />
              Vendor Quotes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchase-orders" className="mt-4">
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
                  expandable
                  expandedRowId={expandedPoId}
                  onExpandChange={setExpandedPoId}
                  renderExpanded={(po, onClose) => (
                    <PoDetailPanel 
                      po={po} 
                      onClose={onClose}
                      onSendToSupplier={openSendDialog}
                      onStatusChange={handleUpdatePoStatus}
                    />
                  )}
                  onCellEdit={handlePoCellEdit}
                  selectedRows={selectedPos}
                  onSelectionChange={setSelectedPos}
                  bulkActions={poBulkActions}
                  onBulkAction={handlePoBulkAction}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vendors" className="mt-4">
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
                  expandable
                  expandedRowId={expandedVendorId}
                  onExpandChange={setExpandedVendorId}
                  renderExpanded={(vendor, onClose) => (
                    <VendorDetailPanel vendor={vendor} onClose={onClose} />
                  )}
                  onCellEdit={handleVendorCellEdit}
                  selectedRows={selectedVendors}
                  onSelectionChange={setSelectedVendors}
                  bulkActions={vendorBulkActions}
                  onBulkAction={handleVendorBulkAction}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="materials" className="mt-4">
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
                  expandable
                  expandedRowId={expandedMaterialId}
                  onExpandChange={setExpandedMaterialId}
                  renderExpanded={(material, onClose) => (
                    <MaterialDetailPanel material={material} onClose={onClose} />
                  )}
                  onCellEdit={handleMaterialCellEdit}
                  selectedRows={selectedMaterials}
                  onSelectionChange={setSelectedMaterials}
                  bulkActions={materialBulkActions}
                  onBulkAction={handleMaterialBulkAction}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes" className="mt-4">
            <VendorQuotesTab vendors={vendors || []} rawMaterials={rawMaterials || []} />
          </TabsContent>

        </Tabs>

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
                Send PO #{selectedPo?.poNumber} to {selectedPo?.vendor?.name}
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
