import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  RefreshCw,
  ShoppingCart,
  Store,
  Globe,
  Truck,
  DollarSign,
  Users,
  TrendingUp,
  Megaphone,
  BarChart3,
} from "lucide-react";

export default function ChannelAnalytics() {
  // Queries
  const { data: channels, refetch: refetchChannels } = trpc.fpa.channels.list.useQuery();
  const { data: channelSummary, refetch: refetchSummary } = trpc.fpa.channels.getSummary.useQuery();
  const { data: marketingData, refetch: refetchMarketing } = trpc.fpa.marketing.list.useQuery();

  const handleRefresh = () => {
    refetchChannels();
    refetchSummary();
    refetchMarketing();
    toast.success("Channel data refreshed.");
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

  const formatPct = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return `${num.toFixed(1)}%`;
  };

  const getChannelIcon = (channel: string) => {
    const lower = (channel || "").toLowerCase();
    if (lower.includes("dtc") || lower.includes("shopify")) return <Globe className="h-5 w-5" />;
    if (lower.includes("amazon")) return <ShoppingCart className="h-5 w-5" />;
    if (lower.includes("wholesale")) return <Truck className="h-5 w-5" />;
    if (lower.includes("retail")) return <Store className="h-5 w-5" />;
    return <BarChart3 className="h-5 w-5" />;
  };

  const channelList = channels || [];
  const marketingList = marketingData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Channel Analytics</h1>
          <p className="text-muted-foreground">
            Multi-channel performance metrics, margins, and marketing efficiency
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Channel Performance Cards */}
      {channelList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {channelList.map((channel: any) => (
            <Card key={channel.id || channel.channelName}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {getChannelIcon(channel.channelName)}
                  {channel.channelName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Net Revenue</span>
                  <span className="font-medium">{formatCurrency(channel.netRevenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Margin</span>
                  <span className="font-medium text-green-600">
                    {formatPct(channel.grossMarginPct)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contribution Margin</span>
                  <span className="font-medium text-blue-600">
                    {formatPct(channel.contributionMarginPct)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Orders</span>
                  <span className="font-medium">
                    {Number(channel.orderCount || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">AOV</span>
                  <span className="font-medium">{formatCurrency(channel.aov)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">New Customers</span>
                  <span className="font-medium">
                    {Number(channel.newCustomers || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Returning</span>
                  <span className="font-medium">
                    {Number(channel.returningCustomers || 0).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="comparison" className="space-y-4">
        <TabsList>
          <TabsTrigger value="comparison" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Channel Comparison
          </TabsTrigger>
          <TabsTrigger value="marketing" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Marketing Spend
          </TabsTrigger>
        </TabsList>

        {/* Channel Comparison Table */}
        <TabsContent value="comparison">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Channel Comparison
              </CardTitle>
              <CardDescription>
                Side-by-side comparison of all channel metrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {channelList.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Net Revenue</TableHead>
                      <TableHead className="text-right">Gross Margin</TableHead>
                      <TableHead className="text-right">Contribution Margin</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">AOV</TableHead>
                      <TableHead className="text-right">New Customers</TableHead>
                      <TableHead className="text-right">Returning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channelList.map((channel: any) => (
                      <TableRow key={channel.id || channel.channelName}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {getChannelIcon(channel.channelName)}
                            {channel.channelName}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(channel.netRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatPct(channel.grossMarginPct)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatPct(channel.contributionMarginPct)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(channel.orderCount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(channel.aov)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(channel.newCustomers || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(channel.returningCustomers || 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals Row */}
                    {channelSummary && (
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(channelSummary.totalNetRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatPct(channelSummary.avgGrossMarginPct)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatPct(channelSummary.avgContributionMarginPct)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(channelSummary.totalOrders || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(channelSummary.overallAov)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(channelSummary.totalNewCustomers || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(channelSummary.totalReturningCustomers || 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No channel data available.</p>
                  <p className="text-sm">
                    Channel analytics will appear once sales data is available across channels.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketing Spend Tab */}
        <TabsContent value="marketing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                Marketing Spend by Channel
              </CardTitle>
              <CardDescription>
                Marketing investment and customer acquisition cost per channel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marketingList.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Marketing Spend</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                      <TableHead className="text-right">CAC</TableHead>
                      <TableHead className="text-right">New Customers</TableHead>
                      <TableHead className="text-right">Spend % of Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketingList.map((entry: any) => {
                      const spend = Number(entry.marketingSpend) || 0;
                      const revenue = Number(entry.revenue) || 0;
                      const roas = spend > 0 ? (revenue / spend).toFixed(2) : "-";
                      const spendPct = revenue > 0 ? ((spend / revenue) * 100).toFixed(1) : "0.0";
                      return (
                        <TableRow key={entry.id || entry.channelName}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {getChannelIcon(entry.channelName)}
                              {entry.channelName}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(entry.marketingSpend)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(entry.revenue)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {roas}x
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(entry.cac)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(entry.newCustomers || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {spendPct}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No marketing data available.</p>
                  <p className="text-sm">
                    Marketing spend and CAC data will appear once campaigns are tracked.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
