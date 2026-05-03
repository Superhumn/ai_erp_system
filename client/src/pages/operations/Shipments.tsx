import { useState, useMemo } from "react";
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
import { Truck, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusOptions = [
  { value: "pending", label: "Pending", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
  { value: "in_transit", label: "In Transit", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "returned", label: "Returned", color: "bg-violet-500/8 text-violet-600 dark:text-violet-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
];

const typeOptions = [
  { value: "inbound", label: "Inbound", color: "bg-blue-500/10 text-blue-600" },
  { value: "outbound", label: "Outbound", color: "bg-green-500/10 text-green-600" },
];

function ShipmentSummaryBody({ s }: { s: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Carrier</div>
          <div className="font-medium">{s.carrier || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Tracking</div>
          <div className="font-mono text-sm">{s.trackingNumber || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Ship Date</div>
          <div className="font-medium">
            {s.shipDate ? format(new Date(s.shipDate), "MMM d, yyyy") : "—"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Delivery Date</div>
          <div className="font-medium">
            {s.deliveryDate ? format(new Date(s.deliveryDate), "MMM d, yyyy") : "—"}
          </div>
        </div>
      </div>
      {s.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
            {s.notes}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Shipments() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    type: "outbound" as "inbound" | "outbound",
    carrier: "",
    trackingNumber: "",
    shipDate: "",
    deliveryDate: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: shipments, isLoading } = trpc.shipments.list.useQuery();
  const createShipment = trpc.shipments.create.useMutation({
    onSuccess: () => {
      toast.success("Shipment created successfully");
      setIsOpen(false);
      setFormData({
        type: "outbound", carrier: "", trackingNumber: "",
        shipDate: "", deliveryDate: "", notes: "",
      });
      utils.shipments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteShipment = trpc.shipments.delete.useMutation({
    onSuccess: () => {
      toast.success("Shipment deleted");
      utils.shipments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const counts = useMemo(() => {
    const list = (shipments || []) as any[];
    return {
      total: list.length,
      pending: list.filter((s) => s.status === "pending").length,
      inTransit: list.filter((s) => s.status === "in_transit").length,
      delivered: list.filter((s) => s.status === "delivered").length,
    };
  }, [shipments]);

  const columns: Column<any>[] = [
    { key: "shipmentNumber", header: "Shipment #", type: "text", sortable: true },
    { key: "type", header: "Type", type: "badge", options: typeOptions, filterable: true },
    { key: "carrier", header: "Carrier", type: "text", sortable: true },
    { key: "trackingNumber", header: "Tracking", type: "text" },
    { key: "shipDate", header: "Ship Date", type: "date", sortable: true },
    { key: "deliveryDate", header: "Delivery", type: "date", sortable: true },
    { key: "status", header: "Status", type: "status", options: statusOptions, filterable: true },
    {
      key: "notes",
      header: "Notes",
      type: "text",
      render: (_row, val) => {
        const s = typeof val === "string" ? val : "";
        return s.length > 40 ? s.slice(0, 40) + "…" : s || "—";
      },
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createShipment.mutate({
      type: formData.type,
      carrier: formData.carrier || undefined,
      trackingNumber: formData.trackingNumber || undefined,
      shipDate: formData.shipDate ? new Date(formData.shipDate) : undefined,
      notes: formData.notes || undefined,
    });
  };

  const selectedStatus = selectedShipment
    ? statusOptions.find((s) => s.value === selectedShipment.status)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-8 w-8" />
            Shipments
          </h1>
          <p className="text-muted-foreground mt-1">
            Track shipments and logistics — click any row for details.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Shipment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>New Shipment</DialogTitle>
                <DialogDescription>Create a new shipment record.</DialogDescription>
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
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="outbound">Outbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="carrier">Carrier</Label>
                    <Input
                      id="carrier"
                      value={formData.carrier}
                      onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                      placeholder="UPS, FedEx, etc."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trackingNumber">Tracking Number</Label>
                  <Input
                    id="trackingNumber"
                    value={formData.trackingNumber}
                    onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
                    placeholder="Tracking number"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shipDate">Ship Date</Label>
                    <Input
                      id="shipDate"
                      type="date"
                      value={formData.shipDate}
                      onChange={(e) => setFormData({ ...formData, shipDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryDate">Delivery Date</Label>
                    <Input
                      id="deliveryDate"
                      type="date"
                      value={formData.deliveryDate}
                      onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createShipment.isPending}>
                  {createShipment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Shipment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em]">{counts.total}</div>
            <p className="text-xs text-muted-foreground">Total Shipments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] text-gray-600">{counts.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] text-amber-600">{counts.inTransit}</div>
            <p className="text-xs text-muted-foreground">In Transit</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] text-green-600">{counts.delivered}</div>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={(shipments || []) as any[]}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No shipments yet — create your first shipment to get started."
            showSearch
            showFilters
            showExport
            onRowClick={(row) => setSelectedShipment(row)}
            expandedRowId={selectedShipment?.id ?? null}
            compact
            bulkActions={[{ key: "delete", label: "Delete", variant: "destructive" }]}
            onBulkAction={(action, ids) => {
              if (action === "delete") {
                Array.from(ids).forEach((id) => deleteShipment.mutate({ id: Number(id) }));
              }
            }}
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedShipment}
        onOpenChange={(o) => !o && setSelectedShipment(null)}
        width="md"
        title={
          selectedShipment && (
            <span className="flex items-center gap-2 font-mono">
              {selectedShipment.shipmentNumber}
              {selectedStatus && (
                <Badge className={selectedStatus.color}>{selectedStatus.label}</Badge>
              )}
            </span>
          )
        }
        subtitle={selectedShipment?.type && (selectedShipment.type === "inbound" ? "Inbound" : "Outbound")}
      >
        {selectedShipment && <ShipmentSummaryBody s={selectedShipment} />}
      </DetailSheet>
    </div>
  );
}
