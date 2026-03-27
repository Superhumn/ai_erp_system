import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Undo2,
  Activity,
  Brain,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

const PAGE_SIZE = 25;

export default function AIActivityTracker() {
  const [activeTab, setActiveTab] = useState("feed");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [undoFilter, setUndoFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [undoNotes, setUndoNotes] = useState("");
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailActivityId, setDetailActivityId] = useState<number | null>(null);

  // Queries
  const statsQuery = trpc.aiActivity.stats.useQuery({ days: 7 });

  const feedQuery = trpc.aiActivity.feed.useQuery({
    source: sourceFilter !== "all" ? sourceFilter as any : undefined,
    actionType: actionFilter !== "all" ? actionFilter as any : undefined,
    undoStatus: undoFilter !== "all" ? undoFilter as any : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const aggregatedQuery = trpc.aiActivity.aggregated.useQuery({
    limit: 30,
  });

  const undoHistoryQuery = trpc.aiActivity.undoHistory.useQuery({
    limit: PAGE_SIZE,
  });

  const detailQuery = trpc.aiActivity.detail.useQuery(
    { id: detailActivityId! },
    { enabled: !!detailActivityId }
  );

  // Mutations
  const undoMutation = trpc.aiActivity.undo.useMutation({
    onSuccess: () => {
      toast.success("Undo completed successfully");
      setUndoDialogOpen(false);
      setUndoNotes("");
      feedQuery.refetch();
      undoHistoryQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Undo failed: ${err.message}`);
    },
  });

  const stats = statsQuery.data;
  const feed = feedQuery.data;

  function getSourceBadge(source: string) {
    switch (source) {
      case "agent": return <Badge variant="default">Agent</Badge>;
      case "autonomous_workflow": return <Badge className="bg-purple-600">Workflow</Badge>;
      case "ai_assistant": return <Badge className="bg-blue-600">Assistant</Badge>;
      case "ai_agent_task": return <Badge className="bg-orange-600">Task</Badge>;
      default: return <Badge variant="secondary">{source}</Badge>;
    }
  }

  function getActionBadge(action: string) {
    const colors: Record<string, string> = {
      create: "bg-green-600",
      update: "bg-blue-600",
      delete: "bg-red-600",
      send_email: "bg-yellow-600",
      approve: "bg-emerald-600",
      reject: "bg-rose-600",
      transfer: "bg-indigo-600",
      allocate: "bg-cyan-600",
      forecast: "bg-violet-600",
      analyze: "bg-slate-600",
      decision: "bg-amber-600",
    };
    return <Badge className={colors[action] ?? "bg-gray-600"}>{action.replace("_", " ")}</Badge>;
  }

  function getUndoStatusBadge(status: string) {
    switch (status) {
      case "available": return <Badge className="bg-green-600">Undoable</Badge>;
      case "undone": return <Badge variant="secondary">Undone</Badge>;
      case "expired": return <Badge variant="outline">Expired</Badge>;
      case "not_undoable": return <Badge variant="outline" className="text-muted-foreground">N/A</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  }

  function getAgentStatusBadge(status: string) {
    switch (status) {
      case "completed": return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "failed": return <Badge className="bg-red-600"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "running": return <Badge className="bg-blue-600"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
      case "max_iterations": return <Badge className="bg-yellow-600"><AlertTriangle className="h-3 w-3 mr-1" />Max Iterations</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  }

  function handleUndoClick(activityId: number) {
    setSelectedActivityId(activityId);
    setUndoDialogOpen(true);
  }

  function handleDetailClick(activityId: number) {
    setDetailActivityId(activityId);
    setDetailDialogOpen(true);
  }

  function confirmUndo() {
    if (selectedActivityId) {
      undoMutation.mutate({
        activityLogId: selectedActivityId,
        notes: undoNotes || undefined,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8" />
            AI Activity Tracker
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor all AI agent actions across the system and undo changes when needed
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            feedQuery.refetch();
            aggregatedQuery.refetch();
            statsQuery.refetch();
          }}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Activities (7d)</CardDescription>
            <CardTitle className="text-2xl">{stats?.totalActivities ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <Activity className="h-3 w-3 mr-1" />
              All AI actions
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agent Runs (7d)</CardDescription>
            <CardTitle className="text-2xl">{stats?.totalAgentRuns ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <Bot className="h-3 w-3 mr-1" />
              Autonomous agent executions
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI Decisions (7d)</CardDescription>
            <CardTitle className="text-2xl">{stats?.totalDecisions ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <Brain className="h-3 w-3 mr-1" />
              Automated decisions made
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Undoable Actions</CardDescription>
            <CardTitle className="text-2xl">{stats?.undoableCount ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-green-600">
              <Undo2 className="h-3 w-3 mr-1" />
              Can be reversed
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Undos Performed (7d)</CardDescription>
            <CardTitle className="text-2xl">{stats?.totalUndos ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3 mr-1" />
              Changes reverted
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="feed">
            <Zap className="h-4 w-4 mr-2" />
            Activity Feed
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Bot className="h-4 w-4 mr-2" />
            Agent Runs
          </TabsTrigger>
          <TabsTrigger value="decisions">
            <Brain className="h-4 w-4 mr-2" />
            AI Decisions
          </TabsTrigger>
          <TabsTrigger value="undo-history">
            <Undo2 className="h-4 w-4 mr-2" />
            Undo History
          </TabsTrigger>
        </TabsList>

        {/* Activity Feed Tab */}
        <TabsContent value="feed" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filters:</span>
                </div>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="autonomous_workflow">Workflow</SelectItem>
                    <SelectItem value="ai_assistant">Assistant</SelectItem>
                    <SelectItem value="ai_agent_task">Task</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="send_email">Send Email</SelectItem>
                    <SelectItem value="approve">Approve</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="decision">Decision</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={undoFilter} onValueChange={setUndoFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Undo Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="available">Undoable</SelectItem>
                    <SelectItem value="undone">Undone</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="not_undoable">Not Undoable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Activity Table */}
          <Card>
            <CardHeader>
              <CardTitle>AI Activity Feed</CardTitle>
              <CardDescription>
                {feed?.total ?? 0} total activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Undo Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feed?.activities?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No AI activities recorded yet. Activities will appear here as AI agents perform actions.
                      </TableCell>
                    </TableRow>
                  )}
                  {feed?.activities?.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {activity.createdAt
                          ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })
                          : "-"}
                      </TableCell>
                      <TableCell>{getSourceBadge(activity.source)}</TableCell>
                      <TableCell>{getActionBadge(activity.actionType)}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{activity.entityType}</div>
                        {activity.entityName && (
                          <div className="text-xs text-muted-foreground">{activity.entityName}</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm">
                        {activity.description}
                      </TableCell>
                      <TableCell>
                        {activity.confidence
                          ? <span className="text-sm">{parseFloat(activity.confidence).toFixed(0)}%</span>
                          : <span className="text-muted-foreground text-xs">-</span>}
                      </TableCell>
                      <TableCell>{getUndoStatusBadge(activity.undoStatus)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDetailClick(activity.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {activity.undoStatus === "available" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-orange-600 hover:text-orange-700"
                              onClick={() => handleUndoClick(activity.id)}
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {(feed?.total ?? 0) > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, feed?.total ?? 0)} of {feed?.total ?? 0}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={(page + 1) * PAGE_SIZE >= (feed?.total ?? 0)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Runs Tab */}
        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Agent Runs</CardTitle>
              <CardDescription>All autonomous agent executions with step-by-step tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Goal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Iterations</TableHead>
                    <TableHead>Tool Calls</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedQuery.data?.agentRuns?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No agent runs recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {aggregatedQuery.data?.agentRuns?.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-sm">#{run.id}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{run.goal}</TableCell>
                      <TableCell>{getAgentStatusBadge(run.status)}</TableCell>
                      <TableCell>{run.iterations}</TableCell>
                      <TableCell>{run.toolCallCount ?? 0}</TableCell>
                      <TableCell>
                        {run.totalDurationMs
                          ? `${(run.totalDurationMs / 1000).toFixed(1)}s`
                          : "-"}
                      </TableCell>
                      <TableCell>{run.totalTokensUsed?.toLocaleString() ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
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

        {/* AI Decisions Tab */}
        <TabsContent value="decisions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Autonomous Decisions</CardTitle>
              <CardDescription>AI-made decisions with reasoning and confidence scores</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Overridden</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedQuery.data?.decisions?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No autonomous decisions recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {aggregatedQuery.data?.decisions?.map((decision) => (
                    <TableRow key={decision.id}>
                      <TableCell className="font-mono text-sm">#{decision.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{decision.decisionType.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        {decision.entityType && (
                          <span className="text-sm">
                            {decision.entityType} #{decision.entityId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {decision.confidence
                          ? <span className={`font-medium ${parseFloat(decision.confidence) >= 80 ? "text-green-600" : parseFloat(decision.confidence) >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                              {parseFloat(decision.confidence).toFixed(0)}%
                            </span>
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {decision.wasOverridden
                          ? <Badge className="bg-orange-600">Overridden</Badge>
                          : <span className="text-muted-foreground text-xs">No</span>}
                      </TableCell>
                      <TableCell>
                        {decision.feedbackScore !== null && decision.feedbackScore !== undefined
                          ? <span className={decision.feedbackScore > 0 ? "text-green-600" : decision.feedbackScore < 0 ? "text-red-600" : "text-muted-foreground"}>
                              {decision.feedbackScore > 0 ? "+" : ""}{decision.feedbackScore}
                            </span>
                          : <span className="text-muted-foreground text-xs">-</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {decision.createdAt
                          ? formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Undo History Tab */}
        <TabsContent value="undo-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Undo Operations</CardTitle>
              <CardDescription>History of all undo/rollback operations performed</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {undoHistoryQuery.data?.operations?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No undo operations performed yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {undoHistoryQuery.data?.operations?.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="font-mono text-sm">#{op.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{op.undoType.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        {op.entityType} {op.entityId ? `#${op.entityId}` : ""}
                      </TableCell>
                      <TableCell>
                        {op.status === "completed" && <Badge className="bg-green-600">Completed</Badge>}
                        {op.status === "failed" && <Badge className="bg-red-600">Failed</Badge>}
                        {op.status === "pending" && <Badge className="bg-yellow-600">Pending</Badge>}
                        {op.status === "in_progress" && <Badge className="bg-blue-600">In Progress</Badge>}
                        {op.status === "cancelled" && <Badge variant="secondary">Cancelled</Badge>}
                      </TableCell>
                      <TableCell>User #{op.requestedBy}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{op.notes ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {op.requestedAt
                          ? formatDistanceToNow(new Date(op.requestedAt), { addSuffix: true })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {op.completedAt
                          ? formatDistanceToNow(new Date(op.completedAt), { addSuffix: true })
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

      {/* Undo Confirmation Dialog */}
      <Dialog open={undoDialogOpen} onOpenChange={setUndoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-600" />
              Confirm Undo
            </DialogTitle>
            <DialogDescription>
              This will revert the AI-initiated change. This action will be logged in the undo history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Optional: Add notes explaining why you are undoing this action..."
              value={undoNotes}
              onChange={(e) => setUndoNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUndoDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmUndo}
              disabled={undoMutation.isPending}
            >
              {undoMutation.isPending ? "Undoing..." : "Confirm Undo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Activity Detail
            </DialogTitle>
          </DialogHeader>
          {detailQuery.data?.activity && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Source</span>
                  <div className="mt-1">{getSourceBadge(detailQuery.data.activity.source)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Action</span>
                  <div className="mt-1">{getActionBadge(detailQuery.data.activity.actionType)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Entity</span>
                  <div className="mt-1 text-sm font-medium">
                    {detailQuery.data.activity.entityType}
                    {detailQuery.data.activity.entityId && ` #${detailQuery.data.activity.entityId}`}
                    {detailQuery.data.activity.entityName && ` - ${detailQuery.data.activity.entityName}`}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Undo Status</span>
                  <div className="mt-1">{getUndoStatusBadge(detailQuery.data.activity.undoStatus)}</div>
                </div>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Description</span>
                <p className="mt-1 text-sm">{detailQuery.data.activity.description}</p>
              </div>

              {detailQuery.data.activity.aiReasoning && (
                <div>
                  <span className="text-sm text-muted-foreground">AI Reasoning</span>
                  <p className="mt-1 text-sm bg-muted p-3 rounded-md">{detailQuery.data.activity.aiReasoning}</p>
                </div>
              )}

              {detailQuery.data.activity.oldValues && (
                <div>
                  <span className="text-sm text-muted-foreground">Previous Values</span>
                  <pre className="mt-1 text-xs bg-muted p-3 rounded-md overflow-x-auto">
                    {JSON.stringify(detailQuery.data.activity.oldValues, null, 2)}
                  </pre>
                </div>
              )}

              {detailQuery.data.activity.newValues && (
                <div>
                  <span className="text-sm text-muted-foreground">New Values</span>
                  <pre className="mt-1 text-xs bg-muted p-3 rounded-md overflow-x-auto">
                    {JSON.stringify(detailQuery.data.activity.newValues, null, 2)}
                  </pre>
                </div>
              )}

              {detailQuery.data.activity.createdAt && (
                <div>
                  <span className="text-sm text-muted-foreground">Timestamp</span>
                  <div className="mt-1 text-sm">
                    {format(new Date(detailQuery.data.activity.createdAt), "PPpp")}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
