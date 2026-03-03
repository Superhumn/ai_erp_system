import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ClipboardCheck,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpDown,
} from "lucide-react";

export default function ReconciliationReport() {
  const [channel, setChannel] = useState<"shopify" | "amazon" | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: runs, isLoading, refetch } = trpc.reconciliation.list.useQuery(
    statusFilter === "all" ? { channel } : { channel, status: statusFilter as any }
  );

  const runReconciliation = trpc.reconciliation.run.useMutation({
    onSuccess: () => {
      toast.success("Reconciliation started");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case "running":
        return <Badge className="bg-blue-500/10 text-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/10 text-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-8 w-8" />
            Inventory Reconciliation
          </h1>
          <p className="text-muted-foreground">Compare ERP inventory with external channels and identify discrepancies</p>
        </div>
        <Button
          onClick={() => runReconciliation.mutate({ channel })}
          disabled={runReconciliation.isPending}
        >
          {runReconciliation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Run Reconciliation
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="amazon">Amazon</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation History</CardTitle>
          <CardDescription>Past and current reconciliation runs</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No reconciliation runs yet</p>
              <p className="text-sm mt-1">Run a reconciliation to compare inventory across channels</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <ArrowUpDown className="h-3 w-3" /> Discrepancies
                    </span>
                  </TableHead>
                  <TableHead>Total Items</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run: any) => (
                  <ReconciliationRunRow key={run.id} run={run} getStatusBadge={getStatusBadge} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReconciliationRunRow({ run, getStatusBadge }: { run: any; getStatusBadge: (s: string) => JSX.Element }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = trpc.reconciliation.getById.useQuery(
    { id: run.id },
    { enabled: expanded }
  );

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="font-mono">#{run.id}</TableCell>
        <TableCell>
          <Badge variant="outline">{run.channel || "all"}</Badge>
        </TableCell>
        <TableCell>{getStatusBadge(run.status)}</TableCell>
        <TableCell>
          {run.discrepancyCount > 0 ? (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <AlertTriangle className="h-4 w-4" />
              {run.discrepancyCount}
            </span>
          ) : run.status === "completed" ? (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              None
            </span>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell>{run.totalItems || "—"}</TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
        </TableCell>
      </TableRow>
      {expanded && detail?.lines && detail.lines.length > 0 && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <div className="text-sm font-medium mb-2">Line Items</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>ERP Qty</TableHead>
                  <TableHead>Channel Qty</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.lines.map((line: any) => {
                  const variance = (line.erpQuantity || 0) - (line.channelQuantity || 0);
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.productName || `Product #${line.productId}`}</TableCell>
                      <TableCell className="font-mono text-xs">{line.sku || "—"}</TableCell>
                      <TableCell>{line.erpQuantity}</TableCell>
                      <TableCell>{line.channelQuantity}</TableCell>
                      <TableCell className={variance !== 0 ? "text-amber-600 font-medium" : "text-green-600"}>
                        {variance > 0 ? `+${variance}` : variance}
                      </TableCell>
                      <TableCell>
                        {variance === 0 ? (
                          <Badge className="bg-green-500/10 text-green-600">Match</Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-600">Mismatch</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
