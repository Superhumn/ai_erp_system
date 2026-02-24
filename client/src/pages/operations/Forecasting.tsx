import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
import { AITriggerButton } from "@/components/FloatingAIAssistant";
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Package, 
  ShoppingCart, 
  CheckCircle, 
  XCircle, 
  Loader2,
  RefreshCw,
  FileText,
  AlertTriangle,
  Sparkles,
  Clock,
  Truck,
  Calendar
} from "lucide-react";

export default function Forecasting() {
  const [isGeneratingForecast, setIsGeneratingForecast] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isGeneratingPOs, setIsGeneratingPOs] = useState(false);
  const [selectedForecastId, setSelectedForecastId] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [forecastMonths, setForecastMonths] = useState("3");
  const [showForecastDialog, setShowForecastDialog] = useState(false);

  // Queries
  const { data: dashboardData, refetch: refetchDashboard } = trpc.forecasting.getDashboardSummary.useQuery();
  const { data: forecasts, refetch: refetchForecasts } = trpc.forecasting.getForecasts.useQuery({});
  const { data: productionPlans, refetch: refetchPlans } = trpc.forecasting.getProductionPlans.useQuery({});
  const { data: suggestedPOs, refetch: refetchSuggestedPOs } = trpc.forecasting.getSuggestedPOs.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});

  // Mutations
  const generateForecastMutation = trpc.forecasting.generateForecast.useMutation({
    onSuccess: (data) => {
      toast.success(`Created ${data.count} demand forecasts using AI analysis.`);
      refetchForecasts();
      refetchDashboard();
      setIsGeneratingForecast(false);
      setShowForecastDialog(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsGeneratingForecast(false);
    }
  });

  const generatePlanMutation = trpc.forecasting.generateProductionPlan.useMutation({
    onSuccess: (data) => {
      toast.success(`Plan ${data.planNumber} created with material requirements.`);
      refetchPlans();
      refetchDashboard();
      setIsGeneratingPlan(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsGeneratingPlan(false);
    }
  });

  const generateSuggestedPOsMutation = trpc.forecasting.generateSuggestedPOs.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.count} suggested POs for approval.`);
      refetchSuggestedPOs();
      refetchDashboard();
      setIsGeneratingPOs(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsGeneratingPOs(false);
    }
  });

  const approvePOMutation = trpc.forecasting.approveSuggestedPO.useMutation({
    onSuccess: (data) => {
      toast.success(`Created purchase order ${data.poNumber}.`);
      refetchSuggestedPOs();
      refetchDashboard();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const rejectPOMutation = trpc.forecasting.rejectSuggestedPO.useMutation({
    onSuccess: () => {
      toast.success("Suggested purchase order has been rejected.");
      refetchSuggestedPOs();
      refetchDashboard();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleGenerateForecast = () => {
    setIsGeneratingForecast(true);
    generateForecastMutation.mutate({
      forecastMonths: parseInt(forecastMonths),
      historyMonths: 12,
    });
  };

  const handleGeneratePlan = (forecastId: number) => {
    setIsGeneratingPlan(true);
    setSelectedForecastId(forecastId);
    generatePlanMutation.mutate({
      demandForecastId: forecastId,
      safetyStockPercent: 20,
    });
  };

  const handleGenerateSuggestedPOs = (planId: number) => {
    setIsGeneratingPOs(true);
    setSelectedPlanId(planId);
    generateSuggestedPOsMutation.mutate({
      productionPlanId: planId,
    });
  };

  const handleApprovePO = (poId: number) => {
    approvePOMutation.mutate({ id: poId });
  };

  const handleRejectPO = (poId: number) => {
    rejectPOMutation.mutate({ id: poId });
  };

  const getTrendIcon = (trend?: string | null) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      draft: "secondary",
      pending: "outline",
      approved: "default",
      rejected: "destructive",
      converted: "default",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Production Forecasting</h1>
          <p className="text-muted-foreground">Predict demand and auto-generate purchase orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { refetchDashboard(); refetchForecasts(); refetchPlans(); refetchSuggestedPOs(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showForecastDialog} onOpenChange={setShowForecastDialog}>
            <DialogTrigger asChild>
              <Button>
                <Brain className="h-4 w-4 mr-2" />
                Generate AI Forecast
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Demand Forecast</DialogTitle>
                <DialogDescription>
                  Use AI to analyze historical sales data and predict future demand for your products.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Forecast Period (months ahead)</Label>
                  <Select value={forecastMonths} onValueChange={setForecastMonths}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 month</SelectItem>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                  The AI will analyze up to 12 months of historical sales data to generate forecasts for all {products?.length || 0} products.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForecastDialog(false)}>Cancel</Button>
                <Button onClick={handleGenerateForecast} disabled={isGeneratingForecast}>
                  {isGeneratingForecast ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Forecasts
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Dashboard Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Forecasts</CardTitle>
            <AITriggerButton message="Enhance our demand forecasting - analyze historical patterns, identify seasonal trends, and generate AI-powered predictions" label="AI Forecast Analysis" />
          </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.activeForecasts || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.pendingPlans || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Suggested POs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{dashboardData?.pendingSuggestedPOs || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Forecasted Demand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.totalForecastedDemand?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">units</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending PO Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${dashboardData?.totalPendingPOValue?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="suggested-pos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suggested-pos" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Suggested POs ({suggestedPOs?.filter(po => po.status === 'pending').length || 0})
          </TabsTrigger>
          <TabsTrigger value="forecasts" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Forecasts
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Production Plans
          </TabsTrigger>
        </TabsList>

        {/* Suggested POs Tab - One-Click Approval */}
        <TabsContent value="suggested-pos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Suggested Purchase Orders
              </CardTitle>
              <CardDescription>
                AI-generated purchase orders based on production requirements. Approve with one click to create actual POs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {suggestedPOs && suggestedPOs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Delivery Estimate</TableHead>
                      <TableHead>Required By</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestedPOs.map((po) => {
                      const isUrgent = po.isUrgent;
                      const leadTimeDays = po.vendorLeadTimeDays || 14;
                      const daysUntilRequired = po.daysUntilRequired || 0;
                      
                      return (
                        <TableRow key={po.id} className={isUrgent ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {po.suggestedPoNumber}
                              {isUrgent && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  URGENT
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>Vendor #{po.vendorId}</TableCell>
                          <TableCell className="font-medium">${parseFloat(po.totalAmount?.toString() || '0').toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{leadTimeDays} days</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1 text-sm">
                                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>
                                  {po.estimatedDeliveryDate 
                                    ? new Date(po.estimatedDeliveryDate).toLocaleDateString() 
                                    : '-'}
                                </span>
                              </div>
                              {isUrgent && (
                                <span className="text-xs text-red-600 dark:text-red-400">
                                  {Math.abs(leadTimeDays - daysUntilRequired)} days late
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>
                                  {po.requiredByDate 
                                    ? new Date(po.requiredByDate).toLocaleDateString() 
                                    : '-'}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {daysUntilRequired > 0 ? `${daysUntilRequired} days` : 'Overdue'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={po.priorityScore && po.priorityScore > 70 ? "destructive" : po.priorityScore && po.priorityScore > 40 ? "default" : "secondary"}>
                              {po.priorityScore || 0}/100
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(po.status)}</TableCell>
                          <TableCell className="text-right">
                            {po.status === 'pending' && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant={isUrgent ? "destructive" : "default"}
                                  onClick={() => handleApprovePO(po.id)}
                                  disabled={approvePOMutation.isPending}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  {isUrgent ? 'Approve Now' : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRejectPO(po.id)}
                                  disabled={rejectPOMutation.isPending}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            )}
                            {po.status === 'converted' && (
                              <Badge variant="default">Converted to PO</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No suggested purchase orders yet.</p>
                  <p className="text-sm">Generate forecasts and production plans to see AI-suggested POs.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forecasts Tab */}
        <TabsContent value="forecasts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Demand Forecasts
              </CardTitle>
              <CardDescription>
                AI-generated demand predictions based on historical sales data and market trends.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forecasts && forecasts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Forecast #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Forecasted Qty</TableHead>
                      <TableHead>Trend</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forecasts.map((forecast) => {
                      const product = products?.find(p => p.id === forecast.productId);
                      return (
                        <TableRow key={forecast.id}>
                          <TableCell className="font-medium">{forecast.forecastNumber}</TableCell>
                          <TableCell>{product?.name || `Product #${forecast.productId}`}</TableCell>
                          <TableCell className="font-medium">
                            {parseFloat(forecast.forecastedQuantity?.toString() || '0').toLocaleString()}
                          </TableCell>
                          <TableCell className="flex items-center gap-1">
                            {getTrendIcon(forecast.trendDirection)}
                            <span className="capitalize">{forecast.trendDirection || 'stable'}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={parseFloat(forecast.confidenceLevel?.toString() || '0') > 70 ? "default" : "secondary"}>
                              {forecast.confidenceLevel}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {forecast.forecastPeriodStart ? new Date(forecast.forecastPeriodStart).toLocaleDateString() : '-'} - 
                            {forecast.forecastPeriodEnd ? new Date(forecast.forecastPeriodEnd).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell>{getStatusBadge(forecast.status)}</TableCell>
                          <TableCell className="text-right">
                            {forecast.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleGeneratePlan(forecast.id)}
                                disabled={isGeneratingPlan && selectedForecastId === forecast.id}
                              >
                                {isGeneratingPlan && selectedForecastId === forecast.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Package className="h-4 w-4 mr-1" />
                                    Create Plan
                                  </>
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No forecasts generated yet.</p>
                  <p className="text-sm">Click "Generate AI Forecast" to analyze your sales data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Production Plans Tab */}
        <TabsContent value="plans">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Production Plans
              </CardTitle>
              <CardDescription>
                Production plans derived from demand forecasts with material requirements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productionPlans && productionPlans.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Planned Qty</TableHead>
                      <TableHead>Current Inventory</TableHead>
                      <TableHead>Safety Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productionPlans.map((plan) => {
                      const product = products?.find(p => p.id === plan.productId);
                      return (
                        <TableRow key={plan.id}>
                          <TableCell className="font-medium">{plan.planNumber}</TableCell>
                          <TableCell>{product?.name || `Product #${plan.productId}`}</TableCell>
                          <TableCell className="font-medium">
                            {parseFloat(plan.plannedQuantity?.toString() || '0').toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {parseFloat(plan.currentInventory?.toString() || '0').toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {parseFloat(plan.safetyStock?.toString() || '0').toLocaleString()}
                          </TableCell>
                          <TableCell>{getStatusBadge(plan.status)}</TableCell>
                          <TableCell className="text-right">
                            {plan.status === 'draft' && (
                              <Button
                                size="sm"
                                onClick={() => handleGenerateSuggestedPOs(plan.id)}
                                disabled={isGeneratingPOs && selectedPlanId === plan.id}
                              >
                                {isGeneratingPOs && selectedPlanId === plan.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <ShoppingCart className="h-4 w-4 mr-1" />
                                    Generate POs
                                  </>
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No production plans yet.</p>
                  <p className="text-sm">Create a plan from an active forecast to calculate material requirements.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Workflow Guide */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            AI Forecasting Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center justify-center text-sm">
            <div className="flex items-center gap-2 bg-background rounded-lg px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">1</div>
              <span>Generate AI Forecast</span>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex items-center gap-2 bg-background rounded-lg px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">2</div>
              <span>Create Production Plan</span>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex items-center gap-2 bg-background rounded-lg px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">3</div>
              <span>Generate Suggested POs</span>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex items-center gap-2 bg-background rounded-lg px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">4</div>
              <span>One-Click Approve</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
