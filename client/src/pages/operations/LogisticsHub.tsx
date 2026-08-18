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
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import {
  Truck,
  Package,
  Ship,
  Plane,
  Calculator,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/format";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const shipmentStatusOptions = [
  { value: "pending", label: "Pending", color: "bg-muted text-muted-foreground" },
  { value: "picked_up", label: "Picked Up", color: "bg-primary/10 text-primary" },
  { value: "in_transit", label: "In Transit", color: "bg-primary/10 text-primary" },
  { value: "customs", label: "In Customs", color: "bg-primary/10 text-primary" },
  { value: "delivered", label: "Delivered", color: "bg-muted text-muted-foreground" },
  { value: "cancelled", label: "Cancelled", color: "bg-[oklch(0.30_0.02_262)] text-white" },
];

const customsStatusOptions = [
  { value: "pending_documents", label: "Pending Docs", color: "bg-muted text-muted-foreground" },
  { value: "documents_submitted", label: "Submitted", color: "bg-primary/10 text-primary" },
  { value: "under_review", label: "In Review", color: "bg-primary/10 text-primary" },
  { value: "additional_info_required", label: "Info Required", color: "bg-muted text-foreground font-semibold" },
  { value: "cleared", label: "Cleared", color: "bg-muted text-muted-foreground" },
  { value: "held", label: "Held", color: "bg-[oklch(0.30_0.02_262)] text-white" },
  { value: "rejected", label: "Rejected", color: "bg-[oklch(0.30_0.02_262)] text-white" },
  { value: "n/a", label: "N/A", color: "bg-muted text-muted-foreground" },
];

