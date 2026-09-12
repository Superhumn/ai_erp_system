import { useEffect, useState } from "react";
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
  ListChecks,
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

function formatShortDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** One-line human summary of a task, used by the compact queue rows. */
function taskSummary(
  task: any,
  taskData: any,
  projectName?: string,
  assigneeName?: string,
): string {
  const join = (parts: unknown[]) => parts.filter(Boolean).join(" · ");
  switch (task.taskType) {
    case "generate_po": {
      // Scheduler-created POs carry a materials[] array + totalValue instead of a single material.
      if (Array.isArray(taskData.materials)) {
        const names = taskData.materials
          .map((m: any) => (m?.name ? `${m.name} × ${m.quantity ?? "?"}` : null))
          .filter(Boolean);
        return join([
          taskData.vendorName,
          names.length ? names.join(", ") : taskData.title,
          taskData.totalValue != null ? formatCurrency(taskData.totalValue) : null,
        ]);
      }
      if (!taskData.materialName && taskData.title) return taskData.title;
      return join([
        taskData.vendorName || "Unknown vendor",
        `${taskData.materialName || "Unknown material"} × ${taskData.quantity ?? "?"}`,
        taskData.totalAmount != null ? formatCurrency(taskData.totalAmount) : null,
      ]);
    }
    case "send_rfq":
      // Scheduler-created freight RFQs carry title + rfqId instead of material/vendor fields.
      if (!taskData.materialName && taskData.title) return taskData.title;
      return join([
        `${taskData.materialName || "Unknown material"} × ${taskData.quantity ?? "?"}`,
        `${taskData.vendorIds?.length || 0} vendors`,
      ]);
    case "send_email":
      return join([`To ${taskData.to || "unknown"}`, taskData.subject || "No subject"]);
    case "concierge_errand":
      return join([taskData.goal, taskData.riskLevel ? `${taskData.riskLevel} risk` : null]);
    case "create_vendor":
    case "create_customer":
      return join([taskData.name || "Unknown", taskData.email]);
    case "create_material":
    case "create_product":
      return join([taskData.name || "Unknown", taskData.sku]);
    case "create_crm_deal":
      return join([
        taskData.company || "Unknown",
        taskData.amount ? formatCurrency(taskData.amount) : null,
        taskData.stage,
      ]);
    case "query":
      if (taskData.action === "create_project_task") {
        return join([
          taskData.name || "Untitled task",
          projectName || (taskData.projectId ? `Project #${taskData.projectId}` : "Unassigned"),
          assigneeName || "Unassigned",
        ]);
      }
      break;
  }
  return task.aiReasoning || task.description || taskData.name || taskData.goal || "";
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
  concierge_errand: ListChecks,
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
  concierge_errand: "Errand",
};

// Superhumn scheme: severity is ink weight, not hue. Low/medium recede as muted
// ink; high gains weight; urgent goes dark-ink-on-severe.
const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-muted text-foreground",
  high: "bg-muted text-foreground font-semibold",
  urgent: "bg-[oklch(0.30_0.02_262)] text-white",
};

// pending_approval / in_progress = active "needs you" → blue accent.
// approved / completed = neutral ink. rejected / failed = severe dark ink.
const statusColors: Record<string, string> = {
  pending_approval: "bg-primary/10 text-primary",
  approved: "bg-muted text-foreground font-medium",
  rejected: "bg-[oklch(0.30_0.02_262)] text-white",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-muted text-foreground",
  failed: "bg-[oklch(0.30_0.02_262)] text-white",
  cancelled: "bg-muted text-muted-foreground",
};

