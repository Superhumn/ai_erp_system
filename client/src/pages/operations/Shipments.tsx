import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Truck, Plus, Search, Loader2, Package, Upload } from "lucide-react";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { format } from "date-fns";

type Shipment = {
  id: number;
  shipmentNumber: string;
  type: "inbound" | "outbound";
  status: "pending" | "in_transit" | "delivered" | "returned" | "cancelled";
  carrier: string | null;
  trackingNumber: string | null;
  shipDate: Date | null;
  deliveryDate: Date | null;
  notes: string | null;
  createdAt: Date;
};

export default function Shipments() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: "outbound" as "inbound" | "outbound",
    carrier: "",
    trackingNumber: "",
    shipDate: "",
    deliveryDate: "",
    notes: "",
  });

  const { data: shipments, isLoading, refetch } = trpc.shipments.list.useQuery();
  const createShipment = trpc.shipments.create.useMutation({
    onSuccess: () => {
      toast.success("Shipment created successfully");
      setIsOpen(false);
      setFormData({
        type: "outbound", carrier: "", trackingNumber: "",
        shipDate: "", deliveryDate: "", notes: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredShipments = shipments?.filter((shipment: Shipment) => {
    const matchesSearch =
      shipment.shipmentNumber.toLowerCase().includes(search.toLowerCase()) ||
      shipment.trackingNumber?.toLowerCase().includes(search.toLowerCase()) ||
      shipment.carrier?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || shipment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    pending: "bg-gray-500/10 text-gray-600",
    in_transit: "bg-amber-500/10 text-amber-600",
    delivered: "bg-green-500/10 text-green-600",
    returned: "bg-purple-500/10 text-purple-600",
    cancelled: "bg-red-500/10 text-red-600",
  };

  const typeColors: Record<string, string> = {
    inbound: "bg-blue-500/10 text-blue-600",
    outbound: "bg-green-500/10 text-green-600",
  };

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

  // Calculate summary stats
  const inTransitCount = shipments?.filter((s: Shipment) => s.status === "in_transit").length || 0;
  const deliveredCount = shipments?.filter((s: Shipment) => s.status === "delivered").length || 0;
  const pendingCount = shipments?.filter((s: Shipment) => s.status === "pending").length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-8 w-8" />
            Shipments
          </h1>
          <p className="text-muted-foreground mt-1">
            Track shipments and logistics.
          </p>
        </div>
        <div className="flex gap-2">
        <Button variant="outline" onClick={() => setIsImportOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Bulk Import
        </Button>
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
                <DialogDescription>
                  Create a new shipment record.
                </DialogDescription>
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
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{shipments?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total Shipments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">{inTransitCount}</div>
            <p className="text-xs text-muted-foreground">In Transit</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{deliveredCount}</div>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search shipments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredShipments || filteredShipments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No shipments found</p>
              <p className="text-sm">Create your first shipment to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Ship Date</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShipments.map((shipment: Shipment) => (
                  <TableRow key={shipment.id}>
                    <TableCell className="font-mono">{shipment.shipmentNumber}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[shipment.type]}>{shipment.type}</Badge>
                    </TableCell>
                    <TableCell>{shipment.carrier || "-"}</TableCell>
                    <TableCell className="font-mono">{shipment.trackingNumber || "-"}</TableCell>
                    <TableCell>
                      {shipment.shipDate
                        ? format(new Date(shipment.shipDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {shipment.deliveryDate
                        ? format(new Date(shipment.deliveryDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[shipment.status]}>{shipment.status.replace("_", " ")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BulkImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        module="shipments"
        onImportComplete={() => refetch()}
      />
    </div>
  );
}
