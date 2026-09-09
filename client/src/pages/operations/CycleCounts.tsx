import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ClipboardCheck, Plus, Loader2 } from "lucide-react";
import {
  CYCLE_COUNT_TYPES, CYCLE_COUNT_STATUSES, type CycleCountStatus, type CycleCountType,
} from "@shared/inventoryAdjustments";
import { STATUS_LABELS, STATUS_VARIANTS, TYPE_LABELS } from "./cycleCountLabels";
import { CycleCountDetail } from "./CycleCountDetail";

export default function CycleCounts() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({
    warehouseId: "",
    countType: "cycle" as CycleCountType,
    blindCount: true,
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: counts, isLoading } = trpc.cycleCounts.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter as CycleCountStatus } : undefined,
  );

  const createMutation = trpc.cycleCounts.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Count ${result.countNumber} created — generate lines to begin`);
      setCreateOpen(false);
      setForm({ warehouseId: "", countType: "cycle", blindCount: true, notes: "" });
      utils.cycleCounts.list.invalidate();
      setSelectedId(result.id);
    },
    onError: (error) => toast.error(error.message),
  });

  if (selectedId !== null) {
    return <CycleCountDetail countId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const warehouseName = (id: number) => warehouses?.find((w) => w.id === id)?.name ?? `Warehouse #${id}`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ClipboardCheck className="h-6 w-6" />
            Cycle Counts
          </h1>
          <p className="text-sm text-muted-foreground">
            Verify book quantity against physical stock. Approving a count posts each variance
            to the inventory ledger.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New count
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>All counts</CardTitle>
            <CardDescription>{counts?.length ?? 0} count(s)</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CYCLE_COUNT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !counts?.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No counts yet. Create one to start verifying stock.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Count</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((count) => (
                  <TableRow key={count.id}>
                    <TableCell className="font-mono">{count.countNumber}</TableCell>
                    <TableCell>{warehouseName(count.warehouseId)}</TableCell>
                    <TableCell>
                      {TYPE_LABELS[count.countType as CycleCountType]}
                      {count.blindCount && (
                        <Badge variant="outline" className="ml-2">Blind</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[count.status as CycleCountStatus]}>
                        {STATUS_LABELS[count.status as CycleCountStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(count.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(count.id)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New cycle count</DialogTitle>
            <DialogDescription>
              Book quantities are snapshotted when you generate the count lines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cc-warehouse">Location</Label>
              <Select
                value={form.warehouseId}
                onValueChange={(v) => setForm({ ...form, warehouseId: v })}
              >
                <SelectTrigger id="cc-warehouse">
                  <SelectValue placeholder="Select a warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((w) => (
                    <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-type">Count type</Label>
              <Select
                value={form.countType}
                onValueChange={(v) => setForm({ ...form, countType: v as CycleCountType })}
              >
                <SelectTrigger id="cc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLE_COUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="cc-blind">Blind count</Label>
                <p className="text-sm text-muted-foreground">
                  Hide book quantity from counters until review.
                </p>
              </div>
              <Switch
                id="cc-blind"
                checked={form.blindCount}
                onCheckedChange={(v) => setForm({ ...form, blindCount: v })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-notes">Notes</Label>
              <Textarea
                id="cc-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional context for the counting team"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.warehouseId || createMutation.isPending}
              onClick={() => createMutation.mutate({
                warehouseId: Number(form.warehouseId),
                countType: form.countType,
                blindCount: form.blindCount,
                notes: form.notes || undefined,
              })}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
