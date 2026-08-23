import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Settings2,
  Play,
  Pause,
  Clock,
  DollarSign,
  AlertTriangle,
  Users,
  Bot,
  Zap,
  Shield,
  Bell,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
} from "lucide-react";

export default function AutonomousSettings() {
  const [activeTab, setActiveTab] = useState("workflows");
  const [isCreateWorkflowOpen, setIsCreateWorkflowOpen] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: "",
    workflowType: "",
    triggerType: "manual" as "scheduled" | "event" | "threshold" | "manual" | "continuous",
    description: "",
  });
  const [editingWorkflowId, setEditingWorkflowId] = useState<number | null>(null);
  const [editingThresholdId, setEditingThresholdId] = useState<number | null>(null);
  const [editThreshold, setEditThreshold] = useState({
    autoApproveMaxAmount: "",
    level1MaxAmount: "",
    level2MaxAmount: "",
    level3MaxAmount: "",
  });
  const [isAddExceptionRuleOpen, setIsAddExceptionRuleOpen] = useState(false);
  const [newExceptionRule, setNewExceptionRule] = useState({
    name: "",
    description: "",
    exceptionType: "",
    resolutionStrategy: "human_review",
    priority: "5",
    resolveWithinMinutes: "60",
  });
  const [editWorkflow, setEditWorkflow] = useState({
    name: "",
    description: "",
    triggerType: "manual" as "scheduled" | "event" | "threshold" | "manual" | "continuous",
    cronSchedule: "",
    requiresApproval: false,
    autoApproveThreshold: "",
    escalationMinutes: "",
  });

  // Fetch workflows
  const workflowsQuery = trpc.autonomousWorkflows.workflows.list.useQuery();

  // Fetch approval thresholds
  const thresholdsQuery = trpc.autonomousWorkflows.config.thresholds.useQuery();

  // Fetch exception rules
  const exceptionRulesQuery = trpc.autonomousWorkflows.config.exceptionRules.useQuery();

  // Mutations
  const toggleWorkflowMutation = trpc.autonomousWorkflows.workflows.toggle.useMutation({
    onSuccess: () => {
      workflowsQuery.refetch();
      toast.success("Workflow updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const triggerWorkflowMutation = trpc.autonomousWorkflows.workflows.trigger.useMutation({
    onSuccess: () => {
      workflowsQuery.refetch();
      toast.success("Workflow run started");
    },
    onError: (err) => toast.error(err.message),
  });

  const initializeDefaultsMutation = trpc.autonomousWorkflows.orchestrator.initializeDefaults.useMutation({
    onSuccess: () => {
      workflowsQuery.refetch();
      toast.success("Default workflows initialized");
    },
    onError: (err) => toast.error(err.message),
  });

  const createWorkflowMutation = trpc.autonomousWorkflows.workflows.create.useMutation({
    onSuccess: () => {
      workflowsQuery.refetch();
      setIsCreateWorkflowOpen(false);
      setNewWorkflow({ name: "", workflowType: "", triggerType: "manual", description: "" });
      toast.success("Workflow created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateWorkflowMutation = trpc.autonomousWorkflows.workflows.update.useMutation({
    onSuccess: () => {
      workflowsQuery.refetch();
      setEditingWorkflowId(null);
      toast.success("Workflow updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateThresholdMutation = trpc.autonomousWorkflows.config.updateThreshold.useMutation({
    onSuccess: () => {
      thresholdsQuery.refetch();
      setEditingThresholdId(null);
      toast.success("Threshold updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createExceptionRuleMutation = trpc.autonomousWorkflows.config.createExceptionRule.useMutation({
    onSuccess: () => {
      exceptionRulesQuery.refetch();
      setIsAddExceptionRuleOpen(false);
      setNewExceptionRule({
        name: "",
        description: "",
        exceptionType: "",
        resolutionStrategy: "human_review",
        priority: "5",
        resolveWithinMinutes: "60",
      });
      toast.success("Exception rule created");
    },
    onError: (err) => toast.error(err.message),
  });

  const openEditWorkflow = (workflow: any) => {
    setEditingWorkflowId(workflow.id);
    setEditWorkflow({
      name: workflow.name || "",
      description: workflow.description || "",
      triggerType: (workflow.triggerType || "manual") as any,
      cronSchedule: workflow.cronSchedule || "",
      requiresApproval: !!workflow.requiresApproval,
      autoApproveThreshold: workflow.autoApproveThreshold != null ? String(workflow.autoApproveThreshold) : "",
      escalationMinutes: workflow.escalationMinutes != null ? String(workflow.escalationMinutes) : "",
    });
  };

  const workflows = workflowsQuery.data ?? [];
  const thresholds = thresholdsQuery.data ?? [];
  const exceptionRules = exceptionRulesQuery.data ?? [];

  const getWorkflowTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      // Supply Chain & Operations
      demand_forecasting: "Demand Forecasting",
      production_planning: "Production Planning",
      material_requirements: "Material Requirements",
      procurement: "Procurement",
      inventory_reorder: "Inventory Reorder",
      inventory_transfer: "Inventory Transfer",
      inventory_optimization: "Inventory Optimization",
      work_order_generation: "Work Order Generation",
      production_scheduling: "Production Scheduling",
      freight_procurement: "Freight Procurement",
      shipment_tracking: "Shipment Tracking",
      order_fulfillment: "Order Fulfillment",
      supplier_management: "Supplier Management",
      quality_inspection: "Quality Inspection",
      invoice_matching: "Invoice Matching",
      payment_processing: "Payment Processing",
      exception_handling: "Exception Handling",
      // Finance & Accounting
      revenue_recognition: "Revenue Recognition",
      expense_categorization: "Expense Categorization",
      bank_reconciliation: "Bank Reconciliation",
      financial_close: "Monthly Financial Close",
      ar_collections: "AR Collections Follow-Up",
      ap_processing: "AP Processing",
      tax_preparation: "Tax Preparation",
      // Sales & CRM
      lead_scoring: "Lead Scoring",
      deal_follow_up: "Deal Follow-Up",
      customer_onboarding: "Customer Onboarding",
      order_processing: "Sales Order Processing",
      quote_generation: "Quote Generation",
      churn_prevention: "Churn Prevention",
      // HR & People
      payroll_processing: "Payroll Processing",
      equity_vesting: "Equity Vesting Updates",
      onboarding_tasks: "Employee Onboarding",
      offboarding_tasks: "Employee Offboarding",
      performance_reviews: "Performance Review Reminders",
      time_tracking: "Time Tracking Enforcement",
      // Legal & Compliance
      contract_renewal: "Contract Renewal Tracking",
      compliance_monitoring: "Compliance Monitoring",
      nda_tracking: "NDA Expiration Tracking",
      dispute_escalation: "Dispute Auto-Escalation",
      // Communication & Reporting
      investor_update: "Investor Update Generation",
      kpi_reporting: "KPI Report Generation",
      email_triage: "Email Triage & Routing",
      meeting_prep: "Meeting Prep & Follow-Up",
      custom: "Custom",
    };
    return labels[type] || type;
  };

  const getTriggerTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      scheduled: "Scheduled",
      event: "Event-Driven",
      threshold: "Threshold",
      manual: "Manual",
      continuous: "Continuous",
    };
    return labels[type] || type;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Settings2 className="h-6 w-6" />
            Autonomous Workflow Settings
          </h1>
          <p className="text-muted-foreground">
            Configure autonomous supply chain workflows, approvals, and exception handling
          </p>
        </div>
        <Button onClick={() => initializeDefaultsMutation.mutate()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Initialize Defaults
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="workflows">
            <Bot className="h-4 w-4 mr-2" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="approvals">
            <Shield className="h-4 w-4 mr-2" />
            Approvals
          </TabsTrigger>
          <TabsTrigger value="exceptions">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Exceptions
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Alerts
          </TabsTrigger>
        </TabsList>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Workflow Definitions</CardTitle>
                  <CardDescription>
                    Configure which workflows run automatically and their schedules
                  </CardDescription>
                </div>
                <Dialog open={isCreateWorkflowOpen} onOpenChange={setIsCreateWorkflowOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Workflow
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New Workflow</DialogTitle>
                      <DialogDescription>
                        Define a new autonomous workflow for your supply chain
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input
                          id="name"
                          className="col-span-3"
                          placeholder="Workflow name"
                          value={newWorkflow.name}
                          onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="type" className="text-right">Type</Label>
                        <Select
                          value={newWorkflow.workflowType}
                          onValueChange={(v) => setNewWorkflow({ ...newWorkflow, workflowType: v })}
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select workflow type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inventory_reorder">Inventory Reorder</SelectItem>
                            <SelectItem value="procurement">Procurement</SelectItem>
                            <SelectItem value="demand_forecasting">Demand Forecasting</SelectItem>
                            <SelectItem value="production_planning">Production Planning</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="trigger" className="text-right">Trigger</Label>
                        <Select
                          value={newWorkflow.triggerType}
                          onValueChange={(v: "scheduled" | "event" | "threshold" | "manual" | "continuous") => setNewWorkflow({ ...newWorkflow, triggerType: v })}
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select trigger type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scheduled">Scheduled (Cron)</SelectItem>
                            <SelectItem value="event">Event-Driven</SelectItem>
                            <SelectItem value="threshold">Threshold-Based</SelectItem>
                            <SelectItem value="manual">Manual Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">Description</Label>
                        <Textarea
                          id="description"
                          className="col-span-3"
                          placeholder="Describe the workflow..."
                          value={newWorkflow.description}
                          onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateWorkflowOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        disabled={!newWorkflow.name || !newWorkflow.workflowType || createWorkflowMutation.isPending}
                        onClick={() => createWorkflowMutation.mutate({
                          name: newWorkflow.name,
                          workflowType: newWorkflow.workflowType,
                          triggerType: newWorkflow.triggerType,
                          description: newWorkflow.description || undefined,
                        })}
                      >
                        {createWorkflowMutation.isPending ? "Creating…" : "Create Workflow"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {workflowsQuery.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading workflows...</div>
              ) : workflows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No workflows configured yet.</p>
                  <p className="text-sm">Click "Initialize Defaults" to set up standard supply chain workflows.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflows.map((workflow: any) => (
                      <TableRow key={workflow.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{workflow.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {workflow.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getWorkflowTypeLabel(workflow.workflowType)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {workflow.triggerType === "scheduled" && <Clock className="h-3 w-3" />}
                            {workflow.triggerType === "event" && <Zap className="h-3 w-3" />}
                            {workflow.triggerType === "threshold" && <AlertTriangle className="h-3 w-3" />}
                            <span className="text-sm">{getTriggerTypeLabel(workflow.triggerType)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">
                            {workflow.cronSchedule || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {workflow.requiresApproval ? (
                            <Badge variant="secondary">
                              <Shield className="h-3 w-3 mr-1" />
                              Required
                            </Badge>
                          ) : workflow.autoApproveThreshold ? (
                            <Badge variant="outline">
                              <DollarSign className="h-3 w-3 mr-1" />
                              &lt; ${Number(workflow.autoApproveThreshold).toLocaleString()}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Auto</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={workflow.isActive}
                              onCheckedChange={() =>
                                toggleWorkflowMutation.mutate({
                                  id: workflow.id,
                                  isActive: !workflow.isActive
                                } as any)
                              }
                            />
                            <span className={workflow.isActive ? "text-primary" : "text-muted-foreground"}>
                              {workflow.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit workflow"
                              onClick={() => openEditWorkflow(workflow)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Run workflow"
                              disabled={!workflow.isActive || triggerWorkflowMutation.isPending}
                              onClick={() => triggerWorkflowMutation.mutate({ id: workflow.id })}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Approval Thresholds</CardTitle>
                  <CardDescription>
                    Configure automatic approval limits and escalation rules
                  </CardDescription>
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Threshold
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {thresholds.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No approval thresholds configured.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>Auto-Approve</TableHead>
                      <TableHead>Level 1</TableHead>
                      <TableHead>Level 2</TableHead>
                      <TableHead>Level 3</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {thresholds.map((threshold: any) => (
                      <TableRow
                        key={threshold.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setEditingThresholdId(threshold.id);
                          setEditThreshold({
                            autoApproveMaxAmount: threshold.autoApproveMaxAmount != null
                              ? String(threshold.autoApproveMaxAmount)
                              : "",
                            level1MaxAmount: threshold.level1MaxAmount != null
                              ? String(threshold.level1MaxAmount)
                              : "",
                            level2MaxAmount: threshold.level2MaxAmount != null
                              ? String(threshold.level2MaxAmount)
                              : "",
                            level3MaxAmount: threshold.level3MaxAmount != null
                              ? String(threshold.level3MaxAmount)
                              : "",
                          });
                        }}
                      >
                        <TableCell className="font-medium">{threshold.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{threshold.entityType}</Badge>
                        </TableCell>
                        <TableCell>
                          {threshold.autoApproveMaxAmount ? (
                            <span className="text-foreground">
                              ${Number(threshold.autoApproveMaxAmount).toLocaleString()}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {threshold.level1MaxAmount ? (
                            <span>${Number(threshold.level1MaxAmount).toLocaleString()}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {threshold.level2MaxAmount ? (
                            <span>${Number(threshold.level2MaxAmount).toLocaleString()}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {threshold.level3MaxAmount ? (
                            <span>${Number(threshold.level3MaxAmount).toLocaleString()}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={threshold.isActive ? "default" : "secondary"}>
                            {threshold.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Approval Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle>Global Approval Settings</CardTitle>
              <CardDescription>
                Configure default approval behavior for all workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default Escalation Time</Label>
                  <Select defaultValue="60">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                      <SelectItem value="480">8 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Auto-Approve Low Risk</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Switch defaultChecked />
                    <span className="text-sm text-muted-foreground">
                      Automatically approve items marked as low risk
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exceptions Tab */}
        <TabsContent value="exceptions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Exception Handling Rules</CardTitle>
                  <CardDescription>
                    Configure how the system handles supply chain exceptions
                  </CardDescription>
                </div>
                <Button onClick={() => setIsAddExceptionRuleOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {exceptionRules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No exception rules configured.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Exception Type</TableHead>
                      <TableHead>Resolution Strategy</TableHead>
                      <TableHead>Timeout</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exceptionRules.map((rule: any) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{rule.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {rule.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.exceptionType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            rule.resolutionStrategy === "auto_resolve" ? "default" :
                            rule.resolutionStrategy === "ai_decide" ? "secondary" :
                            "outline"
                          }>
                            {rule.resolutionStrategy.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rule.resolveWithinMinutes ? `${rule.resolveWithinMinutes} min` : "-"}
                        </TableCell>
                        <TableCell>{rule.priority}</TableCell>
                        <TableCell>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure how you receive alerts from autonomous workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Email Notifications</h4>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Approval Requests</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive email when approval is needed
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Critical Exceptions</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive email for critical supply chain issues
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Workflow Completions</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive email when workflows complete
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Daily Summary</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive daily digest of autonomous operations
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">In-App Notifications</h4>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Real-time Updates</Label>
                      <p className="text-sm text-muted-foreground">
                        Show notifications as workflows progress
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Sound Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Play sound for urgent notifications
                      </p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit workflow dialog */}
      <Dialog open={editingWorkflowId !== null} onOpenChange={(open) => { if (!open) setEditingWorkflowId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Workflow</DialogTitle>
            <DialogDescription>
              Update trigger schedule, approval rules, and escalation behavior.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editName" className="text-right">Name</Label>
              <Input
                id="editName"
                className="col-span-3"
                value={editWorkflow.name}
                onChange={(e) => setEditWorkflow({ ...editWorkflow, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editTrigger" className="text-right">Trigger</Label>
              <Select
                value={editWorkflow.triggerType}
                onValueChange={(v: "scheduled" | "event" | "threshold" | "manual" | "continuous") =>
                  setEditWorkflow({ ...editWorkflow, triggerType: v })
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled (Cron)</SelectItem>
                  <SelectItem value="event">Event-Driven</SelectItem>
                  <SelectItem value="threshold">Threshold-Based</SelectItem>
                  <SelectItem value="manual">Manual Only</SelectItem>
                  <SelectItem value="continuous">Continuous</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editWorkflow.triggerType === "scheduled" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editCron" className="text-right">Cron</Label>
                <Input
                  id="editCron"
                  className="col-span-3 font-mono"
                  placeholder="0 8 * * *"
                  value={editWorkflow.cronSchedule}
                  onChange={(e) => setEditWorkflow({ ...editWorkflow, cronSchedule: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editDescription" className="text-right">Description</Label>
              <Textarea
                id="editDescription"
                className="col-span-3"
                value={editWorkflow.description}
                onChange={(e) => setEditWorkflow({ ...editWorkflow, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editApproval" className="text-right">Requires Approval</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Switch
                  id="editApproval"
                  checked={editWorkflow.requiresApproval}
                  onCheckedChange={(v) => setEditWorkflow({ ...editWorkflow, requiresApproval: v })}
                />
                <span className="text-sm text-muted-foreground">
                  {editWorkflow.requiresApproval ? "Human review before each action" : "Auto-approve below threshold"}
                </span>
              </div>
            </div>
            {!editWorkflow.requiresApproval && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editThreshold" className="text-right">Auto-approve under</Label>
                <Input
                  id="editThreshold"
                  type="number"
                  className="col-span-3"
                  placeholder="$ amount"
                  value={editWorkflow.autoApproveThreshold}
                  onChange={(e) => setEditWorkflow({ ...editWorkflow, autoApproveThreshold: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editEscalation" className="text-right">Escalate after (min)</Label>
              <Input
                id="editEscalation"
                type="number"
                className="col-span-3"
                placeholder="e.g. 60"
                value={editWorkflow.escalationMinutes}
                onChange={(e) => setEditWorkflow({ ...editWorkflow, escalationMinutes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWorkflowId(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editWorkflow.name || updateWorkflowMutation.isPending}
              onClick={() => {
                if (editingWorkflowId === null) return;
                updateWorkflowMutation.mutate({
                  id: editingWorkflowId,
                  name: editWorkflow.name,
                  description: editWorkflow.description || undefined,
                  triggerType: editWorkflow.triggerType,
                  cronSchedule: editWorkflow.cronSchedule || undefined,
                  requiresApproval: editWorkflow.requiresApproval,
                  autoApproveThreshold: editWorkflow.autoApproveThreshold || undefined,
                  escalationMinutes: editWorkflow.escalationMinutes ? parseInt(editWorkflow.escalationMinutes) : undefined,
                });
              }}
            >
              {updateWorkflowMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit threshold dialog */}
      <Dialog open={editingThresholdId !== null} onOpenChange={(open) => { if (!open) setEditingThresholdId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit approval threshold</DialogTitle>
            <DialogDescription>
              Amounts are in dollars. Leave a level blank to skip it; requests above the highest
              configured level escalate to executives.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="thrAuto">Auto-approve up to</Label>
              <Input
                id="thrAuto"
                type="number"
                value={editThreshold.autoApproveMaxAmount}
                onChange={(e) => setEditThreshold({ ...editThreshold, autoApproveMaxAmount: e.target.value })}
                placeholder="$"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="thrL1" className="text-xs">Level 1 max</Label>
                <Input
                  id="thrL1"
                  type="number"
                  value={editThreshold.level1MaxAmount}
                  onChange={(e) => setEditThreshold({ ...editThreshold, level1MaxAmount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thrL2" className="text-xs">Level 2 max</Label>
                <Input
                  id="thrL2"
                  type="number"
                  value={editThreshold.level2MaxAmount}
                  onChange={(e) => setEditThreshold({ ...editThreshold, level2MaxAmount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thrL3" className="text-xs">Level 3 max</Label>
                <Input
                  id="thrL3"
                  type="number"
                  value={editThreshold.level3MaxAmount}
                  onChange={(e) => setEditThreshold({ ...editThreshold, level3MaxAmount: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingThresholdId(null)}>Cancel</Button>
            <Button
              disabled={updateThresholdMutation.isPending}
              onClick={() => {
                if (editingThresholdId === null) return;
                updateThresholdMutation.mutate({
                  id: editingThresholdId,
                  autoApproveMaxAmount: editThreshold.autoApproveMaxAmount || undefined,
                  level1MaxAmount: editThreshold.level1MaxAmount || undefined,
                  level2MaxAmount: editThreshold.level2MaxAmount || undefined,
                  level3MaxAmount: editThreshold.level3MaxAmount || undefined,
                });
              }}
            >
              {updateThresholdMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add exception rule dialog */}
      <Dialog open={isAddExceptionRuleOpen} onOpenChange={setIsAddExceptionRuleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add exception rule</DialogTitle>
            <DialogDescription>
              When the autonomous orchestrator encounters this exception type, follow this rule
              instead of escalating.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="exrName">Name *</Label>
              <Input
                id="exrName"
                value={newExceptionRule.name}
                onChange={(e) => setNewExceptionRule({ ...newExceptionRule, name: e.target.value })}
                placeholder="e.g. Auto-approve PO variance under 5%"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exrType">Exception type *</Label>
              <Input
                id="exrType"
                value={newExceptionRule.exceptionType}
                onChange={(e) => setNewExceptionRule({ ...newExceptionRule, exceptionType: e.target.value })}
                placeholder="e.g. po_variance, inventory_shortage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exrStrategy">Resolution strategy</Label>
              <Select
                value={newExceptionRule.resolutionStrategy}
                onValueChange={(v) => setNewExceptionRule({ ...newExceptionRule, resolutionStrategy: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_resolve">Auto resolve</SelectItem>
                  <SelectItem value="ai_decide">Let AI decide</SelectItem>
                  <SelectItem value="human_review">Human review</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exrPriority">Priority (1 = highest)</Label>
                <Input
                  id="exrPriority"
                  type="number"
                  value={newExceptionRule.priority}
                  onChange={(e) => setNewExceptionRule({ ...newExceptionRule, priority: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exrTimeout">Resolve within (min)</Label>
                <Input
                  id="exrTimeout"
                  type="number"
                  value={newExceptionRule.resolveWithinMinutes}
                  onChange={(e) => setNewExceptionRule({ ...newExceptionRule, resolveWithinMinutes: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exrDescription">Description</Label>
              <Textarea
                id="exrDescription"
                rows={2}
                value={newExceptionRule.description}
                onChange={(e) => setNewExceptionRule({ ...newExceptionRule, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddExceptionRuleOpen(false)}>Cancel</Button>
            <Button
              disabled={
                !newExceptionRule.name.trim() ||
                !newExceptionRule.exceptionType.trim() ||
                createExceptionRuleMutation.isPending
              }
              onClick={() => {
                createExceptionRuleMutation.mutate({
                  name: newExceptionRule.name.trim(),
                  description: newExceptionRule.description || undefined,
                  exceptionType: newExceptionRule.exceptionType.trim(),
                  resolutionStrategy: newExceptionRule.resolutionStrategy,
                  priority: parseInt(newExceptionRule.priority) || 5,
                  resolveWithinMinutes: newExceptionRule.resolveWithinMinutes
                    ? parseInt(newExceptionRule.resolveWithinMinutes)
                    : undefined,
                });
              }}
            >
              {createExceptionRuleMutation.isPending ? "Adding…" : "Add rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
