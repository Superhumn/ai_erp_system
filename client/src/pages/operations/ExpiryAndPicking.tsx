import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Loader2, PackageCheck, Trash2 } from "lucide-react";

type Bucket = "expired" | "critical" | "warning" | "ok" | "undated";

const BUCKET_LABELS: Record<Bucket, string> = {
  expired: "Expired",
  critical: "Within 30 days",
  warning: "Within 90 days",
  ok: "In date",
  undated: "No expiry",
};

const BUCKET_VARIANTS: Record<Bucket, "destructive" | "secondary" | "outline"> = {
  expired: "destructive",
  critical: "destructive",
  warning: "secondary",
  ok: "outline",
  undated: "outline",
};

const HORIZONS = [
  { value: "30", label: "Next 30 days" },
  { value: "90", label: "Next 90 days" },
  { value: "180", label: "Next 180 days" },
  { value: "3650", label: "Everything dated" },
];

/**
 * Expiry visibility and FEFO picking.
 *
 * Lots have always carried an `expiryDate` that nothing read, and
 * `shipInventory` was defined and never called — so nothing chose lots by
 * expiry and nothing decremented stock when it went out the door. This page is
 * where both become real work someone can do.
 */
export default function ExpiryAndPicking() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const [withinDays, setWithinDays] = useState("90");
  const [warehouseId, setWarehouseId] = useState<string>("all");

  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const expiring = trpc.inventory.expiring.useQuery({
    withinDays: Number(withinDays),
    ...(warehouseId !== "all" ? { warehouseId: Number(warehouseId) } : {}),
  });

  const sweep = trpc.inventory.sweepExpired.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.count === 0
          ? "Nothing expired — no lots quarantined"
          : `Quarantined ${result.count} expired lot${result.count === 1 ? "" : "s"}`,
      );
      utils.inventory.expiring.invalidate();
      utils.inventory.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = expiring.data ?? [];
  const expiredCount = rows.filter((row) => row.bucket === "expired").length;

  const warehouseName = (id: number) =>
    warehouses?.find((w) => w.id === id)?.name ?? `Warehouse #${id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.02em]">
            Expiry &amp; Picking
          </h2>
          <p className="text-xs text-muted-foreground">
            What is about to go out of date, and which lots a shipment would consume.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Horizon</Label>
            <Select value={withinDays} onValueChange={setWithinDays}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORIZONS.map((horizon) => (
                  <SelectItem key={horizon.value} value={horizon.value}>
                    {horizon.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses</SelectItem>
                {warehouses?.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <Button
              variant={expiredCount > 0 ? "default" : "outline"}
              disabled={sweep.isPending || expiredCount === 0}
              onClick={() =>
                sweep.mutate(
                  warehouseId !== "all" ? { warehouseId: Number(warehouseId) } : undefined,
                )
              }
            >
              {sweep.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Quarantine expired
            </Button>
          )}
        </div>
      </div>

      {expiredCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>
            {expiredCount} lot{expiredCount === 1 ? " is" : "s are"} past their expiry
            date and still counted as available stock.
            {!isAdmin && " An admin can quarantine them."}
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expiring stock</CardTitle>
          <CardDescription className="text-xs">
            Quarantining takes stock out of circulation. It does not write it
            off — disposal stays an explicit scrap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expiring.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Nothing expiring in this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.lotId}-${row.warehouseId}-${row.status}`}>
                    <TableCell className="font-medium">{row.lotCode}</TableCell>
                    <TableCell>{warehouseName(row.warehouseId)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity} {row.unit}
                    </TableCell>
                    <TableCell>
                      {row.expiryDate
                        ? new Date(row.expiryDate).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.daysUntilExpiry ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={BUCKET_VARIANTS[row.bucket as Bucket]}>
                        {BUCKET_LABELS[row.bucket as Bucket]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PickPlanner />
    </div>
  );
}

/**
 * Plan a pick, see exactly which lots it would consume, then commit it.
 *
 * The plan step is deliberately separate: shipping is the one movement that
 * reduces on-hand stock, so it is worth seeing what it will take before it
 * takes it.
 */
function PickPlanner() {
  const utils = trpc.useUtils();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");

  const { data: products } = trpc.products.list.useQuery();

  const ready =
    productId !== "" && warehouseId !== "" && Number(quantity) > 0;

  const plan = trpc.inventory.planPick.useQuery(
    {
      productId: Number(productId),
      warehouseId: Number(warehouseId),
      quantity: Number(quantity),
    },
    { enabled: ready },
  );

  const pick = trpc.inventory.pickFefo.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Shipped ${result.quantity} across ${result.allocations.length} lot(s)`,
      );
      setQuantity("");
      setReference("");
      utils.inventory.list.invalidate();
      utils.inventory.expiring.invalidate();
      utils.inventory.getMovementHistory.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const shortfall = plan.data?.shortfall ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Pick stock (FEFO)</CardTitle>
        <CardDescription className="text-xs">
          Consumes the soonest-expiring lots first. A short pick is refused
          rather than part-shipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products?.map((product) => (
                  <SelectItem key={product.id} value={String(product.id)}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse" />
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

          <div className="space-y-1">
            <Label className="text-xs">Quantity</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Reference #</Label>
            <Input
              type="number"
              min="0"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Order id"
            />
          </div>
        </div>

        {ready && plan.isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {ready && plan.data && (
          <div className="space-y-3">
            {plan.data.allocations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No pickable lots for this product at this warehouse.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Take</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.data.allocations.map((allocation) => (
                    <TableRow key={allocation.lotId}>
                      <TableCell className="font-medium">
                        {allocation.lotCode ?? `Lot #${allocation.lotId}`}
                      </TableCell>
                      <TableCell>
                        {allocation.expiryDate
                          ? new Date(allocation.expiryDate).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {allocation.quantity}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {shortfall > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Short by {shortfall} — not enough available stock to cover this pick.
              </div>
            )}

            <Button
              disabled={
                shortfall > 0 ||
                plan.data.allocations.length === 0 ||
                reference === "" ||
                pick.isPending
              }
              onClick={() =>
                pick.mutate({
                  productId: Number(productId),
                  warehouseId: Number(warehouseId),
                  quantity: Number(quantity),
                  referenceType: "manual",
                  referenceId: Number(reference),
                  fromStatus: "available",
                })
              }
            >
              {pick.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="mr-2 h-4 w-4" />
              )}
              Ship this pick
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
