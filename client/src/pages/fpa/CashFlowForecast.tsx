import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Loader2,
  Sparkles,
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  TrendingUp,
  Lightbulb,
  Banknote,
} from "lucide-react";

export default function CashFlowForecast() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedForecastId, setSelectedForecastId] = useState<number | null>(null);
  const [newForecast, setNewForecast] = useState({
    name: "",
    forecastPeriod: "4",
    periodType: "weekly",
    startDate: "",
  });

  // Queries
  const { data: forecasts, refetch: refetchForecasts } = trpc.fpa.cashFlow.list.useQuery();

  // Mutations
  const createForecastMutation = trpc.fpa.cashFlow.create.useMutation({
    onSuccess: () => {
      toast.success("Cash flow forecast created.");
      refetchForecasts();
      setShowCreateDialog(false);
      setNewForecast({ name: "", forecastPeriod: "4", periodType: "weekly", startDate: "" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const generateMutation = trpc.fpa.cashFlow.generate.useMutation({
    onSuccess: () => {
      toast.success("AI cash flow forecast generated with recommendations.");
      refetchForecasts();
      setIsGenerating(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsGenerating(false);
    },
  });

  const handleCreate = () => {
    createForecastMutation.mutate({
      name: newForecast.name,
      forecastPeriods: parseInt(newForecast.forecastPeriod),
      periodType: newForecast.periodType,
      startDate: newForecast.startDate,
    });
  };

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

  const selectedForecast = forecasts?.find((f: any) => f.id === selectedForecastId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cash Flow Forecasting</h1>
          <p className="text-muted-foreground">
            Project cash inflows, outflows, and net position over time
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchForecasts()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate AI Cash Flow Forecast
              </>
            )}
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Forecast
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Cash Flow Forecast</DialogTitle>
                <DialogDescription>
                  Set up a new cash flow projection for upcoming periods.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Forecast Name</Label>
                  <Input
                    placeholder="Q2 2026 Cash Flow Projection"
                    value={newForecast.name}
                    onChange={(e) => setNewForecast({ ...newForecast, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Period Type</Label>
                  <Select
                    value={newForecast.periodType}
                    onValueChange={(v) => setNewForecast({ ...newForecast, periodType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Number of Periods</Label>
                  <Select
                    value={newForecast.forecastPeriod}
                    onValueChange={(v) => setNewForecast({ ...newForecast, forecastPeriod: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 periods</SelectItem>
                      <SelectItem value="8">8 periods</SelectItem>
                      <SelectItem value="12">12 periods</SelectItem>
                      <SelectItem value="13">13 periods</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={newForecast.startDate}
                    onChange={(e) => setNewForecast({ ...newForecast, startDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createForecastMutation.isPending || !newForecast.name}
                >
                  {createForecastMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Forecast"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Forecast List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Cash Flow Forecasts
          </CardTitle>
          <CardDescription>
            View all cash flow projections and their summaries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forecasts && forecasts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Opening Balance</TableHead>
                  <TableHead className="text-right">Total Inflows</TableHead>
                  <TableHead className="text-right">Total Outflows</TableHead>
                  <TableHead className="text-right">Closing Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecasts.map((forecast: any) => {
                  const netCash =
                    (Number(forecast.totalInflows) || 0) - (Number(forecast.totalOutflows) || 0);
                  return (
                    <TableRow key={forecast.id}>
                      <TableCell className="font-medium">{forecast.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{forecast.periodType}</Badge>
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
                      <TableCell className="text-right">
                        {formatCurrency(forecast.openingBalance)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(forecast.totalInflows)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatCurrency(forecast.totalOutflows)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          Number(forecast.closingBalance) >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(forecast.closingBalance)}
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
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No cash flow forecasts yet.</p>
              <p className="text-sm">
                Create a forecast or generate one with AI to project cash position.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Forecast Detail */}
      {selectedForecast && (
        <>
          {/* Cash Position Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Opening Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {formatCurrency(selectedForecast.openingBalance)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Inflows
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="h-4 w-4 text-green-500" />
                  <span className="text-2xl font-bold text-green-600">
                    {formatCurrency(selectedForecast.totalInflows)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Outflows
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="h-4 w-4 text-red-500" />
                  <span className="text-2xl font-bold text-red-600">
                    {formatCurrency(selectedForecast.totalOutflows)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net Cash Flow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-2xl font-bold text-blue-600">
                    {formatCurrency(
                      (Number(selectedForecast.totalInflows) || 0) -
                        (Number(selectedForecast.totalOutflows) || 0)
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Closing Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span
                    className={`text-2xl font-bold ${
                      Number(selectedForecast.closingBalance) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(selectedForecast.closingBalance)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Weekly Breakdown */}
          {selectedForecast.weeklyBreakdown && selectedForecast.weeklyBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Period Breakdown</CardTitle>
                <CardDescription>
                  Detailed cash flow by period for {selectedForecast.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">Inflows</TableHead>
                      <TableHead className="text-right">Outflows</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Closing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedForecast.weeklyBreakdown.map((week: any, idx: number) => {
                      const net = (Number(week.inflows) || 0) - (Number(week.outflows) || 0);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{week.period || `Week ${idx + 1}`}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(week.openingBalance)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(week.inflows)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(week.outflows)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              net >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(net)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(week.closingBalance)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* AI Recommendations */}
          {selectedForecast.aiRecommendations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  AI Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedForecast.aiRecommendations}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
