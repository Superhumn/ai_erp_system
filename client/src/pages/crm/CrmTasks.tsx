import { useState } from "react";
import { format, isToday, isPast } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, CheckCircle2, Circle, ListTodo, Loader2, Mail, Phone, Plus, Trash2, Users } from "lucide-react";

type TaskType = "call" | "email" | "meeting" | "follow_up" | "todo";
type TaskView = "today" | "overdue" | "upcoming" | "mine";

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "follow_up", label: "Follow-up" },
  { value: "todo", label: "To-do" },
];

const TYPE_ICON: Record<string, typeof Phone> = { call: Phone, email: Mail, meeting: Users, follow_up: CalendarClock, todo: ListTodo };

/** yyyy-MM-dd for a date input, from today + `days`. */
function dateInput(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

/** A date-input value (local day) as a Date at 17:00 local — "due end of workday". */
function dueFromInput(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 17, 0, 0);
}

/** Tasks tab: today / overdue / upcoming lists for the signed-in user. */
export function TasksPanel() {
  const [view, setView] = useState<TaskView>("today");
  const counts = {
    today: trpc.crm.tasks.list.useQuery({ view: "today" }).data?.length,
    overdue: trpc.crm.tasks.list.useQuery({ view: "overdue" }).data?.length,
    upcoming: trpc.crm.tasks.list.useQuery({ view: "upcoming" }).data?.length,
  };
  const views: { key: TaskView; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "overdue", label: "Overdue" },
    { key: "upcoming", label: "Upcoming" },
    { key: "mine", label: "All open" },
  ];
  return (
    <Card className="py-3">
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {views.map((v) => {
              const n = v.key === "mine" ? undefined : counts[v.key];
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {v.label}{n ? <span className={`ml-1 ${v.key === "overdue" && view !== v.key ? "text-destructive font-semibold" : ""}`}>{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="sm:ml-auto"><QuickAddTask label="New task" /></div>
        </div>
        <TaskList view={view} />
      </CardContent>
    </Card>
  );
}

/** Task list for a view (the caller's tasks) or for one record (all assignees). */
export function TaskList({ view, filter, compact }: {
  view?: TaskView;
  filter?: { contactId?: number; dealId?: number; accountId?: number };
  compact?: boolean;
}) {
  const utils = trpc.useUtils();
  const input = filter ? { ...filter } : { view: view ?? "mine" };
  const { data: tasks, isLoading } = trpc.crm.tasks.list.useQuery(input);
  const refresh = () => utils.crm.tasks.list.invalidate();
  const complete = trpc.crm.tasks.complete.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const del = trpc.crm.tasks.delete.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const rows = tasks ?? [];
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic flex items-center justify-between gap-2 py-2">
        <span>{filter ? "No tasks yet." : view === "overdue" ? "Nothing overdue." : "No tasks here."}</span>
        {filter && compact && <QuickAddTask {...filter} label="Add task" />}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {filter && compact && <div className="flex justify-end"><QuickAddTask {...filter} label="Add task" /></div>}
      {rows.map((t) => {
        const Icon = TYPE_ICON[t.type] ?? ListTodo;
        const done = !!t.completedAt;
        const due = t.dueAt ? new Date(t.dueAt) : null;
        const overdue = !done && due != null && isPast(due) && !isToday(due);
        return (
          <div key={t.id} className={`flex items-start gap-2 p-2 border rounded-md text-sm ${done ? "opacity-60" : ""}`}>
            <button
              type="button"
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
              title={done ? "Mark not done" : "Mark done"}
              onClick={() => complete.mutate({ id: t.id, completed: !done })}
            >
              {done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`font-medium break-words ${done ? "line-through" : ""}`}>{t.title}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{TASK_TYPES.find((x) => x.value === t.type)?.label ?? t.type}</span>
                {due && <span className={overdue ? "text-destructive font-medium" : ""}>{isToday(due) ? "Today" : format(due, "MMM d")}</span>}
                {t.notes && <span className="truncate max-w-[220px]">{t.notes}</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Delete" onClick={() => { if (confirm("Delete this task?")) del.mutate({ id: t.id }); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** Button + dialog to add a task, optionally pre-linked to a contact / deal / account. */
export function QuickAddTask({ contactId, dealId, accountId, label = "Add task" }: {
  contactId?: number;
  dealId?: number;
  accountId?: number;
  label?: string;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("call");
  const [due, setDue] = useState(dateInput(1));
  const [notes, setNotes] = useState("");
  const create = trpc.crm.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task added");
      setOpen(false);
      setTitle("");
      setNotes("");
      setDue(dateInput(1));
      utils.crm.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" />{label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>You'll get an email the day it's due.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">What</Label>
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call food services director re: tasting" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due</Label>
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {[["Today", 0], ["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7]].map(([l, d]) => (
                <Badge key={String(l)} variant="outline" className="cursor-pointer text-[11px]" onClick={() => setDue(dateInput(Number(d)))}>{l}</Badge>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!title.trim() || create.isPending}
              onClick={() => create.mutate({ title: title.trim(), type, dueAt: dueFromInput(due), notes: notes || null, contactId, dealId, accountId })}
            >
              {create.isPending ? "Adding…" : "Add task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
