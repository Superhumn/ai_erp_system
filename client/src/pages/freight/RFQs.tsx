import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Loader2,
  FileText,
  Send,
  Eye,
  Calendar,
  MapPin,
  Package,
} from "lucide-react";
import { Link } from "wouter";

const statusColors: Record<string, string> = {
  draft: "secondary",
  sent: "outline",
  awaiting_quotes: "outline",
  quotes_received: "default",
  awarded: "default",
  cancelled: "destructive",
};

export default function RFQs() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ invoice: File | null; packing: File | null }>({ invoice: null, packing: null });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    title: "",
    originCountry: "",
    originCity: "",
    originAddress: "",
    destinationCountry: "",
    destinationCity: "",
    destinationAddress: "",
    cargoDescription: "",
    cargoType: "general" as "general" | "hazardous" | "refrigerated" | "oversized" | "fragile" | "liquid" | "bulk",
    totalWeight: "",
    totalVolume: "",
    numberOfPackages: 0,
    hsCode: "",
    declaredValue: "",
    currency: "USD",
    preferredMode: "any" as "ocean_fcl" | "ocean_lcl" | "air" | "express" | "ground" | "rail" | "any",
    incoterms: "FOB",
    insuranceRequired: false,
    customsClearanceRequired: true,
    containerSize: "" as string,
    readyDate: "",
    targetDeliveryDate: "",
    dimensions: "",
    stackable: true,
    temperatureRange: "",
    pickupRequired: false,
    deliveryRequired: false,
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: rfqs, isLoading } = trpc.freight.rfqs.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const uploadDoc = trpc.documents.upload.useMutation();

  const createMutation = trpc.freight.rfqs.create.useMutation({
    onSuccess: async (result) => {
      // Upload attached documents
      const filesToUpload = [
        { file: pendingFiles.invoice, type: "invoice" as const, label: "Commercial Invoice" },
        { file: pendingFiles.packing, type: "packing_list" as const, label: "Packing List" },
      ];
      for (const { file, type, label } of filesToUpload) {
        if (!file) continue;
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await uploadDoc.mutateAsync({
            name: file.name,
            type,
            referenceType: "rfq",
            referenceId: result.id,
            fileData: base64,
            mimeType: file.type || "application/pdf",
            description: `${label} for ${result.rfqNumber}`,
          });
        } catch { /* skip failed upload */ }
      }
      const docCount = filesToUpload.filter(f => f.file).length;
      toast.success(`RFQ ${result.rfqNumber} created${docCount > 0 ? ` with ${docCount} document(s)` : ""}`);
      utils.freight.rfqs.list.invalidate();
      setIsOpen(false);
      setPendingFiles({ invoice: null, packing: null });
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create RFQ");
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      originCountry: "",
      originCity: "",
      originAddress: "",
      destinationCountry: "",
      destinationCity: "",
      destinationAddress: "",
      cargoDescription: "",
      cargoType: "general",
      totalWeight: "",
      totalVolume: "",
      numberOfPackages: 0,
      hsCode: "",
      declaredValue: "",
      currency: "USD",
      preferredMode: "any",
      incoterms: "FOB",
      insuranceRequired: false,
      customsClearanceRequired: true,
      containerSize: "",
      readyDate: "",
      targetDeliveryDate: "",
      dimensions: "",
      stackable: true,
      temperatureRange: "",
      pickupRequired: false,
      deliveryRequired: false,
      notes: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      numberOfPackages: formData.numberOfPackages || undefined,
    });
  };

  const filteredRfqs = rfqs?.filter((rfq) =>
    rfq.rfqNumber.toLowerCase().includes(search.toLowerCase()) ||
    rfq.title.toLowerCase().includes(search.toLowerCase()) ||
    rfq.originCity?.toLowerCase().includes(search.toLowerCase()) ||
    rfq.destinationCity?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Quote Requests (RFQs)</h1>
          <p className="text-muted-foreground">Request and manage freight quotes from carriers</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New RFQ
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Quote Request</DialogTitle>
              <DialogDescription>
                Create a new freight quote request to send to carriers
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6 py-4">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Shipment Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        placeholder="e.g., Electronics shipment from Shenzhen to LA"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Origin */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Origin
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="originCountry">Country</Label>
                      <Input
                        id="originCountry"
                        value={formData.originCountry}
                        onChange={(e) => setFormData({ ...formData, originCountry: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="originCity">City</Label>
                      <Input
                        id="originCity"
                        value={formData.originCity}
                        onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="originAddress">Address</Label>
                      <Input
                        id="originAddress"
                        value={formData.originAddress}
                        onChange={(e) => setFormData({ ...formData, originAddress: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Destination */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Destination
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="destinationCountry">Country</Label>
                      <Input
                        id="destinationCountry"
                        value={formData.destinationCountry}
                        onChange={(e) => setFormData({ ...formData, destinationCountry: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destinationCity">City</Label>
                      <Input
                        id="destinationCity"
                        value={formData.destinationCity}
                        onChange={(e) => setFormData({ ...formData, destinationCity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destinationAddress">Address</Label>
                      <Input
                        id="destinationAddress"
                        value={formData.destinationAddress}
                        onChange={(e) => setFormData({ ...formData, destinationAddress: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Cargo */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Cargo Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="cargoDescription">Description</Label>
                      <Textarea
                        id="cargoDescription"
                        placeholder="Describe the cargo..."
                        value={formData.cargoDescription}
                        onChange={(e) => setFormData({ ...formData, cargoDescription: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cargoType">Cargo Type</Label>
                      <Select
                        value={formData.cargoType}
                        onValueChange={(value: any) => setFormData({ ...formData, cargoType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General Cargo</SelectItem>
                          <SelectItem value="hazardous">Hazardous</SelectItem>
                          <SelectItem value="refrigerated">Refrigerated</SelectItem>
                          <SelectItem value="oversized">Oversized</SelectItem>
                          <SelectItem value="fragile">Fragile</SelectItem>
                          <SelectItem value="liquid">Liquid</SelectItem>
                          <SelectItem value="bulk">Bulk</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hsCode">HS Code</Label>
                      <Input
                        id="hsCode"
                        placeholder="e.g., 8471.30"
                        value={formData.hsCode}
                        onChange={(e) => setFormData({ ...formData, hsCode: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="totalWeight">Total Weight (kg)</Label>
                      <Input
                        id="totalWeight"
                        type="number"
                        value={formData.totalWeight}
                        onChange={(e) => setFormData({ ...formData, totalWeight: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="totalVolume">Total Volume (CBM)</Label>
                      <Input
                        id="totalVolume"
                        type="number"
                        value={formData.totalVolume}
                        onChange={(e) => setFormData({ ...formData, totalVolume: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="numberOfPackages">Number of Packages</Label>
                      <Input
                        id="numberOfPackages"
                        type="number"
                        value={formData.numberOfPackages || ""}
                        onChange={(e) => setFormData({ ...formData, numberOfPackages: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="declaredValue">Declared Value</Label>
                      <div className="flex gap-2">
                        <Input
                          id="declaredValue"
                          type="number"
                          value={formData.declaredValue}
                          onChange={(e) => setFormData({ ...formData, declaredValue: e.target.value })}
                        />
                        <Select
                          value={formData.currency}
                          onValueChange={(value) => setFormData({ ...formData, currency: value })}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="CNY">CNY</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Preferences */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Shipping Preferences</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="preferredMode">Preferred Mode</Label>
                      <Select
                        value={formData.preferredMode}
                        onValueChange={(value: any) => setFormData({ ...formData, preferredMode: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="ocean_fcl">Ocean FCL</SelectItem>
                          <SelectItem value="ocean_lcl">Ocean LCL</SelectItem>
                          <SelectItem value="air">Air Freight</SelectItem>
                          <SelectItem value="express">Express/Courier</SelectItem>
                          <SelectItem value="ground">Ground</SelectItem>
                          <SelectItem value="rail">Rail</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="incoterms">Incoterms</Label>
                      <Select
                        value={formData.incoterms}
                        onValueChange={(value) => setFormData({ ...formData, incoterms: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EXW">EXW</SelectItem>
                          <SelectItem value="FOB">FOB</SelectItem>
                          <SelectItem value="CIF">CIF</SelectItem>
                          <SelectItem value="DDP">DDP</SelectItem>
                          <SelectItem value="DAP">DAP</SelectItem>
                          <SelectItem value="FCA">FCA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="insuranceRequired"
                        checked={formData.insuranceRequired}
                        onCheckedChange={(checked) => setFormData({ ...formData, insuranceRequired: checked })}
                      />
                      <Label htmlFor="insuranceRequired">Insurance Required</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="customsClearanceRequired"
                        checked={formData.customsClearanceRequired}
                        onCheckedChange={(checked) => setFormData({ ...formData, customsClearanceRequired: checked })}
                      />
                      <Label htmlFor="customsClearanceRequired">Customs Clearance Required</Label>
                    </div>
                  </div>
                </div>

                {/* Dates & Logistics */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Schedule & Logistics</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cargo Ready Date *</Label>
                      <Input type="date" value={formData.readyDate} onChange={(e) => setFormData({ ...formData, readyDate: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Delivery Date</Label>
                      <Input type="date" value={formData.targetDeliveryDate} onChange={(e) => setFormData({ ...formData, targetDeliveryDate: e.target.value })} />
                    </div>
                    {(formData.preferredMode === "ocean_fcl" || formData.preferredMode === "any") && (
                      <div className="space-y-2">
                        <Label>Container Size</Label>
                        <Select value={formData.containerSize} onValueChange={(v) => setFormData({ ...formData, containerSize: v })}>
                          <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="20GP">20' Standard</SelectItem>
                            <SelectItem value="40GP">40' Standard</SelectItem>
                            <SelectItem value="40HC">40' High Cube</SelectItem>
                            <SelectItem value="20RF">20' Reefer</SelectItem>
                            <SelectItem value="40RF">40' Reefer</SelectItem>
                            <SelectItem value="45HC">45' High Cube</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Package Dimensions (L×W×H cm)</Label>
                      <Input placeholder="e.g., 120×100×150" value={formData.dimensions} onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })} />
                    </div>
                    {formData.cargoType === "refrigerated" && (
                      <div className="space-y-2">
                        <Label>Temperature Range (°C)</Label>
                        <Input placeholder="e.g., -18 to -22" value={formData.temperatureRange} onChange={(e) => setFormData({ ...formData, temperatureRange: e.target.value })} />
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <Switch id="stackable" checked={formData.stackable} onCheckedChange={(c) => setFormData({ ...formData, stackable: c })} />
                      <Label htmlFor="stackable">Stackable</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch id="pickupRequired" checked={formData.pickupRequired} onCheckedChange={(c) => setFormData({ ...formData, pickupRequired: c })} />
                      <Label htmlFor="pickupRequired">Pickup from Origin</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch id="deliveryRequired" checked={formData.deliveryRequired} onCheckedChange={(c) => setFormData({ ...formData, deliveryRequired: c })} />
                      <Label htmlFor="deliveryRequired">Delivery to Door</Label>
                    </div>
                  </div>
                </div>

                {/* Documents */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Documents</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Commercial Invoice</Label>
                      <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx" onChange={(e) => setPendingFiles({ ...pendingFiles, invoice: e.target.files?.[0] || null })} />
                      {pendingFiles.invoice && <p className="text-xs text-green-600">✓ {pendingFiles.invoice.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Packing List</Label>
                      <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx" onChange={(e) => setPendingFiles({ ...pendingFiles, packing: e.target.files?.[0] || null })} />
                      {pendingFiles.packing && <p className="text-xs text-green-600">✓ {pendingFiles.packing.name}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Carriers require a commercial invoice and packing list with every quote request</p>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any special requirements or instructions..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create RFQ
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
                placeholder="Search RFQs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="awaiting_quotes">Awaiting Quotes</SelectItem>
                <SelectItem value="quotes_received">Quotes Received</SelectItem>
                <SelectItem value="awarded">Awarded</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* RFQs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Quote Requests ({filteredRfqs?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRfqs && filteredRfqs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RFQ #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRfqs.map((rfq) => (
                  <TableRow key={rfq.id}>
                    <TableCell className="font-medium">{rfq.rfqNumber}</TableCell>
                    <TableCell>
                      <div>
                        <p>{rfq.title}</p>
                        {rfq.cargoDescription && (
                          <p className="text-sm text-muted-foreground truncate max-w-xs">
                            {rfq.cargoDescription}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <span>{rfq.originCity || rfq.originCountry || "TBD"}</span>
                        <span>→</span>
                        <span>{rfq.destinationCity || rfq.destinationCountry || "TBD"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {rfq.preferredMode?.replace(/_/g, " ") || "Any"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[rfq.status] as any}>
                        {rfq.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(rfq.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/freight/rfqs/${rfq.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {rfq.status === "draft" && (
                          <Link href={`/freight/rfqs/${rfq.id}/send`}>
                            <Button variant="ghost" size="icon">
                              <Send className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No quote requests found</p>
              <Button variant="link" onClick={() => setIsOpen(true)}>
                Create your first RFQ
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
