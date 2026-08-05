import { useState } from "react";
import { useLocation } from "wouter";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Ban,
  X,
  ChevronDown,
  ListChecks,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useBackgroundTasksOptional,
  type BackgroundTask,
} from "@/contexts/BackgroundTasksContext";

const isIndeterminate = (t: BackgroundTask) =>
  (t.status === "queued" || t.status === "running") && t.total <= 0;

function StatusIcon({ task, className }: { task: BackgroundTask; className?: string }) {
  switch (task.status) {
    case "success":
      return <CheckCircle2 className={cn("h-4 w-4 text-muted-foreground", className)} />;
    case "error":
      return <AlertCircle className={cn("h-4 w-4 text-foreground", className)} />;
    case "cancelled":
      return <Ban className={cn("h-4 w-4 text-muted-foreground", className)} />;
    default:
      return <Loader2 className={cn("h-4 w-4 animate-spin text-primary", className)} />;
  }
}

function TaskRow({
  task,
  onCancel,
  onDismiss,
  onOpen,
}: {
  task: BackgroundTask;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onOpen: (link: string) => void;
}) {
  const active = task.status === "queued" || task.status === "running";
  const indeterminate = isIndeterminate(task);
  const pct = indeterminate ? undefined : Math.max(0, Math.min(100, task.progress));

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card/60 p-2.5">
      <div className="flex items-start gap-2">
        <StatusIcon task={task} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground" title={task.title}>
            {task.title}
          </div>
          {(task.message || task.description) && (
            <div className="truncate text-[11px] text-muted-foreground" title={task.message || task.description || ""}>
              {task.message || task.description}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {task.link && !active && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => onOpen(task.link!)}
                  aria-label="Open"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View result</TooltipContent>
            </Tooltip>
          )}
          {active ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => onCancel(task.id)}
                  aria-label="Cancel task"
                >
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onDismiss(task.id)}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {active && (
        <div className="flex items-center gap-2">
          <Progress
            value={indeterminate ? 100 : pct}
            className={cn("h-1.5 flex-1", indeterminate && "animate-pulse opacity-70")}
          />
          {!indeterminate && (
            <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
              {pct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Header indicator: a small button that shows in-flight background work and, on
 * click, a popover listing every visible task (active + recently finished) with
 * progress and cancel/dismiss controls. Lives next to the notification bell.
 */
export function BackgroundTasksIndicator() {
  const ctx = useBackgroundTasksOptional();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  if (!ctx) return null;

  const { tasks, activeTasks, activeCount, cancel, dismiss, dismissAllFinished } = ctx;
  // Nothing to show at all — keep the header clean.
  if (tasks.length === 0) return null;

  const hasFinished = tasks.some((t) => t.status !== "queued" && t.status !== "running");
  const open_ = (link: string) => {
    setLocation(link);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Background tasks">
              {activeCount > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <ListChecks className="h-4 w-4" />
              )}
              {activeCount > 0 && (
                <Badge
                  variant="default"
                  className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
                >
                  {activeCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {activeCount > 0 ? `${activeCount} task${activeCount > 1 ? "s" : ""} running` : "Background tasks"}
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-sm font-medium">Background tasks</div>
          {hasFinished && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => dismissAllFinished()}
            >
              Clear finished
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          <div className="flex flex-col gap-2 p-2">
            {activeTasks.length === 0 && !hasFinished && (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No background tasks.
              </div>
            )}
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onCancel={cancel}
                onDismiss={dismiss}
                onOpen={open_}
              />
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Floating corner tray: a persistent stack in the bottom-right showing in-flight
 * background work anywhere in the app. Auto-hides when nothing is running so it
 * never gets in the way. Finished-task history stays in the header indicator.
 */
export function BackgroundTasksTray() {
  const ctx = useBackgroundTasksOptional();
  const [, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  if (!ctx) return null;

  const { activeTasks, cancel, dismiss } = ctx;
  if (activeTasks.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-border bg-card shadow-lg">
        <button
          className="flex w-full items-center justify-between gap-2 border-b border-border bg-card/80 px-3 py-2 text-left hover:bg-accent/50"
          onClick={() => setCollapsed((c) => !c)}
        >
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs font-medium">
              {activeTasks.length} task{activeTasks.length > 1 ? "s" : ""} running
            </span>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", collapsed && "rotate-180")} />
        </button>
        {!collapsed && (
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-2 p-2">
              {activeTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onCancel={cancel}
                  onDismiss={dismiss}
                  onOpen={(link) => setLocation(link)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
