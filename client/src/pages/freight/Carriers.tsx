import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { safeExternalUrl } from "@/lib/utils";
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
  Ship,
  Plane,
  Truck,
  Train,
  Layers,
  Plus,
  Star,
  Search,
  Loader2,
  Mail,
  Phone,
  Globe,
  ShieldCheck,
  ShieldAlert,
  Download,
} from "lucide-react";

const carrierTypeIcons: Record<string, React.ReactNode> = {
  ocean: <Ship className="h-4 w-4" />,
  air: <Plane className="h-4 w-4" />,
  ground: <Truck className="h-4 w-4" />,
  rail: <Train className="h-4 w-4" />,
  multimodal: <Layers className="h-4 w-4" />,
};

/**
 * How a carrier's contact details got there, and whether they can be mailed.
 *
 * `discovered` means a model proposed the company and nothing has confirmed how
 * to reach it — the server refuses to send an RFQ to one of these, so the row
 * says so rather than letting the send fail silently later.
 */
function ContactProvenance({ carrier }: { carrier: any }) {
  const source = carrier.contactSource ?? "manual";
  if (source === "discovered") {
    return (
      <Badge variant="outline" className="w-fit gap-1 border-amber-500/50 text-amber-600">
        <ShieldAlert className="h-3 w-3" />
        Unverified — cannot send RFQ
      </Badge>
    );
  }
  if (source === "website") {
    // Server-extracted, but still untrusted data from the DB at render time.
    const href = safeExternalUrl(carrier.contactSourceUrl);
    return (
      <Badge variant="outline" className="w-fit gap-1 border-emerald-500/50 text-emerald-600">
        <ShieldCheck className="h-3 w-3" />
        {href ? (
          <a href={href} target="_blank" rel="noreferrer noopener" className="hover:underline">
            From their website
          </a>
        ) : (
          "From their website"
        )}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="w-fit text-muted-foreground">
      {source === "inbound_email" ? "From their email" : source === "import" ? "Imported" : "Entered by hand"}
    </Badge>
  );
}

export default function Carriers() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [discoverForm, setDiscoverForm] = useState({ origin: "", destination: "", cargoType: "", shippingMode: "" as string, specialRequirements: "" });
  const [discoveredCarriers, setDiscoveredCarriers] = useState<any[]>([]);
  const [sourcingCarrierId, setSourcingCarrierId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "ocean" as "ocean" | "air" | "ground" | "rail" | "multimodal",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    country: "",
    website: "",
    notes: "",
    isPreferred: false,
  });

  const utils = trpc.useUtils();
  const { data: carriers, isLoading } = trpc.freight.carriers.list.useQuery(
    typeFilter !== "all" ? { type: typeFilter } : undefined
  );

  const createMutation = trpc.freight.carriers.create.useMutation({
    onSuccess: () => {
      toast.success("Carrier added successfully");
      utils.freight.carriers.list.invalidate();
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add carrier");
    },
  });

  const updateMutation = trpc.freight.carriers.update.useMutation({
    onSuccess: () => {
      toast.success("Carrier updated");
      utils.freight.carriers.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update carrier");
    },
  });

  const discoverMutation = trpc.freight.discoverCarriers.useMutation({
    onSuccess: (data: any) => {
      setDiscoveredCarriers(data.carriers || []);
      if (data.carriers?.length > 0) {
        toast.success(`Found ${data.carriers.length} carriers`);
      } else {
        toast.info("No carriers found. Try different search criteria.");
      }
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Saving a suggested carrier stores only what the model can actually know —
  // name, type, country, website — and then reads the contact details off the
  // carrier's own site. Nothing here writes an address the model made up.
  const addDiscoveredMutation = trpc.freight.carriers.addDiscovered.useMutation({
    onSuccess: (result: any) => {
      utils.freight.carriers.list.invalidate();
      if (result.verified) {
        toast.success(result.message);
      } else {
        toast.warning(result.message);
      }
    },
    onError: (error: any) => toast.error(error.message || "Failed to add carrier"),
  });

  const sourceMutation = trpc.freight.carriers.sourceFromWebsite.useMutation({
    onSuccess: (result: any) => {
      utils.freight.carriers.list.invalidate();
      if (result.verified) {
        toast.success(`Verified from ${result.source?.fetchedUrl ?? "the carrier's website"}`);
      } else if (result.status === "no_website") {
        toast.warning("No website on this carrier — add one first.");
      } else {
        const reason = result.skipped?.[0]?.reason;
        toast.warning(reason || "Nothing usable found on the carrier's own site.");
      }
    },
    onError: (error: any) => toast.error(error.message || "Could not read that website"),
    onSettled: () => setSourcingCarrierId(null),
  });

  const handleAddDiscovered = (carrier: any) => {
    addDiscoveredMutation.mutate({
      name: carrier.name,
      type: carrier.type || "multimodal",
      country: carrier.country || undefined,
      website: carrier.website || undefined,
      notes: carrier.notes || undefined,
    });
    setDiscoveredCarriers(prev => prev.filter(c => c.name !== carrier.name));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      type: "ocean",
      contactName: "",
      email: "",
      phone: "",
      address: "",
      country: "",
      website: "",
      notes: "",
      isPreferred: false,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const toggleActive = (id: number, isActive: boolean) => {
    updateMutation.mutate({ id, isActive: !isActive });
  };

  const togglePreferred = (id: number, isPreferred: boolean) => {
    updateMutation.mutate({ id, isPreferred: !isPreferred });
  };

  const filteredCarriers = carriers?.filter((carrier) =>
    carrier.name.toLowerCase().includes(search.toLowerCase()) ||
    carrier.contactName?.toLowerCase().includes(search.toLowerCase()) ||
    carrier.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Carriers & Forwarders</h1>
          <p className="text-muted-foreground">Manage your freight carrier network</p>
        </div>
        <div className="flex gap-2">
        <Button variant="outline" onClick={() => setIsDiscoverOpen(true)}>
          <Search className="h-4 w-4 mr-2" />
          Discover Carriers
        </Button>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Carrier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Carrier</DialogTitle>
              <DialogDescription>
                Add a freight carrier or forwarder to your network
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Carrier Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ocean">Ocean Freight</SelectItem>
                      <SelectItem value="air">Air Freight</SelectItem>
                      <SelectItem value="ground">Ground/Trucking</SelectItem>
                      <SelectItem value="rail">Rail</SelectItem>
                      <SelectItem value="multimodal">Multimodal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="isPreferred"
                    checked={formData.isPreferred}
                    onCheckedChange={(checked) => setFormData({ ...formData, isPreferred: checked })}
                  />
                  <Label htmlFor="isPreferred">Preferred Carrier</Label>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
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
                  Add Carrier
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Discover Carriers Dialog */}
      <Dialog open={isDiscoverOpen} onOpenChange={setIsDiscoverOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Discover Freight Carriers</DialogTitle>
            <DialogDescription>AI-powered search for carriers matching your shipment needs</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Origin</Label>
                <Input placeholder="City, Country" value={discoverForm.origin} onChange={(e) => setDiscoverForm({ ...discoverForm, origin: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Destination</Label>
                <Input placeholder="City, Country" value={discoverForm.destination} onChange={(e) => setDiscoverForm({ ...discoverForm, destination: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cargo Type</Label>
                <Input placeholder="e.g. Food grade, Hazmat, General" value={discoverForm.cargoType} onChange={(e) => setDiscoverForm({ ...discoverForm, cargoType: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Shipping Mode</Label>
                <Select value={discoverForm.shippingMode || "any"} onValueChange={(v) => setDiscoverForm({ ...discoverForm, shippingMode: v === "any" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Mode</SelectItem>
                    <SelectItem value="ocean">Ocean</SelectItem>
                    <SelectItem value="air">Air</SelectItem>
                    <SelectItem value="ground">Ground</SelectItem>
                    <SelectItem value="rail">Rail</SelectItem>
                    <SelectItem value="multimodal">Multimodal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Special Requirements</Label>
              <Input placeholder="e.g. Temperature controlled, Oversized, DG certified" value={discoverForm.specialRequirements} onChange={(e) => setDiscoverForm({ ...discoverForm, specialRequirements: e.target.value })} />
            </div>
            <Button
              onClick={() => discoverMutation.mutate(discoverForm as any)}
              disabled={discoverMutation.isPending}
              className="w-full"
            >
              {discoverMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {discoverMutation.isPending ? "Searching carriers..." : "Search Carriers"}
            </Button>

            {/* Results */}
            {discoveredCarriers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Found {discoveredCarriers.length} Carriers</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      These are suggestions. Adding one saves the company and reads its contact
                      details from its own website — no email address is taken from the suggestion itself.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    discoveredCarriers.forEach(c => handleAddDiscovered(c));
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Add All
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {discoveredCarriers.map((carrier: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50">
                      <div className="shrink-0">{carrierTypeIcons[carrier.type] || <Layers className="h-4 w-4" />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{carrier.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {carrier.country && `${carrier.country} · `}{carrier.notes}
                        </div>
                        <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                          {carrier.website
                            ? <span className="flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" />{carrier.website}</span>
                            : <span className="flex items-center gap-0.5 text-amber-600"><ShieldAlert className="h-2.5 w-2.5" />No website — contacts must be entered by hand</span>}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={addDiscoveredMutation.isPending}
                          onClick={() => handleAddDiscovered(carrier)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search carriers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ocean">Ocean Freight</SelectItem>
                <SelectItem value="air">Air Freight</SelectItem>
                <SelectItem value="ground">Ground/Trucking</SelectItem>
                <SelectItem value="rail">Rail</SelectItem>
                <SelectItem value="multimodal">Multimodal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Carriers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Carrier Network ({filteredCarriers?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCarriers && filteredCarriers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCarriers.map((carrier) => (
                  <TableRow key={carrier.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {carrier.isPreferred && (
                          <Star className="h-4 w-4 text-primary fill-primary" />
                        )}
                        <div>
                          <p className="font-medium">{carrier.name}</p>
                          {carrier.country && (
                            <p className="text-sm text-muted-foreground">{carrier.country}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        {carrierTypeIcons[carrier.type]}
                        {carrier.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {carrier.contactName && (
                          <p className="text-sm">{carrier.contactName}</p>
                        )}
                        {carrier.email && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {carrier.email}
                          </p>
                        )}
                        {carrier.phone && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {carrier.phone}
                          </p>
                        )}
                        {!carrier.email && !carrier.phone && (
                          <p className="text-sm text-muted-foreground">No contact details</p>
                        )}
                        <ContactProvenance carrier={carrier} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {carrier.rating ? (
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < carrier.rating!
                                  ? "text-primary fill-primary"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not rated</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={carrier.isActive ? "default" : "secondary"}>
                        {carrier.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {carrier.website && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={safeExternalUrl(carrier.website) ? "Open website" : "Website is not a usable http(s) URL"}
                              disabled={!safeExternalUrl(carrier.website)}
                              onClick={() => {
                                const href = safeExternalUrl(carrier.website);
                                if (href) window.open(href, "_blank", "noopener,noreferrer");
                              }}
                            >
                              <Globe className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Read contact details from their website"
                              disabled={
                                sourceMutation.isPending &&
                                sourcingCarrierId === carrier.id
                              }
                              onClick={() => {
                                setSourcingCarrierId(carrier.id);
                                sourceMutation.mutate({ carrierId: carrier.id });
                              }}
                            >
                              {sourceMutation.isPending &&
                              sourcingCarrierId === carrier.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePreferred(carrier.id, carrier.isPreferred || false)}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              carrier.isPreferred
                                ? "text-primary fill-primary"
                                : "text-muted-foreground"
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(carrier.id, carrier.isActive || false)}
                        >
                          {carrier.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Ship className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No carriers found</p>
              <Button variant="link" onClick={() => setIsOpen(true)}>
                Add your first carrier
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
