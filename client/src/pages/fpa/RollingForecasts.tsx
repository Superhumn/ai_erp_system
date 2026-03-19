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
  TrendingUp,
  DollarSign,
  BarChart3,
  Calendar,
  Percent,
} from "lucide-react";

export default function RollingForecasts() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedForecastId, setSelectedForecastId] = useState<number | null>(null);

  // Queries
  const { data: forecasts, refetch: refetchForecasts } = trpc.fpa.rollingForecasts.list.useQuery();

  // Mutations
  const generateMutation = trpc.fpa.rollingForecasts.generate.useMutation({
    onSuccess: () => {
      toast.success("Rolling forecast generated with monthly P&L projections.");
      refetchForecasts();
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

  const formatPct = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return `${num.toFixed(1)}%`;
  };

  const selectedForecast = forecasts?.find((f: any) => f.id === selectedForecastId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rolling Forecasts</h1>
          <p className="text-muted-foreground">
            Continuously updated financial forecasts with monthly P&L projections
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchForecasts()}>
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
                Generate Rolling Forecast
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Forecast List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Rolling Forecasts
          </CardTitle>
          <CardDescription>
            Select a forecast to view the detailed monthly P&L breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forecasts && forecasts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Forecast</TableHead>
                  <TableHead>Horizon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Revenue</TableHead>
                  <TableHead className="text-right">Gross Margin</TableHead>
                  <TableHead className="text-right">EBITDA Margin</TableHead>
                  <TableHead className="text-right">Net Income</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecasts.map((forecast: any) => (
                  <TableRow key={forecast.id}>
                    <TableCell className="font-medium">{forecast.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <Calendar className="h-3 w-3 mr-1" />
                        {forecast.horizonMonths || 12} months
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          forecast.status === "active"
                            ? "default"
                            : forecast.status === "draft"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {forecast.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(forecast.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatPct(forecast.grossMarginPct)}
                    </TableCell>
                    <TableCell className="text-right text-blue-600">
                      {formatPct(forecast.ebitdaMarginPct)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        Number(forecast.totalNetIncome) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(forecast.totalNetIncome)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedForecastId(forecast.id)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No rolling forecasts generated yet.</p>
              <p className="text-sm">
                Click "Generate Rolling Forecast" to create AI-powered monthly projections.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Forecast Detail */}
      {selectedForecast && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {formatCurrency(selectedForecast.totalRevenue)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Gross Margin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-green-500" />
                  <span className="text-2xl font-bold text-green-600">
                    {formatPct(selectedForecast.grossMarginPct)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  EBITDA Margin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-2xl font-bold text-blue-600">
                    {formatPct(selectedForecast.ebitdaMarginPct)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net Income
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span
                    className={`text-2xl font-bold ${
                      Number(selectedForecast.totalNetIncome) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(selectedForecast.totalNetIncome)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly P&L Table */}
          {selectedForecast.monthlyData && selectedForecast.monthlyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Monthly P&L Projections</CardTitle>
                <CardDescription>
                  Month-by-month financial projections for {selectedForecast.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background">Line Item</TableHead>
                        {selectedForecast.monthlyData.map((month: any, idx: number) => (
                          <TableHead key={idx} className="text-right min-w-[120px]">
                            {month.month || `Month ${idx + 1}`}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium sticky left-0 bg-background">
                          Revenue
                        </TableCell>
                        {selectedForecast.monthlyData.map((month: any, idx: number) => (
                          <TableCell key={idx} className="text-right">
                            {formatCurrency(month.revenue)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium sticky left-0 bg-background">
                          COGS
                        </TableCell>
                        {selectedForecast.monthlyData.map((month: any, idx: number) => (
                          <TableCell key={idx} className="text-right text-red-600">
                            {formatCurrency(month.cogs)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="font-bold sticky left-0 bg-muted/30">
                          Gross Profit
                        </TableCell>
                        {selectedForecast.monthlyData.map((month: any, idx: number) => (
                          <TableCell key={idx} className="text-right font-bold text-green-600">
                            {formatCurrency(month.grossProfit)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium sticky left-0 bg-background">
                          OpEx
                        </TableCell>
                        {selectedForecast.monthlyData.map((month: any, idx: number) => (
                          <TableCell key={idx} className="text-right">
                            {formatCurrency(month.opex)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="font-bold sticky left-0 bg-muted/30">
                          EBITDA
                        </TableCell>
                        {selectedForecast.monthlyData.map((month: any, idx: number) => (
                          <TableCell key={idx} className="text-right font-bold text-blue-600">
                            {formatCurrency(month.ebitda)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="border-t-2">
                        <TableCell className="font-bold sticky left-0 bg-background">
                          Net Income
                        </TableCell>
                        {selectedForecast.monthlyData.map((month: any, idx: number) => {
                          const ni = Number(month.netIncome) || 0;
                          return (
                            <TableCell
                              key={idx}
                              className={`text-right font-bold ${
                                ni >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {formatCurrency(ni)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
