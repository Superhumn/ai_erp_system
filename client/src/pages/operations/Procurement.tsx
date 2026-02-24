import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
import { AITriggerButton } from "@/components/FloatingAIAssistant";
  FileText, Building2, Package, Search, Plus, Eye, 
  CheckCircle, Clock, AlertTriangle, DollarSign, Calendar,
  Truck, Mail, Phone
} from "lucide-react";

export default function Procurement() {
  const [activeTab, setActiveTab] = useState("purchase-orders");
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Procurement</h1>
          <AITriggerButton message="Analyze our procurement - show spend patterns, identify consolidation opportunities, and suggest cost savings" label="AI Procurement Insights" />
        </div>
            <p className="text-muted-foreground">
              Manage purchase orders, vendors, and raw materials
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ProcurementStatsCard 
            title="Open POs" 
            icon={FileText}
            type="open_pos"
          />
          <ProcurementStatsCard 
            title="Active Vendors" 
            icon={Building2}
            type="vendors"
          />
          <ProcurementStatsCard 
            title="Raw Materials" 
            icon={Package}
            type="materials"
          />
          <ProcurementStatsCard 
            title="Pending Value" 
            icon={DollarSign}
            type="value"
          />
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="purchase-orders" className="gap-2">
                <FileText className="h-4 w-4" />
                Purchase Orders
              </TabsTrigger>
              <TabsTrigger value="vendors" className="gap-2">
                <Building2 className="h-4 w-4" />
                Vendors
              </TabsTrigger>
              <TabsTrigger value="raw-materials" className="gap-2">
                <Package className="h-4 w-4" />
                Raw Materials
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>

          <TabsContent value="purchase-orders" className="mt-4">
            <PurchaseOrdersTab searchTerm={searchTerm} />
          </TabsContent>

          <TabsContent value="vendors" className="mt-4">
            <VendorsTab searchTerm={searchTerm} />
          </TabsContent>

          <TabsContent value="raw-materials" className="mt-4">
            <RawMaterialsTab searchTerm={searchTerm} />
          </TabsContent>
        </Tabs>
      </div>
  );
}

// Stats Card Component
function ProcurementStatsCard({ title, icon: Icon, type }: { title: string; icon: any; type: string }) {
  const { data: pos } = trpc.purchaseOrders.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
  const { data: materials } = trpc.rawMaterials.list.useQuery();

  let value: string | number = 0;
  if (type === "open_pos") {
    value = pos?.filter(p => p.status !== "received" && p.status !== "cancelled").length || 0;
  } else if (type === "vendors") {
    value = vendors?.filter((v: any) => v.status === "active").length || 0;
  } else if (type === "materials") {
    value = materials?.length || 0;
  } else if (type === "value") {
    const total = pos?.filter(p => p.status !== "received" && p.status !== "cancelled")
      .reduce((sum, p) => sum + Number(p.totalAmount || 0), 0) || 0;
    value = `$${total.toLocaleString()}`;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <Icon className="h-8 w-8 text-muted-foreground/50" />
        </div>
      </CardContent>
    </Card>
  );
}

