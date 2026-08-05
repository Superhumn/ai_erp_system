import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Plus, Loader2, Download, CheckCircle, Clock,
  AlertTriangle, FileText, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link } from "wouter";

interface PriorNoticeEntry {
  id: string;
  status: "draft" | "ready" | "submitted" | "confirmed";
  submittedAt?: string;
  // Article info
  articleName: string;
  commonName: string;
  brandName: string;
  quantity: string;
  quantityUnit: string;
  countryOfProduction: string;
  // FDA product code
  fdaProductCode: string;
  fdaIndustryCode: string;
  // Parties
  manufacturerName: string;
  manufacturerAddress: string;
  manufacturerCountry: string;
  shipperName: string;
  shipperAddress: string;
  shipperCountry: string;
  // Importer / consignee
  importerName: string;
  importerFEI: string; // FDA Establishment Identifier
  importerAddress: string;
  // Carrier / arrival
  modeOfTransport: string;
  carrierName: string;
  vesselName: string;
  voyageNumber: string;
  billOfLading: string;
  containerNumber: string;
  portOfArrival: string;
  anticipatedArrival: string;
  // Customs
  entryType: string;
  customsEntryNumber: string;
  notes: string;
}

const emptyEntry: PriorNoticeEntry = {
  id: crypto.randomUUID(),
  status: "draft",
  articleName: "", commonName: "", brandName: "", quantity: "", quantityUnit: "KG",
  countryOfProduction: "", fdaProductCode: "", fdaIndustryCode: "54", // 54 = food
  manufacturerName: "", manufacturerAddress: "", manufacturerCountry: "",
  shipperName: "", shipperAddress: "", shipperCountry: "",
  importerName: "", importerFEI: "", importerAddress: "",
  modeOfTransport: "ocean", carrierName: "", vesselName: "", voyageNumber: "",
  billOfLading: "", containerNumber: "", portOfArrival: "",
  anticipatedArrival: "", entryType: "consumption", customsEntryNumber: "", notes: "",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-primary/10 text-primary",
  submitted: "bg-muted text-foreground",
  confirmed: "bg-muted text-foreground font-semibold",
};

