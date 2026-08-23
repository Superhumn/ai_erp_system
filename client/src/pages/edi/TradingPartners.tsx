import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Building2,
  Plus,
  Loader2,
  ArrowLeft,
  Globe,
  Shield,
  Settings,
  MapPin,
  Package,
  BarChart3,
  Plug,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Trash2,
  Pencil,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function TradingPartners() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [partnerToDelete, setPartnerToDelete] = useState<any | null>(null);
  const [showAddCrosswalk, setShowAddCrosswalk] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [crosswalkToDelete, setCrosswalkToDelete] = useState<any | null>(null);
  const [editingCrosswalk, setEditingCrosswalk] = useState<any | null>(null);
  const [editCrosswalkForm, setEditCrosswalkForm] = useState({
    buyerPartNumber: "",
    vendorPartNumber: "",
    upc: "",
    unitOfMeasure: "EA",
    packSize: "",
  });
  const [showAddCompliance, setShowAddCompliance] = useState(false);
  const [showAddDocMap, setShowAddDocMap] = useState(false);
  const [editingDocMap, setEditingDocMap] = useState<any | null>(null);
  const [editingLocation, setEditingLocation] = useState<any | null>(null);
  const [editLocationForm, setEditLocationForm] = useState({
    locationCode: "",
    locationType: "store" as "store" | "distribution_center" | "warehouse" | "cross_dock",
    name: "",
    city: "",
    state: "",
    gln: "",
  });

  const utils = trpc.useUtils();
  const { data: products } = trpc.products.list.useQuery();

  const { data: partners, isLoading, refetch } = trpc.edi.partners.list.useQuery({
    status: filterStatus || undefined,
    partnerType: filterType || undefined,
  });

  const { data: selectedPartner } = trpc.edi.partners.get.useQuery(
    { id: selectedPartnerId! },
    { enabled: !!selectedPartnerId }
  );

  const { data: partnerCrosswalks } = trpc.edi.crosswalks.list.useQuery(
    { tradingPartnerId: selectedPartnerId! },
    { enabled: !!selectedPartnerId }
  );

  const { data: partnerLocations } = trpc.edi.shipToLocations.list.useQuery(
    { tradingPartnerId: selectedPartnerId! },
    { enabled: !!selectedPartnerId }
  );

  const { data: partnerScorecards } = trpc.edi.compliance.list.useQuery(
    { tradingPartnerId: selectedPartnerId! },
    { enabled: !!selectedPartnerId }
  );
  const { data: partnerDocMaps } = trpc.edi.documentMaps.list.useQuery(
    { tradingPartnerId: selectedPartnerId! },
    { enabled: !!selectedPartnerId }
  );

  const createCompliance = trpc.edi.compliance.create.useMutation({
    onSuccess: () => {
      toast.success("Scorecard recorded");
      setShowAddCompliance(false);
      utils.edi.compliance.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createDocMap = trpc.edi.documentMaps.create.useMutation({
    onSuccess: () => {
      toast.success("Document map created");
      setShowAddDocMap(false);
      utils.edi.documentMaps.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateDocMap = trpc.edi.documentMaps.update.useMutation({
    onSuccess: () => {
      toast.success("Document map updated");
      setEditingDocMap(null);
      utils.edi.documentMaps.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createPartner = trpc.edi.partners.create.useMutation({
    onSuccess: () => {
      toast.success("Trading partner created");
      setShowAddDialog(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updatePartner = trpc.edi.partners.update.useMutation({
    onSuccess: () => {
      toast.success("Trading partner updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deletePartner = trpc.edi.partners.delete.useMutation({
    onSuccess: () => {
      toast.success("Trading partner deleted");
      setPartnerToDelete(null);
      setSelectedPartnerId(null);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const createCrosswalk = trpc.edi.crosswalks.create.useMutation({
    onSuccess: () => {
      toast.success("Product crosswalk added");
      setShowAddCrosswalk(false);
      utils.edi.crosswalks.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateCrosswalk = trpc.edi.crosswalks.update.useMutation({
    onSuccess: () => {
      toast.success("Crosswalk updated");
      setEditingCrosswalk(null);
      utils.edi.crosswalks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLocation = trpc.edi.shipToLocations.update.useMutation({
    onSuccess: () => {
      toast.success("Ship-to location updated");
      setEditingLocation(null);
      utils.edi.shipToLocations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCrosswalk = trpc.edi.crosswalks.delete.useMutation({
    onSuccess: () => {
      toast.success("Crosswalk deleted");
      setCrosswalkToDelete(null);
      utils.edi.crosswalks.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const createLocation = trpc.edi.shipToLocations.create.useMutation({
    onSuccess: () => {
      toast.success("Ship-to location added");
      setShowAddLocation(false);
      utils.edi.shipToLocations.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleCreateCrosswalk = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPartnerId) return;
    const fd = new FormData(e.currentTarget);
    createCrosswalk.mutate({
      tradingPartnerId: selectedPartnerId,
      productId: parseInt(fd.get("productId") as string),
      buyerPartNumber: (fd.get("buyerPartNumber") as string) || undefined,
      vendorPartNumber: (fd.get("vendorPartNumber") as string) || undefined,
      upc: (fd.get("upc") as string) || undefined,
      unitOfMeasure: (fd.get("unitOfMeasure") as string) || undefined,
      packSize: fd.get("packSize") ? parseInt(fd.get("packSize") as string) : undefined,
    });
  };

  const handleCreateLocation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPartnerId) return;
    const fd = new FormData(e.currentTarget);
    createLocation.mutate({
      tradingPartnerId: selectedPartnerId,
      locationCode: fd.get("locationCode") as string,
      name: fd.get("name") as string,
      locationType: (fd.get("locationType") as any) || undefined,
      city: (fd.get("city") as string) || undefined,
      state: (fd.get("state") as string) || undefined,
      gln: (fd.get("gln") as string) || undefined,
    });
  };

  const testConnection = trpc.edi.transport.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const pollPartner = trpc.edi.transport.pollPartner.useMutation({
    onSuccess: (result) => {
      if (result.filesFound > 0) {
        toast.success(`Found ${result.filesFound} files, processed ${result.filesProcessed}`);
      } else {
        toast.success("No new inbound files found");
      }
      if (result.errors.length > 0) {
        toast.error(`Errors: ${result.errors.join(", ")}`);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreatePartner = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createPartner.mutate({
      name: formData.get("name") as string,
      partnerType: (formData.get("partnerType") as any) || "retailer",
      isaId: formData.get("isaId") as string,
      isaQualifier: (formData.get("isaQualifier") as string) || "ZZ",
      gsId: formData.get("gsId") as string,
      connectionType: (formData.get("connectionType") as any) || "sftp",
      connectionHost: (formData.get("connectionHost") as string) || undefined,
      ediContactName: (formData.get("ediContactName") as string) || undefined,
      ediContactEmail: (formData.get("ediContactEmail") as string) || undefined,
      ediContactPhone: (formData.get("ediContactPhone") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    } as any);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view for a selected partner
  const sp = selectedPartner as any;
  if (selectedPartnerId && sp) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedPartnerId(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">{sp.name}</h1>
            <p className="text-muted-foreground">
              {sp.partnerType} &middot; ISA: {sp.isaId} &middot; GS: {sp.gsId}
            </p>
          </div>
          <Badge
            className={
              sp.status === "active" ? "bg-primary/10 text-primary border-primary/20" :
              sp.status === "testing" ? "bg-muted text-muted-foreground border-border" :
              sp.status === "onboarding" ? "bg-muted text-muted-foreground border-border" :
              "bg-muted text-muted-foreground border-border"
            }
            variant="outline"
          >
            {sp.status}
          </Badge>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setPartnerToDelete(sp)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Partner
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="crosswalks">Product Crosswalks ({partnerCrosswalks?.length || 0})</TabsTrigger>
            <TabsTrigger value="locations">Ship-To Locations ({partnerLocations?.length || 0})</TabsTrigger>
            <TabsTrigger value="docMaps">Document Maps ({partnerDocMaps?.length || 0})</TabsTrigger>
            <TabsTrigger value="compliance">Compliance ({partnerScorecards?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Connection Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-medium">{sp.connectionType?.toUpperCase()}</span>
                    <span className="text-muted-foreground">Host:</span>
                    <span className="font-mono text-xs">{sp.connectionHost || "-"}</span>
                    <span className="text-muted-foreground">Port:</span>
                    <span>{sp.connectionPort || "-"}</span>
                    <span className="text-muted-foreground">AS2 ID:</span>
                    <span className="font-mono text-xs">{sp.as2Id || "-"}</span>
                    <span className="text-muted-foreground">Test Mode:</span>
                    <span>{sp.testMode ? "Yes" : "No"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    EDI Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">ISA ID:</span>
                    <span className="font-mono">{sp.isaId}</span>
                    <span className="text-muted-foreground">ISA Qualifier:</span>
                    <span className="font-mono">{sp.isaQualifier}</span>
                    <span className="text-muted-foreground">GS ID:</span>
                    <span className="font-mono">{sp.gsId}</span>
                    <span className="text-muted-foreground">Requires FA (997):</span>
                    <span>{sp.requiresFunctionalAck ? "Yes" : "No"}</span>
                    <span className="text-muted-foreground">ACK Timeout:</span>
                    <span>{sp.ackTimeoutHours || 24}h</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Contact:</span>
                    <span>{sp.ediContactName || "-"}</span>
                    <span className="text-muted-foreground">Email:</span>
                    <span>{sp.ediContactEmail || "-"}</span>
                    <span className="text-muted-foreground">Phone:</span>
                    <span>{sp.ediContactPhone || "-"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Status Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    {sp.status !== "active" && (
                      <Button size="sm" onClick={() => updatePartner.mutate({ id: sp.id, status: "active" })}>
                        Activate
                      </Button>
                    )}
                    {sp.status !== "testing" && (
                      <Button size="sm" variant="outline" onClick={() => updatePartner.mutate({ id: sp.id, status: "testing" })}>
                        Set to Testing
                      </Button>
                    )}
                    {sp.status !== "inactive" && (
                      <Button size="sm" variant="destructive" onClick={() => updatePartner.mutate({ id: sp.id, status: "inactive" })}>
                        Deactivate
                      </Button>
                    )}
                  </div>
                  {sp.testMode && (
                    <Button size="sm" variant="outline" onClick={() => updatePartner.mutate({ id: sp.id, testMode: false } as any)}>
                      Switch to Production Mode
                    </Button>
                  )}
                  {sp.notes && (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground">Notes:</p>
                      <p className="text-sm">{sp.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plug className="h-4 w-4" />
                    Transport Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testConnection.mutate({ partnerId: sp.id })}
                      disabled={testConnection.isPending}
                    >
                      {testConnection.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plug className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>
                    {(sp.connectionType === "sftp" || sp.connectionType === "van") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pollPartner.mutate({ partnerId: sp.id })}
                        disabled={pollPartner.isPending}
                      >
                        {pollPartner.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Poll for Inbound Files
                      </Button>
                    )}
                  </div>
                  {testConnection.data && (
                    <div className={`mt-3 p-3 rounded-md text-sm ${testConnection.data.success ? "bg-primary/10 border border-primary/20" : "bg-muted border border-foreground/40"}`}>
                      <div className="flex items-center gap-2">
                        {testConnection.data.success ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <XCircle className="h-4 w-4 text-foreground" />
                        )}
                        <span className={testConnection.data.success ? "text-primary" : "text-foreground"}>
                          {testConnection.data.message}
                        </span>
                      </div>
                      {testConnection.data.latencyMs !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1">Latency: {testConnection.data.latencyMs}ms</p>
                      )}
                    </div>
                  )}
                  {pollPartner.data && (
                    <div className="mt-3 p-3 rounded-md text-sm bg-primary/10 border border-primary/20">
                      <p className="text-foreground">
                        Files found: {pollPartner.data.filesFound} | Processed: {pollPartner.data.filesProcessed}
                      </p>
                      {pollPartner.data.errors.length > 0 && (
                        <ul className="text-foreground text-xs mt-1 list-disc list-inside">
                          {pollPartner.data.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="crosswalks">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Product Crosswalks
                    </CardTitle>
                    <CardDescription>Maps partner product IDs (buyer part numbers, UPCs) to your internal products</CardDescription>
                  </div>
                  <Dialog open={showAddCrosswalk} onOpenChange={setShowAddCrosswalk}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Crosswalk
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Product Crosswalk</DialogTitle>
                        <DialogDescription>
                          Map one of {sp.name}'s identifiers to an internal product
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateCrosswalk} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="productId">Internal Product</Label>
                          <Select name="productId" required>
                            <SelectTrigger>
                              <SelectValue placeholder="Select internal product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products?.map((p: any) => (
                                <SelectItem key={p.id} value={p.id.toString()}>
                                  {p.name} {p.sku ? `(${p.sku})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="buyerPartNumber">Buyer Part #</Label>
                            <Input id="buyerPartNumber" name="buyerPartNumber" placeholder="Their part number" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="vendorPartNumber">Vendor Part #</Label>
                            <Input id="vendorPartNumber" name="vendorPartNumber" placeholder="Your part number" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-2 col-span-1">
                            <Label htmlFor="upc">UPC</Label>
                            <Input id="upc" name="upc" placeholder="UPC code" />
                          </div>
                          <div className="space-y-2 col-span-1">
                            <Label htmlFor="unitOfMeasure">UOM</Label>
                            <Input id="unitOfMeasure" name="unitOfMeasure" placeholder="EA" />
                          </div>
                          <div className="space-y-2 col-span-1">
                            <Label htmlFor="packSize">Pack Size</Label>
                            <Input id="packSize" name="packSize" type="number" placeholder="12" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setShowAddCrosswalk(false)}>Cancel</Button>
                          <Button type="submit" disabled={createCrosswalk.isPending}>
                            {createCrosswalk.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Add Crosswalk
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {partnerCrosswalks && partnerCrosswalks.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Buyer Part #</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Vendor Part #</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">UPC</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Internal Product ID</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">UOM</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Pack Size</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {partnerCrosswalks.map((cw: any) => (
                        <tr key={cw.id} className="hover:bg-muted/50">
                          <td className="py-0.5 text-sm font-mono">{cw.buyerPartNumber || "-"}</td>
                          <td className="py-0.5 text-sm font-mono">{cw.vendorPartNumber || "-"}</td>
                          <td className="py-0.5 text-sm font-mono">{cw.upc || "-"}</td>
                          <td className="py-0.5 text-sm">{cw.productId}</td>
                          <td className="py-0.5 text-sm">{cw.unitOfMeasure}</td>
                          <td className="py-0.5 text-sm">{cw.packSize || "-"}</td>
                          <td className="py-0.5 text-right">
                            <div className="flex items-center justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Edit crosswalk"
                                onClick={() => {
                                  setEditingCrosswalk(cw);
                                  setEditCrosswalkForm({
                                    buyerPartNumber: cw.buyerPartNumber || "",
                                    vendorPartNumber: cw.vendorPartNumber || "",
                                    upc: cw.upc || "",
                                    unitOfMeasure: cw.unitOfMeasure || "EA",
                                    packSize: cw.packSize != null ? String(cw.packSize) : "",
                                  });
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setCrosswalkToDelete(cw)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No product crosswalks configured yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="locations">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Ship-To Locations
                    </CardTitle>
                    <CardDescription>Retailer store and distribution center addresses</CardDescription>
                  </div>
                  <Dialog open={showAddLocation} onOpenChange={setShowAddLocation}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Location
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Ship-To Location</DialogTitle>
                        <DialogDescription>
                          A store, DC, or warehouse address {sp.name} ships orders to
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateLocation} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="locationCode">Location Code</Label>
                            <Input id="locationCode" name="locationCode" placeholder="e.g. 1234" required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="locationType">Type</Label>
                            <Select name="locationType" defaultValue="store">
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="store">Store</SelectItem>
                                <SelectItem value="distribution_center">Distribution Center</SelectItem>
                                <SelectItem value="warehouse">Warehouse</SelectItem>
                                <SelectItem value="cross_dock">Cross Dock</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="name">Name</Label>
                          <Input id="name" name="name" placeholder="Location name" required />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="city">City</Label>
                            <Input id="city" name="city" placeholder="City" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="state">State</Label>
                            <Input id="state" name="state" placeholder="State" maxLength={2} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="gln">GLN</Label>
                            <Input id="gln" name="gln" placeholder="GLN" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setShowAddLocation(false)}>Cancel</Button>
                          <Button type="submit" disabled={createLocation.isPending}>
                            {createLocation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Add Location
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {partnerLocations && partnerLocations.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Code</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Name</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Type</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">City</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">State</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">GLN</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {partnerLocations.map((loc: any) => (
                        <tr key={loc.id} className="hover:bg-muted/50">
                          <td className="py-0.5 text-sm font-mono font-medium">{loc.locationCode}</td>
                          <td className="py-0.5 text-sm">{loc.name}</td>
                          <td className="py-0.5 text-sm">
                            <Badge variant="outline" className="text-xs">
                              {loc.locationType?.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="py-0.5 text-sm">{loc.city || "-"}</td>
                          <td className="py-0.5 text-sm">{loc.state || "-"}</td>
                          <td className="py-0.5 text-sm font-mono">{loc.gln || "-"}</td>
                          <td className="py-0.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Edit ship-to location"
                              onClick={() => {
                                setEditingLocation(loc);
                                setEditLocationForm({
                                  locationCode: loc.locationCode || "",
                                  locationType: (loc.locationType || "store") as any,
                                  name: loc.name || "",
                                  city: loc.city || "",
                                  state: loc.state || "",
                                  gln: loc.gln || "",
                                });
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No ship-to locations configured yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="docMaps">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Document Maps
                    </CardTitle>
                    <CardDescription>
                      Per-transaction-set mapping rules (850, 856, 810, etc.) that translate
                      between this partner's EDI envelopes and our internal records.
                    </CardDescription>
                  </div>
                  <Dialog open={showAddDocMap} onOpenChange={setShowAddDocMap}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plug className="h-3.5 w-3.5 mr-1" /> New map
                      </Button>
                    </DialogTrigger>
                    <AddDocMapDialog
                      onClose={() => setShowAddDocMap(false)}
                      onCreate={createDocMap}
                      tradingPartnerId={selectedPartnerId}
                    />
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {partnerDocMaps && partnerDocMaps.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Transaction set</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Direction</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Version</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Active</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {partnerDocMaps.map((m: any) => (
                        <tr key={m.id} className="hover:bg-muted/50">
                          <td className="py-0.5 text-sm font-mono font-medium">{m.transactionSetCode}</td>
                          <td className="py-0.5 text-sm">
                            <Badge variant="outline" className="text-xs capitalize">{m.direction}</Badge>
                          </td>
                          <td className="py-0.5 text-sm font-mono">{m.version || "-"}</td>
                          <td className="py-0.5 text-sm">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={m.isActive !== false}
                              onChange={(e) => updateDocMap.mutate({ id: m.id, isActive: e.target.checked })}
                            />
                          </td>
                          <td className="py-0.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Edit document map"
                              onClick={() => setEditingDocMap(m)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No document maps yet. Add one per EDI transaction set you exchange with this
                    partner (850 = inbound PO, 856 = outbound ASN, etc.).
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Compliance Scorecards
                    </CardTitle>
                    <CardDescription>Track EDI compliance metrics and chargebacks</CardDescription>
                  </div>
                  <Dialog open={showAddCompliance} onOpenChange={setShowAddCompliance}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <BarChart3 className="h-3.5 w-3.5 mr-1" /> New scorecard
                      </Button>
                    </DialogTrigger>
                    <AddScorecardDialog
                      onClose={() => setShowAddCompliance(false)}
                      onCreate={createCompliance}
                      tradingPartnerId={selectedPartnerId}
                    />
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {partnerScorecards && partnerScorecards.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Period</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Transactions</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">On-Time Ship %</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Fill Rate %</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">ASN Accuracy %</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Chargebacks</th>
                        <th className="pb-1 text-sm font-medium text-muted-foreground">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {partnerScorecards.map((sc: any) => (
                        <tr key={sc.id} className="hover:bg-muted/50">
                          <td className="py-0.5 text-sm">
                            {new Date(sc.periodStart).toLocaleDateString()} - {new Date(sc.periodEnd).toLocaleDateString()}
                          </td>
                          <td className="py-0.5 text-sm">{sc.totalTransactions}</td>
                          <td className="py-0.5 text-sm">{sc.onTimeShipPercentage || "-"}%</td>
                          <td className="py-0.5 text-sm">{sc.fillRatePercentage || "-"}%</td>
                          <td className="py-0.5 text-sm">{sc.asnAccuracyPercentage || "-"}%</td>
                          <td className="py-0.5 text-sm">{sc.chargebackCount || 0} (${sc.chargebackAmount || "0"})</td>
                          <td className="py-0.5 text-sm font-bold">{sc.overallScore || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No compliance scorecards yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!partnerToDelete} onOpenChange={(open) => !open && setPartnerToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete trading partner?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes <span className="font-medium">{partnerToDelete?.name}</span>{" "}
                and disables EDI exchange with them. Past transactions are preserved. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletePartner.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletePartner.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (partnerToDelete) deletePartner.mutate({ id: partnerToDelete.id });
                }}
              >
                {deletePartner.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete partner
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!crosswalkToDelete} onOpenChange={(open) => !open && setCrosswalkToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete crosswalk?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes the mapping for{" "}
                <span className="font-mono">
                  {crosswalkToDelete?.buyerPartNumber || crosswalkToDelete?.upc || `product ${crosswalkToDelete?.productId}`}
                </span>
                .
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteCrosswalk.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteCrosswalk.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (crosswalkToDelete) deleteCrosswalk.mutate({ id: crosswalkToDelete.id });
                }}
              >
                {deleteCrosswalk.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/edi">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              EDI Hub
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Trading Partners</h1>
            <p className="text-muted-foreground">Manage EDI connections with retail customers</p>
          </div>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Partner
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Trading Partner</DialogTitle>
              <DialogDescription>Set up a new EDI connection with a retail customer</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreatePartner} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Partner Name</Label>
                <Input id="name" name="name" placeholder="e.g. Walmart, Target, Kroger" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partnerType">Partner Type</Label>
                  <Select name="partnerType" defaultValue="retailer">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retailer">Retailer</SelectItem>
                      <SelectItem value="distributor">Distributor</SelectItem>
                      <SelectItem value="wholesaler">Wholesaler</SelectItem>
                      <SelectItem value="marketplace">Marketplace</SelectItem>
                      <SelectItem value="3pl">3PL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connectionType">Connection Type</Label>
                  <Select name="connectionType" defaultValue="sftp">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="as2">AS2</SelectItem>
                      <SelectItem value="sftp">SFTP</SelectItem>
                      <SelectItem value="van">VAN</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="isaId">ISA ID</Label>
                  <Input id="isaId" name="isaId" placeholder="Interchange ID" required maxLength={15} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="isaQualifier">ISA Qualifier</Label>
                  <Input id="isaQualifier" name="isaQualifier" placeholder="ZZ" defaultValue="ZZ" maxLength={2} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gsId">GS Application Code</Label>
                <Input id="gsId" name="gsId" placeholder="Application sender/receiver code" required maxLength={15} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="connectionHost">Connection Host</Label>
                <Input id="connectionHost" name="connectionHost" placeholder="sftp.partner.com" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ediContactName">EDI Contact</Label>
                  <Input id="ediContactName" name="ediContactName" placeholder="Name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ediContactEmail">Email</Label>
                  <Input id="ediContactEmail" name="ediContactEmail" placeholder="email" type="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ediContactPhone">Phone</Label>
                  <Input id="ediContactPhone" name="ediContactPhone" placeholder="Phone" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" placeholder="Any additional notes..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createPartner.isPending}>
                  {createPartner.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Partner
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="testing">Testing</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            <SelectItem value="retailer">Retailer</SelectItem>
            <SelectItem value="distributor">Distributor</SelectItem>
            <SelectItem value="wholesaler">Wholesaler</SelectItem>
            <SelectItem value="marketplace">Marketplace</SelectItem>
            <SelectItem value="3pl">3PL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Partners List */}
      <Card>
        <CardContent className="pt-6">
          {partners && partners.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-1 text-sm font-medium text-muted-foreground">Partner</th>
                  <th className="pb-1 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="pb-1 text-sm font-medium text-muted-foreground">ISA ID</th>
                  <th className="pb-1 text-sm font-medium text-muted-foreground">Connection</th>
                  <th className="pb-1 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="pb-1 text-sm font-medium text-muted-foreground">Last Transaction</th>
                  <th className="pb-1 text-sm font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {partners.map((partner: any) => (
                  <tr key={partner.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedPartnerId(partner.id)}>
                    <td className="py-0.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{partner.name}</span>
                      </div>
                    </td>
                    <td className="py-0.5 text-sm capitalize">{partner.partnerType}</td>
                    <td className="py-0.5 text-sm font-mono">{partner.isaId}</td>
                    <td className="py-0.5 text-sm uppercase">{partner.connectionType}</td>
                    <td className="py-0.5">
                      <Badge
                        variant="outline"
                        className={
                          partner.status === "active" ? "bg-primary/10 text-primary border-primary/20" :
                          partner.status === "testing" ? "bg-muted text-muted-foreground border-border" :
                          partner.status === "onboarding" ? "bg-muted text-muted-foreground border-border" :
                          "bg-muted text-muted-foreground border-border"
                        }
                      >
                        {partner.status}
                      </Badge>
                    </td>
                    <td className="py-0.5 text-sm text-muted-foreground">
                      {partner.lastTransactionAt ? new Date(partner.lastTransactionAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="py-0.5 text-right">
                      <Button variant="ghost" size="sm">View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No trading partners found</p>
              <p className="text-sm">Add your first retail EDI trading partner to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit crosswalk dialog */}
      <Dialog
        open={editingCrosswalk !== null}
        onOpenChange={(open) => { if (!open) setEditingCrosswalk(null); }}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingCrosswalk) return;
              updateCrosswalk.mutate({
                id: editingCrosswalk.id,
                buyerPartNumber: editCrosswalkForm.buyerPartNumber || undefined,
                vendorPartNumber: editCrosswalkForm.vendorPartNumber || undefined,
                upc: editCrosswalkForm.upc || undefined,
                unitOfMeasure: editCrosswalkForm.unitOfMeasure || undefined,
                packSize: editCrosswalkForm.packSize ? parseInt(editCrosswalkForm.packSize) : undefined,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit product crosswalk</DialogTitle>
              <DialogDescription>
                Updates the mapping between this partner's part numbers and your product
                identifiers.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ecwBuyer">Buyer part #</Label>
                  <Input
                    id="ecwBuyer"
                    value={editCrosswalkForm.buyerPartNumber}
                    onChange={(e) => setEditCrosswalkForm({ ...editCrosswalkForm, buyerPartNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ecwVendor">Vendor part #</Label>
                  <Input
                    id="ecwVendor"
                    value={editCrosswalkForm.vendorPartNumber}
                    onChange={(e) => setEditCrosswalkForm({ ...editCrosswalkForm, vendorPartNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="ecwUpc">UPC</Label>
                  <Input
                    id="ecwUpc"
                    value={editCrosswalkForm.upc}
                    onChange={(e) => setEditCrosswalkForm({ ...editCrosswalkForm, upc: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ecwUom">UoM</Label>
                  <Input
                    id="ecwUom"
                    value={editCrosswalkForm.unitOfMeasure}
                    onChange={(e) => setEditCrosswalkForm({ ...editCrosswalkForm, unitOfMeasure: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ecwPackSize">Pack size</Label>
                <Input
                  id="ecwPackSize"
                  type="number"
                  value={editCrosswalkForm.packSize}
                  onChange={(e) => setEditCrosswalkForm({ ...editCrosswalkForm, packSize: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingCrosswalk(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateCrosswalk.isPending}>
                {updateCrosswalk.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit ship-to location dialog */}
      <Dialog
        open={editingLocation !== null}
        onOpenChange={(open) => { if (!open) setEditingLocation(null); }}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingLocation) return;
              updateLocation.mutate({
                id: editingLocation.id,
                locationCode: editLocationForm.locationCode || undefined,
                locationType: editLocationForm.locationType,
                name: editLocationForm.name || undefined,
                city: editLocationForm.city || undefined,
                state: editLocationForm.state || undefined,
                gln: editLocationForm.gln || undefined,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit ship-to location</DialogTitle>
              <DialogDescription>
                Updates a destination this trading partner ships to.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="elocCode">Code</Label>
                  <Input
                    id="elocCode"
                    value={editLocationForm.locationCode}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, locationCode: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="elocType">Type</Label>
                  <Select
                    value={editLocationForm.locationType}
                    onValueChange={(v) => setEditLocationForm({ ...editLocationForm, locationType: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="store">Store</SelectItem>
                      <SelectItem value="distribution_center">Distribution Center</SelectItem>
                      <SelectItem value="warehouse">Warehouse</SelectItem>
                      <SelectItem value="cross_dock">Cross-Dock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="elocName">Name</Label>
                <Input
                  id="elocName"
                  value={editLocationForm.name}
                  onChange={(e) => setEditLocationForm({ ...editLocationForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="elocCity">City</Label>
                  <Input
                    id="elocCity"
                    value={editLocationForm.city}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="elocState">State</Label>
                  <Input
                    id="elocState"
                    maxLength={2}
                    value={editLocationForm.state}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="elocGln">GLN</Label>
                  <Input
                    id="elocGln"
                    value={editLocationForm.gln}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, gln: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingLocation(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateLocation.isPending}>
                {updateLocation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit document map dialog (lives outside the trigger Dialog so it can be reused) */}
      <Dialog open={editingDocMap !== null} onOpenChange={(open) => { if (!open) setEditingDocMap(null); }}>
        <EditDocMapDialogContent
          docMap={editingDocMap}
          onClose={() => setEditingDocMap(null)}
          onUpdate={updateDocMap}
        />
      </Dialog>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Compliance scorecard create dialog
// ──────────────────────────────────────────────────────────────
function AddScorecardDialog({
  onClose,
  onCreate,
  tradingPartnerId,
}: {
  onClose: () => void;
  onCreate: any;
  tradingPartnerId: number | null;
}) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [totalTransactions, setTotalTransactions] = useState("");
  const [onTimeShipPercentage, setOnTimeShipPercentage] = useState("");
  const [fillRatePercentage, setFillRatePercentage] = useState("");
  const [asnAccuracyPercentage, setAsnAccuracyPercentage] = useState("");
  const [chargebackCount, setChargebackCount] = useState("");
  const [chargebackAmount, setChargebackAmount] = useState("");
  const [overallScore, setOverallScore] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New compliance scorecard</DialogTitle>
        <DialogDescription>
          Record metrics for an EDI compliance period. Used for chargeback dispute evidence.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="scStart" className="text-xs">Period start *</Label>
            <Input id="scStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scEnd" className="text-xs">Period end *</Label>
            <Input id="scEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="scTxn" className="text-xs">Total transactions</Label>
            <Input id="scTxn" type="number" value={totalTransactions} onChange={(e) => setTotalTransactions(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scShip" className="text-xs">On-time ship %</Label>
            <Input id="scShip" type="number" step="0.01" value={onTimeShipPercentage} onChange={(e) => setOnTimeShipPercentage(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scFill" className="text-xs">Fill rate %</Label>
            <Input id="scFill" type="number" step="0.01" value={fillRatePercentage} onChange={(e) => setFillRatePercentage(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="scAsn" className="text-xs">ASN accuracy %</Label>
            <Input id="scAsn" type="number" step="0.01" value={asnAccuracyPercentage} onChange={(e) => setAsnAccuracyPercentage(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scCbCount" className="text-xs">Chargeback count</Label>
            <Input id="scCbCount" type="number" value={chargebackCount} onChange={(e) => setChargebackCount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scCbAmount" className="text-xs">Chargeback $</Label>
            <Input id="scCbAmount" type="number" step="0.01" value={chargebackAmount} onChange={(e) => setChargebackAmount(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="scOverall" className="text-xs">Overall score</Label>
          <Input id="scOverall" type="number" step="0.01" value={overallScore} onChange={(e) => setOverallScore(e.target.value)} placeholder="0-100" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="scNotes" className="text-xs">Notes</Label>
          <Textarea id="scNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!periodStart || !periodEnd || !tradingPartnerId || onCreate.isPending}
          onClick={() => {
            if (!tradingPartnerId) return;
            onCreate.mutate({
              tradingPartnerId,
              periodStart: new Date(periodStart),
              periodEnd: new Date(periodEnd),
              totalTransactions: totalTransactions ? parseInt(totalTransactions) : undefined,
              onTimeShipPercentage: onTimeShipPercentage || undefined,
              fillRatePercentage: fillRatePercentage || undefined,
              asnAccuracyPercentage: asnAccuracyPercentage || undefined,
              chargebackCount: chargebackCount ? parseInt(chargebackCount) : undefined,
              chargebackAmount: chargebackAmount || undefined,
              overallScore: overallScore || undefined,
              notes: notes || undefined,
            });
          }}
        >
          {onCreate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Create scorecard
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ──────────────────────────────────────────────────────────────
// Document map create dialog
// ──────────────────────────────────────────────────────────────
function AddDocMapDialog({
  onClose,
  onCreate,
  tradingPartnerId,
}: {
  onClose: () => void;
  onCreate: any;
  tradingPartnerId: number | null;
}) {
  const [transactionSetCode, setTransactionSetCode] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [version, setVersion] = useState("");
  const [mappingRules, setMappingRules] = useState("{}");
  const [validationRules, setValidationRules] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>New document map</DialogTitle>
        <DialogDescription>
          Defines how a specific EDI transaction set is translated to/from internal records.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="dmCode" className="text-xs">Transaction set *</Label>
            <Input id="dmCode" value={transactionSetCode} onChange={(e) => setTransactionSetCode(e.target.value)} placeholder="850" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dmDir" className="text-xs">Direction *</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dmVer" className="text-xs">Version</Label>
            <Input id="dmVer" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="004010" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dmMapping" className="text-xs">Mapping rules (JSON) *</Label>
          <textarea
            id="dmMapping"
            rows={8}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
            value={mappingRules}
            onChange={(e) => setMappingRules(e.target.value)}
            placeholder='{"segments": {...}}'
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dmValidation" className="text-xs">Validation rules (JSON, optional)</Label>
          <textarea
            id="dmValidation"
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
            value={validationRules}
            onChange={(e) => setValidationRules(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dmNotes" className="text-xs">Notes</Label>
          <Textarea id="dmNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!transactionSetCode.trim() || !mappingRules.trim() || !tradingPartnerId || onCreate.isPending}
          onClick={() => {
            if (!tradingPartnerId) return;
            onCreate.mutate({
              tradingPartnerId,
              transactionSetCode: transactionSetCode.trim(),
              direction,
              version: version || undefined,
              mappingRules,
              validationRules: validationRules || undefined,
              notes: notes || undefined,
            });
          }}
        >
          {onCreate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Create map
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ──────────────────────────────────────────────────────────────
// Document map edit dialog
// ──────────────────────────────────────────────────────────────
function EditDocMapDialogContent({
  docMap,
  onClose,
  onUpdate,
}: {
  docMap: any | null;
  onClose: () => void;
  onUpdate: any;
}) {
  const [mappingRules, setMappingRules] = useState("");
  const [validationRules, setValidationRules] = useState("");
  const [notes, setNotes] = useState("");

  // Re-sync local state whenever the dialog opens for a different map.
  // Using a state-derived effect keeps the form in sync without lifting state up.
  const lastIdRef = useRef<number | null>(null);
  if (docMap && lastIdRef.current !== docMap.id) {
    lastIdRef.current = docMap.id;
    setMappingRules(docMap.mappingRules || "");
    setValidationRules(docMap.validationRules || "");
    setNotes(docMap.notes || "");
  }

  if (!docMap) return null;

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Edit document map</DialogTitle>
        <DialogDescription>
          {docMap.transactionSetCode} · {docMap.direction} · {docMap.version || "no version"}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="edmMapping" className="text-xs">Mapping rules (JSON)</Label>
          <textarea
            id="edmMapping"
            rows={8}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
            value={mappingRules}
            onChange={(e) => setMappingRules(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edmValidation" className="text-xs">Validation rules (JSON)</Label>
          <textarea
            id="edmValidation"
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
            value={validationRules}
            onChange={(e) => setValidationRules(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edmNotes" className="text-xs">Notes</Label>
          <Textarea id="edmNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={onUpdate.isPending}
          onClick={() => {
            onUpdate.mutate({
              id: docMap.id,
              mappingRules,
              validationRules: validationRules || undefined,
              notes: notes || undefined,
            });
          }}
        >
          {onUpdate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
