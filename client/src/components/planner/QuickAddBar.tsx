// Universal natural-language quick-add. Type one line ("Call the co-packer
// Thursday 3pm", "remind me to send the deck tomorrow", "idea: bundle SKUs") →
// the server LLM classifies it into a task / event / reminder / note and creates
// it. For time-blockable items you can "Find time" and book an open slot.

import { useState } from "react";
import { Sparkles, Loader2, CalendarClock, CheckSquare, Bell, StickyNote, Calendar as CalIcon, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { QuickAddIntent, QuickAddKind, ScheduleSlot } from "@shared/planner";

const BROWSER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
})();

const KIND_META: Record<QuickAddKind, { label: string; icon: typeof CheckSquare }> = {
  task: { label: "Task", icon: CheckSquare },
  event: { label: "Event", icon: CalIcon },
  reminder: { label: "Reminder", icon: Bell },
  note: { label: "Note", icon: StickyNote },
};

function formatWhen(wall?: string | null): string | null {
  if (!wall) return null;
  const d = new Date(wall);
  if (isNaN(d.getTime())) return wall;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface QuickAddBarProps {
  onCreated?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function QuickAddBar({ onCreated, placeholder, autoFocus }: QuickAddBarProps) {
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<QuickAddIntent | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[] | null>(null);

  const parse = trpc.quickAdd.parse.useMutation({
    onSuccess: (res) => setIntent(res as QuickAddIntent),
    onError: (e) => toast.error(e.message),
  });
  const commit = trpc.quickAdd.commit.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.detail}: ${res.title}`);
      reset();
      onCreated?.();
    },
    onError: (e) => toast.error(e.message),
  });
  const suggest = trpc.scheduling.suggest.useMutation({
    onSuccess: (res) => {
      setSlots(res.slots as ScheduleSlot[]);
      if (res.slots.length === 0) toast.message("No open slots found in the next 7 days.");
      if (!res.googleConnected) toast.message("Google Calendar not connected — showing working-hour slots only.");
    },
    onError: (e) => toast.error(e.message),
  });
  const book = trpc.scheduling.book.useMutation({
    onSuccess: (res) => { toast.success(res.detail); reset(); onCreated?.(); },
    onError: (e) => toast.error(e.message),
  });

  function reset() {
    setText(""); setIntent(null); setSlots(null);
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    setSlots(null);
    parse.mutate({ text: t, timezone: BROWSER_TZ });
  }

  function findTime() {
    if (!intent) return;
    suggest.mutate({ durationMinutes: intent.durationMinutes || 30, timezone: BROWSER_TZ, maxResults: 6 });
  }

  function bookSlot(slot: ScheduleSlot) {
    if (!intent) return;
    book.mutate({ title: intent.title, startIso: slot.startIso, endIso: slot.endIso, description: intent.description || undefined });
  }

  const Icon = intent ? KIND_META[intent.kind].icon : Sparkles;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder={placeholder || "Add anything… e.g. “Call the co-packer Thursday 3pm” or “remind me to send the deck tomorrow”"}
            className="pl-9"
          />
        </div>
        <Button onClick={submit} disabled={parse.isPending || !text.trim()} className="gap-1.5">
          {parse.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Add
        </Button>
      </div>

      {intent && (
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1"><Icon className="h-3 w-3" /> {KIND_META[intent.kind].label}</Badge>
                  {intent.priority && <Badge variant="outline" className="capitalize">{intent.priority}</Badge>}
                  {formatWhen(intent.datetime) && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3 w-3" />{formatWhen(intent.datetime)}</span>
                  )}
                </div>
                <Input
                  value={intent.title}
                  onChange={(e) => setIntent({ ...intent, title: e.target.value })}
                  className="h-8 font-medium"
                />
                {intent.location && <p className="text-xs text-muted-foreground">📍 {intent.location}</p>}
              </div>
              <Button size="icon-sm" variant="ghost" onClick={reset}><X className="h-4 w-4" /></Button>
            </div>

            {slots && slots.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => (
                  <Button key={s.startIso} size="sm" variant="outline" className="h-7" disabled={book.isPending} onClick={() => bookSlot(s)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" disabled={commit.isPending} onClick={() => commit.mutate({ intent, timezone: BROWSER_TZ })} className="gap-1.5">
                {commit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                {intent.kind === "event" ? "Add to calendar" : intent.kind === "note" ? "Save note" : "Add task"}
              </Button>
              {intent.kind !== "note" && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={suggest.isPending} onClick={findTime}>
                  {suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  Find time
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
