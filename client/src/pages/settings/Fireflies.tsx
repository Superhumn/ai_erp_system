import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mic,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Users,
  ListTodo,
  FolderPlus,
  Play,
  Clock,
  Zap,
  Settings,
  ArrowRight,
} from "lucide-react";

export default function FirefliesPage() {
  const [apiKey, setApiKey] = useState("");
  const [autoCreateContacts, setAutoCreateContacts] = useState(true);
  const [autoCreateTasks, setAutoCreateTasks] = useState(true);
  const [autoCreateProjects, setAutoCreateProjects] = useState(false);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [processProjectName, setProcessProjectName] = useState("");
  const [processCreateProject, setProcessCreateProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("auto");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("auto");

  const { data: configRaw, isLoading: configLoading, refetch: refetchConfig } = trpc.fireflies.getConfig.useQuery();
  const config = configRaw as any;

  // Sync toggle state from the server config whenever it loads
  useEffect(() => {
    if (config) {
      if (config.autoCreateContacts != null) setAutoCreateContacts(config.autoCreateContacts);
      if (config.autoCreateTasks != null) setAutoCreateTasks(config.autoCreateTasks);
      if (config.autoCreateProjects != null) setAutoCreateProjects(config.autoCreateProjects);
    }
  }, [configRaw]);

  const { data: meetingsRaw, isLoading: meetingsLoading, refetch: refetchMeetings } = trpc.fireflies.meetings.list.useQuery({});
  const meetings = meetingsRaw as any[] | undefined;
  const { data: statsRaw, refetch: refetchStats } = trpc.fireflies.meetings.getStats.useQuery();
  const stats = statsRaw as any;
  const { data: taskRoutingOptionsRaw } = trpc.fireflies.taskRoutingOptions.useQuery(undefined, {
    enabled: !!config?.configured,
  });
  const taskRoutingOptions = taskRoutingOptionsRaw as
    | { projects: Array<{ id: number; name: string }>; assignees: Array<{ id: number; name?: string; email?: string }> }
    | undefined;

  const configureMutation = trpc.fireflies.configure.useMutation({
    onSuccess: (data) => {
      toast.success((data as any).updated ? "Fireflies configuration updated" : "Fireflies connected successfully");
      setApiKey("");
      refetchConfig();
    },
    onError: (error) => toast.error(error.message),
  });

  const disconnectMutation = trpc.fireflies.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Fireflies disconnected");
      refetchConfig();
    },
    onError: (error) => toast.error(error.message),
  });

  const syncMutation = trpc.fireflies.syncMeetings.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} new meetings (${(data as any).skipped ?? 0} already synced)`);
      refetchMeetings();
    },
    onError: (error) => toast.error(error.message),
  });

  const processMeetingMutation = trpc.fireflies.processMeeting.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Processed: ${(data as any).contactsCreated ?? 0} contacts, ${(data as any).tasksCreated ?? 0} tasks${(data as any).projectId ? ", 1 project" : ""} created`
      );
      setShowProcessDialog(false);
      setSelectedMeetingId(null);
      refetchMeetings();
    },
    onError: (error) => toast.error(error.message),
  });

  const processAllMutation = trpc.fireflies.processAllPending.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Batch processed ${data.processed} meetings: ${(data as any).contactsCreated ?? 0} contacts, ${(data as any).tasksCreated ?? 0} tasks, ${(data as any).projectsCreated ?? 0} projects`
      );
      refetchMeetings();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleConfigure = () => {
    if (!config?.configured && !apiKey.trim()) {
      toast.error("Please enter your Fireflies API key");
      return;
    }
    configureMutation.mutate({
      apiKey: apiKey.trim() || undefined,
      autoCreateContacts,
      autoCreateTasks,
      autoCreateProjects,
    });
  };

  const handleProcessMeeting = () => {
    if (!selectedMeetingId) return;
    if (!processCreateProject && selectedProjectId === "auto" && selectedAssigneeId !== "auto") {
      toast.error("Select a project when assigning tasks to a team member");
      return;
    }
    processMeetingMutation.mutate({
      meetingId: selectedMeetingId,
      createContacts: true,
      createTasks: true,
      createProject: processCreateProject,
      projectName: processProjectName || undefined,
      projectId: !processCreateProject && selectedProjectId !== "auto" ? Number(selectedProjectId) : undefined,
      assigneeId: selectedAssigneeId !== "auto" ? Number(selectedAssigneeId) : undefined,
    } as any);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300">Pending</Badge>;
      case "fully_processed":
        return <Badge className="bg-green-100 text-green-700">Processed</Badge>;
      case "contacts_created":
        return <Badge className="bg-blue-100 text-blue-700">Contacts Created</Badge>;
      case "tasks_created":
        return <Badge className="bg-purple-100 text-purple-700">Tasks Created</Badge>;
      case "project_created":
        return <Badge className="bg-indigo-100 text-indigo-700">Project Created</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const normalizeDurationSeconds = (raw?: number | string | null) => {
    if (raw == null) return null;
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (!Number.isFinite(value) || value <= 0) return null;

    // Fireflies payloads may arrive in minutes for some accounts.
    if (value <= 120 && Number.isInteger(value)) return value * 60;
    // Also support decimal-minute values (e.g., 42.5).
    if (value < 10 && !Number.isInteger(value)) return Math.round(value * 60);

    return Math.round(value);
  };

  const formatDuration = (raw?: number | string | null) => {
    const seconds = normalizeDurationSeconds(raw);
    if (!seconds) return "—";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatDate = (date?: string | Date | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Mic className="h-6 w-6" />
            Fireflies.ai Integration
          </h1>
          <p className="text-muted-foreground mt-1">
            Sync meeting transcripts and auto-generate tasks, projects, and CRM contacts
          </p>
        </div>
        {config?.configured && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => (syncMutation.mutate as any)({ limit: 500 })}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Meetings
            </Button>
            {(stats?.pending ?? 0) > 0 && (
              <Button
                onClick={() => (processAllMutation.mutate as any)({
                  createContacts: autoCreateContacts,
                  createTasks: autoCreateTasks,
                  createProjects: autoCreateProjects,
                })}
                disabled={processAllMutation.isPending}
              >
                {processAllMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Process All Pending ({stats?.pending})
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue={config?.configured ? "meetings" : "setup"}>
        <TabsList>
          <TabsTrigger value="setup"><Settings className="h-4 w-4 mr-1" /> Setup</TabsTrigger>
          {config?.configured && (
            <TabsTrigger value="meetings"><Mic className="h-4 w-4 mr-1" /> Meetings</TabsTrigger>
          )}
        </TabsList>

        {/* Setup Tab */}
        <TabsContent value="setup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {config?.configured ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-400" />
                )}
                Connection Settings
              </CardTitle>
              <CardDescription>
                Connect your Fireflies.ai account to automatically sync meeting transcripts.
                Get your API key from{" "}
                <a href="https://app.fireflies.ai/integrations/custom/fireflies" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                  Fireflies Integrations
                </a>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {config?.configured && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Connected to Fireflies.ai
                  </div>
                  {(config as any).config && (
                    <div className="mt-2 text-sm text-green-600">
                      {((config as any).config as any).firefliesUserName && (
                        <span>Account: {((config as any).config as any).firefliesUserName} ({((config as any).config as any).firefliesEmail})</span>
                      )}
                    </div>
                  )}
                  {(config as any).lastSyncAt && (
                    <div className="mt-1 text-sm text-green-600">
                      Last synced: {formatDate((config as any).lastSyncAt)}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <Label htmlFor="apiKey">{config?.configured ? "Update" : ""} Fireflies API Key</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Enter your Fireflies API key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <Button onClick={handleConfigure} disabled={configureMutation.isPending || (!config?.configured && !apiKey.trim())}>
                      {configureMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      {config?.configured ? "Update" : "Connect"}
                    </Button>
                  </div>
                  {config?.configured && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave blank to keep your existing API key and save only settings changes.
                    </p>
                  )}
                </div>

                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-medium">Auto-Processing Settings</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-create CRM contacts</Label>
                      <p className="text-sm text-muted-foreground">Create contacts from meeting participants</p>
                    </div>
                    <Switch checked={autoCreateContacts} onCheckedChange={setAutoCreateContacts} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-create tasks</Label>
                      <p className="text-sm text-muted-foreground">Create project tasks from action items</p>
                    </div>
                    <Switch checked={autoCreateTasks} onCheckedChange={setAutoCreateTasks} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-create projects</Label>
                      <p className="text-sm text-muted-foreground">Create a project for each meeting with action items</p>
                    </div>
                    <Switch checked={autoCreateProjects} onCheckedChange={setAutoCreateProjects} />
                  </div>
                </div>
                {config?.configured && (
                  <Button onClick={handleConfigure} disabled={configureMutation.isPending}>
                    {configureMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Save Settings
                  </Button>
                )}

                {config?.configured && (
                  <div className="pt-4 border-t">
                    <Button variant="destructive" size="sm" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                      Disconnect Fireflies
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Meetings Tab */}
        {config?.configured && (
          <TabsContent value="meetings">
            <Card>
              <CardHeader>
                <CardTitle>Synced Meetings</CardTitle>
                <CardDescription>
                  New meetings sync automatically about every 30 minutes (and when you use Sync). Action items are queued as task suggestions when they can be matched to a project. Use Process for extra CRM contacts or a meeting project if needed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {meetingsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !meetings || meetings.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mic className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No meetings synced yet.</p>
                    <p className="text-sm mt-1">Wait for the next automatic sync or click Sync Meetings to fetch now.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Meeting</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Participants</TableHead>
                        <TableHead>Action Items</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Results</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meetings.map((meeting) => {
                        const participants = meeting.participants ? JSON.parse(meeting.participants as string) : [];
                        const actionItems = (meeting as any).actionItems ? JSON.parse((meeting as any).actionItems as string) : [];
                        return (
                          <TableRow key={meeting.id}>
                            <TableCell>
                              <div className="font-medium">{meeting.title}</div>
                              {(meeting as any).organizerEmail && (
                                <div className="text-xs text-muted-foreground">{(meeting as any).organizerEmail}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(meeting.date)}</TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(meeting.duration)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {participants.length}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <ListTodo className="h-3 w-3" />
                                {actionItems.length}
                              </div>
                            </TableCell>
                            <TableCell>{statusBadge((meeting as any).processingStatus || meeting.status)}</TableCell>
                            <TableCell>
                              {(meeting as any).processingStatus !== 'pending' && (
                                <div className="text-xs space-y-0.5">
                                  {((meeting as any).autoCreatedContactCount ?? 0) > 0 && (
                                    <div className="text-blue-600">{(meeting as any).autoCreatedContactCount} contacts</div>
                                  )}
                                  {((meeting as any).autoCreatedTaskCount ?? 0) > 0 && (
                                    <div className="text-purple-600">{(meeting as any).autoCreatedTaskCount} tasks</div>
                                  )}
                                  {(meeting as any).autoCreatedProjectId && (
                                    <div className="text-indigo-600">1 project</div>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {(meeting as any).processingStatus === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedMeetingId(meeting.id);
                                    setProcessProjectName("");
                                    setProcessCreateProject(false);
                                    setSelectedProjectId("auto");
                                    setSelectedAssigneeId("auto");
                                    setShowProcessDialog(true);
                                  }}
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  Process
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Process Meeting Dialog */}
      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Meeting</DialogTitle>
            <DialogDescription>
              Choose what to auto-generate from this meeting's data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-medium text-sm">Create CRM Contacts</div>
                <div className="text-xs text-muted-foreground">New contacts from meeting participants</div>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-400 ml-auto" />
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <ListTodo className="h-5 w-5 text-purple-600" />
              <div>
                <div className="font-medium text-sm">Create Tasks</div>
                <div className="text-xs text-muted-foreground">From meeting action items</div>
              </div>
              <ArrowRight className="h-4 w-4 text-purple-400 ml-auto" />
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <div className="font-medium text-sm">Task Routing (optional)</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Project</Label>
                  <Select
                    value={processCreateProject ? "auto" : selectedProjectId}
                    onValueChange={setSelectedProjectId}
                    disabled={processCreateProject}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Auto route project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto route project</SelectItem>
                      {(taskRoutingOptions?.projects || []).map((project) => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Assignee</Label>
                  <Select value={selectedAssigneeId} onValueChange={setSelectedAssigneeId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Auto assign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto assign</SelectItem>
                      {(taskRoutingOptions?.assignees || []).map((assignee) => (
                        <SelectItem key={assignee.id} value={String(assignee.id)}>
                          {assignee.name || assignee.email || `User ${assignee.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {processCreateProject && (
                <p className="text-xs text-muted-foreground">
                  Project selection is disabled because a new project will be created for this meeting.
                </p>
              )}
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
            <Button variant="outline" onClick={() => setShowProcessDialog(false)}>
              Cancel
            </Button>
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