// Detail body for the side-sheet panel. Pure presentation — the sheet
// wrapper (title, close, actions) is provided by <DetailSheet>.
function ShipmentDetailBody({ shipment }: { shipment: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
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
          <div className="font-semibold">
            {shipment.weight || "-"} {shipment.weightUnit || "kg"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Est. Delivery</div>
          <div className="font-semibold">{formatDate(shipment.estimatedDelivery)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Cost</div>
          <div className="font-semibold">{formatCurrency(shipment.cost)}</div>
        </div>
      </div>

      {shipment.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2">
            {shipment.notes}
          </p>
        </div>
      )}
    </div>
  );
}

// Create Shipment Dialog
function CreateShipmentDialog({
  open,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    origin: "",
    destination: "",
    mode: "ground" as "air" | "sea" | "ground",
    carrier: "",
    trackingNumber: "",
    estimatedDelivery: "",
    weight: "",
    cost: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      origin: formData.origin || undefined,
      destination: formData.destination || undefined,
      mode: formData.mode,
      carrier: formData.carrier || undefined,
      trackingNumber: formData.trackingNumber || undefined,
      estimatedDelivery: formData.estimatedDelivery ? new Date(formData.estimatedDelivery) : undefined,
      weight: formData.weight || undefined,
      cost: formData.cost || undefined,
      notes: formData.notes || undefined,
      status: "pending",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Shipment</DialogTitle>
            <DialogDescription>
              Add a new shipment to track freight movement
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Origin *</Label>
                <Input
                  id="origin"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  placeholder="e.g., Shanghai, China"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input
                  id="destination"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  placeholder="e.g., Los Angeles, USA"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mode">Mode</Label>
                <Select value={formData.mode} onValueChange={(value: any) => setFormData({ ...formData, mode: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="air">Air</SelectItem>
                    <SelectItem value="sea">Sea</SelectItem>
                    <SelectItem value="ground">Ground</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier">Carrier</Label>
                <Input
                  id="carrier"
                  value={formData.carrier}
                  onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                  placeholder="e.g., Maersk, DHL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trackingNumber">Tracking Number</Label>
                <Input
                  id="trackingNumber"
                  value={formData.trackingNumber}
                  onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
                  placeholder="Tracking #"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estimatedDelivery">Est. Delivery</Label>
                <Input
                  id="estimatedDelivery"
                  type="date"
                  value={formData.estimatedDelivery}
                  onChange={(e) => setFormData({ ...formData, estimatedDelivery: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  placeholder="e.g., 1000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost ($)</Label>
                <Input
                  id="cost"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="e.g., 5000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional shipment details..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Shipment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LogisticsHub() {
  const [selectedShipment, setSelectedShipment] = useState<any | null>(null);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);

  // Queries
  const { data: shipments, isLoading: shipmentsLoading, refetch: refetchShipments } = trpc.shipments.list.useQuery();
  const { data: customsData } = trpc.customs.clearances.list.useQuery();

  const customsByShipment = (customsData || []).reduce((acc: Record<number, any>, c: any) => {
    if (c.shipmentId) acc[c.shipmentId] = c;
    return acc;
  }, {} as Record<number, any>);

  // Mutations
  const updateShipmentStatus = trpc.shipments.update.useMutation({
    onSuccess: (_data, vars: any) => {
      toast.success("Shipment status updated");
      refetchShipments();
      // Keep panel in sync with new status
      setSelectedShipment((cur: any) =>
        cur && cur.id === vars.id ? { ...cur, status: vars.status } : cur,
      );
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createShipment = trpc.shipments.create.useMutation({
    onSuccess: () => {
      toast.success("Shipment created successfully");
      setShipmentDialogOpen(false);
      refetchShipments();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const enrichedShipments = (shipments || []).map((s: any) => {
    const customs = customsByShipment[s.id];
    return {
      ...s,
      _type: s.direction || (s.mode === "ground" ? "Outbound" : "Inbound"),
      _items: s.items?.length || s.itemCount || "-",
      _weight: s.weight ? `${s.weight} ${s.weightUnit || "kg"}` : "-",
      _actualDelivery: s.actualDelivery || s.deliveredAt || null,
      _customsStatus: customs?.status || "n/a",
      _poOrOrder: s.purchaseOrderNumber || s.orderNumber || s.poNumber || "-",
    };
  });

  const shipmentColumns: Column<any>[] = [
    { key: "trackingNumber", header: "Tracking #", type: "text", sortable: true },
    { key: "_type", header: "Type", type: "badge", options: [
      { value: "Inbound", label: "Inbound", color: "bg-primary/10 text-primary" },
      { value: "Outbound", label: "Outbound", color: "bg-muted text-muted-foreground" },
      { value: "inbound", label: "Inbound", color: "bg-primary/10 text-primary" },
      { value: "outbound", label: "Outbound", color: "bg-muted text-muted-foreground" },
    ]},
    { key: "carrier", header: "Carrier", type: "text" },
    { key: "origin", header: "Origin", type: "text", sortable: true },
    { key: "destination", header: "Destination", type: "text", sortable: true },
    { key: "status", header: "Status", type: "status", options: shipmentStatusOptions, filterable: true },
    { key: "_items", header: "Items", type: "text" },
    { key: "_weight", header: "Weight", type: "text" },
    { key: "estimatedDelivery", header: "Est. Delivery", type: "date", sortable: true },
    { key: "_actualDelivery", header: "Actual Delivery", type: "date", sortable: true },
    { key: "_customsStatus", header: "Customs", type: "status", options: customsStatusOptions, filterable: true },
    { key: "cost", header: "Cost", type: "currency", sortable: true },
    { key: "_poOrOrder", header: "PO/Order #", type: "text" },
  ];

  const stats = {
    totalShipments: shipments?.length || 0,
    inTransit: shipments?.filter((s: any) => s.status === "in_transit").length || 0,
    pending: shipments?.filter((s: any) => s.status === "pending").length || 0,
    inCustoms: shipments?.filter((s: any) => s.status === "customs").length || 0,
    delivered: shipments?.filter((s: any) => s.status === "delivered").length || 0,
  };

  const selectedStatus = selectedShipment
    ? shipmentStatusOptions.find((s) => s.value === selectedShipment.status)
    : null;
  const ModeIcon = selectedShipment
    ? selectedShipment.mode === "air"
      ? Plane
      : selectedShipment.mode === "sea"
      ? Ship
      : Truck
    : Package;

  return (
    <div className="p-6 space-y-2 animate-fade-in">
      {/* Header — single consolidated row */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
          <Truck className="h-4 w-4" />
          Logistics
        </h1>
        <div className="h-4 w-px bg-border" />
        <div><span className="text-muted-foreground">Total</span> <span className="font-bold">{stats.totalShipments}</span></div>
        <div className="h-4 w-px bg-border" />
        <div><span className="text-muted-foreground">Pending</span> <span className="font-bold text-foreground">{stats.pending}</span></div>
        <div className="h-4 w-px bg-border" />
        <div><span className="text-muted-foreground">In Transit</span> <span className="font-bold text-foreground">{stats.inTransit}</span></div>
        <div className="h-4 w-px bg-border" />
        <div><span className="text-muted-foreground">Customs</span> <span className="font-bold text-foreground">{stats.inCustoms}</span></div>
        <div className="h-4 w-px bg-border" />
        <div><span className="text-muted-foreground">Delivered</span> <span className="font-bold text-foreground">{stats.delivered}</span></div>
        <div className="h-4 w-px bg-border" />
        <Link
          href="/operations/material-supply"
          className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          <Ship className="h-3.5 w-3.5" />
          Material Supply &amp; Reorder
        </Link>
        <div className="h-4 w-px bg-border" />
        <Link
          href="/freight/rate-estimator"
          className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          <Calculator className="h-3.5 w-3.5" />
          Ocean Rate Estimator
        </Link>
      </div>

      {/* Shipments table — row click opens side-sheet */}
      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={enrichedShipments}
            columns={shipmentColumns}
            isLoading={shipmentsLoading}
            emptyMessage="No shipments found"
            showSearch
            showFilters
            showExport
            onAdd={() => setShipmentDialogOpen(true)}
            onRowClick={(row) => setSelectedShipment(row)}
            expandedRowId={selectedShipment?.id ?? null}
            compact
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedShipment}
        onOpenChange={(o) => !o && setSelectedShipment(null)}
        width="md"
        title={
          selectedShipment && (
            <span className="flex items-center gap-2">
              <ModeIcon className="h-4 w-4" />
              {selectedShipment.trackingNumber || `Shipment #${selectedShipment.id}`}
              {selectedStatus && (
                <Badge className={selectedStatus.color}>{selectedStatus.label}</Badge>
              )}
            </span>
          )
        }
        subtitle={
          selectedShipment && (
            <>
              {selectedShipment.origin} → {selectedShipment.destination}
            </>
          )
        }
        actions={
          selectedShipment && (
            <>
              {selectedShipment.status === "pending" && (
                <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate({ id: selectedShipment.id, status: "picked_up" } as any)}>
                  Mark Picked Up
                </Button>
              )}
              {selectedShipment.status === "picked_up" && (
                <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate({ id: selectedShipment.id, status: "in_transit" } as any)}>
                  Mark In Transit
                </Button>
              )}
              {selectedShipment.status === "in_transit" && (
                <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate({ id: selectedShipment.id, status: "delivered" } as any)}>
                  Mark Delivered
                </Button>
              )}
            </>
          )
        }
      >
        {selectedShipment && <ShipmentDetailBody shipment={selectedShipment} />}
      </DetailSheet>

      <CreateShipmentDialog
        open={shipmentDialogOpen}
        onOpenChange={setShipmentDialogOpen}
        onSubmit={(data) => createShipment.mutate(data)}
      />
    </div>
  );
}
