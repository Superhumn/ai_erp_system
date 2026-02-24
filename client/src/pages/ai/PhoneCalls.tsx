import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Loader2,
  Bot,
  FileText,
  RefreshCw,
  Plus,
  BookOpen,
  BarChart3,
  MessageSquare,
  Timer,
  Building2,
  Truck,
  Package,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  queued: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: Clock, label: "Queued" },
  preparing: { color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: Loader2, label: "Preparing" },
  in_progress: { color: "bg-purple-500/10 text-purple-500 border-purple-500/20", icon: PhoneCall, label: "In Progress" },
  on_hold: { color: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: Clock, label: "On Hold" },
  completed: { color: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle, label: "Completed" },
  failed: { color: "bg-red-500/10 text-red-500 border-red-500/20", icon: XCircle, label: "Failed" },
  cancelled: { color: "bg-gray-500/10 text-gray-500 border-gray-500/20", icon: PhoneOff, label: "Cancelled" },
  requires_human: { color: "bg-amber-500/10 text-amber-500 border-amber-500/20", icon: AlertTriangle, label: "Needs Human" },
};

const outcomeConfig: Record<string, { color: string; label: string }> = {
  resolved: { color: "bg-green-500/10 text-green-500 border-green-500/20", label: "Resolved" },
  partial_resolution: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", label: "Partial Resolution" },
  escalated_to_human: { color: "bg-amber-500/10 text-amber-500 border-amber-500/20", label: "Escalated" },
  callback_scheduled: { color: "bg-blue-500/10 text-blue-500 border-blue-500/20", label: "Callback Scheduled" },
  needs_followup: { color: "bg-orange-500/10 text-orange-500 border-orange-500/20", label: "Needs Followup" },
  failed: { color: "bg-red-500/10 text-red-500 border-red-500/20", label: "Failed" },
  voicemail_left: { color: "bg-gray-500/10 text-gray-500 border-gray-500/20", label: "Voicemail Left" },
};

const callTypeLabels: Record<string, string> = {
  vendor_complaint: "Vendor Complaint",
  shipping_inquiry: "Shipping Inquiry",
  order_status: "Order Status",
  billing_dispute: "Billing Dispute",
  return_request: "Return Request",
  account_inquiry: "Account Inquiry",
  service_cancellation: "Service Cancellation",
  delivery_reschedule: "Delivery Reschedule",
  price_negotiation: "Price Negotiation",
  general_inquiry: "General Inquiry",
  claims_filing: "Claims Filing",
  payment_followup: "Payment Follow-up",
};

