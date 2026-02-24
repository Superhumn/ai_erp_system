import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Building2, MapPin, Phone, Mail, Package, Edit, Trash2 } from "lucide-react";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function Locations() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    type: "copacker" as "warehouse" | "store" | "distribution" | "copacker" | "3pl",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    isPrimary: false,
    notes: "",
  });

  const { data: warehouses, isLoading, refetch } = trpc.warehouses.list.useQuery(
    typeFilter !== "all" ? { type: typeFilter } : undefined
  );
  const { data: summary } = trpc.warehouses.summary.useQuery();
  
  const createMutation = trpc.warehouses.create.useMutation({
    onSuccess: () => {
      toast.success("Location created successfully");
      setIsOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.warehouses.update.useMutation({
    onSuccess: () => {
      toast.success("Location updated successfully");
      setIsOpen(false);
      setEditingId(null);
      resetForm();
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.warehouses.delete.useMutation({
    onSuccess: () => {
      toast.success("Location deleted successfully");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      type: "copacker",
      address: "",
      city: "",
      state: "",
      country: "",
      postalCode: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      isPrimary: false,
      notes: "",
    });
  };

  const handleEdit = (warehouse: any) => {
    setEditingId(warehouse.id);
    setFormData({
      name: warehouse.name || "",
      code: warehouse.code || "",
      type: warehouse.type || "copacker",
      address: warehouse.address || "",
      city: warehouse.city || "",
      state: warehouse.state || "",
      country: warehouse.country || "",
      postalCode: warehouse.postalCode || "",
      contactName: warehouse.contactName || "",
      contactEmail: warehouse.contactEmail || "",
      contactPhone: warehouse.contactPhone || "",
      isPrimary: warehouse.isPrimary || false,
      notes: warehouse.notes || "",
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error("Location name is required");
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "copacker": return "bg-purple-100 text-purple-800";
      case "warehouse": return "bg-blue-100 text-blue-800";
      case "3pl": return "bg-green-100 text-green-800";
      case "distribution": return "bg-orange-100 text-orange-800";
      case "store": return "bg-pink-100 text-pink-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "copacker": return "Co-Packer";
      case "3pl": return "3PL";
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Locations & Facilities</h1>
            <p className="text-muted-foreground">Manage warehouses, co-packers, and distribution centers</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
              setEditingId(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Location" : "Add New Location"}</DialogTitle>
                <DialogDescription>
                  {editingId ? "Update the location details" : "Add a new warehouse, co-packer, or distribution center"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Location Name *</Label>
                    <Input
                      placeholder="e.g., ABC Co-Packer"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input
                      placeholder="e.g., ABC-01"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="copacker">Co-Packer</SelectItem>
                        <SelectItem value="warehouse">Warehouse</SelectItem>
                        <SelectItem value="3pl">3PL Provider</SelectItem>
                        <SelectItem value="distribution">Distribution Center</SelectItem>
                        <SelectItem value="store">Store</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 flex items-end">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={formData.isPrimary}
                        onCheckedChange={(checked) => setFormData({ ...formData, isPrimary: checked })}
                      />
                      <Label>Primary Location</Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    placeholder="Street address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Postal Code</Label>
                    <Input
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    />
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Contact Information</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input
                        value={formData.contactName}
                        onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes about this location..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Update" : "Create"} Location
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        {summary && summary.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {summary.map((loc: any) => (
              <Card key={loc.warehouse.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{loc.warehouse.name}</CardTitle>
                    <Badge className={getTypeColor(loc.warehouse.type)}>
                      {getTypeLabel(loc.warehouse.type)}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {loc.warehouse.city}{loc.warehouse.state ? `, ${loc.warehouse.state}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-2xl font-bold">{loc.totalProducts}</p>
                      <p className="text-xs text-muted-foreground">Products</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{Math.round(loc.totalQuantity)}</p>
                      <p className="text-xs text-muted-foreground">Total Units</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-4">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="copacker">Co-Packers</SelectItem>
              <SelectItem value="warehouse">Warehouses</SelectItem>
              <SelectItem value="3pl">3PL Providers</SelectItem>
              <SelectItem value="distribution">Distribution Centers</SelectItem>
              <SelectItem value="store">Stores</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Locations Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle>All Locations</CardTitle>
            <AITriggerButton message="Analyze our locations - show capacity utilization, suggest layout optimizations, and identify consolidation opportunities" label="AI Location Analysis" />
          </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading locations...</div>
            ) : !warehouses || warehouses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No locations found. Add your first co-packer or warehouse.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((wh: any) => (
                    <TableRow key={wh.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{wh.name}</p>
                            {wh.code && <p className="text-xs text-muted-foreground">{wh.code}</p>}
                          </div>
                          {wh.isPrimary && (
                            <Badge variant="outline" className="text-xs">Primary</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getTypeColor(wh.type)}>
                          {getTypeLabel(wh.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-1 text-muted-foreground" />
                          <div className="text-sm">
                            {wh.city && <span>{wh.city}</span>}
                            {wh.state && <span>, {wh.state}</span>}
                            {wh.country && <span> {wh.country}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {wh.contactName && (
                          <div className="text-sm">
                            <p>{wh.contactName}</p>
                            {wh.contactEmail && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {wh.contactEmail}
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={wh.status === "active" ? "default" : "secondary"}>
                          {wh.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(wh)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this location?")) {
                                deleteMutation.mutate({ id: wh.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
