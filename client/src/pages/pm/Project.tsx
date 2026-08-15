import { useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { PmHeader, PmTabs, ProgressBar, PM_STATUSES, STATUS_LABEL, PM_PRIORITIES, fmtDate, fmtMoney, daysSince, type PmStatus, type PmPriority } from "./_shared";
import InlineEdit from "@/components/InlineEdit";

export default function PmProject() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.pm.projects.get.useQuery({ id }, { enabled: !isNaN(id) });
  const { data: markets } = trpc.pm.markets.list.useQuery();
  const { data: functions } = trpc.pm.functions.list.useQuery();

  // Dedicated per-project list queries (kept in sync with projects.get).
  const enabled = !isNaN(id);
  const tasksQ = trpc.pm.tasks.listByProject.useQuery({ projectId: id }, { enabled });
  const milestonesQ = trpc.pm.milestones.listByProject.useQuery({ projectId: id }, { enabled });
  const depsQ = trpc.pm.dependencies.listForProject.useQuery({ projectId: id }, { enabled });

  const invalidateTasks = () => { refetch(); utils.pm.tasks.listByProject.invalidate({ projectId: id }); };
  const invalidateMilestones = () => { refetch(); utils.pm.milestones.listByProject.invalidate({ projectId: id }); };
  const invalidateDeps = () => { refetch(); utils.pm.dependencies.listForProject.invalidate({ projectId: id }); };

  const update = trpc.pm.projects.update.useMutation({
    onSuccess: () => { toast.success("Saved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const createTask = trpc.pm.tasks.create.useMutation({ onSuccess: invalidateTasks });
  const updateTask = trpc.pm.tasks.update.useMutation({ onSuccess: invalidateTasks });
  const deleteTask = trpc.pm.tasks.delete.useMutation({ onSuccess: invalidateTasks });
  const createMilestone = trpc.pm.milestones.create.useMutation({ onSuccess: invalidateMilestones });
  const updateMilestone = trpc.pm.milestones.update.useMutation({
    onSuccess: () => { invalidateMilestones(); toast.success("Milestone updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMilestone = trpc.pm.milestones.delete.useMutation({
    onSuccess: invalidateMilestones,
    onError: (e) => toast.error(e.message),
  });
  const createDependency = trpc.pm.dependencies.create.useMutation({
    onSuccess: () => { invalidateDeps(); toast.success("Dependency linked"); },
    onError: (e) => toast.error(e.message),
  });

  const [newTaskName, setNewTaskName] = useState("");
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneDate, setNewMilestoneDate] = useState("");
  const [blockerEditOpen, setBlockerEditOpen] = useState(false);
  const [blockerReason, setBlockerReason] = useState("");
  const [depOtherId, setDepOtherId] = useState("");
  const [depDirection, setDepDirection] = useState("blocks");
  const [depType, setDepType] = useState("blocks");

  if (isLoading || !data) {
    return (
      <div>
        <PmTabs />
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  const { project } = data;
  // Prefer the dedicated list queries; fall back to the projects.get payload.
  const tasks = tasksQ.data ?? data.tasks;
  const milestones = milestonesQ.data ?? data.milestones;
  const dependencies = depsQ.data ?? data.dependencies;
  const market = markets?.find(m => m.id === project.marketId);
  const fn = functions?.find(f => f.id === project.functionId);
  const taskDone = tasks.filter(t => t.status === "done").length;
  const taskTotal = tasks.length;
  const taskPct = taskTotal === 0 ? 0 : Math.round((taskDone / taskTotal) * 100);

  return (
    <div>
      <PmHeader
        title={project.name}
        subtitle={`${market?.name ?? "Market"} · ${fn?.name ?? "Function"}`}
      />
      <PmTabs />

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {project.status === "blocked" && (
            <Card className="p-3 border-destructive bg-destructive/5">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-semibold">
                  Blocked {daysSince(project.blockedSince)} day(s)
                </span>
              </div>
              <div className="text-sm mt-1">{project.blockerReason ?? "No reason logged."}</div>
            </Card>
          )}
          {project.atRisk && project.status !== "blocked" && (
            <Card className="p-3 border-warning bg-warning/5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="text-sm font-semibold">At risk</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Flagged at risk because an upstream dependency is blocked.
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Description</div>
            <InlineEdit
              value={project.description ?? ""}
              type="text"
              placeholder="No description."
              onSave={(v) => update.mutate({ id, description: v })}
            />
          </Card>

          <Card className="p-0">
            <div className="px-4 py-2 border-b flex items-center gap-3">
              <div className="text-sm font-semibold">Tasks</div>
              <div className="text-xs text-muted-foreground tabular-nums">{taskDone} of {taskTotal} done · {taskPct}%</div>
              <ProgressBar className="flex-1 max-w-48" value={taskDone} max={taskTotal} />
            </div>
            <div className="p-3 border-b flex gap-2">
              <Input
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="Add a task…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskName.trim()) {
                    createTask.mutate({ projectId: id, name: newTaskName.trim() });
                    setNewTaskName("");
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (!newTaskName.trim()) return;
                  createTask.mutate({ projectId: id, name: newTaskName.trim() });
                  setNewTaskName("");
                }}
                size="sm"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            <div className="divide-y">
              {tasks.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No tasks yet.</div>
              ) : tasks.map(t => (
                <div key={t.id} className="p-3 flex items-center gap-3">
                  <Select value={t.status} onValueChange={(v) => updateTask.mutate({ id: t.id, status: v as any })}>
                    <SelectTrigger className="w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To do</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1 text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(t.dueDate)}</div>
                  <Button variant="ghost" size="sm" onClick={() => deleteTask.mutate({ id: t.id })}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-0">
            <div className="px-4 py-3 border-b text-sm font-semibold">Milestones ({milestones.length})</div>
            <div className="p-3 border-b flex gap-2">
              <Input
                value={newMilestoneName}
                onChange={(e) => setNewMilestoneName(e.target.value)}
                placeholder="Milestone name"
                className="flex-1"
              />
              <Input
                type="date"
                value={newMilestoneDate}
                onChange={(e) => setNewMilestoneDate(e.target.value)}
                className="w-44"
              />
              <Button
                onClick={() => {
                  if (!newMilestoneName.trim() || !newMilestoneDate) return;
                  createMilestone.mutate({
                    projectId: id,
                    name: newMilestoneName.trim(),
                    targetDate: new Date(newMilestoneDate),
                  }, {
                    onSuccess: () => {
                      setNewMilestoneName("");
                      setNewMilestoneDate("");
                      refetch();
                    },
                  });
                }}
                size="sm"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            <div className="divide-y">
              {milestones.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No milestones yet.</div>
              ) : milestones.map(m => (
                <div key={m.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="text-right text-xs mr-1">
                      <div>Target {fmtDate(m.targetDate)}</div>
                      {m.actualDate && <div className="text-success">Done {fmtDate(m.actualDate)}</div>}
                    </div>
                    {!m.actualDate && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Mark done"
                        disabled={updateMilestone.isPending}
                        onClick={() => updateMilestone.mutate({ id: m.id, actualDate: new Date() })}
                      >
                        <Check className="w-4 h-4 text-success" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Delete milestone"
                      disabled={deleteMilestone.isPending}
                      onClick={() => { if (confirm("Delete this milestone?")) deleteMilestone.mutate({ id: m.id }); }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-0">
            <div className="px-4 py-3 border-b text-sm font-semibold">Dependencies ({dependencies.length})</div>
            <div className="p-3 flex flex-wrap items-center gap-2 border-b bg-muted/30">
              <Select value={depDirection} onValueChange={setDepDirection}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocks">This blocks</SelectItem>
                  <SelectItem value="blocked_by">Blocked by</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="w-28"
                type="number"
                placeholder="Project #"
                value={depOtherId}
                onChange={(e) => setDepOtherId(e.target.value)}
              />
              <Select value={depType} onValueChange={setDepType}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocks">blocks</SelectItem>
                  <SelectItem value="related">related</SelectItem>
                  <SelectItem value="informs">informs</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={createDependency.isPending}
                onClick={() => {
                  const other = Number(depOtherId);
                  if (!other || isNaN(other)) { toast.error("Enter a project number"); return; }
                  const payload = depDirection === "blocks"
                    ? { predecessorProjectId: id, successorProjectId: other }
                    : { predecessorProjectId: other, successorProjectId: id };
                  createDependency.mutate({ ...payload, dependencyType: depType as "blocks" | "related" | "informs" });
                  setDepOtherId("");
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> Link
              </Button>
            </div>
            <div className="divide-y">
              {dependencies.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No dependencies linked.</div>
              ) : dependencies.map(d => {
                const isPred = d.successorProjectId === id;
                const otherId = isPred ? d.predecessorProjectId : d.successorProjectId;
                return (
                  <div key={d.id} className="p-3 text-sm flex items-center justify-between">
                    <div>
                      <span className="text-xs uppercase mr-2 text-muted-foreground">
                        {isPred ? "blocked by" : "blocks"} ({d.dependencyType})
                      </span>
                      <Link href={`/pm/project/${otherId}`} className="hover:underline">Project #{otherId}</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4 space-y-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Status</div>
              <Select
                value={project.status}
                onValueChange={(v) => {
                  if (v === "blocked") {
                    setBlockerEditOpen(true);
                    setBlockerReason(project.blockerReason ?? "");
                  } else {
                    update.mutate({ id, status: v as PmStatus });
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PM_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              {blockerEditOpen && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={blockerReason}
                    onChange={(e) => setBlockerReason(e.target.value)}
                    placeholder="Why is this blocked?"
                    rows={2}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setBlockerEditOpen(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        update.mutate({ id, status: "blocked", blockerReason });
                        setBlockerEditOpen(false);
                      }}
                    >
                      Mark blocked
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Priority</div>
              <Select
                value={project.priority ?? undefined}
                onValueChange={(v) => update.mutate({ id, priority: v as PmPriority })}
              >
                <SelectTrigger className="h-8 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {PM_PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Start</div>
              <div className="text-sm">{fmtDate(project.startDate)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Target end</div>
              <div className="text-sm">{fmtDate(project.targetEndDate)}</div>
            </div>
            {project.actualEndDate && (
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Completed</div>
                <div className="text-sm text-success">{fmtDate(project.actualEndDate)}</div>
              </div>
            )}
          </Card>

          {project.cashEventAmount && (
            <Card className="p-4 space-y-2">
              <div className="text-sm font-semibold">Cash event</div>
              <div className="text-2xl font-bold font-mono">{fmtMoney(project.cashEventAmount)}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {project.cashEventType} · {fmtDate(project.cashEventDate)}
              </div>
              <div className="text-xs text-muted-foreground">
                Pushed to <code>financial_model</code> on completion.
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
