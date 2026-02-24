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
import { toast } from "sonner";
import { 
import { AITriggerButton } from "@/components/FloatingAIAssistant";
  Truck, Package, ArrowRightLeft, Search, Plus, Eye, 
  CheckCircle, Clock, AlertTriangle, MapPin, Calendar,
  FileText, PackageCheck
} from "lucide-react";

export default function Logistics() {
  const [activeTab, setActiveTab] = useState("shipments");
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Logistics</h1>
            <p className="text-muted-foreground">
              Manage shipments, receiving, and inventory transfers
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard 
            title="Active Shipments" 
            icon={Truck}
            tab="shipments"
          />
          <StatsCard 
            title="Pending Receiving" 
            icon={PackageCheck}
            tab="receiving"
          />
          <StatsCard 
            title="In-Transit Transfers" 
            icon={ArrowRightLeft}
            tab="transfers"
          />
          <StatsCard 
            title="Delivered Today" 
            icon={CheckCircle}
            tab="shipments"
          />
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="shipments" className="gap-2">
                <Truck className="h-4 w-4" />
                Shipments
              </TabsTrigger>
              <TabsTrigger value="receiving" className="gap-2">
                <PackageCheck className="h-4 w-4" />
                Receiving
              </TabsTrigger>
              <TabsTrigger value="transfers" className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Transfers
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

          <TabsContent value="shipments" className="mt-4">
            <ShipmentsTab searchTerm={searchTerm} />
          </TabsContent>

          <TabsContent value="receiving" className="mt-4">
            <ReceivingTab searchTerm={searchTerm} />
          </TabsContent>

          <TabsContent value="transfers" className="mt-4">
            <TransfersTab searchTerm={searchTerm} />
          </TabsContent>
        </Tabs>
      </div>
  );
}

// Stats Card Component
function StatsCard({ title, icon: Icon, tab }: { title: string; icon: any; tab: string }) {
  const { data: shipments } = trpc.shipments.list.useQuery();
  const { data: transfers } = trpc.transfers.list.useQuery();
  const { data: pos } = trpc.purchaseOrders.list.useQuery();

  let value = 0;
  if (tab === "shipments") {
    value = shipments?.filter((s: any) => s.status === "in_transit" || s.status === "pending").length || 0;
    if (title === "Delivered Today") {
      const today = new Date().toDateString();
      value = shipments?.filter((s: any) => 
        s.status === "delivered" && 
        s.actualDelivery && 
        new Date(s.actualDelivery).toDateString() === today
      ).length || 0;
    }
  } else if (tab === "receiving") {
    value = pos?.filter((p: any) => p.status === "shipped" || p.status === "partial").length || 0;
  } else if (tab === "transfers") {
    value = transfers?.filter((t: any) => t.status === "in_transit" || t.status === "pending").length || 0;
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

// Shipments Tab
function ShipmentsTab({ searchTerm }: { searchTerm: string }) {
  const { data: shipments, isLoading } = trpc.shipments.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const filteredShipments = shipments?.filter((s: any) => 
    s.trackingNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.carrier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.origin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.destination?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      in_transit: "default",
      delivered: "secondary",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace("_", " ")}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Shipments</CardTitle>
            <CardDescription>Track inbound and outbound shipments</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Shipment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Shipment</DialogTitle>
                <DialogDescription>Add a new shipment to track</DialogDescription>
              </DialogHeader>
              <div className="text-center py-8 text-muted-foreground">
                Use the full Shipments page for detailed shipment creation
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredShipments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No shipments found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tracking #</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ETA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredShipments.slice(0, 10).map((shipment: any) => (
                <TableRow key={shipment.id}>
                  <TableCell className="font-mono">{shipment.trackingNumber || "-"}</TableCell>
                  <TableCell>{shipment.carrier || "-"}</TableCell>
                  <TableCell>{shipment.origin || "-"}</TableCell>
                  <TableCell>{shipment.destination || "-"}</TableCell>
                  <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                  <TableCell>
                    {shipment.estimatedDelivery 
                      ? new Date(shipment.estimatedDelivery).toLocaleDateString()
                      : "-"}
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

// Receiving Tab
function ReceivingTab({ searchTerm }: { searchTerm: string }) {
  const { data: pos, isLoading } = trpc.purchaseOrders.list.useQuery();
  const utils = trpc.useUtils();

  // Filter POs that need receiving (shipped or partial status)
  const pendingReceiving = pos?.filter((po: any) => 
    (po.status === "shipped" || po.status === "partial" || po.status === "approved") &&
    (po.poNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     po.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      approved: "outline",
      shipped: "default",
      partial: "secondary",
      received: "secondary",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <CardTitle>Pending Receiving</CardTitle>
        <CardDescription>Purchase orders awaiting receipt of goods</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : pendingReceiving.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PackageCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No items pending receiving</p>
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
              {pendingReceiving.slice(0, 10).map((po: any) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono">{po.poNumber}</TableCell>
                  <TableCell>{po.vendor?.name || "-"}</TableCell>
                  <TableCell>{po.lineItems?.length || 0} items</TableCell>
                  <TableCell>${Number(po.totalAmount || 0).toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(po.status)}</TableCell>
                  <TableCell>
                    {po.expectedDelivery 
                      ? new Date(po.expectedDelivery).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/operations/receiving?po=${po.id}`}>
                        <PackageCheck className="h-4 w-4 mr-2" />
                        Receive
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

// Transfers Tab
function TransfersTab({ searchTerm }: { searchTerm: string }) {
  const { data: transfers, isLoading } = trpc.transfers.list.useQuery();
  const { data: locations } = trpc.warehouses.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const filteredTransfers = transfers?.filter((t: any) => 
    t.transferNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getLocationName = (id: number | null) => {
    if (!id) return "-";
    return locations?.find((l: any) => l.id === id)?.name || "-";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      pending: "outline",
      in_transit: "default",
      received: "secondary",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace("_", " ")}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Inventory Transfers</CardTitle>
            <CardDescription>Move inventory between locations</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Transfer</DialogTitle>
                <DialogDescription>Initiate an inventory transfer between locations</DialogDescription>
              </DialogHeader>
              <div className="text-center py-8 text-muted-foreground">
                Use the full Transfers page for detailed transfer creation
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredTransfers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No transfers found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer #</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransfers.slice(0, 10).map((transfer: any) => (
                <TableRow key={transfer.id}>
                  <TableCell className="font-mono">{transfer.transferNumber}</TableCell>
                  <TableCell>{getLocationName(transfer.fromLocationId)}</TableCell>
                  <TableCell>{getLocationName(transfer.toLocationId)}</TableCell>
                  <TableCell>{transfer.items?.length || 0} items</TableCell>
                  <TableCell>{getStatusBadge(transfer.status)}</TableCell>
                  <TableCell>
                    {new Date(transfer.createdAt).toLocaleDateString()}
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
