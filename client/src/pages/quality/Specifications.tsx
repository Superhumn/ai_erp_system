import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Users, Plus, Search, Loader2, ClipboardList, ExternalLink, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type SpecStatus = "draft" | "active" | "superseded" | "archived";

type ProductSpec = {
  id: number;
  specNumber: string;
  specName: string;
  version: string;
  status: SpecStatus;
  productId: number;
  productName: string;
  allergens: string[];
  allergenStatement: string | null;
  ingredientDeclaration: string | null;
  storageRequirements: string | null;
  shelfLifeDays: number | null;
  shelfLifeUnit: string | null;
  countryOfOrigin: string | null;
  packagingDescription: string | null;
  effectiveDate: string | null;
  description: string | null;
};

type CustomerSpec = {
  id: number;
  customerId: number;
  customerName: string;
  productId: number;
  productName: string;
  baseSpecId: number | null;
  baseSpecNumber: string | null;
  specName: string;
  customerSpecNumber: string | null;
  version: string;
  status: SpecStatus;
  customRequirements: string | null;
  customAllergenStatement: string | null;
  customLabelRequirements: string | null;
};

type Product = { id: number; name: string; sku: string };
type Customer = { id: number; name: string };

// ─── Badge helpers ────────────────────────────────────────────────────────────

const SPEC_STATUS_COLORS: Record<SpecStatus, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  active: "bg-green-500/10 text-green-700",
  superseded: "bg-amber-500/10 text-amber-700",
  archived: "bg-slate-500/10 text-slate-500",
};

