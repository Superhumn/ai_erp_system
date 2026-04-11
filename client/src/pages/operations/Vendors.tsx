import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Building2, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getStatusColor } from "@/lib/statusColors";
import { useLocation } from "wouter";

function formatCurrency(value: number): string {
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ACTIVE_NEGOTIATION_STATUSES = new Set([
  "draft",
  "analyzing",
  "ready",
  "in_progress",
  "counter_offered",
]);

const OPEN_PO_STATUSES = new Set(["draft", "sent", "confirmed"]);

export default function Vendors() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);

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

  const utils = trpc.useUtils();

  // Data queries
  const { data: vendors, isLoading: vendorsLoading } = trpc.vendors.list.useQuery();
  const { data: purchaseOrders } = trpc.purchaseOrders.list.useQuery();
  const { data: negotiations } = trpc.vendorNegotiations.list.useQuery({});
  const { data: locations } = trpc.warehouses.list.useQuery();

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

  const resetVendorForm = () => {
    setFormData({
      name: "", contactName: "", email: "", phone: "", type: "supplier",
      address: "", city: "", state: "", country: "", postalCode: "",
      paymentTerms: 30, defaultLeadTimeDays: 14, notes: "",
    });
  };

  // Aggregate PO data per vendor
  const poAggregates = useMemo(() => {
    if (!purchaseOrders) return new Map<number, {
      totalSpend: number;
      poCount: number;
      openPOs: number;
      avgLeadTimeDays: number | null;
      lastPODate: Date | string | null;
      lastPOAmount: number;
    }>();

    const map = new Map<number, {
      totalSpend: number;
      poCount: number;
      openPOs: number;
      leadTimeDaysSum: number;
      leadTimeCount: number;
      avgLeadTimeDays: number | null;
      lastPODate: Date | string | null;
      lastPOAmount: number;
    }>();

    for (const po of purchaseOrders) {
      const vendorId = po.vendorId;
      if (!map.has(vendorId)) {
        map.set(vendorId, {
          totalSpend: 0,
          poCount: 0,
          openPOs: 0,
          leadTimeDaysSum: 0,
          leadTimeCount: 0,
          avgLeadTimeDays: null,
          lastPODate: null,
          lastPOAmount: 0,
        });
      }
      const agg = map.get(vendorId)!;
      agg.totalSpend += parseFloat(po.totalAmount || "0");
      agg.poCount += 1;

      if (OPEN_PO_STATUSES.has(po.status)) {
        agg.openPOs += 1;
      }

      // Compute lead time from orderDate to receivedDate
      if (po.orderDate && po.receivedDate) {
        const ordered = new Date(po.orderDate).getTime();
        const received = new Date(po.receivedDate).getTime();
        const days = Math.round((received - ordered) / (1000 * 60 * 60 * 24));
        if (days >= 0) {
          agg.leadTimeDaysSum += days;
          agg.leadTimeCount += 1;
        }
      }

      // Track the most recent PO by orderDate
      const poDate = po.orderDate ? new Date(po.orderDate) : null;
      const currentLastDate = agg.lastPODate ? new Date(agg.lastPODate) : null;
      if (poDate && (!currentLastDate || poDate > currentLastDate)) {
        agg.lastPODate = po.orderDate;
        agg.lastPOAmount = parseFloat(po.totalAmount || "0");
      }
    }

    // Compute averages
    for (const agg of map.values()) {
      agg.avgLeadTimeDays = agg.leadTimeCount > 0
        ? Math.round(agg.leadTimeDaysSum / agg.leadTimeCount)
        : null;
    }

    return map;
  }, [purchaseOrders]);

  // Active negotiation status per vendor
  const negotiationStatusByVendor = useMemo(() => {
    if (!negotiations) return new Map<number, string>();
    const map = new Map<number, string>();
    for (const neg of negotiations) {
      if (ACTIVE_NEGOTIATION_STATUSES.has(neg.status)) {
        map.set(neg.vendorId, "active");
      }
    }
    return map;
  }, [negotiations]);

  const filteredVendors = vendors?.filter((vendor) => {
    const matchesSearch =
      vendor.name.toLowerCase().includes(search.toLowerCase()) ||
      vendor.contactName?.toLowerCase().includes(search.toLowerCase()) ||
      vendor.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || vendor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const typeColors: Record<string, string> = {
    supplier: "bg-blue-500/10 text-blue-600",
    contractor: "bg-purple-500/10 text-purple-600",
    service: "bg-amber-500/10 text-amber-600",
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

  const isLoading = vendorsLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Vendors
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage suppliers and service providers.
          </p>
        </div>
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
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
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
          </div>
        </CardContent>
      </Card>

      {/* Unified Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Vendors ({filteredVendors?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredVendors && filteredVendors.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-sm whitespace-nowrap">Vendor Name</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Contact</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Email</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Phone</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Type</TableHead>
                    <TableHead className="text-sm whitespace-nowrap text-right">Total Spend</TableHead>
                    <TableHead className="text-sm whitespace-nowrap text-right">PO Count</TableHead>
                    <TableHead className="text-sm whitespace-nowrap text-right">Open POs</TableHead>
                    <TableHead className="text-sm whitespace-nowrap text-right">Avg Lead Time</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Payment Terms</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Last PO Date</TableHead>
                    <TableHead className="text-sm whitespace-nowrap text-right">Last PO Amount</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Negotiation Status</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Notes</TableHead>
                    <TableHead className="text-sm whitespace-nowrap">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.map((vendor) => {
                    const agg = poAggregates.get(vendor.id);
                    const negStatus = negotiationStatusByVendor.get(vendor.id) || "none";

                    return (
                      <TableRow key={vendor.id}>
                        <TableCell className="text-sm font-medium whitespace-nowrap">
                          <span className="text-primary font-semibold">{vendor.name}</span>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{vendor.contactName || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{vendor.email || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{vendor.phone || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          <Badge className={typeColors[vendor.type] || ""}>
                            {vendor.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-right font-mono">
                          {agg ? formatCurrency(agg.totalSpend) : "$0.00"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-right font-mono">
                          {agg?.poCount ?? 0}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-right font-mono">
                          {(agg?.openPOs ?? 0) > 0 ? (
                            <a href="/operations/purchase-orders" onClick={(e) => { e.preventDefault(); navigate("/operations/purchase-orders"); }} className="text-primary hover:underline cursor-pointer">
                              {agg!.openPOs}
                            </a>
                          ) : 0}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-right font-mono">
                          {agg?.avgLeadTimeDays != null ? `${agg.avgLeadTimeDays}d` : "-"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          Net {vendor.paymentTerms ?? 30}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {agg ? formatDate(agg.lastPODate) : "-"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-right font-mono">
                          {agg && agg.lastPODate ? formatCurrency(agg.lastPOAmount) : "-"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          <Badge className={negStatus === "active" ? "bg-amber-500/10 text-amber-600" : "bg-gray-500/10 text-gray-500"}>
                            {negStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {vendor.notes || "-"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          <Badge className={getStatusColor(vendor.status)}>
                            {vendor.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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
    </div>
  );
}
