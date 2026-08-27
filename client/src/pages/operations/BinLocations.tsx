import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MapPin, Plus } from "lucide-react";

const ZONE_TYPES = [
  "picking", "bulk", "receiving", "staging", "quarantine", "returns",
] as const;

/**
 * Zones and bins.
 *
 * `inventoryBalances` has carried `zoneId` and `binId` as free text since it
 * was created, with no table behind them — nothing validated a code, listed
 * what was in a bin, or gave bins a walk order. Worse, the balance write path
 * keyed on lot + warehouse + status only, so the same lot could not be held in
 * two bins at all. Both are fixed; this is where the locations are managed.
 */
export default function BinLocations() {
  const [warehouseId, setWarehouseId] = useState("");
  const [zoneOpen, setZoneOpen] = useState(false);
  const [binOpen, setBinOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: warehouses } = trpc.warehouses.list.useQuery();

  const enabled = warehouseId !== "";
  const zones = trpc.warehouseLocations.zones.useQuery(
    { warehouseId: Number(warehouseId) },
    { enabled },
  );
  const bins = trpc.warehouseLocations.bins.useQuery(
    { warehouseId: Number(warehouseId) },
    { enabled },
  );
  const contents = trpc.warehouseLocations.contents.useQuery(
    { warehouseId: Number(warehouseId) },
    { enabled },
  );

  const refresh = () => {
    utils.warehouseLocations.zones.invalidate();
    utils.warehouseLocations.bins.invalidate();
    utils.warehouseLocations.contents.invalidate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.02em]">
            <MapPin className="h-4 w-4" />
            Zones &amp; Bins
          </h2>
          <p className="text-xs text-muted-foreground">
            Where stock sits inside a warehouse, and the order a picker walks it.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!enabled} onClick={() => setZoneOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Zone
          </Button>
          <Button disabled={!enabled} onClick={() => setBinOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Bin
          </Button>
        </div>
      </div>

      {!enabled ? (
        <p className="py-12 text-center text-xs text-muted-foreground">
          Pick a warehouse to see its zones and bins.
        </p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Zones</CardTitle>
              <CardDescription className="text-xs">
                Zone sequence dominates bin sequence, so picks run zone by zone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {zones.isLoading ? (
                <Loading />
              ) : (zones.data ?? []).length === 0 ? (
                <Empty>No zones yet.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Walk order</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zones.data?.map((zone) => (
                      <TableRow key={zone.id}>
                        <TableCell className="font-medium">{zone.code}</TableCell>
                        <TableCell>{zone.name}</TableCell>
                        <TableCell className="capitalize">{zone.zoneType}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {zone.pickSequence}
                        </TableCell>
                        <TableCell>
                          <Badge variant={zone.status === "active" ? "outline" : "secondary"}>
                            {zone.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Bins</CardTitle>
              <CardDescription className="text-xs">
                A capacity is enforced: a move that would overfill a bin is refused.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bins.isLoading ? (
                <Loading />
              ) : (bins.data ?? []).length === 0 ? (
                <Empty>No bins yet.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bin</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead className="text-right">Walk order</TableHead>
                      <TableHead className="text-right">Capacity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bins.data?.map((bin) => (
                      <TableRow key={bin.id}>
                        <TableCell>
                          <div className="font-medium">{bin.code}</div>
                          {bin.name && (
                            <div className="text-xs text-muted-foreground">{bin.name}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {bin.zoneCode ? (
                            <span>
                              {bin.zoneCode}
                              <span className="text-muted-foreground"> · {bin.zoneName}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Unzoned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bin.pickSequence}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bin.capacity ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              bin.status === "blocked"
                                ? "destructive"
                                : bin.status === "active"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {bin.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">What is in the bins</CardTitle>
              <CardDescription className="text-xs">
                Listed in walk order. Stock with no bin is legacy — it was
                written before bins existed and can be put away.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contents.isLoading ? (
                <Loading />
              ) : (contents.data ?? []).length === 0 ? (
                <Empty>Nothing stocked in this warehouse.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bin</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contents.data?.map((row) => (
                      <TableRow key={row.balanceId}>
                        <TableCell className="font-medium">
                          {row.binCode ?? (
                            <span className="text-muted-foreground">Unbinned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>{row.productName}</div>
                          <div className="text-xs text-muted-foreground">{row.sku}</div>
                        </TableCell>
                        <TableCell>{row.lotCode ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity} {row.unit}
                        </TableCell>
                        <TableCell className="capitalize">{row.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ZoneDialog
        open={zoneOpen}
        onOpenChange={setZoneOpen}
        warehouseId={Number(warehouseId)}
        onSaved={refresh}
      />
      <BinDialog
        open={binOpen}
        onOpenChange={setBinOpen}
        warehouseId={Number(warehouseId)}
        onSaved={refresh}
      />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-xs text-muted-foreground">{children}</p>
  );
}

function ZoneDialog({
  open, onOpenChange, warehouseId, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId: number;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: "", name: "", zoneType: "picking", pickSequence: "0",
  });

  const create = trpc.warehouseLocations.createZone.useMutation({
    onSuccess: () => {
      toast.success(`Zone ${form.code} created`);
      setForm({ code: "", name: "", zoneType: "picking", pickSequence: "0" });
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New zone</DialogTitle>
          <DialogDescription>
            The code must match what balances already store, if anything does.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="PICK-A"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Picking aisle A"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={form.zoneType}
              onValueChange={(value) => setForm({ ...form, zoneType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONE_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Walk order</Label>
            <Input
              type="number"
              min="0"
              value={form.pickSequence}
              onChange={(event) => setForm({ ...form, pickSequence: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!form.code || !form.name || create.isPending}
            onClick={() =>
              create.mutate({
                warehouseId,
                code: form.code,
                name: form.name,
                zoneType: form.zoneType as (typeof ZONE_TYPES)[number],
                pickSequence: Number(form.pickSequence) || 0,
              })
            }
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create zone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BinDialog({
  open, onOpenChange, warehouseId, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId: number;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: "", name: "", zoneId: "", pickSequence: "0", capacity: "",
  });

  const { data: zones } = trpc.warehouseLocations.zones.useQuery(
    { warehouseId },
    { enabled: Number.isFinite(warehouseId) && warehouseId > 0 },
  );

  const create = trpc.warehouseLocations.createBin.useMutation({
    onSuccess: () => {
      toast.success(`Bin ${form.code} created`);
      setForm({ code: "", name: "", zoneId: "", pickSequence: "0", capacity: "" });
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New bin</DialogTitle>
          <DialogDescription>
            Capacity is optional. When set, a move that would overfill the bin
            is refused.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="A-01-03"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Zone</Label>
            <Select
              value={form.zoneId}
              onValueChange={(value) => setForm({ ...form, zoneId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unzoned" />
              </SelectTrigger>
              <SelectContent>
                {zones?.map((zone) => (
                  <SelectItem key={zone.id} value={String(zone.id)}>
                    {zone.code} · {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Walk order</Label>
              <Input
                type="number"
                min="0"
                value={form.pickSequence}
                onChange={(event) => setForm({ ...form, pickSequence: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Capacity</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                placeholder="Uncapped"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!form.code || create.isPending}
            onClick={() =>
              create.mutate({
                warehouseId,
                code: form.code,
                ...(form.name ? { name: form.name } : {}),
                ...(form.zoneId ? { zoneId: Number(form.zoneId) } : {}),
                pickSequence: Number(form.pickSequence) || 0,
                ...(form.capacity ? { capacity: Number(form.capacity) } : {}),
              })
            }
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create bin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
