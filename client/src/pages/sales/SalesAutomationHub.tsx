import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import SpreadsheetTable, { Column } from "@/components/SpreadsheetTable";
import {
  TrendingUp, Target, DollarSign, Users, Mail, Zap, Trophy, BarChart3,
  PlayCircle, PauseCircle, Settings, Plus, RefreshCw, Calendar, Clock,
  ArrowUpRight, ArrowDownRight, Activity, Briefcase, Award, Bot, Filter,
  ChevronRight, Star, AlertTriangle, CheckCircle2, XCircle, Timer, Search,
  Loader2, MoreHorizontal, Phone, Eye, Send, Trash2, Edit, Copy, UserPlus,
  GitBranch, Workflow, GripVertical, ArrowRight, Flag, MessageSquare
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num && num !== 0) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US").format(value);
}

// ============================================
// STATUS CONFIGURATIONS
// ============================================

const dealStatuses = [
  { value: "open", label: "Open", color: "bg-blue-100 text-blue-800" },
  { value: "won", label: "Won", color: "bg-green-100 text-green-800" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-800" },
  { value: "stalled", label: "Stalled", color: "bg-amber-100 text-amber-800" },
];

const sequenceStatuses = [
  { value: "active", label: "Active", color: "bg-green-100 text-green-800" },
  { value: "paused", label: "Paused", color: "bg-amber-100 text-amber-800" },
  { value: "completed", label: "Completed", color: "bg-blue-100 text-blue-800" },
  { value: "exited", label: "Exited", color: "bg-gray-100 text-gray-800" },
];

const automationTriggers: Record<string, { label: string; icon: any; color: string }> = {
  deal_created: { label: "Deal Created", icon: Plus, color: "text-green-600" },
  deal_stage_changed: { label: "Stage Changed", icon: GitBranch, color: "text-blue-600" },
  deal_won: { label: "Deal Won", icon: Trophy, color: "text-emerald-600" },
  deal_lost: { label: "Deal Lost", icon: XCircle, color: "text-red-600" },
  deal_stalled: { label: "Deal Stalled", icon: Timer, color: "text-amber-600" },
  contact_created: { label: "Contact Created", icon: UserPlus, color: "text-purple-600" },
  email_opened: { label: "Email Opened", icon: Eye, color: "text-cyan-600" },
  email_clicked: { label: "Email Clicked", icon: Target, color: "text-indigo-600" },
  email_replied: { label: "Email Replied", icon: MessageSquare, color: "text-teal-600" },
  no_activity: { label: "No Activity", icon: Clock, color: "text-gray-600" },
  follow_up_due: { label: "Follow-up Due", icon: Calendar, color: "text-orange-600" },
  meeting_scheduled: { label: "Meeting Scheduled", icon: Calendar, color: "text-blue-600" },
  schedule: { label: "Scheduled", icon: Clock, color: "text-slate-600" },
};

const goalStatuses = [
  { value: "not_started", label: "Not Started", color: "bg-gray-100 text-gray-800" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-800" },
  { value: "at_risk", label: "At Risk", color: "bg-red-100 text-red-800" },
  { value: "on_track", label: "On Track", color: "bg-green-100 text-green-800" },
  { value: "achieved", label: "Achieved", color: "bg-emerald-100 text-emerald-800" },
  { value: "missed", label: "Missed", color: "bg-red-100 text-red-800" },
];

// ============================================
// KPI CARD COMPONENT
// ============================================

function KPICard({
  title, value, change, changeType, icon: Icon, subtitle, onClick, color = "blue"
}: {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: any;
  subtitle?: string;
  onClick?: () => void;
  color?: "blue" | "green" | "amber" | "red" | "purple";
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <Card className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""} onClick={onClick}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-bold">{value}</p>
            {change && (
              <div className="flex items-center gap-1 text-xs">
                {changeType === "positive" && <ArrowUpRight className="h-3 w-3 text-green-600" />}
                {changeType === "negative" && <ArrowDownRight className="h-3 w-3 text-red-600" />}
                <span className={changeType === "positive" ? "text-green-600" : changeType === "negative" ? "text-red-600" : "text-muted-foreground"}>
                  {change}
                </span>
              </div>
            )}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// DEAL CARD FOR PIPELINE
// ============================================

function DealCard({ deal, onView, onStageChange }: { deal: any; onView: () => void; onStageChange: (stage: string) => void }) {
  const probability = deal.probability || 0;
  const probabilityColor = probability >= 70 ? "text-green-600" : probability >= 40 ? "text-amber-600" : "text-red-600";

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow mb-2" onClick={onView}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{deal.name}</h4>
            <p className="text-xs text-muted-foreground truncate">{deal.contact?.fullName || "No contact"}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to Stage</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStageChange("contacted"); }}>Contacted</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStageChange("qualified"); }}>Qualified</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStageChange("proposal"); }}>Proposal</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStageChange("negotiation"); }}>Negotiation</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStageChange("won"); }} className="text-green-600">
                <Trophy className="h-4 w-4 mr-2" /> Mark Won
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStageChange("lost"); }} className="text-red-600">
                <XCircle className="h-4 w-4 mr-2" /> Mark Lost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-semibold">{formatCurrency(deal.amount)}</span>
          <Badge variant="outline" className={`text-xs ${probabilityColor}`}>{probability}%</Badge>
        </div>
        {deal.expectedCloseDate && (
          <p className="text-xs text-muted-foreground mt-1">Close: {formatDate(deal.expectedCloseDate)}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// PIPELINE COLUMN COMPONENT
// ============================================

function PipelineColumn({ stage, deals, onViewDeal, onStageChange }: {
  stage: { key: string; label: string };
  deals: any[];
  onViewDeal: (deal: any) => void;
  onStageChange: (dealId: number, newStage: string) => void;
}) {
  const stageDeals = deals.filter(d => d.stage === stage.key);
  const totalValue = stageDeals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const weightedValue = stageDeals.reduce((sum, d) => sum + Number(d.amount || 0) * (d.probability || 0) / 100, 0);

  return (
    <div className="bg-muted/30 rounded-lg p-3 min-w-[280px] max-w-[280px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-sm">{stage.label}</h4>
          <Badge variant="outline" className="text-xs">{stageDeals.length}</Badge>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        <span className="font-medium">{formatCurrency(totalValue)}</span>
        <span className="mx-1">•</span>
        <span>Weighted: {formatCurrency(weightedValue)}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[500px] pr-1">
        {stageDeals.map(deal => (
          <DealCard
            key={deal.id}
            deal={deal}
            onView={() => onViewDeal(deal)}
            onStageChange={(newStage) => onStageChange(deal.id, newStage)}
          />
        ))}
        {stageDeals.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No deals
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// AUTOMATION RULE DETAIL PANEL
// ============================================

function AutomationRuleDetailPanel({ rule, onClose, onToggle, onEdit }: {
  rule: any;
  onClose: () => void;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const trigger = automationTriggers[rule.triggerType] || { label: rule.triggerType, icon: Zap, color: "text-gray-600" };
  const TriggerIcon = trigger.icon;
  const actions = rule.actions ? JSON.parse(rule.actions) : [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-muted ${trigger.color}`}>
            <TriggerIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{rule.name}</h3>
            <p className="text-sm text-muted-foreground">{rule.description || "No description"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={rule.isActive} onCheckedChange={onToggle} />
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-1" /> Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Trigger</div>
          <div className="font-medium text-sm">{trigger.label}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Executions</div>
          <div className="font-medium text-sm">{formatNumber(rule.totalExecutions)}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Last Run</div>
          <div className="font-medium text-sm">{rule.lastExecutedAt ? formatDate(rule.lastExecutedAt) : "Never"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Delay</div>
          <div className="font-medium text-sm">{rule.delayMinutes ? `${rule.delayMinutes} min` : "Immediate"}</div>
        </div>
      </div>

      <div>
        <h4 className="font-medium text-sm mb-2">Actions ({actions.length})</h4>
        <div className="space-y-2">
          {actions.map((action: any, index: number) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded border">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                {index + 1}
              </div>
              <span className="text-sm">{action.type?.replace(/_/g, " ")}</span>
              {action.templateId && <Badge variant="outline" className="text-xs">Template #{action.templateId}</Badge>}
            </div>
          ))}
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground">No actions configured</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// SEQUENCE DETAIL PANEL
// ============================================

function SequenceDetailPanel({ sequence, onClose, onManageSteps }: {
  sequence: any;
  onClose: () => void;
  onManageSteps: () => void;
}) {
  const openRate = sequence.totalEnrolled > 0 ? ((sequence.totalCompleted || 0) / sequence.totalEnrolled * 100).toFixed(1) : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${sequence.isActive ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"}`}>
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{sequence.name}</h3>
            <p className="text-sm text-muted-foreground">{sequence.description || "No description"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sequence.isActive ? "default" : "secondary"}>
            {sequence.isActive ? "Active" : "Inactive"}
          </Badge>
          <Button variant="outline" size="sm" onClick={onManageSteps}>
            <Workflow className="h-4 w-4 mr-1" /> Manage Steps
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Enrolled</div>
          <div className="font-medium text-lg">{formatNumber(sequence.totalEnrolled)}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Active</div>
          <div className="font-medium text-lg text-blue-600">{formatNumber(sequence.totalEnrolled - (sequence.totalCompleted || 0) - (sequence.totalConverted || 0))}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Completed</div>
          <div className="font-medium text-lg text-green-600">{formatNumber(sequence.totalCompleted)}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Converted</div>
          <div className="font-medium text-lg text-emerald-600">{formatNumber(sequence.totalConverted)}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-xs text-muted-foreground">Completion Rate</div>
          <div className="font-medium text-lg">{openRate}%</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Send on weekends: {sequence.sendOnWeekends ? "Yes" : "No"}</span>
        {sequence.goalType && (
          <>
            <span className="mx-2">•</span>
            <Target className="h-4 w-4" />
            <span>Goal: {sequence.goalType?.replace(/_/g, " ")}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// CREATE AUTOMATION RULE DIALOG
// ============================================

function CreateAutomationRuleDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    triggerType: "",
    delayMinutes: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createRule = trpc.salesAutomation.rules.create.useMutation({
    onSuccess: () => {
      toast.success("Automation rule created");
      onOpenChange(false);
      setFormData({ name: "", description: "", triggerType: "", delayMinutes: 0 });
      onCreated?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.triggerType) {
      toast.error("Please fill in required fields");
      return;
    }
    setIsSubmitting(true);
    createRule.mutate({
      name: formData.name,
      description: formData.description,
      triggerType: formData.triggerType as any,
      delayMinutes: formData.delayMinutes,
      actions: JSON.stringify([]),
    });
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Create Automation Rule
          </DialogTitle>
          <DialogDescription>Set up automated actions based on triggers</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Rule Name <span className="text-red-500">*</span></Label>
            <Input
              id="name"
              placeholder="e.g., Welcome Email on New Lead"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="trigger">Trigger <span className="text-red-500">*</span></Label>
            <Select value={formData.triggerType} onValueChange={(v) => setFormData({ ...formData, triggerType: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select trigger" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(automationTriggers).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="delay">Delay (minutes)</Label>
            <Input
              id="delay"
              type="number"
              min={0}
              value={formData.delayMinutes}
              onChange={(e) => setFormData({ ...formData, delayMinutes: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this automation does"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.name || !formData.triggerType}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// CREATE SEQUENCE DIALOG
// ============================================

function CreateSequenceDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "nurture",
    sendOnWeekends: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createSequence = trpc.salesAutomation.sequences.create.useMutation({
    onSuccess: () => {
      toast.success("Email sequence created");
      onOpenChange(false);
      setFormData({ name: "", description: "", type: "nurture", sendOnWeekends: false });
      onCreated?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error("Please enter a sequence name");
      return;
    }
    setIsSubmitting(true);
    createSequence.mutate({
      name: formData.name,
      description: formData.description,
      type: formData.type as any,
      sendOnWeekends: formData.sendOnWeekends,
    });
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            Create Email Sequence
          </DialogTitle>
          <DialogDescription>Build an automated email campaign</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Sequence Name <span className="text-red-500">*</span></Label>
            <Input
              id="name"
              placeholder="e.g., New Lead Nurture"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="type">Type</Label>
            <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nurture">Lead Nurture</SelectItem>
                <SelectItem value="onboarding">Customer Onboarding</SelectItem>
                <SelectItem value="re_engagement">Re-engagement</SelectItem>
                <SelectItem value="upsell">Upsell</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the purpose of this sequence"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label>Send on Weekends</Label>
              <p className="text-xs text-muted-foreground">Allow emails to be sent on weekends</p>
            </div>
            <Switch
              checked={formData.sendOnWeekends}
              onCheckedChange={(v) => setFormData({ ...formData, sendOnWeekends: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.name}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Sequence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function SalesAutomationHub() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "week" | "month" | "quarter" | "year">("month");
  const [searchTerm, setSearchTerm] = useState("");

  // Dialog states
  const [showNewRuleDialog, setShowNewRuleDialog] = useState(false);
  const [showNewSequenceDialog, setShowNewSequenceDialog] = useState(false);

  // Expanded row states
  const [expandedRuleId, setExpandedRuleId] = useState<number | string | null>(null);
  const [expandedSequenceId, setExpandedSequenceId] = useState<number | string | null>(null);
  const [expandedDealId, setExpandedDealId] = useState<number | string | null>(null);

  // Data fetching
  const { data: dashboardMetrics, isLoading: metricsLoading } = trpc.salesAutomation.metrics.getDashboard.useQuery({ period: selectedPeriod });
  const { data: pipelineHealth } = trpc.salesAutomation.metrics.getPipelineHealth.useQuery({});
  const { data: salesVelocity } = trpc.salesAutomation.metrics.getSalesVelocity.useQuery({});
  const { data: quotas } = trpc.salesAutomation.quotas.list.useQuery({ status: "active" });
  const { data: automationRules, refetch: refetchRules, isLoading: rulesLoading } = trpc.salesAutomation.rules.list.useQuery({});
  const { data: sequences, refetch: refetchSequences, isLoading: sequencesLoading } = trpc.salesAutomation.sequences.list.useQuery({});
  const { data: goals } = trpc.salesAutomation.goals.list.useQuery({});
  const { data: leaderboard } = trpc.salesAutomation.leaderboard.getCurrent.useQuery({ periodType: "monthly" });
  const { data: deals, refetch: refetchDeals, isLoading: dealsLoading } = trpc.crm.deals.list.useQuery({ status: "open" });
  const { data: forecasts } = trpc.salesAutomation.forecasting.list.useQuery({ limit: 6 });
  const { data: commissionSummary } = trpc.salesAutomation.commissions.getSummary.useQuery({});

  // Mutations
  const updateRule = trpc.salesAutomation.rules.update.useMutation({
    onSuccess: () => { toast.success("Rule updated"); refetchRules(); },
    onError: (err) => toast.error(err.message),
  });

  const moveDealStage = trpc.salesAutomation.deals.moveStage.useMutation({
    onSuccess: () => { toast.success("Deal moved"); refetchDeals(); },
    onError: (err) => toast.error(err.message),
  });

  const markDealWon = trpc.salesAutomation.deals.markWon.useMutation({
    onSuccess: () => { toast.success("Deal marked as won!"); refetchDeals(); },
    onError: (err) => toast.error(err.message),
  });

  const markDealLost = trpc.salesAutomation.deals.markLost.useMutation({
    onSuccess: () => { toast.success("Deal marked as lost"); refetchDeals(); },
    onError: (err) => toast.error(err.message),
  });

  const generateForecast = trpc.salesAutomation.forecasting.generate.useMutation({
    onSuccess: () => toast.success("Forecast generated"),
    onError: (err) => toast.error(err.message),
  });

  // Parse leaderboard
  const revenueRankings = leaderboard?.revenueRankings ? JSON.parse(leaderboard.revenueRankings as string) : [];
  const activityRankings = leaderboard?.activityRankings ? JSON.parse(leaderboard.activityRankings as string) : [];

  // Pipeline stages
  const pipelineStages = [
    { key: "new", label: "New" },
    { key: "contacted", label: "Contacted" },
    { key: "qualified", label: "Qualified" },
    { key: "proposal", label: "Proposal" },
    { key: "negotiation", label: "Negotiation" },
  ];

  // Table columns
  const automationRuleColumns: Column<any>[] = [
    { key: "name", header: "Rule Name", type: "text", sortable: true },
    {
      key: "triggerType",
      header: "Trigger",
      type: "badge",
      sortable: true,
      render: (row, val) => {
        const trigger = automationTriggers[val];
        return trigger ? trigger.label : val;
      }
    },
    { key: "totalExecutions", header: "Executions", type: "number", sortable: true },
    { key: "lastExecutedAt", header: "Last Run", type: "date", sortable: true, render: (row, val) => val ? formatDate(val) : "Never" },
    {
      key: "isActive",
      header: "Status",
      type: "badge",
      render: (row, val) => val ? "Active" : "Inactive"
    },
  ];

  const sequenceColumns: Column<any>[] = [
    { key: "name", header: "Sequence Name", type: "text", sortable: true },
    { key: "type", header: "Type", type: "badge", sortable: true, render: (row, val) => val?.replace(/_/g, " ") },
    { key: "totalEnrolled", header: "Enrolled", type: "number", sortable: true },
    { key: "totalCompleted", header: "Completed", type: "number", sortable: true },
    { key: "totalConverted", header: "Converted", type: "number", sortable: true },
    {
      key: "isActive",
      header: "Status",
      type: "badge",
      render: (row, val) => val ? "Active" : "Inactive"
    },
  ];

  const dealColumns: Column<any>[] = [
    { key: "name", header: "Deal Name", type: "text", sortable: true },
    { key: "contact.fullName", header: "Contact", type: "text", render: (row) => row.contact?.fullName || "-" },
    { key: "amount", header: "Amount", type: "currency", sortable: true, render: (row, val) => formatCurrency(val) },
    { key: "probability", header: "Probability", type: "text", sortable: true, render: (row, val) => `${val || 0}%` },
    { key: "stage", header: "Stage", type: "badge", sortable: true },
    { key: "expectedCloseDate", header: "Close Date", type: "date", sortable: true, render: (row, val) => formatDate(val) },
  ];

  const handleDealStageChange = (dealId: number, newStage: string) => {
    if (newStage === "won") {
      markDealWon.mutate({ dealId });
    } else if (newStage === "lost") {
      markDealLost.mutate({ dealId, lostReason: "Moved to lost" });
    } else {
      moveDealStage.mutate({ dealId, newStage });
    }
  };

  // Calculate quota progress
  const currentQuota = quotas?.[0];
  const quotaAttainment = currentQuota ? Number(currentQuota.attainmentPercent) || 0 : 0;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sales Automation Hub</h1>
          <p className="text-muted-foreground">AI-powered automations to scale your sales</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-9 w-[200px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as any)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        <KPICard
          title="Revenue"
          value={formatCurrency(dashboardMetrics?.totalRevenue)}
          change={`${dashboardMetrics?.wonDeals || 0} deals won`}
          changeType="positive"
          icon={DollarSign}
          color="green"
          onClick={() => setActiveTab("pipeline")}
        />
        <KPICard
          title="Pipeline"
          value={formatCurrency(dashboardMetrics?.pipelineValue)}
          subtitle={`Weighted: ${formatCurrency(dashboardMetrics?.weightedPipeline)}`}
          icon={TrendingUp}
          color="blue"
          onClick={() => setActiveTab("pipeline")}
        />
        <KPICard
          title="Win Rate"
          value={`${(salesVelocity?.winRatePercent || 0).toFixed(1)}%`}
          change={`${salesVelocity?.totalDeals || 0} closed deals`}
          changeType={(salesVelocity?.winRatePercent || 0) >= 25 ? "positive" : "negative"}
          icon={Target}
          color={(salesVelocity?.winRatePercent || 0) >= 25 ? "green" : "amber"}
        />
        <KPICard
          title="Automations"
          value={String(automationRules?.filter((r: any) => r.isActive).length || 0)}
          subtitle={`${automationRules?.length || 0} total rules`}
          icon={Zap}
          color="amber"
          onClick={() => setActiveTab("automations")}
        />
        <KPICard
          title="Activities"
          value={formatNumber(dashboardMetrics?.totalActivities)}
          subtitle={`${dashboardMetrics?.emailsSent || 0} emails, ${dashboardMetrics?.callsMade || 0} calls`}
          icon={Activity}
          color="purple"
        />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1 w-full max-w-6xl h-auto p-1">
          <TabsTrigger value="dashboard" className="gap-2 text-sm">
            <BarChart3 className="h-4 w-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2 text-sm">
            <Briefcase className="h-4 w-4" /> Pipeline
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="gap-2 text-sm">
            <Bot className="h-4 w-4" /> Intelligence
          </TabsTrigger>
          <TabsTrigger value="automations" className="gap-2 text-sm">
            <Zap className="h-4 w-4" /> Automations
          </TabsTrigger>
          <TabsTrigger value="sequences" className="gap-2 text-sm">
            <Mail className="h-4 w-4" /> Sequences
          </TabsTrigger>
          <TabsTrigger value="battlecards" className="gap-2 text-sm">
            <Flag className="h-4 w-4" /> Battlecards
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2 text-sm">
            <Trophy className="h-4 w-4" /> Performance
          </TabsTrigger>
          <TabsTrigger value="forecasting" className="gap-2 text-sm">
            <TrendingUp className="h-4 w-4" /> Forecasting
          </TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard" className="space-y-6 mt-4">
          <div className="grid grid-cols-3 gap-6">
            {/* Quota Progress */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Quota Progress</CardTitle>
                  <Badge variant={quotaAttainment >= 80 ? "default" : quotaAttainment >= 50 ? "secondary" : "destructive"}>
                    {quotaAttainment >= 80 ? "On Track" : quotaAttainment >= 50 ? "Behind" : "At Risk"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {currentQuota ? (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <span className="text-3xl font-bold">{quotaAttainment.toFixed(0)}%</span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(currentQuota.revenueAchieved)} / {formatCurrency(currentQuota.revenueQuota)}
                      </span>
                    </div>
                    <Progress value={Math.min(quotaAttainment, 100)} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{currentQuota.dealCountAchieved || 0} deals closed</span>
                      <span>Target: {currentQuota.dealCountQuota || "-"} deals</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No active quota</p>
                )}
              </CardContent>
            </Card>

            {/* Pipeline Health */}
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pipeline Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{pipelineHealth?.totalDeals || 0}</p>
                    <p className="text-xs text-muted-foreground">Open Deals</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{formatCurrency(pipelineHealth?.totalValue)}</p>
                    <p className="text-xs text-muted-foreground">Total Value</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{formatCurrency(pipelineHealth?.weightedValue)}</p>
                    <p className="text-xs text-muted-foreground">Weighted</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{pipelineHealth?.avgDealAge?.toFixed(0) || 0}</p>
                    <p className="text-xs text-muted-foreground">Avg Age (days)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{pipelineHealth?.dealsAtRisk || 0}</p>
                    <p className="text-xs text-muted-foreground">At Risk</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Goals and Leaderboard */}
          <div className="grid grid-cols-3 gap-6">
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Active Goals</CardTitle>
                  <Button variant="ghost" size="sm">View All</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {goals?.slice(0, 4).map((goal: any) => {
                    const progress = Number(goal.progressPercent) || 0;
                    const statusConfig = goalStatuses.find(s => s.value === goal.status);
                    return (
                      <div key={goal.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm">{goal.name}</h4>
                          <Badge className={statusConfig?.color || ""}>{statusConfig?.label || goal.status}</Badge>
                        </div>
                        <Progress value={Math.min(progress, 100)} className="h-1.5 mb-1" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{progress.toFixed(0)}%</span>
                          <span>{goal.currentValue} / {goal.targetValue}</span>
                        </div>
                      </div>
                    );
                  })}
                  {(!goals || goals.length === 0) && (
                    <p className="text-muted-foreground col-span-2 text-center py-8">No active goals</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Revenue Leaders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {revenueRankings.slice(0, 5).map((item: any, index: number) => (
                    <div key={item.userId} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? "bg-amber-100 text-amber-700" :
                        index === 1 ? "bg-gray-100 text-gray-700" :
                        index === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">User #{item.userId}</p>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                  {revenueRankings.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">No data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PIPELINE TAB */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Sales Pipeline</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" /> Filter
              </Button>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" /> New Deal
              </Button>
            </div>
          </div>

          {/* Pipeline Board */}
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pipelineStages.map(stage => (
              <PipelineColumn
                key={stage.key}
                stage={stage}
                deals={deals || []}
                onViewDeal={(deal) => setExpandedDealId(deal.id)}
                onStageChange={handleDealStageChange}
              />
            ))}
          </div>

          {/* Sales Velocity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Sales Velocity</CardTitle>
              <CardDescription>Average time from lead to close</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-6">
                <div>
                  <p className="text-2xl font-bold">{salesVelocity?.totalDeals || 0}</p>
                  <p className="text-xs text-muted-foreground">Deals Won</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(salesVelocity?.avgDealSize)}</p>
                  <p className="text-xs text-muted-foreground">Avg Deal Size</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{(salesVelocity?.winRatePercent || 0).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{salesVelocity?.avgSalesCycle?.toFixed(0) || 0}</p>
                  <p className="text-xs text-muted-foreground">Avg Cycle (days)</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(salesVelocity?.salesVelocity)}</p>
                  <p className="text-xs text-muted-foreground">Daily Velocity</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUTOMATIONS TAB */}
        <TabsContent value="automations" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Automation Rules</h2>
              <p className="text-sm text-muted-foreground">Configure automated workflows</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Zap className="h-8 w-8 text-amber-600" />
                  <div>
                    <p className="text-2xl font-bold">{automationRules?.filter((r: any) => r.isActive).length || 0}</p>
                    <p className="text-sm text-muted-foreground">Active Rules</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <PlayCircle className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {automationRules?.reduce((sum: number, r: any) => sum + (r.totalExecutions || 0), 0) || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Total Executions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{automationRules?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Rules</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rules Table */}
          <Card>
            <CardContent className="pt-6">
              <SpreadsheetTable
                data={automationRules || []}
                columns={automationRuleColumns}
                isLoading={rulesLoading}
                showSearch
                onAdd={() => setShowNewRuleDialog(true)}
                addLabel="New Rule"
                expandedRowId={expandedRuleId}
                onExpandChange={setExpandedRuleId}
                renderExpanded={(row, onClose) => (
                  <AutomationRuleDetailPanel
                    rule={row}
                    onClose={onClose}
                    onToggle={() => updateRule.mutate({ id: row.id, isActive: !row.isActive })}
                    onEdit={() => {}}
                  />
                )}
                emptyMessage="No automation rules configured"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEQUENCES TAB */}
        <TabsContent value="sequences" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Email Sequences</h2>
              <p className="text-sm text-muted-foreground">Automated email drip campaigns</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              title="Active Sequences"
              value={String(sequences?.filter((s: any) => s.isActive).length || 0)}
              icon={PlayCircle}
              color="green"
            />
            <KPICard
              title="Total Enrolled"
              value={formatNumber(sequences?.reduce((sum: number, s: any) => sum + (s.totalEnrolled || 0), 0))}
              icon={Users}
              color="blue"
            />
            <KPICard
              title="Completed"
              value={formatNumber(sequences?.reduce((sum: number, s: any) => sum + (s.totalCompleted || 0), 0))}
              icon={CheckCircle2}
              color="green"
            />
            <KPICard
              title="Converted"
              value={formatNumber(sequences?.reduce((sum: number, s: any) => sum + (s.totalConverted || 0), 0))}
              icon={Star}
              color="amber"
            />
          </div>

          {/* Sequences Table */}
          <Card>
            <CardContent className="pt-6">
              <SpreadsheetTable
                data={sequences || []}
                columns={sequenceColumns}
                isLoading={sequencesLoading}
                showSearch
                onAdd={() => setShowNewSequenceDialog(true)}
                addLabel="New Sequence"
                expandedRowId={expandedSequenceId}
                onExpandChange={setExpandedSequenceId}
                renderExpanded={(row, onClose) => (
                  <SequenceDetailPanel
                    sequence={row}
                    onClose={onClose}
                    onManageSteps={() => {}}
                  />
                )}
                emptyMessage="No email sequences created"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERFORMANCE TAB */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          <h2 className="text-xl font-semibold">Sales Performance</h2>

          <div className="grid grid-cols-3 gap-6">
            {/* Commission Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Commission Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-bold text-amber-600">{formatCurrency(commissionSummary?.totalPending)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Approved</span>
                    <span className="font-bold text-blue-600">{formatCurrency(commissionSummary?.totalApproved)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Paid (YTD)</span>
                    <span className="font-bold text-green-600">{formatCurrency(commissionSummary?.totalPaid)}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Earned</span>
                      <span className="font-bold text-lg">{formatCurrency(commissionSummary?.totalEarned)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Leaderboard */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Revenue Leaderboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {revenueRankings.slice(0, 5).map((item: any, index: number) => (
                    <div key={item.userId} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? "bg-amber-100 text-amber-700" :
                        index === 1 ? "bg-gray-100 text-gray-700" :
                        index === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">User #{item.userId}</p>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                  {revenueRankings.length === 0 && <p className="text-muted-foreground text-center py-4">No data</p>}
                </div>
              </CardContent>
            </Card>

            {/* Activity Leaderboard */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Activity Leaderboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activityRankings.slice(0, 5).map((item: any, index: number) => (
                    <div key={item.userId} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? "bg-amber-100 text-amber-700" :
                        index === 1 ? "bg-gray-100 text-gray-700" :
                        index === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">User #{item.userId}</p>
                      </div>
                      <span className="text-sm font-bold">{formatNumber(item.value)} activities</span>
                    </div>
                  ))}
                  {activityRankings.length === 0 && <p className="text-muted-foreground text-center py-4">No data</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quota Attainment */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Quota Attainment</CardTitle>
            </CardHeader>
            <CardContent>
              {quotas && quotas.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {quotas.map((quota: any) => {
                    const attainment = Number(quota.attainmentPercent) || 0;
                    return (
                      <div key={quota.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{quota.periodType}</span>
                          <Badge variant={attainment >= 100 ? "default" : attainment >= 80 ? "secondary" : "destructive"}>
                            {attainment.toFixed(0)}%
                          </Badge>
                        </div>
                        <Progress value={Math.min(attainment, 100)} className="h-2 mb-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{formatCurrency(quota.revenueAchieved)}</span>
                          <span>{formatCurrency(quota.revenueQuota)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No quotas assigned</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FORECASTING TAB */}
        <TabsContent value="forecasting" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Sales Forecasting</h2>
              <p className="text-sm text-muted-foreground">AI-powered revenue predictions</p>
            </div>
            <Button onClick={() => generateForecast.mutate({ period: new Date().toISOString().slice(0, 7), useAI: true })}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate Forecast
            </Button>
          </div>

          {/* Forecast Cards */}
          <div className="grid grid-cols-4 gap-4">
            {forecasts?.slice(0, 4).map((forecast: any) => (
              <Card key={forecast.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{forecast.forecastPeriod}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Commit</span>
                      <span className="text-sm font-medium">{formatCurrency(forecast.commitAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Best Case</span>
                      <span className="text-sm font-medium">{formatCurrency(forecast.bestCaseAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Pipeline</span>
                      <span className="text-sm font-medium">{formatCurrency(forecast.pipelineAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Weighted</span>
                      <span className="text-sm font-medium">{formatCurrency(forecast.weightedAmount)}</span>
                    </div>
                    {forecast.aiPredictedAmount && (
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Bot className="h-3 w-3" /> AI Predicted
                        </span>
                        <span className="text-sm font-bold text-blue-600">{formatCurrency(forecast.aiPredictedAmount)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!forecasts || forecasts.length === 0) && (
              <Card className="col-span-4">
                <CardContent className="py-8 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No forecasts generated</p>
                  <Button variant="outline" className="mt-4" onClick={() => generateForecast.mutate({ period: new Date().toISOString().slice(0, 7), useAI: true })}>
                    Generate First Forecast
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Forecast Accuracy */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Forecast Accuracy</CardTitle>
              <CardDescription>Historical accuracy of forecasts vs actuals</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Accuracy data will appear after periods close
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTELLIGENCE TAB - AI-Powered Deal Insights */}
        <TabsContent value="intelligence" className="space-y-6 mt-4">
          {/* AI Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-purple-600" /> Revenue Intelligence
              </h2>
              <p className="text-muted-foreground">AI-powered insights to close more deals</p>
            </div>
            <Button variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh Insights
            </Button>
          </div>

          {/* At Risk Deals */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" /> Deals at Risk
                  </CardTitle>
                  <CardDescription>Deals requiring immediate attention based on AI analysis</CardDescription>
                </div>
                <Badge variant="destructive">Action Required</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Example Risk Deal */}
                <div className="border rounded-lg p-4 bg-red-50/50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">Enterprise Platform Deal</h4>
                        <Badge className="bg-red-100 text-red-800">High Risk</Badge>
                        <span className="text-sm text-muted-foreground">$125,000</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Acme Corporation • Negotiation Stage</p>

                      {/* Risk Factors */}
                      <div className="flex gap-4 mt-3">
                        <div className="flex items-center gap-1 text-sm">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span>No activity in 14 days</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>Champion unresponsive</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>Competitor mentioned</span>
                        </div>
                      </div>

                      {/* AI Recommendation */}
                      <div className="mt-3 p-3 bg-white rounded border">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Bot className="h-4 w-4 text-purple-600" /> AI Recommendation
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Schedule an executive alignment call. The deal has stalled in negotiation.
                          Bring in your VP to re-engage the economic buyer and address competitor concerns.
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" className="gap-1">
                            <Phone className="h-3 w-3" /> Schedule Call
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1">
                            <Mail className="h-3 w-3" /> Send Re-engagement Email
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-red-600">72</div>
                      <p className="text-xs text-muted-foreground">Risk Score</p>
                    </div>
                  </div>
                </div>

                {/* More risk deals would be here */}
                <p className="text-center text-muted-foreground text-sm py-2">
                  Showing top at-risk deals. Use filters to view more.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Next Best Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" /> Next Best Actions
              </CardTitle>
              <CardDescription>AI-recommended actions to move deals forward</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Phone className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Call Sarah Johnson at TechCorp</p>
                      <p className="text-sm text-muted-foreground">Follow up on proposal sent 3 days ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>High Priority</Badge>
                    <Button size="sm">Take Action</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Users className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium">Engage decision maker at Globex Inc</p>
                      <p className="text-sm text-muted-foreground">Champion alone can't close - need executive buy-in</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Medium Priority</Badge>
                    <Button size="sm" variant="outline">View Deal</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Send className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">Send case study to MegaCorp</p>
                      <p className="text-sm text-muted-foreground">They mentioned needing proof of ROI in last call</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Medium Priority</Badge>
                    <Button size="sm" variant="outline">Send Now</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Call Intelligence */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5 text-green-500" /> Call Intelligence
              </CardTitle>
              <CardDescription>AI analysis of recent sales calls</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold">Discovery Call - DataFlow Inc</h4>
                      <p className="text-sm text-muted-foreground">Today at 2:30 PM • 32 min</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800">Score: 85</Badge>
                      <Badge className="bg-blue-100 text-blue-800">Positive</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-4">
                    <div className="text-center p-2 bg-muted rounded">
                      <p className="text-lg font-semibold">42%</p>
                      <p className="text-xs text-muted-foreground">Talk Ratio</p>
                    </div>
                    <div className="text-center p-2 bg-muted rounded">
                      <p className="text-lg font-semibold">12</p>
                      <p className="text-xs text-muted-foreground">Questions Asked</p>
                    </div>
                    <div className="text-center p-2 bg-muted rounded">
                      <p className="text-lg font-semibold">3</p>
                      <p className="text-xs text-muted-foreground">Next Steps</p>
                    </div>
                    <div className="text-center p-2 bg-muted rounded">
                      <p className="text-lg font-semibold">2</p>
                      <p className="text-xs text-muted-foreground">Buying Signals</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Decision maker was present and engaged</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Budget discussion initiated by prospect</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm">Competitor (Salesforce) mentioned - need battlecard</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BATTLECARDS TAB */}
        <TabsContent value="battlecards" className="space-y-6 mt-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Flag className="h-6 w-6 text-orange-600" /> Competitive Battlecards
              </h2>
              <p className="text-muted-foreground">Win against competitors with data-driven insights</p>
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add Battlecard
            </Button>
          </div>

          {/* Competitor Cards */}
          <div className="grid grid-cols-3 gap-6">
            {/* Competitor 1 */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Salesforce</CardTitle>
                  <Badge variant="destructive">Strong Competitor</Badge>
                </div>
                <CardDescription>Enterprise CRM Platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Win Rate Against:</span>
                    <span className="font-semibold text-green-600">62%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active Deals:</span>
                    <span className="font-semibold">8</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Deal Size:</span>
                    <span className="font-semibold">$85,000</span>
                  </div>

                  <div className="pt-2 border-t space-y-2">
                    <p className="text-sm font-medium">Key Differentiators:</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">Faster Implementation</Badge>
                      <Badge variant="outline" className="text-xs">Better UX</Badge>
                      <Badge variant="outline" className="text-xs">Lower TCO</Badge>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full">View Full Battlecard</Button>
                </div>
              </CardContent>
            </Card>

            {/* Competitor 2 */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">HubSpot</CardTitle>
                  <Badge variant="secondary">Moderate Threat</Badge>
                </div>
                <CardDescription>Marketing & Sales Platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Win Rate Against:</span>
                    <span className="font-semibold text-green-600">78%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active Deals:</span>
                    <span className="font-semibold">5</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Deal Size:</span>
                    <span className="font-semibold">$45,000</span>
                  </div>

                  <div className="pt-2 border-t space-y-2">
                    <p className="text-sm font-medium">Key Differentiators:</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">Enterprise Scale</Badge>
                      <Badge variant="outline" className="text-xs">Custom Workflows</Badge>
                      <Badge variant="outline" className="text-xs">AI Features</Badge>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full">View Full Battlecard</Button>
                </div>
              </CardContent>
            </Card>

            {/* Competitor 3 */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Pipedrive</CardTitle>
                  <Badge className="bg-green-100 text-green-800">Weak Competitor</Badge>
                </div>
                <CardDescription>SMB Sales Tool</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Win Rate Against:</span>
                    <span className="font-semibold text-green-600">89%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active Deals:</span>
                    <span className="font-semibold">2</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Deal Size:</span>
                    <span className="font-semibold">$25,000</span>
                  </div>

                  <div className="pt-2 border-t space-y-2">
                    <p className="text-sm font-medium">Key Differentiators:</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">Enterprise Ready</Badge>
                      <Badge variant="outline" className="text-xs">Advanced Analytics</Badge>
                      <Badge variant="outline" className="text-xs">Integrations</Badge>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full">View Full Battlecard</Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Content Library */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-5 w-5" /> Sales Content Library
                  </CardTitle>
                  <CardDescription>Battle-tested content to win deals</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> Add Content
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-blue-100 rounded">
                      <Briefcase className="h-4 w-4 text-blue-600" />
                    </div>
                    <span className="text-xs text-muted-foreground">Case Study</span>
                  </div>
                  <p className="font-medium text-sm">Enterprise ROI Analysis</p>
                  <p className="text-xs text-muted-foreground mt-1">Used 47 times • 72% conversion</p>
                </div>

                <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-green-100 rounded">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-xs text-muted-foreground">One Pager</span>
                  </div>
                  <p className="font-medium text-sm">Product Overview 2024</p>
                  <p className="text-xs text-muted-foreground mt-1">Used 128 times • 65% conversion</p>
                </div>

                <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-purple-100 rounded">
                      <PlayCircle className="h-4 w-4 text-purple-600" />
                    </div>
                    <span className="text-xs text-muted-foreground">Demo Video</span>
                  </div>
                  <p className="font-medium text-sm">Platform Walkthrough</p>
                  <p className="text-xs text-muted-foreground mt-1">Used 89 times • 81% conversion</p>
                </div>

                <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-amber-100 rounded">
                      <DollarSign className="h-4 w-4 text-amber-600" />
                    </div>
                    <span className="text-xs text-muted-foreground">ROI Calculator</span>
                  </div>
                  <p className="font-medium text-sm">Cost Savings Model</p>
                  <p className="text-xs text-muted-foreground mt-1">Used 34 times • 88% conversion</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateAutomationRuleDialog
        open={showNewRuleDialog}
        onOpenChange={setShowNewRuleDialog}
        onCreated={refetchRules}
      />
      <CreateSequenceDialog
        open={showNewSequenceDialog}
        onOpenChange={setShowNewSequenceDialog}
        onCreated={refetchSequences}
      />
    </div>
  );
}
