import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Warehouse, 
  Search, 
  Loader2, 
  Package, 
  MapPin, 
  Truck,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Edit2,
  Check,
  X
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function InventoryManagementHub() {
  const [search, setSearch] = useState("");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: inventory, isLoading, refetch } = trpc.inventory.list.useQuery();
  const updateMutation = trpc.inventory.update.useMutation({
    onSuccess: () => {
      toast.success("Updated successfully");
      refetch();
      setEditingCell(null);
      setEditValue("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const filteredInventory = inventory?.filter((item: any) =>
    item.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.sku?.toLowerCase().includes(search.toLowerCase()) ||
    item.poNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (id: number, field: string, currentValue: any) => {
    setEditingCell({ id, field });
    setEditValue(currentValue || "");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveEdit = async (id: number, field: string) => {
    const updateData: any = { id };
    
    if (field === "forecastedQuantity") {
      updateData.forecastedQuantity = editValue;
    } else if (field === "poStatus") {
      updateData.poStatus = editValue;
    } else if (field === "freightStatus") {
      updateData.freightStatus = editValue;
    } else if (field === "freightTrackingNumber") {
      updateData.freightTrackingNumber = editValue;
    }
    
    await updateMutation.mutateAsync(updateData);
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    
    const statusColors: Record<string, string> = {
      draft: "bg-gray-500/10 text-gray-600",
      sent: "bg-blue-500/10 text-blue-600",
      confirmed: "bg-green-500/10 text-green-600",
      partial: "bg-yellow-500/10 text-yellow-600",
      received: "bg-green-500/10 text-green-600",
      cancelled: "bg-red-500/10 text-red-600",
      pending: "bg-yellow-500/10 text-yellow-600",
      in_transit: "bg-blue-500/10 text-blue-600",
      arrived: "bg-green-500/10 text-green-600",
      delivered: "bg-green-500/10 text-green-600",
    };
    
    return (
      <Badge className={statusColors[status] || "bg-gray-500/10 text-gray-600"}>
        {status.replace(/_/g, " ")}
      </Badge>
    );
  };

  const EditableCell = ({ 
    item, 
    field, 
    value, 
    rawValue,
    type = "text",
    options 
  }: { 
    item: any; 
    field: string; 
    value: any;
    rawValue?: any;
    type?: "text" | "select" | "date";
    options?: string[];
  }) => {
    const isEditing = editingCell?.id === item.id && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          {type === "select" && options ? (
            <Select value={editValue} onValueChange={setEditValue}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-32"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  saveEdit(item.id, field);
                } else if (e.key === "Escape") {
                  cancelEdit();
                }
              }}
            />
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => saveEdit(item.id, field)}
          >
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={cancelEdit}
          >
            <X className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      );
    }
    
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 px-2 py-1 rounded group"
        onClick={() => startEdit(item.id, field, rawValue !== undefined ? rawValue : value)}
      >
        <span>{value || "-"}</span>
        <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-50" />
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Warehouse className="h-8 w-8" />
          Inventory Management Hub
        </h1>
        <p className="text-muted-foreground mt-1">
          Unified view of production forecasts, raw material POs, copacker locations, and freight tracking.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{inventory?.length || 0}</div>
                <p className="text-xs text-muted-foreground">Raw Materials</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {inventory?.filter((i: any) => i.poId).length || 0}
                </div>
                <p className="text-xs text-muted-foreground">Active POs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-amber-600" />
              <div>
                <div className="text-2xl font-bold text-amber-600">
                  {inventory?.filter((i: any) => i.freightId && i.freightStatus === 'in_transit').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">In Transit</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {inventory?.filter((i: any) => i.forecastId).length || 0}
                </div>
                <p className="text-xs text-muted-foreground">Forecasted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Material Tracking</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search materials..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredInventory || filteredInventory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No materials found</p>
              <p className="text-sm">Add raw materials to start tracking inventory.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        Production Forecast
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <ShoppingCart className="h-4 w-4" />
                        Raw Material PO
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <MapPin className="h-4 w-4" />
                        Copacker Location
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Truck className="h-4 w-4" />
                        Freight Tracking
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-sm text-muted-foreground">
                            SKU: {item.sku || "N/A"}
                          </div>
                          {item.category && (
                            <Badge variant="outline" className="mt-1">
                              {item.category}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* Production Forecast */}
                      <TableCell>
                        {item.forecastId ? (
                          <div className="space-y-1">
                            <EditableCell
                              item={item}
                              field="forecastedQuantity"
                              value={item.forecastedQuantity ? `${parseFloat(item.forecastedQuantity).toFixed(0)} ${item.unit}` : "-"}
                            />
                            {item.forecastPeriodStart && (
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(item.forecastPeriodStart), "MMM d")} - {format(new Date(item.forecastPeriodEnd!), "MMM d, yyyy")}
                              </div>
                            )}
                            {item.forecastConfidence && (
                              <div className="text-xs">
                                Confidence: {parseFloat(item.forecastConfidence).toFixed(0)}%
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No forecast</span>
                        )}
                      </TableCell>
                      
                      {/* Raw Material PO */}
                      <TableCell>
                        {item.poId ? (
                          <div className="space-y-1">
                            <div className="font-mono text-sm">
                              <a 
                                href={`/operations/purchase-orders/${item.poId}`} 
                                className="text-blue-600 hover:underline"
                              >
                                {item.poNumber}
                              </a>
                            </div>
                            <EditableCell
                              item={item}
                              field="poStatus"
                              value={getStatusBadge(item.poStatus)}
                              rawValue={item.poStatus}
                              type="select"
                              options={["draft", "sent", "confirmed", "partial", "received", "cancelled"]}
                            />
                            {item.poExpectedDate && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Expected: {format(new Date(item.poExpectedDate), "MMM d, yyyy")}
                              </div>
                            )}
                            {item.poTotalAmount && (
                              <div className="text-xs font-semibold">
                                ${parseFloat(item.poTotalAmount).toFixed(2)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No PO</span>
                        )}
                      </TableCell>
                      
                      {/* Copacker Location */}
                      <TableCell>
                        {item.copackerLocations && item.copackerLocations.length > 0 ? (
                          <div className="space-y-1">
                            {item.copackerLocations.slice(0, 2).map((location: any, idx: number) => (
                              <div key={idx} className="text-sm">
                                <div className="font-medium">{location.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {location.city}, {location.state}
                                </div>
                              </div>
                            ))}
                            {item.copackerLocations.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{item.copackerLocations.length - 2} more
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No copacker</span>
                        )}
                      </TableCell>
                      
                      {/* Freight Tracking */}
                      <TableCell>
                        {item.freightId ? (
                          <div className="space-y-1">
                            <div className="font-mono text-sm">
                              {item.freightBookingNumber}
                            </div>
                            <EditableCell
                              item={item}
                              field="freightStatus"
                              value={getStatusBadge(item.freightStatus)}
                              rawValue={item.freightStatus}
                              type="select"
                              options={["pending", "confirmed", "in_transit", "arrived", "delivered", "cancelled"]}
                            />
                            <EditableCell
                              item={item}
                              field="freightTrackingNumber"
                              value={item.freightTrackingNumber || "Add tracking"}
                            />
                            {item.freightArrivalDate && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                ETA: {format(new Date(item.freightArrivalDate), "MMM d, yyyy")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No freight</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