// Purchase Orders Tab
function PurchaseOrdersTab({ searchTerm }: { searchTerm: string }) {
  const { data: pos, isLoading } = trpc.purchaseOrders.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [newPO, setNewPO] = useState({ vendorId: "", notes: "" });
  const utils = trpc.useUtils();

  const createMutation = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase order created");
      setCreateOpen(false);
      setNewPO({ vendorId: "", notes: "" });
      utils.purchaseOrders.list.invalidate();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const filteredPOs = pos?.filter((po: any) => 
    po.poNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      pending: "outline",
      approved: "default",
      shipped: "default",
      partial: "secondary",
      received: "secondary",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Purchase Orders</CardTitle>
            <CardDescription>Manage purchase orders with vendors</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New PO
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
                <DialogDescription>Create a new purchase order</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Select value={newPO.vendorId} onValueChange={(v) => setNewPO({ ...newPO, vendorId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.map((v: any) => (
                        <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    value={newPO.notes} 
                    onChange={(e) => setNewPO({ ...newPO, notes: e.target.value })}
                    placeholder="Optional notes..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => createMutation.mutate({ 
                    vendorId: parseInt(newPO.vendorId), 
                    orderDate: new Date(),
                    subtotal: "0",
                    totalAmount: "0",
                    notes: newPO.notes || undefined 
                  })}
                  disabled={!newPO.vendorId || createMutation.isPending}
                >
                  Create PO
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredPOs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No purchase orders found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.slice(0, 15).map((po: any) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono">{po.poNumber}</TableCell>
                  <TableCell>{po.vendor?.name || "-"}</TableCell>
                  <TableCell>{po.lineItems?.length || 0}</TableCell>
                  <TableCell>${Number(po.totalAmount || 0).toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(po.status)}</TableCell>
                  <TableCell>
                    {po.expectedDelivery 
                      ? new Date(po.expectedDelivery).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/operations/purchase-orders/${po.id}`}>
                        <Eye className="h-4 w-4" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Vendors Tab
function VendorsTab({ searchTerm }: { searchTerm: string }) {
  const { data: vendors, isLoading } = trpc.vendors.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", email: "", phone: "", type: "supplier" });
  const utils = trpc.useUtils();

  const createMutation = trpc.vendors.create.useMutation({
    onSuccess: () => {
      toast.success("Vendor created");
      setCreateOpen(false);
      setNewVendor({ name: "", email: "", phone: "", type: "supplier" });
      utils.vendors.list.invalidate();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const filteredVendors = vendors?.filter((v: any) => 
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.type?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      supplier: "bg-blue-100 text-blue-800",
      manufacturer: "bg-green-100 text-green-800",
      distributor: "bg-purple-100 text-purple-800",
      freight: "bg-orange-100 text-orange-800",
    };
    return <Badge className={colors[type] || ""}>{type}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Vendors</CardTitle>
            <CardDescription>Manage suppliers and service providers</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Vendor</DialogTitle>
                <DialogDescription>Add a new vendor to your network</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input 
                    value={newVendor.name} 
                    onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                    placeholder="Vendor name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newVendor.type} onValueChange={(v) => setNewVendor({ ...newVendor, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="manufacturer">Manufacturer</SelectItem>
                      <SelectItem value="distributor">Distributor</SelectItem>
                      <SelectItem value="freight">Freight/Logistics</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      type="email"
                      value={newVendor.email} 
                      onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                      placeholder="email@vendor.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input 
                      value={newVendor.phone} 
                      onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => createMutation.mutate({ 
                    name: newVendor.name,
                    email: newVendor.email || undefined,
                    phone: newVendor.phone || undefined,
                    type: newVendor.type as any,
                  })}
                  disabled={!newVendor.name || createMutation.isPending}
                >
                  Add Vendor
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredVendors.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No vendors found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Lead Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Open POs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.slice(0, 15).map((vendor: any) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell>{getTypeBadge(vendor.type || "supplier")}</TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      {vendor.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {vendor.email}
                        </span>
                      )}
                      {vendor.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {vendor.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{vendor.defaultLeadTimeDays ? `${vendor.defaultLeadTimeDays} days` : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={vendor.status === "active" ? "default" : "secondary"}>
                      {vendor.status}
                    </Badge>
                  </TableCell>
                  <TableCell>-</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Raw Materials Tab
function RawMaterialsTab({ searchTerm }: { searchTerm: string }) {
  const { data: materials, isLoading } = trpc.rawMaterials.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ 
    name: "", sku: "", unit: "kg", vendorId: "", unitCost: "" 
  });
  const utils = trpc.useUtils();

  const createMutation = trpc.rawMaterials.create.useMutation({
    onSuccess: () => {
      toast.success("Raw material created");
      setCreateOpen(false);
      setNewMaterial({ name: "", sku: "", unit: "kg", vendorId: "", unitCost: "" });
      utils.rawMaterials.list.invalidate();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const filteredMaterials = materials?.filter((m: any) => 
    m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Raw Materials</CardTitle>
            <CardDescription>Manage raw materials and components inventory</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Raw Material</DialogTitle>
                <DialogDescription>Add a new raw material to inventory</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input 
                      value={newMaterial.name} 
                      onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                      placeholder="Material name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input 
                      value={newMaterial.sku} 
                      onChange={(e) => setNewMaterial({ ...newMaterial, sku: e.target.value })}
                      placeholder="RM-001"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={newMaterial.unit} onValueChange={(v) => setNewMaterial({ ...newMaterial, unit: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">Kilograms (kg)</SelectItem>
                        <SelectItem value="lb">Pounds (lb)</SelectItem>
                        <SelectItem value="unit">Units</SelectItem>
                        <SelectItem value="liter">Liters</SelectItem>
                        <SelectItem value="gallon">Gallons</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Cost</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={newMaterial.unitCost} 
                      onChange={(e) => setNewMaterial({ ...newMaterial, unitCost: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preferred Vendor</Label>
                  <Select value={newMaterial.vendorId} onValueChange={(v) => setNewMaterial({ ...newMaterial, vendorId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.map((v: any) => (
                        <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => {
                    const payload: any = { 
                      name: newMaterial.name,
                      sku: newMaterial.sku || undefined,
                      unit: newMaterial.unit,
                      unitCost: newMaterial.unitCost || undefined,
                    };
                    if (newMaterial.vendorId) {
                      payload.preferredVendorId = parseInt(newMaterial.vendorId);
                    }
                    createMutation.mutate(payload);
                  }}
                  disabled={!newMaterial.name || createMutation.isPending}
                >
                  Add Material
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredMaterials.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No raw materials found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Unit Cost</TableHead>
                <TableHead>On Hand</TableHead>
                <TableHead>Lead Time</TableHead>
                <TableHead>Vendor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.slice(0, 15).map((material: any) => (
                <TableRow key={material.id}>
                  <TableCell className="font-mono">{material.sku || "-"}</TableCell>
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell>{material.unit}</TableCell>
                  <TableCell>${Number(material.unitCost || 0).toFixed(2)}</TableCell>
                  <TableCell>{Number(material.quantityOnHand || 0).toLocaleString()}</TableCell>
                  <TableCell>{material.leadTimeDays ? `${material.leadTimeDays} days` : "-"}</TableCell>
                  <TableCell>{material.vendor?.name || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