export default function FDAPriorNotice() {
  const [entries, setEntries] = useState<PriorNoticeEntry[]>([]);
  const [editing, setEditing] = useState<PriorNoticeEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const [scanningDoc, setScanningDoc] = useState(false);

  // Pre-fill from vendors/products
  const { data: vendors } = trpc.vendors.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();

  // AI scan from supplier docs (commercial invoice, B/L, packing list)
  const parseMutation = trpc.documentImport.parse.useMutation({
    onSuccess: (result: any) => {
      setScanningDoc(false);
      if (!editing) return;
      const cd = result.customsDocument;
      const fi = result.freightInvoice;
      if (cd) {
        setEditing({
          ...editing,
          articleName: cd.lineItems?.[0]?.description || editing.articleName,
          countryOfProduction: cd.countryOfOrigin || editing.countryOfProduction,
          manufacturerName: cd.shipperName || editing.manufacturerName,
          manufacturerCountry: cd.shipperCountry || editing.manufacturerCountry,
          shipperName: cd.shipperName || editing.shipperName,
          shipperCountry: cd.shipperCountry || editing.shipperCountry,
          importerName: cd.consigneeName || editing.importerName,
          portOfArrival: cd.portOfEntry || editing.portOfArrival,
          vesselName: cd.vesselName || editing.vesselName,
          voyageNumber: cd.voyageNumber || editing.voyageNumber,
          containerNumber: cd.containerNumber || editing.containerNumber,
          billOfLading: cd.documentNumber || editing.billOfLading,
          quantity: cd.lineItems?.[0]?.quantity ? String(cd.lineItems[0].quantity) : editing.quantity,
          fdaProductCode: cd.lineItems?.[0]?.hsCode || editing.fdaProductCode,
        });
        toast.success(`Scanned: ${Object.keys(cd).filter((k: string) => cd[k]).length} fields auto-filled`);
      } else if (fi) {
        setEditing({
          ...editing,
          carrierName: fi.carrierName || editing.carrierName,
          portOfArrival: fi.destination || editing.portOfArrival,
          billOfLading: fi.trackingNumber || editing.billOfLading,
        });
        toast.success("Scanned freight document — carrier and destination extracted");
      } else {
        toast.info("No customs/freight data found in document");
      }
    },
    onError: (err) => { setScanningDoc(false); toast.error("Scan failed: " + err.message); },
  });

  const handleScanDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanningDoc(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      parseMutation.mutate({ fileData: base64, fileName: file.name, mimeType: file.type });
    };
    reader.onerror = () => { toast.error("Failed to read file"); setScanningDoc(false); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = () => {
    if (!editing) return;
    setSaving(true);
    const updated = entries.find(e => e.id === editing.id)
      ? entries.map(e => e.id === editing.id ? { ...editing, status: "ready" as const } : e)
      : [...entries, { ...editing, status: "ready" as const }];
    setEntries(updated);
    setEditing(null);
    setSaving(false);
    toast.success("Prior notice saved");
  };

  const handleSubmit = (id: string) => {
    setEntries(entries.map(e => e.id === id ? { ...e, status: "submitted" as const, submittedAt: new Date().toISOString() } : e));
    toast.success("Prior notice marked as submitted. File via FDA PNSI portal.");
  };

  const exportPN = (entry: PriorNoticeEntry) => {
    const lines = [
      "FDA PRIOR NOTICE - FOOD IMPORT",
      "=" .repeat(50),
      "",
      "ARTICLE INFORMATION",
      `Article Name: ${entry.articleName}`,
      `Common/Market Name: ${entry.commonName}`,
      `Brand Name: ${entry.brandName}`,
      `Quantity: ${entry.quantity} ${entry.quantityUnit}`,
      `Country of Production: ${entry.countryOfProduction}`,
      `FDA Product Code: ${entry.fdaProductCode}`,
      "",
      "MANUFACTURER / GROWER",
      `Name: ${entry.manufacturerName}`,
      `Address: ${entry.manufacturerAddress}`,
      `Country: ${entry.manufacturerCountry}`,
      "",
      "SHIPPER",
      `Name: ${entry.shipperName}`,
      `Address: ${entry.shipperAddress}`,
      `Country: ${entry.shipperCountry}`,
      "",
      "IMPORTER / CONSIGNEE",
      `Name: ${entry.importerName}`,
      `FDA FEI: ${entry.importerFEI}`,
      `Address: ${entry.importerAddress}`,
      "",
      "TRANSPORT",
      `Mode: ${entry.modeOfTransport}`,
      `Carrier: ${entry.carrierName}`,
      `Vessel: ${entry.vesselName}`,
      `Voyage #: ${entry.voyageNumber}`,
      `B/L #: ${entry.billOfLading}`,
      `Container #: ${entry.containerNumber}`,
      `Port of Arrival: ${entry.portOfArrival}`,
      `Anticipated Arrival: ${entry.anticipatedArrival}`,
      "",
      "CUSTOMS",
      `Entry Type: ${entry.entryType}`,
      `Entry #: ${entry.customsEntryNumber}`,
      "",
      `Notes: ${entry.notes}`,
      "",
      `Generated: ${new Date().toISOString()}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FDA_PriorNotice_${entry.articleName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Edit form
  if (editing) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold">FDA Prior Notice</h1>
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={() => scanRef.current?.click()} disabled={scanningDoc}>
              {scanningDoc ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
              {scanningDoc ? "Scanning..." : "Scan Supplier Doc"}
            </Button>
            <input ref={scanRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleScanDoc} />
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-5">
            {/* Article Info */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Article / Food Product</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Product *</Label>
                  <Select value={editing.articleName} onValueChange={(v) => {
                    const prod = products?.find((p: any) => p.name === v);
                    setEditing({ ...editing, articleName: v, commonName: prod?.category || "", brandName: (prod as any)?.brand || "" });
                  }}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products?.map((p: any) => (
                        <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                      ))}
                      <SelectItem value="__custom">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Common Name</Label>
                  <Input className="h-8" value={editing.commonName} onChange={(e) => setEditing({ ...editing, commonName: e.target.value })} placeholder="e.g., Plant-based protein" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Brand</Label>
                  <Input className="h-8" value={editing.brandName} onChange={(e) => setEditing({ ...editing, brandName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity *</Label>
                  <Input className="h-8" type="number" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Select value={editing.quantityUnit} onValueChange={(v) => setEditing({ ...editing, quantityUnit: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KG">KG</SelectItem>
                      <SelectItem value="LB">LB</SelectItem>
                      <SelectItem value="CS">Cases</SelectItem>
                      <SelectItem value="EA">Each</SelectItem>
                      <SelectItem value="MT">Metric Ton</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Country of Production *</Label>
                  <Input className="h-8" value={editing.countryOfProduction} onChange={(e) => setEditing({ ...editing, countryOfProduction: e.target.value })} placeholder="e.g., Thailand" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">FDA Product Code</Label>
                  <Input className="h-8" value={editing.fdaProductCode} onChange={(e) => setEditing({ ...editing, fdaProductCode: e.target.value })} placeholder="e.g., 21CFR101" />
                </div>
              </div>
            </div>

            {/* Manufacturer */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Manufacturer / Grower</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name *</Label>
                  <Select value={editing.manufacturerName} onValueChange={(v) => {
                    const vendor = vendors?.find((vr: any) => vr.name === v);
                    setEditing({
                      ...editing,
                      manufacturerName: v,
                      manufacturerAddress: vendor?.address || "",
                      manufacturerCountry: vendor?.country || "",
                      shipperName: vendor?.name || "",
                      shipperAddress: vendor?.address || "",
                      shipperCountry: vendor?.country || "",
                    });
                  }}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      {vendors?.map((v: any) => (
                        <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input className="h-8" value={editing.manufacturerAddress} onChange={(e) => setEditing({ ...editing, manufacturerAddress: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Country</Label>
                  <Input className="h-8" value={editing.manufacturerCountry} onChange={(e) => setEditing({ ...editing, manufacturerCountry: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Shipper */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Shipper</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input className="h-8" value={editing.shipperName} onChange={(e) => setEditing({ ...editing, shipperName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input className="h-8" value={editing.shipperAddress} onChange={(e) => setEditing({ ...editing, shipperAddress: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Country</Label>
                  <Input className="h-8" value={editing.shipperCountry} onChange={(e) => setEditing({ ...editing, shipperCountry: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Importer */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Importer / Consignee</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Company Name *</Label>
                  <Input className="h-8" value={editing.importerName} onChange={(e) => setEditing({ ...editing, importerName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">FDA FEI # *</Label>
                  <Input className="h-8" value={editing.importerFEI} onChange={(e) => setEditing({ ...editing, importerFEI: e.target.value })} placeholder="FDA Establishment ID" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address *</Label>
                  <Input className="h-8" value={editing.importerAddress} onChange={(e) => setEditing({ ...editing, importerAddress: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Transport */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Transport & Arrival</p>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Mode</Label>
                  <Select value={editing.modeOfTransport} onValueChange={(v) => setEditing({ ...editing, modeOfTransport: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ocean">Ocean</SelectItem>
                      <SelectItem value="air">Air</SelectItem>
                      <SelectItem value="truck">Truck</SelectItem>
                      <SelectItem value="rail">Rail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Carrier</Label>
                  <Input className="h-8" value={editing.carrierName} onChange={(e) => setEditing({ ...editing, carrierName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vessel Name</Label>
                  <Input className="h-8" value={editing.vesselName} onChange={(e) => setEditing({ ...editing, vesselName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Voyage #</Label>
                  <Input className="h-8" value={editing.voyageNumber} onChange={(e) => setEditing({ ...editing, voyageNumber: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">B/L Number</Label>
                  <Input className="h-8" value={editing.billOfLading} onChange={(e) => setEditing({ ...editing, billOfLading: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Container #</Label>
                  <Input className="h-8" value={editing.containerNumber} onChange={(e) => setEditing({ ...editing, containerNumber: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port of Arrival *</Label>
                  <Input className="h-8" value={editing.portOfArrival} onChange={(e) => setEditing({ ...editing, portOfArrival: e.target.value })} placeholder="e.g., Los Angeles" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Anticipated Arrival *</Label>
                  <Input className="h-8" type="date" value={editing.anticipatedArrival} onChange={(e) => setEditing({ ...editing, anticipatedArrival: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} placeholder="Special handling, allergens, etc." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Prior Notice
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-7 w-7" />
            FDA Prior Notice
          </h1>
          <p className="text-muted-foreground text-sm">Required for all food imports — file at least 15 days before arrival</p>
        </div>
        <div className="flex gap-2">
          <a href="https://www.access.fda.gov/oaa/" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-1" /> FDA PNSI Portal
            </Button>
          </a>
          <Button onClick={() => setEditing({ ...emptyEntry, id: crypto.randomUUID() })}>
            <Plus className="h-4 w-4 mr-2" /> New Prior Notice
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No prior notices</h3>
            <p className="text-muted-foreground mb-4 text-sm max-w-md text-center">
              FDA requires a Prior Notice for all food imports. Create one here, then submit via the FDA PNSI portal.
            </p>
            <Button onClick={() => setEditing({ ...emptyEntry, id: crypto.randomUUID() })}>
              <Plus className="mr-2 h-4 w-4" /> Create Prior Notice
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Arrival</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setEditing(entry)}>
                    <TableCell className="font-medium">{entry.articleName || "—"}</TableCell>
                    <TableCell>{entry.manufacturerName || "—"}</TableCell>
                    <TableCell>{entry.portOfArrival || "—"}</TableCell>
                    <TableCell>{entry.anticipatedArrival || "—"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[entry.status]}>{entry.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7" onClick={(e) => { e.stopPropagation(); exportPN(entry); }}>
                          <Download className="h-3 w-3" />
                        </Button>
                        {entry.status === "ready" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleSubmit(entry.id); }}>
                            Mark Submitted
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
