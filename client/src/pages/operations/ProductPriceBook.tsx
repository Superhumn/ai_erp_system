import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Calculator, Globe, Layers as LayersIcon, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const CHANNELS = [
  { value: "foodservice", label: "Foodservice" },
  { value: "wholesale", label: "Wholesale" },
  { value: "retail_msrp", label: "Retail MSRP" },
  { value: "retail_dtc", label: "Retail DTC" },
  { value: "export", label: "Export" },
  { value: "institutional", label: "Institutional" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
] as const;

type ChannelValue = typeof CHANNELS[number]["value"];

function formatMoney(value: string | number | null | undefined, currency: string): string {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(num);
  } catch {
    return `${num.toFixed(2)} ${currency}`;
  }
}

function channelLabel(v: string): string {
  return CHANNELS.find(c => c.value === v)?.label ?? v;
}

// ============================================
// REGIONAL SKUS
// ============================================

export function RegionalSkusCard({ productId }: { productId: number }) {
  const { data: skus, refetch } = trpc.regionalSkus.list.useQuery({ productId });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    region: "",
    regionalSku: "",
    barcode: "",
    barcodeType: "ean13" as "ean13" | "upc" | "gtin14" | "code128" | "other",
    gs1Prefix: "",
    localName: "",
    packagingFormat: "",
    status: "active" as "planned" | "active" | "discontinued",
  });

  const create = trpc.regionalSkus.create.useMutation({
    onSuccess: async () => {
      toast.success("Regional SKU added");
      await refetch();
      setOpen(false);
      setForm({ region: "", regionalSku: "", barcode: "", barcodeType: "ean13", gs1Prefix: "", localName: "", packagingFormat: "", status: "active" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" />Regional SKUs</CardTitle>
          <CardDescription>Country-specific SKU variants and barcodes</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Regional SKU</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Regional SKU</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Region (ISO code)</Label>
                  <Input placeholder="ZA, IN, US, EU..." value={form.region} maxLength={8}
                    onChange={(e) => setForm({ ...form, region: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1">
                  <Label>Regional SKU</Label>
                  <Input placeholder="SH-BWS-001-SA" value={form.regionalSku}
                    onChange={(e) => setForm({ ...form, regionalSku: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Barcode</Label>
                  <Input placeholder="EAN-13 or UPC" value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Barcode Type</Label>
                  <Select value={form.barcodeType} onValueChange={(v: any) => setForm({ ...form, barcodeType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ean13">EAN-13</SelectItem>
                      <SelectItem value="upc">UPC</SelectItem>
                      <SelectItem value="gtin14">GTIN-14</SelectItem>
                      <SelectItem value="code128">Code 128</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>GS1 Prefix</Label>
                  <Input placeholder="e.g. 890 (India)" value={form.gs1Prefix}
                    onChange={(e) => setForm({ ...form, gs1Prefix: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Local Name</Label>
                <Input value={form.localName} onChange={(e) => setForm({ ...form, localName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Packaging Format</Label>
                <Input placeholder="e.g. 200ml Tetra Pak, 500 g retort pouch"
                  value={form.packagingFormat}
                  onChange={(e) => setForm({ ...form, packagingFormat: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={create.isPending || !form.region.trim() || !form.regionalSku.trim()}
                onClick={() => create.mutate({
                  productId,
                  region: form.region.trim(),
                  regionalSku: form.regionalSku.trim(),
                  barcode: form.barcode || undefined,
                  barcodeType: form.barcode ? form.barcodeType : undefined,
                  gs1Prefix: form.gs1Prefix || undefined,
                  localName: form.localName || undefined,
                  packagingFormat: form.packagingFormat || undefined,
                  status: form.status,
                })}
              >
                {create.isPending ? "Saving..." : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!skus || skus.length === 0 ? (
          <p className="text-sm text-muted-foreground">No regional SKUs yet. Add one when launching in a new market.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Region</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Packaging</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skus.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.region}</TableCell>
                  <TableCell className="font-mono">{s.regionalSku}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {s.barcode ? <>{s.barcode}{s.barcodeType ? <span className="text-muted-foreground"> ({s.barcodeType})</span> : null}</> : "-"}
                  </TableCell>
                  <TableCell>{s.packagingFormat ?? "-"}</TableCell>
                  <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// PRICE TIERS
// ============================================

export function PriceTiersCard({ productId, defaultCurrency }: { productId: number; defaultCurrency: string }) {
  const { data: tiers, refetch } = trpc.priceBook.listTiers.useQuery({ productId, activeOnly: false });
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const blank = {
    region: "ZA",
    channel: "foodservice" as ChannelValue,
    currency: defaultCurrency || "USD",
    packSize: "",
    unitOfMeasure: "kg",
    pricePerUnit: "",
    taxMode: "exclusive" as "exclusive" | "inclusive" | "exempt",
    taxRate: "",
    minOrderQty: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    contractOnly: false,
    notes: "",
    bands: [
      { minQty: "", maxQty: "", discountPercent: "" },
    ],
  };
  const [form, setForm] = useState(blank);

  const create = trpc.priceBook.createTier.useMutation({
    onSuccess: async () => {
      toast.success("Price tier added");
      await refetch();
      setOpen(false);
      setForm({ ...blank });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (id: number) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><LayersIcon className="w-5 h-5" />Price Tiers</CardTitle>
          <CardDescription>Foodservice / wholesale / MSRP per region, with volume discount bands</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Price Tier</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Add Price Tier</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Region</Label>
                  <Input placeholder="ZA, IN, US..." maxLength={8} value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1">
                  <Label>Channel</Label>
                  <Select value={form.channel} onValueChange={(v: ChannelValue) => setForm({ ...form, channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Input placeholder="ZAR, USD, INR" maxLength={3} value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Pack Size</Label>
                  <Input placeholder="2 kg / 5 kg" value={form.packSize}
                    onChange={(e) => setForm({ ...form, packSize: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Unit of Measure</Label>
                  <Input value={form.unitOfMeasure}
                    onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Price per Unit</Label>
                  <Input type="number" step="0.01" value={form.pricePerUnit}
                    onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Tax Mode</Label>
                  <Select value={form.taxMode} onValueChange={(v: any) => setForm({ ...form, taxMode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclusive">Excl. tax</SelectItem>
                      <SelectItem value="inclusive">Incl. tax</SelectItem>
                      <SelectItem value="exempt">Exempt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tax Rate (%)</Label>
                  <Input type="number" step="0.01" placeholder="15" value={form.taxRate}
                    onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Min Order Qty</Label>
                  <Input type="number" step="0.01" placeholder="25" value={form.minOrderQty}
                    onChange={(e) => setForm({ ...form, minOrderQty: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Effective From</Label>
                <Input type="date" value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Volume Discount Bands</Label>
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setForm({ ...form, bands: [...form.bands, { minQty: "", maxQty: "", discountPercent: "" }] })}>
                    <Plus className="w-3 h-3 mr-1" />Add band
                  </Button>
                </div>
                {form.bands.map((b, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Min Qty</Label>
                      <Input type="number" step="0.01" value={b.minQty}
                        onChange={(e) => {
                          const next = [...form.bands];
                          next[i] = { ...next[i], minQty: e.target.value };
                          setForm({ ...form, bands: next });
                        }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max Qty (blank = ∞)</Label>
                      <Input type="number" step="0.01" value={b.maxQty}
                        onChange={(e) => {
                          const next = [...form.bands];
                          next[i] = { ...next[i], maxQty: e.target.value };
                          setForm({ ...form, bands: next });
                        }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Discount %</Label>
                      <Input type="number" step="0.01" value={b.discountPercent}
                        onChange={(e) => {
                          const next = [...form.bands];
                          next[i] = { ...next[i], discountPercent: e.target.value };
                          setForm({ ...form, bands: next });
                        }} />
                    </div>
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setForm({ ...form, bands: form.bands.filter((_, j) => j !== i) })}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={create.isPending || !form.region.trim() || !form.currency.trim() || !form.pricePerUnit.trim()}
                onClick={() => {
                  const filledBands = form.bands
                    .filter(b => b.minQty.trim() !== "")
                    .map(b => ({
                      minQty: b.minQty,
                      maxQty: b.maxQty.trim() ? b.maxQty : undefined,
                      discountPercent: b.discountPercent.trim() ? b.discountPercent : "0",
                    }));
                  create.mutate({
                    productId,
                    region: form.region.trim(),
                    channel: form.channel,
                    currency: form.currency.trim(),
                    packSize: form.packSize || undefined,
                    unitOfMeasure: form.unitOfMeasure || "kg",
                    pricePerUnit: form.pricePerUnit,
                    taxMode: form.taxMode,
                    taxRate: form.taxRate || undefined,
                    minOrderQty: form.minOrderQty || undefined,
                    effectiveFrom: new Date(form.effectiveFrom),
                    contractOnly: form.contractOnly,
                    notes: form.notes || undefined,
                    volumeDiscounts: filledBands.length ? filledBands : undefined,
                  });
                }}
              >
                {create.isPending ? "Saving..." : "Add Tier"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <PriceTierQuoteWidget productId={productId} tiers={tiers as any[] | undefined} />

        {!tiers || tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No price tiers yet. Add a tier to track regional / channel pricing
            (foodservice base, wholesale, MSRP) with volume discount bands.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Pack Size</TableHead>
                <TableHead className="text-right">Price / {(tiers as any[])[0]?.unitOfMeasure ?? "unit"}</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Min Qty</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tiers as any[])
                .slice()
                .sort((a: any, b: any) => (a.region + a.channel).localeCompare(b.region + b.channel))
                .map((t: any) => (
                  <PriceTierRow
                    key={t.id}
                    tier={t}
                    expanded={expanded.has(t.id)}
                    onToggle={() => toggle(t.id)}
                    onBandsChanged={async () => { await utils.priceBook.getTier.invalidate({ id: t.id }); }}
                  />
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PriceTierRow({ tier, expanded, onToggle, onBandsChanged }: {
  tier: any;
  expanded: boolean;
  onToggle: () => void;
  onBandsChanged: () => Promise<void>;
}) {
  const { data: detail } = trpc.priceBook.getTier.useQuery({ id: tier.id }, { enabled: expanded });
  const [bandOpen, setBandOpen] = useState(false);
  const [bandForm, setBandForm] = useState({ minQty: "", maxQty: "", discountPercent: "" });
  const addBand = trpc.priceBook.addVolumeDiscount.useMutation({
    onSuccess: async () => {
      toast.success("Volume band added");
      setBandOpen(false);
      setBandForm({ minQty: "", maxQty: "", discountPercent: "" });
      await onBandsChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </TableCell>
        <TableCell className="font-medium">{tier.region}</TableCell>
        <TableCell>{channelLabel(tier.channel)}</TableCell>
        <TableCell className="text-sm">{tier.packSize ?? "-"}</TableCell>
        <TableCell className="text-right font-mono">{formatMoney(tier.pricePerUnit, tier.currency)}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {tier.taxMode === "exempt" ? "exempt" : tier.taxRate ? `${tier.taxRate}% ${tier.taxMode === "inclusive" ? "incl." : "excl."}` : "-"}
        </TableCell>
        <TableCell className="text-sm">{tier.minOrderQty ?? "-"}</TableCell>
        <TableCell className="text-xs">{tier.effectiveFrom ? new Date(tier.effectiveFrom).toLocaleDateString() : "-"}</TableCell>
        <TableCell><Badge variant="outline">{tier.status}</Badge></TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Volume discount bands</h4>
                <Dialog open={bandOpen} onOpenChange={setBandOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" />Add band</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add volume discount band</DialogTitle></DialogHeader>
                    <div className="grid gap-3 py-2">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label>Min Qty</Label>
                          <Input type="number" step="0.01" value={bandForm.minQty}
                            onChange={(e) => setBandForm({ ...bandForm, minQty: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Max Qty</Label>
                          <Input type="number" step="0.01" placeholder="blank = ∞" value={bandForm.maxQty}
                            onChange={(e) => setBandForm({ ...bandForm, maxQty: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Discount %</Label>
                          <Input type="number" step="0.01" value={bandForm.discountPercent}
                            onChange={(e) => setBandForm({ ...bandForm, discountPercent: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setBandOpen(false)}>Cancel</Button>
                      <Button
                        disabled={addBand.isPending || !bandForm.minQty.trim()}
                        onClick={() => addBand.mutate({
                          priceTierId: tier.id,
                          minQty: bandForm.minQty,
                          maxQty: bandForm.maxQty.trim() ? bandForm.maxQty : undefined,
                          discountPercent: bandForm.discountPercent.trim() ? bandForm.discountPercent : "0",
                        })}
                      >
                        {addBand.isPending ? "Saving..." : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              {!detail?.volumeDiscounts || detail.volumeDiscounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No volume bands. Base price applies at all quantities.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From qty</TableHead>
                      <TableHead>To qty</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Effective price</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.volumeDiscounts
                      .slice()
                      .sort((a: any, b: any) => Number(a.minQty) - Number(b.minQty))
                      .map((b: any) => {
                        const pct = Number(b.discountPercent ?? 0);
                        const effective = Number(tier.pricePerUnit) * (1 - pct / 100);
                        return (
                          <TableRow key={b.id}>
                            <TableCell>{b.minQty}</TableCell>
                            <TableCell>{b.maxQty ?? "∞"}</TableCell>
                            <TableCell className="text-right">{pct.toFixed(2)}%</TableCell>
                            <TableCell className="text-right font-mono">{formatMoney(effective, tier.currency)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{b.notes ?? "-"}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
              {tier.notes && (
                <p className="text-xs text-muted-foreground italic">{tier.notes}</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// Quick price quote calculator at the top of the price tiers card.
function PriceTierQuoteWidget({ productId, tiers }: { productId: number; tiers: any[] | undefined }) {
  const regions = Array.from(new Set((tiers ?? []).map(t => t.region)));
  const channels = Array.from(new Set((tiers ?? []).map(t => t.channel as ChannelValue)));
  const [region, setRegion] = useState<string>("");
  const [channel, setChannel] = useState<ChannelValue | "">("");
  const [qty, setQty] = useState<string>("");

  useEffect(() => {
    if (!region && regions.length > 0) setRegion(regions[0]);
    if (!channel && channels.length > 0) setChannel(channels[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers?.length]);

  const qtyNum = parseFloat(qty);
  const enabled = !!region && !!channel && !!qtyNum && qtyNum > 0;
  const { data: quote } = trpc.priceBook.quote.useQuery(
    { productId, region, channel: (channel || "foodservice") as ChannelValue, quantity: qtyNum || 0 },
    { enabled },
  );

  if (!tiers || tiers.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Calculator className="w-4 h-4" />Quick quote
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>
            {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={(v: ChannelValue) => setChannel(v)}>
          <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            {channels.map(c => <SelectItem key={c} value={c}>{channelLabel(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" step="0.01" placeholder="Quantity" value={qty}
          onChange={(e) => setQty(e.target.value)} />
        <div className="flex items-center justify-end px-2">
          {enabled && quote ? (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                {formatMoney(quote.effectivePricePerUnit, quote.currency)} / {(quote.tier as any).unitOfMeasure ?? "unit"}
                {quote.discountPercent > 0 && <span className="ml-1 text-muted-foreground">(-{quote.discountPercent.toFixed(1)}%)</span>}
              </div>
              <div className="text-lg font-mono font-semibold">{formatMoney(quote.subtotal, quote.currency)}</div>
            </div>
          ) : enabled && !quote ? (
            <div className="text-sm text-muted-foreground">No active tier matches.</div>
          ) : (
            <div className="text-xs text-muted-foreground">Pick region, channel, quantity</div>
          )}
        </div>
      </div>
    </div>
  );
}
