import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bot,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  TrendingUp,
  AlertTriangle,
  Package,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AutonomousDashboard() {
  const [selectedTab, setSelectedTab] = useState("overview");

  // Queries
  const statusQuery = trpc.autonomousWorkflows.orchestrator.status.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const workflowsQuery = trpc.autonomousWorkflows.workflows.list.useQuery();
  const runsQuery = trpc.autonomousWorkflows.runs.list.useQuery({ limit: 20 });
  const statsQuery = trpc.autonomousWorkflows.runs.stats.useQuery({});
  const metricsQuery = trpc.autonomousWorkflows.metrics.overview.useQuery({ days: 7 });

  // Mutations
  const startMutation = trpc.autonomousWorkflows.orchestrator.start.useMutation({
    onSuccess: () => statusQuery.refetch(),
  });
  const stopMutation = trpc.autonomousWorkflows.orchestrator.stop.useMutation({
    onSuccess: () => statusQuery.refetch(),
  });
  const triggerMutation = trpc.autonomousWorkflows.workflows.trigger.useMutation({
    onSuccess: () => runsQuery.refetch(),
  });

  const isRunning = statusQuery.data?.isRunning ?? false;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "running":
        return "bg-blue-500";
      case "failed":
        return "bg-red-500";
      case "awaiting_approval":
        return "bg-amber-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-600">Completed</Badge>;
      case "running":
        return <Badge className="bg-blue-500/20 text-blue-600">Running</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-600">Failed</Badge>;
      case "awaiting_approval":
        return <Badge className="bg-amber-500/20 text-amber-600">Awaiting Approval</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Autonomous Supply Chain
          </h1>
          <p className="text-muted-foreground">
            Monitor and control automated supply chain workflows
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              statusQuery.refetch();
              runsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => (isRunning ? stopMutation.mutate() : startMutation.mutate())}
            variant={isRunning ? "destructive" : "default"}
          >
            {isRunning ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Stop Agent
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Agent
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agent Status</CardTitle>
            <div className={`h-3 w-3 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isRunning ? "Running" : "Stopped"}</div>
            <p className="text-xs text-muted-foreground">
              {statusQuery.data?.activeWorkflows || 0} active workflows
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Runs</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusQuery.data?.todayMetrics?.totalRuns || 0}</div>
            <p className="text-xs text-muted-foreground">
              {statusQuery.data?.todayMetrics?.completed || 0} completed, {statusQuery.data?.todayMetrics?.failed || 0} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusQuery.data?.pendingApprovals || 0}</div>
            <p className="text-xs text-muted-foreground">Waiting for review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Exceptions</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusQuery.data?.openExceptions || 0}</div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Metrics */}
      {metricsQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">7-Day Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-3xl font-bold text-blue-600">{metricsQuery.data.totalRuns || 0}</div>
                <div className="text-sm text-muted-foreground">Total Runs</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-3xl font-bold text-green-600">{metricsQuery.data.successfulRuns || 0}</div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-3xl font-bold text-purple-600">{metricsQuery.data.aiDecisions || 0}</div>
                <div className="text-sm text-muted-foreground">AI Decisions</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-3xl font-bold text-amber-600">{metricsQuery.data.itemsProcessed || 0}</div>
                <div className="text-sm text-muted-foreground">Items Processed</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-3xl font-bold text-emerald-600">
                  ${((metricsQuery.data.totalValue || 0) / 1000).toFixed(0)}k
                </div>
                <div className="text-sm text-muted-foreground">Value Processed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="overview">Workflows</TabsTrigger>
          <TabsTrigger value="runs">Recent Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configured Workflows</CardTitle>
              <CardDescription>
                All autonomous workflows and their current status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Success Rate</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflowsQuery.data?.map((workflow) => {
                    const total = (workflow.successCount || 0) + (workflow.failureCount || 0);
                    const successRate = total > 0 ? ((workflow.successCount || 0) / total) * 100 : 100;

                    return (
                      <TableRow key={workflow.id}>
                        <TableCell className="font-medium">{workflow.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{workflow.workflowType.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="capitalize">{workflow.triggerType}</TableCell>
                        <TableCell>
                          {workflow.isActive ? (
                            <Badge className="bg-green-500/20 text-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {workflow.lastRunAt
                            ? formatDistanceToNow(new Date(workflow.lastRunAt), { addSuffix: true })
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={successRate} className="h-2 w-16" />
                            <span className="text-xs">{successRate.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => triggerMutation.mutate({ id: workflow.id })}
                            disabled={triggerMutation.isPending || !workflow.isActive}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Workflow Runs</CardTitle>
              <CardDescription>Latest execution history</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Triggered</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsQuery.data?.map(({ run, workflow }) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-xs">{run.runNumber}</TableCell>
                      <TableCell>{workflow.name}</TableCell>
                      <TableCell>{getStatusBadge(run.status)}</TableCell>
                      <TableCell className="capitalize">{run.triggeredBy}</TableCell>
                      <TableCell>
                        {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "-"}
                      </TableCell>
                      <TableCell>
                        <span className="text-green-600">{run.itemsSucceeded}</span>
                        {(run.itemsFailed || 0) > 0 && (
                          <span className="text-red-600 ml-1">/ {run.itemsFailed}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {run.startedAt
                          ? formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