function SpecStatusBadge({ status }: { status: SpecStatus }) {
  return (
    <Badge className={SPEC_STATUS_COLORS[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function AllergenBadges({ allergens }: { allergens: string[] }) {
  if (!allergens || allergens.length === 0) return <span className="text-muted-foreground text-xs">None declared</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {allergens.map((a) => (
        <Badge key={a} variant="outline" className="border-red-300 text-red-700 bg-red-50 text-xs px-1.5 py-0">
          {a}
        </Badge>
      ))}
    </div>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Default form states ──────────────────────────────────────────────────────

const defaultProductSpecForm = {
  productId: "",
  specNumber: "",
  specName: "",
  version: "1.0",
  description: "",
  ingredientDeclaration: "",
  allergenStatement: "",
  allergens: "",
  storageRequirements: "",
  shelfLifeDays: "",
  shelfLifeUnit: "days",
  countryOfOrigin: "",
  packagingDescription: "",
};

const defaultCustomerSpecForm = {
  customerId: "",
  productId: "",
  baseSpecId: "",
  specName: "",
  customerSpecNumber: "",
  customRequirements: "",
  customAllergenStatement: "",
  customLabelRequirements: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Specifications() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // ── Tab state
  const [activeTab, setActiveTab] = useState("product-specs");

  // ── Product specs state
  const [specSearch, setSpecSearch] = useState("");
  const [specStatusFilter, setSpecStatusFilter] = useState<string>("all");
  const [productSpecDialogOpen, setProductSpecDialogOpen] = useState(false);
  const [productSpecForm, setProductSpecForm] = useState(defaultProductSpecForm);

  // ── Customer specs state
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [customerSpecDialogOpen, setCustomerSpecDialogOpen] = useState(false);
  const [customerSpecForm, setCustomerSpecForm] = useState(defaultCustomerSpecForm);

  // ── Data queries
  const { data: specsData, isLoading: specsLoading } = trpc.qualityManagement.specs.list.useQuery();
  const { data: customerSpecsData, isLoading: customerSpecsLoading } = trpc.qualityManagement.customerSpecs.list.useQuery();
  const { data: productsData } = trpc.products.list.useQuery();
  const { data: customersData } = trpc.customers.list.useQuery();

  const specs: ProductSpec[] = (specsData ?? []) as ProductSpec[];
  const customerSpecs: CustomerSpec[] = (customerSpecsData ?? []) as CustomerSpec[];
  const products: Product[] = (productsData ?? []) as Product[];
  const customers: Customer[] = (customersData ?? []) as Customer[];

  // ── Mutations
  const createSpecMutation = trpc.qualityManagement.specs.create.useMutation({
    onSuccess: () => {
      toast({ title: "Specification Created", description: "Product specification has been created successfully." });
      setProductSpecDialogOpen(false);
      setProductSpecForm(defaultProductSpecForm);
      utils.qualityManagement.specs.list.invalidate();
    },
    onError: (error) => {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  const createCustomerSpecMutation = trpc.qualityManagement.customerSpecs.create.useMutation({
    onSuccess: () => {
      toast({ title: "Customer Spec Created", description: "Customer specification has been created successfully." });
      setCustomerSpecDialogOpen(false);
      setCustomerSpecForm(defaultCustomerSpecForm);
      utils.qualityManagement.customerSpecs.list.invalidate();
    },
    onError: (error) => {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  // ── Derived stats
  const activeSpecsCount = specs.filter((s) => s.status === "active").length;
  const pendingApprovalCount = specs.filter((s) => s.status === "draft").length;
  const customerSpecsCount = customerSpecs.length;

  const today = new Date();
  const thirtyDaysOut = new Date(today);
  thirtyDaysOut.setDate(today.getDate() + 30);
  const expiringSoonCount = specs.filter((s) => {
    if (!s.effectiveDate) return false;
    const d = new Date(s.effectiveDate);
    return d <= thirtyDaysOut && d >= today;
  }).length;

  // ── Filtered data
  const filteredSpecs = specs.filter((s) => {
    const searchLower = specSearch.toLowerCase();
    const matchesSearch =
      !specSearch ||
      s.productName?.toLowerCase().includes(searchLower) ||
      s.specName?.toLowerCase().includes(searchLower) ||
      s.specNumber?.toLowerCase().includes(searchLower);
    const matchesStatus = specStatusFilter === "all" || s.status === specStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredCustomerSpecs = customerSpecs.filter((cs) => {
    return customerFilter === "all" || String(cs.customerId) === customerFilter;
  });

  // ── Handlers
  function handleCreateProductSpec(e: React.FormEvent) {
    e.preventDefault();
    const allergensList = productSpecForm.allergens
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    createSpecMutation.mutate({
      productId: parseInt(productSpecForm.productId),
      specNumber: productSpecForm.specNumber,
      specName: productSpecForm.specName,
      version: productSpecForm.version,
      description: productSpecForm.description || undefined,
      ingredientDeclaration: productSpecForm.ingredientDeclaration || undefined,
      allergenStatement: productSpecForm.allergenStatement || undefined,
      allergens: allergensList,
      storageRequirements: productSpecForm.storageRequirements || undefined,
      shelfLifeDays: productSpecForm.shelfLifeDays ? parseInt(productSpecForm.shelfLifeDays) : undefined,
      shelfLifeUnit: productSpecForm.shelfLifeUnit || undefined,
      countryOfOrigin: productSpecForm.countryOfOrigin || undefined,
      packagingDescription: productSpecForm.packagingDescription || undefined,
    });
  }

  function handleCreateCustomerSpec(e: React.FormEvent) {
    e.preventDefault();
    createCustomerSpecMutation.mutate({
      customerId: parseInt(customerSpecForm.customerId),
      productId: parseInt(customerSpecForm.productId),
      baseSpecId: customerSpecForm.baseSpecId ? parseInt(customerSpecForm.baseSpecId) : undefined,
      specName: customerSpecForm.specName,
      customerSpecNumber: customerSpecForm.customerSpecNumber || undefined,
      customRequirements: customerSpecForm.customRequirements || undefined,
      customAllergenStatement: customerSpecForm.customAllergenStatement || undefined,
      customLabelRequirements: customerSpecForm.customLabelRequirements || undefined,
    });
  }

  const uniqueCustomers = customers.filter((c) =>
    customerSpecs.some((cs) => cs.customerId === c.id)
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Product Specifications
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage product specifications, allergen declarations, and customer-specific requirements.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Active Specs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {specsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-green-400" />
            ) : (
              <p className="text-3xl font-bold text-green-700">{activeSpecsCount}</p>
            )}
            <p className="text-xs text-green-600 mt-1">Currently in effect</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Customer-Specific
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customerSpecsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            ) : (
              <p className="text-3xl font-bold text-blue-700">{customerSpecsCount}</p>
            )}
            <p className="text-xs text-blue-600 mt-1">Custom requirements</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-700 flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            {specsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            ) : (
              <p className="text-3xl font-bold text-amber-700">{pendingApprovalCount}</p>
            )}
            <p className="text-xs text-amber-600 mt-1">Draft specs awaiting review</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {specsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            ) : (
              <p className="text-3xl font-bold text-orange-700">{expiringSoonCount}</p>
            )}
            <p className="text-xs text-orange-600 mt-1">Within next 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="product-specs" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Product Specifications
          </TabsTrigger>
          <TabsTrigger value="customer-specs" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Customer Specifications
          </TabsTrigger>
        </TabsList>

        {/* ── Product Specifications Tab ── */}
        <TabsContent value="product-specs" className="space-y-4 mt-4">
          {/* Filter + Action Bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by product or spec name..."
                    value={specSearch}
                    onChange={(e) => setSpecSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={specStatusFilter} onValueChange={setSpecStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="superseded">Superseded</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="ml-auto">
                  <Button onClick={() => setProductSpecDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Specification
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Specs Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Product Specifications
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {filteredSpecs.length} record{filteredSpecs.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {specsLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading specifications...
                </div>
              ) : filteredSpecs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <FileText className="w-10 h-10 opacity-20" />
                  <p className="text-sm">No specifications found.</p>
                  <p className="text-xs">Create your first product specification to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Spec #</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Spec Name</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Product</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Version</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Allergens</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Shelf Life</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Effective Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSpecs.map((spec, idx) => (
                        <tr
                          key={spec.id}
                          className={`border-b transition-colors hover:bg-muted/50 ${
                            idx % 2 === 0 ? "bg-white" : "bg-muted/20"
                          }`}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">
                            {spec.specNumber}
                          </td>
                          <td className="px-4 py-3 font-medium max-w-[180px] truncate" title={spec.specName}>
                            {spec.specName}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {spec.productName}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            v{spec.version}
                          </td>
                          <td className="px-4 py-3">
                            <SpecStatusBadge status={spec.status} />
                          </td>
                          <td className="px-4 py-3">
                            <AllergenBadges allergens={spec.allergens ?? []} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {spec.shelfLifeDays
                              ? `${spec.shelfLifeDays} ${spec.shelfLifeUnit ?? "days"}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {formatDate(spec.effectiveDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Customer Specifications Tab ── */}
        <TabsContent value="customer-specs" className="space-y-4 mt-4">
          {/* Filter + Action Bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Filter by Customer</Label>
                  <Select value={customerFilter} onValueChange={setCustomerFilter}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="All customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {uniqueCustomers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="ml-auto">
                  <Button onClick={() => setCustomerSpecDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Customer Spec
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Specs Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Customer Specifications
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {filteredCustomerSpecs.length} record{filteredCustomerSpecs.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {customerSpecsLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading customer specifications...
                </div>
              ) : filteredCustomerSpecs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Users className="w-10 h-10 opacity-20" />
                  <p className="text-sm">No customer specifications found.</p>
                  <p className="text-xs">Create customer-specific requirements to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Customer</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Product</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Spec Name</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Customer Spec #</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Base Spec</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Version</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Custom Requirements</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomerSpecs.map((cs, idx) => (
                        <tr
                          key={cs.id}
                          className={`border-b transition-colors hover:bg-muted/50 ${
                            idx % 2 === 0 ? "bg-white" : "bg-muted/20"
                          }`}
                        >
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{cs.customerName}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{cs.productName}</td>
                          <td className="px-4 py-3 font-medium max-w-[160px] truncate" title={cs.specName}>
                            {cs.specName}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {cs.customerSpecNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {cs.baseSpecNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            v{cs.version}
                          </td>
                          <td className="px-4 py-3">
                            <SpecStatusBadge status={cs.status} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs max-w-[220px] truncate" title={cs.customRequirements ?? ""}>
                            {cs.customRequirements ? cs.customRequirements : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Create Product Spec Dialog ── */}
      <Dialog open={productSpecDialogOpen} onOpenChange={(open) => { setProductSpecDialogOpen(open); if (!open) setProductSpecForm(defaultProductSpecForm); }}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreateProductSpec}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                New Product Specification
              </DialogTitle>
              <DialogDescription>
                Define a product specification with allergen and formulation details.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Row 1: Product + Spec Number */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ps-product">Product *</Label>
                  <Select
                    value={productSpecForm.productId}
                    onValueChange={(v) => setProductSpecForm({ ...productSpecForm, productId: v })}
                    required
                  >
                    <SelectTrigger id="ps-product">
                      <SelectValue placeholder="Select product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} ({p.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-specNumber">Spec Number *</Label>
                  <Input
                    id="ps-specNumber"
                    placeholder="e.g. SPEC-0042"
                    value={productSpecForm.specNumber}
                    onChange={(e) => setProductSpecForm({ ...productSpecForm, specNumber: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Row 2: Spec Name + Version */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ps-specName">Spec Name *</Label>
                  <Input
                    id="ps-specName"
                    placeholder="e.g. Organic Oat Flour — Foodservice Grade"
                    value={productSpecForm.specName}
                    onChange={(e) => setProductSpecForm({ ...productSpecForm, specName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-version">Version</Label>
                  <Input
                    id="ps-version"
                    placeholder="1.0"
                    value={productSpecForm.version}
                    onChange={(e) => setProductSpecForm({ ...productSpecForm, version: e.target.value })}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="ps-description">Description</Label>
                <Textarea
                  id="ps-description"
                  placeholder="Brief description of the product and intended use..."
                  value={productSpecForm.description}
                  onChange={(e) => setProductSpecForm({ ...productSpecForm, description: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Ingredient Declaration */}
              <div className="space-y-1.5">
                <Label htmlFor="ps-ingredient">Ingredient Declaration</Label>
                <Textarea
                  id="ps-ingredient"
                  placeholder="List all ingredients in descending order of predominance..."
                  value={productSpecForm.ingredientDeclaration}
                  onChange={(e) => setProductSpecForm({ ...productSpecForm, ingredientDeclaration: e.target.value })}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Allergen Statement */}
              <div className="space-y-1.5">
                <Label htmlFor="ps-allergenStatement">Allergen Statement</Label>
                <Textarea
                  id="ps-allergenStatement"
                  placeholder="e.g. Contains: Wheat, Soy. May contain traces of Tree Nuts."
                  value={productSpecForm.allergenStatement}
                  onChange={(e) => setProductSpecForm({ ...productSpecForm, allergenStatement: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Allergens (comma-separated) */}
              <div className="space-y-1.5">
                <Label htmlFor="ps-allergens">Allergens (comma-separated)</Label>
                <Input
                  id="ps-allergens"
                  placeholder="e.g. Wheat, Soy, Milk"
                  value={productSpecForm.allergens}
                  onChange={(e) => setProductSpecForm({ ...productSpecForm, allergens: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Enter each allergen separated by a comma. These will appear as badges on the spec.</p>
              </div>

              {/* Row: Storage + Shelf Life */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ps-storage">Storage Requirements</Label>
                  <Input
                    id="ps-storage"
                    placeholder="e.g. Store in cool, dry place below 70°F"
                    value={productSpecForm.storageRequirements}
                    onChange={(e) => setProductSpecForm({ ...productSpecForm, storageRequirements: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Shelf Life</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="365"
                      min={1}
                      value={productSpecForm.shelfLifeDays}
                      onChange={(e) => setProductSpecForm({ ...productSpecForm, shelfLifeDays: e.target.value })}
                      className="w-24"
                    />
                    <Select
                      value={productSpecForm.shelfLifeUnit}
                      onValueChange={(v) => setProductSpecForm({ ...productSpecForm, shelfLifeUnit: v })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                        <SelectItem value="years">Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Row: Country of Origin + Packaging */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ps-origin">Country of Origin</Label>
                  <Input
                    id="ps-origin"
                    placeholder="e.g. USA"
                    value={productSpecForm.countryOfOrigin}
                    onChange={(e) => setProductSpecForm({ ...productSpecForm, countryOfOrigin: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-packaging">Packaging Description</Label>
                  <Input
                    id="ps-packaging"
                    placeholder="e.g. 50 lb multi-wall paper bag"
                    value={productSpecForm.packagingDescription}
                    onChange={(e) => setProductSpecForm({ ...productSpecForm, packagingDescription: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setProductSpecDialogOpen(false); setProductSpecForm(defaultProductSpecForm); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSpecMutation.isPending || !productSpecForm.productId || !productSpecForm.specNumber || !productSpecForm.specName}>
                {createSpecMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Specification
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Create Customer Spec Dialog ── */}
      <Dialog open={customerSpecDialogOpen} onOpenChange={(open) => { setCustomerSpecDialogOpen(open); if (!open) setCustomerSpecForm(defaultCustomerSpecForm); }}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleCreateCustomerSpec}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                New Customer Specification
              </DialogTitle>
              <DialogDescription>
                Create a customer-specific version of a product specification with custom requirements.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Customer */}
              <div className="space-y-1.5">
                <Label htmlFor="cs-customer">Customer *</Label>
                <Select
                  value={customerSpecForm.customerId}
                  onValueChange={(v) => setCustomerSpecForm({ ...customerSpecForm, customerId: v })}
                  required
                >
                  <SelectTrigger id="cs-customer">
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product */}
              <div className="space-y-1.5">
                <Label htmlFor="cs-product">Product *</Label>
                <Select
                  value={customerSpecForm.productId}
                  onValueChange={(v) => setCustomerSpecForm({ ...customerSpecForm, productId: v })}
                  required
                >
                  <SelectTrigger id="cs-product">
                    <SelectValue placeholder="Select product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Base Spec */}
              <div className="space-y-1.5">
                <Label htmlFor="cs-baseSpec">Base Specification</Label>
                <Select
                  value={customerSpecForm.baseSpecId}
                  onValueChange={(v) => setCustomerSpecForm({ ...customerSpecForm, baseSpecId: v })}
                >
                  <SelectTrigger id="cs-baseSpec">
                    <SelectValue placeholder="Select base spec (optional)..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {specs
                      .filter((s) => s.status === "active" || s.status === "draft")
                      .map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.specNumber} — {s.specName} (v{s.version})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Spec Name + Customer Spec # */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cs-specName">Spec Name *</Label>
                  <Input
                    id="cs-specName"
                    placeholder="e.g. Acme Oat Flour Spec"
                    value={customerSpecForm.specName}
                    onChange={(e) => setCustomerSpecForm({ ...customerSpecForm, specName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-customerSpecNumber">Customer Spec #</Label>
                  <Input
                    id="cs-customerSpecNumber"
                    placeholder="e.g. ACME-OAT-001"
                    value={customerSpecForm.customerSpecNumber}
                    onChange={(e) => setCustomerSpecForm({ ...customerSpecForm, customerSpecNumber: e.target.value })}
                  />
                </div>
              </div>

              {/* Custom Requirements */}
              <div className="space-y-1.5">
                <Label htmlFor="cs-customReq">Custom Requirements</Label>
                <Textarea
                  id="cs-customReq"
                  placeholder="List any customer-specific quality, processing, or packaging requirements..."
                  value={customerSpecForm.customRequirements}
                  onChange={(e) => setCustomerSpecForm({ ...customerSpecForm, customRequirements: e.target.value })}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Custom Allergen Statement */}
              <div className="space-y-1.5">
                <Label htmlFor="cs-allergenStatement">Custom Allergen Statement</Label>
                <Textarea
                  id="cs-allergenStatement"
                  placeholder="Override allergen statement for this customer if different from the base spec..."
                  value={customerSpecForm.customAllergenStatement}
                  onChange={(e) => setCustomerSpecForm({ ...customerSpecForm, customAllergenStatement: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Custom Label Requirements */}
              <div className="space-y-1.5">
                <Label htmlFor="cs-labelReq">Custom Label Requirements</Label>
                <Textarea
                  id="cs-labelReq"
                  placeholder="Customer-specific label copy, certifications, or branding requirements..."
                  value={customerSpecForm.customLabelRequirements}
                  onChange={(e) => setCustomerSpecForm({ ...customerSpecForm, customLabelRequirements: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setCustomerSpecDialogOpen(false); setCustomerSpecForm(defaultCustomerSpecForm); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCustomerSpecMutation.isPending || !customerSpecForm.customerId || !customerSpecForm.productId || !customerSpecForm.specName}>
                {createCustomerSpecMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Customer Spec
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
