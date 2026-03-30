import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Search, Loader2, Shield, Package, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ---- Helper: status badge variant ----
function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status?.toLowerCase()) {
    case "approved":
    case "active":
    case "shipped":
      return "default";
    case "draft":
    case "pending":
    case "pending_review":
      return "outline";
    case "rejected":
    case "expired":
    case "archived":
      return "destructive";
    default:
      return "secondary";
  }
}

// ---- Helper: format date strings ----
function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

// ============================================================
// COA DOWNLOAD CENTER TAB
// ============================================================
function CoaDownloadCenter() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Load all approved COAs; client-side filter by lot/product/COA number
  const { data: coas, isLoading } = trpc.qualityManagement.coas.list.useQuery(
    { status: "approved" },
    { enabled: true }
  );

  const filtered = (coas ?? []).filter((coa: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      coa.coaNumber?.toLowerCase().includes(q) ||
      coa.productName?.toLowerCase().includes(q) ||
      coa.product?.name?.toLowerCase().includes(q) ||
      coa.lotNumber?.toLowerCase().includes(q) ||
      coa.lot?.lotNumber?.toLowerCase().includes(q)
    );
  });

  function handleSearch() {
    setSearchQuery(searchInput.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  function handleDownload(coa: any) {
    const url = coa.documentUrl;
    if (!url) {
      toast({
        title: "No document available",
        description: "This COA does not have an attached document yet.",
        variant: "destructive",
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by lot number, product name, or COA number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading certificates…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <FileText className="h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">
            {searchQuery
              ? `No COAs found matching "${searchQuery}"`
              : "Search for a lot number or product to find COAs"}
          </p>
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSearchInput("");
              }}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">COA Number</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lot Number</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issue Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((coa: any) => (
                <tr key={coa.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                    {coa.coaNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {coa.productName ?? coa.product?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {coa.lotNumber ?? coa.lot?.lotNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(coa.issueDate)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(coa.status ?? "approved")}>
                      {coa.status ?? "approved"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(coa)}
                      disabled={!coa.documentUrl}
                      title={coa.documentUrl ? "Download COA" : "No document attached"}
                      className="gap-1.5"
                    >
                      <Download className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">Download</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} certificate{filtered.length !== 1 ? "s" : ""}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      )}
    </div>
  );
}

// ============================================================
// SPEC SHEET LIBRARY TAB
// ============================================================
function SpecSheetLibrary() {
  const { toast } = useToast();
  const [filterText, setFilterText] = useState("");

  const { data: specs, isLoading } = trpc.qualityManagement.specs.list.useQuery(
    { status: "active" }
  );

  const filtered = (specs ?? []).filter((spec: any) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      spec.specName?.toLowerCase().includes(q) ||
      spec.productName?.toLowerCase().includes(q) ||
      spec.product?.name?.toLowerCase().includes(q) ||
      spec.specNumber?.toLowerCase().includes(q)
    );
  });

  function handleView(spec: any) {
    if (!spec.documentUrl) {
      toast({
        title: "No document available",
        description: "This spec sheet does not have an attached document yet.",
        variant: "destructive",
      });
      return;
    }
    window.open(spec.documentUrl, "_blank", "noopener,noreferrer");
  }

  function handleDownload(spec: any) {
    if (!spec.documentUrl) {
      toast({
        title: "No document available",
        description: "This spec sheet does not have an attached document yet.",
        variant: "destructive",
      });
      return;
    }
    const link = document.createElement("a");
    link.href = spec.documentUrl;
    link.download = `${spec.specNumber ?? "spec-sheet"}.pdf`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const allergenList = (spec: any): string[] => {
    if (!spec.allergens) return [];
    if (Array.isArray(spec.allergens)) return spec.allergens as string[];
    if (typeof spec.allergens === "string") {
      try {
        return JSON.parse(spec.allergens);
      } catch {
        return spec.allergens
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    return [];
  };

  function shelfLifeLabel(spec: any): string {
    if (!spec.shelfLifeDays && !spec.shelfLife) return "—";
    if (spec.shelfLife) return spec.shelfLife;
    const days = spec.shelfLifeDays as number;
    const unit = spec.shelfLifeUnit ?? "days";
    if (unit === "days") {
      if (days % 365 === 0) return `${days / 365} year${days / 365 !== 1 ? "s" : ""}`;
      if (days % 30 === 0) return `${days / 30} month${days / 30 !== 1 ? "s" : ""}`;
      return `${days} day${days !== 1 ? "s" : ""}`;
    }
    return `${days} ${unit}`;
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Filter by product name…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading spec sheets…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Package className="h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">
            {filterText
              ? `No specs found matching "${filterText}"`
              : "No active spec sheets available"}
          </p>
          {filterText && (
            <Button variant="ghost" size="sm" onClick={() => setFilterText("")}>
              Clear filter
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((spec: any) => {
            const allergens = allergenList(spec);
            const productName =
              spec.specName ??
              spec.productName ??
              spec.product?.name ??
              "Unknown Product";
            return (
              <Card
                key={spec.id}
                className="flex flex-col hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight line-clamp-2">
                      {productName}
                    </CardTitle>
                    <Badge
                      variant={statusVariant(spec.status ?? "active")}
                      className="shrink-0 text-xs"
                    >
                      {spec.status ?? "active"}
                    </Badge>
                  </div>
                  {spec.specNumber && (
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">
                      {spec.specNumber}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-3">
                  {/* Version & shelf life */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                        Version
                      </p>
                      <p className="font-medium">
                        {spec.version ?? spec.revisionNumber ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                        Shelf Life
                      </p>
                      <p className="font-medium">{shelfLifeLabel(spec)}</p>
                    </div>
                  </div>

                  {/* Allergens */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5">
                      Allergens
                    </p>
                    {allergens.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {allergens.map((allergen: string) => (
                          <Badge
                            key={allergen}
                            variant="outline"
                            className="text-xs px-1.5 py-0 font-normal"
                          >
                            {allergen}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        None declared
                      </p>
                    )}
                  </div>

                  {/* Effective date if available */}
                  {spec.effectiveDate && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                        Effective
                      </p>
                      <p className="text-sm">{formatDate(spec.effectiveDate)}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-auto pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => handleView(spec)}
                      disabled={!spec.documentUrl}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      View Spec
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => handleDownload(spec)}
                      disabled={!spec.documentUrl}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} spec sheet{filtered.length !== 1 ? "s" : ""} available
          {filterText && ` matching "${filterText}"`}
        </p>
      )}
    </div>
  );
}

// ============================================================
// MY ORDERS TAB
// ============================================================
function MyOrders() {
  const { toast } = useToast();

  const { data: shipments, isLoading } =
    trpc.qualityManagement.traceability.shipments.list.useQuery();

  function handleCoaDownload(shipment: any) {
    const url =
      shipment.coaDocumentUrl ??
      shipment.coa?.documentUrl ??
      null;
    if (!url) {
      toast({
        title: "COA not available",
        description: "No COA is currently linked to this shipment.",
        variant: "destructive",
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const rows = shipments ?? [];

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading order history…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <ClipboardList className="h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">No shipments found</p>
          <p className="text-xs text-center max-w-xs">
            Your order and lot history will appear here once shipments are
            recorded in the system.
          </p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Order #
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Product
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Lot Number
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Qty Shipped
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Ship Date
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  COA Available
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((shipment: any) => {
                const hasCoA = !!(
                  shipment.coaDocumentUrl ??
                  shipment.coa?.documentUrl ??
                  shipment.coaAvailable
                );
                const productName =
                  shipment.productName ??
                  shipment.product?.name ??
                  shipment.lot?.product?.name ??
                  "—";
                const lotNumber =
                  shipment.lotNumber ??
                  shipment.lot?.lotNumber ??
                  "—";
                const orderRef =
                  shipment.orderNumber ??
                  shipment.salesOrderNumber ??
                  shipment.referenceNumber ??
                  `#${shipment.id}`;
                const qty =
                  shipment.quantityShipped != null
                    ? `${Number(shipment.quantityShipped).toLocaleString()} ${
                        shipment.quantityUnit ??
                        shipment.unit ??
                        shipment.unitOfMeasure ??
                        ""
                      }`.trim()
                    : "—";

                return (
                  <tr
                    key={shipment.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      {orderRef}
                    </td>
                    <td className="px-4 py-3 font-medium">{productName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{lotNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{qty}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(shipment.shipDate ?? shipment.shippedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {hasCoA ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 gap-1.5 text-primary font-medium"
                          onClick={() => handleCoaDownload(shipment)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Yes — Download
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">
                          Not yet available
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {rows.length} shipment{rows.length !== 1 ? "s" : ""} in your history
        </p>
      )}
    </div>
  );
}

// ============================================================
// MAIN CUSTOMER PORTAL PAGE
// ============================================================
export default function CustomerPortal() {
  const [activeTab, setActiveTab] = useState("coa");

  return (
    <div className="min-h-screen bg-background">
      {/* ---- Header / Branding ---- */}
      <div className="border-b bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Customer Portal
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quality documents, spec sheets, and order history
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
            <Shield className="h-3.5 w-3.5 text-green-500" />
            <span>Secure Portal</span>
          </div>
        </div>
      </div>

      {/* ---- Main content ---- */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
            <TabsTrigger value="coa" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">COA Download Center</span>
              <span className="sm:hidden">COAs</span>
            </TabsTrigger>
            <TabsTrigger value="specs" className="gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Spec Sheet Library</span>
              <span className="sm:hidden">Specs</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">My Orders</span>
              <span className="sm:hidden">Orders</span>
            </TabsTrigger>
          </TabsList>

          {/* ---- COA Download Center ---- */}
          <TabsContent value="coa">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">COA Download Center</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  Search and download Certificates of Analysis by lot number,
                  product name, or COA number. Only approved COAs are shown.
                </p>
              </CardHeader>
              <CardContent>
                <CoaDownloadCenter />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- Spec Sheet Library ---- */}
          <TabsContent value="specs">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Spec Sheet Library</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  Browse and download product specification sheets for the
                  products you purchase. Showing active specifications only.
                </p>
              </CardHeader>
              <CardContent>
                <SpecSheetLibrary />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- My Orders ---- */}
          <TabsContent value="orders">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">My Orders</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  View recent shipments along with their lot information and
                  download linked COAs directly from this list.
                </p>
              </CardHeader>
              <CardContent>
                <MyOrders />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
