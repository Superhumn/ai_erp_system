import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AITriggerButton } from "@/components/FloatingAIAssistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
import { Building2, Plus, Search, Loader2, Ship, Star, Truck } from "lucide-react";
import { toast } from "sonner";

export default function Vendors() {
  const [activeTab, setActiveTab] = useState("suppliers");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [carrierDialogOpen, setCarrierDialogOpen] = useState(false);
  
  // Vendor form
  const [formData, setFormData] = useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    type: "supplier" as "supplier" | "contractor" | "service",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    paymentTerms: 30,
    defaultLeadTimeDays: 14,
    notes: "",
  });

  // Carrier form
  const [carrierForm, setCarrierForm] = useState({
    name: "",
    type: "ocean" as "ocean" | "air" | "ground" | "rail" | "multimodal",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    country: "",
    website: "",
    notes: "",
    isPreferred: false,
  });

  const utils = trpc.useUtils();
  
  // Vendors queries
  const { data: vendors, isLoading: vendorsLoading } = trpc.vendors.list.useQuery();
  const createVendor = trpc.vendors.create.useMutation({
    onSuccess: () => {
      toast.success("Vendor created successfully");
      setIsOpen(false);
      resetVendorForm();
      utils.vendors.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Carriers queries
  const { data: carriers, isLoading: carriersLoading } = trpc.freight.carriers.list.useQuery();
  const createCarrier = trpc.freight.carriers.create.useMutation({
    onSuccess: () => {
      toast.success("Freight carrier added successfully");
      setCarrierDialogOpen(false);
      resetCarrierForm();
      utils.freight.carriers.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetVendorForm = () => {
    setFormData({
      name: "", contactName: "", email: "", phone: "", type: "supplier",
      address: "", city: "", state: "", country: "", postalCode: "",
      paymentTerms: 30, defaultLeadTimeDays: 14, notes: "",
    });
  };

  const resetCarrierForm = () => {
    setCarrierForm({
      name: "", type: "ocean", contactName: "", email: "", phone: "",
      address: "", country: "", website: "", notes: "", isPreferred: false,
    });
  };

  const filteredVendors = vendors?.filter((vendor) => {
    const matchesSearch =
      vendor.name.toLowerCase().includes(search.toLowerCase()) ||
      vendor.contactName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || vendor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredCarriers = carriers?.filter((carrier) => {
    return carrier.name.toLowerCase().includes(search.toLowerCase()) ||
      carrier.contactName?.toLowerCase().includes(search.toLowerCase());
  });

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    inactive: "bg-gray-500/10 text-gray-600",
    pending: "bg-amber-500/10 text-amber-600",
  };

  const typeColors: Record<string, string> = {
    supplier: "bg-blue-500/10 text-blue-600",
    contractor: "bg-purple-500/10 text-purple-600",
    service: "bg-amber-500/10 text-amber-600",
  };

  const carrierTypeColors: Record<string, string> = {
    ocean: "bg-blue-500/10 text-blue-600",
    air: "bg-sky-500/10 text-sky-600",
    ground: "bg-amber-500/10 text-amber-600",
    rail: "bg-purple-500/10 text-purple-600",
    multimodal: "bg-green-500/10 text-green-600",
  };

  const handleSubmitVendor = (e: React.FormEvent) => {
    e.preventDefault();
    createVendor.mutate({
      name: formData.name,
      contactName: formData.contactName || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      type: formData.type,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      country: formData.country || undefined,
      postalCode: formData.postalCode || undefined,
      paymentTerms: formData.paymentTerms,
      defaultLeadTimeDays: formData.defaultLeadTimeDays,
      notes: formData.notes || undefined,
    });
  };

  const handleSubmitCarrier = (e: React.FormEvent) => {
    e.preventDefault();
    createCarrier.mutate({
      name: carrierForm.name,
      type: carrierForm.type,
      contactName: carrierForm.contactName || undefined,
      email: carrierForm.email || undefined,
      phone: carrierForm.phone || undefined,
      address: carrierForm.address || undefined,
      country: carrierForm.country || undefined,
      website: carrierForm.website || undefined,
      notes: carrierForm.notes || undefined,
      isPreferred: carrierForm.isPreferred,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Vendors & Carriers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage suppliers, service providers, and freight carriers.
          </p>
        </div>
        <div className="flex gap-2">
          <AITriggerButton message="Give me an overview of all vendors, their performance, and any issues that need attention" label="AI Analysis" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="suppliers" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Suppliers & Vendors
            </TabsTrigger>
            <TabsTrigger value="carriers" className="flex items-center gap-2">
              <Ship className="h-4 w-4" />
              Freight Carriers
            </TabsTrigger>
          </TabsList>
          
          {activeTab === "suppliers" ? (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <form onSubmit={handleSubmitVendor}>
                  <DialogHeader>
                    <DialogTitle>Add Vendor</DialogTitle>
                    <DialogDescription>
                      Add a new supplier or service provider.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Company Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Vendor name"
                          required
                        />
                      </div>
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
                            <SelectItem value="supplier">Supplier</SelectItem>
                            <SelectItem value="contractor">Contractor</SelectItem>
                            <SelectItem value="service">Service</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactName">Contact Name</Label>
                      <Input
                        id="contactName"
                        value={formData.contactName}
                        onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                        placeholder="Primary contact"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="email@vendor.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="+1 234 567 8900"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Street address"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paymentTerms">Payment Terms (days)</Label>
                      <Input
                        id="paymentTerms"
                        type="number"
                        value={formData.paymentTerms}
                        onChange={(e) => setFormData({ ...formData, paymentTerms: parseInt(e.target.value) || 30 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defaultLeadTimeDays">Default Lead Time (days)</Label>
                      <Input
                        id="defaultLeadTimeDays"
                        type="number"
                        value={formData.defaultLeadTimeDays}
                        onChange={(e) => setFormData({ ...formData, defaultLeadTimeDays: parseInt(e.target.value) || 14 })}
                        placeholder="14"
                      />
                      <p className="text-xs text-muted-foreground">Average time from order to delivery</p>
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
                    <Button type="submit" disabled={createVendor.isPending}>
                      {createVendor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Vendor
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={carrierDialogOpen} onOpenChange={setCarrierDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Carrier
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <form onSubmit={handleSubmitCarrier}>
                  <DialogHeader>
                    <DialogTitle>Add Freight Carrier</DialogTitle>
                    <DialogDescription>
                      Add a freight forwarder, shipping line, or logistics provider.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="carrierName">Company Name *</Label>
                        <Input
                          id="carrierName"
                          value={carrierForm.name}
                          onChange={(e) => setCarrierForm({ ...carrierForm, name: e.target.value })}
                          placeholder="Carrier name"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="carrierType">Type</Label>
                        <Select
                          value={carrierForm.type}
                          onValueChange={(value: any) => setCarrierForm({ ...carrierForm, type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ocean">Ocean Freight</SelectItem>
                            <SelectItem value="air">Air Freight</SelectItem>
                            <SelectItem value="ground">Ground/Trucking</SelectItem>
                            <SelectItem value="rail">Rail</SelectItem>
                            <SelectItem value="multimodal">Multimodal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carrierContact">Contact Name</Label>
                      <Input
                        id="carrierContact"
                        value={carrierForm.contactName}
                        onChange={(e) => setCarrierForm({ ...carrierForm, contactName: e.target.value })}
                        placeholder="Primary contact"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="carrierEmail">Email *</Label>
                        <Input
                          id="carrierEmail"
                          type="email"
                          value={carrierForm.email}
                          onChange={(e) => setCarrierForm({ ...carrierForm, email: e.target.value })}
                          placeholder="quotes@carrier.com"
                        />
                        <p className="text-xs text-muted-foreground">Required for sending RFQs</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="carrierPhone">Phone</Label>
                        <Input
                          id="carrierPhone"
                          value={carrierForm.phone}
                          onChange={(e) => setCarrierForm({ ...carrierForm, phone: e.target.value })}
                          placeholder="+1 234 567 8900"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="carrierCountry">Country</Label>
                        <Input
                          id="carrierCountry"
                          value={carrierForm.country}
                          onChange={(e) => setCarrierForm({ ...carrierForm, country: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="carrierWebsite">Website</Label>
                        <Input
                          id="carrierWebsite"
                          value={carrierForm.website}
                          onChange={(e) => setCarrierForm({ ...carrierForm, website: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isPreferred"
                        checked={carrierForm.isPreferred}
                        onCheckedChange={(checked) => setCarrierForm({ ...carrierForm, isPreferred: checked })}
                      />
                      <Label htmlFor="isPreferred">Preferred Carrier</Label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carrierNotes">Notes</Label>
                      <Textarea
                        id="carrierNotes"
                        value={carrierForm.notes}
                        onChange={(e) => setCarrierForm({ ...carrierForm, notes: e.target.value })}
                        placeholder="Service areas, specialties, etc."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCarrierDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createCarrier.isPending}>
                      {createCarrier.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Carrier
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Search */}
        <Card className="mt-4">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={activeTab === "suppliers" ? "Search vendors..." : "Search carriers..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              {activeTab === "suppliers" && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Suppliers Tab */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader>
              <CardTitle>Suppliers & Vendors ({filteredVendors?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {vendorsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredVendors && filteredVendors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment Terms</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell>
                          <div>
                            <p>{vendor.contactName || "-"}</p>
                            <p className="text-sm text-muted-foreground">{vendor.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={typeColors[vendor.type] || ""}>
                            {vendor.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {[vendor.city, vendor.country].filter(Boolean).join(", ") || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[vendor.status] || ""}>
                            {vendor.status}
                          </Badge>
                        </TableCell>
                        <TableCell>Net {vendor.paymentTerms}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No vendors found</p>
                  <Button variant="link" onClick={() => setIsOpen(true)}>
                    Add your first vendor
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Carriers Tab */}
        <TabsContent value="carriers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="h-5 w-5" />
                Freight Carriers ({filteredCarriers?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {carriersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCarriers && filteredCarriers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Carrier</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCarriers.map((carrier) => (
                      <TableRow key={carrier.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{carrier.name}</span>
                            {carrier.isPreferred && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{carrier.contactName || "-"}</p>
                            <p className="text-sm text-muted-foreground">{carrier.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={carrierTypeColors[carrier.type] || ""}>
                            {carrier.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{carrier.country || "-"}</TableCell>
                        <TableCell>
                          {carrier.rating ? (
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              <span>{carrier.rating.toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={carrier.isActive ? "bg-green-500/10 text-green-600" : "bg-gray-500/10 text-gray-600"}>
                            {carrier.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No freight carriers found</p>
                  <p className="text-sm mt-1">Add carriers to send freight quote requests</p>
                  <Button variant="link" onClick={() => setCarrierDialogOpen(true)}>
                    Add your first carrier
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
