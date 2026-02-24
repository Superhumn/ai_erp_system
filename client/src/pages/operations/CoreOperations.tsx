import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  ChevronDown,
  Package,
  ShoppingCart,
  Truck,
  Factory,
  AlertTriangle,
  Bell,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Box,
  FileText,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
// Types for the object tree
type TreeNodeType = 
  | "sales_order" 
  | "purchase_order" 
  | "work_order" 
  | "inventory_lot" 
  | "product" 
  | "raw_material"
  | "shipment";

interface TreeNode {
  id: number;
  type: TreeNodeType;
  label: string;
  status?: string;
  children?: TreeNode[];
  expanded?: boolean;
}

// Icon mapping for tree nodes
const nodeIcons: Record<TreeNodeType, React.ComponentType<{ className?: string }>> = {
  sales_order: ShoppingCart,
  purchase_order: FileText,
  work_order: Factory,
  inventory_lot: Layers,
  product: Package,
  raw_material: Box,
  shipment: Truck,
};

// Status badge colors
const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  confirmed: "bg-blue-500/20 text-blue-500",
  processing: "bg-purple-500/20 text-purple-500",
  shipped: "bg-cyan-500/20 text-cyan-500",
  delivered: "bg-green-500/20 text-green-500",
  cancelled: "bg-red-500/20 text-red-500",
  draft: "bg-gray-500/20 text-gray-400",
  approved: "bg-green-500/20 text-green-500",
  in_progress: "bg-blue-500/20 text-blue-500",
  completed: "bg-green-500/20 text-green-500",
  active: "bg-green-500/20 text-green-500",
  hold: "bg-orange-500/20 text-orange-500",
  expired: "bg-red-500/20 text-red-500",
  open: "bg-yellow-500/20 text-yellow-500",
  acknowledged: "bg-blue-500/20 text-blue-500",
  resolved: "bg-green-500/20 text-green-500",
};

