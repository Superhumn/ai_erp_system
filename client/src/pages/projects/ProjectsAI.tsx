import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Brain, Target, Users, AlertTriangle, Calendar, Loader2,
} from "lucide-react";

export default function ProjectsAI() {
  const [activeTab, setActiveTab] = useState("risks");
  const [projectId, setProjectId] = useState("");

  const riskMutation = trpc.projectsAi.predictRisks.useMutation();
  const effortMutation = trpc.projectsAi.estimateEffort.useMutation();
  const resourceMutation = trpc.projectsAi.optimizeResourceAllocation.useMutation();
  const scheduleMutation = trpc.projectsAi.optimizeSchedule.useMutation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8 text-muted-foreground" />
          Project AI Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered effort estimation, risk prediction, and schedule optimization
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="risks">Risk Prediction</TabsTrigger>
          <TabsTrigger value="effort">Effort Estimation</TabsTrigger>
          <TabsTrigger value="resources">Resource Allocation</TabsTrigger>
          <TabsTrigger value="schedule">Schedule Optimization</TabsTrigger>
        </TabsList>

        <TabsContent value="risks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Project Risk Prediction</CardTitle>
              <CardDescription>AI analysis of schedule, budget, and scope risks across projects</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => riskMutation.mutate({})} disabled={riskMutation.isPending}>
                {riskMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                Analyze Risks
              </Button>

              {riskMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Portfolio Risk:</span>
                    <Progress value={riskMutation.data.portfolioRiskScore} className="w-48" />
                    <span className="text-sm font-medium">{riskMutation.data.portfolioRiskScore}/100</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{riskMutation.data.summary}</p>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Schedule</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Top Risk Factors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {riskMutation.data.risks.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.projectName}</TableCell>
                          <TableCell><Badge variant={r.riskLevel === "critical" || r.riskLevel === "high" ? "destructive" : "outline"}>{r.riskLevel}</Badge></TableCell>
                          <TableCell><Badge variant={r.scheduleRisk === "delayed" ? "destructive" : r.scheduleRisk === "at_risk" ? "secondary" : "outline"}>{r.scheduleRisk.replace("_", " ")}</Badge></TableCell>
                          <TableCell><Badge variant={r.budgetRisk === "over_budget" ? "destructive" : r.budgetRisk === "at_risk" ? "secondary" : "outline"}>{r.budgetRisk.replace("_", " ")}</Badge></TableCell>
                          <TableCell className="max-w-xs text-sm">{r.riskFactors.slice(0, 2).map(f => f.description).join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="effort" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Effort Estimation</CardTitle>
              <CardDescription>AI three-point effort estimation for project tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-48" />
                <Button onClick={() => { const id = parseInt(projectId); if (id > 0) effortMutation.mutate({ projectId: id }); }} disabled={effortMutation.isPending || !projectId}>
                  {effortMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
                  Estimate Effort
                </Button>
              </div>

              {effortMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="text-sm font-medium">Total Estimated: {effortMutation.data.totalEstimatedHours} hours</div>
                  <p className="text-sm text-muted-foreground">{effortMutation.data.summary}</p>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Complexity</TableHead>
                        <TableHead>Optimistic</TableHead>
                        <TableHead>Most Likely</TableHead>
                        <TableHead>Pessimistic</TableHead>
                        <TableHead>Risks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {effortMutation.data.estimates.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{e.taskName}</TableCell>
                          <TableCell><Badge>{e.complexityLevel}</Badge></TableCell>
                          <TableCell>{e.confidenceRange.optimistic}h</TableCell>
                          <TableCell className="font-medium">{e.confidenceRange.mostLikely}h</TableCell>
                          <TableCell>{e.confidenceRange.pessimistic}h</TableCell>
                          <TableCell className="max-w-xs text-sm">{e.risks.join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Resource Allocation</CardTitle>
              <CardDescription>AI-optimized team distribution across projects</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => resourceMutation.mutate({})} disabled={resourceMutation.isPending}>
                {resourceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                Optimize Resources
              </Button>

              {resourceMutation.data && (
                <div className="mt-4 space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Recommended</TableHead>
                        <TableHead>Skills Needed</TableHead>
                        <TableHead>Reasoning</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resourceMutation.data.allocations.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{a.projectName}</TableCell>
                          <TableCell>{a.currentAllocation}</TableCell>
                          <TableCell className={a.recommendedAllocation > a.currentAllocation ? "text-foreground font-semibold" : ""}>{a.recommendedAllocation}</TableCell>
                          <TableCell className="text-sm">{a.skillsNeeded.join(", ")}</TableCell>
                          <TableCell className="max-w-xs text-sm">{a.reasoning}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {resourceMutation.data.recommendations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Recommendations</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {resourceMutation.data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Schedule Optimization</CardTitle>
              <CardDescription>AI-optimized project scheduling with critical path analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => scheduleMutation.mutate({})} disabled={scheduleMutation.isPending}>
                {scheduleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
                Optimize Schedule
              </Button>

              {scheduleMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="text-sm">Savings vs current: <span className="font-medium">{scheduleMutation.data.savingsVsCurrent}</span></div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Critical Path</TableHead>
                        <TableHead>Can Parallelize With</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduleMutation.data.optimizedSchedule.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{s.projectName}</TableCell>
                          <TableCell>{s.recommendedStartDate}</TableCell>
                          <TableCell>{s.recommendedEndDate}</TableCell>
                          <TableCell className="max-w-xs text-sm">{s.criticalPath.join(", ")}</TableCell>
                          <TableCell className="text-sm">{s.parallelizableWith.join(", ") || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {scheduleMutation.data.recommendations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Recommendations</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {scheduleMutation.data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
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
