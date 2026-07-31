import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ============================================
// TYPES
// ============================================

export type BackgroundTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "error"
  | "cancelled";

export interface BackgroundTask {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: BackgroundTaskStatus;
  progress: number;
  processed: number;
  total: number;
  message: string | null;
  entityType: string | null;
  entityId: number | null;
  link: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

interface BackgroundTasksContextValue {
  tasks: BackgroundTask[];
  activeTasks: BackgroundTask[];
  finishedTasks: BackgroundTask[];
  activeCount: number;
  isLoading: boolean;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
  dismissAllFinished: () => void;
}

const ACTIVE_STATUSES: BackgroundTaskStatus[] = ["queued", "running"];
const isActive = (t: BackgroundTask) => ACTIVE_STATUSES.includes(t.status);

// Poll fast while work is in flight, slowly otherwise, so a running sync feels
// live but an idle app isn't hammering the server.
const ACTIVE_POLL_MS = 2500;
const IDLE_POLL_MS = 20000;

const BackgroundTasksContext = createContext<BackgroundTasksContextValue | null>(null);

/**
 * When a task of a given type finishes, refresh the queries that its work
 * affected so the page the user is (or later lands) on reflects the result —
 * even though the task completed while they were elsewhere.
 */
function useTaskCompletionInvalidator() {
  const utils = trpc.useUtils();
  return (task: BackgroundTask) => {
    switch (task.type) {
      case "data_room_drive_sync":
        void utils.dataRoom.invalidate();
        break;
      default:
        break;
    }
  };
}

export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const invalidateFor = useTaskCompletionInvalidator();

  const listQuery = trpc.backgroundTasks.list.useQuery(undefined, {
    enabled: !!user,
    retry: false,
    refetchInterval: (query) => {
      const data = (query.state.data as unknown as BackgroundTask[] | undefined) ?? [];
      return data.some(isActive) ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    },
    // Keep polling while the tab is backgrounded so a long sync still resolves.
    refetchIntervalInBackground: true,
  });

  const cancelMutation = trpc.backgroundTasks.cancel.useMutation({
    onSettled: () => listQuery.refetch(),
  });
  const dismissMutation = trpc.backgroundTasks.dismiss.useMutation({
    onSettled: () => listQuery.refetch(),
  });
  const dismissAllMutation = trpc.backgroundTasks.dismissAllFinished.useMutation({
    onSettled: () => listQuery.refetch(),
  });

  const tasks = useMemo<BackgroundTask[]>(
    () => (listQuery.data as unknown as BackgroundTask[] | undefined) ?? [],
    [listQuery.data],
  );

  // Detect active → finished transitions to fire a single toast and refresh
  // affected data. Tasks already finished on first load are baselined so we
  // don't replay old notifications after a page refresh.
  const prevStatusRef = useRef<Map<string, BackgroundTaskStatus>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());
  const baselinedRef = useRef(false);

  useEffect(() => {
    if (!listQuery.isFetched) return;

    if (!baselinedRef.current) {
      // First successful load: remember current states without notifying.
      for (const t of tasks) {
        prevStatusRef.current.set(t.id, t.status);
        if (!isActive(t)) notifiedRef.current.add(t.id);
      }
      baselinedRef.current = true;
      return;
    }

    for (const t of tasks) {
      const prev = prevStatusRef.current.get(t.id);
      prevStatusRef.current.set(t.id, t.status);

      const wasActive = prev !== undefined && ACTIVE_STATUSES.includes(prev);
      const justFinished = !isActive(t) && wasActive;
      // Also cover a brand-new task that first appears already finished.
      const finishedAndUnseen = !isActive(t) && !notifiedRef.current.has(t.id);

      if ((justFinished || finishedAndUnseen) && !notifiedRef.current.has(t.id)) {
        notifiedRef.current.add(t.id);
        invalidateFor(t);
        notifyTaskFinished(t, setLocation);
      }
    }
  }, [tasks, listQuery.isFetched, invalidateFor, setLocation]);

  const value = useMemo<BackgroundTasksContextValue>(() => {
    const activeTasks = tasks.filter(isActive);
    const finishedTasks = tasks.filter((t) => !isActive(t));
    return {
      tasks,
      activeTasks,
      finishedTasks,
      activeCount: activeTasks.length,
      isLoading: listQuery.isLoading,
      cancel: (id) => cancelMutation.mutate({ id }),
      dismiss: (id) => dismissMutation.mutate({ id }),
      dismissAllFinished: () => dismissAllMutation.mutate(),
    };
  }, [tasks, listQuery.isLoading, cancelMutation, dismissMutation, dismissAllMutation]);

  return (
    <BackgroundTasksContext.Provider value={value}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

function notifyTaskFinished(
  task: BackgroundTask,
  setLocation: (to: string) => void,
) {
  const action = task.link
    ? { label: "View", onClick: () => setLocation(task.link!) }
    : undefined;

  if (task.status === "success") {
    toast.success(task.message || `${task.title} — done`, { action });
  } else if (task.status === "error") {
    toast.error(task.title, {
      description: task.errorMessage || task.message || "Task failed",
      action,
    });
  } else if (task.status === "cancelled") {
    toast(`${task.title} — cancelled`);
  }
}

export function useBackgroundTasks(): BackgroundTasksContextValue {
  const ctx = useContext(BackgroundTasksContext);
  if (!ctx) {
    throw new Error("useBackgroundTasks must be used within a BackgroundTasksProvider");
  }
  return ctx;
}

/**
 * Safe variant for components that may render outside the provider (returns null
 * instead of throwing).
 */
export function useBackgroundTasksOptional(): BackgroundTasksContextValue | null {
  return useContext(BackgroundTasksContext);
}
