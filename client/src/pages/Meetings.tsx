import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mic,
  Search,
  RefreshCw,
  Loader2,
  Users,
  ListTodo,
  Clock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Zap,
  FolderPlus,
  Video,
  Tag,
  ArrowRight,
  CheckCircle2,
  Filter,
  X,
} from "lucide-react";

export default function Meetings() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [processCreateProject, setProcessCreateProject] = useState(false);
  const [processProjectName, setProcessProjectName] = useState("");

  const { data: meetingsRaw, isLoading, refetch, error: meetingsError } = trpc.fireflies.meetings.list.useQuery({});
  const meetings = (meetingsRaw as any[] | undefined) || [];

  const setExpandedMeetingWithUrl = (meetingId: number | null) => {
    setExpandedId(meetingId);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (meetingId != null) {
      url.searchParams.set("meetingId", String(meetingId));
      url.searchParams.delete("firefliesId");
    } else {
      url.searchParams.delete("meetingId");
      url.searchParams.delete("firefliesId");
    }
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
      toast.success(
        `Processed: ${(data as any).contactsCreated ?? 0} contacts, ${(data as any).tasksCreated ?? 0} tasks created`
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

  const meetingsWithParsed = useMemo(
    () =>
      meetings.map((meeting: any) => ({
        ...meeting,
        parsedParticipants: parseSafe(meeting.participants) || [],
        parsedSummary: parseSafe(meeting.summary),
        parsedActionItems: parseSafe(meeting.actionItems) || [],
      })),
    [meetings]
  );

  const filtered = meetingsWithParsed
    .filter((m: any) => {
      if (statusFilter === "pending" && m.processingStatus !== "pending") return false;
      if (statusFilter === "processed" && m.processingStatus !== "fully_processed") return false;
      if (statusFilter !== "all" && statusFilter !== "pending" && statusFilter !== "processed" && m.processingStatus !== statusFilter) return false;
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

  const fmtTime = (date?: string | Date | null) => {
    if (!date) return "";
    return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

  const handleProcessMeeting = () => {
    if (!selectedMeetingId) return;
    processMeetingMutation.mutate({
      meetingId: selectedMeetingId,
      createContacts: true,
      createTasks: true,
      createProject: processCreateProject,
      projectName: processProjectName || undefined,
    } as any);
  };

  const hasActiveFilters = search || statusFilter !== "all" || dateFrom || dateTo;

  useEffect(() => {
    if (typeof window === "undefined" || !meetings.length) return;
    const params = new URLSearchParams(window.location.search);
    const rawMeetingId = params.get("meetingId");
    const firefliesId = params.get("firefliesId");

    let matchedId: number | null = null;
    if (rawMeetingId) {
      const meetingId = Number(rawMeetingId);
      if (Number.isFinite(meetingId) && meetingId > 0 && meetings.some((meeting: any) => meeting.id === meetingId)) {
        matchedId = meetingId;
      }
    } else if (firefliesId) {
      const matchedMeeting = meetings.find((meeting: any) => meeting.firefliesId === firefliesId);
      if (matchedMeeting) matchedId = matchedMeeting.id;
    }

    if (matchedId != null && expandedId !== matchedId) {
      setExpandedId(matchedId);
      window.requestAnimationFrame(() => {
        document.getElementById(`meeting-row-${matchedId}`)?.scrollIntoView({ block: "center" });
      });
    }
  }, [meetings, expandedId]);

  const getBullets = (meeting: any): string[] => {
    const summary = meeting.parsedSummary;
    if (!summary) return [];
    const raw = summary.shorthand_bullet;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.slice(0, 4);
  };

  /** Render inline markdown bold (**text**) as <strong> elements. */
  const renderInlineMd = (text: string): React.ReactNode => {
    const parts = text.split(/\*\*(.+?)\*\*/g);
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
    // Split on leading dash+space or dash+bold that indicates a new bullet
    const items = overview.split(/(?:^|\s)-\s+(?=\*\*|\S)/).map((s) => s.trim()).filter(Boolean);
    return items.length > 1 ? items : [overview];
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
              <SelectItem value="fully_processed">Processed</SelectItem>
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
            const actionItems = meeting.parsedActionItems;
            const bullets = getBullets(meeting);
            const isExpanded = expandedId === meeting.id;

            return (
              <div id={`meeting-row-${meeting.id}`} key={meeting.id} className="group transition-colors hover:bg-accent/30">
                {/* ── Main row: always visible ── */}
                <div className="flex items-start gap-2 px-3 py-2">
                  {/* Expand toggle */}
                  <button
                    className="mt-0.5 shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
                    onClick={() => setExpandedMeetingWithUrl(isExpanded ? null : meeting.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate text-[13px] font-medium cursor-pointer hover:text-foreground/80"
                        onClick={() => setExpandedMeetingWithUrl(isExpanded ? null : meeting.id)}
                      >
                        {meeting.title || "Untitled"}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {fmtDate(meeting.date)} {fmtTime(meeting.date)}
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
                            setSelectedMeetingId(meeting.id);
                            setProcessProjectName("");
                            setProcessCreateProject(false);
                            setShowProcessDialog(true);
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

                    {/* Inline bullets - always visible */}
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
                      <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1 leading-[1.4]">{summary.overview}</p>
                    )}
                  </div>
                </div>

                {/* ── Expanded detail panel ── */}
                {isExpanded && (
                  <div className="space-y-4 border-t border-border/30 bg-muted/15 px-8 py-4 text-sm">
                    {/* Tasks / Action Items — always shown first */}
                    {actionItems.length > 0 && (
                      <div className="rounded-md border border-border/50 bg-background/60 px-3 py-2.5">
                        <Label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3" />
                          Tasks ({actionItems.length})
                        </Label>
                        <ul className="mt-2 space-y-1.5">
                          {actionItems.map((item: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-[13px]">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
                              <span className="leading-snug">
                                {renderInlineMd(typeof item === "string" ? item : item.text || item.description || JSON.stringify(item))}
                              </span>
                              {item.assignee && (
                                <span className="shrink-0 text-[11px] font-medium text-blue-600 dark:text-blue-400">@{item.assignee}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Summary */}
                    {summary?.overview && (() => {
                      const overviewBullets = parseOverviewBullets(summary.overview);
                      return (
                        <div>
                          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Summary</Label>
                          {overviewBullets.length > 1 ? (
                            <ul className="mt-1.5 space-y-1.5">
                              {overviewBullets.map((bullet, i) => (
                                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                                  <span>{renderInlineMd(bullet)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1.5 text-[13px] leading-relaxed">{renderInlineMd(summary.overview)}</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Key Points */}
                    {summary?.shorthand_bullet && (
                      <div>
                        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Key Points</Label>
                        <ul className="mt-1.5 space-y-1.5">
                          {(Array.isArray(summary.shorthand_bullet) ? summary.shorthand_bullet : [summary.shorthand_bullet]).map((b: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                              <span>{renderInlineMd(b)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Keywords */}
                    {summary?.keywords && (
                      <div className="flex flex-wrap items-center gap-1">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        {(Array.isArray(summary.keywords) ? summary.keywords : []).map((kw: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{kw}</Badge>
                        ))}
                      </div>
                    )}

                    {(meeting.parsedParticipants?.length > 0) && (
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {meeting.parsedParticipants.map((p: any, i: number) => (
                          <span key={i}>
                            {typeof p === "string" ? p : p.displayName || p.name || p.email || "?"}
                            {i < meeting.parsedParticipants.length - 1 && ","}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 pt-1">
                      {meeting.recordingUrl && (
                        <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" asChild>
                          <a href={meeting.recordingUrl} target="_blank" rel="noopener noreferrer">
                            <Video className="mr-1 h-3 w-3" /> Recording <ExternalLink className="ml-1 h-2.5 w-2.5" />
                          </a>
                        </Button>
                      )}
                      {meeting.transcriptUrl && (
                        <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" asChild>
                          <a href={meeting.transcriptUrl} target="_blank" rel="noopener noreferrer">
                            <Mic className="mr-1 h-3 w-3" /> Transcript <ExternalLink className="ml-1 h-2.5 w-2.5" />
                          </a>
                        </Button>
                      )}
                      {meeting.processingStatus === "pending" && (
                        <Button
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => {
                            setSelectedMeetingId(meeting.id);
                            setProcessProjectName("");
                            setProcessCreateProject(false);
                            setShowProcessDialog(true);
                          }}
                        >
                          <Zap className="mr-1 h-3 w-3" />
                          Process
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-sm font-medium">Create CRM Contacts</div>
                <div className="text-xs text-muted-foreground">From meeting participants</div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-blue-400" />
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-purple-50 p-3 dark:bg-purple-950/30">
              <ListTodo className="h-5 w-5 text-purple-600" />
              <div>
                <div className="text-sm font-medium">Create Tasks</div>
                <div className="text-xs text-muted-foreground">From meeting action items</div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-purple-400" />
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderPlus className="h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="text-sm font-medium">Create Project</div>
                    <div className="text-xs text-muted-foreground">Group tasks under a project</div>
                  </div>
                </div>
                <Switch checked={processCreateProject} onCheckedChange={setProcessCreateProject} />
              </div>
              {processCreateProject && (
                <div className="pl-7">
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
