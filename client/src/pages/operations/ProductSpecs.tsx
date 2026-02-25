import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Shield, AlertTriangle, Award, FileText } from "lucide-react";
import { toast } from "sonner";

const ALLERGEN_LABELS: Record<string, string> = {
  milk: "Milk", eggs: "Eggs", fish: "Fish", shellfish: "Shellfish",
  tree_nuts: "Tree Nuts", peanuts: "Peanuts", wheat: "Wheat",
  soybeans: "Soybeans", sesame: "Sesame", other: "Other",
};

const CERT_LABELS: Record<string, string> = {
  organic_usda: "USDA Organic", organic_eu: "EU Organic", kosher: "Kosher",
  halal: "Halal", non_gmo: "Non-GMO Project", gluten_free: "Gluten Free",
  fair_trade: "Fair Trade", rainforest_alliance: "Rainforest Alliance",
  brc: "BRC", sqf: "SQF", fssc_22000: "FSSC 22000", ifs: "IFS",
  iso_22000: "ISO 22000", gmp: "GMP", haccp: "HACCP", other: "Other",
};

const PRESENCE_COLORS: Record<string, string> = {
  contains: "bg-red-500/10 text-red-500 border-red-500/20",
  may_contain: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  free_from: "bg-green-500/10 text-green-500 border-green-500/20",
  not_tested: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export default function ProductSpecs() {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [isSpecOpen, setIsSpecOpen] = useState(false);
  const [isAllergenOpen, setIsAllergenOpen] = useState(false);
  const [isCertOpen, setIsCertOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("specs");

  const { data: products } = trpc.products.list.useQuery();

  const { data: specs, refetch: refetchSpecs } = trpc.productSpecs.list.useQuery(
    { productId: selectedProductId! },
    { enabled: !!selectedProductId }
  );
  const { data: allergens, refetch: refetchAllergens } = trpc.productAllergens.list.useQuery(
    { productId: selectedProductId! },
    { enabled: !!selectedProductId }
  );
  const { data: certifications, refetch: refetchCerts } = trpc.productCertifications.list.useQuery(
    { productId: selectedProductId! },
    { enabled: !!selectedProductId }
  );

  // Spec form state
  const [specForm, setSpecForm] = useState({
    appearance: "", color: "", odor: "", taste: "", texture: "",
    form: "" as string, meshSize: "",
    moisture: "", protein: "", fat: "", fiber: "", ash: "", pH: "", waterActivity: "",
    totalPlateCount: "", yeastAndMold: "", coliform: "", eColi: "", salmonella: "", listeria: "",
    lead: "", arsenic: "", cadmium: "", mercury: "",
    shelfLifeMonths: 0, storageConditions: "", packagingDescription: "",
    countryOfOrigin: "", hsCode: "", ingredientStatement: "", allergenDeclaration: "",
  });

  // Allergen form state
  const [allergenForm, setAllergenForm] = useState({
    allergen: "milk" as string,
    customAllergenName: "",
    presenceType: "contains" as string,
    notes: "",
  });

  // Cert form state
  const [certForm, setCertForm] = useState({
    certificationType: "organic_usda" as string,
    customCertName: "",
    certifyingBody: "",
    certificateNumber: "",
    issueDate: "",
    expiryDate: "",
    notes: "",
  });

  const createSpec = trpc.productSpecs.create.useMutation({
    onSuccess: () => { toast.success("Specification created"); setIsSpecOpen(false); refetchSpecs(); },
    onError: (e) => toast.error(e.message),
  });

  const createAllergen = trpc.productAllergens.create.useMutation({
    onSuccess: () => { toast.success("Allergen added"); setIsAllergenOpen(false); refetchAllergens(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteAllergen = trpc.productAllergens.delete.useMutation({
    onSuccess: () => { toast.success("Allergen removed"); refetchAllergens(); },
    onError: (e) => toast.error(e.message),
  });

  const createCert = trpc.productCertifications.create.useMutation({
    onSuccess: () => { toast.success("Certification added"); setIsCertOpen(false); refetchCerts(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteCert = trpc.productCertifications.delete.useMutation({
    onSuccess: () => { toast.success("Certification removed"); refetchCerts(); },
    onError: (e) => toast.error(e.message),
  });

  const selectedProduct = products?.find(p => p.id === selectedProductId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Specifications</h1>
          <p className="text-muted-foreground">Manage spec sheets, allergens, and certifications for B2B ingredient sales</p>
        </div>
      </div>

      {/* Product selector */}
      <Card>
        <CardContent className="pt-6">
          <Label>Select Product</Label>
          <Select value={selectedProductId?.toString() || ""} onValueChange={(v) => setSelectedProductId(Number(v))}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose a product..." />
            </SelectTrigger>
            <SelectContent>
              {products?.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.sku} — {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedProductId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="specs"><FileText className="h-4 w-4 mr-1" /> Specifications</TabsTrigger>
            <TabsTrigger value="allergens"><AlertTriangle className="h-4 w-4 mr-1" /> Allergens</TabsTrigger>
            <TabsTrigger value="certs"><Award className="h-4 w-4 mr-1" /> Certifications</TabsTrigger>
          </TabsList>

          {/* SPECIFICATIONS TAB */}
          <TabsContent value="specs" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Spec Sheets — {selectedProduct?.name}</h2>
              <Dialog open={isSpecOpen} onOpenChange={setIsSpecOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />New Spec Version</Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Create Product Specification</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <h3 className="col-span-2 font-semibold border-b pb-2">Physical Properties</h3>
                    {["appearance", "color", "odor", "taste", "texture", "meshSize"].map(field => (
                      <div key={field}>
                        <Label className="capitalize">{field.replace(/([A-Z])/g, " $1")}</Label>
                        <Input value={(specForm as any)[field]} onChange={e => setSpecForm(p => ({ ...p, [field]: e.target.value }))} />
                      </div>
                    ))}
                    <div>
                      <Label>Form</Label>
                      <Select value={specForm.form} onValueChange={v => setSpecForm(p => ({ ...p, form: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                        <SelectContent>
                          {["powder", "liquid", "granule", "paste", "flake", "oil", "extract", "whole", "other"].map(f => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <h3 className="col-span-2 font-semibold border-b pb-2 mt-4">Chemical / Nutritional</h3>
                    {["moisture", "protein", "fat", "fiber", "ash", "pH", "waterActivity"].map(field => (
                      <div key={field}>
                        <Label className="capitalize">{field.replace(/([A-Z])/g, " $1")}</Label>
                        <Input value={(specForm as any)[field]} onChange={e => setSpecForm(p => ({ ...p, [field]: e.target.value }))} placeholder='e.g. "<5%"' />
                      </div>
                    ))}

                    <h3 className="col-span-2 font-semibold border-b pb-2 mt-4">Microbiological Limits</h3>
                    {["totalPlateCount", "yeastAndMold", "coliform", "eColi", "salmonella", "listeria"].map(field => (
                      <div key={field}>
                        <Label className="capitalize">{field.replace(/([A-Z])/g, " $1")}</Label>
                        <Input value={(specForm as any)[field]} onChange={e => setSpecForm(p => ({ ...p, [field]: e.target.value }))} placeholder='e.g. "<10,000 cfu/g"' />
                      </div>
                    ))}

                    <h3 className="col-span-2 font-semibold border-b pb-2 mt-4">Heavy Metals</h3>
                    {["lead", "arsenic", "cadmium", "mercury"].map(field => (
                      <div key={field}>
                        <Label className="capitalize">{field}</Label>
                        <Input value={(specForm as any)[field]} onChange={e => setSpecForm(p => ({ ...p, [field]: e.target.value }))} placeholder='e.g. "<0.5 ppm"' />
                      </div>
                    ))}

                    <h3 className="col-span-2 font-semibold border-b pb-2 mt-4">Storage & Regulatory</h3>
                    <div>
                      <Label>Shelf Life (months)</Label>
                      <Input type="number" value={specForm.shelfLifeMonths || ""} onChange={e => setSpecForm(p => ({ ...p, shelfLifeMonths: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <Label>Storage Conditions</Label>
                      <Input value={specForm.storageConditions} onChange={e => setSpecForm(p => ({ ...p, storageConditions: e.target.value }))} placeholder='e.g. "Cool, dry place"' />
                    </div>
                    <div>
                      <Label>Packaging</Label>
                      <Input value={specForm.packagingDescription} onChange={e => setSpecForm(p => ({ ...p, packagingDescription: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Country of Origin</Label>
                      <Input value={specForm.countryOfOrigin} onChange={e => setSpecForm(p => ({ ...p, countryOfOrigin: e.target.value }))} />
                    </div>
                    <div>
                      <Label>HS Code</Label>
                      <Input value={specForm.hsCode} onChange={e => setSpecForm(p => ({ ...p, hsCode: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label>Ingredient Statement</Label>
                      <Textarea value={specForm.ingredientStatement} onChange={e => setSpecForm(p => ({ ...p, ingredientStatement: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label>Allergen Declaration</Label>
                      <Textarea value={specForm.allergenDeclaration} onChange={e => setSpecForm(p => ({ ...p, allergenDeclaration: e.target.value }))} />
                    </div>
                  </div>
                  <Button onClick={() => createSpec.mutate({ productId: selectedProductId!, ...specForm, form: specForm.form as any, shelfLifeMonths: specForm.shelfLifeMonths || undefined })} disabled={createSpec.isPending}>
                    Create Specification
                  </Button>
                </DialogContent>
              </Dialog>
            </div>

            {specs && specs.length > 0 ? (
              specs.map(spec => (
                <Card key={spec.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Version {spec.version}</CardTitle>
                      <Badge variant={spec.status === "active" ? "default" : "secondary"}>{spec.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {spec.appearance && <div><span className="text-muted-foreground">Appearance:</span> {spec.appearance}</div>}
                      {spec.color && <div><span className="text-muted-foreground">Color:</span> {spec.color}</div>}
                      {spec.form && <div><span className="text-muted-foreground">Form:</span> {spec.form}</div>}
                      {spec.moisture && <div><span className="text-muted-foreground">Moisture:</span> {spec.moisture}</div>}
                      {spec.protein && <div><span className="text-muted-foreground">Protein:</span> {spec.protein}</div>}
                      {spec.pH && <div><span className="text-muted-foreground">pH:</span> {spec.pH}</div>}
                      {spec.shelfLifeMonths && <div><span className="text-muted-foreground">Shelf Life:</span> {spec.shelfLifeMonths} months</div>}
                      {spec.countryOfOrigin && <div><span className="text-muted-foreground">Origin:</span> {spec.countryOfOrigin}</div>}
                      {spec.storageConditions && <div><span className="text-muted-foreground">Storage:</span> {spec.storageConditions}</div>}
                      {spec.totalPlateCount && <div><span className="text-muted-foreground">TPC:</span> {spec.totalPlateCount}</div>}
                      {spec.salmonella && <div><span className="text-muted-foreground">Salmonella:</span> {spec.salmonella}</div>}
                      {spec.lead && <div><span className="text-muted-foreground">Lead:</span> {spec.lead}</div>}
                    </div>
                    {spec.ingredientStatement && (
                      <div className="mt-3 text-sm"><span className="text-muted-foreground">Ingredients:</span> {spec.ingredientStatement}</div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No specifications yet. Create one to get started.</CardContent></Card>
            )}
          </TabsContent>

          {/* ALLERGENS TAB */}
          <TabsContent value="allergens" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Allergen Profile — {selectedProduct?.name}</h2>
              <Dialog open={isAllergenOpen} onOpenChange={setIsAllergenOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Add Allergen</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Allergen Declaration</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Allergen</Label>
                      <Select value={allergenForm.allergen} onValueChange={v => setAllergenForm(p => ({ ...p, allergen: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(ALLERGEN_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {allergenForm.allergen === "other" && (
                      <div>
                        <Label>Custom Allergen Name</Label>
                        <Input value={allergenForm.customAllergenName} onChange={e => setAllergenForm(p => ({ ...p, customAllergenName: e.target.value }))} />
                      </div>
                    )}
                    <div>
                      <Label>Presence Type</Label>
                      <Select value={allergenForm.presenceType} onValueChange={v => setAllergenForm(p => ({ ...p, presenceType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="may_contain">May Contain (Cross-Contact)</SelectItem>
                          <SelectItem value="free_from">Free From</SelectItem>
                          <SelectItem value="not_tested">Not Tested</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input value={allergenForm.notes} onChange={e => setAllergenForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                  </div>
                  <Button onClick={() => createAllergen.mutate({ productId: selectedProductId!, ...allergenForm, allergen: allergenForm.allergen as any, presenceType: allergenForm.presenceType as any })} disabled={createAllergen.isPending}>
                    Add Allergen
                  </Button>
                </DialogContent>
              </Dialog>
            </div>

            {allergens && allergens.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {allergens.map(a => (
                  <Card key={a.id} className="relative">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{ALLERGEN_LABELS[a.allergen] || a.customAllergenName}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteAllergen.mutate({ id: a.id })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge className={PRESENCE_COLORS[a.presenceType] || ""} variant="outline">
                        {a.presenceType.replace("_", " ")}
                      </Badge>
                      {a.notes && <p className="text-xs text-muted-foreground mt-2">{a.notes}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No allergens declared. Add allergen information to build the allergen profile.</CardContent></Card>
            )}
          </TabsContent>

          {/* CERTIFICATIONS TAB */}
          <TabsContent value="certs" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Certifications — {selectedProduct?.name}</h2>
              <Dialog open={isCertOpen} onOpenChange={setIsCertOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Add Certification</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Certification</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Certification Type</Label>
                      <Select value={certForm.certificationType} onValueChange={v => setCertForm(p => ({ ...p, certificationType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CERT_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {certForm.certificationType === "other" && (
                      <div>
                        <Label>Custom Certification Name</Label>
                        <Input value={certForm.customCertName} onChange={e => setCertForm(p => ({ ...p, customCertName: e.target.value }))} />
                      </div>
                    )}
                    <div>
                      <Label>Certifying Body</Label>
                      <Input value={certForm.certifyingBody} onChange={e => setCertForm(p => ({ ...p, certifyingBody: e.target.value }))} placeholder="e.g. QAI, OU, NSF" />
                    </div>
                    <div>
                      <Label>Certificate Number</Label>
                      <Input value={certForm.certificateNumber} onChange={e => setCertForm(p => ({ ...p, certificateNumber: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Issue Date</Label>
                        <Input type="date" value={certForm.issueDate} onChange={e => setCertForm(p => ({ ...p, issueDate: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Expiry Date</Label>
                        <Input type="date" value={certForm.expiryDate} onChange={e => setCertForm(p => ({ ...p, expiryDate: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => createCert.mutate({ productId: selectedProductId!, ...certForm, certificationType: certForm.certificationType as any })} disabled={createCert.isPending}>
                    Add Certification
                  </Button>
                </DialogContent>
              </Dialog>
            </div>

            {certifications && certifications.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Certifying Body</TableHead>
                    <TableHead>Certificate #</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certifications.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{CERT_LABELS[c.certificationType] || c.customCertName}</TableCell>
                      <TableCell>{c.certifyingBody}</TableCell>
                      <TableCell>{c.certificateNumber}</TableCell>
                      <TableCell>{c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "default" : c.status === "expired" ? "destructive" : "secondary"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteCert.mutate({ id: c.id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No certifications on file. Add certifications like Organic, Kosher, Non-GMO, etc.</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
