import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Send, Truck, ArrowRight, Edit, X } from "lucide-react";

type ContainerType = "LTL" | "FTL" | "FCL" | "LCL";
type Incoterms = "FOB" | "CIF" | "EXW" | "DDP" | "DAP";
type QuoteStatus = "requested" | "received" | "selected" | "expired" | "declined";

const emptyQuoteForm = {
  carrierName: "",
  carrierEmail: "",
  origin: "",
  destination: "",
  containerType: "FTL" as ContainerType,
  incoterms: "FOB" as Incoterms,
  quotedPrice: "",
  currency: "USD",
  transitDays: "",
  weight: "",
  dimensions: "",
  validUntil: "",
  status: "requested" as QuoteStatus,
  notes: "",
};

const emptyRfqForm = {
  origin: "",
  destination: "",
  weight: "",
  dimensions: "",
  containerType: "FTL" as ContainerType,
  incoterms: "FOB" as Incoterms,
  notes: "",
};

const numOrUndef = (v: string) => (v === "" ? undefined : Number(v));

export default function CarrierQuotes() {
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [isRfqOpen, setIsRfqOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [quoteForm, setQuoteForm] = useState(emptyQuoteForm);
  const [rfqForm, setRfqForm] = useState(emptyRfqForm);
  const [carriers, setCarriers] = useState<{ name: string; email: string }[]>([
    { name: "", email: "" },
  ]);

  const utils = trpc.useUtils();
  const { data: quotes, isLoading } = trpc.freightQuotes.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter as QuoteStatus } : undefined
  );

  const createMutation = trpc.freightQuotes.create.useMutation({
    onSuccess: () => {
      toast.success("Quote created successfully");
      setIsQuoteOpen(false);
      setEditingId(null);
      setQuoteForm(emptyQuoteForm);
      utils.freightQuotes.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.freightQuotes.update.useMutation({
    onSuccess: () => {
      toast.success("Quote updated successfully");
      setIsQuoteOpen(false);
      setEditingId(null);
      setQuoteForm(emptyQuoteForm);
      utils.freightQuotes.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendRfqMutation = trpc.freightQuotes.sendRfq.useMutation({
    onSuccess: (data) => {
      toast.success(`Sent ${data.sent}, failed ${data.failed}`);
      if (!data.emailConfigured) {
        toast.warning("Email is not configured — RFQs were recorded but not emailed");
      }
      setIsRfqOpen(false);
      setRfqForm(emptyRfqForm);
      setCarriers([{ name: "", email: "" }]);
      utils.freightQuotes.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (q: any) => {
    setEditingId(q.id);
    setQuoteForm({
      carrierName: q.carrierName || "",
      carrierEmail: q.carrierEmail || "",
      origin: q.origin || "",
      destination: q.destination || "",
      containerType: q.containerType || "FTL",
      incoterms: q.incoterms || "FOB",
      quotedPrice: q.quotedPrice != null ? String(q.quotedPrice) : "",
      currency: q.currency || "USD",
      transitDays: q.transitDays != null ? String(q.transitDays) : "",
      weight: q.weight || "",
      dimensions: q.dimensions || "",
      validUntil: q.validUntil ? String(q.validUntil).slice(0, 10) : "",
      status: q.status || "requested",
      notes: q.notes || "",
    });
    setIsQuoteOpen(true);
  };

  const handleQuoteSubmit = () => {
    if (!quoteForm.carrierName) {
      toast.error("Carrier name is required");
      return;
    }
    if (!quoteForm.origin || !quoteForm.destination) {
      toast.error("Origin and destination are required");
      return;
    }
    const payload = {
      carrierName: quoteForm.carrierName,
      carrierEmail: quoteForm.carrierEmail || undefined,
      origin: quoteForm.origin,
      destination: quoteForm.destination,
      containerType: quoteForm.containerType,
      incoterms: quoteForm.incoterms,
      quotedPrice: quoteForm.quotedPrice || undefined,
      currency: quoteForm.currency || undefined,
      transitDays: numOrUndef(quoteForm.transitDays),
      weight: quoteForm.weight || undefined,
      dimensions: quoteForm.dimensions || undefined,
      validUntil: quoteForm.validUntil ? new Date(quoteForm.validUntil) : undefined,
      status: quoteForm.status,
      notes: quoteForm.notes || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleRfqSubmit = () => {
    const cleanCarriers = carriers.filter((c) => c.name && c.email);
    if (cleanCarriers.length === 0) {
      toast.error("Add at least one carrier with a name and email");
      return;
    }
    if (!rfqForm.origin || !rfqForm.destination) {
      toast.error("Origin and destination are required");
      return;
    }
    sendRfqMutation.mutate({
      carriers: cleanCarriers,
      origin: rfqForm.origin,
      destination: rfqForm.destination,
      weight: rfqForm.weight || undefined,
      dimensions: rfqForm.dimensions || undefined,
      containerType: rfqForm.containerType,
      incoterms: rfqForm.incoterms,
      notes: rfqForm.notes || undefined,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "selected": return "bg-primary/10 text-primary";
      case "received": return "bg-muted text-muted-foreground";
      case "requested": return "bg-muted text-muted-foreground";
      case "expired": return "bg-muted text-muted-foreground";
      case "declined": return "bg-[oklch(0.30_0.02_262)] text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Carrier Quotes</h1>
          <p className="text-muted-foreground">Request and compare carrier freight quotes across lanes and carriers</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isRfqOpen} onOpenChange={(open) => {
            setIsRfqOpen(open);
            if (!open) {
              setRfqForm(emptyRfqForm);
              setCarriers([{ name: "", email: "" }]);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Send className="h-4 w-4 mr-2" />
                Send RFQ
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Send Request for Quote</DialogTitle>
                <DialogDescription>
                  Email a request for freight quotes to one or more carriers
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Carriers</Label>
                  <div className="space-y-2">
                    {carriers.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          placeholder="Carrier name"
                          value={c.name}
                          onChange={(e) => {
                            const next = [...carriers];
                            next[i] = { ...next[i], name: e.target.value };
                            setCarriers(next);
                          }}
                        />
                        <Input
                          type="email"
                          placeholder="carrier@example.com"
                          value={c.email}
                          onChange={(e) => {
                            const next = [...carriers];
                            next[i] = { ...next[i], email: e.target.value };
                            setCarriers(next);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCarriers(carriers.filter((_, idx) => idx !== i))}
                          disabled={carriers.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCarriers([...carriers, { name: "", email: "" }])}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Carrier
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Origin *</Label>
                    <Input
                      placeholder="e.g., Shanghai, CN"
                      value={rfqForm.origin}
                      onChange={(e) => setRfqForm({ ...rfqForm, origin: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination *</Label>
                    <Input
                      placeholder="e.g., Los Angeles, US"
                      value={rfqForm.destination}
                      onChange={(e) => setRfqForm({ ...rfqForm, destination: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Weight</Label>
                    <Input
                      placeholder="e.g., 12000 kg"
                      value={rfqForm.weight}
                      onChange={(e) => setRfqForm({ ...rfqForm, weight: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dimensions</Label>
                    <Input
                      placeholder="e.g., 40ft container"
                      value={rfqForm.dimensions}
                      onChange={(e) => setRfqForm({ ...rfqForm, dimensions: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Container Type</Label>
                    <Select value={rfqForm.containerType} onValueChange={(v: ContainerType) => setRfqForm({ ...rfqForm, containerType: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LTL">LTL</SelectItem>
                        <SelectItem value="FTL">FTL</SelectItem>
                        <SelectItem value="FCL">FCL</SelectItem>
                        <SelectItem value="LCL">LCL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Incoterms</Label>
                    <Select value={rfqForm.incoterms} onValueChange={(v: Incoterms) => setRfqForm({ ...rfqForm, incoterms: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FOB">FOB</SelectItem>
                        <SelectItem value="CIF">CIF</SelectItem>
                        <SelectItem value="EXW">EXW</SelectItem>
                        <SelectItem value="DDP">DDP</SelectItem>
                        <SelectItem value="DAP">DAP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Any special handling or requirements..."
                    value={rfqForm.notes}
                    onChange={(e) => setRfqForm({ ...rfqForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsRfqOpen(false)}>Cancel</Button>
                <Button onClick={handleRfqSubmit} disabled={sendRfqMutation.isPending}>
                  Send RFQ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isQuoteOpen} onOpenChange={(open) => {
            setIsQuoteOpen(open);
            if (!open) {
              setEditingId(null);
              setQuoteForm(emptyQuoteForm);
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Quote
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Quote" : "New Carrier Quote"}</DialogTitle>
                <DialogDescription>
                  {editingId ? "Update this carrier freight quote" : "Record a freight quote from a carrier"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Carrier Name *</Label>
                    <Input
                      placeholder="e.g., Maersk"
                      value={quoteForm.carrierName}
                      onChange={(e) => setQuoteForm({ ...quoteForm, carrierName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Carrier Email</Label>
                    <Input
                      type="email"
                      value={quoteForm.carrierEmail}
                      onChange={(e) => setQuoteForm({ ...quoteForm, carrierEmail: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Origin *</Label>
                    <Input
                      placeholder="e.g., Shanghai, CN"
                      value={quoteForm.origin}
                      onChange={(e) => setQuoteForm({ ...quoteForm, origin: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination *</Label>
                    <Input
                      placeholder="e.g., Los Angeles, US"
                      value={quoteForm.destination}
                      onChange={(e) => setQuoteForm({ ...quoteForm, destination: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Container Type</Label>
                    <Select value={quoteForm.containerType} onValueChange={(v: ContainerType) => setQuoteForm({ ...quoteForm, containerType: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LTL">LTL</SelectItem>
                        <SelectItem value="FTL">FTL</SelectItem>
                        <SelectItem value="FCL">FCL</SelectItem>
                        <SelectItem value="LCL">LCL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Incoterms</Label>
                    <Select value={quoteForm.incoterms} onValueChange={(v: Incoterms) => setQuoteForm({ ...quoteForm, incoterms: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FOB">FOB</SelectItem>
                        <SelectItem value="CIF">CIF</SelectItem>
                        <SelectItem value="EXW">EXW</SelectItem>
                        <SelectItem value="DDP">DDP</SelectItem>
                        <SelectItem value="DAP">DAP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Quoted Price</Label>
                    <Input
                      placeholder="e.g., 3200.00"
                      value={quoteForm.quotedPrice}
                      onChange={(e) => setQuoteForm({ ...quoteForm, quotedPrice: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Input
                      value={quoteForm.currency}
                      onChange={(e) => setQuoteForm({ ...quoteForm, currency: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Transit Days</Label>
                    <Input
                      type="number"
                      value={quoteForm.transitDays}
                      onChange={(e) => setQuoteForm({ ...quoteForm, transitDays: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Weight</Label>
                    <Input
                      placeholder="e.g., 12000 kg"
                      value={quoteForm.weight}
                      onChange={(e) => setQuoteForm({ ...quoteForm, weight: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dimensions</Label>
                    <Input
                      placeholder="e.g., 40ft container"
                      value={quoteForm.dimensions}
                      onChange={(e) => setQuoteForm({ ...quoteForm, dimensions: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valid Until</Label>
                    <Input
                      type="date"
                      value={quoteForm.validUntil}
                      onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={quoteForm.status} onValueChange={(v: QuoteStatus) => setQuoteForm({ ...quoteForm, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="requested">Requested</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="selected">Selected</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes about this quote..."
                    value={quoteForm.notes}
                    onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsQuoteOpen(false)}>Cancel</Button>
                <Button onClick={handleQuoteSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Update" : "Create"} Quote
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="selected">Selected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Carrier Quotes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading quotes...</div>
          ) : !quotes || quotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No carrier quotes yet. Send an RFQ or add a quote to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Lane</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Transit</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Incoterms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q: any) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{q.carrierName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <span>{q.origin}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{q.destination}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {q.quotedPrice != null ? (
                        <span className="font-medium">
                          {q.quotedPrice} {q.currency || ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {q.transitDays != null ? `${q.transitDays}d` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {q.containerType ? (
                        <Badge variant="outline">{q.containerType}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {q.incoterms || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(q.status)}>{q.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(q)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
