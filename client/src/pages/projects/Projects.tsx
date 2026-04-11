import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderKanban,
  Plus,
  Search,
  Loader2,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Project = {
  id: number;
  projectNumber: string;
  name: string;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  startDate: Date | null;
  targetEndDate: Date | null;
  budget: string | null;
  progress: number | null;
  description: string | null;
  createdAt: Date;
};

type Task = {
  id: number;
  projectId: number;
  milestoneId: number | null;
  name: string;
  description: string | null;
  assigneeId: number | null;
  status: "todo" | "in_progress" | "review" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  dueDate: string | Date | null;
  completedDate: string | Date | null;
  estimatedHours: string | null;
  actualHours: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserRecord = {
  id: number;
  name: string | null;
  email: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-500/15 text-red-500" },
  high: { label: "High", className: "bg-red-500/15 text-red-500" },
  medium: { label: "Medium", className: "bg-amber-500/15 text-amber-500" },
  low: { label: "Low", className: "bg-green-500/15 text-green-500" },
};

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const BOARD_COLUMNS = [
  { key: "todo", label: "NOT STARTED", accent: "border-gray-500" },
  { key: "in_progress", label: "IN PROGRESS", accent: "border-blue-500" },
  { key: "review", label: "IN REVIEW", accent: "border-violet-500" },
  { key: "completed", label: "COMPLETED", accent: "border-green-500" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserName(users: UserRecord[] | undefined, id: number | null): string {
  if (!id || !users) return "";
  const u = users.find((u) => u.id === id);
  if (!u) return "";
  return u.name || u.email.split("@")[0];
}

function dueDateColor(d: string | Date | null | undefined): string {
  if (!d) return "text-muted-foreground";
  const due = new Date(d);
  const now = new Date();
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "text-red-500";
  if (diff <= 3) return "text-amber-500";
  return "text-green-600";
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Projects() {
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());

  // ---- Project dialog ----
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    startDate: "",
    endDate: "",
    budget: "",
    description: "",
  });

  // ---- Task dialog ----
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    projectId: 0,
    name: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    dueDate: "",
    description: "",
  });

  // ---- Inline add state ----
  const [inlineProjectId, setInlineProjectId] = useState<number | null>(null);
  const [inlineText, setInlineText] = useState("");
  const inlineRef = useRef<HTMLInputElement>(null);

  // ---- Data ----
  const utils = trpc.useUtils();
  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const { data: allTasks, isLoading: tasksLoading } = trpc.projects.listAllTasks.useQuery();
  const { data: users } = trpc.users.list.useQuery();

  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.success("Project created");
      setProjectDialogOpen(false);
      setProjectForm({ name: "", priority: "medium", startDate: "", endDate: "", budget: "", description: "" });
      utils.projects.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addTask = trpc.projects.addTask.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setTaskDialogOpen(false);
      setTaskForm({ projectId: 0, name: "", priority: "medium", dueDate: "", description: "" });
      setInlineText("");
      setInlineProjectId(null);
      utils.projects.listAllTasks.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.projects.updateTask.useMutation({
    onSuccess: () => {
      utils.projects.listAllTasks.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ---- Derived data ----
  const projectList = useMemo(() => (projects as unknown as Project[]) || [], [projects]);
  const taskList = useMemo(() => (allTasks as unknown as Task[]) || [], [allTasks]);
  const userList = useMemo(() => (users as unknown as UserRecord[]) || [], [users]);

  const projectMap = useMemo(() => {
    const m = new Map<number, Project>();
    projectList.forEach((p) => m.set(p.id, p));
    return m;
  }, [projectList]);

  // Filter tasks by search
  const filteredTasks = useMemo(() => {
    if (!search) return taskList;
    const q = search.toLowerCase();
    return taskList.filter((t) => {
      const pName = projectMap.get(t.projectId)?.name || "";
      return (
        t.name.toLowerCase().includes(q) ||
        pName.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
      );
    });
  }, [taskList, search, projectMap]);

  // Group tasks by project, sorted by priority then due date
  const groupedByProject = useMemo(() => {
    const groups = new Map<number, Task[]>();
    filteredTasks.forEach((t) => {
      const list = groups.get(t.projectId) || [];
      list.push(t);
      groups.set(t.projectId, list);
    });
    // Sort tasks within each group
    groups.forEach((tasks) => {
      tasks.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 9;
        const pb = PRIORITY_ORDER[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    });
    // Also include projects with zero tasks (if matching search or no search)
    projectList.forEach((p) => {
      if (!groups.has(p.id)) {
        if (!search || p.name.toLowerCase().includes(search.toLowerCase())) {
          groups.set(p.id, []);
        }
      }
    });
    return groups;
  }, [filteredTasks, projectList, search]);

  // Board columns
  const boardTasks = useMemo(() => {
    const cols: Record<string, Task[]> = { todo: [], in_progress: [], review: [], completed: [] };
    filteredTasks.forEach((t) => {
      if (t.status === "cancelled") return;
      const col = cols[t.status];
      if (col) col.push(t);
    });
    // Sort each column by priority
    Object.values(cols).forEach((arr) =>
      arr.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
    );
    return cols;
  }, [filteredTasks]);

  // ---- Handlers ----
  function handleProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    createProject.mutate({
      name: projectForm.name,
      priority: projectForm.priority,
      startDate: projectForm.startDate ? new Date(projectForm.startDate) : undefined,
      targetEndDate: projectForm.endDate ? new Date(projectForm.endDate) : undefined,
      budget: projectForm.budget || undefined,
      description: projectForm.description || undefined,
    });
  }

  function handleTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.projectId) {
      toast.error("Select a project");
      return;
    }
    addTask.mutate({
      projectId: taskForm.projectId,
      name: taskForm.name,
      priority: taskForm.priority,
      dueDate: taskForm.dueDate ? new Date(taskForm.dueDate) : undefined,
      description: taskForm.description || undefined,
    });
  }

  function handleInlineAdd(projectId: number) {
    if (!inlineText.trim()) return;
    addTask.mutate({ projectId, name: inlineText.trim() });
  }

  function toggleTaskComplete(task: Task) {
    const newStatus = task.status === "completed" ? "todo" : "completed";
    updateTask.mutate({
      id: task.id,
      status: newStatus,
      completedDate: newStatus === "completed" ? new Date() : undefined,
    });
  }

  function toggleExpanded(taskId: number) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }

  function toggleProject(projectId: number) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
  }

  const isLoading = projectsLoading || tasksLoading;

  // ======================================================================
  // RENDER
  // ======================================================================

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">Projects &amp; Tasks</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setView("board")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                view === "board"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </button>
          </div>

          {/* New Project */}
          <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleProjectSubmit}>
                <DialogHeader>
                  <DialogTitle>New Project</DialogTitle>
                  <DialogDescription>Create a new project or initiative.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="pname">Name *</Label>
                    <Input
                      id="pname"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      placeholder="Project name"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select
                        value={projectForm.priority}
                        onValueChange={(v: any) => setProjectForm({ ...projectForm, priority: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Budget</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={projectForm.budget}
                        onChange={(e) => setProjectForm({ ...projectForm, budget: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={projectForm.startDate}
                        onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={projectForm.endDate}
                        onChange={(e) => setProjectForm({ ...projectForm, endDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={projectForm.description}
                      onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                      placeholder="Project description..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createProject.isPending}>
                    {createProject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Project
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* New Task */}
          <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleTaskSubmit}>
                <DialogHeader>
                  <DialogTitle>New Task</DialogTitle>
                  <DialogDescription>Add a task to a project.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Project *</Label>
                    <Select
                      value={taskForm.projectId ? String(taskForm.projectId) : ""}
                      onValueChange={(v) => setTaskForm({ ...taskForm, projectId: Number(v) })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>
                        {projectList.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Task Name *</Label>
                    <Input
                      value={taskForm.name}
                      onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                      placeholder="Task name"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select
                        value={taskForm.priority}
                        onValueChange={(v: any) => setTaskForm({ ...taskForm, priority: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={taskForm.dueDate}
                        onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                      placeholder="Task description..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={addTask.isPending}>
                    {addTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Task
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-48 text-sm"
            />
          </div>
        </div>
      </div>

      {/* ---- Loading ---- */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : view === "list" ? (
        /* ================================================================
           LIST VIEW
           ================================================================ */
        <div className="space-y-4">
          {groupedByProject.size === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No projects found</p>
              <p className="text-sm mt-1">Create your first project to get started.</p>
            </div>
          )}

          {Array.from(groupedByProject.entries()).map(([projectId, tasks]) => {
            const project = projectMap.get(projectId);
            const name = project?.name || `Project #${projectId}`;
            const collapsed = collapsedProjects.has(projectId);

            return (
              <div key={projectId}>
                {/* Project header */}
                <button
                  onClick={() => toggleProject(projectId)}
                  className="flex items-center justify-between w-full text-left py-2 px-1 group"
                >
                  <div className="flex items-center gap-2">
                    {collapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-semibold text-sm">{name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                  </span>
                </button>

                <div className="border-b border-border mb-1" />

                {!collapsed && (
                  <div>
                    {tasks.length === 0 && (
                      <p className="text-sm text-muted-foreground py-3 pl-7">No tasks yet.</p>
                    )}

                    {tasks.map((task) => {
                      const expanded = expandedTasks.has(task.id);
                      const pri = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
                      const assignee = getUserName(userList, task.assigneeId);

                      return (
                        <div key={task.id}>
                          <div
                            onClick={() => toggleExpanded(task.id)}
                            className={cn(
                              "flex items-center gap-3 py-2 px-2 rounded-md cursor-pointer transition-colors",
                              "hover:bg-muted/50",
                              task.status === "completed" && "opacity-60"
                            )}
                          >
                            {/* Checkbox */}
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={task.status === "completed"}
                                onCheckedChange={() => toggleTaskComplete(task)}
                              />
                            </div>

                            {/* Task name */}
                            <span
                              className={cn(
                                "flex-1 text-sm truncate",
                                task.status === "completed" && "line-through text-muted-foreground"
                              )}
                            >
                              {task.name}
                            </span>

                            {/* Assignee */}
                            {assignee && (
                              <span className="text-xs text-muted-foreground shrink-0">@{assignee}</span>
                            )}

                            {/* Due date */}
                            {task.dueDate && (
                              <span className={cn("text-xs shrink-0", dueDateColor(task.dueDate))}>
                                {fmtDate(task.dueDate)}
                              </span>
                            )}

                            {/* Priority */}
                            <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 shrink-0", pri.className)}>
                              {pri.label}
                            </Badge>
                          </div>

                          {/* Expanded detail */}
                          {expanded && (
                            <div className="ml-9 mb-2 pl-3 border-l-2 border-border space-y-1 text-sm text-muted-foreground">
                              {task.description && <p>{task.description}</p>}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                <span>Status: <span className="text-foreground capitalize">{task.status.replace("_", " ")}</span></span>
                                <span>Project: <span className="text-foreground">{name}</span></span>
                                {task.estimatedHours && <span>Est: {task.estimatedHours}h</span>}
                                {task.actualHours && <span>Actual: {task.actualHours}h</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Inline add task */}
                    {inlineProjectId === projectId ? (
                      <div className="flex items-center gap-2 pl-7 py-1.5">
                        <Input
                          ref={inlineRef}
                          value={inlineText}
                          onChange={(e) => setInlineText(e.target.value)}
                          placeholder="Task name, then Enter"
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleInlineAdd(projectId);
                            }
                            if (e.key === "Escape") {
                              setInlineProjectId(null);
                              setInlineText("");
                            }
                          }}
                          onBlur={() => {
                            if (!inlineText.trim()) {
                              setInlineProjectId(null);
                              setInlineText("");
                            }
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={addTask.isPending}
                          onClick={() => handleInlineAdd(projectId)}
                        >
                          Add
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setInlineProjectId(projectId);
                          setInlineText("");
                          setTimeout(() => inlineRef.current?.focus(), 50);
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pl-7 py-2 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Add task
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ================================================================
           BOARD VIEW (Kanban)
           ================================================================ */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => {
            const tasks = boardTasks[col.key] || [];
            return (
              <div key={col.key} className="flex-1 min-w-[260px] max-w-[340px]">
                {/* Column header */}
                <div className={cn("border-b-2 pb-2 mb-3", col.accent)}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground">{col.label}</span>
                    <span className="text-xs text-muted-foreground">({tasks.length})</span>
                  </div>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[300px]">
                  {tasks.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-8">No tasks</p>
                  )}
                  {tasks.map((task) => {
                    const pri = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
                    const project = projectMap.get(task.projectId);
                    const assignee = getUserName(userList, task.assigneeId);

                    return (
                      <div
                        key={task.id}
                        className="rounded-lg border border-border bg-card p-3 hover:shadow-md transition-shadow cursor-pointer space-y-2"
                        onClick={() => toggleExpanded(task.id)}
                      >
                        <p className="text-sm font-medium leading-snug">{task.name}</p>

                        {project && (
                          <p className="text-xs text-muted-foreground">{project.name}</p>
                        )}

                        {/* Expanded inline */}
                        {expandedTasks.has(task.id) && task.description && (
                          <p className="text-xs text-muted-foreground border-t border-border pt-2">{task.description}</p>
                        )}

                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", pri.className)}>
                            {pri.label}
                          </Badge>

                          <div className="flex items-center gap-2">
                            {task.dueDate && (
                              <span className={cn("text-[10px]", dueDateColor(task.dueDate))}>
                                {fmtDate(task.dueDate)}
                              </span>
                            )}
                            {assignee && (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-medium shrink-0" title={assignee}>
                                {assignee.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
