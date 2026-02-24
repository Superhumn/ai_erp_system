import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Target, Zap, Mail, Phone, BarChart3, TrendingUp, Users, DollarSign,
  FileText, Play, Pause, Plus, Settings, CheckCircle, Clock, AlertTriangle,
  ArrowRight, Bot, Loader2, RefreshCw, Send, Award, Workflow,
} from "lucide-react";

// ============================================
// B2B SALES PIPELINE AUTOMATION DASHBOARD
// Automates the entire sales lifecycle
// ============================================

const PIPELINE_STAGES = [
  { key: "new", label: "New Leads", color: "bg-gray-500", icon: Users },
  { key: "contacted", label: "Contacted", color: "bg-blue-500", icon: Mail },
  { key: "qualified", label: "Qualified", color: "bg-indigo-500", icon: CheckCircle },
  { key: "proposal", label: "Proposal", color: "bg-purple-500", icon: FileText },
  { key: "negotiation", label: "Negotiation", color: "bg-amber-500", icon: DollarSign },
  { key: "won", label: "Won", color: "bg-green-500", icon: Award },
  { key: "lost", label: "Lost", color: "bg-red-500", icon: AlertTriangle },
];

function formatCurrency(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// --- Pipeline Funnel View ---
function PipelineFunnel({ data }: { data: any }) {
  if (!data) return null;
  const maxValue = Math.max(...data.stages.map((s: any) => s.totalValue), 1);

  return (
    <div className="space-y-2">
      {data.stages.filter((s: any) => s.stage !== "won" && s.stage !== "lost").map((stage: any) => {
        const config = PIPELINE_STAGES.find(p => p.key === stage.stage);
        const widthPercent = Math.max(20, (stage.totalValue / maxValue) * 100);
        return (
          <div key={stage.stage} className="flex items-center gap-3">
            <div className="w-24 text-sm text-muted-foreground text-right">{config?.label}</div>
            <div className="flex-1 relative">
              <div
                className={`h-10 rounded-md ${config?.color} opacity-80 flex items-center px-3 text-white text-sm font-medium transition-all`}
                style={{ width: `${widthPercent}%` }}
              >
                {stage.dealCount} deals - {formatCurrency(stage.totalValue)}
              </div>
            </div>
            <div className="w-12 text-sm text-muted-foreground">{stage.avgProbability}%</div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 pt-2 border-t">
        <div className="w-24 text-sm font-medium text-right">Total</div>
        <div className="flex-1 text-lg font-bold">{formatCurrency(data.totalPipeline)}</div>
        <div className="w-12 text-sm font-medium">{data.totalDeals}</div>
      </div>
    </div>
  );
}

// --- Automation Stats Cards ---
function AutomationStatsGrid({ stats }: { stats: any }) {
  if (!stats) return null;

  const cards = [
    {
      title: "Active Sequences",
      value: stats.sequences?.activeSequences || 0,
      subtitle: `${stats.sequences?.totalEnrolled || 0} contacts enrolled`,
      icon: Workflow,
      color: "text-blue-600",
    },
    {
      title: "Automation Rules",
      value: stats.automation?.activeRules || 0,
      subtitle: `${stats.automation?.totalExecutions || 0} executions`,
      icon: Zap,
      color: "text-amber-600",
    },
    {
      title: "Pending Tasks",
      value: stats.tasks?.pendingTasks || 0,
      subtitle: `${stats.tasks?.overdueTasks || 0} overdue`,
      icon: Clock,
      color: "text-purple-600",
    },
    {
      title: "Proposals",
      value: stats.proposals?.totalProposals || 0,
      subtitle: `${stats.proposals?.acceptedProposals || 0} accepted`,
      icon: FileText,
      color: "text-green-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.title}</span>
            </div>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-xs text-muted-foreground">{card.subtitle}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- Sequences Tab ---
function SequencesTab() {
  const { data: sequences, refetch } = trpc.salesAutomation.sequences.list.useQuery();
  const createSequence = trpc.salesAutomation.sequences.create.useMutation({ onSuccess: () => { refetch(); toast.success("Sequence created"); } });
  const updateSequence = trpc.salesAutomation.sequences.update.useMutation({ onSuccess: () => { refetch(); toast.success("Sequence updated"); } });
  const [showCreate, setShowCreate] = useState(false);
  const [newSeq, setNewSeq] = useState({ name: "", description: "", type: "outbound_cold" as const });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Outreach Sequences</h3>
          <p className="text-sm text-muted-foreground">Automated multi-step cadences for prospect engagement</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Sequence</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Sales Sequence</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={newSeq.name} onChange={e => setNewSeq({ ...newSeq, name: e.target.value })} placeholder="e.g., Cold Outreach - Enterprise" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={newSeq.description} onChange={e => setNewSeq({ ...newSeq, description: e.target.value })} placeholder="Describe the purpose of this sequence..." />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newSeq.type} onValueChange={(v: any) => setNewSeq({ ...newSeq, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound_cold">Outbound - Cold</SelectItem>
                    <SelectItem value="outbound_warm">Outbound - Warm</SelectItem>
                    <SelectItem value="inbound_follow_up">Inbound Follow-up</SelectItem>
                    <SelectItem value="re_engagement">Re-engagement</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="expansion">Expansion</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { createSequence.mutate(newSeq); setShowCreate(false); setNewSeq({ name: "", description: "", type: "outbound_cold" }); }}>
                Create Sequence
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {sequences?.map((seq: any) => (
          <Card key={seq.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${seq.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">{seq.name}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{seq.type?.replace(/_/g, " ")}</Badge>
                      <span>{seq.totalEnrolled || 0} enrolled</span>
                      <span>-</span>
                      <span>{seq.totalConverted || 0} converted</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {seq.avgConversionRate && Number(seq.avgConversionRate) > 0 && (
                    <Badge variant="secondary" className="text-xs">{Number(seq.avgConversionRate).toFixed(1)}% conv.</Badge>
                  )}
                  <Badge className={seq.status === "active" ? "bg-green-100 text-green-700" : seq.status === "paused" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"}>
                    {seq.status}
                  </Badge>
                  {seq.status === "draft" || seq.status === "paused" ? (
                    <Button variant="outline" size="sm" onClick={() => updateSequence.mutate({ id: seq.id, status: "active" })}>
                      <Play className="h-3 w-3 mr-1" /> Activate
                    </Button>
                  ) : seq.status === "active" ? (
                    <Button variant="outline" size="sm" onClick={() => updateSequence.mutate({ id: seq.id, status: "paused" })}>
                      <Pause className="h-3 w-3 mr-1" /> Pause
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!sequences || sequences.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No sequences yet. Create one to start automating outreach.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// --- Automation Rules Tab ---
function AutomationRulesTab() {
  const { data: rules, refetch } = trpc.salesAutomation.rules.list.useQuery();
  const { data: log } = trpc.salesAutomation.rules.log.useQuery({ limit: 20 });
  const createRule = trpc.salesAutomation.rules.create.useMutation({ onSuccess: () => { refetch(); toast.success("Rule created"); } });
  const updateRule = trpc.salesAutomation.rules.update.useMutation({ onSuccess: () => { refetch(); } });
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    triggerEvent: "lead_created" as const,
    actionType: "enroll_in_sequence" as const,
    actionConfig: "{}",
  });

  const triggerLabels: Record<string, string> = {
    lead_created: "Lead Created",
    lead_score_changed: "Lead Score Changed",
    deal_stage_changed: "Deal Stage Changed",
    email_opened: "Email Opened",
    email_replied: "Email Replied",
    proposal_viewed: "Proposal Viewed",
    proposal_accepted: "Proposal Accepted",
    proposal_rejected: "Proposal Rejected",
    meeting_completed: "Meeting Completed",
    no_activity_days: "No Activity (Days)",
    deal_stalled: "Deal Stalled",
    contract_signed: "Contract Signed",
    deal_won: "Deal Won",
    deal_lost: "Deal Lost",
  };

  const actionLabels: Record<string, string> = {
    change_deal_stage: "Change Deal Stage",
    update_lead_score: "Update Lead Score",
    enroll_in_sequence: "Enroll in Sequence",
    remove_from_sequence: "Remove from Sequence",
    send_email: "Send Email",
    create_task: "Create Task",
    assign_owner: "Assign Owner",
    send_notification: "Send Notification",
    create_proposal: "Auto-Generate Proposal",
    convert_to_customer: "Convert to Customer",
    create_sales_order: "Create Sales Order",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Automation Rules</h3>
          <p className="text-sm text-muted-foreground">When X happens, automatically do Y</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Rule</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Automation Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} placeholder="e.g., Auto-enroll new leads" />
              </div>
              <div>
                <Label>When this happens...</Label>
                <Select value={newRule.triggerEvent} onValueChange={(v: any) => setNewRule({ ...newRule, triggerEvent: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(triggerLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Do this...</Label>
                <Select value={newRule.actionType} onValueChange={(v: any) => setNewRule({ ...newRule, actionType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(actionLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Action Config (JSON)</Label>
                <Textarea value={newRule.actionConfig} onChange={e => setNewRule({ ...newRule, actionConfig: e.target.value })} placeholder='{"sequenceId": 1}' className="font-mono text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { createRule.mutate(newRule); setShowCreate(false); }}>Create Rule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {rules?.map((rule: any) => (
          <Card key={rule.id}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className={`h-5 w-5 ${rule.isActive ? "text-amber-500" : "text-gray-400"}`} />
                  <div>
                    <div className="font-medium text-sm">{rule.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">{triggerLabels[rule.triggerEvent] || rule.triggerEvent}</Badge>
                      <ArrowRight className="h-3 w-3" />
                      <Badge variant="outline" className="text-xs">{actionLabels[rule.actionType] || rule.actionType}</Badge>
                      <span className="ml-2">{rule.executionCount || 0} runs</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) => updateRule.mutate({ id: rule.id, isActive: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!rules || rules.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No automation rules yet. Create rules to automate your pipeline.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Execution Log */}
      {log && log.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Recent Automation Activity</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {log.map((entry: any) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                <Badge variant={entry.status === "success" ? "default" : "destructive"} className="text-xs">
                  {entry.status}
                </Badge>
                <span className="text-muted-foreground">{entry.triggerEvent}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>{entry.actionType}</span>
                <span className="ml-auto text-muted-foreground">
                  {new Date(entry.executedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Tasks Tab ---
function SalesTasksTab() {
  const { data: tasks, refetch } = trpc.salesAutomation.tasks.list.useQuery({ status: "pending" });
  const completeTask = trpc.salesAutomation.tasks.complete.useMutation({
    onSuccess: () => { refetch(); toast.success("Task completed"); },
  });

  const priorityColors: Record<string, string> = {
    urgent: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-blue-100 text-blue-700",
    low: "bg-gray-100 text-gray-700",
  };

  const typeIcons: Record<string, any> = {
    call: Phone,
    email: Mail,
    meeting: Users,
    follow_up: RefreshCw,
    proposal: FileText,
    demo: Play,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Sales Tasks</h3>
          <p className="text-sm text-muted-foreground">Auto-generated and manual tasks for your team</p>
        </div>
        <Badge variant="outline">{tasks?.length || 0} pending</Badge>
      </div>

      <div className="space-y-2">
        {tasks?.map((item: any) => {
          const task = item.task;
          const IconComp = typeIcons[task.taskType] || CheckCircle;
          return (
            <Card key={task.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <IconComp className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{task.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {item.contactName && <span>{item.contactName}</span>}
                        <Badge className={`text-xs ${priorityColors[task.priority] || ""}`}>{task.priority}</Badge>
                        {task.dueAt && (
                          <span className={new Date(task.dueAt) < new Date() ? "text-red-500" : ""}>
                            Due: {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        )}
                        {task.source !== "manual" && (
                          <Badge variant="outline" className="text-xs"><Bot className="h-3 w-3 mr-1" />Auto</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => completeTask.mutate({ id: task.id })}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Done
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(!tasks || tasks.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No pending tasks. Your sales queue is clear.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// --- Lead Scoring Tab ---
function LeadScoringTab() {
  const { data: rules, refetch } = trpc.salesAutomation.scoringRules.list.useQuery();
  const scoreAll = trpc.salesAutomation.scoreAllLeads.useMutation({
    onSuccess: (result) => { toast.success(`Scored ${result.scored} leads (avg: ${result.avgScore.toFixed(0)})`); },
  });
  const createRule = trpc.salesAutomation.scoringRules.create.useMutation({
    onSuccess: () => { refetch(); toast.success("Scoring rule created"); },
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    category: "firmographic" as const,
    field: "companyName",
    operator: "exists" as const,
    value: "true",
    scoreChange: 10,
  });

  const categoryColors: Record<string, string> = {
    demographic: "bg-blue-100 text-blue-700",
    firmographic: "bg-purple-100 text-purple-700",
    behavioral: "bg-green-100 text-green-700",
    engagement: "bg-amber-100 text-amber-700",
    negative: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Lead Scoring</h3>
          <p className="text-sm text-muted-foreground">AI-powered scoring rules to prioritize your pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => scoreAll.mutate()} disabled={scoreAll.isPending}>
            {scoreAll.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Score All Leads
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Rule</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Scoring Rule</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} placeholder="e.g., Has company name" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={newRule.category} onValueChange={(v: any) => setNewRule({ ...newRule, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="demographic">Demographic</SelectItem>
                      <SelectItem value="firmographic">Firmographic</SelectItem>
                      <SelectItem value="behavioral">Behavioral</SelectItem>
                      <SelectItem value="engagement">Engagement</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Field</Label>
                    <Select value={newRule.field} onValueChange={v => setNewRule({ ...newRule, field: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="companyName">Company Name</SelectItem>
                        <SelectItem value="jobTitle">Job Title</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="industry">Industry</SelectItem>
                        <SelectItem value="totalInteractions">Total Interactions</SelectItem>
                        <SelectItem value="daysSinceLastContact">Days Since Contact</SelectItem>
                        <SelectItem value="source">Lead Source</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Operator</Label>
                    <Select value={newRule.operator} onValueChange={(v: any) => setNewRule({ ...newRule, operator: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exists">Exists</SelectItem>
                        <SelectItem value="not_exists">Not Exists</SelectItem>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="greater_than">Greater Than</SelectItem>
                        <SelectItem value="less_than">Less Than</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Value</Label>
                    <Input value={newRule.value} onChange={e => setNewRule({ ...newRule, value: e.target.value })} />
                  </div>
                  <div>
                    <Label>Score Change</Label>
                    <Input type="number" value={newRule.scoreChange} onChange={e => setNewRule({ ...newRule, scoreChange: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { createRule.mutate(newRule); setShowCreate(false); }}>Create Rule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-2">
        {rules?.map((rule: any) => (
          <Card key={rule.id}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className={`h-5 w-5 ${rule.scoreChange > 0 ? "text-green-500" : "text-red-500"}`} />
                  <div>
                    <div className="text-sm font-medium">{rule.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Badge className={`text-xs ${categoryColors[rule.category] || ""}`}>{rule.category}</Badge>
                      <span>{rule.field} {rule.operator} {rule.value}</span>
                    </div>
                  </div>
                </div>
                <Badge className={`text-sm ${rule.scoreChange > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {rule.scoreChange > 0 ? "+" : ""}{rule.scoreChange} pts
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!rules || rules.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No scoring rules yet. Add rules to auto-prioritize leads.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// --- Proposals Tab ---
function ProposalsTab() {
  const { data: proposals } = trpc.salesAutomation.proposals.list.useQuery();
  const updateStatus = trpc.salesAutomation.proposals.updateStatus.useMutation({
    onSuccess: () => { toast.success("Proposal updated"); },
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    review: "bg-blue-100 text-blue-700",
    sent: "bg-indigo-100 text-indigo-700",
    viewed: "bg-purple-100 text-purple-700",
    accepted: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    expired: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Proposals</h3>
        <p className="text-sm text-muted-foreground">AI-generated proposals tracked through their lifecycle</p>
      </div>

      <div className="space-y-2">
        {proposals?.map((item: any) => {
          const p = item.proposal;
          return (
            <Card key={p.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-purple-500" />
                    <div>
                      <div className="text-sm font-medium">{p.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{p.proposalNumber}</span>
                        <span>-</span>
                        <span>{item.contactName}</span>
                        <span>-</span>
                        <span className="font-medium">${Number(p.totalAmount).toLocaleString()}</span>
                        {p.validUntil && (
                          <span className={new Date(p.validUntil) < new Date() ? "text-red-500" : ""}>
                            Valid until {new Date(p.validUntil).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[p.status] || ""}>{p.status}</Badge>
                    {p.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: p.id, status: "sent" })}>
                        <Send className="h-3 w-3 mr-1" /> Send
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(!proposals || proposals.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No proposals yet. Proposals are auto-generated when deals reach the proposal stage.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// --- Forecast Tab ---
function ForecastTab() {
  const { data: forecasts } = trpc.salesAutomation.forecastHistory.useQuery({ limit: 5 });
  const generateForecast = trpc.salesAutomation.forecast.useMutation({
    onSuccess: (result) => {
      if (result.forecast) {
        toast.success(`Forecast: ${formatCurrency(result.forecast.weightedValue)} weighted pipeline`);
      }
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Sales Forecasting</h3>
          <p className="text-sm text-muted-foreground">AI-powered revenue predictions</p>
        </div>
        <div className="flex gap-2">
          {(["week", "month", "quarter"] as const).map(period => (
            <Button
              key={period}
              variant="outline"
              size="sm"
              onClick={() => generateForecast.mutate({ periodType: period })}
              disabled={generateForecast.isPending}
            >
              {generateForecast.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <BarChart3 className="h-3 w-3 mr-1" />}
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {forecasts?.map((f: any) => (
          <Card key={f.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium">
                    {f.periodType.charAt(0).toUpperCase() + f.periodType.slice(1)}ly Forecast
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(f.periodStart).toLocaleDateString()} - {new Date(f.periodEnd).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant="outline">{f.dealCount} deals</Badge>
              </div>
              <div className="grid grid-cols-5 gap-3 text-sm">
                <div className="p-2 bg-muted rounded">
                  <div className="text-xs text-muted-foreground">Pipeline</div>
                  <div className="font-semibold">{formatCurrency(Number(f.pipelineValue))}</div>
                </div>
                <div className="p-2 bg-muted rounded">
                  <div className="text-xs text-muted-foreground">Weighted</div>
                  <div className="font-semibold">{formatCurrency(Number(f.weightedValue))}</div>
                </div>
                <div className="p-2 bg-green-50 rounded">
                  <div className="text-xs text-muted-foreground">Best Case</div>
                  <div className="font-semibold text-green-700">{formatCurrency(Number(f.bestCaseValue))}</div>
                </div>
                <div className="p-2 bg-red-50 rounded">
                  <div className="text-xs text-muted-foreground">Worst Case</div>
                  <div className="font-semibold text-red-700">{formatCurrency(Number(f.worstCaseValue))}</div>
                </div>
                <div className="p-2 bg-blue-50 rounded">
                  <div className="text-xs text-muted-foreground">AI Forecast</div>
                  <div className="font-semibold text-blue-700">{formatCurrency(Number(f.aiForecastValue))}</div>
                </div>
              </div>
              {f.winRate && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Win Rate: {Number(f.winRate).toFixed(1)}% | Avg Deal: {formatCurrency(Number(f.avgDealSize))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {(!forecasts || forecasts.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No forecasts yet. Generate one to see AI-powered revenue predictions.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function B2BSalesAutomation() {
  const { data: pipelineData, isLoading: pipelineLoading } = trpc.salesAutomation.pipelineSummary.useQuery();
  const { data: automationStats, isLoading: statsLoading } = trpc.salesAutomation.automationStats.useQuery();
  const processDue = trpc.salesAutomation.sequences.processDue.useMutation({
    onSuccess: (result) => {
      toast.success(`Processed ${result.processed} steps: ${result.succeeded} succeeded, ${result.failed} failed`);
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" />
            B2B Sales Automation
          </h1>
          <p className="text-muted-foreground">
            Automated pipeline management, outreach sequences, lead scoring, and AI-powered proposals
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => processDue.mutate()}
          disabled={processDue.isPending}
        >
          {processDue.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Process Due Actions
        </Button>
      </div>

      {/* Automation Stats */}
      {!statsLoading && <AutomationStatsGrid stats={automationStats} />}

      {/* Pipeline Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Sales Pipeline
          </CardTitle>
          <CardDescription>Deal flow across stages with automation at each step</CardDescription>
        </CardHeader>
        <CardContent>
          {pipelineLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <PipelineFunnel data={pipelineData} />
          )}
        </CardContent>
      </Card>

      {/* B2B Sales Process Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automated Sales Process</CardTitle>
          <CardDescription>Each stage runs automatically via sequences, scoring, and AI actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {[
              { step: "1. Capture", desc: "Leads auto-import from web, LinkedIn, events", icon: Users, color: "text-gray-600" },
              { step: "2. Score & Qualify", desc: "AI scores leads, applies BANT criteria", icon: Target, color: "text-blue-600" },
              { step: "3. Outreach", desc: "Multi-step sequences: email, call, LinkedIn", icon: Mail, color: "text-indigo-600" },
              { step: "4. Propose", desc: "AI generates personalized proposals", icon: FileText, color: "text-purple-600" },
              { step: "5. Close & Expand", desc: "Auto-convert, create orders, track renewal", icon: Award, color: "text-green-600" },
            ].map((item) => (
              <div key={item.step} className="p-3 border rounded-lg text-center space-y-1">
                <item.icon className={`h-6 w-6 mx-auto ${item.color}`} />
                <div className="text-xs font-semibold">{item.step}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Tabs defaultValue="sequences" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="sequences">
            <Mail className="h-4 w-4 mr-1" /> Sequences
          </TabsTrigger>
          <TabsTrigger value="scoring">
            <Target className="h-4 w-4 mr-1" /> Scoring
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Zap className="h-4 w-4 mr-1" /> Rules
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <CheckCircle className="h-4 w-4 mr-1" /> Tasks
          </TabsTrigger>
          <TabsTrigger value="proposals">
            <FileText className="h-4 w-4 mr-1" /> Proposals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sequences"><SequencesTab /></TabsContent>
        <TabsContent value="scoring"><LeadScoringTab /></TabsContent>
        <TabsContent value="rules"><AutomationRulesTab /></TabsContent>
        <TabsContent value="tasks"><SalesTasksTab /></TabsContent>
        <TabsContent value="proposals"><ProposalsTab /></TabsContent>
      </Tabs>

      {/* Forecast Section */}
      <ForecastTab />
    </div>
  );
}
