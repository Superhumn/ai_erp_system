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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, ScanLine, Search } from "lucide-react";

type SerialStatus = "in_stock" | "allocated" | "shipped" | "returned" | "scrapped";

const STATUS_LABELS: Record<SerialStatus, string> = {
  in_stock: "In stock",
  allocated: "Allocated",
  shipped: "Shipped",
  returned: "Returned",
  scrapped: "Scrapped",
};

const STATUS_VARIANTS: Record<SerialStatus, "outline" | "secondary" | "destructive"> = {
  in_stock: "outline",
  allocated: "secondary",
  shipped: "secondary",
  returned: "secondary",
  scrapped: "destructive",
};

/** Mirrors the transitions the server enforces, so the UI cannot offer an illegal one. */
const NEXT_STATUSES: Record<SerialStatus, SerialStatus[]> = {
  in_stock: ["allocated", "shipped", "scrapped"],
  allocated: ["shipped", "in_stock", "scrapped"],
  shipped: ["returned"],
  returned: ["in_stock", "scrapped"],
  scrapped: [],
};

/**
 * Serial numbers — unit-level tracking.
 *
 * Lots answer "which batch did this come from". Serials answer "where is this
 * exact unit now", which is the question a warranty claim or a targeted recall
 * actually asks. Nothing tracked units before this.
 */
export default function SerialNumbers() {
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [traceOf, setTraceOf] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const serials = trpc.serials.list.useQuery({
    ...(status !== "all" ? { status: status as SerialStatus } : {}),
    ...(search ? { search } : {}),
    limit: 200,
  });

  const updateStatus = trpc.serials.updateStatus.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.fromStatus} → ${result.toStatus}`);
      utils.serials.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = serials.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.02em]">
            <ScanLine className="h-4 w-4" />
            Serial Numbers
          </h2>
          <p className="text-xs text-muted-foreground">
            Where each individual unit is, and everywhere it has been.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-[200px] pl-7"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Serial number"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as SerialStatus[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {STATUS_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={() => setReceiveOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Receive serials
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {rows.length} serial{rows.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription className="text-xs">
            A serial is unique per product — receiving one twice is refused,
            because a duplicate makes the whole trace worthless.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serials.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No serials match.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Bin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Move to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const next = NEXT_STATUSES[row.status as SerialStatus] ?? [];
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <button
                          className="font-medium underline-offset-2 hover:underline"
                          onClick={() => setTraceOf(row.serialNumber)}
                        >
                          {row.serialNumber}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div>{row.productName}</div>
                        <div className="text-xs text-muted-foreground">{row.sku}</div>
                      </TableCell>
                      <TableCell>{row.lotCode ?? "—"}</TableCell>
                      <TableCell>{row.binCode ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[row.status as SerialStatus]}>
                          {STATUS_LABELS[row.status as SerialStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {next.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Final
                          </span>
                        ) : (
                          <Select
                            value=""
                            onValueChange={(value) =>
                              updateStatus.mutate({
                                serialId: row.id,
                                toStatus: value as SerialStatus,
                              })
                            }
                          >
                            <SelectTrigger className="ml-auto w-[130px]">
                              <SelectValue placeholder="Change" />
                            </SelectTrigger>
                            <SelectContent>
                              {next.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {STATUS_LABELS[option]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ReceiveDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        onSaved={() => utils.serials.list.invalidate()}
      />
      <TraceDialog
        serialNumber={traceOf}
        onClose={() => setTraceOf(null)}
      />
    </div>
  );
}

function ReceiveDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [raw, setRaw] = useState("");

  const { data: products } = trpc.products.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();

  // One per line or comma-separated — whichever a scanner or a spreadsheet gives.
  const parsed = [
    ...new Set(raw.split(/[\n,]/).map((value) => value.trim()).filter(Boolean)),
  ];

  const receive = trpc.serials.receive.useMutation({
    onSuccess: (result) => {
      toast.success(`Recorded ${result.received} serial(s)`);
      setRaw("");
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive serial numbers</DialogTitle>
          <DialogDescription>
            One per line, or comma separated. Duplicates within the paste are
            collapsed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
                <SelectValue placeholder="Optional" />
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
            <Label className="text-xs">
              Serial numbers {parsed.length > 0 && `(${parsed.length})`}
            </Label>
            <Textarea
              rows={6}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={"SN-0001\nSN-0002"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!productId || parsed.length === 0 || receive.isPending}
            onClick={() =>
              receive.mutate({
                productId: Number(productId),
                serialNumbers: parsed,
                ...(warehouseId ? { warehouseId: Number(warehouseId) } : {}),
                sourceType: "manual",
              })
            }
          >
            {receive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Receive {parsed.length > 0 ? parsed.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TraceDialog({
  serialNumber, onClose,
}: {
  serialNumber: string | null;
  onClose: () => void;
}) {
  const trace = trpc.serials.trace.useQuery(
    { serialNumber: serialNumber ?? "" },
    { enabled: serialNumber !== null },
  );

  return (
    <Dialog open={serialNumber !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{serialNumber}</DialogTitle>
          <DialogDescription>
            Where this unit is now, and every move it made.
          </DialogDescription>
        </DialogHeader>

        {trace.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !trace.data ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No record for this serial.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Status">
                {STATUS_LABELS[trace.data.serial.status as SerialStatus]}
              </Field>
              <Field label="Lot">{trace.data.lot?.lotCode ?? "—"}</Field>
              <Field label="Bin">{trace.data.serial.binCode ?? "—"}</Field>
              <Field label="Expiry">
                {trace.data.lot?.expiryDate
                  ? new Date(trace.data.lot.expiryDate).toLocaleDateString()
                  : "—"}
              </Field>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.data.events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs">
                      {new Date(event.performedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {event.fromStatus ? `${event.fromStatus} → ` : ""}
                      {event.toStatus}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.referenceType
                        ? `${event.referenceType}${event.referenceId ? ` #${event.referenceId}` : ""}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
