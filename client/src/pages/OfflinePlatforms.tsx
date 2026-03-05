import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Play,
  Square,
  Monitor,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Send,
  ShoppingCart,
  Calculator,
  Users,
  Mail,
  UserCog,
  Target,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const categoryIcons: Record<string, React.ReactNode> = {
  crm: <Users className="h-5 w-5" />,
  ecommerce: <ShoppingCart className="h-5 w-5" />,
  accounting: <Calculator className="h-5 w-5" />,
  social: <Globe className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  hr: <UserCog className="h-5 w-5" />,
  custom: <Target className="h-5 w-5" />,
};

const categoryColors: Record<string, string> = {
  crm: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  ecommerce: "bg-green-500/10 text-green-600 border-green-500/20",
  accounting: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  social: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  email: "bg-red-500/10 text-red-600 border-red-500/20",
  hr: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  custom: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  idle: { color: "bg-gray-500/10 text-gray-600", icon: <Clock className="h-3 w-3" /> },
  running: { color: "bg-blue-500/10 text-blue-600", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  waiting_input: { color: "bg-amber-500/10 text-amber-600", icon: <Clock className="h-3 w-3" /> },
  completed: { color: "bg-green-500/10 text-green-600", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { color: "bg-red-500/10 text-red-600", icon: <XCircle className="h-3 w-3" /> },
  paused: { color: "bg-yellow-500/10 text-yellow-600", icon: <Square className="h-3 w-3" /> },
};

export default function OfflinePlatforms() {
  const [activeTab, setActiveTab] = useState("platforms");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState("");
  const [showNewPlatform, setShowNewPlatform] = useState(false);
  const [newPlatform, setNewPlatform] = useState({
    name: "",
    url: "",
    description: "",
    category: "custom" as const,
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [showCredentials, setShowCredentials] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [screenshotSessionId, setScreenshotSessionId] = useState<string | null>(null);

  // Queries
  const platformsQuery = trpc.offlinePlatform.platforms.useQuery();
  const sessionsQuery = trpc.offlinePlatform.listSessions.useQuery(undefined, {
    refetchInterval: 3000,
  });
  const sessionQuery = trpc.offlinePlatform.getSession.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId, refetchInterval: 2000 }
  );
  const screenshotQuery = trpc.offlinePlatform.screenshot.useQuery(
    { sessionId: screenshotSessionId! },
    { enabled: !!screenshotSessionId && showScreenshot }
  );

  // Mutations
  const createSessionMutation = trpc.offlinePlatform.createSession.useMutation({
    onSuccess: (session) => {
      setActiveSessionId(session.id);
      setActiveTab("sessions");
      toast.success(`Session created for ${session.platformName}`);
      sessionsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const executeTaskMutation = trpc.offlinePlatform.executeTask.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Task completed successfully");
      } else {
        toast.error(`Task failed: ${result.message}`);
      }
      sessionsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const closeSessionMutation = trpc.offlinePlatform.closeSession.useMutation({
    onSuccess: () => {
      toast.success("Session closed");
      if (activeSessionId) setActiveSessionId(null);
      sessionsQuery.refetch();
    },
  });

  const addPlatformMutation = trpc.offlinePlatform.addPlatform.useMutation({
    onSuccess: () => {
      toast.success("Platform added");
      setShowNewPlatform(false);
      setNewPlatform({ name: "", url: "", description: "", category: "custom" });
      platformsQuery.refetch();
    },
  });

  const handleStartSession = (platformId: string) => {
    setSelectedPlatform(platformId);
    createSessionMutation.mutate({ platformId });
  };

  const handleExecuteTask = () => {
    if (!activeSessionId || !taskInput.trim() || !selectedPlatform) return;
    executeTaskMutation.mutate({
      sessionId: activeSessionId,
      task: taskInput.trim(),
      platformId: selectedPlatform,
      credentials: credentials.username ? credentials : undefined,
    });
    setTaskInput("");
  };

  const handleViewScreenshot = (sessionId: string) => {
    setScreenshotSessionId(sessionId);
    setShowScreenshot(true);
  };

  const platforms = platformsQuery.data || [];
  const sessions = sessionsQuery.data || [];
  const activeSession = sessionQuery.data;

  const taskSuggestions: Record<string, string[]> = {
    salesforce: [
      "Find all open opportunities worth over $50,000",
      "Create a new lead with name John Smith, company Acme Corp",
      "Export the last 30 days of closed-won deals",
      "Update the status of opportunity #12345 to Closed Won",
    ],
    hubspot: [
      "List all contacts added this week",
      "Create a new deal in the Sales Pipeline",
      "Export company list with revenue data",
      "Find contacts with no activity in 90 days",
    ],
    "quickbooks-online": [
      "Generate a Profit & Loss report for last month",
      "Create an invoice for customer ABC Corp for $5,000",
      "Reconcile the checking account for January",
      "List all overdue invoices",
    ],
    "shopify-admin": [
      "Check inventory levels for all products below 10 units",
      "Export all orders from the last 7 days",
      "Update the price of product SKU-12345 to $29.99",
      "Create a 20% discount code SAVE20",
    ],
    linkedin: [
      "Send a connection request to the VP of Sales at TechCorp",
      "Check messages from the last 24 hours",
      "Search for procurement managers in the food industry",
      "Post a company update about our new product launch",
    ],
    default: [
      "Navigate to the dashboard and summarize key metrics",
      "Find and export recent transactions",
      "Check for any pending notifications or alerts",
      "Search for a specific record by name or ID",
    ],
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Offline Platform Agent
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered browser automation - interact with any platform without API access
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowNewPlatform(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Platform
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">No API Keys Required</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The AI agent navigates platforms through a browser, just like a human would.
              Simply select a platform, describe your task in plain English, and the agent
              handles the rest - clicking, typing, and extracting data automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="sessions">
            Active Sessions
            {sessions.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                {sessions.length}
              </Badge>
            )}
          </TabsTrigger>
          {activeSessionId && <TabsTrigger value="task">Task Runner</TabsTrigger>}
        </TabsList>

        {/* Platforms Tab */}
        <TabsContent value="platforms" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {platforms.map((platform) => (
              <Card
                key={platform.id}
                className="hover:border-primary/30 transition-colors cursor-pointer group"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg border ${categoryColors[platform.category] || categoryColors.custom}`}
                      >
                        {categoryIcons[platform.category] || categoryIcons.custom}
                      </div>
                      <div>
                        <CardTitle className="text-base">{platform.name}</CardTitle>
                        <Badge variant="outline" className="mt-1 text-xs capitalize">
                          {platform.category}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <CardDescription className="text-sm">
                    {platform.description}
                  </CardDescription>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleStartSession(platform.id)}
                      disabled={createSessionMutation.isPending}
                    >
                      {createSessionMutation.isPending && selectedPlatform === platform.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      Start Session
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(platform.url, "_blank")}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="space-y-4">
          {sessions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Monitor className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="text-lg font-medium mb-1">No Active Sessions</h3>
                <p className="text-muted-foreground text-sm">
                  Start a session from the Platforms tab to begin automating.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const status = statusConfig[session.status] || statusConfig.idle;
                return (
                  <Card
                    key={session.id}
                    className={`${activeSessionId === session.id ? "border-primary" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <Monitor className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {session.platformName}
                              <Badge className={`${status.color} text-xs`}>
                                {status.icon}
                                <span className="ml-1 capitalize">{session.status}</span>
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {session.taskDescription || "No task assigned"}
                              {session.currentUrl && (
                                <span className="ml-2 opacity-60">
                                  {session.currentUrl}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveSessionId(session.id);
                              setSelectedPlatform(session.platformId);
                              setActiveTab("task");
                            }}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Use
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewScreenshot(session.id)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => closeSessionMutation.mutate({ sessionId: session.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Steps display */}
                      {session.steps.length > 0 && (
                        <div className="mt-3 border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Steps ({session.steps.length})
                          </p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {session.steps.slice(-5).map((step, i) => (
                              <div
                                key={step.id || i}
                                className="flex items-center gap-2 text-xs"
                              >
                                {step.status === "completed" ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                                ) : step.status === "failed" ? (
                                  <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                                ) : step.status === "executing" ? (
                                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
                                ) : (
                                  <Clock className="h-3 w-3 text-gray-400 shrink-0" />
                                )}
                                <span className="font-mono text-muted-foreground truncate">
                                  {step.description}
                                </span>
                                {step.result && (
                                  <span className="text-muted-foreground/60 truncate ml-auto">
                                    {step.result.substring(0, 80)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Task Runner Tab */}
        <TabsContent value="task" className="space-y-4">
          {activeSession ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Task Input Panel */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Send Task to {activeSession.platformName}
                    </CardTitle>
                    <CardDescription>
                      Describe what you want the AI agent to do on this platform
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      placeholder="e.g., Find all invoices from last month and export them as CSV..."
                      className="min-h-[100px] resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleExecuteTask();
                        }
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCredentials(!showCredentials)}
                      >
                        {showCredentials ? "Hide" : "Add"} Login Credentials
                      </Button>
                      <Button
                        onClick={handleExecuteTask}
                        disabled={
                          !taskInput.trim() || executeTaskMutation.isPending
                        }
                      >
                        {executeTaskMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-1" />
                        )}
                        Run Task
                      </Button>
                    </div>

                    {showCredentials && (
                      <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                        <p className="text-xs text-muted-foreground">
                          Credentials are used only for this session and never stored.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Username / Email</Label>
                            <Input
                              type="text"
                              value={credentials.username}
                              onChange={(e) =>
                                setCredentials((c) => ({
                                  ...c,
                                  username: e.target.value,
                                }))
                              }
                              placeholder="user@example.com"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Password</Label>
                            <Input
                              type="password"
                              value={credentials.password}
                              onChange={(e) =>
                                setCredentials((c) => ({
                                  ...c,
                                  password: e.target.value,
                                }))
                              }
                              placeholder="********"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Task Suggestions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Suggested Tasks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-2">
                      {(
                        taskSuggestions[selectedPlatform || ""] ||
                        taskSuggestions.default
                      ).map((suggestion, i) => (
                        <button
                          key={i}
                          className="text-left text-sm p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => setTaskInput(suggestion)}
                        >
                          <Sparkles className="h-3 w-3 inline mr-2 text-primary" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Execution Steps */}
                {activeSession.steps.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Execution Log</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {activeSession.steps.map((step, i) => (
                          <div
                            key={step.id || i}
                            className="flex items-start gap-2 text-sm border-l-2 pl-3 py-1"
                            style={{
                              borderColor:
                                step.status === "completed"
                                  ? "#22c55e"
                                  : step.status === "failed"
                                    ? "#ef4444"
                                    : step.status === "executing"
                                      ? "#3b82f6"
                                      : "#9ca3af",
                            }}
                          >
                            <div className="flex-1">
                              <div className="font-mono text-xs">
                                {step.action}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {step.description}
                              </div>
                              {step.result && (
                                <pre className="text-xs text-muted-foreground/70 mt-1 whitespace-pre-wrap max-h-20 overflow-hidden">
                                  {step.result.substring(0, 300)}
                                </pre>
                              )}
                              {step.error && (
                                <div className="text-xs text-red-500 mt-1">
                                  {step.error}
                                </div>
                              )}
                            </div>
                            {step.screenshot && (
                              <button
                                className="shrink-0"
                                onClick={() => {
                                  // Could show screenshot in a modal
                                }}
                              >
                                <Eye className="h-3 w-3 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Session Info Sidebar */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Session Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform</span>
                      <span className="font-medium">{activeSession.platformName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className={statusConfig[activeSession.status]?.color}>
                        {statusConfig[activeSession.status]?.icon}
                        <span className="ml-1 capitalize">{activeSession.status}</span>
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Steps</span>
                      <span>{activeSession.steps.length}</span>
                    </div>
                    {activeSession.currentUrl && (
                      <div>
                        <span className="text-muted-foreground block mb-1">Current URL</span>
                        <span className="text-xs font-mono break-all">
                          {activeSession.currentUrl}
                        </span>
                      </div>
                    )}
                    {activeSession.error && (
                      <div className="p-2 bg-red-50 dark:bg-red-950 rounded text-xs text-red-600">
                        {activeSession.error}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleViewScreenshot(activeSession.id)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View Screenshot
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive"
                      onClick={() => {
                        closeSessionMutation.mutate({ sessionId: activeSession.id });
                        setActiveSessionId(null);
                        setActiveTab("platforms");
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Close Session
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  Select a session from the Sessions tab or start one from Platforms.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Platform Dialog */}
      <Dialog open={showNewPlatform} onOpenChange={setShowNewPlatform}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Platform</DialogTitle>
            <DialogDescription>
              Add any web platform you want the AI agent to interact with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Platform Name</Label>
              <Input
                value={newPlatform.name}
                onChange={(e) =>
                  setNewPlatform((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g., My CRM Tool"
              />
            </div>
            <div>
              <Label>URL</Label>
              <Input
                value={newPlatform.url}
                onChange={(e) =>
                  setNewPlatform((p) => ({ ...p, url: e.target.value }))
                }
                placeholder="https://app.example.com"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={newPlatform.description}
                onChange={(e) =>
                  setNewPlatform((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="What does this platform do?"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={newPlatform.category}
                onValueChange={(v) =>
                  setNewPlatform((p) => ({
                    ...p,
                    category: v as typeof newPlatform.category,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crm">CRM</SelectItem>
                  <SelectItem value="ecommerce">E-Commerce</SelectItem>
                  <SelectItem value="accounting">Accounting</SelectItem>
                  <SelectItem value="social">Social Media</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="hr">HR & Payroll</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPlatform(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addPlatformMutation.mutate(newPlatform)}
              disabled={!newPlatform.name || !newPlatform.url}
            >
              Add Platform
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Screenshot Dialog */}
      <Dialog open={showScreenshot} onOpenChange={setShowScreenshot}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Live Browser View</DialogTitle>
            <DialogDescription>Current state of the browser session</DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-black">
            {screenshotQuery.data?.screenshot ? (
              <img
                src={`data:image/png;base64,${screenshotQuery.data.screenshot}`}
                alt="Browser screenshot"
                className="w-full"
              />
            ) : (
              <div className="p-12 text-center text-white/50">
                <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No screenshot available. The browser may not be active.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => screenshotQuery.refetch()}>
              <Loader2 className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
