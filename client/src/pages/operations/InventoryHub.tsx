import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Package,
  MapPin,
  AlertTriangle,
  Search,
  ChevronRight,
  ChevronDown,
  Truck,
  Factory,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  Play,
  ArrowRight,
  Box,
  Layers,
  Send,
  AlertCircle,
  RefreshCw,
  Plus,
  FileText,
  ExternalLink,
  Loader2,
  Ship,
  Plane,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickCreateDialog } from "@/components/QuickCreateDialog";
import { Link } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
// Types
interface InventoryItem {
  id: number;
  productId: number;
  product?: { id: number; name: string; sku: string; type?: string };
  rawMaterial?: { id: number; name: string; sku: string };
  totalQuantity: number;
  unit: string;
  locations: LocationBreakdown[];
  inTransit: TransitItem[];
  productType: "finished" | "wip" | "material" | "packaging";
}

interface LocationBreakdown {
  warehouseId: number;
  warehouseName: string;
  warehouseType: string;
  available: number;
  onHold: number;
  reserved: number;
  allocated: number;
}

interface TransitItem {
  shipmentId: number;
  quantity: number;
  eta: Date | null;
  from: string;
  to: string;
}

interface Exception {
  id: number;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  entityType: string;
  entityId: number;
  createdAt: Date;
}

