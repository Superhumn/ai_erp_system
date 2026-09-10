import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, Loader2 } from "lucide-react";

type Urgency = "stockout" | "urgent" | "soon" | "ok" | "no_demand";

const URGENCY_LABELS: Record<Urgency, string> = {
  stockout: "Out of stock",
  urgent: "Order now",
  soon: "Order soon",
  ok: "In good shape",
  no_demand: "No demand",
};

const URGENCY_VARIANTS: Record<Urgency, "destructive" | "secondary" | "outline"> = {
  stockout: "destructive",
  urgent: "destructive",
  soon: "secondary",
  ok: "outline",
  no_demand: "outline",
};

const WINDOWS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last year" },
];

/**
 * Replenishment planning.
 *
 * Reordering was hand-entered levels plus a low-stock notification that fired
 * after the fact and ignored stock already on order. This page computes what to
 * order from demand, vendor lead time, and what is already inbound — and shows
 * its reasoning next to every number, because a suggestion a buyer cannot
 * check is a suggestion they will not trust.
 */
export default function Replenishment() {
  const [windowDays, setWindowDays] = useState("90");
  const [warehouseId, setWarehouseId] = useState("all");
  const [onlyActionable, setOnlyActionable] = useState(true);

  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const plan = trpc.inventory.replenishmentPlan.useQuery({
    windowDays: Number(windowDays),
    onlyActionable,
    ...(warehouseId !== "all" ? { warehouseId: Number(warehouseId) } : {}),
  });

  const rows = plan.data ?? [];
  const toOrder = rows.filter((row) => row.shouldOrder).length;

  const warehouseName = (id: number | null) =>
    warehouses?.find((w) => w.id === id)?.name ?? (id ? `Warehouse #${id}` : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.02em]">
            Replenishment
          </h2>
          <p className="text-xs text-muted-foreground">
            What to order, how much, and why — from demand, lead time, and stock
            already on order.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Demand window</Label>
            <Select value={windowDays} onValueChange={setWindowDays}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOWS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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

          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="actionable"
              checked={onlyActionable}
              onCheckedChange={setOnlyActionable}
            />
            <Label htmlFor="actionable" className="text-xs">
              Needs ordering only
            </Label>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {toOrder === 0
              ? "Nothing needs ordering"
              : `${toOrder} line${toOrder === 1 ? "" : "s"} to order`}
          </CardTitle>
          <CardDescription className="text-xs">
            Demand is split across the warehouses stocking each product. A
            reorder level set by hand overrides the computed one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plan.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {onlyActionable
                ? "Every stocked product is above its reorder point."
                : "No stocked products to plan."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">On order</TableHead>
                  <TableHead className="text-right">Demand/day</TableHead>
                  <TableHead className="text-right">Cover</TableHead>
                  <TableHead className="text-right">Reorder pt</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.inventoryId}>
                    <TableCell>
                      <div className="font-medium">{row.productName}</div>
                      <div className="text-xs text-muted-foreground">{row.sku}</div>
                    </TableCell>
                    <TableCell>{warehouseName(row.warehouseId)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.available}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.onOrder || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.dailyDemand || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.daysOfCover === null ? "—" : `${row.daysOfCover}d`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {row.reorderPoint}
                        {row.reorderPointIsManual && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                set
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Set by hand — overrides the computed reorder point.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {row.suggestedQuantity || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.vendorName ?? (
                        <span className="text-muted-foreground">No vendor</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <Badge variant={URGENCY_VARIANTS[row.urgency as Urgency]}>
                          {URGENCY_LABELS[row.urgency as Urgency]}
                        </Badge>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {row.rationale}
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
