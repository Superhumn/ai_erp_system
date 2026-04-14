import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";

export default function Meetings() {
  const [search, setSearch] = useState("");
  const [listView, setListView] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [processCreateProject, setProcessCreateProject] = useState(false);
  const [processProjectName, setProcessProjectName] = useState("");

  const { data: meetingsRaw, isLoading, refetch, error: meetingsError } = trpc.fireflies.meetings.list.useQuery({});
  const meetings = (meetingsRaw as any[] | undefined) || [];

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
      if (listView === "pending" && m.processingStatus !== "pending") return false;
      if (listView === "processed" && m.processingStatus !== "fully_processed") return false;
      if (statusFilter !== "all" && m.processingStatus !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const title = (m.title || "").toLowerCase();
      const summaryText = (m.parsedSummary?.overview || "").toLowerCase();
      const participantText = (Array.isArray(m.parsedParticipants) ? m.parsedParticipants : [])
        .map((p: any) =>
          typeof p === "string" ? p : p?.displayName || p?.name || p?.email || ""
        )
        .join(" ")
        .toLowerCase();
      return title.includes(q) || summaryText.includes(q) || participantText.includes(q);
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

  const formatDuration = (raw?: number | string | null) => {
    const seconds = normalizeDurationSeconds(raw);
    if (!seconds) return "-";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return `${seconds}s`;
  };

  const formatDate = (date?: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300">Pending</Badge>;
      case "fully_processed":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Processed</Badge>;
      case "contacts_created":
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Contacts Created</Badge>;
      case "tasks_created":
        return <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Tasks Created</Badge>;
      case "project_created":
        return <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">Project Created</Badge>;
      case "skipped":
        return <Badge variant="outline" className="text-muted-foreground">Skipped</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
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

  return (
    <div className="space-y-6">
      <Card className="border-none bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
        <CardContent className="p-6 md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <Mic className="h-3.5 w-3.5" />
                Fireflies Workspace
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Meeting Intelligence</h1>
              <p className="max-w-2xl text-sm text-white/70">
                Review synced call transcripts, extract action items, and process meeting outcomes into CRM and projects.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => (syncMutation.mutate as any)({})}
              disabled={syncMutation.isPending}
              className="w-full md:w-auto"
            >
              {syncMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Meetings
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-white/70">Total</p>
              <p className="mt-1 text-2xl font-semibold">{stats?.total ?? meetings.length}</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-white/70">Pending</p>
              <p className="mt-1 text-2xl font-semibold">{stats?.pending ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-white/70">Processed</p>
              <p className="mt-1 text-2xl font-semibold">{stats?.processed ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-white/70">This Week</p>
              <p className="mt-1 text-2xl font-semibold">{stats?.thisWeek ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-16">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search meetings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setListView("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacts_created">Contacts Created</SelectItem>
                  <SelectItem value="tasks_created">Tasks Created</SelectItem>
                  <SelectItem value="fully_processed">Processed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Date Range</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {(search || listView !== "all" || statusFilter !== "all" || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSearch("");
                  setListView("all");
                  setStatusFilter("all");
                  setDateFrom("");
                  setDateTo("");
                  setExpandedId(null);
                }}
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Meetings</h2>
              <p className="text-sm text-muted-foreground">
                {filtered.length} of {meetings.length} meetings shown
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tabs
                value={listView}
                onValueChange={(v) => {
                  setListView(v);
                  setStatusFilter("all");
                }}
              >
                <TabsList className="grid w-[240px] grid-cols-3">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="processed">Processed</TabsTrigger>
                </TabsList>
              </Tabs>
              <Badge variant="secondary" className="px-3 py-1">
                {statusFilter === "all" ? "All Statuses" : statusFilter.replace("_", " ")}
              </Badge>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-xl border py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : meetingsError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-950/20">
              <p className="font-medium text-red-700 dark:text-red-300">Error loading meetings</p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{meetingsError.message}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border p-12 text-center text-muted-foreground">
              <Mic className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>{meetings.length === 0 ? "No meetings synced yet." : "No meetings match your filters."}</p>
            </div>
          ) : (
            filtered.map((meeting: any) => {
              const participants = meeting.parsedParticipants;
              const summary = meeting.parsedSummary;
              const actionItems = meeting.parsedActionItems;
              const isExpanded = expandedId === meeting.id;

              return (
                <Card key={meeting.id} className="overflow-hidden border border-border/70 shadow-sm">
                  <div className="p-3 md:p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                      <button
                        className="flex min-w-0 flex-1 items-start gap-3 text-left transition-colors hover:text-foreground/90"
                        onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                      >
                        <div className="mt-1 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-medium">{meeting.title || "Untitled Meeting"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDate(meeting.date)} <span className="mx-1">•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDuration(meeting.duration)}
                                </span>
                              </p>
                            </div>
                            <div className="hidden shrink-0 md:block">{statusBadge(meeting.processingStatus)}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                              <Users className="h-3 w-3" />
                              {Array.isArray(participants) ? participants.length : 0} participants
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                              <ListTodo className="h-3 w-3" />
                              {actionItems.length} action items
                            </span>
                          </div>
                          {summary?.overview && (
                            <p className="line-clamp-1 text-sm text-muted-foreground">{summary.overview}</p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center justify-between gap-2 md:justify-end">
                        <div className="md:hidden">{statusBadge(meeting.processingStatus)}</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {meeting.recordingUrl && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={meeting.recordingUrl} target="_blank" rel="noopener noreferrer">
                                <Video className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {meeting.transcriptUrl && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={meeting.transcriptUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {meeting.processingStatus === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedMeetingId(meeting.id);
                                setProcessProjectName("");
                                setProcessCreateProject(false);
                                setShowProcessDialog(true);
                              }}
                            >
                              <Zap className="mr-1 h-3.5 w-3.5" />
                              Process
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Expand for full transcript summary and extracted tasks.
                    </p>
                  </div>

                  {isExpanded && (
                    <div className="space-y-4 border-t bg-muted/20 p-4">
                      {Array.isArray(participants) && participants.length > 0 && (
                        <div>
                          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Participants</Label>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {participants.map((p: any, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {typeof p === "string" ? p : p.displayName || p.name || p.email || "Unknown"}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {summary?.overview && (
                        <div>
                          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Summary</Label>
                          <p className="mt-1.5 text-sm leading-relaxed">{summary.overview}</p>
                        </div>
                      )}

                      {summary?.shorthand_bullet && (
                        <div>
                          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Key Points</Label>
                          <ul className="mt-1.5 space-y-1 text-sm">
                            {(Array.isArray(summary.shorthand_bullet) ? summary.shorthand_bullet : [summary.shorthand_bullet]).map((bullet: string, i: number) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="mt-1 text-muted-foreground">•</span>
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {summary?.keywords && (
                        <div>
                          <Label className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <Tag className="h-3 w-3" /> Keywords
                          </Label>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(Array.isArray(summary.keywords) ? summary.keywords : []).map((kw: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {actionItems.length > 0 && (
                        <div>
                          <Label className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <ListTodo className="h-3 w-3" /> Action Items ({actionItems.length})
                          </Label>
                          <ul className="mt-1.5 space-y-1.5">
                            {actionItems.map((item: any, i: number) => (
                              <li key={i} className="flex items-start gap-2 rounded border bg-background p-2 text-sm">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="flex-1">
                                  <span>{typeof item === "string" ? item : item.text || item.description || JSON.stringify(item)}</span>
                                  {item.assignee && <span className="ml-2 text-xs text-blue-600">@{item.assignee}</span>}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                        {meeting.recordingUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={meeting.recordingUrl} target="_blank" rel="noopener noreferrer">
                              <Video className="mr-1 h-3 w-3" /> Recording
                              <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                          </Button>
                        )}
                        {meeting.transcriptUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={meeting.transcriptUrl} target="_blank" rel="noopener noreferrer">
                              <Mic className="mr-1 h-3 w-3" /> Transcript
                              <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                          </Button>
                        )}
                        {meeting.processingStatus === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedMeetingId(meeting.id);
                              setProcessProjectName("");
                              setProcessCreateProject(false);
                              setShowProcessDialog(true);
                            }}
                          >
                            <Zap className="mr-1 h-3 w-3" />
                            Process Meeting
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>

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
