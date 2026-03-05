import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  Plug,
  ShoppingCart,
  Search,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

// ============================================
// PRE-CONFIGURED RETAILER TEMPLATES
// ============================================

interface RetailerTemplate {
  name: string;
  logo?: string;
  partnerType: "retailer" | "distributor" | "wholesaler" | "marketplace" | "3pl";
  isaId: string;
  isaQualifier: string;
  gsId: string;
  connectionType: "as2" | "sftp" | "van" | "api" | "email";
  connectionHost?: string;
  connectionPort?: number;
  requiresFunctionalAck: boolean;
  testMode: boolean;
  notes: string;
  docSets: string[];
}

const RETAILER_TEMPLATES: Record<string, RetailerTemplate> = {
  walmart: {
    name: "Walmart",
    partnerType: "retailer",
    isaId: "08925485US00",
    isaQualifier: "01",
    gsId: "08925485US00",
    connectionType: "as2",
    connectionHost: "as2.wal-mart.com",
    connectionPort: 443,
    requiresFunctionalAck: true,
    testMode: true,
    notes: "Walmart EDI via AS2. Requires GS1-128 labels. Strict compliance: chargebacks for late ASNs (must send within 30 min of ship). Must-have document sets: 850, 855, 856, 810, 997.",
    docSets: ["850", "855", "856", "810", "997"],
  },
  target: {
    name: "Target",
    partnerType: "retailer",
    isaId: "TARGET",
    isaQualifier: "ZZ",
    gsId: "TARGET",
    connectionType: "van",
    requiresFunctionalAck: true,
    testMode: true,
    notes: "Target EDI typically via SPS Commerce VAN. Requires GTIN/UPC for all items. Document sets: 850, 855, 856, 810, 997.",
    docSets: ["850", "855", "856", "810", "997"],
  },
  kroger: {
    name: "Kroger",
    partnerType: "retailer",
    isaId: "KROGER",
    isaQualifier: "ZZ",
    gsId: "KROGER",
    connectionType: "as2",
    requiresFunctionalAck: true,
    testMode: true,
    notes: "Kroger EDI via AS2 or VAN. GS1-128 labels required. Document sets: 850, 855, 856, 810, 997.",
    docSets: ["850", "855", "856", "810", "997"],
  },
  costco: {
    name: "Costco",
    partnerType: "retailer",
    isaId: "COSTCO",
    isaQualifier: "ZZ",
    gsId: "COSTCO",
    connectionType: "sftp",
    requiresFunctionalAck: true,
    testMode: true,
    notes: "Costco EDI via SFTP. Relatively straightforward compliance. Document sets: 850, 855, 856, 810, 997.",
    docSets: ["850", "855", "856", "810", "997"],
  },
  amazon_vendor: {
    name: "Amazon (Vendor Central)",
    partnerType: "marketplace",
    isaId: "AMAZON",
    isaQualifier: "ZZ",
    gsId: "AMAZON",
    connectionType: "api",
    requiresFunctionalAck: false,
    testMode: true,
    notes: "Amazon Vendor Central uses EDI 850/855/856/810. Connection typically through SPS Commerce or direct API integration.",
    docSets: ["850", "855", "856", "810"],
  },
  sps_commerce: {
    name: "SPS Commerce (VAN)",
    partnerType: "3pl",
    isaId: "",
    isaQualifier: "ZZ",
    gsId: "",
    connectionType: "sftp",
    connectionHost: "ftp.spscommerce.com",
    connectionPort: 22,
    requiresFunctionalAck: true,
    testMode: true,
    notes: "SPS Commerce VAN. Acts as middleman between you and the retailer. They provide your ISA/GS IDs during onboarding. SFTP connection to their servers.",
    docSets: ["850", "855", "856", "810", "997"],
  },
  truecommerce: {
    name: "TrueCommerce (VAN)",
    partnerType: "3pl",
    isaId: "",
    isaQualifier: "ZZ",
    gsId: "",
    connectionType: "sftp",
    requiresFunctionalAck: true,
    testMode: true,
    notes: "TrueCommerce VAN. Provides EDI translation and routing to retailers. They assign ISA/GS IDs during setup.",
    docSets: ["850", "855", "856", "810", "997"],
  },
};

