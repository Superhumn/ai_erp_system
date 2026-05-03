import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  Plus,
  Search,
  Loader2,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FolderKanban,
  Flame,
  ArrowUp,
  Minus,
  ArrowDown,
  CheckCircle2,
  Timer,
  Eye,
  XCircle,
  Sparkles,
  SlidersHorizontal,
  X,
  Circle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const PRIORITY_CONFIG: Record<
  string,
  { label: string; color: string; dot: string; border: string; Icon: React.ElementType }
> = {
  critical: { label: "Critical", color: "text-rose-500", dot: "bg-rose-500", border: "border-l-rose-500", Icon: Flame },
  high: { label: "High", color: "text-orange-500", dot: "bg-orange-500", border: "border-l-orange-500", Icon: ArrowUp },
  medium: { label: "Medium", color: "text-amber-500", dot: "bg-amber-500", border: "border-l-amber-500", Icon: Minus },
  low: { label: "Low", color: "text-sky-500", dot: "bg-sky-500", border: "border-l-sky-500", Icon: ArrowDown },
};

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const STATUS_META = {
  todo: {
    label: "To Do",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
    Icon: Circle,
    pulse: false,
  },
  in_progress: {
    label: "In Progress",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    dot: "bg-blue-500",
    Icon: Timer,
    pulse: true,
  },
  review: {
    label: "In Review",
    badge: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    dot: "bg-violet-500",
    Icon: Eye,
    pulse: false,
  },
  completed: {
    label: "Completed",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    Icon: CheckCircle2,
    pulse: false,
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
    dot: "bg-red-400",
    Icon: XCircle,
    pulse: false,
  },
} as const;

const BOARD_COLUMNS = [
  { key: "todo", label: "To Do", headerColor: "bg-slate-500/10 text-slate-600 dark:text-slate-300", dotColor: "bg-slate-400" },
  { key: "in_progress", label: "In Progress", headerColor: "bg-blue-500/10 text-blue-700 dark:text-blue-300", dotColor: "bg-blue-500" },
  { key: "review", label: "In Review", headerColor: "bg-violet-500/10 text-violet-700 dark:text-violet-300", dotColor: "bg-violet-500" },
  { key: "completed", label: "Completed", headerColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dotColor: "bg-emerald-500" },
] as const;

