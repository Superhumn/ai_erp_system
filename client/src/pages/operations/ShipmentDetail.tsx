import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, Truck, Package, MapPin,
  Calendar, DollarSign, Hash,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-500/10 text-gray-600",
  in_transit: "bg-blue-500/10 text-blue-600",
  delivered: "bg-green-500/10 text-green-600",
  cancelled: "bg-red-500/10 text-red-600",
};

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const shipmentId = parseInt(id || "0");

  const { data: shipments, isLoading } = trpc.shipments.list.useQuery({});
  const shipment = shipments?.find((s) => s.id === shipmentId);

  const updateShipment = trpc.shipments.update.useMutation({
    onSuccess: () => {
      toast.success("Shipment updated");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="space-y-4">
        <Link href="/operations/shipments">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Shipment not found.</p>
      </div>
    );
  }

  const handleStatusUpdate = (status: string) => {
    updateShipment.mutate({
      id: shipmentId,
      status,
      deliveryDate: status === "delivered" ? new Date().toISOString() : undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/operations/shipments">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Shipments</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6" />
              Shipment #{shipment.id}
            </h1>
            <p className="text-muted-foreground capitalize">{shipment.type} Shipment</p>
          </div>
          <Badge className={statusColors[shipment.status || "pending"]}>{shipment.status || "pending"}</Badge>
        </div>
        <Select value="" onValueChange={handleStatusUpdate}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Update status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Carrier</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{shipment.carrier || "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tracking #</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold font-mono">{shipment.trackingNumber || "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ship Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {shipment.shipDate ? format(new Date(shipment.shipDate), "MMM d, yyyy") : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shipment.cost ? formatCurrency(shipment.cost) : "-"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Route Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {shipment.fromAddress && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">From</span>
                </div>
                <p className="text-sm text-muted-foreground pl-6">{shipment.fromAddress}</p>
              </div>
            )}
            {shipment.toAddress && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">To</span>
                </div>
                <p className="text-sm text-muted-foreground pl-6">{shipment.toAddress}</p>
              </div>
            )}
            {shipment.weight && (
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Weight: {shipment.weight}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <div>
                  <div className="text-sm font-medium">Created</div>
                  <div className="text-xs text-muted-foreground">
                    {shipment.createdAt ? format(new Date(shipment.createdAt), "MMM d, yyyy h:mm a") : "-"}
                  </div>
                </div>
              </div>
              {shipment.shipDate && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <div>
                    <div className="text-sm font-medium">Shipped</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(shipment.shipDate), "MMM d, yyyy")}
                    </div>
                  </div>
                </div>
              )}
              {shipment.deliveryDate && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <div>
                    <div className="text-sm font-medium">Delivered</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(shipment.deliveryDate), "MMM d, yyyy")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {shipment.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{shipment.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
