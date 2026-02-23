import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";

export default function ReconciliationReport() {
  const [channel, setChannel] = useState<"shopify" | "amazon" | "all">("all");

  const { data: runs, isLoading, refetch } = trpc.reconciliation.list.useQuery({ channel });
  const runReconciliation = trpc.reconciliation.run.useMutation({
    onSuccess: () => {
      toast.success("Reconciliation completed");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const { data: runDetail } = trpc.reconciliation.getById.useQuery(
    { id: selectedRunId! },
    { enabled: !!selectedRunId }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case "running": return <Badge className="bg-blue-500"><Clock className="w-3 h-3 mr-1" /> Running</Badge>;
      case "failed": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getVarianceBadge = (variancePercent: string | null) => {
    const v = parseFloat(variancePercent || "0");
    if (Math.abs(v) <= 0.5) return <Badge className="bg-green-500">Pass</Badge>;
    if (Math.abs(v) <= 3) return <Badge className="bg-yellow-500"><AlertTriangle className="w-3 h-3 mr-1" /> Warning</Badge>;
    return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Critical</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory Reconciliation</h1>
          <p className="text-muted-foreground">Compare ERP inventory against channel inventory (Shopify, Amazon)</p>
        </div>
        <div className="flex gap-2">
          <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => runReconciliation.mutate({ channel })}
            disabled={runReconciliation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${runReconciliation.isPending ? "animate-spin" : ""}`} />
            Run Reconciliation
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {runDetail && runDetail.lines && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{runDetail.lines.length}</div>
              <p className="text-sm text-muted-foreground">SKUs Checked</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">
                {runDetail.lines.filter((l: any) => Math.abs(parseFloat(l.variancePercent || "0")) <= 0.5).length}
              </div>
              <p className="text-sm text-muted-foreground">Passed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-500">
                {runDetail.lines.filter((l: any) => { const v = Math.abs(parseFloat(l.variancePercent || "0")); return v > 0.5 && v <= 3; }).length}
              </div>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-500">
                {runDetail.lines.filter((l: any) => Math.abs(parseFloat(l.variancePercent || "0")) > 3).length}
              </div>
              <p className="text-sm text-muted-foreground">Critical</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reconciliation Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : !runs || runs.length === 0 ? (
            <p className="text-muted-foreground">No reconciliation runs yet. Click "Run Reconciliation" to start.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SKUs</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run: any) => (
                  <TableRow
                    key={run.id}
                    className={selectedRunId === run.id ? "bg-accent" : "cursor-pointer hover:bg-accent/50"}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <TableCell>#{run.id}</TableCell>
                    <TableCell>{run.channel || "all"}</TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell>{run.totalSkus || "-"}</TableCell>
                    <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelectedRunId(run.id)}>
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation Details */}
      {runDetail && runDetail.lines && (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Details - Run #{runDetail.id}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">ERP Qty</TableHead>
                  <TableHead className="text-right">Channel Qty</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runDetail.lines.map((line: any) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-mono">{line.sku}</TableCell>
                    <TableCell>{line.productName || "-"}</TableCell>
                    <TableCell className="text-right">{line.erpQuantity}</TableCell>
                    <TableCell className="text-right">{line.channelQuantity}</TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={parseFloat(line.delta || "0") !== 0 ? "text-red-500" : ""}>
                        {line.delta}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{parseFloat(line.variancePercent || "0").toFixed(2)}%</TableCell>
                    <TableCell>{getVarianceBadge(line.variancePercent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
