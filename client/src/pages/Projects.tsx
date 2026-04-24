import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import {
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  Loader2,
  MoreHorizontal,
  Calendar,
  User,
  Flag,
  Clock,
  CheckCircle,
  Circle,
  AlertCircle,
  X,
  GripVertical,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Bot,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const taskStatusOptions = [
  { value: "todo", label: "To Do", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "in_progress", label: "In Progress", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "review", label: "Review", color: "bg-violet-500/8 text-violet-600 dark:text-violet-400" },
  { value: "completed", label: "Done", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
];

const priorityOptions = [
  { value: "low", label: "Low", color: "text-gray-500" },
  { value: "medium", label: "Medium", color: "text-blue-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "critical", label: "Urgent", color: "text-red-500" },
];

// AI agent task types that can take execution of a project task.
// Mirrors the enum on aiAgentTasks.taskType.
const agentTaskTypeOptions: { value: string; label: string }[] = [
  { value: "send_email", label: "Send email" },
  { value: "reply_email", label: "Reply to email" },
  { value: "vendor_followup", label: "Vendor follow-up" },
  { value: "send_rfq", label: "Send RFQ" },
  { value: "send_quote_request", label: "Send quote request" },
  { value: "generate_po", label: "Generate purchase order" },
  { value: "generate_invoice", label: "Generate invoice" },
  { value: "reconcile_payment", label: "Reconcile payment" },
  { value: "update_inventory", label: "Update inventory" },
  { value: "reorder_materials", label: "Reorder materials" },
  { value: "create_shipment", label: "Create shipment" },
  { value: "create_work_order", label: "Create work order" },
  { value: "create_vendor", label: "Create vendor" },
  { value: "create_customer", label: "Create customer" },
  { value: "create_material", label: "Create material" },
  { value: "create_product", label: "Create product" },
  { value: "create_bom", label: "Create BOM" },
  { value: "approve_po", label: "Approve PO" },
  { value: "approve_invoice", label: "Approve invoice" },
  { value: "invoice_price_review", label: "Review invoice pricing" },
  { value: "ingredient_rfq", label: "Ingredient RFQ" },
  { value: "query", label: "Research / query" },
];

const sourceLabels: Record<string, string> = {
  manual: "Manual",
  email: "Email",
  meeting: "Meeting",
  ai_generated: "AI-generated",
  crm_deal: "CRM deal",
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Returns suggested number of days from now based on priority */
function getSuggestedDeadlineDays(priority: string): number {
  switch (priority) {
    case "urgent": return 1;
    case "high": return 3;
    case "medium": return 7;
    case "low": return 14;
    default: return 7;
  }
}

function formatSuggestedDate(priority: string): string {
  const days = getSuggestedDeadlineDays(priority);
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

type DeadlineStatus = "overdue" | "approaching" | "normal" | "none";

/** Returns deadline urgency: overdue, approaching (within 2 days), or normal */
function getDeadlineStatus(dueDate: string | Date | null | undefined, status: string): DeadlineStatus {
  if (!dueDate || status === "completed" || status === "cancelled") return "none";
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "approaching";
  return "normal";
}

function deadlineIndicatorClass(dlStatus: DeadlineStatus): string {
  switch (dlStatus) {
    case "overdue": return "text-red-600 border-red-300 bg-red-50";
    case "approaching": return "text-amber-600 border-amber-300 bg-amber-50";
    default: return "";
  }
}

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(name: string | undefined): string {
  if (!name) return "bg-gray-300";
  const colors = [
    "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500",
    "bg-indigo-500", "bg-teal-500", "bg-orange-500", "bg-cyan-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// Kanban Column Component (used inside project swimlanes)
function KanbanColumn({
  title,
  status,
  tasks,
  onTaskClick,
  onStatusChange,
  color,
  projects,
  onProjectChange,
  onAssignToAi,
  onReassignToHuman,
}: {
  title: string;
  status: string;
  tasks: any[];
  onTaskClick: (task: any) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  color: string;
  projects?: any[];
  onProjectChange?: (taskId: number, projectId: number) => void;
  onAssignToAi?: (task: any) => void;
  onReassignToHuman?: (task: any) => void;
}) {
  return (
    <div className="flex-1 min-w-[220px] max-w-[280px]">
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
            onStatusChange={onStatusChange}
            projects={projects}
            onProjectChange={onProjectChange}
            onAssignToAi={onAssignToAi}
            onReassignToHuman={onReassignToHuman}
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-xs border border-dashed rounded-lg">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// Project Swimlane for the board view
function ProjectSwimlane({
  project,
  tasks,
  onTaskClick,
  onStatusChange,
  onAssignToAi,
  onReassignToHuman,
}: {
  project: { id: number; name: string; status?: string };
  tasks: any[];
  onTaskClick: (task: any) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onAssignToAi?: (task: any) => void;
  onReassignToHuman?: (task: any) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const projectTasks = tasks.filter((t: any) => t.projectId === project.id);
  const tasksByStatus: Record<string, any[]> = {};
  for (const s of taskStatusOptions) {
    tasksByStatus[s.value] = projectTasks.filter((t: any) => t.status === s.value);
  }
  const totalTasks = projectTasks.length;
  const completedTasks = (tasksByStatus["completed"]?.length ?? 0);
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="border rounded-xl bg-card shadow-sm">
      {/* Swimlane Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors rounded-t-xl text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FolderKanban className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">{project.name}</span>
          <Badge variant="secondary" className="text-xs shrink-0">{totalTasks} tasks</Badge>
          {totalTasks > 0 && (
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{progressPct}%</span>
            </div>
          )}
        </div>
      </button>

      {/* Swimlane Content: status columns */}
      {!collapsed && (
        <div className="flex gap-3 px-4 pb-4 overflow-x-auto">
          {taskStatusOptions
            .filter((s) => s.value !== "cancelled")
            .map((s) => (
              <div key={s.value} className="flex-1 min-w-[220px] max-w-[280px]">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={cn("w-2 h-2 rounded-full", s.color.split(" ")[0].replace("/8", ""))} />
                  <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{tasksByStatus[s.value]?.length ?? 0}</span>
                </div>
                <KanbanColumn
                  title={s.label}
                  status={s.value}
                  tasks={tasksByStatus[s.value] || []}
                  onTaskClick={onTaskClick}
                  onStatusChange={onStatusChange}
                  color=""
                  onAssignToAi={onAssignToAi}
                  onReassignToHuman={onReassignToHuman}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// Unassigned tasks swimlane
function UnassignedSwimlane({
  tasks,
  onTaskClick,
  onStatusChange,
  onAssignToAi,
  onReassignToHuman,
}: {
  tasks: any[];
  onTaskClick: (task: any) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onAssignToAi?: (task: any) => void;
  onReassignToHuman?: (task: any) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const unassignedTasks = tasks.filter((t: any) => !t.projectId || t.projectId === 0);
  const tasksByStatus: Record<string, any[]> = {};
  for (const s of taskStatusOptions) {
    tasksByStatus[s.value] = unassignedTasks.filter((t: any) => t.status === s.value);
  }

  if (unassignedTasks.length === 0) return null;

  return (
    <div className="border rounded-xl bg-card shadow-sm border-dashed">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors rounded-t-xl text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-semibold text-sm text-muted-foreground truncate">Unassigned to Project</span>
          <Badge variant="outline" className="text-xs shrink-0">{unassignedTasks.length} tasks</Badge>
        </div>
      </button>

      {!collapsed && (
        <div className="flex gap-3 px-4 pb-4 overflow-x-auto">
          {taskStatusOptions
            .filter((s) => s.value !== "cancelled")
            .map((s) => (
              <div key={s.value} className="flex-1 min-w-[220px] max-w-[280px]">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={cn("w-2 h-2 rounded-full", s.color.split(" ")[0].replace("/8", ""))} />
                  <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{tasksByStatus[s.value]?.length ?? 0}</span>
                </div>
                <KanbanColumn
                  title={s.label}
                  status={s.value}
                  tasks={tasksByStatus[s.value] || []}
                  onTaskClick={onTaskClick}
                  onStatusChange={onStatusChange}
                  color=""
                  onAssignToAi={onAssignToAi}
                  onReassignToHuman={onReassignToHuman}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// Kanban Card Component -- enhanced with deadline indicators & assignee avatars
function KanbanCard({
  task,
  onClick,
  onStatusChange,
  projects,
  onProjectChange,
  onAssignToAi,
  onReassignToHuman,
}: {
  task: any;
  onClick: () => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  projects?: any[];
  onProjectChange?: (taskId: number, projectId: number) => void;
  onAssignToAi?: (task: any) => void;
  onReassignToHuman?: (task: any) => void;
}) {
  const priority = priorityOptions.find((p) => p.value === task.priority);
  const dlStatus = getDeadlineStatus(task.dueDate, task.status);
  const dlClass = deadlineIndicatorClass(dlStatus);
  const isAi = task.assigneeType === "ai_agent";

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-all border",
        dlStatus === "overdue" && "border-red-300 bg-red-50/50 dark:bg-red-950/20",
        dlStatus === "approaching" && "border-amber-300 bg-amber-50/30 dark:bg-amber-950/20",
        isAi && "border-violet-300/70 bg-violet-50/30 dark:bg-violet-950/20",
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Title row with status menu */}
        <div className="flex items-start justify-between gap-1.5">
          <h4 className="font-medium text-sm line-clamp-2 flex-1">{task.name}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 transition-opacity">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {taskStatusOptions.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, s.value);
                  }}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
              {(onAssignToAi || onReassignToHuman) && <div className="border-t my-1" />}
              {!isAi && onAssignToAi && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignToAi(task);
                  }}
                >
                  <Bot className="h-3 w-3 mr-1.5" />
                  Assign to AI
                </DropdownMenuItem>
              )}
              {isAi && onReassignToHuman && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onReassignToHuman(task);
                  }}
                >
                  <User className="h-3 w-3 mr-1.5" />
                  Reassign to human
                </DropdownMenuItem>
              )}
              {projects && projects.length > 0 && onProjectChange && (
                <>
                  <div className="border-t my-1" />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">Move to project</div>
                  {projects.filter((p: any) => p.id !== task.projectId).map((p: any) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onProjectChange(task.id, p.id);
                      }}
                    >
                      <FolderKanban className="h-3 w-3 mr-1.5" />
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Bottom row: metadata + assignee avatar */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {priority && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", priority.color)}>
                <Flag className="h-2.5 w-2.5 mr-0.5" />
                {priority.label}
              </Badge>
            )}
            {task.dueDate && (
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0", dlClass)}
              >
                {dlStatus === "overdue" && <AlertCircle className="h-2.5 w-2.5 mr-0.5" />}
                {dlStatus === "approaching" && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                {dlStatus === "normal" && <Calendar className="h-2.5 w-2.5 mr-0.5" />}
                {formatDate(task.dueDate)}
              </Badge>
            )}
            {isAi && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-600 border-violet-400/60 bg-violet-50 dark:bg-violet-950/30">
                <Bot className="h-2.5 w-2.5 mr-0.5" />
                AI
                {task.aiConfidence != null && (
                  <span className="ml-1 opacity-70">{Math.round(Number(task.aiConfidence))}%</span>
                )}
              </Badge>
            )}
            {task.sourceType && task.sourceType !== "manual" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                {sourceLabels[task.sourceType] ?? task.sourceType}
              </Badge>
            )}
          </div>

          {/* Assignee avatar */}
          {isAi ? (
            <div
              className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 bg-violet-500 text-white"
              title="Assigned to AI agent"
            >
              <Bot className="h-3.5 w-3.5" />
            </div>
          ) : task.assignee ? (
            <div
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0",
                avatarColor(task.assignee.name),
              )}
              title={task.assignee.name || "Assigned"}
            >
              {getInitials(task.assignee.name)}
            </div>
          ) : (
            <div
              className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] border border-dashed border-muted-foreground/40 text-muted-foreground shrink-0"
              title="Unassigned"
            >
              ?
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Task Detail Panel (for spreadsheet view)
function TaskDetailPanel({ task, onClose, onStatusChange, projects, onProjectChange, onAssignToAi, onReassignToHuman }: {
  task: any;
  onClose: () => void;
  onStatusChange: (taskId: number, status: string) => void;
  projects?: any[];
  onProjectChange?: (taskId: number, projectId: number) => void;
  onAssignToAi?: (task: any) => void;
  onReassignToHuman?: (task: any) => void;
}) {
  const statusOption = taskStatusOptions.find(s => s.value === task.status);
  const priority = priorityOptions.find(p => p.value === task.priority);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed";
  const isAi = task.assigneeType === "ai_agent";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {task.name}
            <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
            {isAi && (
              <Badge variant="outline" className="text-xs text-violet-600 border-violet-400/60 bg-violet-50">
                <Bot className="h-3 w-3 mr-1" />
                AI agent
              </Badge>
            )}
            {isOverdue && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Overdue
              </Badge>
            )}
          </h3>
          {/* Project selector */}
          {projects && projects.length > 0 && onProjectChange && (
            <Select
              value={String(task.projectId || "")}
              onValueChange={(v) => onProjectChange(task.id, Number(v))}
            >
              <SelectTrigger className="w-[180px] h-7 text-xs">
                <FolderKanban className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue placeholder="Move to project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={task.status}
            onValueChange={(v) => onStatusChange(task.id, v)}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {taskStatusOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Flag className="h-3 w-3" />
            Priority
          </div>
          <div className={cn("font-semibold", priority?.color)}>{priority?.label || "None"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Calendar className="h-3 w-3" />
            Due Date
          </div>
          <div className={cn("font-semibold", isOverdue && "text-red-600")}>
            {formatDate(task.dueDate)}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            {isAi ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            Assignee
          </div>
          <div className="font-semibold">
            {isAi ? "AI agent" : task.assignee?.name || "Unassigned"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3 w-3" />
            Created
          </div>
          <div className="font-semibold">{formatDate(task.createdAt)}</div>
        </div>
      </div>

      {task.description && (
        <div>
          <h4 className="text-sm font-medium mb-1">Description</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3">
            {task.description}
          </p>
        </div>
      )}

      {isAi && task.aiReasoning && (
        <div className="border border-violet-300/60 rounded-lg bg-violet-50/60 dark:bg-violet-950/20 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            <h4 className="text-sm font-medium text-violet-900 dark:text-violet-200">AI reasoning</h4>
            {task.aiConfidence != null && (
              <Badge variant="outline" className="text-[10px] text-violet-700 border-violet-400/60">
                {Math.round(Number(task.aiConfidence))}% confidence
              </Badge>
            )}
          </div>
          <p className="text-sm text-violet-900/80 dark:text-violet-200/80 whitespace-pre-wrap">
            {task.aiReasoning}
          </p>
        </div>
      )}

      {task.sourceType && task.sourceType !== "manual" && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-3 w-3" />
          Source: {sourceLabels[task.sourceType] ?? task.sourceType}
          {task.sourceRefType && task.sourceRefId ? ` #${task.sourceRefId} (${task.sourceRefType})` : null}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        {!isAi && onAssignToAi && (
          <Button size="sm" variant="outline" onClick={() => onAssignToAi(task)}>
            <Bot className="h-3.5 w-3.5 mr-1.5" />
            Assign to AI
          </Button>
        )}
        {isAi && onReassignToHuman && (
          <Button size="sm" variant="outline" onClick={() => onReassignToHuman(task)}>
            <User className="h-3.5 w-3.5 mr-1.5" />
            Reassign to human
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Projects() {
  const [viewMode, setViewMode] = useState<"kanban" | "spreadsheet">("kanban");
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    projectId: "",
    priority: "medium",
    status: "todo",
    dueDate: "",
    assigneeId: "",
  });

  // Queries
  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const { data: tasks, isLoading: tasksLoading, refetch: refetchTasks } = trpc.projects.tasks.useQuery({ projectId: 0 });
  const { data: users } = trpc.users.list.useQuery();

  // Mutations
  const createTask = trpc.projects.addTask.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setIsTaskDialogOpen(false);
      setTaskForm({
        title: "",
        description: "",
        projectId: "",
        priority: "medium",
        status: "todo",
        dueDate: "",
        assigneeId: "",
      });
      refetchTasks();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateTaskStatus = trpc.projects.updateTask.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      refetchTasks();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // The tRPC router has grown large enough that v11's type inference
  // truncates the client-side AppRouter type before reaching `taskBridge`.
  // The server router IS registered and the call works at runtime; we cast
  // here to bypass the truncation. See server/routers/index.ts baseRouter.
  const taskBridge = (trpc as any).taskBridge as {
    toAgent: { useMutation: (opts: any) => { mutate: (input: any) => void; isPending: boolean } };
    toHuman: { useMutation: (opts: any) => { mutate: (input: any) => void; isPending: boolean } };
  };

  const assignToAgent = taskBridge.toAgent.useMutation({
    onSuccess: () => {
      toast.success("Task sent to AI agent (approval queue)");
      setAssignAiTask(null);
      refetchTasks();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const reassignToHuman = taskBridge.toHuman.useMutation({
    onSuccess: () => {
      toast.success("Task reassigned to human");
      refetchTasks();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [assignAiTask, setAssignAiTask] = useState<any>(null);
  const [assignAiForm, setAssignAiForm] = useState({
    agentTaskType: "send_email",
    reasoning: "",
    confidence: "80",
    priority: "medium",
    requiresApproval: true,
  });

  const openAssignAi = (task: any) => {
    setAssignAiTask(task);
    setAssignAiForm({
      agentTaskType: "send_email",
      reasoning: "",
      confidence: "80",
      priority: task.priority === "critical" ? "urgent" : task.priority || "medium",
      requiresApproval: true,
    });
  };

  const handleAssignAiSubmit = () => {
    if (!assignAiTask) return;
    assignToAgent.mutate({
      projectTaskId: assignAiTask.id,
      agentTaskType: assignAiForm.agentTaskType as any,
      taskData: { projectTaskId: assignAiTask.id, title: assignAiTask.name, description: assignAiTask.description },
      reasoning: assignAiForm.reasoning || undefined,
      confidence: assignAiForm.confidence ? Number(assignAiForm.confidence) : undefined,
      priority: assignAiForm.priority as any,
      requiresApproval: assignAiForm.requiresApproval,
    });
  };

  const handleReassignHuman = (task: any) => {
    reassignToHuman.mutate({ projectTaskId: task.id, assigneeId: task.assigneeId ?? null });
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let result = tasks || [];
    if (filterProject !== "all") {
      result = result.filter((t: any) => t.projectId?.toString() === filterProject);
    }
    if (filterPriority !== "all") {
      result = result.filter((t: any) => t.priority === filterPriority);
    }
    return result;
  }, [tasks, filterProject, filterPriority]);

  // Column definitions for spreadsheet view
  const taskColumns: Column<any>[] = [
    { key: "name", header: "Task", type: "text", sortable: true, editable: true },
    { key: "project", header: "Project", type: "text", render: (row) => row.project?.name || "-" },
    { key: "status", header: "Status", type: "status", options: taskStatusOptions, editable: true, filterable: true },
    { key: "priority", header: "Priority", type: "badge", options: priorityOptions, editable: true, filterable: true },
    { key: "assignee", header: "Assignee", type: "text", render: (row) => row.assignee?.name || "-" },
    { key: "dueDate", header: "Due", type: "date", sortable: true, editable: true, render: (row) => {
      const dlStatus = getDeadlineStatus(row.dueDate, row.status);
      return (
        <span className={cn(
          dlStatus === "overdue" && "text-red-600 font-medium",
          dlStatus === "approaching" && "text-amber-600 font-medium",
        )}>
          {dlStatus === "overdue" && "!! "}
          {dlStatus === "approaching" && "! "}
          {formatDate(row.dueDate)}
        </span>
      );
    }},
    { key: "createdAt", header: "Created", type: "date", sortable: true },
  ];

  // Stats
  const stats = {
    total: filteredTasks.length,
    todo: filteredTasks.filter((t: any) => t.status === "todo").length,
    inProgress: filteredTasks.filter((t: any) => t.status === "in_progress").length,
    review: filteredTasks.filter((t: any) => t.status === "review").length,
    completed: filteredTasks.filter((t: any) => t.status === "completed").length,
    cancelled: filteredTasks.filter((t: any) => t.status === "cancelled").length,
    overdue: filteredTasks.filter((t: any) => getDeadlineStatus(t.dueDate, t.status) === "overdue").length,
    approaching: filteredTasks.filter((t: any) => getDeadlineStatus(t.dueDate, t.status) === "approaching").length,
  };

  const handleCreateTask = () => {
    if (!taskForm.title) {
      toast.error("Title is required");
      return;
    }
    createTask.mutate({
      name: taskForm.title,
      description: taskForm.description || undefined,
      projectId: taskForm.projectId ? parseInt(taskForm.projectId) : 0,
      priority: taskForm.priority as any,
      dueDate: taskForm.dueDate ? new Date(taskForm.dueDate) : undefined,
      assigneeId: taskForm.assigneeId ? parseInt(taskForm.assigneeId) : undefined,
    });
  };

  const handleStatusChange = (taskId: number, newStatus: string) => {
    updateTaskStatus.mutate({ id: taskId, status: newStatus as any });
  };

  const handleProjectChange = (taskId: number, projectId: number) => {
    updateTaskStatus.mutate({ id: taskId, projectId } as any);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              Projects & Tasks
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage tasks with Kanban or Spreadsheet view
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("kanban")}
                className="gap-1"
              >
                <LayoutGrid className="h-4 w-4" />
                Kanban
              </Button>
              <Button
                variant={viewMode === "spreadsheet" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("spreadsheet")}
                className="gap-1"
              >
                <List className="h-4 w-4" />
                Spreadsheet
              </Button>
            </div>
            <Button onClick={() => setIsTaskDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Task
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map((p: any) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {priorityOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{stats.total} tasks</span>
            {stats.overdue > 0 && (
              <span className="text-red-600 font-medium">{stats.overdue} overdue</span>
            )}
            {stats.approaching > 0 && (
              <span className="text-amber-600 font-medium">{stats.approaching} due soon</span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">To Do</span>
            </div>
            <div className="text-xl font-semibold tracking-[-0.02em] mt-1">{stats.todo}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">In Progress</span>
            </div>
            <div className="text-xl font-semibold tracking-[-0.02em] mt-1">{stats.inProgress}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Review</span>
            </div>
            <div className="text-xl font-semibold tracking-[-0.02em] mt-1">{stats.review}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Done</span>
            </div>
            <div className="text-xl font-semibold tracking-[-0.02em] mt-1">{stats.completed}</div>
          </Card>
          <Card className={cn("p-3", stats.overdue > 0 ? "border-red-200 bg-red-50/50" : stats.approaching > 0 ? "border-amber-200 bg-amber-50/50" : "")}>
            <div className="flex items-center gap-2">
              <AlertCircle className={cn("h-4 w-4", stats.overdue > 0 ? "text-red-500" : "text-amber-500")} />
              <span className={cn("text-sm", stats.overdue > 0 ? "text-red-600" : "text-amber-600")}>At Risk</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <div className={cn("text-xl font-semibold tracking-[-0.02em]", stats.overdue > 0 ? "text-red-600" : "text-muted-foreground")}>{stats.overdue}</div>
              <span className="text-xs text-red-500">overdue</span>
              <div className={cn("text-xl font-semibold tracking-[-0.02em]", stats.approaching > 0 ? "text-amber-600" : "text-muted-foreground")}>{stats.approaching}</div>
              <span className="text-xs text-amber-500">due soon</span>
            </div>
          </Card>
        </div>

        {/* Main Content */}
        {viewMode === "kanban" ? (
          <div className="space-y-4">
            {/* Column headers -- sticky at top */}
            <div className="flex gap-3 px-4">
              <div className="w-[52px] shrink-0" /> {/* spacer for collapse button */}
              {taskStatusOptions
                .filter((s) => s.value !== "cancelled")
                .map((s) => {
                  const count = filteredTasks.filter((t: any) => t.status === s.value).length;
                  return (
                    <div key={s.value} className="flex-1 min-w-[220px] max-w-[280px]">
                      <div className={cn("flex items-center gap-2 pb-2 border-b-2", {
                        "border-blue-400": s.value === "todo",
                        "border-amber-400": s.value === "in_progress",
                        "border-violet-400": s.value === "review",
                        "border-emerald-400": s.value === "completed",
                      })}>
                        <h3 className="font-semibold text-sm">{s.label}</h3>
                        <Badge variant="secondary" className="text-xs">{count}</Badge>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Project swimlanes */}
            {(projects || []).map((project: any) => (
              <ProjectSwimlane
                key={project.id}
                project={project}
                tasks={filteredTasks}
                onTaskClick={setSelectedTask}
                onStatusChange={handleStatusChange}
                onAssignToAi={openAssignAi}
                onReassignToHuman={handleReassignHuman}
              />
            ))}

            {/* Unassigned tasks */}
            <UnassignedSwimlane
              tasks={filteredTasks}
              onTaskClick={setSelectedTask}
              onStatusChange={handleStatusChange}
              onAssignToAi={openAssignAi}
              onReassignToHuman={handleReassignHuman}
            />

            {(projects || []).length === 0 && filteredTasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No projects or tasks yet. Create a task to get started.</p>
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <SpreadsheetTable
                data={filteredTasks}
                columns={taskColumns}
                isLoading={tasksLoading}
                emptyMessage="No tasks found"
                showSearch
                showFilters
                showExport
                expandable
                expandedRowId={expandedTaskId}
                onExpandChange={(id) => setExpandedTaskId(id === null ? null : Number(id))}
                renderExpanded={(task, onClose) => (
                  <TaskDetailPanel
                    task={task}
                    onClose={onClose}
                    onStatusChange={handleStatusChange}
                    onAssignToAi={openAssignAi}
                    onReassignToHuman={handleReassignHuman}
                  />
                )}
                onCellEdit={(rowId, key, value) => {
                  if (key === "status") {
                    handleStatusChange(rowId as number, value);
                  }
                }}
                enableInlineCreate
                inlineCreatePlaceholder="Click to add a new task..."
                onInlineCreate={(rowData) => {
                  const name = (rowData as any).name || (rowData as any).title;
                  if (!name) {
                    toast.error("Title is required");
                    return;
                  }
                  createTask.mutate({
                    name: name as string,
                    description: (rowData as any).description as string || undefined,
                    projectId: (rowData as any).projectId ? parseInt(String((rowData as any).projectId)) : 0,
                    priority: ((rowData as any).priority as any) || "medium",
                    dueDate: (rowData as any).dueDate ? new Date(String((rowData as any).dueDate)) : undefined,
                    assigneeId: (rowData as any).assigneeId ? parseInt(String((rowData as any).assigneeId)) : undefined,
                  });
                }}
                compact
              />
            </CardContent>
          </Card>
        )}

        {/* Task Detail Dialog (for Kanban view) */}
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
          <DialogContent className="max-w-2xl">
            {selectedTask && (
              <TaskDetailPanel
                task={selectedTask}
                onClose={() => setSelectedTask(null)}
                projects={projects}
                onProjectChange={(id, projectId) => {
                  handleProjectChange(id, projectId);
                  setSelectedTask(null);
                }}
                onStatusChange={(id, status) => {
                  handleStatusChange(id, status);
                  setSelectedTask(null);
                }}
                onAssignToAi={(task) => {
                  setSelectedTask(null);
                  openAssignAi(task);
                }}
                onReassignToHuman={(task) => {
                  handleReassignHuman(task);
                  setSelectedTask(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Create Task Dialog */}
        <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
              <DialogDescription>Add a new task to track</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input 
                  value={taskForm.title} 
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="Task title..."
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={taskForm.description} 
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Task description..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project</Label>
                  <Select value={taskForm.projectId} onValueChange={(v) => setTaskForm({ ...taskForm, projectId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assignee</Label>
                  <Select value={taskForm.assigneeId} onValueChange={(v) => setTaskForm({ ...taskForm, assigneeId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((u: any) => (
                        <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select value={taskForm.status} onValueChange={(v) => setTaskForm({ ...taskForm, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {taskStatusOptions.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={taskForm.priority}
                    onValueChange={(v) => {
                      setTaskForm({ ...taskForm, priority: v });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  />
                  {!taskForm.dueDate && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline flex items-center gap-1"
                      onClick={() =>
                        setTaskForm({ ...taskForm, dueDate: formatSuggestedDate(taskForm.priority) })
                      }
                    >
                      <Clock className="h-3 w-3" />
                      Suggest: {formatDate(formatSuggestedDate(taskForm.priority))} ({getSuggestedDeadlineDays(taskForm.priority)}d for {taskForm.priority})
                    </button>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTaskDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateTask} disabled={createTask.isPending}>
                {createTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign-to-AI Dialog */}
        <Dialog open={!!assignAiTask} onOpenChange={(open) => !open && setAssignAiTask(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-600" />
                Assign to AI agent
              </DialogTitle>
              <DialogDescription>
                Hand this task to an AI agent. It will appear in the approval queue (if approval is required) before the agent executes it.
              </DialogDescription>
            </DialogHeader>
            {assignAiTask && (
              <div className="space-y-4">
                <div className="text-sm bg-muted/50 rounded p-3">
                  <div className="font-semibold">{assignAiTask.name}</div>
                  {assignAiTask.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{assignAiTask.description}</div>
                  )}
                </div>
                <div>
                  <Label>Agent action</Label>
                  <Select
                    value={assignAiForm.agentTaskType}
                    onValueChange={(v) => setAssignAiForm({ ...assignAiForm, agentTaskType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agentTaskTypeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Instructions / reasoning for the agent</Label>
                  <Textarea
                    rows={3}
                    placeholder="What should the agent do? Any context it needs?"
                    value={assignAiForm.reasoning}
                    onChange={(e) => setAssignAiForm({ ...assignAiForm, reasoning: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Confidence</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={assignAiForm.confidence}
                      onChange={(e) => setAssignAiForm({ ...assignAiForm, confidence: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select
                      value={assignAiForm.priority}
                      onValueChange={(v) => setAssignAiForm({ ...assignAiForm, priority: v })}
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
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignAiForm.requiresApproval}
                        onChange={(e) => setAssignAiForm({ ...assignAiForm, requiresApproval: e.target.checked })}
                      />
                      Requires approval
                    </label>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignAiTask(null)}>Cancel</Button>
              <Button onClick={handleAssignAiSubmit} disabled={assignToAgent.isPending}>
                {assignToAgent.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Bot className="h-3.5 w-3.5 mr-1.5" />
                Assign to AI
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
