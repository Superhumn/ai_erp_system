import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Play,
  FileText,
  ShoppingCart,
  Mail,
  Package,
  Truck,
  DollarSign,
  RefreshCw,
  Bot,
  Eye,
  Loader2,
  ExternalLink,
  Users,
  Building2,
  Boxes,
  Edit,
  Info,
  Mic,
  Settings,
  Trash2,
  Plus,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeSuggestedSource(taskData: Record<string, unknown> | null | undefined): {
  kind: "email" | "fireflies" | "text";
  label: string;
} {
  const raw = taskData?.source as string | undefined;
  if (raw === "fireflies" || taskData?.sourceMeeting) {
    return { kind: "fireflies", label: "Fireflies" };
  }
  if (raw === "email" || raw === "email_scan" || taskData?.sourceEmail) {
    return { kind: "email", label: "Email" };
  }
  if (raw === "text" || taskData?.sourceText) {
    return { kind: "text", label: "Text" };
  }
  return { kind: "text", label: "Text" };
}

function SuggestedSourceDialog({
  task,
  open,
  onOpenChange,
}: {
  task: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  let taskData: Record<string, any> = {};
  try {
    taskData = JSON.parse(task?.taskData || "{}");
  } catch {
    /* ignore */
  }
  const src = normalizeSuggestedSource(taskData);

  const messageId =
    typeof taskData?.sourceEmail?.messageId === "string" ? taskData.sourceEmail.messageId : undefined;
  const { data: emailFromDb, isLoading: emailLoading } = trpc.emailScanning.getByMessageId.useQuery(
    { messageId: messageId! },
    { enabled: open && src.kind === "email" && !!messageId },
  );

  const meetingIdRaw = taskData?.sourceMeeting?.meetingId;
  const meetingId =
    typeof meetingIdRaw === "number" && !Number.isNaN(meetingIdRaw) && meetingIdRaw > 0
      ? meetingIdRaw
      : undefined;
  const ffId =
    typeof taskData?.sourceMeeting?.firefliesId === "string" ? taskData.sourceMeeting.firefliesId : undefined;

  const meetingQueryInput =
    meetingId != null ? { id: meetingId } : ffId ? { firefliesId: ffId } : null;

  const { data: meeting, isLoading: meetingLoading } = trpc.fireflies.meetings.get.useQuery(
    meetingQueryInput as { id: number } | { firefliesId: string },
    { enabled: open && src.kind === "fireflies" && meetingQueryInput != null },
  );

  const embeddedEmailBody =
    typeof taskData?.sourceEmail?.bodyText === "string" ? taskData.sourceEmail.bodyText : "";

  let summaryOverview: string | null = null;
  if (meeting?.summary) {
    try {
      const s = typeof meeting.summary === "string" ? JSON.parse(meeting.summary) : meeting.summary;
      summaryOverview = typeof s?.overview === "string" ? s.overview : null;
    } catch {
      summaryOverview = null;
    }
  }

  let participantsParsed: Array<{ name?: string; email?: string; displayName?: string }> = [];
  if (meeting?.participants) {
    try {
      const p = typeof meeting.participants === "string" ? JSON.parse(meeting.participants) : meeting.participants;
      participantsParsed = Array.isArray(p) ? p : [];
    } catch {
      participantsParsed = [];
    }
  }

  const emailSubject = emailFromDb?.subject ?? taskData?.sourceEmail?.subject;
  const emailFrom = emailFromDb
    ? [emailFromDb.fromName, emailFromDb.fromEmail].filter(Boolean).join(" · ") || String(emailFromDb.fromEmail ?? "")
    : taskData?.sourceEmail?.from;

  const bodyToShow =
    emailFromDb?.bodyText ||
    emailFromDb?.bodyHtml?.replace(/<[^>]+>/g, " ") ||
    embeddedEmailBody ||
    "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {src.kind === "email" && (
              <>
                <Mail className="h-5 w-5 shrink-0" /> Email
              </>
            )}
            {src.kind === "fireflies" && (
              <>
                <Mic className="h-5 w-5 shrink-0" /> Fireflies meeting
              </>
            )}
            {src.kind === "text" && (
              <>
                <FileText className="h-5 w-5 shrink-0" /> Text
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            Full source content for this suggestion (read-only).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[min(60vh,520px)] pr-3">
          {src.kind === "email" && (
            <div className="space-y-3 text-sm">
              {emailLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading stored email…
                </div>
              )}
              {!emailLoading && (
                <>
                  {emailFromDb?.id != null && (
                    <p>
                      <Link
                        href={`/operations/email-inbox?emailId=${emailFromDb.id}`}
                        className="text-primary inline-flex items-center gap-1 hover:underline font-medium"
                      >
                        Open in Email Inbox
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <span className="text-xs text-muted-foreground block mt-1">
                        Stored as inbound email #{emailFromDb.id}. Select it in the list if needed.
                      </span>
                    </p>
                  )}
                  <p>
                    <span className="font-medium">Subject:</span> {emailSubject || "—"}
                  </p>
                  <p>
                    <span className="font-medium">From:</span> {emailFrom || "—"}
                  </p>
                  <div className="rounded-md border bg-muted/40 p-3 whitespace-pre-wrap text-muted-foreground">
                    {bodyToShow || "No body was captured for this message."}
                  </div>
                </>
              )}
            </div>
          )}

          {src.kind === "fireflies" && (
            <div className="space-y-3 text-sm">
              {meetingLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading meeting…
                </div>
              )}
              {!meetingLoading && meeting && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={meeting?.id != null ? `/meetings?meetingId=${meeting.id}` : ffId ? `/meetings?firefliesId=${encodeURIComponent(ffId)}` : "/meetings"}
                      className="text-primary inline-flex items-center gap-1 hover:underline font-medium"
                    >
                      Open Meetings
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    {meeting.transcriptUrl && (
                      <a
                        href={meeting.transcriptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 hover:underline font-medium"
                      >
                        Fireflies transcript
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="font-semibold text-foreground">{meeting.title}</p>
                  {meeting.date && (
                    <p className="text-muted-foreground">
                      {formatDate(meeting.date)}
                      {meeting.duration != null ? ` · ${meeting.duration} min` : ""}
                    </p>
                  )}
                  {participantsParsed.length > 0 && (
                    <div>
                      <p className="font-medium mb-1">Participants</p>
                      <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                        {participantsParsed.map((p, i) => (
                          <li key={i}>
                            {typeof p === "string"
                              ? p
                              : p.displayName || p.name || p.email || "—"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summaryOverview && (
                    <div>
                      <p className="font-medium mb-1">Summary</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{summaryOverview}</p>
                    </div>
                  )}
                  {meeting.transcriptText && (
                    <div>
                      <p className="font-medium mb-1">Transcript</p>
                      <div className="rounded-md border bg-muted/40 p-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-muted-foreground text-xs">
                        {meeting.transcriptText}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!meetingLoading && !meeting && (
                <div className="space-y-2 text-muted-foreground">
                  <p className="font-medium text-foreground">{taskData?.sourceMeeting?.title || "Meeting"}</p>
                  <p>
                    This suggestion does not match a stored meeting, or the meeting was removed. Check Fireflies sync
                    or process the meeting from the Meetings page.
                  </p>
                  <Link
                    href={ffId ? `/meetings?firefliesId=${encodeURIComponent(ffId)}` : "/meetings"}
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    Go to Meetings <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {src.kind === "text" && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Title:</span> {taskData?.name || "—"}
              </p>
              {typeof taskData?.sourceText === "string" && taskData.sourceText.length > 0 ? (
                <div className="rounded-md border bg-muted/40 p-3 whitespace-pre-wrap text-muted-foreground">
                  {taskData.sourceText}
                </div>
              ) : (
                <div className="rounded-md border bg-muted/40 p-3 whitespace-pre-wrap text-muted-foreground">
                  {taskData?.description || "No additional text was stored with this suggestion."}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const taskTypeIcons: Record<string, any> = {
  generate_po: ShoppingCart,
  send_rfq: FileText,
  send_quote_request: FileText,
  send_email: Mail,
  update_inventory: Package,
  create_shipment: Truck,
  generate_invoice: DollarSign,
  reconcile_payment: DollarSign,
  reorder_materials: Package,
  vendor_followup: Mail,
  create_crm_deal: Building2,
};

const taskTypeLabels: Record<string, string> = {
  generate_po: "Generate PO",
  send_rfq: "Send RFQ",
  send_quote_request: "Quote Request",
  send_email: "Send Email",
  update_inventory: "Update Inventory",
  create_shipment: "Create Shipment",
  generate_invoice: "Generate Invoice",
  reconcile_payment: "Reconcile Payment",
  reorder_materials: "Reorder Materials",
  vendor_followup: "Vendor Follow-up",
  query: "Suggested Task",
  create_crm_deal: "Create CRM Deal",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};

export default function ApprovalQueue() {
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [editedTaskData, setEditedTaskData] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [sourceViewerTask, setSourceViewerTask] = useState<any>(null);
  
  const utils = trpc.useUtils();
  
  const { data: pendingTasks, isLoading: pendingLoading } = trpc.aiAgent.tasks.pendingApprovals.useQuery();
  const { data: allTasks, isLoading: allLoading } = trpc.aiAgent.tasks.list.useQuery({});
  const { data: logs } = trpc.aiAgent.logs.list.useQuery({ limit: 50 });
  const { data: teamMembers } = trpc.team.list.useQuery(undefined, { retry: false });
  const { data: projects } = trpc.projects.list.useQuery();
  
  const approveMutation = trpc.aiAgent.tasks.approve.useMutation({
    onSuccess: () => {
      toast.success("Task approved successfully");
      utils.aiAgent.tasks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  
  const rejectMutation = trpc.aiAgent.tasks.reject.useMutation({
    onSuccess: () => {
      toast.success("Task rejected");
      utils.aiAgent.tasks.invalidate();
      setIsRejectDialogOpen(false);
      setRejectReason("");
    },
    onError: (err) => toast.error(err.message),
  });
  
  const executeMutation = trpc.aiAgent.tasks.execute.useMutation({
    onSuccess: () => {
      toast.success("Task executed successfully");
      utils.aiAgent.tasks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  
  const updateMutation = trpc.aiAgent.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated successfully");
      utils.aiAgent.tasks.invalidate();
      setIsDetailDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  
  const handleApprove = (taskId: number) => {
    approveMutation.mutate({ id: taskId });
  };
  
  const handleReject = (task: any) => {
    setSelectedTask(task);
    setIsRejectDialogOpen(true);
  };
  
  const confirmReject = () => {
    if (selectedTask) {
      rejectMutation.mutate({ id: selectedTask.id, reason: rejectReason });
    }
  };
  
  const handleExecute = (taskId: number) => {
    executeMutation.mutate({ id: taskId });
  };
  
  const handleViewTask = (task: any) => {
    setSelectedTask(task);
    setEditedTaskData(task.taskData || "{}");
    setIsDetailDialogOpen(true);
  };

  const updateTaskDataField = (field: string, value: unknown) => {
    try {
      const parsed = JSON.parse(editedTaskData || "{}");
      parsed[field] = value;
      setEditedTaskData(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore malformed JSON edits until user fixes them
    }
  };
  
  const handleSaveTaskData = () => {
    if (selectedTask) {
      try {
        // Validate JSON
        JSON.parse(editedTaskData);
        updateMutation.mutate({ 
          id: selectedTask.id, 
          taskData: editedTaskData 
        });
      } catch (e) {
        toast.error("Invalid JSON format");
      }
    }
  };
  
  const renderTaskCard = (task: any, showActions = true) => {
    const Icon = taskTypeIcons[task.taskType] || Bot;
    let taskData: any = {};
    try {
      taskData = JSON.parse(task.taskData || "{}");
    } catch {}
    const isSuggestedProjectTask = task.taskType === "query" && taskData.action === "create_project_task";
    const projectName = projects?.find((p: any) => p.id === taskData.projectId)?.name;
    const assigneeName = teamMembers?.find((u: any) => u.id === taskData.assigneeId)?.name;
    const title = isSuggestedProjectTask ? "Suggested Project Task" : (taskTypeLabels[task.taskType] || task.taskType);
    const suggestedSource = isSuggestedProjectTask ? normalizeSuggestedSource(taskData) : null;

    return (
      <Card key={task.id} className="mb-4 overflow-hidden">
        {suggestedSource && (
          <div className="flex flex-wrap items-center gap-2 px-6 py-2.5 bg-muted/30 border-b border-border/60">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              onClick={() => setSourceViewerTask(task)}
            >
              {suggestedSource.kind === "email" && <Mail className="h-3.5 w-3.5 shrink-0" />}
              {suggestedSource.kind === "fireflies" && <Mic className="h-3.5 w-3.5 shrink-0" />}
              {suggestedSource.kind === "text" && <FileText className="h-3.5 w-3.5 shrink-0" />}
              <span>{suggestedSource.label}</span>
              <ExternalLink className="h-3 w-3 opacity-70" />
            </button>
          </div>
        )}
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{title}</h3>
                  <Badge className={priorityColors[task.priority]}>
                    {task.priority}
                  </Badge>
                  <Badge className={statusColors[task.status]}>
                    {task.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                
                {/* Task-specific details */}
                {task.taskType === "generate_po" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Vendor:</strong> {taskData.vendorId ? (
                      <Link href={`/operations/procurement-hub?tab=vendors&id=${taskData.vendorId}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        {taskData.vendorName || "Unknown"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (taskData.vendorName || "Unknown")}</p>
                    <p><strong>Material:</strong> {taskData.materialId ? (
                      <Link href={`/operations/procurement-hub?tab=materials&id=${taskData.materialId}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        {taskData.materialName || "Unknown"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (taskData.materialName || "Unknown")}</p>
                    <p><strong>Quantity:</strong> {taskData.quantity} | <strong>Total:</strong> {formatCurrency(taskData.totalAmount)}</p>
                    {taskData.expectedDate && <p><strong>Expected:</strong> {formatDate(taskData.expectedDate)}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/operations/procurement-hub?tab=orders&id=${JSON.parse(task.resultData).poId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          PO #{JSON.parse(task.resultData).poNumber}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "send_rfq" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Material:</strong> {taskData.materialId ? (
                      <Link href={`/operations/procurement-hub?tab=materials&id=${taskData.materialId}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        {taskData.materialName || "Unknown"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (taskData.materialName || "Unknown")}</p>
                    <p><strong>Quantity:</strong> {taskData.quantity}</p>
                    <p><strong>Vendors:</strong> {taskData.vendorIds?.length || 0} selected</p>
                  </div>
                )}
                
                {task.taskType === "send_email" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>To:</strong> {taskData.to || "Unknown"}</p>
                    <p><strong>Subject:</strong> {taskData.subject || "No subject"}</p>
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Sent:</strong>{" "}
                        <Link href="/operations/email-inbox?tab=sent" className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View in Sent Emails
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}

                {isSuggestedProjectTask && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Task:</strong> {taskData.name || "Untitled task"}</p>
                    <p><strong>Project:</strong> {projectName || `Project #${taskData.projectId || "Unassigned"}`}</p>
                    <p><strong>Assignee:</strong> {assigneeName || "Unassigned"}</p>
                    {taskData.domain && <p><strong>Domain:</strong> {taskData.domain}</p>}
                  </div>
                )}
                
                {/* Entity creation tasks with result links */}
                {task.taskType === "create_vendor" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Vendor Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.email && <p><strong>Email:</strong> {taskData.email}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/operations/procurement-hub?tab=vendors&id=${JSON.parse(task.resultData).vendorId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Vendor
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "create_material" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Material Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.sku && <p><strong>SKU:</strong> {taskData.sku}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/operations/procurement-hub?tab=materials&id=${JSON.parse(task.resultData).materialId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Material
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "create_product" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Product Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.sku && <p><strong>SKU:</strong> {taskData.sku}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/sales/products?id=${JSON.parse(task.resultData).productId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Product
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "create_customer" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Customer Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.email && <p><strong>Email:</strong> {taskData.email}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/sales/customers?id=${JSON.parse(task.resultData).customerId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Customer
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}

                {task.taskType === "create_crm_deal" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Company:</strong> {taskData.company || "Unknown"}</p>
                    {taskData.amount && <p><strong>Amount:</strong> {formatCurrency(taskData.amount)}</p>}
                    {taskData.stage && <p><strong>Stage:</strong> {taskData.stage}</p>}
                    {taskData.source && <p><strong>Source:</strong> {taskData.source}</p>}
                    {taskData.notes && <p className="line-clamp-2"><strong>Notes:</strong> {taskData.notes}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/crm`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Deal
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}

                {/* AI Reasoning */}
                {task.aiReasoning && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium">AI Reasoning</span>
                      {task.aiConfidence && (
                        <Badge variant="outline" className="text-xs">
                          {parseFloat(task.aiConfidence)}% confidence
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{task.aiReasoning}</p>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground mt-2">
                  Created: {formatDate(task.createdAt)}
                </p>
              </div>
            </div>
            
            {showActions && task.status === "pending_approval" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleViewTask(task)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Details
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(task)}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApprove(task.id)}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  onClick={async () => {
                    await handleApprove(task.id);
                    setTimeout(() => handleExecute(task.id), 500);
                  }}
                  disabled={approveMutation.isPending || executeMutation.isPending}
                >
                  {(approveMutation.isPending || executeMutation.isPending) ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Approve & Execute
                </Button>
              </div>
            )}
            
            {showActions && task.status === "approved" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleViewTask(task)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Details
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleExecute(task.id)}
                  disabled={executeMutation.isPending}
                >
                  {executeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Execute
                </Button>
              </div>
            )}
            
            {showActions && !["pending_approval", "approved"].includes(task.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleViewTask(task)}
              >
                <Eye className="h-4 w-4 mr-1" />
                View Details
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };
  
  const pendingCount = pendingTasks?.length || 0;
  const approvedCount = allTasks?.filter((t: any) => t.status === "approved").length || 0;
  const completedCount = allTasks?.filter((t: any) => t.status === "completed").length || 0;
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">AI Approval Queue</h1>
          <p className="text-muted-foreground">Review and approve AI-generated actions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAgentConfig(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Agent config
          </Button>
          <Button variant="outline" onClick={() => utils.aiAgent.tasks.invalidate()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-100">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-[-0.02em]">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-[-0.02em]">{approvedCount}</p>
                <p className="text-sm text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100">
                <Play className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-[-0.02em]">{completedCount}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-[-0.02em]">{allTasks?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending Approval
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-yellow-500">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Tasks</TabsTrigger>
          <TabsTrigger value="logs">Activity Log</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-4">
          {pendingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingTasks?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-semibold">All caught up!</h3>
                <p className="text-muted-foreground">No tasks pending approval</p>
              </CardContent>
            </Card>
          ) : (
            pendingTasks?.map((task: any) => renderTaskCard(task))
          )}
        </TabsContent>
        
        <TabsContent value="all" className="mt-4">
          {allLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : allTasks?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No tasks yet</h3>
                <p className="text-muted-foreground">AI agent tasks will appear here</p>
              </CardContent>
            </Card>
          ) : (
            allTasks?.map((task: any) => renderTaskCard(task))
          )}
        </TabsContent>
        
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>Recent AI agent activity</CardDescription>
            </CardHeader>
            <CardContent>
              {logs?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {logs?.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className={`p-1.5 rounded ${
                        log.status === "success" ? "bg-green-100" :
                        log.status === "error" ? "bg-red-100" :
                        log.status === "warning" ? "bg-yellow-100" :
                        "bg-blue-100"
                      }`}>
                        {log.status === "success" ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                         log.status === "error" ? <XCircle className="h-4 w-4 text-red-600" /> :
                         log.status === "warning" ? <AlertTriangle className="h-4 w-4 text-yellow-600" /> :
                         <Eye className="h-4 w-4 text-blue-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{log.action.replace(/_/g, " ")}</p>
                        <p className="text-sm text-muted-foreground">{log.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Task</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this task.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Task Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={(open) => {
        setIsDetailDialogOpen(open);
        if (!open) {
          // Reset state when dialog closes
          setSelectedTask(null);
          setEditedTaskData("");
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Task Details
            </DialogTitle>
            <DialogDescription>
              {selectedTask && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={priorityColors[selectedTask.priority]}>
                    {selectedTask.priority}
                  </Badge>
                  <Badge className={statusColors[selectedTask.status]}>
                    {selectedTask.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    ID: #{selectedTask.id}
                  </span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Task Type</label>
                  <p className="text-sm text-muted-foreground">
                    {taskTypeLabels[selectedTask.taskType] || selectedTask.taskType}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Created</label>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedTask.createdAt)}
                  </p>
                </div>
              </div>
              
              {/* AI Reasoning */}
              {selectedTask.aiReasoning && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    AI Reasoning
                    {selectedTask.aiConfidence && (
                      <Badge variant="outline" className="text-xs">
                        {parseFloat(selectedTask.aiConfidence).toFixed(1)}% confidence
                      </Badge>
                    )}
                  </label>
                  <p className="text-sm text-muted-foreground mt-1 p-3 bg-muted/50 rounded">
                    {selectedTask.aiReasoning}
                  </p>
                </div>
              )}
              
              {/* Task Data - Editable for pending/approved tasks */}
              <div>
                <label className="text-sm font-medium flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" />
                  Task Data
                  {['pending_approval', 'approved'].includes(selectedTask.status) && (
                    <Badge variant="outline" className="text-xs">
                      Editable
                    </Badge>
                  )}
                </label>
                {['pending_approval', 'approved'].includes(selectedTask.status) ? (
                  <Textarea
                    value={editedTaskData}
                    onChange={(e) => setEditedTaskData(e.target.value)}
                    className="font-mono text-xs"
                    rows={10}
                    placeholder='{"key": "value"}'
                  />
                ) : (
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedTask.taskData || "{}"), null, 2);
                      } catch {
                        return selectedTask.taskData || "{}";
                      }
                    })()}
                  </pre>
                )}
              </div>

              {selectedTask.taskType === "query" && (() => {
                try {
                  const parsed = JSON.parse(editedTaskData || "{}");
                  if (parsed.action !== "create_project_task") return null;
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Project</label>
                        <Select
                          value={parsed.projectId ? String(parsed.projectId) : ""}
                          onValueChange={(v) => updateTaskDataField("projectId", Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects?.map((p: any) => (
                              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Assignee</label>
                        <Select
                          value={parsed.assigneeId ? String(parsed.assigneeId) : "unassigned"}
                          onValueChange={(v) => updateTaskDataField("assigneeId", v === "unassigned" ? null : Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {teamMembers?.map((u: any) => (
                              <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email || `User #${u.id}`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}
              
              {/* Execution Result - shown for completed tasks */}
              {selectedTask.executionResult && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Execution Result
                  </label>
                  <pre className="text-xs bg-green-50 p-3 rounded border border-green-200 overflow-x-auto">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedTask.executionResult), null, 2);
                      } catch {
                        return selectedTask.executionResult;
                      }
                    })()}
                  </pre>
                </div>
              )}
              
              {/* Error Message - shown for failed tasks */}
              {selectedTask.errorMessage && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    Error Message
                  </label>
                  <p className="text-sm text-red-600 p-3 bg-red-50 rounded border border-red-200">
                    {selectedTask.errorMessage}
                  </p>
                </div>
              )}
              
              {/* Approval/Rejection Info */}
              {selectedTask.approvedAt && (
                <div className="p-3 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-700">
                    <strong>Approved:</strong> {formatDate(selectedTask.approvedAt)}
                  </p>
                </div>
              )}
              
              {selectedTask.rejectedAt && (
                <div className="p-3 bg-red-50 rounded border border-red-200">
                  <p className="text-sm text-red-700">
                    <strong>Rejected:</strong> {formatDate(selectedTask.rejectedAt)}
                  </p>
                  {selectedTask.rejectionReason && (
                    <p className="text-sm text-red-600 mt-1">
                      <strong>Reason:</strong> {selectedTask.rejectionReason}
                    </p>
                  )}
                </div>
              )}
              
              {selectedTask.executedAt && (
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-sm text-blue-700">
                    <strong>Executed:</strong> {formatDate(selectedTask.executedAt)}
                  </p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDetailDialogOpen(false)}
            >
              Close
            </Button>
            {selectedTask && ['pending_approval', 'approved'].includes(selectedTask.status) && (
              <Button
                onClick={handleSaveTaskData}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Edit className="h-4 w-4 mr-1" />
                )}
                Save Changes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SuggestedSourceDialog
        task={sourceViewerTask}
        open={!!sourceViewerTask}
        onOpenChange={(next) => {
          if (!next) setSourceViewerTask(null);
        }}
      />

      <AgentConfigDialog open={showAgentConfig} onClose={() => setShowAgentConfig(false)} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Agent config — manage aiAgent.rules and aiAgent.emailTemplates.
// Admin-gated server-side; the UI shows whatever the user can see
// and lets them open/edit/delete what they can mutate.
// ──────────────────────────────────────────────────────────────
const RULE_TYPES = [
  "inventory_reorder",
  "po_auto_generate",
  "rfq_auto_send",
  "vendor_followup",
  "payment_reminder",
  "shipment_tracking",
  "price_alert",
  "quality_check",
] as const;
type RuleType = (typeof RULE_TYPES)[number];

const TEMPLATE_TYPES = [
  "po_to_vendor",
  "rfq_request",
  "quote_request",
  "shipment_confirmation",
  "payment_reminder",
  "vendor_followup",
  "quality_issue",
  "general",
] as const;
type TemplateType = (typeof TEMPLATE_TYPES)[number];

function AgentConfigDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"rules" | "templates">("rules");

  // ─ Rules ─
  const { data: rules } = trpc.aiAgent.rules.list.useQuery({}, { enabled: open && tab === "rules" });
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [creatingRule, setCreatingRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    description: "",
    ruleType: "inventory_reorder" as RuleType,
    triggerCondition: "{}",
    actionConfig: "{}",
    requiresApproval: true,
    autoApproveThreshold: "",
  });

  const createRule = trpc.aiAgent.rules.create.useMutation({
    onSuccess: () => {
      toast.success("Rule created");
      setCreatingRule(false);
      utils.aiAgent.rules.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRule = trpc.aiAgent.rules.update.useMutation({
    onSuccess: () => {
      toast.success("Rule updated");
      setEditingRule(null);
      utils.aiAgent.rules.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ─ Templates ─
  const { data: templates } = trpc.aiAgent.emailTemplates.list.useQuery({}, { enabled: open && tab === "templates" });
  const [editingTpl, setEditingTpl] = useState<any | null>(null);
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [tplForm, setTplForm] = useState({
    name: "",
    templateType: "general" as TemplateType,
    subject: "",
    bodyTemplate: "",
    isDefault: false,
  });

  const createTpl = trpc.aiAgent.emailTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Email template created");
      setCreatingTpl(false);
      utils.aiAgent.emailTemplates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTpl = trpc.aiAgent.emailTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Email template updated");
      setEditingTpl(null);
      utils.aiAgent.emailTemplates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreateRule = () => {
    setRuleForm({
      name: "",
      description: "",
      ruleType: "inventory_reorder",
      triggerCondition: "{}",
      actionConfig: "{}",
      requiresApproval: true,
      autoApproveThreshold: "",
    });
    setCreatingRule(true);
  };
  const openEditRule = (r: any) => {
    setRuleForm({
      name: r.name || "",
      description: r.description || "",
      ruleType: (r.ruleType || "inventory_reorder") as RuleType,
      triggerCondition: r.triggerCondition || "{}",
      actionConfig: r.actionConfig || "{}",
      requiresApproval: r.requiresApproval !== false,
      autoApproveThreshold: r.autoApproveThreshold || "",
    });
    setEditingRule(r);
  };

  const openCreateTpl = () => {
    setTplForm({ name: "", templateType: "general", subject: "", bodyTemplate: "", isDefault: false });
    setCreatingTpl(true);
  };
  const openEditTpl = (t: any) => {
    setTplForm({
      name: t.name || "",
      templateType: (t.templateType || "general") as TemplateType,
      subject: t.subject || "",
      bodyTemplate: t.bodyTemplate || "",
      isDefault: !!t.isDefault,
    });
    setEditingTpl(t);
  };

  const submitRule = () => {
    if (!ruleForm.name.trim()) return;
    if (editingRule) {
      updateRule.mutate({
        id: editingRule.id,
        name: ruleForm.name.trim(),
        description: ruleForm.description || undefined,
        triggerCondition: ruleForm.triggerCondition,
        actionConfig: ruleForm.actionConfig,
        requiresApproval: ruleForm.requiresApproval,
        autoApproveThreshold: ruleForm.autoApproveThreshold || undefined,
      });
    } else {
      createRule.mutate({
        name: ruleForm.name.trim(),
        description: ruleForm.description || undefined,
        ruleType: ruleForm.ruleType,
        triggerCondition: ruleForm.triggerCondition,
        actionConfig: ruleForm.actionConfig,
        requiresApproval: ruleForm.requiresApproval,
        autoApproveThreshold: ruleForm.autoApproveThreshold || undefined,
      });
    }
  };

  const submitTpl = () => {
    if (!tplForm.name.trim() || !tplForm.subject.trim() || !tplForm.bodyTemplate.trim()) return;
    if (editingTpl) {
      updateTpl.mutate({
        id: editingTpl.id,
        name: tplForm.name.trim(),
        subject: tplForm.subject.trim(),
        bodyTemplate: tplForm.bodyTemplate,
        isDefault: tplForm.isDefault,
      });
    } else {
      createTpl.mutate({
        name: tplForm.name.trim(),
        templateType: tplForm.templateType,
        subject: tplForm.subject.trim(),
        bodyTemplate: tplForm.bodyTemplate,
        isDefault: tplForm.isDefault,
      });
    }
  };

  const showingRuleForm = creatingRule || editingRule !== null;
  const showingTplForm = creatingTpl || editingTpl !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> AI agent config</DialogTitle>
          <DialogDescription>
            Manage automation rules and email templates used by the AI agent to draft and send
            outbound communications.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b -mx-6 px-6 flex gap-4">
          <button
            type="button"
            className={`py-2 text-sm font-medium border-b-2 ${tab === "rules" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            onClick={() => setTab("rules")}
          >
            Rules
          </button>
          <button
            type="button"
            className={`py-2 text-sm font-medium border-b-2 ${tab === "templates" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            onClick={() => setTab("templates")}
          >
            Email templates
          </button>
        </div>

        {tab === "rules" && (
          showingRuleForm ? (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="agRuleName" className="text-xs">Name *</Label>
                  <Input id="agRuleName" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="agRuleType" className="text-xs">Rule type</Label>
                  <select
                    id="agRuleType"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={ruleForm.ruleType}
                    onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value as RuleType })}
                    disabled={!!editingRule}
                  >
                    {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="agRuleDescription" className="text-xs">Description</Label>
                <Input id="agRuleDescription" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="agRuleTrigger" className="text-xs">Trigger condition (JSON)</Label>
                  <textarea
                    id="agRuleTrigger"
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                    value={ruleForm.triggerCondition}
                    onChange={(e) => setRuleForm({ ...ruleForm, triggerCondition: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="agRuleAction" className="text-xs">Action config (JSON)</Label>
                  <textarea
                    id="agRuleAction"
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                    value={ruleForm.actionConfig}
                    onChange={(e) => setRuleForm({ ...ruleForm, actionConfig: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={ruleForm.requiresApproval}
                    onChange={(e) => setRuleForm({ ...ruleForm, requiresApproval: e.target.checked })}
                  />
                  Requires human approval
                </label>
                <div className="space-y-1">
                  <Label htmlFor="agRuleThreshold" className="text-xs">Auto-approve under ($)</Label>
                  <Input
                    id="agRuleThreshold"
                    type="number"
                    value={ruleForm.autoApproveThreshold}
                    onChange={(e) => setRuleForm({ ...ruleForm, autoApproveThreshold: e.target.value })}
                    disabled={ruleForm.requiresApproval}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCreatingRule(false); setEditingRule(null); }}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!ruleForm.name.trim() || createRule.isPending || updateRule.isPending} onClick={submitRule}>
                  {(createRule.isPending || updateRule.isPending) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {editingRule ? "Save changes" : "Create rule"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button size="sm" onClick={openCreateRule}><Plus className="h-3.5 w-3.5 mr-1" /> New rule</Button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                {!rules || (rules as any[]).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No agent rules configured.</p>
                ) : (
                  <div className="space-y-2">
                    {(rules as any[]).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-md border p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{r.name}</span>
                            <Badge variant="outline" className="text-[10px]">{r.ruleType}</Badge>
                            {r.requiresApproval ? (
                              <Badge variant="outline" className="text-[10px]">needs approval</Badge>
                            ) : (
                              <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700">auto</Badge>
                            )}
                          </div>
                          {r.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</div>}
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={!!r.isActive}
                            onChange={(e) => updateRule.mutate({ id: r.id, isActive: e.target.checked })}
                          />
                          On
                        </label>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRule(r)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )
        )}

        {tab === "templates" && (
          showingTplForm ? (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="agTplName" className="text-xs">Name *</Label>
                  <Input id="agTplName" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="agTplType" className="text-xs">Template type</Label>
                  <select
                    id="agTplType"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tplForm.templateType}
                    onChange={(e) => setTplForm({ ...tplForm, templateType: e.target.value as TemplateType })}
                    disabled={!!editingTpl}
                  >
                    {TEMPLATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="agTplSubject" className="text-xs">Subject *</Label>
                <Input id="agTplSubject" value={tplForm.subject} onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="agTplBody" className="text-xs">Body template *</Label>
                <textarea
                  id="agTplBody"
                  rows={8}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={tplForm.bodyTemplate}
                  onChange={(e) => setTplForm({ ...tplForm, bodyTemplate: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">Template variables like {"{{vendorName}}"} are replaced at send time.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={tplForm.isDefault}
                  onChange={(e) => setTplForm({ ...tplForm, isDefault: e.target.checked })}
                />
                Default for this type
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCreatingTpl(false); setEditingTpl(null); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!tplForm.name.trim() || !tplForm.subject.trim() || !tplForm.bodyTemplate.trim() || createTpl.isPending || updateTpl.isPending}
                  onClick={submitTpl}
                >
                  {(createTpl.isPending || updateTpl.isPending) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {editingTpl ? "Save changes" : "Create template"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button size="sm" onClick={openCreateTpl}><Plus className="h-3.5 w-3.5 mr-1" /> New template</Button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                {!templates || (templates as any[]).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No email templates yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(templates as any[]).map((t: any) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-md border p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{t.name}</span>
                            <Badge variant="outline" className="text-[10px]">{t.templateType}</Badge>
                            {t.isDefault && <Badge className="text-[10px] bg-blue-500/15 text-blue-700">default</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</div>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={t.isActive !== false}
                            onChange={(e) => updateTpl.mutate({ id: t.id, isActive: e.target.checked })}
                          />
                          On
                        </label>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTpl(t)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
