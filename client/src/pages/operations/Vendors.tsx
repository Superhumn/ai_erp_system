import React, { useState, useMemo } from "react";
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
import { Building2, Plus, Search, Loader2, Upload, ShoppingBag, Star, ExternalLink, CheckCircle2, Trash2, MessageCircle, Pencil } from "lucide-react";
import WhatsAppDrawer from "@/components/WhatsAppDrawer";
import LinkContactDialog from "@/components/LinkContactDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getStatusColor } from "@/lib/statusColors";
import { useLocation } from "wouter";
import DocumentsCell from "@/components/DocumentsCell";

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
  const [isAlibabaOpen, setIsAlibabaOpen] = useState(false);
  const [alibabaForm, setAlibabaForm] = useState({ query: "", category: "", country: "" });
  const [alibabaResults, setAlibabaResults] = useState<any[]>([]);
  const [alibabaUsedFallback, setAlibabaUsedFallback] = useState(false);
  const [expandedVendorId, setExpandedVendorId] = useState<number | null>(null);
  const [vendorToDelete, setVendorToDelete] = useState<{ id: number; name: string } | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<number | null>(null);
  const [chatTarget, setChatTarget] = useState<{ contactId: number; whatsappNumber: string; contactName?: string; vendorName: string } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ vendorId: number; vendorName: string; vendorPhone?: string | null } | null>(null);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialUnit, setNewMaterialUnit] = useState("kg");
  const [newMaterialCost, setNewMaterialCost] = useState("");

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

  // Batch-load document counts for all vendor rows in one query (avoids the
  // per-row DocumentsCell fetch on mount).
  const vendorIds = useMemo(() => (vendors ?? []).map((v) => v.id), [vendors]);
  const { data: vendorDocCounts } = trpc.documents.countsByReferences.useQuery(
    { referenceType: "vendor", referenceIds: vendorIds },
    { enabled: vendorIds.length > 0 },
  );
  const docCountByVendor = useMemo(
    () => new Map((vendorDocCounts ?? []).map((c) => [c.referenceId, c.count])),
    [vendorDocCounts],
  );
  const { data: purchaseOrders } = trpc.purchaseOrders.list.useQuery();
  const { data: negotiations } = trpc.vendorNegotiations.list.useQuery({});
  const { data: locations } = trpc.warehouses.list.useQuery();
  const { data: rawMaterials } = trpc.rawMaterials.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();

  const createRawMaterial = trpc.rawMaterials.create.useMutation({
    onSuccess: () => {
      toast.success("Material added");
      setNewMaterialName("");
      setNewMaterialCost("");
      utils.rawMaterials.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

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

  const updateVendor = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated");
      setIsOpen(false);
      resetVendorForm();
      utils.vendors.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteVendor = trpc.vendors.delete.useMutation({
    onSuccess: () => {
      toast.success("Vendor deleted");
      setVendorToDelete(null);
      utils.vendors.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const autoLinkMutation = trpc.vendors.autoLinkContact.useMutation();

  async function handleOpenChat(vendor: any, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const result = await autoLinkMutation.mutateAsync({ vendorId: vendor.id });
      if (result.contact) {
        const waNumber = result.contact.whatsappNumber || result.contact.phone || vendor.whatsappNumber || vendor.phone;
        if (!waNumber) {
          toast.error("Contact has no WhatsApp/phone number");
          return;
        }
        if (result.autoLinked) {
          toast.success(`Auto-linked to ${result.contact.fullName || "contact"}`);
          utils.vendors.list.invalidate();
        }
        setChatTarget({
          contactId: result.contact.id,
          whatsappNumber: waNumber,
          contactName: result.contact.fullName || vendor.contactName || vendor.name,
          vendorName: vendor.name,
        });
      } else {
        setLinkTarget({ vendorId: vendor.id, vendorName: vendor.name, vendorPhone: vendor.phone });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to open chat");
    }
  }

  const alibabaSearch = trpc.vendors.searchAlibaba.useMutation({
    onSuccess: (data: any) => {
      setAlibabaResults(data.suppliers || []);
      setAlibabaUsedFallback(Boolean(data.usedFallback));
      if (data.suppliers?.length > 0) {
        if (data.usedFallback) {
          toast.info(`Showing ${data.suppliers.length} backup results while Alibaba search is busy.`);
        } else {
          toast.success(`Found ${data.suppliers.length} suppliers on Alibaba`);
        }
      } else {
        setAlibabaUsedFallback(false);
        toast.info("No suppliers found. Try different search terms.");
      }
    },
    onError: (error: any) => toast.error(error.message),
  });

  const openAlibabaLiveSearch = () => {
    const query = alibabaForm.query.trim();
    if (!query) {
      toast.info("Enter a product search term first.");
      return;
    }

    const terms = [query, alibabaForm.category?.trim(), alibabaForm.country?.trim()]
      .filter(Boolean)
      .join(" ");
    const url = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(terms)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleAddAlibabaSupplier = (supplier: any) => {
    createVendor.mutate({
      name: supplier.companyName,
      type: "supplier",
      country: supplier.country || "",
      notes: `Alibaba supplier. Product: ${supplier.productName}. Price: ${supplier.priceRange}. Min Order: ${supplier.minOrder}. Rating: ${supplier.rating}/5. Years in business: ${supplier.yearsInBusiness}. Response rate: ${supplier.responseRate}.${supplier.verified ? ' Verified supplier.' : ''}`,
    });
    setAlibabaResults(prev => prev.filter(s => s.companyName !== supplier.companyName));
  };

  const resetVendorForm = () => {
    setEditingVendorId(null);
    setFormData({
      name: "", contactName: "", email: "", phone: "", type: "supplier",
      address: "", city: "", state: "", country: "", postalCode: "",
      paymentTerms: 30, defaultLeadTimeDays: 14, notes: "",
    });
  };

  const openEditVendor = (vendor: any) => {
    setEditingVendorId(vendor.id);
    setFormData({
      name: vendor.name ?? "",
      contactName: vendor.contactName ?? "",
      email: vendor.email ?? "",
      phone: vendor.phone ?? "",
      type: (vendor.type ?? "supplier") as "supplier" | "contractor" | "service",
      address: vendor.address ?? "",
      city: vendor.city ?? "",
      state: vendor.state ?? "",
      country: vendor.country ?? "",
      postalCode: vendor.postalCode ?? "",
      paymentTerms: vendor.paymentTerms ?? 30,
      defaultLeadTimeDays: vendor.defaultLeadTimeDays ?? 14,
      notes: vendor.notes ?? "",
    });
    setIsOpen(true);
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
    const payload = {
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
    };
    if (editingVendorId !== null) {
      updateVendor.mutate({ id: editingVendorId, ...payload });
    } else {
      createVendor.mutate(payload);
    }
  };

  const isLoading = vendorsLoading;

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
          <Building2 className="h-4 w-4" />
          Vendors
        </h1>
        <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.href = "/import"}>
          <Upload className="h-4 w-4 mr-1" /> Import
        </Button>
        <Button variant="outline" onClick={() => setIsAlibabaOpen(true)}>
          <ShoppingBag className="h-4 w-4 mr-2" />
          Search Alibaba
        </Button>
        <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetVendorForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmitVendor}>
              <DialogHeader>
                <DialogTitle>{editingVendorId !== null ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
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
                <Button type="submit" disabled={createVendor.isPending || updateVendor.isPending}>
                  {(createVendor.isPending || updateVendor.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingVendorId !== null ? "Save changes" : "Add Vendor"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Alibaba Supplier Search Dialog */}
      <Dialog open={isAlibabaOpen} onOpenChange={setIsAlibabaOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Search Alibaba Suppliers</DialogTitle>
            <DialogDescription>Use live Alibaba search in a new tab, or use AI suggestions below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Product Search *</Label>
              <Input
                placeholder="e.g. stainless steel water bottles, organic cotton t-shirts, LED strip lights"
                value={alibabaForm.query}
                onChange={(e) => setAlibabaForm({ ...alibabaForm, query: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category (optional)</Label>
                <Input
                  placeholder="e.g. Electronics, Textiles, Packaging"
                  value={alibabaForm.category}
                  onChange={(e) => setAlibabaForm({ ...alibabaForm, category: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier Country (optional)</Label>
                <Input
                  placeholder="e.g. China, India, Vietnam"
                  value={alibabaForm.country}
                  onChange={(e) => setAlibabaForm({ ...alibabaForm, country: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={openAlibabaLiveSearch}
                disabled={!alibabaForm.query.trim()}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Search Live on Alibaba
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAlibabaUsedFallback(false);
                  alibabaSearch.mutate({
                    query: alibabaForm.query,
                    category: alibabaForm.category || undefined,
                    country: alibabaForm.country || undefined,
                  });
                }}
                disabled={alibabaSearch.isPending || !alibabaForm.query.trim()}
                className="w-full"
              >
                {alibabaSearch.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                {alibabaSearch.isPending ? "Generating..." : "Generate AI Suggestions"}
              </Button>
            </div>

            {/* Results */}
            {alibabaResults.length > 0 && (
              <div className="space-y-2">
                {alibabaUsedFallback && (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Live Alibaba lookup is temporarily overloaded. Showing backup AI-generated supplier matches.
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Found {alibabaResults.length} Suppliers</Label>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {alibabaResults.map((supplier: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-lg hover:bg-muted/50 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{supplier.companyName}</span>
                            {supplier.verified && (
                              <Badge className="bg-blue-500/10 text-blue-600 text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Verified
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{supplier.productName}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          {supplier.alibabaUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => window.open(supplier.alibabaUrl, "_blank")}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Alibaba
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleAddAlibabaSupplier(supplier)}
                            disabled={createVendor.isPending}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add as Vendor
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{supplier.priceRange}</span>
                        <span>MOQ: {supplier.minOrder}</span>
                        <span>{supplier.country}</span>
                        <span>{supplier.yearsInBusiness} yrs in business</span>
                        <span>Response: {supplier.responseRate}</span>
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          {supplier.rating}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                    <TableHead className="text-sm whitespace-nowrap">Docs</TableHead>
                    <TableHead className="text-sm whitespace-nowrap w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.map((vendor) => {
                    const agg = poAggregates.get(vendor.id);
                    const negStatus = negotiationStatusByVendor.get(vendor.id) || "none";
                    const isExpanded = expandedVendorId === vendor.id;
                    const vendorMaterials = rawMaterials?.filter((m: any) => m.preferredVendorId === vendor.id) || [];
                    const vendorProducts = products?.filter((p: any) => p.preferredVendorId === vendor.id) || [];

                    return (
                      <React.Fragment key={vendor.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedVendorId(isExpanded ? null : vendor.id)}>
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
                        <TableCell className="text-sm whitespace-nowrap">
                          <DocumentsCell referenceType="vendor" referenceId={vendor.id} count={docCountByVendor.get(vendor.id) ?? 0} />
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-green-600"
                              onClick={(e) => handleOpenChat(vendor, e)}
                              disabled={autoLinkMutation.isPending && (autoLinkMutation.variables as { vendorId: number } | undefined)?.vendorId === vendor.id}
                              aria-label={`Chat on WhatsApp with ${vendor.name}`}
                            >
                              {autoLinkMutation.isPending && (autoLinkMutation.variables as { vendorId: number } | undefined)?.vendorId === vendor.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MessageCircle className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditVendor(vendor);
                              }}
                              aria-label={`Edit vendor ${vendor.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVendorToDelete({ id: vendor.id, name: vendor.name });
                              }}
                              aria-label={`Delete vendor ${vendor.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={17} className="bg-muted/20 p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                              <div><span className="text-xs text-muted-foreground block">Address</span>{vendor.address || "-"}, {vendor.city || ""} {vendor.state || ""} {vendor.country || ""}</div>
                              <div><span className="text-xs text-muted-foreground block">Lead Time</span>{vendor.defaultLeadTimeDays || 14} days</div>
                              <div><span className="text-xs text-muted-foreground block">Payment Terms</span>Net {vendor.paymentTerms || 30}</div>
                              <div><span className="text-xs text-muted-foreground block">Tax ID</span>{vendor.taxId || "-"}</div>
                            </div>
                            {vendor.notes && <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{vendor.notes}</p>}

                            {/* Materials supplied by this vendor */}
                            <div className="mb-3">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Raw Materials Supplied</h4>
                              {vendorMaterials.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {vendorMaterials.map((m: any) => (
                                    <Badge key={m.id} variant="outline">{m.name} ({m.unit}) — ${parseFloat(m.unitCost || "0").toFixed(2)}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground mb-2">No materials linked yet</p>
                              )}
                              {/* Add material form */}
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="Material name"
                                  value={newMaterialName}
                                  onChange={(e) => setNewMaterialName(e.target.value)}
                                  className="h-7 text-xs w-40"
                                />
                                <Select value={newMaterialUnit} onValueChange={setNewMaterialUnit}>
                                  <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="kg">kg</SelectItem>
                                    <SelectItem value="lb">lb</SelectItem>
                                    <SelectItem value="L">L</SelectItem>
                                    <SelectItem value="gal">gal</SelectItem>
                                    <SelectItem value="ea">ea</SelectItem>
                                    <SelectItem value="cs">case</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  placeholder="Cost"
                                  type="number"
                                  step="0.01"
                                  value={newMaterialCost}
                                  onChange={(e) => setNewMaterialCost(e.target.value)}
                                  className="h-7 text-xs w-20"
                                />
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={!newMaterialName || createRawMaterial.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    createRawMaterial.mutate({
                                      name: newMaterialName,
                                      sku: `RM-${Date.now().toString(36)}`,
                                      unit: newMaterialUnit,
                                      unitCost: newMaterialCost || "0",
                                      preferredVendorId: vendor.id,
                                    } as any);
                                  }}
                                >
                                  {createRawMaterial.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                  Add
                                </Button>
                              </div>
                            </div>

                            {/* Products from this vendor */}
                            {vendorProducts.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Products</h4>
                                <div className="flex flex-wrap gap-2">
                                  {vendorProducts.map((p: any) => (
                                    <Badge key={p.id} variant="secondary">{p.name}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
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

      <AlertDialog open={!!vendorToDelete} onOpenChange={(open) => !open && setVendorToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium">{vendorToDelete?.name}</span>.
              Purchase orders and raw materials linked to this vendor will keep their historical
              record, but the vendor will no longer appear in lists or be selectable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteVendor.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteVendor.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (vendorToDelete) deleteVendor.mutate({ id: vendorToDelete.id });
              }}
            >
              {deleteVendor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete vendor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {chatTarget && (
        <WhatsAppDrawer
          open={!!chatTarget}
          onOpenChange={(open) => !open && setChatTarget(null)}
          contactId={chatTarget.contactId}
          whatsappNumber={chatTarget.whatsappNumber}
          contactName={chatTarget.contactName}
          subtitle={chatTarget.vendorName}
        />
      )}

      {linkTarget && (
        <LinkContactDialog
          open={!!linkTarget}
          onOpenChange={(open) => !open && setLinkTarget(null)}
          vendorId={linkTarget.vendorId}
          vendorName={linkTarget.vendorName}
          vendorPhone={linkTarget.vendorPhone}
          onLinked={(contact) => {
            const waNumber = contact.whatsappNumber || contact.phone;
            if (waNumber) {
              setChatTarget({
                contactId: contact.id,
                whatsappNumber: waNumber,
                contactName: contact.fullName || linkTarget.vendorName,
                vendorName: linkTarget.vendorName,
              });
            }
            setLinkTarget(null);
          }}
        />
      )}
    </div>
  );
}