export default function PhoneCalls() {
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [showNewCallDialog, setShowNewCallDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState<number | null>(null);

  // Queries
  const callsQuery = trpc.phoneCalls.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined,
    { refetchInterval: 10000 }
  );
  const statsQuery = trpc.phoneCalls.stats.useQuery(undefined, { refetchInterval: 30000 });
  const playbooksQuery = trpc.phoneCalls.playbooks.list.useQuery();
  const callDetailQuery = trpc.phoneCalls.get.useQuery(
    { id: selectedCall?.id },
    { enabled: !!selectedCall?.id }
  );

  // Mutations
  const createCall = trpc.phoneCalls.create.useMutation({
    onSuccess: () => {
      toast.success("Phone call created and queued for approval");
      setShowNewCallDialog(false);
      callsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to create call: ${err.message}`),
  });

  const approveCall = trpc.phoneCalls.approve.useMutation({
    onSuccess: () => {
      toast.success("Call approved");
      callsQuery.refetch();
      if (callDetailQuery.data) callDetailQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to approve: ${err.message}`),
  });

  const rejectCall = trpc.phoneCalls.reject.useMutation({
    onSuccess: () => {
      toast.success("Call rejected");
      setShowRejectDialog(null);
      setRejectReason("");
      callsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to reject: ${err.message}`),
  });

  const executeCall = trpc.phoneCalls.execute.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Call initiated");
      } else {
        toast.error(data.message || "Failed to start call");
      }
      callsQuery.refetch();
      if (callDetailQuery.data) callDetailQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to execute: ${err.message}`),
  });

  const cancelCall = trpc.phoneCalls.cancel.useMutation({
    onSuccess: () => {
      toast.success("Call cancelled");
      callsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to cancel: ${err.message}`),
  });

  const seedPlaybooks = trpc.phoneCalls.playbooks.seed.useMutation({
    onSuccess: (data) => {
      toast.success(`Seeded ${data.seeded} playbooks (${data.skipped} already existed)`);
      playbooksQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to seed: ${err.message}`),
  });

  const stats = statsQuery.data;
  const calls = callsQuery.data || [];
  const playbooks = playbooksQuery.data || [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6" />
            AI Phone Calls
          </h1>
          <p className="text-muted-foreground mt-1">
            Autonomous AI-powered phone calls to vendors, carriers, and service providers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              callsQuery.refetch();
              statsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={() => setShowNewCallDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Call
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatsCard label="Total Calls" value={stats.total} icon={Phone} />
          <StatsCard label="Completed" value={stats.completed} icon={CheckCircle} color="text-green-500" />
          <StatsCard label="In Progress" value={stats.inProgress} icon={PhoneCall} color="text-purple-500" />
          <StatsCard label="Queued" value={stats.queued} icon={Clock} color="text-yellow-500" />
          <StatsCard label="Failed" value={stats.failed} icon={XCircle} color="text-red-500" />
          <StatsCard label="Resolved" value={stats.resolved} icon={CheckCircle} color="text-emerald-500" />
          <StatsCard label="Avg Duration" value={formatDuration(stats.avgDuration)} icon={Timer} />
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="calls" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calls">Phone Calls</TabsTrigger>
          <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
        </TabsList>

        {/* Phone Calls Tab */}
        <TabsContent value="calls" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-2 items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="requires_human">Needs Human</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {calls.length} call{calls.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Calls List */}
          <div className="grid gap-3">
            {callsQuery.isLoading ? (
              <Card className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Loading calls...</p>
              </Card>
            ) : calls.length === 0 ? (
              <Card className="p-8 text-center">
                <Phone className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">No phone calls yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create a new call or ask the AI assistant to make one
                </p>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => setShowNewCallDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create First Call
                </Button>
              </Card>
            ) : (
              calls.map((call: any) => (
                <CallCard
                  key={call.id}
                  call={call}
                  onSelect={() => setSelectedCall(call)}
                  onApprove={() => approveCall.mutate({ id: call.id })}
                  onReject={() => setShowRejectDialog(call.id)}
                  onExecute={() => executeCall.mutate({ id: call.id })}
                  onCancel={() => cancelCall.mutate({ id: call.id })}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* Playbooks Tab */}
        <TabsContent value="playbooks" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Pre-built call scripts and IVR navigation guides for common vendors
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedPlaybooks.mutate()}
              disabled={seedPlaybooks.isPending}
            >
              {seedPlaybooks.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4 mr-1" />
              )}
              Seed Default Playbooks
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playbooks.length === 0 ? (
              <Card className="col-span-full p-8 text-center">
                <BookOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">No playbooks yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click "Seed Default Playbooks" to add pre-built templates for UPS, FedEx, USPS, and more
                </p>
              </Card>
            ) : (
              playbooks.map((pb: any) => (
                <PlaybookCard key={pb.id || pb.playbookKey} playbook={pb} />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Call Detail Dialog */}
      <CallDetailDialog
        call={callDetailQuery.data}
        isLoading={callDetailQuery.isLoading}
        isOpen={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        onApprove={(id) => approveCall.mutate({ id })}
        onExecute={(id) => executeCall.mutate({ id })}
      />

      {/* New Call Dialog */}
      <NewCallDialog
        isOpen={showNewCallDialog}
        onClose={() => setShowNewCallDialog(false)}
        onSubmit={(data) => createCall.mutate(data)}
        isSubmitting={createCall.isPending}
        playbooks={playbooks}
      />

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog !== null} onOpenChange={() => setShowRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Phone Call</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this call.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (showRejectDialog) {
                  rejectCall.mutate({ id: showRejectDialog, reason: rejectReason });
                }
              }}
              disabled={rejectCall.isPending}
            >
              Reject Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatsCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: any;
  color?: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </Card>
  );
}

function CallCard({
  call,
  onSelect,
  onApprove,
  onReject,
  onExecute,
  onCancel,
}: {
  call: any;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onExecute: () => void;
  onCancel: () => void;
}) {
  const status = statusConfig[call.status] || statusConfig.queued;
  const StatusIcon = status.icon;
  const outcome = call.outcome ? outcomeConfig[call.outcome] : null;

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={status.color}>
                <StatusIcon className={`h-3 w-3 mr-1 ${call.status === "in_progress" ? "animate-pulse" : ""}`} />
                {status.label}
              </Badge>
              {outcome && (
                <Badge variant="outline" className={outcome.color}>
                  {outcome.label}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {callTypeLabels[call.callType] || call.callType}
              </Badge>
            </div>

            <h3 className="font-medium truncate">{call.subject}</h3>

            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {call.targetCompany}
              </span>
              {call.targetPhoneNumber && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {call.targetPhoneNumber}
                </span>
              )}
              {call.durationSeconds && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  {formatDuration(call.durationSeconds)}
                </span>
              )}
              <span>{formatDate(call.createdAt)}</span>
            </div>

            {call.resolution && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                {call.resolution}
              </p>
            )}

            {call.referenceNumber && (
              <p className="text-xs text-muted-foreground mt-1">
                Ref: {call.referenceNumber}
              </p>
            )}
          </div>

          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {call.status === "queued" && (
              <>
                <Button size="sm" variant="outline" onClick={onApprove}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
                <Button size="sm" variant="ghost" onClick={onReject}>
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {call.status === "preparing" && (
              <Button size="sm" onClick={onExecute}>
                <Play className="h-3.5 w-3.5 mr-1" />
                Start Call
              </Button>
            )}
            {(call.status === "queued" || call.status === "preparing") && (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                <PhoneOff className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlaybookCard({ playbook }: { playbook: any }) {
  const companyIcons: Record<string, string> = {
    UPS: "brown",
    FedEx: "purple",
    USPS: "blue",
    "DHL Express": "red",
    "Amazon Seller Support": "orange",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{playbook.name}</CardTitle>
          {playbook.isActive && (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
              Active
            </Badge>
          )}
        </div>
        <CardDescription>{playbook.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>{playbook.targetCompany}</span>
          </div>
          {playbook.phoneNumber && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{playbook.phoneNumber}</span>
            </div>
          )}
          {playbook.department && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{playbook.department}</span>
            </div>
          )}
          {playbook.operatingHours && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{playbook.operatingHours}</span>
            </div>
          )}
        </div>
        {playbook.totalCalls > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t text-xs text-muted-foreground">
            <span>{playbook.totalCalls} calls made</span>
            {playbook.successRate && (
              <span>{parseFloat(playbook.successRate).toFixed(0)}% success</span>
            )}
            {playbook.avgCallDuration && (
              <span>avg {formatDuration(playbook.avgCallDuration)}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CallDetailDialog({
  call,
  isLoading,
  isOpen,
  onClose,
  onApprove,
  onExecute,
}: {
  call: any;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (id: number) => void;
  onExecute: (id: number) => void;
}) {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5" />
            {isLoading ? "Loading..." : call?.subject || "Call Details"}
          </DialogTitle>
          {call && (
            <DialogDescription>
              {call.callNumber} - {call.targetCompany}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : call ? (
          <ScrollArea className="flex-1 overflow-auto">
            <div className="space-y-4 pr-4">
              {/* Status & Info */}
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Status" value={
                  <Badge variant="outline" className={statusConfig[call.status]?.color}>
                    {statusConfig[call.status]?.label || call.status}
                  </Badge>
                } />
                <InfoField label="Call Type" value={callTypeLabels[call.callType] || call.callType} />
                <InfoField label="Company" value={call.targetCompany} />
                <InfoField label="Phone" value={call.targetPhoneNumber || "-"} />
                <InfoField label="Department" value={call.targetDepartment || "-"} />
                <InfoField label="Priority" value={
                  <Badge variant="outline">{call.priority}</Badge>
                } />
                {call.durationSeconds && (
                  <InfoField label="Duration" value={formatDuration(call.durationSeconds)} />
                )}
                {call.waitTimeSeconds && (
                  <InfoField label="Wait Time" value={formatDuration(call.waitTimeSeconds)} />
                )}
                {call.referenceNumber && (
                  <InfoField label="Reference #" value={call.referenceNumber} />
                )}
                {call.outcome && (
                  <InfoField label="Outcome" value={
                    <Badge variant="outline" className={outcomeConfig[call.outcome]?.color}>
                      {outcomeConfig[call.outcome]?.label || call.outcome}
                    </Badge>
                  } />
                )}
              </div>

              {/* Objective */}
              <div>
                <h4 className="text-sm font-medium mb-1">Objective</h4>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded p-3">{call.objective}</p>
              </div>

              {/* Resolution */}
              {call.resolution && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Resolution</h4>
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded p-3">{call.resolution}</p>
                </div>
              )}

              {/* Summary */}
              {call.transcriptSummary && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Call Summary</h4>
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded p-3">{call.transcriptSummary}</p>
                </div>
              )}

              {/* Follow-up Actions */}
              {call.followupActions && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Follow-up Actions</h4>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 bg-muted/50 rounded p-3">
                    {(typeof call.followupActions === "string"
                      ? JSON.parse(call.followupActions)
                      : call.followupActions
                    ).map((action: string, i: number) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transcript */}
              {call.transcript && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Transcript</h4>
                  <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-3 whitespace-pre-wrap max-h-64 overflow-auto font-mono">
                    {call.transcript}
                  </pre>
                </div>
              )}

              {/* Call Logs */}
              {call.logs && call.logs.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Call Events</h4>
                  <div className="space-y-2">
                    {call.logs.map((log: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs border-l-2 border-muted pl-3 py-1"
                      >
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {log.eventType.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-muted-foreground flex-1">{log.message}</span>
                        <span className="text-muted-foreground/60 shrink-0">
                          {formatDate(log.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {(call.status === "queued" || call.status === "preparing") && (
                <div className="flex gap-2 pt-2 border-t">
                  {call.status === "queued" && (
                    <Button size="sm" onClick={() => onApprove(call.id)}>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve Call
                    </Button>
                  )}
                  {call.status === "preparing" && (
                    <Button size="sm" onClick={() => onExecute(call.id)}>
                      <Play className="h-4 w-4 mr-1" />
                      Start Call
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground">Call not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function NewCallDialog({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  playbooks,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
  playbooks: any[];
}) {
  const [form, setForm] = useState({
    callType: "general_inquiry",
    targetCompany: "",
    targetPhoneNumber: "",
    targetDepartment: "",
    subject: "",
    objective: "",
    priority: "medium",
    playbookId: "",
  });

  const handlePlaybookSelect = (key: string) => {
    if (key === "none") {
      setForm((prev) => ({ ...prev, playbookId: "" }));
      return;
    }
    const pb = playbooks.find((p: any) => p.playbookKey === key);
    if (pb) {
      setForm((prev) => ({
        ...prev,
        playbookId: key,
        targetCompany: pb.targetCompany || prev.targetCompany,
        targetPhoneNumber: pb.phoneNumber || prev.targetPhoneNumber,
        targetDepartment: pb.department || prev.targetDepartment,
      }));
    }
  };

  const handleSubmit = () => {
    if (!form.targetCompany || !form.subject || !form.objective) {
      toast.error("Please fill in all required fields");
      return;
    }
    onSubmit({
      callType: form.callType as any,
      targetCompany: form.targetCompany,
      targetPhoneNumber: form.targetPhoneNumber || undefined,
      targetDepartment: form.targetDepartment || undefined,
      subject: form.subject,
      objective: form.objective,
      priority: form.priority as any,
      playbookId: form.playbookId || undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            New AI Phone Call
          </DialogTitle>
          <DialogDescription>
            Set up an AI-powered phone call. The AI agent will handle navigation, conversation,
            and resolution autonomously.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Playbook Selector */}
          {playbooks.length > 0 && (
            <div>
              <Label>Use Playbook (Optional)</Label>
              <Select
                value={form.playbookId || "none"}
                onValueChange={handlePlaybookSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a playbook..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No playbook - Custom call</SelectItem>
                  {playbooks.map((pb: any) => (
                    <SelectItem key={pb.playbookKey || pb.id} value={pb.playbookKey}>
                      {pb.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Call Type *</Label>
              <Select
                value={form.callType}
                onValueChange={(v) => setForm((prev) => ({ ...prev, callType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(callTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((prev) => ({ ...prev, priority: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Company to Call *</Label>
            <Input
              placeholder="e.g., UPS, FedEx, Amazon..."
              value={form.targetCompany}
              onChange={(e) => setForm((prev) => ({ ...prev, targetCompany: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone Number</Label>
              <Input
                placeholder="e.g., 1-800-742-5877"
                value={form.targetPhoneNumber}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, targetPhoneNumber: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Department</Label>
              <Input
                placeholder="e.g., Claims Department"
                value={form.targetDepartment}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, targetDepartment: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <Label>Subject *</Label>
            <Input
              placeholder="e.g., File claim for damaged package #1Z999AA..."
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            />
          </div>

          <div>
            <Label>Objective *</Label>
            <Textarea
              placeholder="Describe what the AI agent should accomplish on this call. Include any relevant reference numbers, tracking numbers, or account information."
              value={form.objective}
              onChange={(e) => setForm((prev) => ({ ...prev, objective: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Phone className="h-4 w-4 mr-1" />
            )}
            Create Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
