import { useMemo, useRef, useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FolderKanban,
  Plus,
  Search,
  Loader2,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  Clock3,
  CheckCircle,
  AlertTriangle,
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

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-500/15 text-red-600 border-red-300" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-600 border-orange-300" },
  medium: { label: "Medium", className: "bg-amber-500/15 text-amber-600 border-amber-300" },
  low: { label: "Low", className: "bg-emerald-500/15 text-emerald-600 border-emerald-300" },
};

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_META = {
  todo: { label: "To Do", accent: "border-slate-300", badge: "bg-slate-500/10 text-slate-600" },
  in_progress: { label: "In Progress", accent: "border-blue-300", badge: "bg-blue-500/10 text-blue-600" },
  review: { label: "In Review", accent: "border-violet-300", badge: "bg-violet-500/10 text-violet-600" },
  completed: { label: "Completed", accent: "border-emerald-300", badge: "bg-emerald-500/10 text-emerald-600" },
  cancelled: { label: "Cancelled", accent: "border-zinc-300", badge: "bg-zinc-500/10 text-zinc-600" },
} as const;

const BOARD_COLUMNS = [
  { key: "todo", label: "To Do", accent: "border-slate-300" },
  { key: "in_progress", label: "In Progress", accent: "border-blue-300" },
  { key: "review", label: "In Review", accent: "border-violet-300" },
  { key: "completed", label: "Completed", accent: "border-emerald-300" },
] as const;

