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
    onError: (err: any) => toast.error(err.message),
  });

  const initializeDefaultsMutation = (trpc.autonomousWorkflows.orchestrator as any).initializeDefaults?.useMutation({
    onSuccess: () => {
      workflowsQuery.refetch();
      toast.success("Default workflows initialized");
    },
    onError: (err: any) => toast.error(err.message),
  }) || { mutate: () => {}, isPending: false };

  const workflows = workflowsQuery.data ?? [];
  const thresholds = thresholdsQuery.data ?? [];
  const exceptionRules = exceptionRulesQuery.data ?? [];

  const getWorkflowTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
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
                        <Input id="name" className="col-span-3" placeholder="Workflow name" />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="type" className="text-right">Type</Label>
                        <Select>
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
                        <Select>
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
                        <Textarea id="description" className="col-span-3" placeholder="Describe the workflow..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateWorkflowOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">Create Workflow</Button>
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
                            <Badge variant="outline" className="text-green-600">Auto</Badge>
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
                            <span className={workflow.isActive ? "text-green-600" : "text-muted-foreground"}>
                              {workflow.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
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
                      <TableRow key={threshold.id}>
                        <TableCell className="font-medium">{threshold.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{threshold.entityType}</Badge>
                        </TableCell>
                        <TableCell>
                          {threshold.autoApproveMaxAmount ? (
                            <span className="text-green-600">
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
                <Button>
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
    </div>
  );
}
