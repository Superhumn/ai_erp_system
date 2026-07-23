import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Check, X, Lightbulb } from "lucide-react";

type StatusFilter = "pending" | "approved" | "rejected" | "expired";
type TypeFilter = "reorder" | "production" | "pricing" | "allocation" | "other";

export default function Recommendations() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const utils = trpc.useUtils();

  const listInput: { status?: StatusFilter; type?: TypeFilter } = {};
  if (statusFilter !== "all") listInput.status = statusFilter as StatusFilter;
  if (typeFilter !== "all") listInput.type = typeFilter as TypeFilter;

  const { data: recommendations, isLoading } = trpc.recommendations.list.useQuery(listInput);

  const approveMutation = trpc.recommendations.approve.useMutation({
    onSuccess: () => {
      toast.success("Recommendation approved");
      utils.recommendations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.recommendations.reject.useMutation({
    onSuccess: () => {
      toast.success("Recommendation rejected");
      setRejectId(null);
      setRejectReason("");
      utils.recommendations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case "reorder": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "production": return "bg-violet-500/8 text-violet-600 dark:text-violet-400";
      case "pricing": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "allocation": return "bg-orange-500/8 text-orange-600 dark:text-orange-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case "approved": return "default";
      case "rejected": return "destructive";
      case "expired": return "outline";
      default: return "secondary";
    }
  };

  const getTitle = (rec: any) => {
    if (rec.title) return rec.title;
    if (rec.description) return rec.description;
    const payload = rec.data ?? rec.payload;
    return payload ? JSON.stringify(payload) : "Untitled recommendation";
  };

  const formatDate = (value: any) => {
    if (!value) return "";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">AI Recommendations</h1>
          <p className="text-muted-foreground">Review and approve AI-generated recommendations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="reorder">Reorder</SelectItem>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="pricing">Pricing</SelectItem>
            <SelectItem value="allocation">Allocation</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading recommendations...</div>
      ) : !recommendations || recommendations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No recommendations found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec: any) => (
            <Card key={rec.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <Badge className={getTypeColor(rec.type)}>{rec.type}</Badge>
                      <Badge variant={getStatusVariant(rec.status)}>{rec.status}</Badge>
                    </div>
                    <CardTitle className="text-base font-medium">{getTitle(rec)}</CardTitle>
                    {rec.createdAt && (
                      <CardDescription className="text-xs">{formatDate(rec.createdAt)}</CardDescription>
                    )}
                  </div>
                  {rec.status === "pending" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate({ id: rec.id })}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectId(rec.id);
                          setRejectReason("");
                        }}
                        disabled={rejectMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              {rec.description && rec.title && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog
        open={rejectId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectId(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Recommendation</DialogTitle>
            <DialogDescription>Optionally provide a reason for rejecting this recommendation.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Why is this being rejected?"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectId !== null) {
                  rejectMutation.mutate({
                    id: rejectId,
                    reason: rejectReason.trim() || undefined,
                  });
                }
              }}
              disabled={rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
