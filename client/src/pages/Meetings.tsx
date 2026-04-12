import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Play,
  Zap,
  FolderPlus,
  Video,
  Headphones,
  Tag,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default function Meetings() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [processCreateProject, setProcessCreateProject] = useState(false);
  const [processProjectName, setProcessProjectName] = useState("");

  const { data: meetingsRaw, isLoading, refetch } = trpc.fireflies.meetings.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const meetings = (meetingsRaw as any[] | undefined) || [];
  const { data: statsRaw } = trpc.fireflies.meetings.getStats.useQuery();
  const stats = statsRaw as any;

  const syncMutation = trpc.fireflies.syncMeetings.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} new meetings`);
      refetch();
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
    },
    onError: (error) => toast.error(error.message),
  });

  // Client-side search filtering
  const filtered = meetings.filter((m: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const title = (m.title || "").toLowerCase();
    const participants = (m.participants || "").toLowerCase();
    const summary = (m.summary || "").toLowerCase();
    return title.includes(q) || participants.includes(q) || summary.includes(q);
  }).filter((m: any) => {
    if (!dateFrom && !dateTo) return true;
    const d = m.date ? new Date(m.date) : null;
    if (!d) return false;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  const formatDate = (date?: string | Date | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
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
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const parseSafe = (json: string | null | undefined) => {
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  };

  const handleProcessMeeting = () => {
    if (!selectedMeetingId) return;
    processMeetingMutation.mutate({
      meetingId: selectedMeetingId.toString(),
      createContacts: true,
      createTasks: true,
      createProject: processCreateProject,
      projectName: processProjectName || undefined,
    } as any);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.875rem] font-semibold tracking-[-0.025em] flex items-center gap-2">
            <Mic className="h-7 w-7" />
            Meetings
          </h1>
          <p className="text-muted-foreground mt-1">
            Meeting transcripts and summaries from Fireflies.ai
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => (syncMutation.mutate as any)({})}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync Meetings
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-2xl font-semibold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="text-2xl font-semibold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">Processed</div>
              <div className="text-2xl font-semibold text-green-600">{stats.processed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">This Week</div>
              <div className="text-2xl font-semibold text-blue-600">
                {meetings.filter((m: any) => {
                  if (!m.date) return false;
                  const d = new Date(m.date);
                  const now = new Date();
                  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                  return d >= weekAgo;
                }).length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings by title, participants, or keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
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
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[160px]"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[160px]"
          placeholder="To"
        />
      </div>

      {/* Meetings List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mic className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{meetings.length === 0 ? "No meetings synced yet." : "No meetings match your search."}</p>
          {meetings.length === 0 && (
            <p className="text-sm mt-1">Click "Sync Meetings" to fetch your meetings from Fireflies.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((meeting: any) => {
            const participants = parseSafe(meeting.participants) || [];
            const summary = parseSafe(meeting.summary);
            const actionItems = parseSafe(meeting.actionItems) || [];
            const isExpanded = expandedId === meeting.id;

            return (
              <Card key={meeting.id} className="overflow-hidden">
                {/* Main Row */}
                <button
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{meeting.title || "Untitled Meeting"}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(meeting.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(meeting.duration)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {Array.isArray(participants) ? participants.length : 0}
                        </span>
                        {actionItems.length > 0 && (
                          <span className="flex items-center gap-1">
                            <ListTodo className="h-3 w-3" />
                            {actionItems.length} action items
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {statusBadge(meeting.processingStatus)}
                    </div>
                  </div>
                  {/* Summary excerpt */}
                  {summary?.overview && (
                    <div className="mt-2 ml-8 text-sm text-muted-foreground line-clamp-2">
                      {summary.overview}
                    </div>
                  )}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3 bg-muted/30 space-y-4">
                    {/* Participants */}
                    {Array.isArray(participants) && participants.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Participants</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {participants.map((p: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {typeof p === 'string' ? p : p.displayName || p.name || p.email || 'Unknown'}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full Summary */}
                    {summary?.overview && (
                      <div>
                        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Summary</Label>
                        <p className="mt-1.5 text-sm leading-relaxed">{summary.overview}</p>
                      </div>
                    )}

                    {/* Bullet Points */}
                    {summary?.shorthand_bullet && (
                      <div>
                        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Key Points</Label>
                        <ul className="mt-1.5 space-y-1 text-sm">
                          {(Array.isArray(summary.shorthand_bullet) ? summary.shorthand_bullet : [summary.shorthand_bullet]).map((bullet: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-muted-foreground mt-1">•</span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Keywords */}
                    {summary?.keywords && (
                      <div>
                        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                          <Tag className="h-3 w-3" /> Keywords
                        </Label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(Array.isArray(summary.keywords) ? summary.keywords : []).map((kw: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Items */}
                    {actionItems.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                          <ListTodo className="h-3 w-3" /> Action Items ({actionItems.length})
                        </Label>
                        <ul className="mt-1.5 space-y-1.5">
                          {actionItems.map((item: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-background border">
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                              <div className="flex-1">
                                <span>{typeof item === 'string' ? item : item.text || item.description || JSON.stringify(item)}</span>
                                {item.assignee && (
                                  <span className="ml-2 text-xs text-blue-600">@{item.assignee}</span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Links & Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      {meeting.recordingUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={meeting.recordingUrl} target="_blank" rel="noopener noreferrer">
                            <Video className="h-3 w-3 mr-1" /> Recording
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      )}
                      {meeting.audioUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={meeting.audioUrl} target="_blank" rel="noopener noreferrer">
                            <Headphones className="h-3 w-3 mr-1" /> Audio
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      )}
                      {meeting.transcriptUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={meeting.transcriptUrl} target="_blank" rel="noopener noreferrer">
                            <Mic className="h-3 w-3 mr-1" /> Transcript
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      )}
                      {(meeting.processingStatus === 'pending') && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMeetingId(meeting.id);
                            setProcessProjectName("");
                            setProcessCreateProject(false);
                            setShowProcessDialog(true);
                          }}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          Process Meeting
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Process Meeting Dialog */}
      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Meeting</DialogTitle>
            <DialogDescription>
              Generate CRM contacts, tasks, and projects from this meeting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-medium text-sm">Create CRM Contacts</div>
                <div className="text-xs text-muted-foreground">From meeting participants</div>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-400 ml-auto" />
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
              <ListTodo className="h-5 w-5 text-purple-600" />
              <div>
                <div className="font-medium text-sm">Create Tasks</div>
                <div className="text-xs text-muted-foreground">From meeting action items</div>
              </div>
              <ArrowRight className="h-4 w-4 text-purple-400 ml-auto" />
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderPlus className="h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="font-medium text-sm">Create Project</div>
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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Process Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