function getUserName(users: UserRecord[] | undefined, id: number | null): string {
  if (!id || !users) return "";
  const user = users.find((u) => u.id === id);
  if (!user) return "";
  return user.name || user.email.split("@")[0];
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntilDate(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const due = new Date(d);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function dueDateColor(d: string | Date | null | undefined): string {
  const days = daysUntilDate(d);
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "text-red-600";
  if (days <= 3) return "text-amber-600";
  return "text-emerald-600";
}

export default function Projects() {
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());

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

  const utils = trpc.useUtils();
  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const { data: allTasks, isLoading: tasksLoading } = (trpc.projects as any).listAllTasks.useQuery();
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

  const projectList = useMemo(() => (projects as unknown as Project[]) || [], [projects]);
  const taskList = useMemo(() => (allTasks as unknown as Task[]) || [], [allTasks]);
  const userList = useMemo(() => (users as unknown as UserRecord[]) || [], [users]);

  const projectMap = useMemo(() => {
    const map = new Map<number, Project>();
    projectList.forEach((project) => map.set(project.id, project));
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
    return {
      total,
      completed,
      inProgress,
      review,
      overdue,
      completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
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

  function handleStatusUpdate(taskId: number, status: Task["status"]) {
    updateTask.mutate({
      id: taskId,
      status,
      completedDate: status === "completed" ? new Date() : undefined,
    });
  }

  function toggleTaskComplete(task: Task) {
    handleStatusUpdate(task.id, task.status === "completed" ? "todo" : "completed");
  }

  function toggleExpanded(taskId: number) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleProject(projectId: number) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  return (
    <div className="space-y-5 p-1 animate-fade-in">
      <div className="rounded-xl border bg-background p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Track work across projects and keep delivery moving.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-1.5 h-4 w-4" />
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
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" />
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
                      <Select
                        value={taskForm.projectId ? String(taskForm.projectId) : ""}
                        onValueChange={(v) => setTaskForm({ ...taskForm, projectId: Number(v) })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                        <SelectContent>
                          {projectList.map((project) => (
                            <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                          ))}
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <p className="text-3xl font-semibold">{metrics.completionRate}%</p>
              <p className="text-xs text-muted-foreground">
                {metrics.completed}/{metrics.total} completed
              </p>
            </div>
            <Progress value={metrics.completionRate} className="h-2.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full items-center gap-3 p-4">
            <Clock3 className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-xl font-semibold">{metrics.inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full items-center gap-3 p-4">
            <CheckCircle className="h-5 w-5 text-violet-600" />
            <div>
              <p className="text-xs text-muted-foreground">In Review</p>
              <p className="text-xl font-semibold">{metrics.review}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(metrics.overdue > 0 && "border-red-300")}>
          <CardContent className="flex h-full items-center gap-3 p-4">
            <AlertTriangle className={cn("h-5 w-5", metrics.overdue > 0 ? "text-red-600" : "text-muted-foreground")} />
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className={cn("text-xl font-semibold", metrics.overdue > 0 && "text-red-600")}>{metrics.overdue}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks, projects, or descriptions..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projectList.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_META).map(([key, status]) => (
                    <SelectItem key={key} value={key}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {Object.entries(PRIORITY_BADGE).map(([key, priority]) => (
                    <SelectItem key={key} value={key}>{priority.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex rounded-lg border p-1">
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                className="gap-1.5"
                onClick={() => setView("list")}
              >
                <List className="h-4 w-4" />
                List
              </Button>
              <Button
                size="sm"
                variant={view === "board" ? "secondary" : "ghost"}
                className="gap-1.5"
                onClick={() => setView("board")}
              >
                <LayoutGrid className="h-4 w-4" />
                Board
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : view === "list" ? (
        <div className="space-y-4">
          {groupedByProject.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <FolderKanban className="mx-auto mb-3 h-12 w-12 opacity-20" />
                <p className="font-medium">No matching projects or tasks</p>
                <p className="text-sm">Adjust your filters or create a new task.</p>
              </CardContent>
            </Card>
          )}

          {groupedByProject.map(([projectId, tasks]) => {
            const project = projectMap.get(projectId);
            const collapsed = collapsedProjects.has(projectId);
            const doneCount = tasks.filter((task) => task.status === "completed").length;
            const projectProgress = tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);

            return (
              <Card key={projectId} className="overflow-hidden border">
                <button
                  onClick={() => toggleProject(projectId)}
                  className="w-full border-b bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {collapsed ? (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-semibold">{project?.name || `Project #${projectId}`}</span>
                      <Badge variant="secondary">{tasks.length} tasks</Badge>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <span className="text-xs text-muted-foreground">{projectProgress}% complete</span>
                      <Progress value={projectProgress} className="h-2 w-24" />
                    </div>
                  </div>
                </button>

                {!collapsed && (
                  <CardContent className="space-y-2 p-3">
                    {tasks.length === 0 && (
                      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        No tasks yet for this project.
                      </p>
                    )}

                    {tasks.map((task) => {
                      const expanded = expandedTasks.has(task.id);
                      const priority = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
                      const assignee = getUserName(userList, task.assigneeId);
                      const status = STATUS_META[task.status];

                      return (
                        <div key={task.id} className="rounded-md border bg-background">
                          <div
                            onClick={() => toggleExpanded(task.id)}
                            className={cn(
                              "flex cursor-pointer flex-col gap-2 p-3 md:flex-row md:items-center",
                              task.status === "completed" && "opacity-70"
                            )}
                          >
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mr-1 self-start pt-0.5 md:self-center md:pt-0"
                            >
                              <Checkbox
                                checked={task.status === "completed"}
                                onCheckedChange={() => toggleTaskComplete(task)}
                              />
                            </div>
                            <div className="flex-1">
                              <p
                                className={cn(
                                  "text-sm font-medium",
                                  task.status === "completed" && "line-through text-muted-foreground"
                                )}
                              >
                                {task.name}
                              </p>
                              {expanded && task.description && (
                                <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                              <Badge className={cn("border text-[10px] font-normal", status.badge)}>{status.label}</Badge>
                              <Badge variant="outline" className={cn("text-[10px]", priority.className)}>
                                {priority.label}
                              </Badge>
                              {task.dueDate && (
                                <span className={cn("text-xs font-medium", dueDateColor(task.dueDate))}>
                                  {fmtDate(task.dueDate)}
                                </span>
                              )}
                              {assignee && (
                                <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                                  @{assignee}
                                </span>
                              )}
                            </div>
                          </div>
                          {expanded && (
                            <div className="border-t px-3 pb-3 pt-2">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="text-xs text-muted-foreground">
                                  {task.estimatedHours && <span className="mr-3">Est: {task.estimatedHours}h</span>}
                                  {task.actualHours && <span>Actual: {task.actualHours}h</span>}
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Select
                                    value={task.status}
                                    onValueChange={(next) => handleStatusUpdate(task.id, next as Task["status"])}
                                  >
                                    <SelectTrigger className="h-8 w-[150px] text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(STATUS_META).map(([value, meta]) => (
                                        <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {inlineProjectId === projectId ? (
                      <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
                        <Input
                          ref={inlineRef}
                          value={inlineText}
                          onChange={(e) => setInlineText(e.target.value)}
                          placeholder="Task name..."
                          className="h-8"
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
                        />
                        <Button size="sm" disabled={addTask.isPending} onClick={() => handleInlineAdd(projectId)}>
                          Add
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="h-8 w-full justify-start text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setInlineProjectId(projectId);
                          setInlineText("");
                          setTimeout(() => inlineRef.current?.focus(), 50);
                        }}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Quick add task
                      </Button>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-4">
          {BOARD_COLUMNS.map((column) => {
            const tasks = boardTasks[column.key] || [];
            return (
              <Card key={column.key} className="min-h-[420px]">
                <CardHeader className={cn("border-b-2 pb-3", column.accent)}>
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>{column.label}</span>
                    <Badge variant="secondary">{tasks.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-3">
                  {tasks.length === 0 && (
                    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No tasks in this column
                    </div>
                  )}
                  {tasks.map((task) => {
                    const priority = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
                    const projectName = projectMap.get(task.projectId)?.name || "Unassigned";
                    const assignee = getUserName(userList, task.assigneeId);

                    return (
                      <Card
                        key={task.id}
                        className="cursor-pointer border bg-background transition-shadow hover:shadow-sm"
                        onClick={() => toggleExpanded(task.id)}
                      >
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">{task.name}</p>
                            <Badge variant="outline" className={cn("text-[10px]", priority.className)}>
                              {priority.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{projectName}</p>
                          {expandedTasks.has(task.id) && task.description && (
                            <p className="rounded bg-muted/60 p-2 text-xs text-muted-foreground">{task.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            {task.dueDate ? (
                              <span className={cn("text-xs font-medium", dueDateColor(task.dueDate))}>
                                Due {fmtDate(task.dueDate)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">No due date</span>
                            )}
                            {assignee ? (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                @{assignee}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Unassigned</span>
                            )}
                          </div>
                          <Select
                            value={task.status}
                            onValueChange={(next) => handleStatusUpdate(task.id, next as Task["status"])}
                          >
                            <SelectTrigger
                              className="h-8 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_META).map(([value, meta]) => (
                                <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
