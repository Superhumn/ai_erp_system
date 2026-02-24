import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Play,
  FileText,
  ShoppingCart,
  Mail,
  Package,
  Truck,
  DollarSign,
  RefreshCw,
  Bot,
  Eye,
  Loader2,
  ExternalLink,
  Users,
  Building2,
  Boxes,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const taskTypeIcons: Record<string, any> = {
  generate_po: ShoppingCart,
  send_rfq: FileText,
  send_quote_request: FileText,
  send_email: Mail,
  update_inventory: Package,
  create_shipment: Truck,
  generate_invoice: DollarSign,
  reconcile_payment: DollarSign,
  reorder_materials: Package,
  vendor_followup: Mail,
};

const taskTypeLabels: Record<string, string> = {
  generate_po: "Generate PO",
  send_rfq: "Send RFQ",
  send_quote_request: "Quote Request",
  send_email: "Send Email",
  update_inventory: "Update Inventory",
  create_shipment: "Create Shipment",
  generate_invoice: "Generate Invoice",
  reconcile_payment: "Reconcile Payment",
  reorder_materials: "Reorder Materials",
  vendor_followup: "Vendor Follow-up",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};

export default function ApprovalQueue() {
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  
  const utils = trpc.useUtils();
  
  const { data: pendingTasks, isLoading: pendingLoading } = trpc.aiAgent.tasks.pendingApprovals.useQuery();
  const { data: allTasks, isLoading: allLoading } = trpc.aiAgent.tasks.list.useQuery({});
  const { data: logs } = trpc.aiAgent.logs.list.useQuery({ limit: 50 });
  
  const approveMutation = trpc.aiAgent.tasks.approve.useMutation({
    onSuccess: () => {
      toast.success("Task approved successfully");
      utils.aiAgent.tasks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  
  const rejectMutation = trpc.aiAgent.tasks.reject.useMutation({
    onSuccess: () => {
      toast.success("Task rejected");
      utils.aiAgent.tasks.invalidate();
      setIsRejectDialogOpen(false);
      setRejectReason("");
    },
    onError: (err) => toast.error(err.message),
  });
  
  const executeMutation = trpc.aiAgent.tasks.execute.useMutation({
    onSuccess: () => {
      toast.success("Task executed successfully");
      utils.aiAgent.tasks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  
  const handleApprove = (taskId: number) => {
    approveMutation.mutate({ id: taskId });
  };
  
  const handleReject = (task: any) => {
    setSelectedTask(task);
    setIsRejectDialogOpen(true);
  };
  
  const confirmReject = () => {
    if (selectedTask) {
      rejectMutation.mutate({ id: selectedTask.id, reason: rejectReason });
    }
  };
  
  const handleExecute = (taskId: number) => {
    executeMutation.mutate({ id: taskId });
  };
  
  const renderTaskCard = (task: any, showActions = true) => {
    const Icon = taskTypeIcons[task.taskType] || Bot;
    let taskData: any = {};
    try {
      taskData = JSON.parse(task.taskData || "{}");
    } catch {}
    
    return (
      <Card key={task.id} className="mb-4">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{taskTypeLabels[task.taskType] || task.taskType}</h3>
                  <Badge className={priorityColors[task.priority]}>
                    {task.priority}
                  </Badge>
                  <Badge className={statusColors[task.status]}>
                    {task.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                
                {/* Task-specific details */}
                {task.taskType === "generate_po" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Vendor:</strong> {taskData.vendorId ? (
                      <Link href={`/operations/procurement-hub?tab=vendors&id=${taskData.vendorId}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        {taskData.vendorName || "Unknown"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (taskData.vendorName || "Unknown")}</p>
                    <p><strong>Material:</strong> {taskData.materialId ? (
                      <Link href={`/operations/procurement-hub?tab=materials&id=${taskData.materialId}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        {taskData.materialName || "Unknown"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (taskData.materialName || "Unknown")}</p>
                    <p><strong>Quantity:</strong> {taskData.quantity} | <strong>Total:</strong> {formatCurrency(taskData.totalAmount)}</p>
                    {taskData.expectedDate && <p><strong>Expected:</strong> {formatDate(taskData.expectedDate)}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/operations/procurement-hub?tab=orders&id=${JSON.parse(task.resultData).poId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          PO #{JSON.parse(task.resultData).poNumber}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "send_rfq" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Material:</strong> {taskData.materialId ? (
                      <Link href={`/operations/procurement-hub?tab=materials&id=${taskData.materialId}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        {taskData.materialName || "Unknown"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (taskData.materialName || "Unknown")}</p>
                    <p><strong>Quantity:</strong> {taskData.quantity}</p>
                    <p><strong>Vendors:</strong> {taskData.vendorIds?.length || 0} selected</p>
                  </div>
                )}
                
                {task.taskType === "send_email" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>To:</strong> {taskData.to || "Unknown"}</p>
                    <p><strong>Subject:</strong> {taskData.subject || "No subject"}</p>
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Sent:</strong>{" "}
                        <Link href="/operations/email-inbox?tab=sent" className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View in Sent Emails
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {/* Entity creation tasks with result links */}
                {task.taskType === "create_vendor" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Vendor Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.email && <p><strong>Email:</strong> {taskData.email}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/operations/procurement-hub?tab=vendors&id=${JSON.parse(task.resultData).vendorId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Vendor
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "create_material" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Material Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.sku && <p><strong>SKU:</strong> {taskData.sku}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/operations/procurement-hub?tab=materials&id=${JSON.parse(task.resultData).materialId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Material
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "create_product" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Product Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.sku && <p><strong>SKU:</strong> {taskData.sku}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/sales/products?id=${JSON.parse(task.resultData).productId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Product
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {task.taskType === "create_customer" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Customer Name:</strong> {taskData.name || "Unknown"}</p>
                    {taskData.email && <p><strong>Email:</strong> {taskData.email}</p>}
                    {task.resultData && (
                      <p className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <strong>Created:</strong>{" "}
                        <Link href={`/sales/customers?id=${JSON.parse(task.resultData).customerId}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
                          View Customer
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                
                {/* AI Reasoning */}
                {task.aiReasoning && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium">AI Reasoning</span>
                      {task.aiConfidence && (
                        <Badge variant="outline" className="text-xs">
                          {parseFloat(task.aiConfidence)}% confidence
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{task.aiReasoning}</p>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground mt-2">
                  Created: {formatDate(task.createdAt)}
                </p>
              </div>
            </div>
            
            {showActions && task.status === "pending_approval" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(task)}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApprove(task.id)}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  onClick={async () => {
                    await handleApprove(task.id);
                    setTimeout(() => handleExecute(task.id), 500);
                  }}
                  disabled={approveMutation.isPending || executeMutation.isPending}
                >
                  {(approveMutation.isPending || executeMutation.isPending) ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Approve & Execute
                </Button>
              </div>
            )}
            
            {showActions && task.status === "approved" && (
              <Button
                size="sm"
                onClick={() => handleExecute(task.id)}
                disabled={executeMutation.isPending}
              >
                {executeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                Execute
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };
  
  const pendingCount = pendingTasks?.length || 0;
  const approvedCount = allTasks?.filter((t: any) => t.status === "approved").length || 0;
  const completedCount = allTasks?.filter((t: any) => t.status === "completed").length || 0;
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Approval Queue</h1>
          <p className="text-muted-foreground">Review and approve AI-generated actions</p>
        </div>
        <Button variant="outline" onClick={() => utils.aiAgent.tasks.invalidate()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-100">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-sm text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100">
                <Play className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allTasks?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending Approval
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-yellow-500">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Tasks</TabsTrigger>
          <TabsTrigger value="logs">Activity Log</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-4">
          {pendingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingTasks?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-semibold">All caught up!</h3>
                <p className="text-muted-foreground">No tasks pending approval</p>
              </CardContent>
            </Card>
          ) : (
            pendingTasks?.map((task: any) => renderTaskCard(task))
          )}
        </TabsContent>
        
        <TabsContent value="all" className="mt-4">
          {allLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : allTasks?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No tasks yet</h3>
                <p className="text-muted-foreground">AI agent tasks will appear here</p>
              </CardContent>
            </Card>
          ) : (
            allTasks?.map((task: any) => renderTaskCard(task))
          )}
        </TabsContent>
        
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <CardTitle>Activity Log</CardTitle>
              <CardDescription>Recent AI agent activity</CardDescription>
            </CardHeader>
            <CardContent>
              {logs?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {logs?.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className={`p-1.5 rounded ${
                        log.status === "success" ? "bg-green-100" :
                        log.status === "error" ? "bg-red-100" :
                        log.status === "warning" ? "bg-yellow-100" :
                        "bg-blue-100"
                      }`}>
                        {log.status === "success" ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                         log.status === "error" ? <XCircle className="h-4 w-4 text-red-600" /> :
                         log.status === "warning" ? <AlertTriangle className="h-4 w-4 text-yellow-600" /> :
                         <Eye className="h-4 w-4 text-blue-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{log.action.replace(/_/g, " ")}</p>
                        <p className="text-sm text-muted-foreground">{log.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Task</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this task.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
