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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
const taskStatusOptions = [
  { value: "backlog", label: "Backlog", color: "bg-gray-100 text-gray-800" },
  { value: "todo", label: "To Do", color: "bg-blue-100 text-blue-800" },
  { value: "in_progress", label: "In Progress", color: "bg-yellow-100 text-yellow-800" },
  { value: "review", label: "Review", color: "bg-purple-100 text-purple-800" },
  { value: "done", label: "Done", color: "bg-green-100 text-green-800" },
];

const priorityOptions = [
  { value: "low", label: "Low", color: "text-gray-500" },
  { value: "medium", label: "Medium", color: "text-blue-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-red-500" },
];

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Kanban Column Component
function KanbanColumn({ 
  title, 
  status, 
  tasks, 
  onTaskClick,
  onStatusChange,
  color 
}: { 
  title: string; 
  status: string; 
  tasks: any[]; 
  onTaskClick: (task: any) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  color: string;
}) {
  const columnTasks = tasks.filter(t => t.status === status);

  return (
    <div className="p-6 flex-1 min-w-[280px] max-w-[320px]">
      <div className={cn("flex items-center gap-2 mb-3 pb-2 border-b-2", color)}>
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary" className="text-xs">{columnTasks.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[400px]">
        {columnTasks.map((task) => (
          <KanbanCard 
            key={task.id} 
            task={task} 
            onClick={() => onTaskClick(task)}
            onStatusChange={onStatusChange}
          />
        ))}
        {columnTasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// Kanban Card Component
function KanbanCard({ 
  task, 
  onClick,
  onStatusChange 
}: { 
  task: any; 
  onClick: () => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
}) {
  const priority = priorityOptions.find(p => p.value === task.priority);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow",
        isOverdue && "border-red-300 bg-red-50/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-4 w-4" />
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
                  Move to {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {priority && (
            <Badge variant="outline" className={cn("text-xs", priority.color)}>
              <Flag className="h-3 w-3 mr-1" />
              {priority.label}
            </Badge>
          )}
          {task.dueDate && (
            <Badge 
              variant="outline" 
              className={cn("text-xs", isOverdue && "text-red-600 border-red-300")}
            >
              <Calendar className="h-3 w-3 mr-1" />
              {formatDate(task.dueDate)}
            </Badge>
          )}
          {task.assignee && (
            <Badge variant="outline" className="text-xs">
              <User className="h-3 w-3 mr-1" />
              {task.assignee.name?.split(" ")[0] || "Assigned"}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Task Detail Panel (for spreadsheet view)
function TaskDetailPanel({ task, onClose, onStatusChange }: { 
  task: any; 
  onClose: () => void;
  onStatusChange: (taskId: number, status: string) => void;
}) {
  const statusOption = taskStatusOptions.find(s => s.value === task.status);
  const priority = priorityOptions.find(p => p.value === task.priority);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {task.title}
            <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
            {isOverdue && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Overdue
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {task.project?.name || "No project"}
          </p>
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
            <User className="h-3 w-3" />
            Assignee
          </div>
          <div className="font-semibold">{task.assignee?.name || "Unassigned"}</div>
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
    </div>
  );
}

export default function Projects() {
  const [viewMode, setViewMode] = useState<"kanban" | "spreadsheet">("kanban");
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | string | null>(null);
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
    { key: "title", header: "Task", type: "text", sortable: true, editable: true },
    { key: "project", header: "Project", type: "text", render: (row) => row.project?.name || "-" },
    { key: "status", header: "Status", type: "status", options: taskStatusOptions, editable: true, filterable: true },
    { key: "priority", header: "Priority", type: "badge", options: priorityOptions, editable: true, filterable: true },
    { key: "assignee", header: "Assignee", type: "text", render: (row) => row.assignee?.name || "-" },
    { key: "dueDate", header: "Due", type: "date", sortable: true, editable: true, render: (row) => {
      const isOverdue = row.dueDate && new Date(row.dueDate) < new Date() && row.status !== "done";
      return (
        <span className={cn(isOverdue && "text-red-600 font-medium")}>
          {formatDate(row.dueDate)}
        </span>
      );
    }},
    { key: "createdAt", header: "Created", type: "date", sortable: true },
  ];

  // Stats
  const stats = {
    total: filteredTasks.length,
    backlog: filteredTasks.filter((t: any) => t.status === "backlog").length,
    todo: filteredTasks.filter((t: any) => t.status === "todo").length,
    inProgress: filteredTasks.filter((t: any) => t.status === "in_progress").length,
    review: filteredTasks.filter((t: any) => t.status === "review").length,
    done: filteredTasks.filter((t: any) => t.status === "done").length,
    overdue: filteredTasks.filter((t: any) => 
      t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done"
    ).length,
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

  return (
    <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FolderKanban className="h-8 w-8" />
              Projects & Tasks
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage tasks with Kanban or Spreadsheet view
            </p>
          
          <AITriggerButton message="Analyze our projects - identify risks, optimize resource allocation, and predict completion dates" label="AI Project Analysis" /></div>
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
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-6 gap-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-muted-foreground">Backlog</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats.backlog}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">To Do</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats.todo}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">In Progress</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats.inProgress}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Review</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats.review}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Done</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats.done}</div>
          </Card>
          <Card className="p-3 border-red-200 bg-red-50/50">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600">Overdue</span>
            </div>
            <div className="text-2xl font-bold mt-1 text-red-600">{stats.overdue}</div>
          </Card>
        </div>

        {/* Main Content */}
        {viewMode === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            <KanbanColumn
              title="Backlog"
              status="backlog"
              tasks={filteredTasks}
              onTaskClick={setSelectedTask}
              onStatusChange={handleStatusChange}
              color="border-gray-400"
            />
            <KanbanColumn
              title="To Do"
              status="todo"
              tasks={filteredTasks}
              onTaskClick={setSelectedTask}
              onStatusChange={handleStatusChange}
              color="border-blue-400"
            />
            <KanbanColumn
              title="In Progress"
              status="in_progress"
              tasks={filteredTasks}
              onTaskClick={setSelectedTask}
              onStatusChange={handleStatusChange}
              color="border-yellow-400"
            />
            <KanbanColumn
              title="Review"
              status="review"
              tasks={filteredTasks}
              onTaskClick={setSelectedTask}
              onStatusChange={handleStatusChange}
              color="border-purple-400"
            />
            <KanbanColumn
              title="Done"
              status="done"
              tasks={filteredTasks}
              onTaskClick={setSelectedTask}
              onStatusChange={handleStatusChange}
              color="border-green-400"
            />
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
                onExpandChange={setExpandedTaskId}
                renderExpanded={(task, onClose) => (
                  <TaskDetailPanel 
                    task={task} 
                    onClose={onClose}
                    onStatusChange={handleStatusChange}
                  />
                )}
                onCellEdit={(rowId, key, value) => {
                  if (key === "status") {
                    handleStatusChange(rowId as number, value);
                  } else if (key === "title") {
                    updateTaskStatus.mutate({ id: rowId as number, name: value });
                  } else if (key === "dueDate") {
                    updateTaskStatus.mutate({ id: rowId as number, dueDate: value ? new Date(value) : undefined });
                  } else if (key === "priority") {
                    updateTaskStatus.mutate({ id: rowId as number, priority: value as any });
                  }
                }}
                enableInlineCreate
                inlineCreatePlaceholder="Click to add a new task..."
                onInlineCreate={(rowData) => {
                  if (!rowData.title) {
                    toast.error("Title is required");
                    return;
                  }
                  createTask.mutate({
                    name: rowData.title as string,
                    description: rowData.description as string || undefined,
                    projectId: rowData.projectId ? parseInt(rowData.projectId as string) : (filterProject !== "all" ? parseInt(filterProject) : undefined),
                    priority: (rowData.priority as any) || "medium",
                    dueDate: rowData.dueDate ? new Date(rowData.dueDate as string) : undefined,
                    assigneeId: rowData.assigneeId ? parseInt(rowData.assigneeId as string) : undefined,
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
                onStatusChange={(id, status) => {
                  handleStatusChange(id, status);
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
                  <Select value={taskForm.priority} onValueChange={(v) => setTaskForm({ ...taskForm, priority: v })}>
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
      </div>
  );
}