export default function InventoryHub() {
  const [activeView, setActiveView] = useState<"exceptions" | "by_item" | "by_location">("exceptions");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [showProductionDialog, setShowProductionDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showNewInventoryDialog, setShowNewInventoryDialog] = useState(false);
  const [showNewLocationDialog, setShowNewLocationDialog] = useState(false);
  const [showWorkOrderDialog, setShowWorkOrderDialog] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any>(null);
  const [showQcHoldDialog, setShowQcHoldDialog] = useState(false);
  const [qcHoldReason, setQcHoldReason] = useState("");
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);
  const [exceptionType, setExceptionType] = useState("yield_variance");
  const [exceptionDescription, setExceptionDescription] = useState("");
  const [selectedWorkOrderForException, setSelectedWorkOrderForException] = useState<any>(null);
  const [showTransferDetailDialog, setShowTransferDetailDialog] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);

  // Data fetching
  const { data: warehouses, isLoading: warehousesLoading } = trpc.warehouses.list.useQuery();
  const { data: inventory, isLoading: inventoryLoading } = trpc.inventory.list.useQuery();
  const { data: rawMaterials, isLoading: materialsLoading } = trpc.rawMaterials.list.useQuery();
  const { data: workOrders, isLoading: workOrdersLoading } = trpc.workOrders.list.useQuery();
  const { data: transfers, isLoading: transfersLoading } = trpc.transfers.list.useQuery();
  const { data: alerts, isLoading: alertsLoading } = trpc.alerts.list.useQuery({ status: "open" });
  const { data: freightBookings } = trpc.freight.bookings.list.useQuery({});
  // Lots and balances will be fetched from inventory data

  const utils = trpc.useUtils();

  // Mutations
  const receiveTransfer = trpc.transfers.receive.useMutation({
    onSuccess: () => {
      toast.success("Shipment received successfully!");
      utils.transfers.invalidate();
      utils.inventory.invalidate();
      // Lots invalidated through inventory
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateWorkOrder = trpc.workOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Work order updated!");
      utils.workOrders.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resolveAlert = trpc.alerts.resolve.useMutation({
    onSuccess: () => {
      toast.success("Exception resolved!");
      utils.alerts.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createAlert = trpc.alerts.create.useMutation({
    onSuccess: () => {
      toast.success("Alert created!");
      utils.alerts.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateInventory = trpc.inventory.update.useMutation({
    onSuccess: () => {
      toast.success("Inventory updated!");
      utils.inventory.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Build inventory by item view data
  const inventoryByItem = useMemo(() => {
    if (!inventory || !warehouses) return [];
    
    const itemMap = new Map<number, InventoryItem>();
    
    // Group inventory by product
    inventory.forEach((inv: any) => {
      const key = inv.productId;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          id: inv.id,
          productId: inv.productId,
          product: inv.product,
          totalQuantity: 0,
          unit: inv.unit || "EA",
          locations: [],
          inTransit: [],
          productType: "finished",
        });
      }
      
      const item = itemMap.get(key)!;
      const qty = parseFloat(inv.quantity) || 0;
      const reserved = parseFloat(inv.reservedQuantity) || 0;
      item.totalQuantity += qty;
      
      const warehouse = warehouses.find((w: any) => w.id === inv.warehouseId);
      if (warehouse) {
        const existingLoc = item.locations.find(l => l.warehouseId === inv.warehouseId);
        if (existingLoc) {
          existingLoc.available += qty - reserved;
          existingLoc.reserved += reserved;
        } else {
          item.locations.push({
            warehouseId: inv.warehouseId,
            warehouseName: warehouse.name,
            warehouseType: warehouse.type,
            available: qty - reserved,
            onHold: 0,
            reserved: reserved,
            allocated: 0,
          });
        }
      }
    });

    // Add raw materials
    rawMaterials?.forEach((mat: any) => {
      const key = -mat.id; // Negative to distinguish from products
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          id: mat.id,
          productId: mat.id,
          rawMaterial: mat,
          totalQuantity: parseFloat(mat.quantityOnHand) || 0,
          unit: mat.unit || "LB",
          locations: [],
          inTransit: [],
          productType: "material",
        });
        
        // Add location if warehouse exists
        if (mat.warehouseId) {
          const warehouse = warehouses.find((w: any) => w.id === mat.warehouseId);
          if (warehouse) {
            itemMap.get(key)!.locations.push({
              warehouseId: mat.warehouseId,
              warehouseName: warehouse.name,
              warehouseType: warehouse.type,
              available: parseFloat(mat.quantityOnHand) || 0,
              onHold: 0,
              reserved: parseFloat(mat.quantityOnOrder) || 0,
              allocated: 0,
            });
          }
        }
      }
    });

    // Add in-transit items from transfers
    transfers?.forEach((transfer: any) => {
      if (transfer.status === "in_transit") {
        transfer.items?.forEach((item: any) => {
          const invItem = itemMap.get(item.productId);
          if (invItem) {
            const fromWarehouse = warehouses.find((w: any) => w.id === transfer.fromWarehouseId);
            const toWarehouse = warehouses.find((w: any) => w.id === transfer.toWarehouseId);
            invItem.inTransit.push({
              shipmentId: transfer.id,
              quantity: parseFloat(item.shippedQuantity) || parseFloat(item.requestedQuantity) || 0,
              eta: transfer.expectedArrival,
              from: fromWarehouse?.name || "Unknown",
              to: toWarehouse?.name || "Unknown",
            });
          }
        });
      }
    });

    return Array.from(itemMap.values()).filter(item => 
      !searchTerm || 
      item.product?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product?.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.rawMaterial?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.rawMaterial?.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [inventory, rawMaterials, warehouses, transfers, searchTerm]);

  // Build inventory by location view data
  const inventoryByLocation = useMemo(() => {
    if (!warehouses || !inventory) return [];
    
    return warehouses.map((warehouse: any) => {
      const warehouseInventory = inventory.filter((inv: any) => inv.warehouseId === warehouse.id);
      const warehouseMaterials = rawMaterials?.filter((mat: any) => mat.warehouseId === warehouse.id) || [];
      
      return {
        ...warehouse,
        rawMaterials: warehouseMaterials.map((mat: any) => ({
          id: mat.id,
          name: mat.name,
          sku: mat.sku,
          quantity: parseFloat(mat.quantityOnHand) || 0,
          unit: mat.unit,
          status: "available",
        })),
        finishedGoods: warehouseInventory.map((inv: any) => ({
          id: inv.id,
          name: inv.product?.name || "Unknown",
          sku: inv.product?.sku || "",
          quantity: parseFloat(inv.quantity) || 0,
          unit: inv.unit || "EA",
          status: parseFloat(inv.reservedQuantity) > 0 ? "allocated" : "available",
        })),
        totalItems: warehouseInventory.length + warehouseMaterials.length,
      };
    }).filter((loc: any) => 
      !selectedLocation || loc.id === selectedLocation
    );
  }, [warehouses, inventory, rawMaterials, selectedLocation]);

  // Build exceptions from alerts
  const exceptions = useMemo(() => {
    if (!alerts) return [];
    
    return alerts.map((alert: any) => ({
      id: alert.id,
      type: alert.alertType as Exception["type"],
      severity: alert.severity as Exception["severity"],
      title: alert.title,
      description: alert.message,
      entityType: alert.entityType,
      entityId: alert.entityId,
      createdAt: alert.createdAt,
    })).filter((exc: Exception) =>
      ["delayed_shipment", "blocked_production", "yield_variance", "qc_hold", "stranded_inventory", "low_stock", "late_shipment"].includes(exc.type)
    );
  }, [alerts]);

  // Pending work orders
  const pendingWorkOrders = useMemo(() => {
    return workOrders?.filter((wo: any) => 
      wo.status === "pending" || wo.status === "in_progress"
    ) || [];
  }, [workOrders]);

  // In-transit shipments
  const inTransitShipments = useMemo(() => {
    return transfers?.filter((t: any) => t.status === "in_transit") || [];
  }, [transfers]);

  const toggleExpanded = (id: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const handleReceiveShipment = (transferId: number) => {
    // For one-click receive, we receive all items at full quantity
    // The backend will handle the actual item lookup
    receiveTransfer.mutate({ id: transferId, items: [] });
  };

  const handleResolveException = (alertId: number) => {
    resolveAlert.mutate({ id: alertId, notes: "Resolved via Inventory Hub" });
  };

  const handleViewWorkOrderDetails = (wo: any) => {
    setSelectedWorkOrder(wo);
    setShowWorkOrderDialog(true);
  };

  const handleQcHold = (item: any) => {
    setSelectedItem(item);
    setQcHoldReason("");
    setShowQcHoldDialog(true);
  };

  const submitQcHold = () => {
    if (!selectedItem || !qcHoldReason.trim()) {
      toast.error("Please provide a reason for QC hold");
      return;
    }
    createAlert.mutate({
      type: "quality_issue",
      severity: "warning",
      title: `QC Hold: ${selectedItem.product?.name || selectedItem.rawMaterial?.name || "Unknown Item"}`,
      description: qcHoldReason,
      entityType: "inventory",
      entityId: selectedItem.id,
    });
    setShowQcHoldDialog(false);
    setQcHoldReason("");
    setSelectedItem(null);
  };

  const handleReportException = (wo: any) => {
    setSelectedWorkOrderForException(wo);
    setExceptionType("yield_variance");
    setExceptionDescription("");
    setShowExceptionDialog(true);
  };

  const submitException = () => {
    if (!selectedWorkOrderForException || !exceptionDescription.trim()) {
      toast.error("Please provide a description for the exception");
      return;
    }
    // Map exception types to valid alert types
    const alertTypeMap: Record<string, string> = {
      yield_variance: "yield_variance",
      blocked_production: "shortage",
      qc_hold: "quality_issue",
      equipment_failure: "shortage",
      material_shortage: "shortage",
    };
    const alertType = alertTypeMap[exceptionType] || "yield_variance";
    createAlert.mutate({
      type: alertType as any,
      severity: exceptionType === "blocked_production" || exceptionType === "material_shortage" ? "critical" : "warning",
      title: `${exceptionType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}: WO-${selectedWorkOrderForException.id}`,
      description: exceptionDescription,
      entityType: "workOrder",
      entityId: selectedWorkOrderForException.id,
    });
    setShowExceptionDialog(false);
    setExceptionDescription("");
    setSelectedWorkOrderForException(null);
  };

  const handleViewTransferDetails = (transfer: any) => {
    setSelectedTransfer(transfer);
    setShowTransferDetailDialog(true);
  };

  // Find freight booking for a transfer
  const getFreightBookingForTransfer = (transfer: any) => {
    return freightBookings?.find((booking: any) =>
      booking.shipmentId === transfer.id ||
      booking.referenceNumber === transfer.transferNumber
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "finished": return <Package className="h-4 w-4 text-green-500" />;
      case "wip": return <Factory className="h-4 w-4 text-yellow-500" />;
      case "material": return <Layers className="h-4 w-4 text-blue-500" />;
      case "packaging": return <Box className="h-4 w-4 text-purple-500" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-100 text-red-800 border-red-200";
      case "warning": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-blue-100 text-blue-800 border-blue-200";
    }
  };

  const getLocationIcon = (type: string) => {
    switch (type) {
      case "copacker": return <Factory className="h-4 w-4" />;
      case "3pl": return <Truck className="h-4 w-4" />;
      case "warehouse": return <Package className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  const isLoading = warehousesLoading || inventoryLoading || materialsLoading || workOrdersLoading || transfersLoading || alertsLoading;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">Multi-location inventory tracking across all copackers</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[280px]"
            />
          </div>
          <Button variant="outline" onClick={() => utils.inventory.invalidate()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Toggle Tabs */}
      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="exceptions" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Exceptions
            {exceptions.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {exceptions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="by_item" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            By Item
          </TabsTrigger>
          <TabsTrigger value="by_location" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            By Location
          </TabsTrigger>
        </TabsList>

        {/* Quick Create Buttons */}
        <div className="flex gap-2 mt-4">
          <Button onClick={() => setShowNewInventoryDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Inventory Item
          </Button>
          <Button onClick={() => setShowNewLocationDialog(true)} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" /> New Location
          </Button>
        </div>

        {/* Exceptions View */}
        <TabsContent value="exceptions" className="mt-6">
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-4">
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <Truck className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Delayed Shipments</p>
                      <p className="text-2xl font-bold">{exceptions.filter(e => e.type === "delayed_shipment" || e.type === "late_shipment" || e.type === "shortage").length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-orange-200 bg-orange-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Factory className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Blocked Production</p>
                      <p className="text-2xl font-bold">{exceptions.filter(e => e.type === "blocked_production").length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-yellow-200 bg-yellow-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-100 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Yield Variance</p>
                      <p className="text-2xl font-bold">{exceptions.filter(e => e.type === "yield_variance").length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-purple-200 bg-purple-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Shield className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">QC Holds</p>
                      <p className="text-2xl font-bold">{exceptions.filter(e => e.type === "qc_hold").length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-gray-200 bg-gray-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Package className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Low Stock</p>
                      <p className="text-2xl font-bold">{exceptions.filter(e => e.type === "low_stock" || e.type === "shortage").length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Exception List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>Active Exceptions</CardTitle>
                <CardDescription>Issues requiring attention</CardDescription>
              </CardHeader>
              <CardContent>
                {exceptions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p className="text-lg font-medium">All Clear!</p>
                    <p>No exceptions requiring attention</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {exceptions.map((exc) => (
                      <div 
                        key={exc.id}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-lg border",
                          getSeverityColor(exc.severity)
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-white/50 rounded-lg">
                            {exc.type === "delayed_shipment" || exc.type === "late_shipment" ? <Truck className="h-5 w-5" /> :
                             exc.type === "blocked_production" ? <Factory className="h-5 w-5" /> :
                             exc.type === "yield_variance" ? <AlertCircle className="h-5 w-5" /> :
                             exc.type === "qc_hold" ? <Shield className="h-5 w-5" /> :
                             <Package className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-medium">{exc.title}</p>
                            <p className="text-sm opacity-80">{exc.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-white/50">
                            {exc.entityType} #{exc.entityId}
                          </Badge>
                          <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={() => handleResolveException(exc.id)}
                          >
                            Resolve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Production Orders with Transformation Visualization */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  Active Production Orders
                </CardTitle>
                <CardDescription>Material transformations in progress</CardDescription>
              </CardHeader>
              <CardContent>
                {workOrders?.filter((wo: any) => wo.status === "in_progress").length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">No active production orders</p>
                ) : (
                  <div className="space-y-4">
                    {workOrders?.filter((wo: any) => wo.status === "in_progress").map((wo: any) => (
                      <div key={wo.id} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-green-50">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="font-semibold text-lg">{wo.workOrderNumber}</p>
                            <p className="text-sm text-muted-foreground">
                              Started: {new Date(wo.startDate || wo.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge className="bg-blue-500">{wo.status}</Badge>
                        </div>
                        
                        {/* Transformation Visualization */}
                        <div className="flex items-center gap-4">
                          {/* Input Materials */}
                          <div className="flex-1 p-3 bg-white rounded-lg border">
                            <p className="text-xs font-medium text-muted-foreground mb-2">INPUT MATERIALS</p>
                            <div className="space-y-1">
                              {wo.bom?.components?.slice(0, 3).map((comp: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span>{comp.rawMaterial?.name || comp.name || "Material"}</span>
                                  <span className="font-medium">{comp.quantity} {comp.unit || "LB"}</span>
                                </div>
                              )) || (
                                <p className="text-sm text-muted-foreground">BOM materials</p>
                              )}
                              {wo.bom?.components?.length > 3 && (
                                <p className="text-xs text-muted-foreground">+{wo.bom.components.length - 3} more</p>
                              )}
                            </div>
                          </div>
                          
                          {/* Arrow */}
                          <div className="flex flex-col items-center">
                            <ArrowRight className="h-8 w-8 text-blue-500" />
                            <span className="text-xs text-muted-foreground mt-1">Transform</span>
                          </div>
                          
                          {/* Output Product */}
                          <div className="flex-1 p-3 bg-white rounded-lg border border-green-200">
                            <p className="text-xs font-medium text-muted-foreground mb-2">OUTPUT</p>
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{wo.product?.name || wo.bom?.product?.name || "Product"}</span>
                              <span className="text-lg font-bold text-green-600">{wo.quantity} {wo.unit || "EA"}</span>
                            </div>
                            {wo.completedQuantity > 0 && (
                              <div className="mt-2">
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                  <span>Progress</span>
                                  <span>{Math.round((wo.completedQuantity / wo.quantity) * 100)}%</span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-green-500 rounded-full transition-all"
                                    style={{ width: `${(wo.completedQuantity / wo.quantity) * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex justify-end gap-2 mt-4">
                          <Button size="sm" variant="outline" onClick={() => handleViewWorkOrderDetails(wo)}>
                            <FileText className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleReportException(wo)}>
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Exception
                          </Button>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              updateWorkOrder.mutate({ id: wo.id, status: "completed" });
                            }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Complete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Incoming Shipments with One-Click Receive */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Incoming Shipments
                </CardTitle>
                <CardDescription>Shipments ready to receive</CardDescription>
              </CardHeader>
              <CardContent>
                {transfers?.filter((t: any) => t.status === "in_transit").length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">No incoming shipments</p>
                ) : (
                  <div className="space-y-3">
                    {transfers?.filter((t: any) => t.status === "in_transit").map((transfer: any) => {
                      const fromWarehouse = warehouses?.find((w: any) => w.id === transfer.fromWarehouseId);
                      const toWarehouse = warehouses?.find((w: any) => w.id === transfer.toWarehouseId);
                      const freightBooking = getFreightBookingForTransfer(transfer);
                      return (
                        <div
                          key={transfer.id}
                          className="p-4 border rounded-lg bg-blue-50/50 hover:bg-blue-100/50 cursor-pointer transition-colors"
                          onClick={() => handleViewTransferDetails(transfer)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="p-2 bg-blue-100 rounded-lg">
                                {freightBooking?.quote?.shippingMode === "ocean" ? <Ship className="h-5 w-5 text-blue-600" /> :
                                 freightBooking?.quote?.shippingMode === "air" ? <Plane className="h-5 w-5 text-blue-600" /> :
                                 <Truck className="h-5 w-5 text-blue-600" />}
                              </div>
                              <div>
                                <p className="font-medium">{transfer.transferNumber}</p>
                                <p className="text-sm text-muted-foreground">
                                  {fromWarehouse?.name || "Unknown"} → {toWarehouse?.name || "Unknown"}
                                </p>
                                {freightBooking && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">
                                      {freightBooking.carrier?.name || "Carrier TBD"}
                                    </Badge>
                                    {freightBooking.trackingNumber && (
                                      <Badge variant="secondary" className="text-xs">
                                        {freightBooking.trackingNumber}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {transfer.expectedArrival && (
                                <div className="text-right">
                                  <p className="text-sm text-muted-foreground">ETA</p>
                                  <p className="font-medium">{new Date(transfer.expectedArrival).toLocaleDateString()}</p>
                                </div>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleViewTransferDetails(transfer); }}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Details
                              </Button>
                              <Button
                                className="bg-green-600 hover:bg-green-700"
                                onClick={(e) => { e.stopPropagation(); handleReceiveShipment(transfer.id); }}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                One-Click Receive
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Inventory by Item View */}
        <TabsContent value="by_item" className="mt-6">
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading inventory...</p>
              </div>
            ) : inventoryByItem.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4" />
                <p>No inventory items found</p>
              </div>
            ) : (
              inventoryByItem.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <div 
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleExpanded(item.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {expandedItems.has(item.id) ? 
                            <ChevronDown className="h-5 w-5 text-muted-foreground" /> : 
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          }
                          {getTypeIcon(item.productType)}
                        </div>
                        <div>
                          <p className="font-semibold">
                            {item.product?.name || item.rawMaterial?.name || "Unknown Item"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {item.product?.sku || item.rawMaterial?.sku}
                            {item.productType !== "finished" && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {item.productType === "material" ? "Raw Material" : 
                                 item.productType === "wip" ? "Semi-Finished" : item.productType}
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-2xl font-bold">
                            {item.totalQuantity.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{item.unit}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">Total Owned</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setShowShipmentDialog(true); }}>
                            <Send className="h-4 w-4 mr-1" />
                            Create Shipment
                          </Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setShowProductionDialog(true); }}>
                            <Factory className="h-4 w-4 mr-1" />
                            Allocate
                          </Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleQcHold(item); }}>
                            <Shield className="h-4 w-4 mr-1" />
                            QC Hold
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {expandedItems.has(item.id) && (
                    <div className="border-t bg-muted/30 p-4">
                      <div className="grid grid-cols-2 gap-6">
                        {/* Location Breakdown */}
                        <div className="space-y-3">
                          {item.locations.map((loc, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                              <div className="p-2 bg-muted rounded-lg">
                                {getLocationIcon(loc.warehouseType)}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{loc.warehouseName}</p>
                                  <Badge variant="outline" className="text-xs">{loc.warehouseType}</Badge>
                                </div>
                                <div className="mt-2 space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Available:</span>
                                    <span className="font-medium text-green-600">{loc.available.toLocaleString()} {item.unit}</span>
                                  </div>
                                  {loc.onHold > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">On Hold (QC):</span>
                                      <span className="font-medium text-yellow-600">{loc.onHold.toLocaleString()} {item.unit}</span>
                                    </div>
                                  )}
                                  {loc.reserved > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Reserved:</span>
                                      <span className="font-medium text-blue-600">{loc.reserved.toLocaleString()} {item.unit}</span>
                                    </div>
                                  )}
                                  {loc.allocated > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Allocated to Production:</span>
                                      <span className="font-medium text-purple-600">{loc.allocated.toLocaleString()} {item.unit}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* In Transit */}
                        <div className="space-y-3">
                          <p className="font-medium text-muted-foreground">In Transit</p>
                          {item.inTransit.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No shipments in transit</p>
                          ) : (
                            item.inTransit.map((transit, idx) => (
                              <div key={idx} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <Truck className="h-5 w-5 text-blue-600" />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{transit.quantity.toLocaleString()} {item.unit}</span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">{transit.from} → {transit.to}</span>
                                  </div>
                                  {transit.eta && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                      <Clock className="h-3 w-3" />
                                      ETA: {new Date(transit.eta).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => handleReceiveShipment(transit.shipmentId)}>
                                  Receive
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Inventory by Location View */}
        <TabsContent value="by_location" className="mt-6">
          <div className="space-y-4">
            {/* Location Filter */}
            <div className="flex items-center gap-4">
              <Select 
                value={selectedLocation?.toString() || "all"} 
                onValueChange={(v) => setSelectedLocation(v === "all" ? null : parseInt(v))}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {warehouses?.map((w: any) => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      {w.name} ({w.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location Cards */}
            {inventoryByLocation.map((location: any) => (
              <Card key={location.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        {getLocationIcon(location.type)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{location.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Badge variant="outline">{location.type}</Badge>
                          {location.city && <span>{location.city}, {location.country}</span>}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{location.totalItems}</p>
                      <p className="text-sm text-muted-foreground">Total Items</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    {/* Raw / Semi-Finished */}
                    <div>
                      <p className="font-medium text-muted-foreground mb-3">Raw / Semi-Finished</p>
                      <div className="space-y-2">
                        {location.rawMaterials.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No raw materials at this location</p>
                        ) : (
                          location.rawMaterials.slice(0, 5).map((mat: any) => (
                            <div key={mat.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{mat.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono">{mat.quantity.toLocaleString()} {mat.unit}</span>
                                <Badge variant={mat.status === "available" ? "default" : "secondary"} className="text-xs">
                                  {mat.status}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                        {location.rawMaterials.length > 5 && (
                          <p className="text-sm text-muted-foreground text-center">
                            +{location.rawMaterials.length - 5} more items
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Finished Goods */}
                    <div>
                      <p className="font-medium text-muted-foreground mb-3">Finished Goods</p>
                      <div className="space-y-2">
                        {location.finishedGoods.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No finished goods at this location</p>
                        ) : (
                          location.finishedGoods.slice(0, 5).map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-green-500" />
                                <span className="font-medium">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono">{item.quantity.toLocaleString()} {item.unit}</span>
                                <Badge variant={item.status === "available" ? "default" : "secondary"} className="text-xs">
                                  {item.status}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                        {location.finishedGoods.length > 5 && (
                          <p className="text-sm text-muted-foreground text-center">
                            +{location.finishedGoods.length - 5} more items
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Production Orders Section (Always Visible) */}
      {(activeView === "by_item" || activeView === "by_location") && pendingWorkOrders.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Active Production Orders
            </CardTitle>
            <CardDescription>Work orders transforming inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {pendingWorkOrders.slice(0, 4).map((wo: any) => (
                <div key={wo.id} className="p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">WO-{wo.id}</Badge>
                      <Badge variant={wo.status === "in_progress" ? "default" : "secondary"}>
                        {wo.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Yield: {wo.yieldPercent || "—"}%
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    {/* Inputs */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Inputs</p>
                      <p className="text-sm">
                        {wo.bom?.name || "BOM"} × {wo.quantity}
                      </p>
                    </div>
                    
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    
                    {/* Outputs */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Outputs</p>
                      <p className="text-sm">
                        {wo.product?.name || "Product"} × {wo.quantity}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    {wo.status === "pending" && (
                      <Button size="sm" onClick={() => updateWorkOrder.mutate({ id: wo.id, status: "in_progress" })}>
                        <Play className="h-4 w-4 mr-1" />
                        Start
                      </Button>
                    )}
                    {wo.status === "in_progress" && (
                      <Button size="sm" onClick={() => updateWorkOrder.mutate({ id: wo.id, status: "completed" })}>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Complete
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleReportException(wo)}>
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      Exception
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* In-Transit Shipments Section */}
      {inTransitShipments.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Shipments In Transit
            </CardTitle>
            <CardDescription>Inventory moving between locations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inTransitShipments.map((shipment: any) => {
                const fromWarehouse = warehouses?.find((w: any) => w.id === shipment.fromWarehouseId);
                const toWarehouse = warehouses?.find((w: any) => w.id === shipment.toWarehouseId);
                const freightBooking = getFreightBookingForTransfer(shipment);

                return (
                  <div
                    key={shipment.id}
                    className="p-4 border rounded-lg bg-blue-50/50 border-blue-200 hover:bg-blue-100/50 cursor-pointer transition-colors"
                    onClick={() => handleViewTransferDetails(shipment)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          {freightBooking?.quote?.shippingMode === "ocean" ? <Ship className="h-5 w-5 text-blue-600" /> :
                           freightBooking?.quote?.shippingMode === "air" ? <Plane className="h-5 w-5 text-blue-600" /> :
                           <Truck className="h-5 w-5 text-blue-600" />}
                        </div>
                        <div>
                          <p className="font-medium">Shipment #{shipment.transferNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {fromWarehouse?.name || "Unknown"} → {toWarehouse?.name || "Unknown"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {shipment.items?.slice(0, 2).map((item: any, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {item.product?.name || "Item"}: {item.shippedQuantity || item.requestedQuantity}
                              </Badge>
                            ))}
                            {shipment.items?.length > 2 && (
                              <Badge variant="secondary" className="text-xs">+{shipment.items.length - 2} more</Badge>
                            )}
                          </div>
                          {freightBooking && (
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs bg-blue-100">
                                {freightBooking.carrier?.name || "Carrier"}
                              </Badge>
                              {freightBooking.trackingNumber && (
                                <Badge variant="secondary" className="text-xs">
                                  Tracking: {freightBooking.trackingNumber}
                                </Badge>
                              )}
                              <Badge className={cn(
                                "text-xs",
                                freightBooking.status === "in_transit" ? "bg-purple-500" :
                                freightBooking.status === "delivered" ? "bg-green-500" :
                                "bg-gray-500"
                              )}>
                                {freightBooking.status?.replace(/_/g, " ")}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {shipment.expectedArrival && (
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">ETA</p>
                            <p className="font-medium">{new Date(shipment.expectedArrival).toLocaleDateString()}</p>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleViewTransferDetails(shipment); }}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                        <Button onClick={(e) => { e.stopPropagation(); handleReceiveShipment(shipment.id); }} disabled={receiveTransfer.isPending}>
                          {receiveTransfer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <CheckCircle className="h-4 w-4 mr-2" />
                          RECEIVE
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shipment Dialog */}
      <Dialog open={showShipmentDialog} onOpenChange={setShowShipmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Create a shipment for {selectedItem?.product?.name || selectedItem?.rawMaterial?.name}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">From Location</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source location" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedItem?.locations?.map((loc: any) => (
                      <SelectItem key={loc.warehouseId} value={loc.warehouseId.toString()}>
                        {loc.warehouseName} ({loc.available.toLocaleString()} available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">To Location</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((w: any) => (
                      <SelectItem key={w.id} value={w.id.toString()}>
                        {w.name} ({w.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Quantity</label>
                <Input type="number" placeholder="Enter quantity" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShipmentDialog(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Shipment created!"); setShowShipmentDialog(false); }}>
              Create Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production Allocation Dialog */}
      <Dialog open={showProductionDialog} onOpenChange={setShowProductionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate to Production</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Allocate {selectedItem?.product?.name || selectedItem?.rawMaterial?.name} to a work order
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Work Order</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select work order" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingWorkOrders.map((wo: any) => (
                      <SelectItem key={wo.id} value={wo.id.toString()}>
                        WO-{wo.id}: {wo.product?.name} × {wo.quantity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Quantity to Allocate</label>
                <Input type="number" placeholder="Enter quantity" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductionDialog(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Allocated to production!"); setShowProductionDialog(false); }}>
              Allocate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Dialogs */}
      <QuickCreateDialog
        entityType="inventory"
        open={showNewInventoryDialog}
        onOpenChange={setShowNewInventoryDialog}
        onCreated={() => {
          utils.inventory.invalidate();
          setShowNewInventoryDialog(false);
        }}
      />
      <QuickCreateDialog
        entityType="location"
        open={showNewLocationDialog}
        onOpenChange={setShowNewLocationDialog}
        onCreated={() => {
          utils.warehouses.invalidate();
          setShowNewLocationDialog(false);
        }}
      />

      {/* Work Order Detail Dialog */}
      <Dialog open={showWorkOrderDialog} onOpenChange={setShowWorkOrderDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Work Order Details
            </DialogTitle>
            <DialogDescription>
              {selectedWorkOrder?.workOrderNumber || `WO-${selectedWorkOrder?.id}`}
            </DialogDescription>
          </DialogHeader>
          {selectedWorkOrder && (
            <div className="space-y-4">
              {/* Status and Basic Info */}
              <div className="flex items-center justify-between">
                <Badge className={cn(
                  selectedWorkOrder.status === "completed" ? "bg-green-500" :
                  selectedWorkOrder.status === "in_progress" ? "bg-blue-500" :
                  selectedWorkOrder.status === "cancelled" ? "bg-red-500" :
                  "bg-yellow-500"
                )}>
                  {selectedWorkOrder.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Created: {new Date(selectedWorkOrder.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Product Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Product</p>
                  <p className="font-medium">{selectedWorkOrder.product?.name || selectedWorkOrder.bom?.product?.name || "Unknown"}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="font-medium">{selectedWorkOrder.quantity} {selectedWorkOrder.unit || "EA"}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="font-medium">{selectedWorkOrder.startDate ? new Date(selectedWorkOrder.startDate).toLocaleDateString() : "Not started"}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">{selectedWorkOrder.dueDate ? new Date(selectedWorkOrder.dueDate).toLocaleDateString() : "Not set"}</p>
                </div>
              </div>

              {/* Progress */}
              {selectedWorkOrder.completedQuantity > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progress</span>
                    <span>{Math.round((selectedWorkOrder.completedQuantity / selectedWorkOrder.quantity) * 100)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(selectedWorkOrder.completedQuantity / selectedWorkOrder.quantity) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* BOM Components */}
              {selectedWorkOrder.bom?.components && selectedWorkOrder.bom.components.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Bill of Materials</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-2">Component</th>
                          <th className="text-right p-2">Required Qty</th>
                          <th className="text-right p-2">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWorkOrder.bom.components.map((comp: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{comp.rawMaterial?.name || comp.name || "Component"}</td>
                            <td className="text-right p-2">{comp.quantity}</td>
                            <td className="text-right p-2">{comp.unit || "LB"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedWorkOrder.notes && (
                <div>
                  <h4 className="font-medium mb-1">Notes</h4>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">{selectedWorkOrder.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkOrderDialog(false)}>Close</Button>
            {selectedWorkOrder?.status === "pending" && (
              <Button onClick={() => { updateWorkOrder.mutate({ id: selectedWorkOrder.id, status: "in_progress" }); setShowWorkOrderDialog(false); }}>
                <Play className="h-4 w-4 mr-1" /> Start Production
              </Button>
            )}
            {selectedWorkOrder?.status === "in_progress" && (
              <Button onClick={() => { updateWorkOrder.mutate({ id: selectedWorkOrder.id, status: "completed" }); setShowWorkOrderDialog(false); }}>
                <CheckCircle className="h-4 w-4 mr-1" /> Complete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QC Hold Dialog */}
      <Dialog open={showQcHoldDialog} onOpenChange={setShowQcHoldDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-yellow-500" />
              Place on QC Hold
            </DialogTitle>
            <DialogDescription>
              Place {selectedItem?.product?.name || selectedItem?.rawMaterial?.name || "item"} on quality control hold
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason for Hold *</Label>
              <Textarea
                value={qcHoldReason}
                onChange={(e) => setQcHoldReason(e.target.value)}
                placeholder="Describe the reason for placing this item on QC hold..."
                rows={4}
              />
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                Placing an item on QC hold will create an alert and prevent it from being used in production until the hold is resolved.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQcHoldDialog(false)}>Cancel</Button>
            <Button
              onClick={submitQcHold}
              disabled={createAlert.isPending}
              className="bg-yellow-500 hover:bg-yellow-600"
            >
              {createAlert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Shield className="h-4 w-4 mr-1" />
              Place on Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exception Reporting Dialog */}
      <Dialog open={showExceptionDialog} onOpenChange={setShowExceptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Report Exception
            </DialogTitle>
            <DialogDescription>
              Report an issue with {selectedWorkOrderForException?.workOrderNumber || `WO-${selectedWorkOrderForException?.id}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Exception Type *</Label>
              <Select value={exceptionType} onValueChange={setExceptionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yield_variance">Yield Variance</SelectItem>
                  <SelectItem value="blocked_production">Blocked Production</SelectItem>
                  <SelectItem value="qc_hold">Quality Issue</SelectItem>
                  <SelectItem value="equipment_failure">Equipment Failure</SelectItem>
                  <SelectItem value="material_shortage">Material Shortage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea
                value={exceptionDescription}
                onChange={(e) => setExceptionDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExceptionDialog(false)}>Cancel</Button>
            <Button
              onClick={submitException}
              disabled={createAlert.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {createAlert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <AlertTriangle className="h-4 w-4 mr-1" />
              Report Exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Detail Dialog */}
      <Dialog open={showTransferDetailDialog} onOpenChange={setShowTransferDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Transfer Details
            </DialogTitle>
            <DialogDescription>
              {selectedTransfer?.transferNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedTransfer && (() => {
            const fromWarehouse = warehouses?.find((w: any) => w.id === selectedTransfer.fromWarehouseId);
            const toWarehouse = warehouses?.find((w: any) => w.id === selectedTransfer.toWarehouseId);
            const freightBooking = getFreightBookingForTransfer(selectedTransfer);
            return (
              <div className="space-y-4">
                {/* Transfer Status */}
                <div className="flex items-center justify-between">
                  <Badge className={cn(
                    selectedTransfer.status === "completed" ? "bg-green-500" :
                    selectedTransfer.status === "in_transit" ? "bg-blue-500" :
                    "bg-yellow-500"
                  )}>
                    {selectedTransfer.status?.replace(/_/g, " ")}
                  </Badge>
                  {selectedTransfer.expectedArrival && (
                    <span className="text-sm text-muted-foreground">
                      ETA: {new Date(selectedTransfer.expectedArrival).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Route Information */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">From</p>
                      <p className="font-medium">{fromWarehouse?.name || "Unknown"}</p>
                      <Badge variant="outline" className="mt-1 text-xs">{fromWarehouse?.type}</Badge>
                    </div>
                    <ArrowRight className="h-6 w-6 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">To</p>
                      <p className="font-medium">{toWarehouse?.name || "Unknown"}</p>
                      <Badge variant="outline" className="mt-1 text-xs">{toWarehouse?.type}</Badge>
                    </div>
                  </div>
                </div>

                {/* Freight Information */}
                {freightBooking && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                       {freightBooking.quote?.shippingMode === "ocean" ? <Ship className="h-4 w-4" /> :
                        freightBooking.quote?.shippingMode === "air" ? <Plane className="h-4 w-4" /> :
                        <Truck className="h-4 w-4" />}
                      Freight Information
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-xs text-muted-foreground">Carrier</p>
                        <p className="font-medium">{freightBooking.carrier?.name || "TBD"}</p>
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-xs text-muted-foreground">Mode</p>
                        <p className="font-medium capitalize">{freightBooking.quote?.shippingMode || "Ground"}</p>
                      </div>
                      {freightBooking.trackingNumber && (
                        <div className="bg-muted/30 rounded p-2">
                          <p className="text-xs text-muted-foreground">Tracking Number</p>
                          <p className="font-medium font-mono">{freightBooking.trackingNumber}</p>
                        </div>
                      )}
                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-xs text-muted-foreground">Freight Status</p>
                        <Badge className={cn(
                          "mt-1",
                          freightBooking.status === "in_transit" ? "bg-purple-500" :
                          freightBooking.status === "delivered" ? "bg-green-500" :
                          "bg-gray-500"
                        )}>
                          {freightBooking.status?.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Link href={`/freight/bookings/${freightBooking.id}`}>
                        <Button variant="outline" size="sm" className="w-full">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Full Freight Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}

                {/* Transfer Items */}
                {selectedTransfer.items && selectedTransfer.items.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Transfer Items</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-2">Item</th>
                            <th className="text-right p-2">Requested</th>
                            <th className="text-right p-2">Shipped</th>
                            <th className="text-right p-2">Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTransfer.items.map((item: any, idx: number) => (
                            <tr key={idx} className="border-t">
                              <td className="p-2">{item.product?.name || "Item"}</td>
                              <td className="text-right p-2">{item.requestedQuantity}</td>
                              <td className="text-right p-2">{item.shippedQuantity || "-"}</td>
                              <td className="text-right p-2">{item.receivedQuantity || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedTransfer.notes && (
                  <div>
                    <h4 className="font-medium mb-1">Notes</h4>
                    <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">{selectedTransfer.notes}</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDetailDialog(false)}>Close</Button>
            {selectedTransfer?.status === "in_transit" && (
              <Button
                onClick={() => { handleReceiveShipment(selectedTransfer.id); setShowTransferDetailDialog(false); }}
                disabled={receiveTransfer.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {receiveTransfer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CheckCircle className="h-4 w-4 mr-1" />
                Receive Shipment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
