import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  Filter,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function ExceptionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [selectedException, setSelectedException] = useState<any>(null);
  const [resolutionAction, setResolutionAction] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showResolveDialog, setShowResolveDialog] = useState(false);

  // Queries
  const exceptionsQuery = trpc.autonomousWorkflows.exceptions.list.useQuery({
    status: statusFilter as any || undefined,
    severity: severityFilter as any || undefined,
    limit: 100,
  });

  // Mutations
  const resolveMutation = trpc.autonomousWorkflows.exceptions.resolve.useMutation({
    onSuccess: () => {
      toast.success("Exception resolved");
      exceptionsQuery.refetch();
      setShowResolveDialog(false);
      setSelectedException(null);
      setResolutionAction("");
      setResolutionNotes("");
    },
    onError: (error) => toast.error(error.message),
  });

  const escalateMutation = trpc.autonomousWorkflows.exceptions.escalate.useMutation({
    onSuccess: () => {
      toast.success("Exception escalated");
      exceptionsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "low":
        return <Badge className="bg-blue-500/20 text-blue-600">Low</Badge>;
      case "medium":
        return <Badge className="bg-amber-500/20 text-amber-600">Medium</Badge>;
      case "high":
        return <Badge className="bg-orange-500/20 text-orange-600">High</Badge>;
      case "critical":
        return <Badge className="bg-red-600 text-white">Critical</Badge>;
      default:
        return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="destructive">Open</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500/20 text-blue-600">In Progress</Badge>;
      case "resolved":
        return <Badge className="bg-green-500/20 text-green-600">Resolved</Badge>;
      case "escalated":
        return <Badge className="bg-red-500/20 text-red-600">Escalated</Badge>;
      case "ignored":
        return <Badge variant="secondary">Ignored</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const openCount = exceptionsQuery.data?.filter((e) => e.status === "open").length || 0;
  const escalatedCount = exceptionsQuery.data?.filter((e) => e.status === "escalated").length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            Exception Management
          </h1>
          <p className="text-muted-foreground">
            Review and resolve supply chain exceptions
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className={openCount > 0 ? "border-red-500" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{openCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Escalated</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{escalatedCount}</p>
              </div>
              <ArrowUp className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">
                  {exceptionsQuery.data?.filter((e) => e.status === "in_progress").length || 0}
                </p>
              </div>
              <div className="h-8 w-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved Today</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">
                  {exceptionsQuery.data?.filter(
                    (e) =>
                      e.status === "resolved" &&
                      e.resolvedAt &&
                      new Date(e.resolvedAt).toDateString() === new Date().toDateString()
                  ).length || 0}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            {(statusFilter || severityFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("");
                  setSeverityFilter("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Exceptions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Exceptions</CardTitle>
          <CardDescription>
            {exceptionsQuery.data?.length || 0} exception(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!exceptionsQuery.data?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No exceptions to display</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptionsQuery.data?.map((exception) => (
                  <TableRow
                    key={exception.id}
                    className={
                      exception.severity === "critical"
                        ? "bg-red-50 dark:bg-red-950/20"
                        : exception.severity === "high"
                        ? "bg-orange-50 dark:bg-orange-950/10"
                        : ""
                    }
                  >
                    <TableCell>{getSeverityBadge(exception.severity)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{exception.exceptionType.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{exception.title}</p>
                        {exception.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {exception.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(exception.status)}</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(exception.detectedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {(exception.exceptionData as any)?.financialImpact && (
                        <span className="text-red-600 font-mono">
                          ${parseFloat((exception.exceptionData as any).financialImpact).toLocaleString()}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(exception.status === "open" || exception.status === "in_progress") && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => escalateMutation.mutate({ id: exception.id })}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedException(exception);
                              setShowResolveDialog(true);
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve Exception</DialogTitle>
            <DialogDescription>
              Provide resolution details for this exception.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">{selectedException?.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedException?.description}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Resolution Action</label>
              <Select value={resolutionAction} onValueChange={setResolutionAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action taken" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted_variance">Accepted Variance</SelectItem>
                  <SelectItem value="reordered">Reordered from Vendor</SelectItem>
                  <SelectItem value="adjusted_inventory">Adjusted Inventory</SelectItem>
                  <SelectItem value="contacted_vendor">Contacted Vendor</SelectItem>
                  <SelectItem value="manual_override">Manual Override</SelectItem>
                  <SelectItem value="no_action_needed">No Action Needed</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Describe how the exception was resolved..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                resolveMutation.mutate({
                  id: selectedException.id,
                  action: resolutionAction,
                  notes: resolutionNotes,
                })
              }
              disabled={!resolutionAction || resolveMutation.isPending}
            >
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