export default function CoreOperations() {
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["sales_orders", "purchase_orders", "work_orders"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch data for tree
  const { data: salesOrders, refetch: refetchSalesOrders } = trpc.salesOrders.list.useQuery();
  const { data: purchaseOrders, refetch: refetchPOs } = trpc.purchaseOrders.list.useQuery({});
  const { data: workOrders, refetch: refetchWorkOrders } = trpc.workOrders.list.useQuery();
  const { data: alerts, refetch: refetchAlerts } = trpc.alerts.list.useQuery({ status: "open" });
  const { data: inventoryLots } = trpc.inventoryLots.list.useQuery({});

  // Mutations
  const acknowledgeAlert = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged");
      refetchAlerts();
    },
  });

  const resolveAlert = trpc.alerts.resolve.useMutation({
    onSuccess: () => {
      toast.success("Alert resolved");
      refetchAlerts();
    },
  });

  const dismissAlert = trpc.alerts.dismiss.useMutation({
    onSuccess: () => {
      toast.success("Alert dismissed");
      refetchAlerts();
    },
  });

  // Build tree structure
  const buildTree = (): TreeNode[] => {
    const tree: TreeNode[] = [];

    // Sales Orders section
    if (salesOrders && salesOrders.length > 0) {
      tree.push({
        id: 0,
        type: "sales_order",
        label: `Sales Orders (${salesOrders.length})`,
        children: salesOrders.map((so) => ({
          id: so.id,
          type: "sales_order" as TreeNodeType,
          label: so.orderNumber || `SO-${so.id}`,
          status: so.status || "pending",
        })),
      });
    }

    // Purchase Orders section
    if (purchaseOrders && purchaseOrders.length > 0) {
      tree.push({
        id: 0,
        type: "purchase_order",
        label: `Purchase Orders (${purchaseOrders.length})`,
        children: purchaseOrders.map((po) => ({
          id: po.id,
          type: "purchase_order" as TreeNodeType,
          label: po.poNumber || `PO-${po.id}`,
          status: po.status || "draft",
        })),
      });
    }

    // Work Orders section
    if (workOrders && workOrders.length > 0) {
      tree.push({
        id: 0,
        type: "work_order",
        label: `Work Orders (${workOrders.length})`,
        children: workOrders.map((wo) => ({
          id: wo.id,
          type: "work_order" as TreeNodeType,
          label: wo.workOrderNumber || `WO-${wo.id}`,
          status: wo.status || "draft",
        })),
      });
    }

    // Inventory Lots section
    if (inventoryLots && inventoryLots.length > 0) {
      tree.push({
        id: 0,
        type: "inventory_lot",
        label: `Inventory Lots (${inventoryLots.length})`,
        children: inventoryLots.map((lot) => ({
          id: lot.id,
          type: "inventory_lot" as TreeNodeType,
          label: lot.lotCode || `LOT-${lot.id}`,
          status: lot.status || "active",
        })),
      });
    }

    return tree;
  };

  const tree = buildTree();

  // Filter tree based on search
  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    
    return nodes.map((node) => {
      if (node.children) {
        const filteredChildren = node.children.filter((child) =>
          child.label.toLowerCase().includes(query.toLowerCase())
        );
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
      }
      if (node.label.toLowerCase().includes(query.toLowerCase())) {
        return node;
      }
      return null;
    }).filter(Boolean) as TreeNode[];
  };

  const filteredTree = filterTree(tree, searchQuery);

  // Toggle node expansion
  const toggleNode = (nodeKey: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeKey)) {
      newExpanded.delete(nodeKey);
    } else {
      newExpanded.add(nodeKey);
    }
    setExpandedNodes(newExpanded);
  };

  // Render tree node
  const renderTreeNode = (node: TreeNode, depth: number = 0, parentKey: string = "") => {
    const nodeKey = parentKey ? `${parentKey}-${node.type}-${node.id}` : `${node.type}-${node.id}`;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(nodeKey);
    const isSelected = selectedNode?.id === node.id && selectedNode?.type === node.type;
    const Icon = nodeIcons[node.type];

    return (
      <div className="p-6" key={nodeKey}>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
            isSelected && "bg-accent",
            depth > 0 && "ml-4"
          )}
          onClick={() => {
            if (hasChildren) {
              toggleNode(nodeKey);
            }
            if (node.id !== 0) {
              setSelectedNode(node);
            }
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-4" />
          )}
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm truncate">{node.label}</span>
          {node.status && (
            <Badge variant="outline" className={cn("text-xs", statusColors[node.status])}>
              {node.status}
            </Badge>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, depth + 1, nodeKey))}
          </div>
        )}
      </div>
    );
  };

  // Refresh all data
  const refreshAll = () => {
    refetchSalesOrders();
    refetchPOs();
    refetchWorkOrders();
    refetchAlerts();
    toast.success("Data refreshed");
  };

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Core Operations</h1>
          <AITriggerButton message="Analyze core operations workflow - optimize processes and identify efficiency gains" label="AI Operations Analysis" />
        </div>
            <p className="text-muted-foreground">Unified workspace for operations management</p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* 3-Pane Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Pane - Object Tree */}
          <div className="w-72 border-r flex flex-col bg-card">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 p-2">
              {filteredTree.map((node) => renderTreeNode(node))}
              {filteredTree.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No items found
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Center Pane - Details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedNode ? (
              <DetailPane node={selectedNode} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select an item from the tree to view details</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Pane - Alerts */}
          <div className="w-80 border-l flex flex-col bg-card">
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <span className="font-medium">Alerts</span>
                {alerts && alerts.length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {alerts.length}
                  </Badge>
                )}
              </div>
            </div>
            <ScrollArea className="flex-1">
              {alerts && alerts.length > 0 ? (
                <div className="p-2 space-y-2">
                  {alerts.map((alert) => (
                    <Card key={alert.id} className={cn(
                      "border-l-4",
                      alert.severity === "critical" && "border-l-red-500",
                      alert.severity === "warning" && "border-l-yellow-500",
                      alert.severity === "info" && "border-l-blue-500"
                    )}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={cn(
                            "h-4 w-4 mt-0.5",
                            alert.severity === "critical" && "text-red-500",
                            alert.severity === "warning" && "text-yellow-500",
                            alert.severity === "info" && "text-blue-500"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{alert.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {alert.description}
                            </p>
                            <div className="flex gap-1 mt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => acknowledgeAlert.mutate({ id: alert.id })}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Ack
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => resolveAlert.mutate({ id: alert.id })}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => dismissAlert.mutate({ id: alert.id })}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                  <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                  <p className="text-sm">No open alerts</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
  );
}

// Detail Pane Component
function DetailPane({ node }: { node: TreeNode }) {
  const [activeTab, setActiveTab] = useState("details");

  // Fetch detail data based on node type
  const { data: salesOrderDetail } = trpc.salesOrders.getById.useQuery(
    { id: node.id },
    { enabled: node.type === "sales_order" && node.id > 0 }
  );

  const { data: purchaseOrderDetail } = trpc.purchaseOrders.list.useQuery(
    { status: undefined },
    { enabled: node.type === "purchase_order" && node.id > 0,
      select: (data) => data.find(po => po.id === node.id)
    }
  );

  const { data: workOrderDetail } = trpc.workOrders.getById.useQuery(
    { id: node.id },
    { enabled: node.type === "work_order" && node.id > 0 }
  );

  const { data: lotDetail } = trpc.inventoryLots.getById.useQuery(
    { id: node.id },
    { enabled: node.type === "inventory_lot" && node.id > 0 }
  );

  const Icon = nodeIcons[node.type];

  const renderDetails = () => {
    switch (node.type) {
      case "sales_order":
        if (!salesOrderDetail) return <div className="text-muted-foreground">Loading...</div>;
        return (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Order Number</label>
                <p className="font-medium">{salesOrderDetail.orderNumber}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Badge className={statusColors[salesOrderDetail.status || "pending"]}>
                  {salesOrderDetail.status}
                </Badge>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Source</label>
                <p className="font-medium capitalize">{salesOrderDetail.source}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Total Amount</label>
                <p className="font-medium">${parseFloat(salesOrderDetail.totalAmount?.toString() || "0").toFixed(2)}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Order Date</label>
                <p className="font-medium">{new Date(salesOrderDetail.orderDate).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fulfillment Status</label>
                <Badge variant="outline">{salesOrderDetail.fulfillmentStatus}</Badge>
              </div>
            </div>
            {salesOrderDetail.lines && salesOrderDetail.lines.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Order Lines</h4>
                <div className="border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">SKU</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Price</th>
                        <th className="text-right p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesOrderDetail.lines.map((line: any) => (
                        <tr key={line.id} className="border-t">
                          <td className="p-2">{line.sku || "N/A"}</td>
                          <td className="text-right p-2">{line.quantity}</td>
                          <td className="text-right p-2">${parseFloat(line.unitPrice || "0").toFixed(2)}</td>
                          <td className="text-right p-2">${parseFloat(line.totalPrice || "0").toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      case "purchase_order":
        if (!purchaseOrderDetail) return <div className="text-muted-foreground">Loading...</div>;
        return (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">PO Number</label>
                <p className="font-medium">{purchaseOrderDetail.poNumber}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Badge className={statusColors[purchaseOrderDetail.status || "draft"]}>
                  {purchaseOrderDetail.status}
                </Badge>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Vendor ID</label>
                <p className="font-medium">{purchaseOrderDetail.vendorId || "N/A"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Total Amount</label>
                <p className="font-medium">${parseFloat(purchaseOrderDetail.totalAmount?.toString() || "0").toFixed(2)}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Order Date</label>
                <p className="font-medium">{purchaseOrderDetail.orderDate ? new Date(purchaseOrderDetail.orderDate).toLocaleDateString() : "N/A"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Expected Date</label>
                <p className="font-medium">{purchaseOrderDetail.expectedDate ? new Date(purchaseOrderDetail.expectedDate).toLocaleDateString() : "N/A"}</p>
              </div>
            </div>
          </div>
        );

      case "work_order":
        if (!workOrderDetail) return <div className="text-muted-foreground">Loading...</div>;
        return (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Work Order Number</label>
                <p className="font-medium">{workOrderDetail.workOrderNumber}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Badge className={statusColors[workOrderDetail.status || "draft"]}>
                  {workOrderDetail.status}
                </Badge>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Quantity</label>
                <p className="font-medium">{workOrderDetail.quantity}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Completed</label>
                <p className="font-medium">{workOrderDetail.completedQuantity || "0"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Scheduled Start</label>
                <p className="font-medium">{workOrderDetail.scheduledStartDate ? new Date(workOrderDetail.scheduledStartDate).toLocaleDateString() : "N/A"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Scheduled End</label>
                <p className="font-medium">{workOrderDetail.scheduledEndDate ? new Date(workOrderDetail.scheduledEndDate).toLocaleDateString() : "N/A"}</p>
              </div>
            </div>
          </div>
        );

      case "inventory_lot":
        if (!lotDetail) return <div className="text-muted-foreground">Loading...</div>;
        return (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Lot Code</label>
                <p className="font-medium">{lotDetail.lotCode}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Badge className={statusColors[lotDetail.status || "active"]}>
                  {lotDetail.status}
                </Badge>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Product Type</label>
                <p className="font-medium capitalize">{lotDetail.productType}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reference</label>
                <p className="font-medium">{lotDetail.sourceReferenceId || "N/A"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Manufacture Date</label>
                <p className="font-medium">{lotDetail.manufactureDate ? new Date(lotDetail.manufactureDate).toLocaleDateString() : "N/A"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Expiry Date</label>
                <p className="font-medium">{lotDetail.expiryDate ? new Date(lotDetail.expiryDate).toLocaleDateString() : "N/A"}</p>
              </div>
            </div>
          </div>
        );

      default:
        return <div className="text-muted-foreground">Select an item to view details</div>;
    }
  };

  return (
    <div className="p-6 flex-1 flex flex-col overflow-hidden">
      {/* Detail Header */}
      <div className="p-4 border-b flex items-center gap-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">{node.label}</h2>
          <p className="text-sm text-muted-foreground capitalize">{node.type.replace("_", " ")}</p>
        </div>
        {node.status && (
          <Badge className={cn("ml-auto", statusColors[node.status])}>
            {node.status}
          </Badge>
        )}
      </div>

      {/* Detail Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="related">Related</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="flex-1 overflow-auto p-4">
          {renderDetails()}
        </TabsContent>
        <TabsContent value="history" className="flex-1 overflow-auto p-4">
          <div className="text-muted-foreground text-center py-8">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Transaction history coming soon</p>
          </div>
        </TabsContent>
        <TabsContent value="related" className="flex-1 overflow-auto p-4">
          <div className="text-muted-foreground text-center py-8">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Related items coming soon</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
