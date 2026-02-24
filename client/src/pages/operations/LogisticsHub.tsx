import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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
import { 
  Truck, 
  ArrowRightLeft, 
  MapPin, 
  Package,
  Loader2,
  FileText,
  Ship,
  Plane,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  DollarSign,
  Calendar,
  Send,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
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

const shipmentStatusOptions = [
  { value: "pending", label: "Pending", color: "bg-gray-100 text-gray-800" },
  { value: "picked_up", label: "Picked Up", color: "bg-blue-100 text-blue-800" },
  { value: "in_transit", label: "In Transit", color: "bg-purple-100 text-purple-800" },
  { value: "customs", label: "In Customs", color: "bg-orange-100 text-orange-800" },
  { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

const rfqStatusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-800" },
  { value: "quoted", label: "Quoted", color: "bg-purple-100 text-purple-800" },
  { value: "accepted", label: "Accepted", color: "bg-green-100 text-green-800" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-800" },
];

const transferStatusOptions = [
  { value: "pending", label: "Pending", color: "bg-gray-100 text-gray-800" },
  { value: "in_transit", label: "In Transit", color: "bg-blue-100 text-blue-800" },
  { value: "completed", label: "Completed", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

// Shipment Detail Panel
function ShipmentDetailPanel({ shipment, onClose, onStatusChange }: { 
  shipment: any; 
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  const statusOption = shipmentStatusOptions.find(s => s.value === shipment.status);
  const modeIcon = shipment.mode === "air" ? Plane : shipment.mode === "sea" ? Ship : Truck;
  const ModeIcon = modeIcon;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ModeIcon className="h-5 w-5" />
            {shipment.trackingNumber || `Shipment #${shipment.id}`}
            <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {shipment.origin} → {shipment.destination}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shipment.status === "pending" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(shipment.id, "picked_up")}>
              Mark Picked Up
            </Button>
          )}
          {shipment.status === "picked_up" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(shipment.id, "in_transit")}>
              Mark In Transit
            </Button>
          )}
          {shipment.status === "in_transit" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(shipment.id, "delivered")}>
              Mark Delivered
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Mode</div>
          <div className="font-semibold capitalize">{shipment.mode || "Ground"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Carrier</div>
          <div className="font-semibold">{shipment.carrier || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Weight</div>
          <div className="font-semibold">{shipment.weight || "-"} {shipment.weightUnit || "kg"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Est. Delivery</div>
          <div className="font-semibold">{formatDate(shipment.estimatedDelivery)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Cost</div>
          <div className="font-semibold">{formatCurrency(shipment.cost)}</div>
        </div>
      </div>

      {shipment.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2">{shipment.notes}</p>
        </div>
      )}
    </div>
  );
}

// Freight RFQ Detail Panel
function RfqDetailPanel({ rfq, onClose, onSendToCarriers }: { 
  rfq: any; 
  onClose: () => void;
  onSendToCarriers: (rfq: any) => void;
}) {
  const statusOption = rfqStatusOptions.find(s => s.value === rfq.status);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            RFQ #{rfq.rfqNumber || rfq.id}
            <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {rfq.origin} → {rfq.destination}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rfq.status === "draft" && (
            <Button size="sm" onClick={() => onSendToCarriers(rfq)}>
              <Send className="h-4 w-4 mr-1" />
              Send to Carriers
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Cargo Type</div>
          <div className="font-semibold capitalize">{rfq.cargoType || "General"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Weight</div>
          <div className="font-semibold">{rfq.totalWeight || "-"} kg</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Dimensions</div>
          <div className="font-semibold">{rfq.dimensions || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Required By</div>
          <div className="font-semibold">{formatDate(rfq.requiredDate)}</div>
        </div>
      </div>

      {/* Quotes received */}
      {rfq.quotes && rfq.quotes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Quotes Received ({rfq.quotes.length})</h4>
          <div className="space-y-2">
            {rfq.quotes.map((quote: any) => (
              <div key={quote.id} className="flex items-center justify-between bg-muted/30 rounded p-3">
                <div>
                  <div className="font-medium">{quote.carrierName}
          <AITriggerButton message="Analyze our logistics operations - optimize routes, identify consolidation opportunities, and predict issues" label="AI Logistics Insights" /></div>
                  <div className="text-xs text-muted-foreground">{quote.transitDays} days transit</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(quote.amount)}</div>
                  <Badge variant="outline" className="text-xs">{quote.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Customs Detail Panel
function CustomsDetailPanel({ customs, onClose }: { customs: any; onClose: () => void }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Customs Entry #{customs.entryNumber || customs.id}
            <Badge variant={customs.status === "cleared" ? "default" : "secondary"}>
              {customs.status || "Pending"}
            </Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {customs.shipment?.trackingNumber || `Shipment #${customs.shipmentId}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">HS Code</div>
          <div className="font-semibold">{customs.hsCode || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Declared Value</div>
          <div className="font-semibold">{formatCurrency(customs.declaredValue)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Duties</div>
          <div className="font-semibold">{formatCurrency(customs.dutiesAmount)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Entry Date</div>
          <div className="font-semibold">{formatDate(customs.entryDate)}</div>
        </div>
      </div>

      {/* Documents checklist */}
      <div>
        <h4 className="text-sm font-medium mb-2">Required Documents</h4>
        <div className="grid grid-cols-2 gap-2">
          {["Commercial Invoice", "Packing List", "Bill of Lading", "Certificate of Origin"].map((doc) => (
            <div key={doc} className="flex items-center gap-2 bg-muted/30 rounded p-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">{doc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Transfer Detail Panel
function TransferDetailPanel({ transfer, onClose, onStatusChange }: { 
  transfer: any; 
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  const statusOption = transferStatusOptions.find(s => s.value === transfer.status);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Transfer #{transfer.transferNumber || transfer.id}
            <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {transfer.fromWarehouse?.name || "Origin"} → {transfer.toWarehouse?.name || "Destination"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {transfer.status === "pending" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(transfer.id, "in_transit")}>
              Start Transfer
            </Button>
          )}
          {transfer.status === "in_transit" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(transfer.id, "completed")}>
              Complete Transfer
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Items</div>
          <div className="font-semibold">{transfer.itemCount || 0}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Requested</div>
          <div className="font-semibold">{formatDate(transfer.requestedDate)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Created</div>
          <div className="font-semibold">{formatDate(transfer.createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

export default function LogisticsHub() {
  const [activeTab, setActiveTab] = useState("shipments");
  const [expandedShipmentId, setExpandedShipmentId] = useState<number | string | null>(null);
  const [expandedRfqId, setExpandedRfqId] = useState<number | string | null>(null);
  const [expandedTransferId, setExpandedTransferId] = useState<number | string | null>(null);
  const [expandedCustomsId, setExpandedCustomsId] = useState<number | string | null>(null);

  // Queries
  const { data: shipments, isLoading: shipmentsLoading, refetch: refetchShipments } = trpc.shipments.list.useQuery();
  const { data: freightRfqs, isLoading: rfqsLoading, refetch: refetchRfqs } = trpc.freight.rfqs.list.useQuery();
  const { data: transfers, isLoading: transfersLoading, refetch: refetchTransfers } = trpc.transfers.list.useQuery();
  
  // Mock customs data (would need to add customs table)
  const customsData: any[] = [];
  const customsLoading = false;

  // Mutations
  const updateShipmentStatus = trpc.shipments.update.useMutation({
    onSuccess: () => {
      toast.success("Shipment status updated");
      refetchShipments();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateTransferStatus = trpc.transfers.ship.useMutation({
    onSuccess: () => {
      toast.success("Transfer status updated");
      refetchTransfers();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const sendRfqToCarriers = trpc.freight.rfqs.sendToCarriers.useMutation({
    onSuccess: () => {
      toast.success("RFQ sent to carriers");
      refetchRfqs();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Column definitions
  const shipmentColumns: Column<any>[] = [
    { key: "trackingNumber", header: "Tracking #", type: "text", sortable: true },
    { key: "origin", header: "Origin", type: "text", sortable: true },
    { key: "destination", header: "Destination", type: "text", sortable: true },
    { key: "mode", header: "Mode", type: "badge", options: [
      { value: "air", label: "Air", color: "bg-blue-100 text-blue-800" },
      { value: "sea", label: "Sea", color: "bg-cyan-100 text-cyan-800" },
      { value: "ground", label: "Ground", color: "bg-amber-100 text-amber-800" },
    ]},
    { key: "carrier", header: "Carrier", type: "text" },
    { key: "status", header: "Status", type: "status", options: shipmentStatusOptions, filterable: true },
    { key: "estimatedDelivery", header: "ETA", type: "date", sortable: true },
    { key: "cost", header: "Cost", type: "currency", sortable: true },
  ];

  const rfqColumns: Column<any>[] = [
    { key: "rfqNumber", header: "RFQ #", type: "text", sortable: true },
    { key: "origin", header: "Origin", type: "text", sortable: true },
    { key: "destination", header: "Destination", type: "text", sortable: true },
    { key: "cargoType", header: "Cargo", type: "text" },
    { key: "totalWeight", header: "Weight", type: "text", render: (row) => `${row.totalWeight || "-"} kg` },
    { key: "status", header: "Status", type: "status", options: rfqStatusOptions, filterable: true },
    { key: "requiredDate", header: "Required By", type: "date", sortable: true },
    { key: "quotesCount", header: "Quotes", type: "text", render: (row) => row.quotes?.length || 0 },
  ];

  const transferColumns: Column<any>[] = [
    { key: "transferNumber", header: "Transfer #", type: "text", sortable: true },
    { key: "fromWarehouse", header: "From", type: "text", render: (row) => row.fromWarehouse?.name || "-" },
    { key: "toWarehouse", header: "To", type: "text", render: (row) => row.toWarehouse?.name || "-" },
    { key: "status", header: "Status", type: "status", options: transferStatusOptions, filterable: true },
    { key: "itemCount", header: "Items", type: "number" },
    { key: "requestedDate", header: "Requested", type: "date", sortable: true },
    { key: "createdAt", header: "Created", type: "date", sortable: true },
  ];

  const customsColumns: Column<any>[] = [
    { key: "entryNumber", header: "Entry #", type: "text", sortable: true },
    { key: "shipment", header: "Shipment", type: "text", render: (row) => row.shipment?.trackingNumber || "-" },
    { key: "hsCode", header: "HS Code", type: "text" },
    { key: "declaredValue", header: "Value", type: "currency", sortable: true },
    { key: "dutiesAmount", header: "Duties", type: "currency" },
    { key: "status", header: "Status", type: "badge", options: [
      { value: "pending", label: "Pending", color: "bg-gray-100 text-gray-800" },
      { value: "in_review", label: "In Review", color: "bg-yellow-100 text-yellow-800" },
      { value: "cleared", label: "Cleared", color: "bg-green-100 text-green-800" },
      { value: "held", label: "Held", color: "bg-red-100 text-red-800" },
    ]},
    { key: "entryDate", header: "Entry Date", type: "date", sortable: true },
  ];

  // Stats
  const stats = {
    totalShipments: shipments?.length || 0,
    inTransit: shipments?.filter((s: any) => s.status === "in_transit").length || 0,
    pendingRfqs: freightRfqs?.filter((r: any) => r.status === "draft" || r.status === "sent").length || 0,
    quotedRfqs: freightRfqs?.filter((r: any) => r.status === "quoted").length || 0,
    pendingTransfers: transfers?.filter((t: any) => t.status === "pending").length || 0,
    inCustoms: shipments?.filter((s: any) => s.status === "customs").length || 0,
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Truck className="h-8 w-8" />
              Logistics Hub
            </h1>
            <p className="text-muted-foreground mt-1">
              Shipments, Freight Quotes, Customs, and Transfers - click any row to expand
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("shipments")}>
            <div className="text-2xl font-bold">{stats.totalShipments}</div>
            <div className="text-xs text-muted-foreground">Total Shipments</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("shipments")}>
            <div className="text-2xl font-bold text-blue-600">{stats.inTransit}</div>
            <div className="text-xs text-muted-foreground">In Transit</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("freight-rfqs")}>
            <div className="text-2xl font-bold text-purple-600">{stats.pendingRfqs}</div>
            <div className="text-xs text-muted-foreground">Pending RFQs</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("freight-rfqs")}>
            <div className="text-2xl font-bold text-green-600">{stats.quotedRfqs}</div>
            <div className="text-xs text-muted-foreground">Quotes Received</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("transfers")}>
            <div className="text-2xl font-bold text-amber-600">{stats.pendingTransfers}</div>
            <div className="text-xs text-muted-foreground">Pending Transfers</div>
          </Card>
          <Card className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("customs")}>
            <div className="text-2xl font-bold text-orange-600">{stats.inCustoms}</div>
            <div className="text-xs text-muted-foreground">In Customs</div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="shipments" className="gap-2">
              <Truck className="h-4 w-4" />
              Shipments
            </TabsTrigger>
            <TabsTrigger value="freight-rfqs" className="gap-2">
              <FileText className="h-4 w-4" />
              Freight RFQs
            </TabsTrigger>
            <TabsTrigger value="customs" className="gap-2">
              <FileCheck className="h-4 w-4" />
              Customs
            </TabsTrigger>
            <TabsTrigger value="transfers" className="gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Transfers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shipments" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <SpreadsheetTable
                  data={shipments || []}
                  columns={shipmentColumns}
                  isLoading={shipmentsLoading}
                  emptyMessage="No shipments found"
                  showSearch
                  showFilters
                  showExport
                  expandable
                  expandedRowId={expandedShipmentId}
                  onExpandChange={setExpandedShipmentId}
                  renderExpanded={(shipment, onClose) => (
                    <ShipmentDetailPanel 
                      shipment={shipment} 
                      onClose={onClose}
                      onStatusChange={(id, status) => updateShipmentStatus.mutate({ id, status } as any)}
                    />
                  )}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="freight-rfqs" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <SpreadsheetTable
                  data={freightRfqs || []}
                  columns={rfqColumns}
                  isLoading={rfqsLoading}
                  emptyMessage="No freight RFQs found"
                  showSearch
                  showFilters
                  showExport
                  expandable
                  expandedRowId={expandedRfqId}
                  onExpandChange={setExpandedRfqId}
                  renderExpanded={(rfq, onClose) => (
                    <RfqDetailPanel 
                      rfq={rfq} 
                      onClose={onClose}
                      onSendToCarriers={(r) => sendRfqToCarriers.mutate({ rfqId: rfq.id, carrierIds: [] })}
                    />
                  )}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customs" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <SpreadsheetTable
                  data={customsData}
                  columns={customsColumns}
                  isLoading={customsLoading}
                  emptyMessage="No customs entries found"
                  showSearch
                  showFilters
                  expandable
                  expandedRowId={expandedCustomsId}
                  onExpandChange={setExpandedCustomsId}
                  renderExpanded={(customs, onClose) => (
                    <CustomsDetailPanel customs={customs} onClose={onClose} />
                  )}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transfers" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <SpreadsheetTable
                  data={transfers || []}
                  columns={transferColumns}
                  isLoading={transfersLoading}
                  emptyMessage="No transfers found"
                  showSearch
                  showFilters
                  showExport
                  expandable
                  expandedRowId={expandedTransferId}
                  onExpandChange={setExpandedTransferId}
                  renderExpanded={(transfer, onClose) => (
                    <TransferDetailPanel 
                      transfer={transfer} 
                      onClose={onClose}
                      onStatusChange={(id, status) => {
                      if (status === 'in_transit') updateTransferStatus.mutate({ id });
                    }}
                    />
                  )}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
