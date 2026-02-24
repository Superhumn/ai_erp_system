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
import { AITriggerButton } from "@/components/FloatingAIAssistant";
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
} from "lucide-react";

const carrierTypeIcons: Record<string, React.ReactNode> = {
  ocean: <Ship className="h-4 w-4" />,
  air: <Plane className="h-4 w-4" />,
  ground: <Truck className="h-4 w-4" />,
  rail: <Train className="h-4 w-4" />,
  multimodal: <Layers className="h-4 w-4" />,
};

export default function Carriers() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
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
          <h1 className="text-2xl font-bold">Carriers & Forwarders</h1>
          <p className="text-muted-foreground">Manage your freight carrier network</p>
        </div>
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
          <div className="flex items-center justify-between w-full">
            <CardTitle>Carrier Network ({filteredCarriers?.length || 0})</CardTitle>
          <AITriggerButton message="Analyze our carriers - compare performance metrics, identify cost optimization opportunities, and suggest consolidation" label="AI Carrier Analysis" />
        </div>
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
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
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
                                  ? "text-yellow-500 fill-yellow-500"
                                  : "text-gray-300"
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(carrier.website!, "_blank")}
                          >
                            <Globe className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePreferred(carrier.id, carrier.isPreferred || false)}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              carrier.isPreferred
                                ? "text-yellow-500 fill-yellow-500"
                                : "text-gray-400"
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
