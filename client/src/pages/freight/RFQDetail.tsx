import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Loader2,
  MapPin,
  Package,
  Calendar,
  DollarSign,
  Clock,
  Star,
  Sparkles,
  CheckCircle,
  XCircle,
  Mail,
  Plus,
  FileText,
  Truck,
} from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { Streamdown } from "streamdown";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function RFQDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const rfqId = parseInt(id || "0");
  
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedCarriers, setSelectedCarriers] = useState<number[]>([]);
  const [manualQuoteOpen, setManualQuoteOpen] = useState(false);
  const [emailParseOpen, setEmailParseOpen] = useState(false);
  const [emailContent, setEmailContent] = useState({ fromEmail: "", subject: "", body: "" });
  const [selectedCarrierForEmail, setSelectedCarrierForEmail] = useState<number | null>(null);
  
  // Manual quote form state
  const [quoteForm, setQuoteForm] = useState({
    carrierId: 0,
    quoteNumber: "",
    freightCost: "",
    fuelSurcharge: "",
    originCharges: "",
    destinationCharges: "",
    customsFees: "",
    insuranceCost: "",
    otherCharges: "",
    totalCost: "",
    currency: "USD",
    transitDays: "",
    shippingMode: "",
    routeDescription: "",
    validUntil: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: rfq, isLoading: rfqLoading } = trpc.freight.rfqs.get.useQuery({ id: rfqId });
  const { data: quotes, isLoading: quotesLoading } = trpc.freight.quotes.list.useQuery({ rfqId });
  const { data: carriers } = trpc.freight.carriers.list.useQuery({ isActive: true });
  const { data: emails } = trpc.freight.emails.list.useQuery({ rfqId });

  const sendToCarriersMutation = trpc.freight.rfqs.sendToCarriers.useMutation({
    onSuccess: (result) => {
      if (result.emailConfigured) {
        toast.success(`RFQ emails sent to ${result.sent} carriers!`);
      } else {
        toast.info(`Email drafts created for ${result.sent + result.failed} carriers. Configure SendGrid to send actual emails.`);
      }
      utils.freight.rfqs.get.invalidate({ id: rfqId });
      utils.freight.emails.list.invalidate({ rfqId });
      setSendDialogOpen(false);
      setSelectedCarriers([]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send RFQ");
    },
  });

  const createQuoteMutation = trpc.freight.quotes.create.useMutation({
    onSuccess: () => {
      toast.success("Quote added successfully");
      utils.freight.quotes.list.invalidate({ rfqId });
      utils.freight.rfqs.get.invalidate({ id: rfqId });
      setManualQuoteOpen(false);
      resetQuoteForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add quote");
    },
  });

  const analyzeQuotesMutation = trpc.freight.quotes.analyzeQuotes.useMutation({
    onSuccess: () => {
      toast.success("AI analysis complete - scores updated");
      utils.freight.quotes.list.invalidate({ rfqId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to analyze quotes");
    },
  });

  const acceptQuoteMutation = trpc.freight.quotes.accept.useMutation({
    onSuccess: (result) => {
      toast.success(`Quote accepted! Booking ${result.booking.bookingNumber} created`);
      utils.freight.quotes.list.invalidate({ rfqId });
      utils.freight.rfqs.get.invalidate({ id: rfqId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to accept quote");
    },
  });

  const rejectQuoteMutation = trpc.freight.quotes.update.useMutation({
    onSuccess: () => {
      toast.success("Quote rejected");
      utils.freight.quotes.list.invalidate({ rfqId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reject quote");
    },
  });

  const parseEmailMutation = trpc.freight.emails.parseIncoming.useMutation({
    onSuccess: (result) => {
      if (result.quote) {
        toast.success("Quote extracted from email successfully!");
      } else {
        toast.info("Email saved but no quote data could be extracted");
      }
      utils.freight.quotes.list.invalidate({ rfqId });
      utils.freight.emails.list.invalidate({ rfqId });
      setEmailParseOpen(false);
      setEmailContent({ fromEmail: "", subject: "", body: "" });
      setSelectedCarrierForEmail(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to parse email");
    },
  });

  const resetQuoteForm = () => {
    setQuoteForm({
      carrierId: 0,
      quoteNumber: "",
      freightCost: "",
      fuelSurcharge: "",
      originCharges: "",
      destinationCharges: "",
      customsFees: "",
      insuranceCost: "",
      otherCharges: "",
      totalCost: "",
      currency: "USD",
      transitDays: "",
      shippingMode: "",
      routeDescription: "",
      validUntil: "",
      notes: "",
    });
  };

  const handleSendToCarriers = () => {
    if (selectedCarriers.length === 0) {
      toast.error("Please select at least one carrier");
      return;
    }
    sendToCarriersMutation.mutate({ rfqId, carrierIds: selectedCarriers });
  };

  const handleAddQuote = () => {
    if (!quoteForm.carrierId) {
      toast.error("Please select a carrier");
      return;
    }
    createQuoteMutation.mutate({
      rfqId,
      carrierId: quoteForm.carrierId,
      quoteNumber: quoteForm.quoteNumber || undefined,
      freightCost: quoteForm.freightCost || undefined,
      fuelSurcharge: quoteForm.fuelSurcharge || undefined,
      originCharges: quoteForm.originCharges || undefined,
      destinationCharges: quoteForm.destinationCharges || undefined,
      customsFees: quoteForm.customsFees || undefined,
      insuranceCost: quoteForm.insuranceCost || undefined,
      otherCharges: quoteForm.otherCharges || undefined,
      totalCost: quoteForm.totalCost || undefined,
      currency: quoteForm.currency,
      transitDays: quoteForm.transitDays ? parseInt(quoteForm.transitDays) : undefined,
      shippingMode: quoteForm.shippingMode || undefined,
      routeDescription: quoteForm.routeDescription || undefined,
      validUntil: quoteForm.validUntil ? new Date(quoteForm.validUntil) : undefined,
      notes: quoteForm.notes || undefined,
      receivedVia: 'manual',
    });
  };

  const handleParseEmail = () => {
    if (!selectedCarrierForEmail) {
      toast.error("Please select a carrier");
      return;
    }
    if (!emailContent.body.trim()) {
      toast.error("Please paste the email content");
      return;
    }
    parseEmailMutation.mutate({
      rfqId,
      carrierId: selectedCarrierForEmail,
      ...emailContent,
    });
  };

  // Calculate total from individual costs
  const calculateTotal = () => {
    const costs = [
      quoteForm.freightCost,
      quoteForm.fuelSurcharge,
      quoteForm.originCharges,
      quoteForm.destinationCharges,
      quoteForm.customsFees,
      quoteForm.insuranceCost,
      quoteForm.otherCharges,
    ];
    const total = costs.reduce((sum, cost) => sum + (parseFloat(cost) || 0), 0);
    setQuoteForm({ ...quoteForm, totalCost: total.toFixed(2) });
  };

  if (rfqLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="p-6">
        <p>RFQ not found</p>
        <Link href="/freight/rfqs">
          <Button variant="link">Back to RFQs</Button>
        </Link>
      </div>
    );
  }

  const statusSteps = ['draft', 'sent', 'quotes_received', 'awarded'];
  const currentStepIndex = statusSteps.indexOf(rfq.status);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/freight/rfqs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{rfq.rfqNumber}</h1>
              <Badge variant={
                rfq.status === 'quotes_received' ? 'default' :
                rfq.status === 'awarded' ? 'secondary' :
                rfq.status === 'cancelled' ? 'destructive' :
                'outline'
              }>
                {rfq.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-muted-foreground">{rfq.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {rfq.status === 'draft' && (
            <Button onClick={() => setSendDialogOpen(true)}>
              <Send className="h-4 w-4 mr-2" />
              Send to Carriers
            </Button>
          )}
          {rfq.status !== 'awarded' && rfq.status !== 'cancelled' && (
            <Button variant="outline" onClick={() => setManualQuoteOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Quote Manually
            </Button>
          )}
          {(rfq.status === 'sent' || rfq.status === 'awaiting_quotes' || rfq.status === 'quotes_received') && (
            <Button variant="outline" onClick={() => setEmailParseOpen(true)}>
              <Mail className="h-4 w-4 mr-2" />
              Add Quote from Email
            </Button>
          )}
          {quotes && quotes.length > 1 && rfq.status !== 'awarded' && (
            <Button
              variant="outline"
              onClick={() => analyzeQuotesMutation.mutate({ rfqId })}
              disabled={analyzeQuotesMutation.isPending}
            >
              {analyzeQuotesMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              AI Compare Quotes
            </Button>
          )}
        </div>
      </div>

      {/* Status Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {statusSteps.map((step, index) => (
              <div key={step} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  index <= currentStepIndex 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {index < currentStepIndex ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span className={`ml-2 text-sm ${index <= currentStepIndex ? 'font-medium' : 'text-muted-foreground'}`}>
                  {step.replace(/_/g, ' ')}
                </span>
                {index < statusSteps.length - 1 && (
                  <div className={`w-16 h-0.5 mx-4 ${
                    index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shipment Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Route
            </CardTitle>
            <AITriggerButton message="Analyze this freight RFQ - compare quotes and recommend the best option" label="AI Analysis" />
          </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Origin</p>
              <p className="font-medium">
                {[rfq.originCity, rfq.originCountry].filter(Boolean).join(', ') || 'TBD'}
              </p>
              {rfq.originAddress && (
                <p className="text-sm text-muted-foreground">{rfq.originAddress}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Destination</p>
              <p className="font-medium">
                {[rfq.destinationCity, rfq.destinationCountry].filter(Boolean).join(', ') || 'TBD'}
              </p>
              {rfq.destinationAddress && (
                <p className="text-sm text-muted-foreground">{rfq.destinationAddress}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Cargo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{rfq.cargoType || 'General'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Weight</span>
              <span>{rfq.totalWeight ? `${rfq.totalWeight} kg` : 'TBD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Volume</span>
              <span>{rfq.totalVolume ? `${rfq.totalVolume} CBM` : 'TBD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Packages</span>
              <span>{rfq.numberOfPackages || 'TBD'}</span>
            </div>
            {rfq.hsCode && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">HS Code</span>
                <span>{rfq.hsCode}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mode</span>
              <span>{rfq.preferredMode?.replace(/_/g, ' ') || 'Any'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Incoterms</span>
              <span>{rfq.incoterms || 'TBD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Insurance</span>
              <span>{rfq.insuranceRequired ? 'Required' : 'Optional'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customs</span>
              <span>{rfq.customsClearanceRequired ? 'Required' : 'Not needed'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quotes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Quotes Received ({quotes?.length || 0})</span>
            {quotes && quotes.length > 0 && (
              <Badge variant="outline">
                Best: {quotes.reduce((min, q) => 
                  parseFloat(q.totalCost || '999999') < parseFloat(min.totalCost || '999999') ? q : min
                ).totalCost ? `$${quotes.reduce((min, q) => 
                  parseFloat(q.totalCost || '999999') < parseFloat(min.totalCost || '999999') ? q : min
                ).totalCost}` : 'N/A'}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Compare quotes from carriers and accept the best offer</CardDescription>
        </CardHeader>
        <CardContent>
          {quotesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : quotes && quotes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Transit Time</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>AI Score</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => {
                  const carrier = carriers?.find(c => c.id === quote.carrierId);
                  
                  return (
                    <TableRow key={quote.id} className={quote.aiRecommendation === 'Recommended' ? 'bg-green-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {quote.aiRecommendation === 'Recommended' && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                          <div>
                            <p className="font-medium">{carrier?.name || `Carrier #${quote.carrierId}`}</p>
                            {quote.quoteNumber && (
                              <p className="text-sm text-muted-foreground">{quote.quoteNumber}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {quote.totalCost ? `${quote.currency || 'USD'} ${quote.totalCost}` : 'TBD'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{quote.transitDays ? `${quote.transitDays} days` : 'TBD'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{quote.shippingMode || 'N/A'}</TableCell>
                      <TableCell>
                        {quote.aiScore ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${quote.aiScore}%` }}
                              />
                            </div>
                            <span className="text-sm">{quote.aiScore}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {quote.validUntil
                          ? new Date(quote.validUntil).toLocaleDateString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          quote.status === 'accepted' ? 'default' :
                          quote.status === 'rejected' ? 'destructive' :
                          'secondary'
                        }>
                          {quote.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {quote.status === 'received' && rfq.status !== 'awarded' && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => acceptQuoteMutation.mutate({ quoteId: quote.id })}
                              disabled={acceptQuoteMutation.isPending}
                            >
                              {acceptQuoteMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mr-1" />
                              )}
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectQuoteMutation.mutate({ id: quote.id, status: 'rejected' })}
                              disabled={rejectQuoteMutation.isPending}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                        {quote.status === 'accepted' && (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Winner
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No quotes received yet</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                {rfq.status === 'draft' && (
                  <Button variant="outline" onClick={() => setSendDialogOpen(true)}>
                    <Send className="h-4 w-4 mr-2" />
                    Send RFQ to Carriers
                  </Button>
                )}
                <Button variant="outline" onClick={() => setManualQuoteOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Quote Manually
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email History */}
      {emails && emails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Email History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {emails.map((email) => (
                <div key={email.id} className="flex items-start gap-3 p-3 rounded-lg border">
                  <Mail className={`h-5 w-5 mt-0.5 ${email.direction === 'outbound' ? 'text-blue-500' : 'text-green-500'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{email.subject}</span>
                      <Badge variant="outline" className="text-xs">
                        {email.direction === 'outbound' ? 'Sent' : 'Received'}
                      </Badge>
                      {email.aiGenerated && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          AI Generated
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {email.direction === 'outbound' ? `To: ${email.toEmail}` : `From: ${email.fromEmail}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(email.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send to Carriers Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send RFQ to Carriers</DialogTitle>
            <DialogDescription>
              Select carriers to send this quote request to. AI will generate personalized emails for each carrier.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {carriers && carriers.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {carriers.map((carrier) => (
                  <div
                    key={carrier.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted cursor-pointer ${
                      !carrier.email ? 'opacity-50' : ''
                    }`}
                    onClick={() => {
                      if (!carrier.email) return;
                      if (selectedCarriers.includes(carrier.id)) {
                        setSelectedCarriers(selectedCarriers.filter(id => id !== carrier.id));
                      } else {
                        setSelectedCarriers([...selectedCarriers, carrier.id]);
                      }
                    }}
                  >
                    <Checkbox
                      checked={selectedCarriers.includes(carrier.id)}
                      disabled={!carrier.email}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{carrier.name}</span>
                        {carrier.isPreferred && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {carrier.email || 'No email address - cannot send'}
                      </p>
                    </div>
                    <Badge variant="outline">{carrier.type}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No carriers found</p>
                <Link href="/freight/carriers">
                  <Button variant="link">Add carriers first</Button>
                </Link>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendToCarriers}
              disabled={selectedCarriers.length === 0 || sendToCarriersMutation.isPending}
            >
              {sendToCarriersMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send to {selectedCarriers.length} Carrier{selectedCarriers.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Quote Entry Dialog */}
      <Dialog open={manualQuoteOpen} onOpenChange={setManualQuoteOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Quote Manually</DialogTitle>
            <DialogDescription>
              Enter quote details received from a carrier via phone, portal, or other means.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Carrier *</Label>
                <Select
                  value={quoteForm.carrierId ? quoteForm.carrierId.toString() : ""}
                  onValueChange={(value) => setQuoteForm({ ...quoteForm, carrierId: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select carrier" />
                  </SelectTrigger>
                  <SelectContent>
                    {carriers?.map((carrier) => (
                      <SelectItem key={carrier.id} value={carrier.id.toString()}>
                        {carrier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Quote Number</Label>
                <Input
                  value={quoteForm.quoteNumber}
                  onChange={(e) => setQuoteForm({ ...quoteForm, quoteNumber: e.target.value })}
                  placeholder="e.g., QT-2025-001"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Shipping Mode</Label>
                <Select
                  value={quoteForm.shippingMode}
                  onValueChange={(value) => setQuoteForm({ ...quoteForm, shippingMode: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ocean_fcl">Ocean FCL</SelectItem>
                    <SelectItem value="ocean_lcl">Ocean LCL</SelectItem>
                    <SelectItem value="air">Air Freight</SelectItem>
                    <SelectItem value="express">Express/Courier</SelectItem>
                    <SelectItem value="ground">Ground</SelectItem>
                    <SelectItem value="rail">Rail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Cost Breakdown ({quoteForm.currency})</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Freight Cost</Label>
                  <Input
                    type="number"
                    value={quoteForm.freightCost}
                    onChange={(e) => setQuoteForm({ ...quoteForm, freightCost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fuel Surcharge</Label>
                  <Input
                    type="number"
                    value={quoteForm.fuelSurcharge}
                    onChange={(e) => setQuoteForm({ ...quoteForm, fuelSurcharge: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Origin Charges</Label>
                  <Input
                    type="number"
                    value={quoteForm.originCharges}
                    onChange={(e) => setQuoteForm({ ...quoteForm, originCharges: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Destination Charges</Label>
                  <Input
                    type="number"
                    value={quoteForm.destinationCharges}
                    onChange={(e) => setQuoteForm({ ...quoteForm, destinationCharges: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Customs Fees</Label>
                  <Input
                    type="number"
                    value={quoteForm.customsFees}
                    onChange={(e) => setQuoteForm({ ...quoteForm, customsFees: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Insurance Cost</Label>
                  <Input
                    type="number"
                    value={quoteForm.insuranceCost}
                    onChange={(e) => setQuoteForm({ ...quoteForm, insuranceCost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Other Charges</Label>
                  <Input
                    type="number"
                    value={quoteForm.otherCharges}
                    onChange={(e) => setQuoteForm({ ...quoteForm, otherCharges: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={quoteForm.currency}
                    onValueChange={(value) => setQuoteForm({ ...quoteForm, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button type="button" variant="outline" size="sm" onClick={calculateTotal}>
                  Calculate Total
                </Button>
                <div className="flex items-center gap-2">
                  <Label>Total Cost:</Label>
                  <Input
                    type="number"
                    value={quoteForm.totalCost}
                    onChange={(e) => setQuoteForm({ ...quoteForm, totalCost: e.target.value })}
                    className="w-32"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Transit & Validity</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Transit Days</Label>
                  <Input
                    type="number"
                    value={quoteForm.transitDays}
                    onChange={(e) => setQuoteForm({ ...quoteForm, transitDays: e.target.value })}
                    placeholder="e.g., 25"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={quoteForm.validUntil}
                    onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Route Description</Label>
                  <Input
                    value={quoteForm.routeDescription}
                    onChange={(e) => setQuoteForm({ ...quoteForm, routeDescription: e.target.value })}
                    placeholder="e.g., Shenzhen → Hong Kong → Los Angeles"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={quoteForm.notes}
                    onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                    placeholder="Any additional notes or conditions..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualQuoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddQuote}
              disabled={!quoteForm.carrierId || createQuoteMutation.isPending}
            >
              {createQuoteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parse Email Dialog */}
      <Dialog open={emailParseOpen} onOpenChange={setEmailParseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Quote from Email</DialogTitle>
            <DialogDescription>
              Paste the carrier's email response and AI will extract the quote details automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Carrier *</Label>
              <Select
                value={selectedCarrierForEmail ? selectedCarrierForEmail.toString() : ""}
                onValueChange={(value) => setSelectedCarrierForEmail(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers?.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id.toString()}>
                      {carrier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Email</Label>
              <Input
                type="email"
                placeholder="sender@carrier.com"
                value={emailContent.fromEmail}
                onChange={(e) => setEmailContent({ ...emailContent, fromEmail: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                type="text"
                placeholder="RE: Quote Request..."
                value={emailContent.subject}
                onChange={(e) => setEmailContent({ ...emailContent, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Body *</Label>
              <Textarea
                placeholder="Paste the full email content here..."
                value={emailContent.body}
                onChange={(e) => setEmailContent({ ...emailContent, body: e.target.value })}
                rows={10}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailParseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleParseEmail}
              disabled={!selectedCarrierForEmail || !emailContent.body || parseEmailMutation.isPending}
            >
              {parseEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Extract Quote with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
