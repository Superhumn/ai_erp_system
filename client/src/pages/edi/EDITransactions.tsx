import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeftRight,
  ArrowLeft,
  Loader2,
  Plus,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ShoppingCart,
  Eye,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const txnSetLabels: Record<string, string> = {
  "850": "Purchase Order",
  "855": "PO Acknowledgment",
  "810": "Invoice",
  "856": "Ship Notice (ASN)",
  "997": "Functional Ack",
};

const statusColors: Record<string, string> = {
  received: "bg-blue-100 text-blue-800",
  parsing: "bg-yellow-100 text-yellow-800",
  parsed: "bg-indigo-100 text-indigo-800",
  validated: "bg-purple-100 text-purple-800",
  processing: "bg-orange-100 text-orange-800",
  processed: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
  acknowledged: "bg-emerald-100 text-emerald-800",
};

export default function EDITransactions() {
  const [filterTxnSet, setFilterTxnSet] = useState<string>("");
  const [filterDirection, setFilterDirection] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState<number | null>(null);
  const [rawEdiContent, setRawEdiContent] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");

  const { data: transactions, isLoading, refetch } = trpc.edi.transactions.list.useQuery({
    transactionSetCode: filterTxnSet || undefined,
    direction: filterDirection || undefined,
    status: filterStatus || undefined,
  });

  const { data: partners } = trpc.edi.partners.list.useQuery({});

  const { data: selectedTxn } = trpc.edi.transactions.getWithItems.useQuery(
    { id: selectedTxnId! },
    { enabled: !!selectedTxnId }
  );

  const processInbound = trpc.edi.transactions.processInbound.useMutation({
    onSuccess: (result) => {
      toast.success("EDI Processed", { description: result.message });
      setShowProcessDialog(false);
      setRawEdiContent("");
      refetch();
    },
    onError: (error) => {
      toast.error("Processing Error", { description: error.message });
    },
  });

  const convertToOrder = trpc.edi.transactions.convertToOrder.useMutation({
    onSuccess: (result) => {
      toast.success("Order Created", { description: `Order ID: ${result.orderId}` });
      refetch();
    },
    onError: (error) => {
      toast.error("Conversion Error", { description: error.message });
    },
  });

  const reprocessTxn = trpc.edi.transactions.reprocess.useMutation({
    onSuccess: (result) => {
      toast.success("Reprocessed", { description: result.message });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleProcessInbound = () => {
    if (!selectedPartnerId || !rawEdiContent.trim()) return;
    processInbound.mutate({
      tradingPartnerId: parseInt(selectedPartnerId),
      rawContent: rawEdiContent,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view
  if (selectedTxnId && selectedTxn) {
    const parsedData = selectedTxn.parsedData ? JSON.parse(selectedTxn.parsedData) : null;

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedTxnId(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {txnSetLabels[selectedTxn.transactionSetCode] || selectedTxn.transactionSetCode}
            </h1>
            <p className="text-muted-foreground">
              Control #: {selectedTxn.interchangeControlNumber} &middot;
              {selectedTxn.purchaseOrderNumber && ` PO: ${selectedTxn.purchaseOrderNumber} ·`}
              {" "}{selectedTxn.direction}
            </p>
          </div>
          <Badge className={statusColors[selectedTxn.status] || ""} variant="outline">
            {selectedTxn.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transaction Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Transaction Set:</span>
                <span className="font-mono">{selectedTxn.transactionSetCode} - {txnSetLabels[selectedTxn.transactionSetCode] || "Unknown"}</span>
                <span className="text-muted-foreground">Direction:</span>
                <span className="capitalize">{selectedTxn.direction}</span>
                <span className="text-muted-foreground">ISA Control #:</span>
                <span className="font-mono">{selectedTxn.interchangeControlNumber || "-"}</span>
                <span className="text-muted-foreground">GS Control #:</span>
                <span className="font-mono">{selectedTxn.groupControlNumber || "-"}</span>
                <span className="text-muted-foreground">ST Control #:</span>
                <span className="font-mono">{selectedTxn.transactionSetControlNumber || "-"}</span>
                <span className="text-muted-foreground">PO Number:</span>
                <span className="font-mono">{selectedTxn.purchaseOrderNumber || "-"}</span>
                <span className="text-muted-foreground">Linked Order:</span>
                <span>{selectedTxn.orderId ? <Link href={`/sales/orders/${selectedTxn.orderId}`} className="text-blue-600 underline">Order #{selectedTxn.orderId}</Link> : "-"}</span>
                <span className="text-muted-foreground">Created:</span>
                <span>{new Date(selectedTxn.createdAt).toLocaleString()}</span>
                <span className="text-muted-foreground">Processed:</span>
                <span>{selectedTxn.processedAt ? new Date(selectedTxn.processedAt).toLocaleString() : "-"}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                {selectedTxn.transactionSetCode === "850" && selectedTxn.status === "validated" && !selectedTxn.orderId && (
                  <Button
                    size="sm"
                    onClick={() => convertToOrder.mutate({ transactionId: selectedTxn.id })}
                    disabled={convertToOrder.isPending}
                  >
                    {convertToOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Convert to Order
                  </Button>
                )}
                {selectedTxn.status === "error" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reprocessTxn.mutate({ id: selectedTxn.id })}
                    disabled={reprocessTxn.isPending}
                  >
                    {reprocessTxn.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reprocess
                  </Button>
                )}
              </div>

              {/* Error info */}
              {selectedTxn.errorMessage && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
                  <div className="flex items-center gap-2 font-medium text-red-800 mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    Error
                  </div>
                  <p className="text-red-700">{selectedTxn.errorMessage}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parsed Data */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parsed Data</CardTitle>
            </CardHeader>
            <CardContent>
              {parsedData ? (
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96 font-mono">
                  {JSON.stringify(parsedData, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No parsed data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Line Items */}
        {selectedTxn.items && selectedTxn.items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line Items ({selectedTxn.items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 text-sm font-medium text-muted-foreground">#</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">Buyer Part #</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">Vendor Part #</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">UPC</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">Description</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">Qty</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">UOM</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">Unit Price</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">Total</th>
                      <th className="pb-2 text-sm font-medium text-muted-foreground">Mapped</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedTxn.items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/50">
                        <td className="py-2 text-sm">{item.lineNumber}</td>
                        <td className="py-2 text-sm font-mono">{item.buyerPartNumber || "-"}</td>
                        <td className="py-2 text-sm font-mono">{item.vendorPartNumber || "-"}</td>
                        <td className="py-2 text-sm font-mono">{item.upc || "-"}</td>
                        <td className="py-2 text-sm max-w-[200px] truncate">{item.description || "-"}</td>
                        <td className="py-2 text-sm">{item.quantity}</td>
                        <td className="py-2 text-sm">{item.unitOfMeasure}</td>
                        <td className="py-2 text-sm">${item.unitPrice || "0"}</td>
                        <td className="py-2 text-sm font-medium">${item.totalAmount || "0"}</td>
                        <td className="py-2 text-sm">
                          {item.productId ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Raw EDI Content */}
        {selectedTxn.rawContent && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Raw EDI Content</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
                {selectedTxn.rawContent}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/edi">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              EDI Hub
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">EDI Transactions</h1>
            <p className="text-muted-foreground">Document exchange history and processing</p>
          </div>
        </div>
        <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Process Inbound EDI
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Process Inbound EDI Document</DialogTitle>
              <DialogDescription>Paste raw X12 EDI content to parse and process</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Trading Partner</Label>
                <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trading partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {partners?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name} ({p.isaId})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Raw EDI Content (X12)</Label>
                <Textarea
                  value={rawEdiContent}
                  onChange={(e) => setRawEdiContent(e.target.value)}
                  placeholder="ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260212*1200*U*00401*000000001*0*P*>~GS*PO*SENDER*RECEIVER*20260212*1200*1*X*004010~ST*850*0001~..."
                  className="font-mono text-xs h-48"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowProcessDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleProcessInbound}
                  disabled={processInbound.isPending || !selectedPartnerId || !rawEdiContent.trim()}
                >
                  {processInbound.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Process Document
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filterTxnSet} onValueChange={setFilterTxnSet}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Document Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            <SelectItem value="850">850 - Purchase Order</SelectItem>
            <SelectItem value="855">855 - PO Acknowledgment</SelectItem>
            <SelectItem value="810">810 - Invoice</SelectItem>
            <SelectItem value="856">856 - Ship Notice</SelectItem>
            <SelectItem value="997">997 - Functional Ack</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDirection} onValueChange={setFilterDirection}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Directions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Directions</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="parsed">Parsed</SelectItem>
            <SelectItem value="validated">Validated</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="pt-6">
          {transactions && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Document</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Direction</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">PO #</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Control #</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">ACK</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedTxnId(txn.id)}>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono font-medium">{txn.transactionSetCode}</span>
                          <span className="text-sm text-muted-foreground">{txnSetLabels[txn.transactionSetCode] || ""}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="gap-1">
                          {txn.direction === "inbound" ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {txn.direction}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm font-mono">{txn.purchaseOrderNumber || "-"}</td>
                      <td className="py-3 text-sm font-mono text-muted-foreground">{txn.interchangeControlNumber || "-"}</td>
                      <td className="py-3">
                        <Badge className={statusColors[txn.status] || "bg-gray-100 text-gray-800"} variant="outline">
                          {txn.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm">
                        {txn.ackRequired ? (
                          <Badge variant="outline" className={
                            txn.ackStatus === "received" ? "bg-green-50 text-green-700" :
                            txn.ackStatus === "pending" ? "bg-yellow-50 text-yellow-700" :
                            txn.ackStatus === "overdue" ? "bg-red-50 text-red-700" :
                            ""
                          }>
                            {txn.ackStatus || "n/a"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {new Date(txn.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No transactions found</p>
              <p className="text-sm">Process an inbound EDI document or generate an outbound one</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
