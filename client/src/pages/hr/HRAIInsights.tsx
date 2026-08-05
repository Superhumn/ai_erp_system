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
  Brain, Users, DollarSign, TrendingUp, AlertTriangle, Loader2, UserMinus, Award,
} from "lucide-react";

export default function HRAIInsights() {
  const [activeTab, setActiveTab] = useState("attrition");

  const attritionMutation = trpc.hrAi.predictAttrition.useMutation();
  const compensationMutation = trpc.hrAi.benchmarkCompensation.useMutation();
  const performanceMutation = trpc.hrAi.analyzePerformance.useMutation();
  const workforceMutation = trpc.hrAi.planWorkforce.useMutation();

  const riskColor = (level: string) => {
    switch (level) {
      case "critical": return "destructive";
      case "high": return "destructive";
      case "medium": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          HR AI Insights
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered attrition prediction, compensation benchmarking, and workforce planning
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="attrition">Attrition Risk</TabsTrigger>
          <TabsTrigger value="compensation">Compensation</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="workforce">Workforce Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="attrition" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="h-5 w-5" />
                Attrition Prediction
              </CardTitle>
              <CardDescription>Identify employees at risk of leaving</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => attritionMutation.mutate({})} disabled={attritionMutation.isPending}>
                {attritionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Analyze Attrition Risk
              </Button>

              {attritionMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Overall Attrition Risk:</span>
                    <Progress value={attritionMutation.data.overallAttritionRisk} className="w-48" />
                    <span className="text-sm font-medium">{attritionMutation.data.overallAttritionRisk}%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{attritionMutation.data.summary}</p>

                  {attritionMutation.data.departmentRisks.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {attritionMutation.data.departmentRisks.map((d, i) => (
                        <Card key={i}>
                          <CardContent className="pt-4">
                            <div className="text-sm font-medium">{d.department}</div>
                            <div className="text-2xl font-bold">{d.headcount}</div>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant={riskColor(d.riskLevel)}>{d.riskLevel}</Badge>
                              <span className="text-xs text-muted-foreground">{d.atRiskCount} at risk</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Factors</TableHead>
                        <TableHead>Recommended Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attritionMutation.data.predictions.filter(p => p.riskScore >= 40).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.employeeName}</TableCell>
                          <TableCell><Badge variant={riskColor(p.riskLevel)}>{p.riskLevel}</Badge></TableCell>
                          <TableCell>{p.riskScore}%</TableCell>
                          <TableCell className="max-w-xs text-sm">{p.factors.join("; ")}</TableCell>
                          <TableCell className="max-w-xs text-sm">{p.recommendedActions.join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compensation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Compensation Benchmarking
              </CardTitle>
              <CardDescription>AI market rate comparison for all employees</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => compensationMutation.mutate({})} disabled={compensationMutation.isPending}>
                {compensationMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                Run Benchmarking
              </Button>

              {compensationMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">Total Budget Impact: ${compensationMutation.data.totalBudgetImpact.toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{compensationMutation.data.summary}</p>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Market Range</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Adjustment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compensationMutation.data.benchmarks.map((b, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{b.employeeName}</TableCell>
                          <TableCell>${b.currentSalary.toLocaleString()}</TableCell>
                          <TableCell className="text-sm">${b.marketLow.toLocaleString()} - ${b.marketHigh.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={b.positionInMarket === "below_market" ? "destructive" : b.positionInMarket === "above_market" ? "default" : "secondary"}>
                              {b.positionInMarket.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className={b.adjustmentRecommendation > 0 ? "text-primary font-medium" : ""}>
                            {b.adjustmentRecommendation > 0 ? `+$${b.adjustmentRecommendation.toLocaleString()}` : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Performance Analysis</CardTitle>
              <CardDescription>AI-driven performance insights and development recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => performanceMutation.mutate({})} disabled={performanceMutation.isPending}>
                {performanceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Award className="mr-2 h-4 w-4" />}
                Analyze Performance
              </Button>

              {performanceMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Team Health Score:</span>
                    <Progress value={performanceMutation.data.teamHealthScore} className="w-48" />
                    <span className="text-sm font-medium">{performanceMutation.data.teamHealthScore}/100</span>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Strengths</TableHead>
                        <TableHead>Development</TableHead>
                        <TableHead>Promotion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {performanceMutation.data.insights.map((ins, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{ins.employeeName}</TableCell>
                          <TableCell>{ins.performanceScore}/100</TableCell>
                          <TableCell className="max-w-xs text-sm">{ins.strengths.join(", ")}</TableCell>
                          <TableCell className="max-w-xs text-sm">{ins.developmentAreas.join(", ")}</TableCell>
                          <TableCell>
                            <Badge variant={ins.promotionReadiness === "ready" || ins.promotionReadiness === "overdue" ? "default" : "outline"}>
                              {ins.promotionReadiness.replace("_", " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workforce" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Workforce Planning</CardTitle>
              <CardDescription>AI-powered headcount projections and hiring recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => workforceMutation.mutate({})} disabled={workforceMutation.isPending}>
                {workforceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                Generate Plan
              </Button>

              {workforceMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Current Headcount</div>
                        <div className="text-2xl font-bold">{workforceMutation.data.currentHeadcount}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Monthly Cost</div>
                        <div className="text-2xl font-bold font-display tabular-nums">${workforceMutation.data.costProjection.currentMonthlyCost.toLocaleString()}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Projected Cost</div>
                        <div className="text-2xl font-bold font-display tabular-nums">${workforceMutation.data.costProjection.projectedMonthlyCost.toLocaleString()}</div>
                        {workforceMutation.data.costProjection.increasePercent > 0 && (
                          <span className="text-sm text-foreground font-medium">+{workforceMutation.data.costProjection.increasePercent}%</span>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Projected Need</TableHead>
                        <TableHead>Gap</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Timeline</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workforceMutation.data.projectedNeeds.map((n, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{n.department}</TableCell>
                          <TableCell>{n.currentCount}</TableCell>
                          <TableCell>{n.projectedNeed}</TableCell>
                          <TableCell className={n.gap > 0 ? "text-foreground font-semibold" : ""}>{n.gap > 0 ? `+${n.gap}` : n.gap}</TableCell>
                          <TableCell><Badge variant={n.priority === "critical" || n.priority === "high" ? "destructive" : "outline"}>{n.priority}</Badge></TableCell>
                          <TableCell className="text-sm">{n.timeline}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {workforceMutation.data.recommendations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Recommendations</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {workforceMutation.data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