export default function ApprovalQueue() {
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
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
  
  const handleReject = (taskId: number) => {
    rejectMutation.mutate({ id: taskId });
  };
  
  const handleExecute = (taskId: number) => {
    executeMutation.mutate({ id: taskId });
  };

  const handleApproveAndExecute = async (taskId: number) => {
    try {
      const result: any = await approveMutation.mutateAsync({ id: taskId });
      if (result?.autoExecuted) return;
      executeMutation.mutate({ id: taskId });
    } catch {
      // approve error already toasted by the mutation
    }
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
  
  const visibleTasks: any[] =
    activeTab === "pending" ? pendingTasks || [] : activeTab === "all" ? allTasks || [] : [];
  const focusedTask: any = visibleTasks[focusedIndex];
  const anyMutationPending =
    approveMutation.isPending || rejectMutation.isPending || executeMutation.isPending;

  // Clamp focus when the list shrinks (after approve/reject) or the tab changes.
  useEffect(() => {
    setFocusedIndex((i) => Math.max(0, Math.min(i, visibleTasks.length - 1)));
  }, [visibleTasks.length, activeTab]);

  // Keyboard shortcuts: j/k or arrows move, a approve, r reject, e approve & execute, enter/d details.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (el?.closest?.('button, a, [role="button"], [role="tab"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (visibleTasks.length === 0) return;

      const task = visibleTasks[focusedIndex];
      const pending = task?.status === "pending_approval";
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, visibleTasks.length - 1));
          return;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          return;
        case "a":
          if (task && pending && !anyMutationPending) handleApprove(task.id);
          return;
        case "r":
          if (task && pending && !anyMutationPending) handleReject(task.id);
          return;
        case "e":
          if (task && pending && !anyMutationPending) void handleApproveAndExecute(task.id);
          else if (task && task.status === "approved" && !anyMutationPending) handleExecute(task.id);
          return;
        case "Enter":
        case "d":
          if (task) {
            e.preventDefault();
            handleViewTask(task);
          }
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTasks, focusedIndex, anyMutationPending]);

  // Keep the focused row in view while navigating with the keyboard.
  useEffect(() => {
    if (!focusedTask) return;
    document
      .querySelector(`[data-task-row="${focusedTask.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedTask?.id]);

  const renderTaskRow = (task: any, index: number) => {
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
    const summary = taskSummary(task, taskData, projectName ?? undefined, assigneeName ?? undefined);
    const focused = index === focusedIndex;
    const isPending = task.status === "pending_approval";
    const isApproved = task.status === "approved";
    const approving = approveMutation.isPending && (approveMutation.variables as { id?: number } | undefined)?.id === task.id;
    const rejecting = rejectMutation.isPending && (rejectMutation.variables as { id?: number } | undefined)?.id === task.id;
    const executing = executeMutation.isPending && (executeMutation.variables as { id?: number } | undefined)?.id === task.id;

    return (
      <div
        key={task.id}
        data-task-row={task.id}
        onClick={() => setFocusedIndex(index)}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) return;
          handleViewTask(task);
        }}
        className={`flex items-center gap-2 px-2 py-1 text-sm border-b border-border/60 last:border-b-0 cursor-default hover:bg-muted/40 ${
          focused ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : ""
        }`}
      >
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium shrink-0 whitespace-nowrap">{title}</span>
        <span className="text-muted-foreground truncate flex-1 min-w-0" title={summary}>
          {summary}
        </span>
        {suggestedSource && (
          <button
            type="button"
            title={`View source (${suggestedSource.label})`}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setSourceViewerTask(task);
            }}
          >
            {suggestedSource.kind === "email" && <Mail className="h-3.5 w-3.5" />}
            {suggestedSource.kind === "fireflies" && <Mic className="h-3.5 w-3.5" />}
            {suggestedSource.kind === "text" && <FileText className="h-3.5 w-3.5" />}
          </button>
        )}
        {task.aiConfidence && (
          <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden md:inline">
            {parseFloat(task.aiConfidence)}%
          </span>
        )}
        <Badge className={`${priorityColors[task.priority]} shrink-0`}>{task.priority}</Badge>
        {!isPending && (
          <Badge className={`${statusColors[task.status]} shrink-0`}>
            {task.status.replace(/_/g, " ")}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:inline">
          {formatShortDate(task.createdAt)}
        </span>
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Details (d)" onClick={() => handleViewTask(task)}>
            <Eye className="h-4 w-4" />
          </Button>
          {isPending && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Reject (r)"
                onClick={() => handleReject(task.id)}
                disabled={anyMutationPending}
              >
                {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Approve (a)"
                onClick={() => handleApprove(task.id)}
                disabled={anyMutationPending}
              >
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                className="h-7 w-7"
                title="Approve & Execute (e)"
                onClick={() => void handleApproveAndExecute(task.id)}
                disabled={anyMutationPending}
              >
                {approving || executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              </Button>
            </>
          )}
          {isApproved && (
            <Button
              size="icon"
              className="h-7 w-7"
              title="Execute (e)"
              onClick={() => handleExecute(task.id)}
              disabled={anyMutationPending}
            >
              {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderTaskList = (tasks: any[]) => (
    <div className="rounded-md border border-border overflow-hidden">
      {tasks.map((task, i) => renderTaskRow(task, i))}
    </div>
  );

  const shortcutLegend = (
    <p className="text-xs text-muted-foreground mt-2">
      <kbd className="px-1 rounded border">j</kbd>/<kbd className="px-1 rounded border">k</kbd> or{" "}
      <kbd className="px-1 rounded border">↑</kbd>/<kbd className="px-1 rounded border">↓</kbd> move ·{" "}
      <kbd className="px-1 rounded border">a</kbd> approve ·{" "}
      <kbd className="px-1 rounded border">r</kbd> reject ·{" "}
      <kbd className="px-1 rounded border">e</kbd> approve &amp; execute ·{" "}
      <kbd className="px-1 rounded border">d</kbd> or <kbd className="px-1 rounded border">Enter</kbd> details
    </p>
  );
  
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
              <div className="p-3 rounded-lg bg-primary/10">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-display text-xl font-bold tracking-[-0.02em] tabular-nums">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <CheckCircle className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-display text-xl font-bold tracking-[-0.02em] tabular-nums">{approvedCount}</p>
                <p className="text-sm text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <Play className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-display text-xl font-bold tracking-[-0.02em] tabular-nums">{completedCount}</p>
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
                <p className="font-display text-xl font-bold tracking-[-0.02em] tabular-nums">{allTasks?.length || 0}</p>
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
              <Badge className="ml-2 bg-primary text-primary-foreground">{pendingCount}</Badge>
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
                <CheckCircle className="h-12 w-12 mx-auto text-primary mb-4" />
                <h3 className="text-lg font-semibold">All caught up!</h3>
                <p className="text-muted-foreground">No tasks pending approval</p>
              </CardContent>
            </Card>
          ) : (
            renderTaskList(pendingTasks || [])
          )}
          {!pendingLoading && (pendingTasks?.length || 0) > 0 && shortcutLegend}
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
            renderTaskList(allTasks || [])
          )}
          {!allLoading && (allTasks?.length || 0) > 0 && shortcutLegend}
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
                        log.status === "success" ? "bg-muted" :
                        log.status === "error" ? "bg-[oklch(0.30_0.02_262)]" :
                        log.status === "warning" ? "bg-muted" :
                        "bg-primary/10"
                      }`}>
                        {log.status === "success" ? <CheckCircle className="h-4 w-4 text-muted-foreground" /> :
                         log.status === "error" ? <XCircle className="h-4 w-4 text-white" /> :
                         log.status === "warning" ? <AlertTriangle className="h-4 w-4 text-foreground" /> :
                         <Eye className="h-4 w-4 text-primary" />}
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
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    Execution Result
                  </label>
                  <pre className="text-xs bg-muted/50 p-3 rounded border border-border overflow-x-auto">
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
                    <XCircle className="h-4 w-4 text-foreground" />
                    Error Message
                  </label>
                  <p className="text-sm text-foreground font-medium p-3 bg-muted rounded border border-border">
                    {selectedTask.errorMessage}
                  </p>
                </div>
              )}
              
              {/* Approval/Rejection Info */}
              {selectedTask.approvedAt && (
                <div className="p-3 bg-muted rounded border border-border">
                  <p className="text-sm text-foreground font-medium">
                    <strong>Approved:</strong> {formatDate(selectedTask.approvedAt)}
                  </p>
                </div>
              )}

              {selectedTask.rejectedAt && (
                <div className="p-3 bg-[oklch(0.30_0.02_262)] rounded border border-border">
                  <p className="text-sm text-white font-medium">
                    <strong>Rejected:</strong> {formatDate(selectedTask.rejectedAt)}
                  </p>
                  {selectedTask.rejectionReason && (
                    <p className="text-sm text-white/80 mt-1">
                      <strong>Reason:</strong> {selectedTask.rejectionReason}
                    </p>
                  )}
                </div>
              )}
              
              {selectedTask.executedAt && (
                <div className="p-3 bg-primary/10 rounded border border-primary/20">
                  <p className="text-sm text-primary">
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
                              <Badge className="text-[10px] bg-primary/10 text-primary">auto</Badge>
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
                            {t.isDefault && <Badge className="text-[10px] bg-primary/10 text-primary">default</Badge>}
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
