import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  DollarSign,
  Bot,
  ArrowUpRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function ApprovalsPage() {
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Queries
  const approvalsQuery = trpc.autonomousWorkflows.approvals.all.useQuery({ limit: 50 });

  // Mutations
  const approveMutation = trpc.autonomousWorkflows.approvals.approve.useMutation({
    onSuccess: () => {
      toast.success("Approved successfully");
      approvalsQuery.refetch();
      setSelectedApproval(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.autonomousWorkflows.approvals.reject.useMutation({
    onSuccess: () => {
      toast.success("Rejected");
      approvalsQuery.refetch();
      setShowRejectDialog(false);
      setSelectedApproval(null);
      setRejectReason("");
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkApproveMutation = trpc.autonomousWorkflows.approvals.bulkApprove.useMutation({
    onSuccess: (result) => {
      toast.success(`Approved ${result.processed} items`);
      approvalsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const pendingApprovals = approvalsQuery.data?.filter(
    (a) => a.status === "pending" || a.status === "escalated"
  ) || [];

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "low":
        return <Badge className="bg-green-500/20 text-green-600">Low Risk</Badge>;
      case "medium":
        return <Badge className="bg-amber-500/20 text-amber-600">Medium Risk</Badge>;
      case "high":
        return <Badge className="bg-red-500/20 text-red-600">High Risk</Badge>;
      case "critical":
        return <Badge className="bg-red-600 text-white">Critical</Badge>;
      default:
        return <Badge variant="secondary">{risk}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      purchase_order: "bg-blue-500/20 text-blue-600",
      payment: "bg-green-500/20 text-green-600",
      inventory_transfer: "bg-purple-500/20 text-purple-600",
      vendor_selection: "bg-amber-500/20 text-amber-600",
    };
    return (
      <Badge className={colors[type] || "bg-gray-500/20 text-gray-600"}>
        {type.replace(/_/g, " ")}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6" />
            Approval Queue
          </h1>
          <p className="text-muted-foreground">
            Review and approve autonomous workflow decisions
          </p>
        </div>
        {pendingApprovals.length > 1 && (
          <Button
            onClick={() => {
              const lowRiskItems = pendingApprovals
                .filter((a) => a.riskAssessment === "low" && parseFloat(a.monetaryValue || "0") < 1000)
                .map((a) => a.id);
              if (lowRiskItems.length > 0) {
                bulkApproveMutation.mutate({ ids: lowRiskItems });
              } else {
                toast.info("No low-risk items to auto-approve");
              }
            }}
            variant="outline"
          >
            Approve All Low-Risk
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">
                  {approvalsQuery.data?.filter((a) => a.status === "pending").length || 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Escalated</p>
                <p className="text-2xl font-bold">
                  {approvalsQuery.data?.filter((a) => a.status === "escalated").length || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Auto-Approved</p>
                <p className="text-2xl font-bold">
                  {approvalsQuery.data?.filter((a) => a.status === "auto_approved").length || 0}
                </p>
              </div>
              <Bot className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">
                  ${(
                    pendingApprovals.reduce((sum, a) => sum + parseFloat(a.monetaryValue || "0"), 0) / 1000
                  ).toFixed(1)}k
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Approvals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Approvals</CardTitle>
          <CardDescription>Items requiring your review</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingApprovals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>All caught up! No pending approvals.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>AI Confidence</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovals.map((approval) => (
                  <TableRow key={approval.id} className={approval.status === "escalated" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell>{getTypeBadge(approval.approvalType)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{approval.title}</p>
                        {approval.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {approval.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      ${parseFloat(approval.monetaryValue || "0").toLocaleString()}
                    </TableCell>
                    <TableCell>{getRiskBadge(approval.riskAssessment || '')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-16 rounded-full bg-muted overflow-hidden"
                        >
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${approval.aiConfidence || 0}%` }}
                          />
                        </div>
                        <span className="text-xs">{approval.aiConfidence}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {approval.status === "escalated" && (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        )}
                        {formatDistanceToNow(new Date(approval.requestedAt), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedApproval(approval);
                            setShowRejectDialog(true);
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate({ id: approval.id })}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* AI Recommendation Panel */}
      {selectedApproval && !showRejectDialog && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AI Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm">{selectedApproval.aiRecommendation || "No recommendation available"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Approval</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">{selectedApproval?.title}</p>
              <p className="text-sm text-muted-foreground">
                Value: ${parseFloat(selectedApproval?.monetaryValue || "0").toLocaleString()}
              </p>
            </div>
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectMutation.mutate({
                  id: selectedApproval.id,
                  reason: rejectReason,
                })
              }
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
