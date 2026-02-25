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
import { Plus, Trash2, DollarSign, Users, Search } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  distributor: "Distributor",
  foodservice: "Foodservice",
  retail: "Retail",
  broker: "Broker",
  contract: "Contract",
  promotional: "Promotional",
};

export default function CustomerPricing() {
  const [activeTab, setActiveTab] = useState("price-lists");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);
  // Price lookup
  const [lookupCustomerId, setLookupCustomerId] = useState<number | null>(null);
  const [lookupProductId, setLookupProductId] = useState<number | null>(null);
  const [lookupQuantity, setLookupQuantity] = useState(1);

  const { data: products } = trpc.products.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: priceLists, refetch: refetchLists } = trpc.priceLists.list.useQuery();

  const { data: priceListDetail, refetch: refetchDetail } = trpc.priceLists.get.useQuery(
    { id: selectedPriceListId! },
    { enabled: !!selectedPriceListId }
  );

  const { data: priceResult } = trpc.priceLists.getCustomerPrice.useQuery(
    { customerId: lookupCustomerId!, productId: lookupProductId!, quantity: lookupQuantity },
    { enabled: !!lookupCustomerId && !!lookupProductId }
  );

  // Create form
  const [listForm, setListForm] = useState({
    name: "",
    description: "",
    currency: "USD",
    type: "standard" as string,
    effectiveDate: "",
    expiryDate: "",
  });

  // Add item form
  const [itemForm, setItemForm] = useState({
    productId: 0,
    minQuantity: "1",
    maxQuantity: "",
    unitPrice: "",
    unit: "LB",
    discountPercent: "",
  });

  // Assign customer form
  const [assignForm, setAssignForm] = useState({
    customerId: 0,
    isPrimary: true,
  });

  const createPriceList = trpc.priceLists.create.useMutation({
    onSuccess: () => { toast.success("Price list created"); setIsCreateOpen(false); refetchLists(); setListForm({ name: "", description: "", currency: "USD", type: "standard", effectiveDate: "", expiryDate: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const deletePriceList = trpc.priceLists.delete.useMutation({
    onSuccess: () => { toast.success("Price list deleted"); setSelectedPriceListId(null); refetchLists(); },
    onError: (e) => toast.error(e.message),
  });

  const addItem = trpc.priceLists.addItem.useMutation({
    onSuccess: () => { toast.success("Price tier added"); setIsAddItemOpen(false); refetchDetail(); setItemForm({ productId: 0, minQuantity: "1", maxQuantity: "", unitPrice: "", unit: "LB", discountPercent: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const deleteItem = trpc.priceLists.deleteItem.useMutation({
    onSuccess: () => { toast.success("Price tier removed"); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const assignCustomer = trpc.priceLists.assignCustomer.useMutation({
    onSuccess: () => { toast.success("Customer assigned"); setIsAssignOpen(false); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const removeCustomer = trpc.priceLists.removeCustomer.useMutation({
    onSuccess: () => { toast.success("Customer removed"); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Customer Pricing</h1>
        <p className="text-muted-foreground">Manage customer-specific price lists with volume tiers</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="price-lists"><DollarSign className="h-4 w-4 mr-1" /> Price Lists</TabsTrigger>
          <TabsTrigger value="lookup"><Search className="h-4 w-4 mr-1" /> Price Lookup</TabsTrigger>
        </TabsList>

        {/* PRICE LISTS TAB */}
        <TabsContent value="price-lists" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Price List</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Price List</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label>Name *</Label>
                    <Input value={listForm.name} onChange={e => setListForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Distributor Tier A" />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={listForm.type} onValueChange={v => setListForm(p => ({ ...p, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Input value={listForm.currency} onChange={e => setListForm(p => ({ ...p, currency: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={listForm.description} onChange={e => setListForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Effective Date</Label>
                      <Input type="date" value={listForm.effectiveDate} onChange={e => setListForm(p => ({ ...p, effectiveDate: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Expiry Date</Label>
                      <Input type="date" value={listForm.expiryDate} onChange={e => setListForm(p => ({ ...p, expiryDate: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <Button onClick={() => { if (!listForm.name) { toast.error("Enter a name"); return; } createPriceList.mutate({ ...listForm, type: listForm.type as any, effectiveDate: listForm.effectiveDate || undefined, expiryDate: listForm.expiryDate || undefined }); }} disabled={createPriceList.isPending}>
                  Create
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Price List sidebar */}
            <div className="space-y-2">
              {priceLists?.map(pl => (
                <Card key={pl.id} className={`cursor-pointer transition-colors ${selectedPriceListId === pl.id ? "border-primary" : ""}`} onClick={() => setSelectedPriceListId(pl.id)}>
                  <CardContent className="py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{pl.name}</p>
                        <Badge variant="outline" className="mt-1">{TYPE_LABELS[pl.type] || pl.type}</Badge>
                      </div>
                      <Badge variant={pl.status === "active" ? "default" : "secondary"}>{pl.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!priceLists || priceLists.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No price lists yet</p>
              )}
            </div>

            {/* Price List detail */}
            <div className="md:col-span-2 space-y-4">
              {priceListDetail ? (
                <>
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>{priceListDetail.name}</CardTitle>
                        <div className="flex gap-2">
                          <Button variant="destructive" size="sm" onClick={() => { if (confirm("Delete this price list?")) deletePriceList.mutate({ id: priceListDetail.id }); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div><span className="text-muted-foreground">Type:</span> {TYPE_LABELS[priceListDetail.type]}</div>
                        <div><span className="text-muted-foreground">Currency:</span> {priceListDetail.currency}</div>
                        <div><span className="text-muted-foreground">Status:</span> {priceListDetail.status}</div>
                      </div>
                      {priceListDetail.description && <p className="text-sm mt-2 text-muted-foreground">{priceListDetail.description}</p>}
                    </CardContent>
                  </Card>

                  {/* Price tiers */}
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">Price Tiers</CardTitle>
                        <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm"><Plus className="h-3 w-3 mr-1" />Add Tier</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Add Price Tier</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Product *</Label>
                                <Select value={itemForm.productId?.toString() || ""} onValueChange={v => setItemForm(p => ({ ...p, productId: Number(v) }))}>
                                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                                  <SelectContent>
                                    {products?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.sku} — {p.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label>Min Quantity</Label>
                                  <Input value={itemForm.minQuantity} onChange={e => setItemForm(p => ({ ...p, minQuantity: e.target.value }))} />
                                </div>
                                <div>
                                  <Label>Max Quantity (blank = unlimited)</Label>
                                  <Input value={itemForm.maxQuantity} onChange={e => setItemForm(p => ({ ...p, maxQuantity: e.target.value }))} />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label>Unit Price *</Label>
                                  <Input value={itemForm.unitPrice} onChange={e => setItemForm(p => ({ ...p, unitPrice: e.target.value }))} placeholder="0.00" />
                                </div>
                                <div>
                                  <Label>Unit</Label>
                                  <Select value={itemForm.unit} onValueChange={v => setItemForm(p => ({ ...p, unit: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="LB">LB</SelectItem>
                                      <SelectItem value="KG">KG</SelectItem>
                                      <SelectItem value="EA">EA</SelectItem>
                                      <SelectItem value="CS">CS (Case)</SelectItem>
                                      <SelectItem value="PLT">PLT (Pallet)</SelectItem>
                                      <SelectItem value="GAL">GAL</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                            <Button onClick={() => {
                              if (!itemForm.productId || !itemForm.unitPrice) { toast.error("Product and price required"); return; }
                              addItem.mutate({ priceListId: selectedPriceListId!, ...itemForm, maxQuantity: itemForm.maxQuantity || undefined, discountPercent: itemForm.discountPercent || undefined });
                            }} disabled={addItem.isPending}>
                              Add Tier
                            </Button>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Min Qty</TableHead>
                            <TableHead>Max Qty</TableHead>
                            <TableHead>Unit Price</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {priceListDetail.items?.map(item => (
                            <TableRow key={item.id}>
                              <TableCell>{products?.find(p => p.id === item.productId)?.name || item.productId}</TableCell>
                              <TableCell>{item.minQuantity}</TableCell>
                              <TableCell>{item.maxQuantity || "Unlimited"}</TableCell>
                              <TableCell className="font-mono">${item.unitPrice}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => deleteItem.mutate({ id: item.id })}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {(!priceListDetail.items || priceListDetail.items.length === 0) && (
                            <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No price tiers. Add product pricing above.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Assigned customers */}
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">Assigned Customers</CardTitle>
                        <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm"><Users className="h-3 w-3 mr-1" />Assign Customer</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Assign Customer to Price List</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Customer</Label>
                                <Select value={assignForm.customerId?.toString() || ""} onValueChange={v => setAssignForm(p => ({ ...p, customerId: Number(v) }))}>
                                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                                  <SelectContent>
                                    {customers?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Button onClick={() => { if (!assignForm.customerId) { toast.error("Select a customer"); return; } assignCustomer.mutate({ ...assignForm, priceListId: selectedPriceListId! }); }} disabled={assignCustomer.isPending}>
                              Assign
                            </Button>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {priceListDetail.customerAssignments?.map(ca => (
                          <div key={ca.id} className="flex justify-between items-center py-2 border-b last:border-0">
                            <span>{customers?.find(c => c.id === ca.customerId)?.name || `Customer #${ca.customerId}`}</span>
                            <div className="flex items-center gap-2">
                              {ca.isPrimary && <Badge>Primary</Badge>}
                              <Button variant="ghost" size="icon" onClick={() => removeCustomer.mutate({ id: ca.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(!priceListDetail.customerAssignments || priceListDetail.customerAssignments.length === 0) && (
                          <p className="text-center py-4 text-muted-foreground text-sm">No customers assigned yet.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Select a price list to view details</CardContent></Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* PRICE LOOKUP TAB */}
        <TabsContent value="lookup" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Customer Price Lookup</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Customer</Label>
                  <Select value={lookupCustomerId?.toString() || ""} onValueChange={v => setLookupCustomerId(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Product</Label>
                  <Select value={lookupProductId?.toString() || ""} onValueChange={v => setLookupProductId(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.sku} — {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" value={lookupQuantity} onChange={e => setLookupQuantity(Number(e.target.value))} min={1} />
                </div>
              </div>

              {lookupCustomerId && lookupProductId && (
                <div className="mt-6 p-4 rounded-lg border">
                  {priceResult ? (
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Effective Price for {lookupQuantity} units</p>
                      <p className="text-3xl font-bold mt-1">${priceResult.unitPrice}</p>
                      <p className="text-sm text-muted-foreground mt-1">per {priceResult.unit || "EA"}</p>
                      <p className="text-xs text-muted-foreground mt-2">From tier: min {priceResult.minQuantity} — max {priceResult.maxQuantity || "unlimited"}</p>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground">No custom pricing found. Standard catalog price applies.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
