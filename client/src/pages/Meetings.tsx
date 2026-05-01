import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mic,
  Search,
  RefreshCw,
  Loader2,
  Users,
  ListTodo,
  ExternalLink,
  FileText,
  Zap,
  FolderPlus,
  Tag,
  CheckCircle2,
  Filter,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export default function Meetings() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [panelMeeting, setPanelMeeting] = useState<any | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [processCreateContacts, setProcessCreateContacts] = useState(true);
  const [processCreateTasks, setProcessCreateTasks] = useState(true);
  const [projectMode, setProjectMode] = useState<"none" | "new" | "existing">("none");
  const [processProjectName, setProcessProjectName] = useState("");
  const [processExistingProjectId, setProcessExistingProjectId] = useState<number | undefined>(undefined);
  const [predictedProjectId, setPredictedProjectId] = useState<number | undefined>(undefined);
  const [processAssigneeId, setProcessAssigneeId] = useState<number | undefined>(undefined);
  const [existingContactIds, setExistingContactIds] = useState<number[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  const { data: projectsRaw } = trpc.projects.list.useQuery();
  const availableProjects = (projectsRaw as Array<{ id: number; name: string }> | undefined) || [];

  const { data: routingOptions } = trpc.fireflies.taskRoutingOptions.useQuery();
  const availableAssignees = (routingOptions?.assignees as Array<{ id: number; name: string; email: string }> | undefined) || [];

  const { data: contactsRaw } = trpc.crm.contacts.list.useQuery({ limit: 500 });
  const availableContacts = (contactsRaw as Array<{ id: number; fullName?: string; firstName?: string; lastName?: string; email?: string }> | undefined) || [];

  const { data: meetingsRaw, isLoading, refetch, error: meetingsError } = trpc.fireflies.meetings.list.useQuery({});
  const meetings = (meetingsRaw as any[] | undefined) || [];

  const openPanel = (meeting: any) => {
    setPanelMeeting(meeting);
    setTranscriptOpen(false);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (meeting != null) {
      url.searchParams.set("meetingId", String(meeting.id));
      url.searchParams.delete("firefliesId");
    } else {
      url.searchParams.delete("meetingId");
      url.searchParams.delete("firefliesId");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const closePanel = () => {
    setPanelMeeting(null);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("meetingId");
    url.searchParams.delete("firefliesId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const { data: statsRaw, refetch: refetchStats } = trpc.fireflies.meetings.getStats.useQuery();
  const stats = statsRaw as { total?: number; pending?: number; processed?: number; thisWeek?: number } | undefined;

  const syncMutation = trpc.fireflies.syncMeetings.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} new meetings`);
      refetch();
      refetchStats();
    },
    onError: (error) => toast.error(error.message),
  });

  const processMeetingMutation = trpc.fireflies.processMeeting.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      const linked = d.linkedContactCount ?? 0;
      const linkedSuffix = linked > 0 ? `, ${linked} linked` : "";
      const tasks = d.tasksCreated ?? 0;
      const available = d.actionItemsAvailable ?? 0;
      const taskNote = tasks === 0 && available === 0
        ? " (no action items found in transcript)"
        : tasks === 0 && available > 0
          ? ` (${available} action items, none could be routed to a project)`
          : "";
      toast.success(
        `Processed: ${d.contactsCreated ?? 0} contacts${linkedSuffix}, ${tasks} tasks created${taskNote}`
      );
      setShowProcessDialog(false);
      setSelectedMeetingId(null);
      refetch();
      refetchStats();
    },
    onError: (error) => toast.error(error.message),
  });

  const parseSafe = (json: string | null | undefined) => {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  // Remove Fireflies transcript timestamps in any of these shapes:
  //   (00:30) | (1:23:45) | (00:00 - 10:46) | * (00:00 - 10:46) ... | - 08:40)
  const stripTimestamps = (s: string) => {
    const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
    return s
      .replace(new RegExp(String.raw`\(\s*${TS}(?:\s*[-–]\s*${TS})?\s*\)`, "g"), " ")
      .replace(new RegExp(String.raw`(?:^|\s)[-–]\s*${TS}\s*\)`, "g"), " ")
      .replace(new RegExp(String.raw`(?:^|\s)\(\s*${TS}\s*[-–]\s*${TS}\s*(?=\s|$)`, "g"), " ")
      .replace(/^\s*[*•]\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Strip timestamps + markdown bullet/header artifacts from a single
  // action-item string.
  const cleanActionText = (s: string) =>
    stripTimestamps(s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));

  // Fireflies returns `summary.action_items` as a markdown string with
  // "**Speaker**" headers. Parse it client-side as a fallback for meetings
  // synced before the backend parser was fixed.
  const parseActionItemsFromSummary = (raw: unknown): Array<{ text: string; assignee?: string }> => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((it) => (typeof it === "string" ? { text: cleanActionText(it) } : { text: cleanActionText(it?.text || it?.action_item || it?.description || ""), assignee: it?.assignee }))
        .filter((it) => it.text);
    }
    if (typeof raw !== "string") return [];
    const out: Array<{ text: string; assignee?: string }> = [];
    let assignee: string | undefined;
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const header = t.match(/^\*\*(.+?)\*\*:?\s*$/);
      if (header) { assignee = header[1].trim(); continue; }
      const text = cleanActionText(t);
      if (text) out.push({ text, ...(assignee ? { assignee } : {}) });
    }
    return out;
  };

  const meetingsWithParsed = useMemo(
    () =>
      meetings.map((meeting: any) => {
        const parsedSummary = parseSafe(meeting.summary);
        const stored = parseSafe(meeting.actionItems);
        const storedArr = Array.isArray(stored) ? stored : [];
        const parsedActionItems = storedArr.length > 0
          ? storedArr.map((it: any) => ({ ...it, text: cleanActionText(typeof it === "string" ? it : it?.text || "") }))
          : parseActionItemsFromSummary(parsedSummary?.action_items);
        const parsedTranscript: Array<{ speaker: string; text: string }> = (() => {
          const raw = parseSafe(meeting.transcriptText);
          return Array.isArray(raw) ? raw.filter((s: any) => s?.text) : [];
        })();
        return {
          ...meeting,
          parsedParticipants: parseSafe(meeting.participants) || [],
          parsedSummary,
          parsedActionItems,
          parsedTranscript,
        };
      }),
    [meetings]
  );

  const filtered = meetingsWithParsed
    .filter((m: any) => {
      if (statusFilter !== "all" && m.processingStatus !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const title = (m.title || "").toLowerCase();
      const summaryText = (m.parsedSummary?.overview || "").toLowerCase();
      const bulletText = (() => {
        const bullets = m.parsedSummary?.shorthand_bullet;
        if (!bullets) return "";
        return (Array.isArray(bullets) ? bullets : [bullets]).join(" ").toLowerCase();
      })();
      const participantText = (Array.isArray(m.parsedParticipants) ? m.parsedParticipants : [])
        .map((p: any) =>
          typeof p === "string" ? p : p?.displayName || p?.name || p?.email || ""
        )
        .join(" ")
        .toLowerCase();
      return title.includes(q) || summaryText.includes(q) || bulletText.includes(q) || participantText.includes(q);
    })
    .filter((m: any) => {
      if (!dateFrom && !dateTo) return true;
      const d = m.date ? new Date(m.date) : null;
      if (!d) return false;
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(`${dateTo}T23:59:59`)) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const aTime = a?.date ? new Date(a.date).getTime() : 0;
      const bTime = b?.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

  const normalizeDurationSeconds = (raw?: number | string | null) => {
    if (raw == null) return null;
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (!Number.isFinite(value) || value <= 0) return null;
    if (value <= 120 && Number.isInteger(value)) return value * 60;
    if (value < 10 && !Number.isInteger(value)) return Math.round(value * 60);
    return Math.round(value);
  };

  const fmtDur = (raw?: number | string | null) => {
    const seconds = normalizeDurationSeconds(raw);
    if (!seconds) return "-";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h${mins}m`;
    return `${mins}m`;
  };

  const fmtDate = (date?: string | Date | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const statusBadge = (status: string) => {
    const base = "text-[10px] px-1.5 py-0";
    switch (status) {
      case "pending":
        return <Badge variant="outline" className={`${base} text-yellow-600 border-yellow-300`}>Pending</Badge>;
      case "fully_processed":
        return <Badge className={`${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`}>Processed</Badge>;
      case "contacts_created":
        return <Badge className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400`}>Contacts</Badge>;
      case "tasks_created":
        return <Badge className={`${base} bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400`}>Tasks</Badge>;
      case "project_created":
        return <Badge className={`${base} bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400`}>Project</Badge>;
      case "skipped":
        return <Badge variant="outline" className={`${base} text-muted-foreground`}>Skipped</Badge>;
      case "error":
        return <Badge variant="destructive" className={base}>Error</Badge>;
      default:
        return <Badge variant="secondary" className={base}>{status}</Badge>;
    }
  };

  const predictProject = (meetingTitle: string): number | undefined => {
    const MIN_WORD_LENGTH = 2;
    if (!availableProjects.length || !meetingTitle) return undefined;
    const titleWords = meetingTitle.toLowerCase().split(/\W+/).filter((w) => w.length > MIN_WORD_LENGTH);
    let bestId: number | undefined;
    let bestScore = 0;
    for (const p of availableProjects) {
      const nameWordSet = new Set(
        p.name.toLowerCase().split(/\W+/).filter((w: string) => w.length > MIN_WORD_LENGTH)
      );
      const score = titleWords.filter((w) => nameWordSet.has(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestId = p.id;
      }
    }
    return bestId;
  };

  const openProcessDialog = (meeting: any) => {
    setSelectedMeetingId(meeting.id);
    setProcessProjectName("");
    setProcessAssigneeId(undefined);
    setExistingContactIds([]);
    setContactSearch("");
    const predicted = predictProject(meeting.title || "");
    setPredictedProjectId(predicted);
    if (predicted !== undefined) {
      setProjectMode("existing");
      setProcessExistingProjectId(predicted);
    } else {
      setProjectMode("none");
      setProcessExistingProjectId(undefined);
    }
    setShowProcessDialog(true);
  };

  const handleProcessMeeting = () => {
    if (!selectedMeetingId) return;
    processMeetingMutation.mutate({
      meetingId: selectedMeetingId,
      createContacts: processCreateContacts,
      createTasks: processCreateTasks,
      createProject: projectMode === "new",
      projectName: projectMode === "new" ? (processProjectName || undefined) : undefined,
      projectId: projectMode === "existing" ? processExistingProjectId : undefined,
      assigneeId: processAssigneeId,
      existingContactIds: existingContactIds.length ? existingContactIds : undefined,
    } as any);
  };

  const hasActiveFilters = search || statusFilter !== "all" || dateFrom || dateTo;

  useEffect(() => {
    if (typeof window === "undefined" || !meetingsWithParsed.length) return;
    const params = new URLSearchParams(window.location.search);
    const rawMeetingId = params.get("meetingId");
    const firefliesId = params.get("firefliesId");

    let matched: any | null = null;
    if (rawMeetingId) {
      const meetingId = Number(rawMeetingId);
      if (Number.isFinite(meetingId) && meetingId > 0) {
        matched = meetingsWithParsed.find((m: any) => m.id === meetingId) ?? null;
      }
    } else if (firefliesId) {
      matched = meetingsWithParsed.find((m: any) => m.firefliesId === firefliesId) ?? null;
    }

    if (matched && panelMeeting?.id !== matched.id) {
      setPanelMeeting(matched);
      window.requestAnimationFrame(() => {
        document.getElementById(`meeting-row-${matched.id}`)?.scrollIntoView({ block: "center" });
      });
    }
  }, [meetingsWithParsed]);

  const getBullets = (meeting: any): string[] => {
    const summary = meeting.parsedSummary;
    if (!summary) return [];
    const raw = summary.shorthand_bullet;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.slice(0, 4).map((b: string) => stripTimestamps(b));
  };

  /** Render inline markdown bold (**text**) as <strong>, stripping timestamps. */
  const renderInlineMd = (text: string): React.ReactNode => {
    const parts = stripTimestamps(text).split(/\*\*(.+?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part
    );
  };

  /**
   * Parse an overview string that uses `- **Key:** value` list syntax into
   * individual bullet strings. Falls back to a single-item array so the
   * caller always gets an array.
   */
  const parseOverviewBullets = (overview: string): string[] => {
    // Split on " - **" boundaries (each bullet starts "- **Label:**")
    const parts = overview
      .split(/\s+-\s+(?=\*\*)/)
      .map((s) => s.replace(/^-\s+/, "").trim())
      .filter(Boolean);
    return parts.length > 1 ? parts : [overview];
  };

  /**
   * Parse a shorthand_bullet that may be a single long string with emoji-headed
   * sections (e.g. "🌱 **Title** text 🖥️ **Title2** text ...") into separate items.
   */
  const parseShorthandBullets = (raw: string | string[]): string[] => {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (!raw) return [];
    // Try newline split first
    const byNewline = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (byNewline.length > 1) return byNewline;
    // Split before emoji characters that start a new section
    // Covers most common emoji ranges (Miscellaneous Symbols, Pictographs, etc.)
    const byEmoji = raw
      .split(/\s+(?=[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1FA00}-\u{1FAFF}])/u)
      .map((s) => s.trim())
      .filter(Boolean);
    if (byEmoji.length > 1) return byEmoji;
    return [raw];
  };

  return (
    <div className="space-y-2">
      {/* ── Compact toolbar: stats + search + actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-bold tracking-[-0.02em] mr-1">Meetings</h1>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums">{stats?.total ?? meetings.length}</span>
          <span className="rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 font-medium tabular-nums">{stats?.pending ?? 0} pending</span>
          <span className="rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 font-medium tabular-nums">{stats?.processed ?? 0} done</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-44 pl-7 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="contacts_created">Contacts</SelectItem>
              <SelectItem value="tasks_created">Tasks</SelectItem>
              <SelectItem value="project_created">Project</SelectItem>
              <SelectItem value="fully_processed">Processed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3 w-3 mr-1" />
            {showFilters ? "Hide" : "Date"}
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); setShowFilters(false); }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => (syncMutation.mutate as any)({})}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Sync
          </Button>
        </div>
      </div>

      {/* ── Collapsible date filters ── */}
      {showFilters && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">From</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-7 w-36 text-xs" />
          <span className="text-muted-foreground">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-7 w-36 text-xs" />
        </div>
      )}

      {/* ── Dense meeting list ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : meetingsError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm dark:border-red-900/30 dark:bg-red-950/20">
          <p className="font-medium text-red-700 dark:text-red-300">Error loading meetings</p>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{meetingsError.message}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {meetings.length === 0 ? "No meetings synced yet." : "No meetings match filters."}
        </div>
      ) : (
        <div className="divide-y divide-border/50 rounded-xl border">
          {filtered.map((meeting: any) => {
            const summary = meeting.parsedSummary;
            const bullets = getBullets(meeting);
            const tasks = (meeting.parsedActionItems || []) as Array<{ text: string; assignee?: string }>;
            const previewTasks = tasks.slice(0, 3);

            return (
              <div
                id={`meeting-row-${meeting.id}`}
                key={meeting.id}
                className="group cursor-pointer transition-colors hover:bg-accent/30"
                onClick={() => openPanel(meeting)}
              >
                {/* ── Main row ── */}
                <div className="flex items-start gap-2 px-3 py-2">
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">
                        {meeting.title || "Untitled"}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {fmtDate(meeting.date)}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {fmtDur(meeting.duration)}
                      </span>
                      <span className="shrink-0">{statusBadge(meeting.processingStatus)}</span>
                      {meeting.processingStatus === "pending" && (
                        <Button
                          size="sm"
                          className="h-5 px-2 text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProcessDialog(meeting);
                          }}
                        >
                          <Zap className="h-2.5 w-2.5 mr-0.5" />
                          Process
                        </Button>
                      )}
                      {meeting.transcriptUrl && (
                        <a
                          href={meeting.transcriptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {/* Inline preview bullets */}
                    {bullets.length > 0 && (
                      <ul className="mt-0.5 space-y-0">
                        {bullets.map((bullet: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-[12px] text-muted-foreground leading-[1.4]">
                            <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                            <span className="line-clamp-1">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!bullets.length && summary?.overview && (
                      <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1 leading-[1.4]">{stripTimestamps(summary.overview)}</p>
                    )}

                    {/* Inline task preview */}
                    {previewTasks.length > 0 && (
                      <ul className="mt-1 space-y-0">
                        {previewTasks.map((task, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[12px] leading-[1.4]">
                            <CheckCircle2 className="mt-[2px] h-3 w-3 shrink-0 text-emerald-500" />
                            <span className="line-clamp-1">
                              {task.assignee && (
                                <span className="font-medium text-blue-600 dark:text-blue-400 mr-1">@{task.assignee}</span>
                              )}
                              <span className="text-foreground/80">{task.text}</span>
                            </span>
                          </li>
                        ))}
                        {tasks.length > previewTasks.length && (
                          <li className="text-[11px] text-muted-foreground pl-[18px]">
                            +{tasks.length - previewTasks.length} more
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Meeting detail side panel ── */}
      <Sheet open={!!panelMeeting} onOpenChange={(open) => { if (!open) closePanel(); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
          {panelMeeting && (() => {
            const m = panelMeeting;
            const summary = m.parsedSummary;
            const actionItems = m.parsedActionItems || [];

            return (
              <>
                {/* Header */}
                <SheetHeader className="border-b px-5 py-4 gap-1">
                  <SheetTitle className="text-base leading-snug pr-6">{m.title || "Untitled"}</SheetTitle>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                    <span>{fmtDate(m.date)}</span>
                    <span>·</span>
                    <span>{fmtDur(m.duration)}</span>
                    <span>·</span>
                    {statusBadge(m.processingStatus)}
                    {m.parsedParticipants?.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {m.parsedParticipants
                            .map((p: any) => typeof p === "string" ? p : p.displayName || p.name || p.email || "?")
                            .join(", ")}
                        </span>
                      </>
                    )}
                  </div>
                </SheetHeader>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                  {/* Inline recording player */}
                  {m.recordingUrl && (
                    <section>
                      <video
                        src={m.recordingUrl}
                        controls
                        preload="metadata"
                        className="w-full rounded-lg bg-black"
                      />
                    </section>
                  )}

                  {/* Tasks */}
                  {actionItems.length > 0 && (
                    <section>
                      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Tasks ({actionItems.length})
                      </h3>
                      <ul className="space-y-2">
                        {actionItems.map((item: any, i: number) => {
                          const rawText = typeof item === "string" ? item : item.text || item.description || "";
                          const text = cleanActionText(rawText);
                          return (
                            <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                              <span>{renderInlineMd(text)}</span>
                              {item.assignee && (
                                <span className="shrink-0 text-[11px] font-medium text-blue-600 dark:text-blue-400">@{item.assignee}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  {/* Summary */}
                  {summary?.overview && (() => {
                    const bullets = parseOverviewBullets(summary.overview);
                    return (
                      <section>
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Summary</h3>
                        {bullets.length > 1 ? (
                          <div className="space-y-3">
                            {bullets.map((bullet, i) => (
                              <p key={i} className="text-[13px] leading-relaxed">
                                {renderInlineMd(bullet)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[13px] leading-relaxed">{renderInlineMd(summary.overview)}</p>
                        )}
                      </section>
                    );
                  })()}

                  {/* Key Points */}
                  {summary?.shorthand_bullet && (() => {
                    const points = parseShorthandBullets(summary.shorthand_bullet);
                    return (
                      <section>
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Points</h3>
                        <div className="space-y-3">
                          {points.map((point: string, i: number) => (
                            <p key={i} className="text-[13px] leading-relaxed">
                              {renderInlineMd(point)}
                            </p>
                          ))}
                        </div>
                      </section>
                    );
                  })()}

                  {/* Keywords */}
                  {summary?.keywords && (Array.isArray(summary.keywords) ? summary.keywords : []).length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {(Array.isArray(summary.keywords) ? summary.keywords : []).map((kw: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5">{kw}</Badge>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Full transcript (collapsed by default) */}
                  {(m.parsedTranscript?.length ?? 0) > 0 && (() => {
                    // Group consecutive sentences from the same speaker.
                    const blocks: Array<{ speaker: string; text: string }> = [];
                    for (const s of m.parsedTranscript as Array<{ speaker: string; text: string }>) {
                      const last = blocks[blocks.length - 1];
                      if (last && last.speaker === s.speaker) last.text += " " + s.text;
                      else blocks.push({ speaker: s.speaker, text: s.text });
                    }
                    return (
                      <section>
                        <button
                          type="button"
                          onClick={() => setTranscriptOpen((v) => !v)}
                          className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        >
                          {transcriptOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          Transcript ({m.parsedTranscript.length} lines)
                        </button>
                        {transcriptOpen && (
                          <div className="mt-3 space-y-3">
                            {blocks.map((b, i) => (
                              <div key={i}>
                                <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400">{b.speaker}</div>
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{b.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })()}
                </div>

                {/* Footer actions */}
                <div className="border-t px-5 py-3 flex items-center gap-2">
                  {m.transcriptUrl && (
                    <Button variant="outline" size="sm" className="text-xs" asChild>
                      <a href={m.transcriptUrl} target="_blank" rel="noopener noreferrer">
                        <Mic className="mr-1.5 h-3.5 w-3.5" /> Transcript <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  {m.processingStatus === "pending" && (
                    <Button
                      size="sm"
                      className="ml-auto text-xs"
                      onClick={() => openProcessDialog(m)}
                    >
                      <Zap className="mr-1.5 h-3.5 w-3.5" />
                      Process Meeting
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Process dialog (unchanged logic) ── */}
      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Meeting</DialogTitle>
            <DialogDescription>
              Generate CRM contacts, tasks, and projects from this meeting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Create CRM Contacts</div>
                  <div className="text-xs text-muted-foreground">From meeting participants</div>
                </div>
                <Switch checked={processCreateContacts} onCheckedChange={setProcessCreateContacts} />
              </div>
              <div className="pl-7 space-y-1">
                <Label className="text-xs">Link to existing contacts (optional)</Label>
                {existingContactIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {existingContactIds.map((id) => {
                      const c = availableContacts.find((x) => x.id === id);
                      const label = c?.fullName || [c?.firstName, c?.lastName].filter(Boolean).join(" ") || c?.email || `#${id}`;
                      return (
                        <Badge key={id} variant="secondary" className="gap-1 pr-1">
                          {label}
                          <button
                            type="button"
                            className="ml-1 rounded-sm hover:bg-muted-foreground/20"
                            onClick={() => setExistingContactIds((ids) => ids.filter((x) => x !== id))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <Input
                  placeholder="Search contacts to link…"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="mt-1 text-xs h-8"
                />
                {contactSearch.trim() && (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-popover">
                    {availableContacts
                      .filter((c) => {
                        if (existingContactIds.includes(c.id)) return false;
                        const q = contactSearch.toLowerCase();
                        const hay = [c.fullName, c.firstName, c.lastName, c.email].filter(Boolean).join(" ").toLowerCase();
                        return hay.includes(q);
                      })
                      .slice(0, 8)
                      .map((c) => {
                        const label = c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || `#${c.id}`;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent"
                            onClick={() => {
                              setExistingContactIds((ids) => [...ids, c.id]);
                              setContactSearch("");
                            }}
                          >
                            <div className="font-medium">{label}</div>
                            {c.email && <div className="text-[10px] text-muted-foreground">{c.email}</div>}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <ListTodo className="h-5 w-5 text-purple-600 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Create Tasks</div>
                  <div className="text-xs text-muted-foreground">From meeting action items</div>
                </div>
                <Switch checked={processCreateTasks} onCheckedChange={setProcessCreateTasks} />
              </div>
              {processCreateTasks && availableAssignees.length > 0 && (
                <div className="pl-7 space-y-1">
                  <Label className="text-xs">Default Assignee (optional)</Label>
                  <Select
                    value={processAssigneeId !== undefined ? String(processAssigneeId) : "auto"}
                    onValueChange={(v) => setProcessAssigneeId(v === "auto" ? undefined : Number(v))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect from action items</SelectItem>
                      {availableAssignees.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name || a.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-indigo-600 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Project</div>
                  <div className="text-xs text-muted-foreground">Group tasks under a project</div>
                </div>
              </div>
              <div className="flex gap-2 pl-7">
                {(["none", "existing", "new"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProjectMode(mode)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      projectMode === mode
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-background text-muted-foreground border-border hover:border-indigo-400"
                    }`}
                  >
                    {mode === "none" ? "None" : mode === "existing" ? "Existing" : "New"}
                  </button>
                ))}
              </div>
              {projectMode === "existing" && (
                <div className="pl-7 space-y-1">
                  <Label className="text-xs">Select Project</Label>
                  <Select
                    value={processExistingProjectId !== undefined ? String(processExistingProjectId) : ""}
                    onValueChange={(v) => setProcessExistingProjectId(Number(v))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Choose a project…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProjects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {predictedProjectId !== undefined && processExistingProjectId === predictedProjectId && (
                    <p className="text-[11px] text-indigo-600">✦ Auto-predicted from meeting title</p>
                  )}
                </div>
              )}
              {projectMode === "new" && (
                <div className="pl-7 space-y-1">
                  <Label className="text-xs">Project Name (optional)</Label>
                  <Input
                    placeholder="Auto-generated from meeting title"
                    value={processProjectName}
                    onChange={(e) => setProcessProjectName(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProcessDialog(false)}>Cancel</Button>
            <Button onClick={handleProcessMeeting} disabled={processMeetingMutation.isPending}>
              {processMeetingMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Process Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
