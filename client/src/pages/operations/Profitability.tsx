import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Badge } from "../../components/ui/badge";
import { CalendarIcon, Download, TrendingUp, TrendingDown, DollarSign, Package, Truck, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Profitability() {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().setMonth(new Date().getMonth() - 1)),
    to: new Date()
  });

  // Check QuickBooks connection
  const { data: qbStatus } = useQuery({
    queryKey: ['quickbooks-connection'],
    queryFn: () => trpc.quickbooks.getConnectionStatus.query(),
  });

  // Fetch product profitability data
  const { data: profitabilityData, isLoading: profitabilityLoading } = useQuery({
    queryKey: ['profitability', dateRange.from, dateRange.to],
    queryFn: () => trpc.cogs.profitability.query({
      startDate: dateRange.from,
      endDate: dateRange.to
    }),
    enabled: !!dateRange.from && !!dateRange.to
  });

  // Fetch inventory valuation
  const { data: valuationData, isLoading: valuationLoading } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => trpc.cogs.valuation.query()
  });

  // Calculate summary metrics
  const summary = profitabilityData?.reduce(
    (acc, item) => ({
      totalRevenue: acc.totalRevenue + (Number(item.totalRevenue) || 0),
      totalCOGS: acc.totalCOGS + (Number(item.totalCOGS) || 0),
      totalGrossProfit: acc.totalGrossProfit + (Number(item.totalGrossProfit) || 0),
    }),
    { totalRevenue: 0, totalCOGS: 0, totalGrossProfit: 0 }
  );

  const overallMargin = summary && summary.totalRevenue > 0
    ? ((summary.totalGrossProfit / summary.totalRevenue) * 100).toFixed(2)
    : '0.00';

  const totalInventoryValue = valuationData?.reduce(
    (acc, item) => acc + (Number(item.totalValue) || 0),
    0
  ) || 0;

  const formatCurrency = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  };

  const formatPercent = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return `${num.toFixed(2)}%`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Profitability & COGS Tracking</h1>
            {qbStatus?.connected ? (
              <Badge variant="success" className="gap-1">
                <DollarSign className="h-3 w-3" />
                QuickBooks Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                Local Data Only
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-2">
            Track cost of goods sold, profit margins, and inventory valuation across all products
          </p>
          {!qbStatus?.connected && (
            <p className="text-sm text-amber-600 mt-1">
              <Link href="/settings/quickbooks" className="underline inline-flex items-center gap-1">
                Connect QuickBooks <ExternalLink className="h-3 w-3" />
              </Link>
              {" "}to sync cost data and account mappings
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.from && dateRange.to
                  ? `${format(dateRange.from, 'MMM dd')} - ${format(dateRange.to, 'MMM dd, yyyy')}`
                  : 'Select date range'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{
                  from: dateRange.from,
                  to: dateRange.to
                }}
                onSelect={(range) => {
                  if (range) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              For selected period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total COGS</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.totalCOGS)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Cost of goods sold
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summary?.totalGrossProfit)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Margin: {overallMargin}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInventoryValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Current valuation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="profitability" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profitability">Product Profitability</TabsTrigger>
          <TabsTrigger value="valuation">Inventory Valuation</TabsTrigger>
        </TabsList>

        <TabsContent value="profitability" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Profitability Report</CardTitle>
              <CardDescription>
                Detailed profitability analysis by product including COGS and freight costs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profitabilityLoading ? (
                <div className="text-center py-8">Loading profitability data...</div>
              ) : profitabilityData && profitabilityData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Product Cost</TableHead>
                      <TableHead className="text-right">Freight Cost</TableHead>
                      <TableHead className="text-right">Total COGS</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityData.map((item) => {
                      const margin = Number(item.averageMargin) || 0;
                      const isPositive = margin > 0;
                      return (
                        <TableRow key={item.productId}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell className="text-muted-foreground">{item.productSku}</TableCell>
                          <TableCell className="text-right">{Number(item.totalQuantitySold || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.totalRevenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.totalProductCost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.totalFreightCost)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.totalCOGS)}</TableCell>
                          <TableCell className={`text-right font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(item.totalGrossProfit)}
                          </TableCell>
                          <TableCell className={`text-right ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            <div className="flex items-center justify-end gap-1">
                              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {formatPercent(margin)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No profitability data available for the selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="valuation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Valuation</CardTitle>
              <CardDescription>
                Current inventory value based on average cost method
              </CardDescription>
            </CardHeader>
            <CardContent>
              {valuationLoading ? (
                <div className="text-center py-8">Loading inventory valuation...</div>
              ) : valuationData && valuationData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valuationData.map((item, index) => (
                      <TableRow key={`${item.productId}-${item.warehouseId}-${index}`}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{item.productSku}</TableCell>
                        <TableCell>{item.warehouseName}</TableCell>
                        <TableCell className="text-right">{Number(item.quantity || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.averageCost)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.totalValue)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell colSpan={5} className="text-right">Total Inventory Value</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalInventoryValue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No inventory valuation data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
