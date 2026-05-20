import { useState } from "react";
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
              sp.status === "active" ? "bg-green-50 text-green-700 border-green-200" :
              sp.status === "testing" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
              sp.status === "onboarding" ? "bg-blue-50 text-blue-700 border-blue-200" :
              "bg-gray-50 text-gray-700 border-gray-200"
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
                    <div className={`mt-3 p-3 rounded-md text-sm ${testConnection.data.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                      <div className="flex items-center gap-2">
                        {testConnection.data.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className={testConnection.data.success ? "text-green-700" : "text-red-700"}>
                          {testConnection.data.message}
                        </span>
                      </div>
                      {testConnection.data.latencyMs !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1">Latency: {testConnection.data.latencyMs}ms</p>
                      )}
                    </div>
                  )}
                  {pollPartner.data && (
                    <div className="mt-3 p-3 rounded-md text-sm bg-blue-50 border border-blue-200">
                      <p className="text-blue-700">
                        Files found: {pollPartner.data.filesFound} | Processed: {pollPartner.data.filesProcessed}
                      </p>
                      {pollPartner.data.errors.length > 0 && (
                        <ul className="text-red-600 text-xs mt-1 list-disc list-inside">
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
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setCrosswalkToDelete(cw)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

          <TabsContent value="compliance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Compliance Scorecards
                </CardTitle>
                <CardDescription>Track EDI compliance metrics and chargebacks</CardDescription>
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
                          partner.status === "active" ? "bg-green-50 text-green-700 border-green-200" :
                          partner.status === "testing" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                          partner.status === "onboarding" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          "bg-gray-50 text-gray-700 border-gray-200"
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
    </div>
  );
}
