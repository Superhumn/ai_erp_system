import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  RefreshCw,
  Loader2,
  Sparkles,
  Package,
  AlertTriangle,
  Clock,
  DollarSign,
  BarChart3,
} from "lucide-react";

export default function InventoryAging() {
  const [isGenerating, setIsGenerating] = useState(false);

  // Queries
  const { data: agingData, refetch: refetchAging } = trpc.fpa.inventoryAging.list.useQuery();

  // Mutations
  const generateMutation = trpc.fpa.inventoryAging.generate.useMutation({
    onSuccess: () => {
      toast.success("Inventory aging report generated.");
      refetchAging();
      setIsGenerating(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateMutation.mutate({});
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const getRiskBadge = (risk: string) => {
    const config: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline" }
    > = {
      low: { variant: "secondary" },
      medium: { variant: "outline" },
      high: { variant: "default" },
      critical: { variant: "destructive" },
    };
    const c = config[risk] || { variant: "secondary" };
    return (
      <Badge variant={c.variant} className="capitalize">
        {risk === "critical" && <AlertTriangle className="h-3 w-3 mr-1" />}
        {risk}
      </Badge>
    );
  };

  const items = agingData?.items || agingData || [];
  const summary = agingData?.summary || null;

  const totalValue = summary?.totalInventoryValue ||
    items.reduce((sum: number, item: any) => sum + (Number(item.totalValue) || 0), 0);
  const avgAgeDays = summary?.avgAgeDays ||
    (items.length > 0
      ? (items.reduce((sum: number, item: any) => sum + (Number(item.avgAgeDays) || 0), 0) / items.length).toFixed(0)
      : 0);
  const itemsAtRisk = summary?.itemsAtRisk ||
    items.filter((item: any) => item.riskLevel === "high" || item.riskLevel === "critical").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory Aging Analysis</h1>
          <p className="text-muted-foreground">
            Analyze inventory age distribution and identify at-risk stock
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchAging()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Aging Report
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Inventory Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{formatCurrency(totalValue)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Age (Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{avgAgeDays}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Items at Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-2xl font-bold text-orange-600">{itemsAtRisk}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Aging Breakdown by Product
          </CardTitle>
          <CardDescription>
            Inventory quantity and value distributed across aging buckets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">Product</TableHead>
                    <TableHead className="text-right">0-30 Days</TableHead>
                    <TableHead className="text-right">31-60 Days</TableHead>
                    <TableHead className="text-right">61-90 Days</TableHead>
                    <TableHead className="text-right">91-120 Days</TableHead>
                    <TableHead className="text-right">121-180 Days</TableHead>
                    <TableHead className="text-right">180+ Days</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Days of Supply</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: any) => (
                    <TableRow key={item.id || item.productId}>
                      <TableCell className="font-medium sticky left-0 bg-background">
                        <div>
                          <div>{item.productName || item.name}</div>
                          {item.sku && (
                            <div className="text-xs text-muted-foreground">{item.sku}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{item.qty_0_30 ?? item.bucket_0_30?.qty ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.val_0_30 ?? item.bucket_0_30?.value)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{item.qty_31_60 ?? item.bucket_31_60?.qty ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.val_31_60 ?? item.bucket_31_60?.value)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{item.qty_61_90 ?? item.bucket_61_90?.qty ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.val_61_90 ?? item.bucket_61_90?.value)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{item.qty_91_120 ?? item.bucket_91_120?.qty ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.val_91_120 ?? item.bucket_91_120?.value)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{item.qty_121_180 ?? item.bucket_121_180?.qty ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.val_121_180 ?? item.bucket_121_180?.value)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{item.qty_180_plus ?? item.bucket_180_plus?.qty ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.val_180_plus ?? item.bucket_180_plus?.value)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.totalValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.daysOfSupply != null ? `${item.daysOfSupply}d` : "-"}
                      </TableCell>
                      <TableCell>{getRiskBadge(item.riskLevel || "low")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No inventory aging data available.</p>
              <p className="text-sm">
                Click "Generate Aging Report" to analyze current inventory age distribution.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