function getUserName(users: UserRecord[] | undefined, id: number | null): string {
  if (!id || !users) return "";
  const user = users.find((u) => u.id === id);
  if (!user) return "";
  return user.name || user.email.split("@")[0];
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntilDate(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function dueDateBadge(d: string | Date | null | undefined): { text: string; className: string } | null {
  if (!d) return null;
  const days = daysUntilDate(d);
  if (days === null) return null;
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, className: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300" };
  if (days === 0) return { text: "Due today", className: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" };
  if (days <= 3) return { text: `Due in ${days}d`, className: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" };
  return { text: fmtDate(d), className: "bg-muted/60 text-muted-foreground" };
}

function ProgressRing({ value, size = 80, strokeWidth = 7 }: { value: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        className="text-emerald-500 transition-all duration-700 ease-out"
      />
    </svg>
  );
}

export default function Projects() {
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    startDate: "",
    endDate: "",
    budget: "",
    description: "",
  });

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    projectId: 0,
    name: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    dueDate: "",
    description: "",
  });

  const [inlineProjectId, setInlineProjectId] = useState<number | null>(null);
  const [inlineText, setInlineText] = useState("");
  const inlineRef = useRef<HTMLInputElement>(null);

  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setStatsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

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
      setInlineProjectId(null);
      setInlineText("");
      (utils.projects as any).listAllTasks.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.projects.updateTask.useMutation({
    onSuccess: () => (utils.projects as any).listAllTasks.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      setDeleteProjectId(null);
      utils.projects.list.invalidate();
      (utils.projects as any).listAllTasks.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const projectList = useMemo(() => (projects as unknown as Project[]) || [], [projects]);
  const taskList = useMemo(() => (allTasks as unknown as Task[]) || [], [allTasks]);
  const userList = useMemo(() => (users as unknown as UserRecord[]) || [], [users]);

  const projectMap = useMemo(() => {
    const map = new Map<number, Project>();
    projectList.forEach((p) => map.set(p.id, p));
    return map;
  }, [projectList]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return taskList.filter((task) => {
      const projectName = projectMap.get(task.projectId)?.name || "";
      const matchesSearch =
        !query ||
        task.name.toLowerCase().includes(query) ||
        (task.description || "").toLowerCase().includes(query) ||
        projectName.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesProject = projectFilter === "all" || task.projectId === Number(projectFilter);
      return matchesSearch && matchesStatus && matchesPriority && matchesProject;
    });
  }, [taskList, search, projectMap, statusFilter, priorityFilter, projectFilter]);

  const groupedByProject = useMemo(() => {
    const groups = new Map<number, Task[]>();
    filteredTasks.forEach((task) => {
      const list = groups.get(task.projectId) || [];
      list.push(task);
      groups.set(task.projectId, list);
    });
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
    projectList.forEach((project) => {
      const includeProject =
        (projectFilter === "all" || project.id === Number(projectFilter)) &&
        (!search || project.name.toLowerCase().includes(search.toLowerCase()) || groups.has(project.id));
      if (includeProject && !groups.has(project.id)) groups.set(project.id, []);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const aName = projectMap.get(a)?.name || "";
      const bName = projectMap.get(b)?.name || "";
      return aName.localeCompare(bName);
    });
  }, [filteredTasks, projectList, projectFilter, search, projectMap]);

  const boardTasks = useMemo(() => {
    const cols: Record<string, Task[]> = { todo: [], in_progress: [], review: [], completed: [] };
    filteredTasks.forEach((task) => {
      if (task.status === "cancelled") return;
      cols[task.status]?.push(task);
    });
    Object.values(cols).forEach((list) =>
      list.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
    );
    return cols;
  }, [filteredTasks]);

  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.status === "completed").length;
    const inProgress = filteredTasks.filter((t) => t.status === "in_progress").length;
    const review = filteredTasks.filter((t) => t.status === "review").length;
    const overdue = filteredTasks.filter((t) => {
      const days = daysUntilDate(t.dueDate);
      return days !== null && days < 0 && t.status !== "completed" && t.status !== "cancelled";
    }).length;
    return { total, completed, inProgress, review, overdue, completionRate: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }, [filteredTasks]);

  const isLoading = projectsLoading || tasksLoading;

  function handleProjectSubmit(e: FormEvent) {
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

  function handleTaskSubmit(e: FormEvent) {
    e.preventDefault();
    if (!taskForm.projectId) { toast.error("Select a project"); return; }
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

  function handleStatusUpdate(taskId: number, status: Task["status"]) {
    updateTask.mutate({ id: taskId, status, completedDate: status === "completed" ? new Date() : undefined });
  }

  function toggleTaskComplete(task: Task) {
    handleStatusUpdate(task.id, task.status === "completed" ? "todo" : "completed");
  }

  function toggleExpanded(taskId: number) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }

  function toggleProject(projectId: number) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  }

  const hasActiveFilters = statusFilter !== "all" || priorityFilter !== "all" || projectFilter !== "all";

  const statPills = [
    { Icon: Timer, label: `${metrics.inProgress} in progress`, color: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300", delay: "100ms" },
    { Icon: Eye, label: `${metrics.review} in review`, color: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", delay: "200ms" },
    ...(metrics.overdue > 0 ? [{ Icon: AlertTriangle, label: `${metrics.overdue} overdue`, color: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300", delay: "300ms" }] : []),
    { Icon: CheckCircle2, label: `${metrics.completed}/${metrics.total} done`, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300", delay: "400ms" },
  ];

  return (
    <div className="space-y-5 p-1 animate-fade-in">

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-muted/30 p-6">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
        />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative hidden shrink-0 sm:block">
              <ProgressRing value={statsVisible ? metrics.completionRate : 0} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                {metrics.completionRate}%
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
              </div>
              <p className="text-sm text-muted-foreground">Track work across initiatives and keep delivery moving.</p>

              <div className="flex flex-wrap gap-2 pt-0.5">
                {statPills.map(({ Icon, label, color, delay }) => (
                  <span
                    key={label}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-500",
                      color,
                      statsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                    )}
                    style={{ transitionDelay: delay }}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <form onSubmit={handleProjectSubmit}>
                  <DialogHeader>
                    <DialogTitle>Create project</DialogTitle>
                    <DialogDescription>Start a new initiative and set core planning details.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="project-name">Name *</Label>
                      <Input
                        id="project-name"
                        value={projectForm.name}
                        onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                        placeholder="Website redesign"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select value={projectForm.priority} onValueChange={(v: any) => setProjectForm({ ...projectForm, priority: v })}>
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
                        <Input type="date" value={projectForm.startDate} onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input type="date" value={projectForm.endDate} onChange={(e) => setProjectForm({ ...projectForm, endDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={projectForm.description}
                        onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                        rows={3}
                        placeholder="Goals, scope, and success criteria..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createProject.isPending}>
                      {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Project
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <form onSubmit={handleTaskSubmit}>
                  <DialogHeader>
                    <DialogTitle>Create task</DialogTitle>
                    <DialogDescription>Add a new task into a project workflow.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Project *</Label>
                      <Select value={taskForm.projectId ? String(taskForm.projectId) : ""} onValueChange={(v) => setTaskForm({ ...taskForm, projectId: Number(v) })}>
                        <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                        <SelectContent>
                          {projectList.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Task Name *</Label>
                      <Input
                        value={taskForm.name}
                        onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                        placeholder="Draft kickoff deck"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select value={taskForm.priority} onValueChange={(v: any) => setTaskForm({ ...taskForm, priority: v })}>
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
                        <Input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={taskForm.description}
                        onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                        rows={3}
                        placeholder="Optional details and acceptance criteria..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={addTask.isPending}>
                      {addTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Task
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mt-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Overall completion</span>
            <span className="font-medium">{metrics.completionRate}%</span>
          </div>
          <Progress value={statsVisible ? metrics.completionRate : 0} className="h-1.5 transition-all duration-700" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, projects, or descriptions..."
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {[statusFilter !== "all", priorityFilter !== "all", projectFilter !== "all"].filter(Boolean).length}
              </span>
            )}
          </Button>

          <div className="flex rounded-lg border bg-muted/30 p-1">
            <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => setView("list")}>
              <List className="h-3.5 w-3.5" />
              List
            </Button>
            <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => setView("board")}>
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </Button>
          </div>
        </div>
      </div>

      {/* Collapsible filters */}
      <div className={cn("overflow-hidden transition-all duration-300", showFilters ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0")}>
        <div className="flex flex-wrap gap-2 pb-1">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="All Projects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projectList.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_META).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All Priorities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {Object.entries(PRIORITY_CONFIG).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); setProjectFilter("all"); }}
            >
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        </div>
      ) : view === "list" ? (
        <div className="space-y-4">
          {groupedByProject.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <FolderKanban className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium">No matching projects or tasks</p>
              <p className="text-sm text-muted-foreground">Adjust your filters or create a new task.</p>
            </div>
          )}

          {groupedByProject.map(([projectId, tasks], projectIndex) => {
            const project = projectMap.get(projectId);
            const collapsed = collapsedProjects.has(projectId);
            const doneCount = tasks.filter((t) => t.status === "completed").length;
            const projectProgress = tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);
            const priorityCfg = PRIORITY_CONFIG[project?.priority || "medium"];

            return (
              <div
                key={projectId}
                className={cn(
                  "animate-fade-in-up overflow-hidden rounded-2xl border bg-background shadow-sm",
                  `stagger-${Math.min(projectIndex + 1, 5)}`
                )}
              >
                <button
                  onClick={() => toggleProject(projectId)}
                  className="group w-full px-5 py-4 text-left transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{project?.name || `Project #${projectId}`}</span>
                          {priorityCfg && (
                            <span className={cn("flex items-center gap-1 text-[11px] font-medium", priorityCfg.color)}>
                              <priorityCfg.Icon className="h-3 w-3" />
                              {priorityCfg.label}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 hidden items-center gap-2 sm:flex">
                          <Progress value={projectProgress} className="h-1 w-24" />
                          <span className="text-[11px] text-muted-foreground">
                            {projectProgress}% · {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="text-[11px]">{tasks.length}</Badge>
                      <button
                        type="button"
                        aria-label="Delete project"
                        onClick={(e) => { e.stopPropagation(); setDeleteProjectId(projectId); }}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {collapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                <div className={cn("overflow-hidden transition-all duration-300", collapsed ? "max-h-0" : "max-h-[9999px]")}>
                  <div className="border-t">
                    {tasks.length === 0 && (
                      <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 opacity-50" />
                        No tasks yet. Add one below.
                      </div>
                    )}

                    {tasks.map((task, taskIndex) => {
                      const expanded = expandedTasks.has(task.id);
                      const pCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                      const sCfg = STATUS_META[task.status] || STATUS_META.todo;
                      const assignee = getUserName(userList, task.assigneeId);
                      const dueBadge = dueDateBadge(task.dueDate);
                      const isDone = task.status === "completed";

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "group border-b last:border-b-0 transition-colors",
                            isDone ? "bg-muted/10" : "hover:bg-muted/10"
                          )}
                        >
                          <div
                            onClick={() => toggleExpanded(task.id)}
                            className="flex cursor-pointer items-start gap-3 px-5 py-3"
                          >
                            <div className={cn("mt-1 h-4 w-0.5 shrink-0 rounded-full", pCfg.dot)} />

                            <div onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
                              <Checkbox
                                checked={isDone}
                                onCheckedChange={() => toggleTaskComplete(task)}
                                className="transition-transform duration-150 data-[state=checked]:scale-95"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm font-medium leading-snug transition-colors duration-200", isDone && "line-through text-muted-foreground")}>
                                {task.name}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <span className={cn("h-1.5 w-1.5 rounded-full", sCfg.dot, sCfg.pulse && "animate-pulse")} />
                                  {sCfg.label}
                                </span>
                                {dueBadge && (
                                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", dueBadge.className)}>
                                    {dueBadge.text}
                                  </span>
                                )}
                                {assignee && (
                                  <span className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/20 text-[8px] font-bold text-primary">
                                      {getInitials(assignee)}
                                    </span>
                                    {assignee}
                                  </span>
                                )}
                              </div>
                            </div>

                            <ChevronDown
                              className={cn(
                                "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100",
                                expanded && "rotate-180 opacity-100"
                              )}
                            />
                          </div>

                          <div className={cn("overflow-hidden transition-all duration-300", expanded ? "max-h-[9999px]" : "max-h-0")}>
                            <div className="border-t bg-muted/10 px-5 py-3">
                              {task.description && (
                                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{task.description}</p>
                              )}
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {task.estimatedHours && <span>Est: {task.estimatedHours}h</span>}
                                  {task.actualHours && <span>Actual: {task.actualHours}h</span>}
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Select value={task.status} onValueChange={(next) => handleStatusUpdate(task.id, next as Task["status"])}>
                                    <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(STATUS_META).map(([value, meta]) => (
                                        <SelectItem key={value} value={value}>
                                          <span className="flex items-center gap-2">
                                            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                                            {meta.label}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="px-5 py-2">
                      {inlineProjectId === projectId ? (
                        <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-2 animate-fade-in">
                          <Input
                            ref={inlineRef}
                            value={inlineText}
                            onChange={(e) => setInlineText(e.target.value)}
                            placeholder="Task name... press Enter to save"
                            className="h-8 border-none bg-transparent text-sm shadow-none focus-visible:ring-0"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); handleInlineAdd(projectId); }
                              if (e.key === "Escape") { setInlineProjectId(null); setInlineText(""); }
                            }}
                          />
                          <Button size="sm" className="h-7 text-xs" disabled={addTask.isPending} onClick={() => handleInlineAdd(projectId)}>
                            {addTask.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Cancel quick add task" onClick={() => { setInlineProjectId(null); setInlineText(""); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setInlineProjectId(projectId);
                            setInlineText("");
                            setTimeout(() => inlineRef.current?.focus(), 50);
                          }}
                          className="flex w-full items-center gap-1.5 rounded-lg py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Quick add task
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {BOARD_COLUMNS.map((column, colIndex) => {
            const tasks = boardTasks[column.key] || [];
            return (
              <div
                key={column.key}
                className={cn("animate-fade-in-up rounded-2xl border bg-muted/20", `stagger-${Math.min(colIndex + 1, 5)}`)}
              >
                <div className={cn("flex items-center justify-between rounded-t-2xl px-4 py-3", column.headerColor)}>
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", column.dotColor)} />
                    <span className="text-sm font-semibold">{column.label}</span>
                  </div>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/60 text-[11px] font-bold">
                    {tasks.length}
                  </span>
                </div>

                <div className="space-y-2.5 p-3">
                  {tasks.length === 0 && (
                    <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No tasks here
                    </div>
                  )}
                  {tasks.map((task, taskIdx) => {
                    const pCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                    const projectName = projectMap.get(task.projectId)?.name || "Unassigned";
                    const assignee = getUserName(userList, task.assigneeId);
                    const dueBadge = dueDateBadge(task.dueDate);
                    const expanded = expandedTasks.has(task.id);

                    return (
                      <Card
                        key={task.id}
                        className={cn(
                          "cursor-pointer border-l-2 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                          pCfg.border,
                          `animate-fade-in stagger-${Math.min(taskIdx + 1, 5)}`
                        )}
                        onClick={() => toggleExpanded(task.id)}
                      >
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">{task.name}</p>
                            <pCfg.Icon className={cn("h-3.5 w-3.5 shrink-0", pCfg.color)} />
                          </div>
                          <p className="text-[11px] text-muted-foreground">{projectName}</p>

                          {expanded && task.description && (
                            <p className="rounded-lg bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground animate-fade-in">
                              {task.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            {dueBadge ? (
                              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", dueBadge.className)}>
                                {dueBadge.text}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No due date</span>
                            )}
                            {assignee && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                                {getInitials(assignee)}
                              </span>
                            )}
                          </div>

                          <div onClick={(e) => e.stopPropagation()}>
                            <Select value={task.status} onValueChange={(next) => handleStatusUpdate(task.id, next as Task["status"])}>
                              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_META).map(([value, meta]) => (
                                  <SelectItem key={value} value={value}>
                                    <span className="flex items-center gap-2">
                                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                                      {meta.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete project confirmation dialog */}
      <Dialog open={deleteProjectId !== null} onOpenChange={(open) => { if (!open) setDeleteProjectId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <strong>{deleteProjectId !== null ? (projectMap.get(deleteProjectId)?.name ?? "this project") : "this project"}</strong> and all
              its tasks and milestones. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteProjectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteProject.isPending}
              onClick={() => { if (deleteProjectId !== null) deleteProject.mutate({ id: deleteProjectId }); }}
            >
              {deleteProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
