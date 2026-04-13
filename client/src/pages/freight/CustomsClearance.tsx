import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Loader2,
  FileText,
  Eye,
  Upload,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { Link } from "wouter";

const statusColors: Record<string, string> = {
  pending_documents: "secondary",
  documents_submitted: "outline",
  under_review: "outline",
  additional_info_required: "destructive",
  cleared: "default",
  held: "destructive",
  rejected: "destructive",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending_documents: <Clock className="h-4 w-4" />,
  documents_submitted: <FileText className="h-4 w-4" />,
  under_review: <Clock className="h-4 w-4" />,
  additional_info_required: <AlertCircle className="h-4 w-4" />,
  cleared: <CheckCircle className="h-4 w-4" />,
  held: <AlertCircle className="h-4 w-4" />,
  rejected: <AlertCircle className="h-4 w-4" />,
};

export default function CustomsClearance() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // AI document parser
  const parseMutation = trpc.documentImport.parse.useMutation({
    onSuccess: (result: any) => {
      setScanning(false);
      if (result.customsDocument) {
        const cd = result.customsDocument;
        setFormData((prev) => ({
          ...prev,
          hsCode: cd.lineItems?.[0]?.hsCode || prev.hsCode,
          countryOfOrigin: cd.countryOfOrigin || prev.countryOfOrigin,
          portOfEntry: cd.portOfEntry || prev.portOfEntry,
          sellerName: cd.shipperName || prev.sellerName,
          sellerAddress: cd.shipperCountry || prev.sellerAddress,
          manufacturerName: cd.shipperName || prev.manufacturerName,
          manufacturerAddress: cd.shipperCountry || prev.manufacturerAddress,
          consigneeName: cd.consigneeName || prev.consigneeName,
          estimatedValue: cd.totalDeclaredValue ? String(cd.totalDeclaredValue) : prev.estimatedValue,
          estimatedDutyRate: cd.lineItems?.[0]?.dutyRate ? String(cd.lineItems[0].dutyRate * 100) : prev.estimatedDutyRate,
          htsNumber: cd.lineItems?.[0]?.hsCode || prev.htsNumber,
          notes: cd.notes ? (prev.notes ? prev.notes + "\n" + cd.notes : cd.notes) : prev.notes,
        }));
        toast.success(`Parsed ${result.documentType}: ${Object.keys(cd).filter((k: string) => cd[k]).length} fields extracted`);
      } else if (result.freightInvoice) {
        const fi = result.freightInvoice;
        setFormData((prev) => ({
          ...prev,
          portOfEntry: fi.destination || prev.portOfEntry,
          sellerName: fi.carrierName || prev.sellerName,
        }));
        toast.success("Parsed freight invoice — extracted carrier and destination");
      } else {
        toast.info("Document parsed but no customs data found. Try a B/L, commercial invoice, or packing list.");
      }
    },
    onError: (err) => {
      setScanning(false);
      toast.error("Parse failed: " + err.message);
    },
  });

  const handleScanDocument = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      parseMutation.mutate({ fileData: base64, fileName: file.name, mimeType: file.type });
    };
    reader.onerror = () => { toast.error("Failed to read file"); setScanning(false); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const [formData, setFormData] = useState({
    type: "import" as "import" | "export",
    customsOffice: "",
    portOfEntry: "",
    country: "United States",
    brokerReference: "",
    hsCode: "",
    countryOfOrigin: "",
    notes: "",
    // ISF self-filing fields
    importerOfRecord: "",
    importerEIN: "",
    consigneeName: "",
    consigneeAddress: "",
    sellerName: "",
    sellerAddress: "",
    manufacturerName: "",
    manufacturerAddress: "",
    buyerName: "",
    buyerAddress: "",
    shipToAddress: "",
    containerStuffingLocation: "",
    consolidatorName: "",
    htsNumber: "",
    estimatedDutyRate: "",
    estimatedValue: "",
    bondType: "single_entry" as string,
    bondNumber: "",
  });

  const utils = trpc.useUtils();
  const { data: clearances, isLoading } = trpc.customs.clearances.list.useQuery(
    {
      status: statusFilter !== "all" ? statusFilter : undefined,
      type: typeFilter !== "all" ? (typeFilter as "import" | "export") : undefined,
    }
  );

  const createMutation = trpc.customs.clearances.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Clearance ${result.clearanceNumber} created`);
      utils.customs.clearances.list.invalidate();
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create clearance");
    },
  });

  const resetForm = () => {
    setFormData({
      type: "import", customsOffice: "", portOfEntry: "", country: "United States",
      brokerReference: "", hsCode: "", countryOfOrigin: "", notes: "",
      importerOfRecord: "", importerEIN: "", consigneeName: "", consigneeAddress: "",
      sellerName: "", sellerAddress: "", manufacturerName: "", manufacturerAddress: "",
      buyerName: "", buyerAddress: "", shipToAddress: "", containerStuffingLocation: "",
      consolidatorName: "", htsNumber: "", estimatedDutyRate: "", estimatedValue: "",
      bondType: "single_entry", bondNumber: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Store ISF fields as structured JSON in notes
    const isfData = {
      importerOfRecord: formData.importerOfRecord,
      importerEIN: formData.importerEIN,
      consignee: { name: formData.consigneeName, address: formData.consigneeAddress },
      seller: { name: formData.sellerName, address: formData.sellerAddress },
      manufacturer: { name: formData.manufacturerName, address: formData.manufacturerAddress },
      buyer: { name: formData.buyerName, address: formData.buyerAddress },
      shipTo: formData.shipToAddress,
      containerStuffingLocation: formData.containerStuffingLocation,
      consolidator: formData.consolidatorName,
      htsNumber: formData.htsNumber,
      estimatedDutyRate: formData.estimatedDutyRate,
      estimatedValue: formData.estimatedValue,
      bondType: formData.bondType,
      bondNumber: formData.bondNumber,
      selfFiled: true,
      filedAt: new Date().toISOString(),
    };
    const notes = formData.notes
      ? formData.notes + "\n\n---ISF_DATA---\n" + JSON.stringify(isfData)
      : "---ISF_DATA---\n" + JSON.stringify(isfData);
    createMutation.mutate({ ...formData, notes });
  };

  const filteredClearances = clearances?.filter((clearance) =>
    clearance.clearanceNumber.toLowerCase().includes(search.toLowerCase()) ||
    clearance.portOfEntry?.toLowerCase().includes(search.toLowerCase()) ||
    clearance.country?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Customs Clearance</h1>
          <p className="text-muted-foreground">Track import and export customs clearances</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Clearance
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle>Self-File Customs Entry</DialogTitle>
                  <DialogDescription>
                    Upload a B/L, commercial invoice, or packing list to auto-fill, or enter manually.
                  </DialogDescription>
                </div>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => scanInputRef.current?.click()}
                    disabled={scanning}
                  >
                    {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    {scanning ? "Scanning..." : "Scan Document"}
                  </Button>
                  <input ref={scanInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="hidden" onChange={handleScanDocument} />
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-5 py-4">
                {/* Basic Info */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Entry Details</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Type *</Label>
                      <Select value={formData.type} onValueChange={(v: "import" | "export") => setFormData({ ...formData, type: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="import">Import</SelectItem>
                          <SelectItem value="export">Export</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Port of Entry *</Label>
                      <Input className="h-8" value={formData.portOfEntry} onChange={(e) => setFormData({ ...formData, portOfEntry: e.target.value })} placeholder="e.g., Los Angeles" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Country of Origin *</Label>
                      <Input className="h-8" value={formData.countryOfOrigin} onChange={(e) => setFormData({ ...formData, countryOfOrigin: e.target.value })} placeholder="e.g., Thailand" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">HS Code *</Label>
                      <Input className="h-8" value={formData.hsCode} onChange={(e) => setFormData({ ...formData, hsCode: e.target.value })} placeholder="e.g., 2106.10" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">HTS Number</Label>
                      <Input className="h-8" value={formData.htsNumber} onChange={(e) => setFormData({ ...formData, htsNumber: e.target.value })} placeholder="e.g., 2106.10.0000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Customs Office</Label>
                      <Input className="h-8" value={formData.customsOffice} onChange={(e) => setFormData({ ...formData, customsOffice: e.target.value })} placeholder="e.g., CBP Port 2704" />
                    </div>
                  </div>
                </div>

                {/* Importer of Record */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Importer of Record (ISF 1 & 2)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Importer Name / Company *</Label>
                      <Input className="h-8" value={formData.importerOfRecord} onChange={(e) => setFormData({ ...formData, importerOfRecord: e.target.value })} placeholder="Your company name" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Importer EIN / Tax ID *</Label>
                      <Input className="h-8" value={formData.importerEIN} onChange={(e) => setFormData({ ...formData, importerEIN: e.target.value })} placeholder="e.g., 12-3456789" />
                    </div>
                  </div>
                </div>

                {/* ISF Parties */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">ISF Parties</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Seller / Supplier Name</Label>
                      <Input className="h-8" value={formData.sellerName} onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })} placeholder="Foreign supplier" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Seller Address</Label>
                      <Input className="h-8" value={formData.sellerAddress} onChange={(e) => setFormData({ ...formData, sellerAddress: e.target.value })} placeholder="Full address" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Manufacturer Name</Label>
                      <Input className="h-8" value={formData.manufacturerName} onChange={(e) => setFormData({ ...formData, manufacturerName: e.target.value })} placeholder="Factory / manufacturer" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Manufacturer Address</Label>
                      <Input className="h-8" value={formData.manufacturerAddress} onChange={(e) => setFormData({ ...formData, manufacturerAddress: e.target.value })} placeholder="Full address" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Consignee Name</Label>
                      <Input className="h-8" value={formData.consigneeName} onChange={(e) => setFormData({ ...formData, consigneeName: e.target.value })} placeholder="Usually your company" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Consignee Address</Label>
                      <Input className="h-8" value={formData.consigneeAddress} onChange={(e) => setFormData({ ...formData, consigneeAddress: e.target.value })} placeholder="US delivery address" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ship-To Address</Label>
                      <Input className="h-8" value={formData.shipToAddress} onChange={(e) => setFormData({ ...formData, shipToAddress: e.target.value })} placeholder="Final destination" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Container Stuffing Location</Label>
                      <Input className="h-8" value={formData.containerStuffingLocation} onChange={(e) => setFormData({ ...formData, containerStuffingLocation: e.target.value })} placeholder="Where container was loaded" />
                    </div>
                  </div>
                </div>

                {/* Duties & Bond */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Duties & Bond</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Estimated Value ($)</Label>
                      <Input className="h-8" type="number" step="0.01" value={formData.estimatedValue} onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })} placeholder="0.00" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Duty Rate (%)</Label>
                      <Input className="h-8" type="number" step="0.01" value={formData.estimatedDutyRate} onChange={(e) => setFormData({ ...formData, estimatedDutyRate: e.target.value })} placeholder="0.00" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bond Type</Label>
                      <Select value={formData.bondType} onValueChange={(v) => setFormData({ ...formData, bondType: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single_entry">Single Entry</SelectItem>
                          <SelectItem value="continuous">Continuous</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bond Number</Label>
                      <Input className="h-8" value={formData.bondNumber} onChange={(e) => setFormData({ ...formData, bondNumber: e.target.value })} placeholder="If existing" />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <Label className="text-xs">Additional Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="FDA prior notice, special requirements..." />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  File Entry
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clearances..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="import">Import</SelectItem>
                <SelectItem value="export">Export</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending_documents">Pending Documents</SelectItem>
                <SelectItem value="documents_submitted">Documents Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="additional_info_required">Additional Info Required</SelectItem>
                <SelectItem value="cleared">Cleared</SelectItem>
                <SelectItem value="held">Held</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Clearances Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customs Clearances ({filteredClearances?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClearances && filteredClearances.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clearance #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Port / Country</TableHead>
                  <TableHead>HS Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duties & Taxes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClearances.map((clearance) => (
                  <TableRow key={clearance.id}>
                    <TableCell className="font-medium">{clearance.clearanceNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        {clearance.type === 'import' ? (
                          <ArrowDownToLine className="h-3 w-3" />
                        ) : (
                          <ArrowUpFromLine className="h-3 w-3" />
                        )}
                        {clearance.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{clearance.portOfEntry || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{clearance.country || ''}</p>
                      </div>
                    </TableCell>
                    <TableCell>{clearance.hsCode || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={statusColors[clearance.status] as any}
                        className="flex items-center gap-1 w-fit"
                      >
                        {statusIcons[clearance.status]}
                        {clearance.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {clearance.totalAmount ? (
                        <span className="font-medium">${clearance.totalAmount}</span>
                      ) : (
                        <span className="text-muted-foreground">TBD</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(clearance.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/freight/customs/${clearance.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No customs clearances found</p>
              <Button variant="link" onClick={() => setIsOpen(true)}>
                Create your first clearance
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