// ============================================
// WIZARD STEPS
// ============================================

type WizardStep = "select" | "credentials" | "crosswalks" | "test" | "done";

export default function RetailerOnboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<WizardStep>("select");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [createdPartnerId, setCreatedPartnerId] = useState<number | null>(null);
  const [crosswalkRows, setCrosswalkRows] = useState<Array<{ buyerPartNumber: string; vendorPartNumber: string; upc: string; productId: string; description: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state for credentials step
  const [formData, setFormData] = useState({
    name: "",
    isaId: "",
    isaQualifier: "ZZ",
    gsId: "",
    connectionType: "sftp" as string,
    connectionHost: "",
    connectionPort: "",
    connectionUsername: "",
    connectionPassword: "",
    as2Id: "",
    as2Url: "",
    ediContactName: "",
    ediContactEmail: "",
    notes: "",
  });

  const createPartner = trpc.edi.partners.create.useMutation({
    onSuccess: (result) => {
      setCreatedPartnerId(result.id);
      toast.success(`${formData.name} created successfully`);
      setStep("crosswalks");
    },
    onError: (error) => toast.error(error.message),
  });

  const createCrosswalk = trpc.edi.crosswalks.create.useMutation();

  const testConnection = trpc.edi.transport.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const updatePartner = trpc.edi.partners.update.useMutation({
    onSuccess: () => toast.success("Partner activated"),
    onError: (error) => toast.error(error.message),
  });

  // ---- STEP: Select Retailer ----

  const handleSelectTemplate = (key: string) => {
    const template = RETAILER_TEMPLATES[key];
    setSelectedTemplate(key);
    setFormData({
      ...formData,
      name: template.name,
      isaId: template.isaId,
      isaQualifier: template.isaQualifier,
      gsId: template.gsId,
      connectionType: template.connectionType,
      connectionHost: template.connectionHost || "",
      connectionPort: template.connectionPort?.toString() || "",
      notes: template.notes,
    });
    setStep("credentials");
  };

  const handleSelectCustom = () => {
    setSelectedTemplate(null);
    setFormData({
      name: "",
      isaId: "",
      isaQualifier: "ZZ",
      gsId: "",
      connectionType: "sftp",
      connectionHost: "",
      connectionPort: "",
      connectionUsername: "",
      connectionPassword: "",
      as2Id: "",
      as2Url: "",
      ediContactName: "",
      ediContactEmail: "",
      notes: "",
    });
    setStep("credentials");
  };

  // ---- STEP: Credentials ----

  const handleCreatePartner = () => {
    createPartner.mutate({
      name: formData.name,
      partnerType: selectedTemplate ? RETAILER_TEMPLATES[selectedTemplate]?.partnerType || "retailer" : "retailer",
      isaId: formData.isaId,
      isaQualifier: formData.isaQualifier,
      gsId: formData.gsId,
      connectionType: formData.connectionType as any,
      connectionHost: formData.connectionHost || undefined,
      connectionPort: formData.connectionPort ? parseInt(formData.connectionPort) : undefined,
      connectionUsername: formData.connectionUsername || undefined,
      connectionPassword: formData.connectionPassword || undefined,
      as2Id: formData.as2Id || undefined,
      as2Url: formData.as2Url || undefined,
      ediContactName: formData.ediContactName || undefined,
      ediContactEmail: formData.ediContactEmail || undefined,
      notes: formData.notes || undefined,
      testMode: true,
      requiresFunctionalAck: selectedTemplate ? RETAILER_TEMPLATES[selectedTemplate]?.requiresFunctionalAck : true,
    });
  };

  // ---- STEP: Crosswalks CSV ----

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim());

      if (lines.length < 2) {
        toast.error("CSV must have a header row and at least one data row");
        return;
      }

      const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
      const buyerIdx = header.findIndex(h => h.includes("buyer") || h.includes("their") || h.includes("retailer") || h === "buyer_part");
      const vendorIdx = header.findIndex(h => h.includes("vendor") || h.includes("our") || h.includes("sku") || h === "vendor_part");
      const upcIdx = header.findIndex(h => h.includes("upc") || h.includes("gtin") || h.includes("barcode") || h === "ean");
      const productIdx = header.findIndex(h => h.includes("product_id") || h.includes("internal") || h.includes("id"));
      const descIdx = header.findIndex(h => h.includes("desc") || h.includes("name") || h.includes("title"));

      const rows = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
        return {
          buyerPartNumber: buyerIdx >= 0 ? cols[buyerIdx] || "" : "",
          vendorPartNumber: vendorIdx >= 0 ? cols[vendorIdx] || "" : "",
          upc: upcIdx >= 0 ? cols[upcIdx] || "" : "",
          productId: productIdx >= 0 ? cols[productIdx] || "" : "",
          description: descIdx >= 0 ? cols[descIdx] || "" : "",
        };
      }).filter(r => r.buyerPartNumber || r.vendorPartNumber || r.upc);

      setCrosswalkRows(rows);
      toast.success(`Loaded ${rows.length} product mappings from CSV`);
    };
    reader.readAsText(file);
  };

  const handleSaveCrosswalks = async () => {
    if (!createdPartnerId || crosswalkRows.length === 0) {
      setStep("test");
      return;
    }

    let saved = 0;
    for (const row of crosswalkRows) {
      try {
        await createCrosswalk.mutateAsync({
          tradingPartnerId: createdPartnerId,
          productId: parseInt(row.productId) || 0,
          buyerPartNumber: row.buyerPartNumber || undefined,
          vendorPartNumber: row.vendorPartNumber || undefined,
          upc: row.upc || undefined,
          buyerDescription: row.description || undefined,
        });
        saved++;
      } catch {
        // Skip duplicates or invalid rows
      }
    }
    toast.success(`Saved ${saved} of ${crosswalkRows.length} product mappings`);
    setStep("test");
  };

  // ---- STEP: Test ----

  const handleActivate = () => {
    if (!createdPartnerId) return;
    updatePartner.mutate({ id: createdPartnerId, status: "active", testMode: false });
    setStep("done");
  };

  // ---- Filtered templates ----
  const filteredTemplates = Object.entries(RETAILER_TEMPLATES).filter(([, t]) =>
    t.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // ---- RENDER ----

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {step === "select" ? (
          <Link href="/edi">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              EDI Hub
            </Button>
          </Link>
        ) : step !== "done" ? (
          <Button variant="ghost" size="sm" onClick={() => {
            if (step === "credentials") setStep("select");
            else if (step === "crosswalks") setStep("credentials");
            else if (step === "test") setStep("crosswalks");
          }}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        ) : null}
        <div>
          <h1 className="text-2xl font-bold">Connect a Retailer</h1>
          <p className="text-muted-foreground">
            {step === "select" && "Choose a retailer or set up a custom connection"}
            {step === "credentials" && "Enter connection details"}
            {step === "crosswalks" && "Map your products to the retailer's item numbers"}
            {step === "test" && "Test the connection and go live"}
            {step === "done" && "You're all set!"}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {(["select", "credentials", "crosswalks", "test", "done"] as WizardStep[]).map((s, i) => {
          const labels = ["Select", "Connect", "Products", "Test", "Done"];
          const isActive = s === step;
          const isPast = ["select", "credentials", "crosswalks", "test", "done"].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${isPast ? "bg-green-500" : "bg-gray-200"}`} />}
              <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${
                isActive ? "bg-primary text-primary-foreground" :
                isPast ? "bg-green-100 text-green-700" :
                "bg-gray-100 text-gray-500"
              }`}>
                {isPast && <CheckCircle2 className="h-3.5 w-3.5" />}
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================ */}
      {/* STEP 1: SELECT RETAILER */}
      {/* ============================================ */}
      {step === "select" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search retailers..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(([key, template]) => (
              <Card
                key={key}
                className="cursor-pointer hover:border-primary hover:shadow-md transition-all"
                onClick={() => handleSelectTemplate(key)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">{template.name}</h3>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">{template.connectionType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{template.notes}</p>
                  <div className="flex flex-wrap gap-1">
                    {template.docSets.map(doc => (
                      <Badge key={doc} variant="secondary" className="text-xs">{doc}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Custom option */}
            <Card
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all border-dashed"
              onClick={handleSelectCustom}
            >
              <CardContent className="pt-6 flex flex-col items-center justify-center text-center h-full">
                <ShoppingCart className="h-8 w-8 text-muted-foreground mb-2" />
                <h3 className="font-semibold">Custom Retailer</h3>
                <p className="text-xs text-muted-foreground mt-1">Set up any retailer with manual EDI configuration</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 2: CREDENTIALS */}
      {/* ============================================ */}
      {step === "credentials" && (
        <Card>
          <CardHeader>
            <CardTitle>{formData.name || "New Retailer"} — Connection Details</CardTitle>
            <CardDescription>
              {selectedTemplate
                ? "Pre-filled from template. Update with your actual credentials."
                : "Enter the retailer's EDI identifiers and connection details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Partner Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Connection Type</Label>
                <Select value={formData.connectionType} onValueChange={(v) => setFormData({ ...formData, connectionType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sftp">SFTP</SelectItem>
                    <SelectItem value="as2">AS2</SelectItem>
                    <SelectItem value="van">VAN</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* EDI IDs */}
            <div>
              <h3 className="text-sm font-semibold mb-3">EDI Identifiers</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>ISA ID <span className="text-xs text-muted-foreground">(their interchange ID)</span></Label>
                  <Input value={formData.isaId} onChange={(e) => setFormData({ ...formData, isaId: e.target.value })} placeholder="e.g. WALMART" maxLength={15} required />
                </div>
                <div className="space-y-2">
                  <Label>ISA Qualifier</Label>
                  <Input value={formData.isaQualifier} onChange={(e) => setFormData({ ...formData, isaQualifier: e.target.value })} placeholder="ZZ" maxLength={2} />
                </div>
                <div className="space-y-2">
                  <Label>GS Application Code</Label>
                  <Input value={formData.gsId} onChange={(e) => setFormData({ ...formData, gsId: e.target.value })} placeholder="e.g. WMTGROCERY" maxLength={15} required />
                </div>
              </div>
            </div>

            {/* Connection Details */}
            {(formData.connectionType === "sftp" || formData.connectionType === "van") && (
              <div>
                <h3 className="text-sm font-semibold mb-3">SFTP Connection</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Host</Label>
                    <Input value={formData.connectionHost} onChange={(e) => setFormData({ ...formData, connectionHost: e.target.value })} placeholder="sftp.partner.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input value={formData.connectionPort} onChange={(e) => setFormData({ ...formData, connectionPort: e.target.value })} placeholder="22" />
                  </div>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input value={formData.connectionUsername} onChange={(e) => setFormData({ ...formData, connectionUsername: e.target.value })} placeholder="your_sftp_username" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" value={formData.connectionPassword} onChange={(e) => setFormData({ ...formData, connectionPassword: e.target.value })} placeholder="your_sftp_password" />
                  </div>
                </div>
              </div>
            )}

            {formData.connectionType === "as2" && (
              <div>
                <h3 className="text-sm font-semibold mb-3">AS2 Connection</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>AS2 ID</Label>
                    <Input value={formData.as2Id} onChange={(e) => setFormData({ ...formData, as2Id: e.target.value })} placeholder="Their AS2 identifier" />
                  </div>
                  <div className="space-y-2">
                    <Label>AS2 URL</Label>
                    <Input value={formData.as2Url} onChange={(e) => setFormData({ ...formData, as2Url: e.target.value })} placeholder="https://as2.partner.com/receive" />
                  </div>
                </div>
              </div>
            )}

            {/* Contact */}
            <div>
              <h3 className="text-sm font-semibold mb-3">EDI Contact (optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input value={formData.ediContactName} onChange={(e) => setFormData({ ...formData, ediContactName: e.target.value })} placeholder="Their EDI team contact" />
                </div>
                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <Input type="email" value={formData.ediContactEmail} onChange={(e) => setFormData({ ...formData, ediContactEmail: e.target.value })} placeholder="edi@partner.com" />
                </div>
              </div>
            </div>

            {/* Notes */}
            {formData.notes && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                {formData.notes}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleCreatePartner} disabled={createPartner.isPending || !formData.name || !formData.isaId || !formData.gsId}>
                {createPartner.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Create Partner & Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* STEP 3: PRODUCT CROSSWALKS */}
      {/* ============================================ */}
      {step === "crosswalks" && (
        <Card>
          <CardHeader>
            <CardTitle>Map Your Products</CardTitle>
            <CardDescription>
              Upload a CSV to map the retailer's item numbers to your products, or skip and do it later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* CSV Upload */}
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Upload Product Mapping CSV</p>
              <p className="text-sm text-muted-foreground mt-1">
                Columns: buyer_part, vendor_part (your SKU), upc, product_id, description
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Column names are flexible — we'll match "buyer", "sku", "upc", "gtin", "barcode", etc.
              </p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
            </div>

            {/* Preview */}
            {crosswalkRows.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Preview ({crosswalkRows.length} products)</h3>
                <div className="max-h-64 overflow-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Buyer Part #</th>
                        <th className="text-left p-2 font-medium">Your SKU</th>
                        <th className="text-left p-2 font-medium">UPC</th>
                        <th className="text-left p-2 font-medium">Product ID</th>
                        <th className="text-left p-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {crosswalkRows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-muted/50">
                          <td className="p-2 font-mono">{row.buyerPartNumber || "-"}</td>
                          <td className="p-2 font-mono">{row.vendorPartNumber || "-"}</td>
                          <td className="p-2 font-mono">{row.upc || "-"}</td>
                          <td className="p-2">{row.productId || "-"}</td>
                          <td className="p-2 text-muted-foreground">{row.description || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {crosswalkRows.length > 50 && (
                  <p className="text-xs text-muted-foreground mt-1">Showing first 50 of {crosswalkRows.length} rows</p>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("test")}>
                Skip for now
              </Button>
              <Button onClick={handleSaveCrosswalks} disabled={createCrosswalk.isPending}>
                {createCrosswalk.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                {crosswalkRows.length > 0 ? `Save ${crosswalkRows.length} Mappings & Continue` : "Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* STEP 4: TEST CONNECTION */}
      {/* ============================================ */}
      {step === "test" && createdPartnerId && (
        <Card>
          <CardHeader>
            <CardTitle>Test Your Connection</CardTitle>
            <CardDescription>
              Verify everything works before going live. The partner starts in test mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => testConnection.mutate({ partnerId: createdPartnerId })}
                disabled={testConnection.isPending}
              >
                {testConnection.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                Test Connection
              </Button>
            </div>

            {testConnection.data && (
              <div className={`p-4 rounded-md ${testConnection.data.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className="flex items-center gap-2">
                  {testConnection.data.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`font-medium ${testConnection.data.success ? "text-green-700" : "text-red-700"}`}>
                    {testConnection.data.message}
                  </span>
                </div>
                {testConnection.data.latencyMs !== undefined && (
                  <p className="text-sm text-muted-foreground mt-1">Latency: {testConnection.data.latencyMs}ms</p>
                )}
              </div>
            )}

            <div className="border-t pt-4 flex justify-between">
              <Button variant="outline" onClick={() => {
                setStep("done");
              }}>
                Keep in Test Mode
              </Button>
              <Button onClick={handleActivate} disabled={updatePartner.isPending} className="bg-green-600 hover:bg-green-700">
                {updatePartner.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Activate & Go Live
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* STEP 5: DONE */}
      {/* ============================================ */}
      {step === "done" && (
        <Card>
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
            <h2 className="text-2xl font-bold">Retailer Connected!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {formData.name} is set up and ready. Inbound 850 Purchase Orders will be auto-processed and acknowledged with a 997.
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={() => navigate("/edi/partners")}>
                <Building2 className="h-4 w-4 mr-2" />
                View Partners
              </Button>
              <Button onClick={() => {
                setStep("select");
                setSelectedTemplate(null);
                setCreatedPartnerId(null);
                setCrosswalkRows([]);
                setFormData({ name: "", isaId: "", isaQualifier: "ZZ", gsId: "", connectionType: "sftp", connectionHost: "", connectionPort: "", connectionUsername: "", connectionPassword: "", as2Id: "", as2Url: "", ediContactName: "", ediContactEmail: "", notes: "" });
              }}>
                Connect Another Retailer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
