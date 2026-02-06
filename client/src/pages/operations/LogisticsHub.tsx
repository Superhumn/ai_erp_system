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
  const origin = rfq.originCity && rfq.originCountry 
    ? `${rfq.originCity}, ${rfq.originCountry}` 
    : rfq.originCity || rfq.originCountry || "-";
  const destination = rfq.destinationCity && rfq.destinationCountry 
    ? `${rfq.destinationCity}, ${rfq.destinationCountry}` 
    : rfq.destinationCity || rfq.destinationCountry || "-";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            RFQ #{rfq.rfqNumber || rfq.id}
            <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {origin} → {destination}
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
          <div className="text-xs text-muted-foreground mb-1">Volume</div>
          <div className="font-semibold">{rfq.totalVolume || "-"} CBM</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Required By</div>
          <div className="font-semibold">{formatDate(rfq.requiredDeliveryDate)}</div>
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
                  <div className="font-medium">{quote.carrierName}</div>
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
            Customs Entry #{customs.clearanceNumber || customs.id}
            <Badge variant={customs.status === "cleared" ? "default" : "secondary"}>
              {customs.status?.replace(/_/g, " ") || "Pending"}
            </Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {customs.shipment?.trackingNumber || (customs.shipmentId ? `Shipment #${customs.shipmentId}` : "No linked shipment")}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Type</div>
          <div className="font-semibold capitalize">{customs.type || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">HS Code</div>
          <div className="font-semibold">{customs.hsCode || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Duties</div>
          <div className="font-semibold">{formatCurrency(customs.dutyAmount)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Expected Date</div>
          <div className="font-semibold">{formatDate(customs.expectedClearanceDate)}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Port of Entry</div>
          <div className="font-semibold">{customs.portOfEntry || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Country</div>
          <div className="font-semibold">{customs.country || "-"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Country of Origin</div>
          <div className="font-semibold">{customs.countryOfOrigin || "-"}</div>
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

      {customs.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2">{customs.notes}</p>
        </div>
      )}
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

// Create Freight RFQ Dialog
function CreateFreightRfqDialog({ 
  open, 
  onOpenChange, 
  onSubmit 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    title: "",
    originCity: "",
    originCountry: "",
    destinationCity: "",
    destinationCountry: "",
    cargoDescription: "",
    cargoType: "general" as any,
    totalWeight: "",
    totalVolume: "",
    numberOfPackages: "",
    preferredMode: "any" as any,
    requiredDeliveryDate: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title: formData.title,
      originCity: formData.originCity || undefined,
      originCountry: formData.originCountry || undefined,
      destinationCity: formData.destinationCity || undefined,
      destinationCountry: formData.destinationCountry || undefined,
      cargoDescription: formData.cargoDescription || undefined,
      cargoType: formData.cargoType,
      totalWeight: formData.totalWeight || undefined,
      totalVolume: formData.totalVolume || undefined,
      numberOfPackages: formData.numberOfPackages ? parseInt(formData.numberOfPackages, 10) : undefined,
      preferredMode: formData.preferredMode,
      requiredDeliveryDate: formData.requiredDeliveryDate ? new Date(formData.requiredDeliveryDate) : undefined,
      notes: formData.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Freight RFQ</DialogTitle>
            <DialogDescription>
              Request quotes from freight carriers for your shipment
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">RFQ Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Q1 2024 Electronics Shipment"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="originCity">Origin City</Label>
                <Input
                  id="originCity"
                  value={formData.originCity}
                  onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                  placeholder="e.g., Shenzhen"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="originCountry">Origin Country</Label>
                <Input
                  id="originCountry"
                  value={formData.originCountry}
                  onChange={(e) => setFormData({ ...formData, originCountry: e.target.value })}
                  placeholder="e.g., China"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="destinationCity">Destination City</Label>
                <Input
                  id="destinationCity"
                  value={formData.destinationCity}
                  onChange={(e) => setFormData({ ...formData, destinationCity: e.target.value })}
                  placeholder="e.g., Los Angeles"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destinationCountry">Destination Country</Label>
                <Input
                  id="destinationCountry"
                  value={formData.destinationCountry}
                  onChange={(e) => setFormData({ ...formData, destinationCountry: e.target.value })}
                  placeholder="e.g., USA"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cargoType">Cargo Type</Label>
                <Select value={formData.cargoType} onValueChange={(value: any) => setFormData({ ...formData, cargoType: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="hazardous">Hazardous</SelectItem>
                    <SelectItem value="refrigerated">Refrigerated</SelectItem>
                    <SelectItem value="oversized">Oversized</SelectItem>
                    <SelectItem value="fragile">Fragile</SelectItem>
                    <SelectItem value="liquid">Liquid</SelectItem>
                    <SelectItem value="bulk">Bulk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferredMode">Preferred Mode</Label>
                <Select value={formData.preferredMode} onValueChange={(value: any) => setFormData({ ...formData, preferredMode: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="ocean_fcl">Ocean FCL</SelectItem>
                    <SelectItem value="ocean_lcl">Ocean LCL</SelectItem>
                    <SelectItem value="air">Air</SelectItem>
                    <SelectItem value="express">Express</SelectItem>
                    <SelectItem value="ground">Ground</SelectItem>
                    <SelectItem value="rail">Rail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cargoDescription">Cargo Description</Label>
              <Input
                id="cargoDescription"
                value={formData.cargoDescription}
                onChange={(e) => setFormData({ ...formData, cargoDescription: e.target.value })}
                placeholder="e.g., Electronic components"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalWeight">Total Weight (kg)</Label>
                <Input
                  id="totalWeight"
                  value={formData.totalWeight}
                  onChange={(e) => setFormData({ ...formData, totalWeight: e.target.value })}
                  placeholder="e.g., 5000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalVolume">Total Volume (CBM)</Label>
                <Input
                  id="totalVolume"
                  value={formData.totalVolume}
                  onChange={(e) => setFormData({ ...formData, totalVolume: e.target.value })}
                  placeholder="e.g., 15"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numberOfPackages">Packages</Label>
                <Input
                  id="numberOfPackages"
                  type="number"
                  value={formData.numberOfPackages}
                  onChange={(e) => setFormData({ ...formData, numberOfPackages: e.target.value })}
                  placeholder="e.g., 100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="requiredDeliveryDate">Required Delivery Date</Label>
              <Input
                id="requiredDeliveryDate"
                type="date"
                value={formData.requiredDeliveryDate}
                onChange={(e) => setFormData({ ...formData, requiredDeliveryDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any special requirements or instructions..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create RFQ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Create Customs Clearance Dialog
function CreateCustomsClearanceDialog({ 
  open, 
  onOpenChange, 
  onSubmit 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onSubmit: (data: any) => void;
}) {
  const { data: shipments } = trpc.shipments.list.useQuery();
  const [formData, setFormData] = useState({
    shipmentId: "",
    type: "import" as "import" | "export",
    customsOffice: "",
    portOfEntry: "",
    country: "",
    hsCode: "",
    countryOfOrigin: "",
    expectedClearanceDate: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      shipmentId: formData.shipmentId ? parseInt(formData.shipmentId, 10) : undefined,
      type: formData.type,
      customsOffice: formData.customsOffice || undefined,
      portOfEntry: formData.portOfEntry || undefined,
      country: formData.country || undefined,
      hsCode: formData.hsCode || undefined,
      countryOfOrigin: formData.countryOfOrigin || undefined,
      expectedClearanceDate: formData.expectedClearanceDate ? new Date(formData.expectedClearanceDate) : undefined,
      notes: formData.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Customs Clearance</DialogTitle>
            <DialogDescription>
              Start a new customs clearance entry
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="import">Import</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipmentId">Link to Shipment</Label>
                <Select value={formData.shipmentId} onValueChange={(value) => setFormData({ ...formData, shipmentId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shipment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {shipments?.map((shipment: any) => (
                      <SelectItem key={shipment.id} value={shipment.id.toString()}>
                        {shipment.trackingNumber || `Shipment #${shipment.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="portOfEntry">Port of Entry</Label>
                <Input
                  id="portOfEntry"
                  value={formData.portOfEntry}
                  onChange={(e) => setFormData({ ...formData, portOfEntry: e.target.value })}
                  placeholder="e.g., Port of Los Angeles"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="e.g., United States"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customsOffice">Customs Office</Label>
              <Input
                id="customsOffice"
                value={formData.customsOffice}
                onChange={(e) => setFormData({ ...formData, customsOffice: e.target.value })}
                placeholder="e.g., CBP Los Angeles"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hsCode">HS Code</Label>
                <Input
                  id="hsCode"
                  value={formData.hsCode}
                  onChange={(e) => setFormData({ ...formData, hsCode: e.target.value })}
                  placeholder="e.g., 8471.30.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryOfOrigin">Country of Origin</Label>
                <Input
                  id="countryOfOrigin"
                  value={formData.countryOfOrigin}
                  onChange={(e) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                  placeholder="e.g., China"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedClearanceDate">Expected Clearance Date</Label>
              <Input
                id="expectedClearanceDate"
                type="date"
                value={formData.expectedClearanceDate}
                onChange={(e) => setFormData({ ...formData, expectedClearanceDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional clearance details or special instructions..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Customs Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LogisticsHub() {
  const [activeTab, setActiveTab] = useState("shipments");
  const [expandedShipmentId, setExpandedShipmentId] = useState<number | string | null>(null);
  const [expandedRfqId, setExpandedRfqId] = useState<number | string | null>(null);
  const [expandedTransferId, setExpandedTransferId] = useState<number | string | null>(null);
  const [expandedCustomsId, setExpandedCustomsId] = useState<number | string | null>(null);
  
  // Dialog states
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [rfqDialogOpen, setRfqDialogOpen] = useState(false);
  const [customsDialogOpen, setCustomsDialogOpen] = useState(false);

  // Queries
  const { data: shipments, isLoading: shipmentsLoading, refetch: refetchShipments } = trpc.shipments.list.useQuery();
  const { data: freightRfqs, isLoading: rfqsLoading, refetch: refetchRfqs } = trpc.freight.rfqs.list.useQuery();
  const { data: transfers, isLoading: transfersLoading, refetch: refetchTransfers } = trpc.transfers.list.useQuery();
  const { data: customsData, isLoading: customsLoading, refetch: refetchCustoms } = trpc.customs.clearances.list.useQuery();

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

  // Create mutations
  const createShipment = trpc.shipments.create.useMutation({
    onSuccess: () => {
      toast.success("Shipment created successfully");
      setShipmentDialogOpen(false);
      refetchShipments();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createRfq = trpc.freight.rfqs.create.useMutation({
    onSuccess: () => {
      toast.success("Freight RFQ created successfully");
      setRfqDialogOpen(false);
      refetchRfqs();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createCustomsClearance = trpc.customs.clearances.create.useMutation({
    onSuccess: () => {
      toast.success("Customs clearance created successfully");
      setCustomsDialogOpen(false);
      refetchCustoms();
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
    { 
      key: "origin", 
      header: "Origin", 
      type: "text", 
      sortable: true,
      render: (row) => row.originCity && row.originCountry 
        ? `${row.originCity}, ${row.originCountry}` 
        : row.originCity || row.originCountry || "-"
    },
    { 
      key: "destination", 
      header: "Destination", 
      type: "text", 
      sortable: true,
      render: (row) => row.destinationCity && row.destinationCountry 
        ? `${row.destinationCity}, ${row.destinationCountry}` 
        : row.destinationCity || row.destinationCountry || "-"
    },
    { key: "cargoType", header: "Cargo", type: "text" },
    { key: "totalWeight", header: "Weight", type: "text", render: (row) => `${row.totalWeight || "-"} kg` },
    { key: "status", header: "Status", type: "status", options: rfqStatusOptions, filterable: true },
    { key: "requiredDeliveryDate", header: "Required By", type: "date", sortable: true },
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
    { key: "clearanceNumber", header: "Entry #", type: "text", sortable: true },
    { key: "shipment", header: "Shipment", type: "text", render: (row) => row.shipment?.trackingNumber || (row.shipmentId ? `Shipment #${row.shipmentId}` : "-") },
    { key: "hsCode", header: "HS Code", type: "text" },
    { key: "type", header: "Type", type: "badge", options: [
      { value: "import", label: "Import", color: "bg-blue-100 text-blue-800" },
      { value: "export", label: "Export", color: "bg-green-100 text-green-800" },
    ]},
    { key: "dutyAmount", header: "Duties", type: "currency" },
    { key: "status", header: "Status", type: "badge", options: [
      { value: "pending_documents", label: "Pending Docs", color: "bg-gray-100 text-gray-800" },
      { value: "documents_submitted", label: "Submitted", color: "bg-blue-100 text-blue-800" },
      { value: "under_review", label: "In Review", color: "bg-yellow-100 text-yellow-800" },
      { value: "additional_info_required", label: "Info Required", color: "bg-orange-100 text-orange-800" },
      { value: "cleared", label: "Cleared", color: "bg-green-100 text-green-800" },
      { value: "held", label: "Held", color: "bg-red-100 text-red-800" },
      { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-800" },
    ]},
    { key: "expectedClearanceDate", header: "Expected Date", type: "date", sortable: true },
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
                  onAdd={() => setShipmentDialogOpen(true)}
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
                  onAdd={() => setRfqDialogOpen(true)}
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
                  data={customsData || []}
                  columns={customsColumns}
                  isLoading={customsLoading}
                  emptyMessage="No customs entries found"
                  showSearch
                  showFilters
                  onAdd={() => setCustomsDialogOpen(true)}
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

        {/* Create dialogs */}
        <CreateShipmentDialog
          open={shipmentDialogOpen}
          onOpenChange={setShipmentDialogOpen}
          onSubmit={(data) => createShipment.mutate(data)}
        />
        <CreateFreightRfqDialog
          open={rfqDialogOpen}
          onOpenChange={setRfqDialogOpen}
          onSubmit={(data) => createRfq.mutate(data)}
        />
        <CreateCustomsClearanceDialog
          open={customsDialogOpen}
          onOpenChange={setCustomsDialogOpen}
          onSubmit={(data) => createCustomsClearance.mutate(data)}
        />
      </div>
  );
}
