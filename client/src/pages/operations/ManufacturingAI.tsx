import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Brain, Factory, Gauge, Wrench, ShieldCheck, Loader2,
} from "lucide-react";

export default function ManufacturingAI() {
  const [activeTab, setActiveTab] = useState("yield");

  const yieldMutation = trpc.manufacturingAi.predictYield.useMutation();
  const qualityMutation = trpc.manufacturingAi.forecastQuality.useMutation();
  const productionMutation = trpc.manufacturingAi.optimizeProduction.useMutation();
  const maintenanceMutation = trpc.manufacturingAi.predictMaintenance.useMutation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          Manufacturing AI
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered yield prediction, quality forecasting, and production optimization
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="yield">Yield Prediction</TabsTrigger>
          <TabsTrigger value="quality">Quality Forecast</TabsTrigger>
          <TabsTrigger value="production">Production Optimization</TabsTrigger>
          <TabsTrigger value="maintenance">Predictive Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="yield" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Yield Prediction</CardTitle>
              <CardDescription>Predict manufacturing yield and waste for open work orders</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => yieldMutation.mutate({})} disabled={yieldMutation.isPending}>
                {yieldMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gauge className="mr-2 h-4 w-4" />}
                Predict Yield
              </Button>

              {yieldMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Overall Yield Health:</span>
                    <Progress value={yieldMutation.data.overallYieldHealth} className="w-48" />
                    <span className="text-sm font-medium">{yieldMutation.data.overallYieldHealth}%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{yieldMutation.data.summary}</p>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>WO#</TableHead>
                        <TableHead>Expected Yield</TableHead>
                        <TableHead>Output Qty</TableHead>
                        <TableHead>Waste</TableHead>
                        <TableHead>Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yieldMutation.data.predictions.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.productName}</TableCell>
                          <TableCell>{p.workOrderId || "-"}</TableCell>
                          <TableCell className="text-foreground">{p.expectedYieldPercent}%</TableCell>
                          <TableCell>{p.predictedOutputQty}</TableCell>
                          <TableCell className="text-foreground font-semibold">{p.wasteEstimatePercent}%</TableCell>
                          <TableCell>{p.confidence}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Quality Forecasting</CardTitle>
              <CardDescription>Predict quality risks and recommend inspections</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => qualityMutation.mutate({})} disabled={qualityMutation.isPending}>
                {qualityMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Forecast Quality
              </Button>

              {qualityMutation.data && (
                <div className="mt-4 space-y-4">
                  <Badge variant={qualityMutation.data.overallQualityRisk === "high" ? "destructive" : qualityMutation.data.overallQualityRisk === "medium" ? "secondary" : "outline"}>
                    Overall Risk: {qualityMutation.data.overallQualityRisk}
                  </Badge>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Quality Score</TableHead>
                        <TableHead>Defect Risk</TableHead>
                        <TableHead>Critical Controls</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qualityMutation.data.forecasts.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{f.productName}</TableCell>
                          <TableCell>{f.qualityScore}/100</TableCell>
                          <TableCell className={f.defectRiskPercent > 10 ? "text-foreground font-semibold" : ""}>{f.defectRiskPercent}%</TableCell>
                          <TableCell className="max-w-xs text-sm">{f.criticalControlPoints.join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Production Optimization</CardTitle>
              <CardDescription>AI-optimized production scheduling and bottleneck identification</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => productionMutation.mutate()} disabled={productionMutation.isPending}>
                {productionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Factory className="mr-2 h-4 w-4" />}
                Optimize Schedule
              </Button>

              {productionMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Capacity Utilization:</span>
                    <Progress value={productionMutation.data.capacityUtilization} className="w-48" />
                    <span className="text-sm font-medium">{productionMutation.data.capacityUtilization}%</span>
                  </div>

                  {productionMutation.data.bottlenecks.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Bottlenecks</h4>
                      {productionMutation.data.bottlenecks.map((b, i) => (
                        <div key={i} className="p-3 rounded border mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={b.severity === "high" ? "destructive" : "secondary"}>{b.severity}</Badge>
                            <span className="font-medium text-sm">{b.area}</span>
                          </div>
                          <p className="text-sm mt-1">{b.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">Mitigation: {b.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sequence</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Reasoning</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productionMutation.data.schedule.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-bold">{s.recommendedSequence}</TableCell>
                          <TableCell className="font-medium">{s.productName}</TableCell>
                          <TableCell>{s.estimatedDuration}</TableCell>
                          <TableCell className="max-w-md text-sm">{s.reasoning}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Predictive Maintenance</CardTitle>
              <CardDescription>AI-predicted maintenance needs based on production patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => maintenanceMutation.mutate()} disabled={maintenanceMutation.isPending}>
                {maintenanceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                Predict Maintenance
              </Button>

              {maintenanceMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Maintenance Health:</span>
                    <Progress value={maintenanceMutation.data.overallMaintenanceHealth} className="w-48" />
                    <span className="text-sm font-medium">{maintenanceMutation.data.overallMaintenanceHealth}%</span>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Area</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Time to Failure</TableHead>
                        <TableHead>Recommended Action</TableHead>
                        <TableHead>Cost of Inaction</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {maintenanceMutation.data.predictions.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.area}</TableCell>
                          <TableCell><Badge variant={p.riskLevel === "critical" || p.riskLevel === "high" ? "destructive" : "outline"}>{p.riskLevel}</Badge></TableCell>
                          <TableCell>{p.estimatedTimeToFailure}</TableCell>
                          <TableCell className="max-w-xs text-sm">{p.recommendedAction}</TableCell>
                          <TableCell className="text-sm text-foreground font-semibold">{p.costOfInaction}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
