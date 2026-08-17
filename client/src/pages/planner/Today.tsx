// Unified "Today" planner — fuses today's Google Calendar events and tasks into
// one time-blocked agenda, with the universal quick-add bar on top and inline
// "find time" auto-scheduling for anything still unplanned.

import { useMemo, useState } from "react";
import { CalendarClock, Loader2, CalendarOff, Flag } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import QuickAddBar from "@/components/planner/QuickAddBar";
import type { ScheduleSlot } from "@shared/planner";

const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })();
const PRIORITY_COLOR: Record<string, string> = {
  low: "text-muted-foreground", medium: "text-blue-600", high: "text-amber-600", critical: "text-red-600",
};

function timeLabel(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

interface CalEvent {
  id: string;
  title: string;
  startIso: string | null;
  endIso: string | null;
  allDay: boolean;
  location: string | null;
}

export default function TodayPlanner() {
  const utils = trpc.useUtils();
  const { start, end } = useMemo(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: s, end: new Date(s.getTime() + 24 * 3600 * 1000) };
  }, []);

  const agendaQ = trpc.planner.agenda.useQuery({ startIso: start.toISOString(), endIso: end.toISOString() });
  const tasksQ = trpc.projects.listAllTasks.useQuery();

  function refresh() {
    utils.planner.agenda.invalidate();
    utils.projects.listAllTasks.invalidate();
  }

  const tasks = (tasksQ.data as any[]) ?? [];
  const active = (t: any) => t.status !== "completed" && t.status !== "cancelled";
  const dueOf = (t: any) => (t.dueDate ? new Date(t.dueDate) : null);

  const events = (agendaQ.data?.events ?? []) as CalEvent[];
  const allDayEvents = events.filter((e) => e.allDay);

  const timeline = useMemo(() => {
    const rows: Array<{ key: string; time: Date; title: string; source: "calendar" | "task"; end?: string | null; priority?: string; location?: string | null }> = [];
    for (const e of events) {
      if (e.allDay || !e.startIso) continue;
      const d = new Date(e.startIso);
      if (isNaN(d.getTime())) continue;
      rows.push({ key: "e" + e.id, time: d, title: e.title, source: "calendar", end: e.endIso, location: e.location });
    }
    for (const t of tasks) {
      const d = dueOf(t);
      if (!d || !active(t)) continue;
      if (d >= start && d < end) rows.push({ key: "t" + t.id, time: d, title: t.name, source: "task", priority: t.priority });
    }
    return rows.sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [events, tasks, start, end]);

  const toPlan = useMemo(
    () => tasks.filter((t) => {
      if (!active(t)) return false;
      const d = dueOf(t);
      return !d || d < start; // undated or overdue
    }).slice(0, 40),
    [tasks, start],
  );

  const dateLabel = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const loading = agendaQ.isLoading || tasksQ.isLoading;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </div>

      <QuickAddBar autoFocus onCreated={refresh} />

      {agendaQ.data && !agendaQ.data.googleConnected && (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <CalendarOff className="h-4 w-4" />
          Connect Google Calendar in Settings to see events and auto-schedule against your real availability. Tasks and working-hour slots still work.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {allDayEvents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b pb-3">
                {allDayEvents.map((e) => <Badge key={e.id} variant="secondary">{e.title}</Badge>)}
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>
            ) : timeline.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nothing scheduled today. Add something above, or plan a task from the right.</p>
            ) : (
              <div className="space-y-1">
                {timeline.map((r) => (
                  <div key={r.key} className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40">
                    <div className="w-16 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{timeLabel(r.time)}</div>
                    <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", r.source === "calendar" ? "bg-primary" : "bg-amber-500")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.source === "calendar" ? "Calendar" : "Task"}
                        {r.end && r.source === "calendar" ? ` · until ${timeLabel(new Date(r.end))}` : ""}
                        {r.location ? ` · ${r.location}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* To plan */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">To plan <span className="font-normal text-muted-foreground">({toPlan.length})</span></CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? null : toPlan.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting to be planned. 🎉</p>
            ) : (
              toPlan.map((t) => <PlanRow key={t.id} task={t} onBooked={refresh} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlanRow({ task, onBooked }: { task: any; onBooked: () => void }) {
  const [slots, setSlots] = useState<ScheduleSlot[] | null>(null);
  const overdue = task.dueDate && new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));

  const suggest = trpc.scheduling.suggest.useMutation({
    onSuccess: (res) => {
      setSlots(res.slots as ScheduleSlot[]);
      if (!res.slots.length) toast.message("No open slots in the next 7 days.");
      if (!res.googleConnected) toast.message("Google Calendar not connected — showing working-hour slots.");
    },
    onError: (e) => toast.error(e.message),
  });
  const book = trpc.scheduling.book.useMutation({
    onSuccess: (res) => { toast.success(res.detail); setSlots(null); onBooked(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{task.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Flag className={cn("h-3 w-3", PRIORITY_COLOR[task.priority] || "text-muted-foreground")} />
            <span className="capitalize">{task.priority}</span>
            {overdue && <span className="text-red-600"> · overdue</span>}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1" disabled={suggest.isPending}
          onClick={() => suggest.mutate({ durationMinutes: 30, timezone: BROWSER_TZ, maxResults: 5 })}>
          {suggest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
          Find time
        </Button>
      </div>
      {slots && slots.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {slots.map((s) => (
            <Button key={s.startIso} size="sm" variant="secondary" className="h-6 px-2 text-xs" disabled={book.isPending}
              onClick={() => book.mutate({ title: task.name, startIso: s.startIso, endIso: s.endIso })}>
              {s.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
