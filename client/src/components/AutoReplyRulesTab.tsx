import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Zap, Mail, RefreshCw } from "lucide-react";

// Mirrors the `email_category` enum in drizzle/schema.ts — the server rejects
// anything else, and the DB column would truncate it.
const categoryOptions = [
  { value: "receipt", label: "Receipt" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "invoice", label: "Invoice" },
  { value: "shipping_confirmation", label: "Shipping Confirmation" },
  { value: "freight_quote", label: "Freight Quote" },
  { value: "vendor_quote", label: "Vendor Quote" },
  { value: "delivery_notification", label: "Delivery Notification" },
  { value: "order_confirmation", label: "Order Confirmation" },
  { value: "payment_confirmation", label: "Payment Confirmation" },
  { value: "inventory_report", label: "Inventory Report" },
  { value: "hr_recruiting", label: "HR / Recruiting" },
  { value: "legal", label: "Legal" },
  { value: "general", label: "General" },
] as const;

type RuleCategory = (typeof categoryOptions)[number]["value"];

const toneOptions = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
];

interface RuleFormData {
  name: string;
  category: RuleCategory;
  replyTemplate: string;
  senderPattern: string;
  subjectPattern: string;
  bodyKeywords: string;
  minConfidence: string;
  replySubjectPrefix: string;
  tone: string;
  includeOriginal: boolean;
  delayMinutes: number;
  autoSend: boolean;
  createTask: boolean;
  notifyOwner: boolean;
  priority: number;
}

const defaultFormData: RuleFormData = {
  name: "",
  category: "general",
  replyTemplate: "",
  senderPattern: "",
  subjectPattern: "",
  bodyKeywords: "",
  minConfidence: "0.7",
  replySubjectPrefix: "Re:",
  tone: "professional",
  includeOriginal: true,
  delayMinutes: 0,
  autoSend: false,
  createTask: true,
  notifyOwner: false,
  priority: 0,
};

export function AutoReplyRulesTab() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData);

  const utils = trpc.useUtils();

  const { data: rules, isLoading } = trpc.emailScanning.getAutoReplyRules.useQuery({});

  const createRuleMutation = trpc.emailScanning.createAutoReplyRule.useMutation({
    onSuccess: () => {
      toast.success("Auto-reply rule created");
      setShowCreateDialog(false);
      setFormData(defaultFormData);
      utils.emailScanning.getAutoReplyRules.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to create rule: ${error.message}`);
    },
  });

  const updateRuleMutation = trpc.emailScanning.updateAutoReplyRule.useMutation({
    onSuccess: () => {
      toast.success("Auto-reply rule updated");
      setEditingRule(null);
      setFormData(defaultFormData);
      utils.emailScanning.getAutoReplyRules.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to update rule: ${error.message}`);
    },
  });

  const deleteRuleMutation = trpc.emailScanning.deleteAutoReplyRule.useMutation({
    onSuccess: () => {
      toast.success("Auto-reply rule deleted");
      utils.emailScanning.getAutoReplyRules.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete rule: ${error.message}`);
    },
  });

  const toggleRuleMutation = trpc.emailScanning.updateAutoReplyRule.useMutation({
    onSuccess: () => {
      utils.emailScanning.getAutoReplyRules.invalidate();
    },
  });

  const handleSubmit = () => {
    const data = {
      name: formData.name,
      category: formData.category,
      replyTemplate: formData.replyTemplate,
      senderPattern: formData.senderPattern || undefined,
      subjectPattern: formData.subjectPattern || undefined,
      bodyKeywords: formData.bodyKeywords ? formData.bodyKeywords.split(",").map(k => k.trim()) : undefined,
      minConfidence: formData.minConfidence,
      replySubjectPrefix: formData.replySubjectPrefix,
      tone: formData.tone as "professional" | "friendly" | "formal",
      includeOriginal: formData.includeOriginal,
      delayMinutes: formData.delayMinutes,
      autoSend: formData.autoSend,
      createTask: formData.createTask,
      notifyOwner: formData.notifyOwner,
      priority: formData.priority,
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule, ...data });
    } else {
      createRuleMutation.mutate(data);
    }
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule.id);
    setFormData({
      name: rule.name,
      category: rule.category,
      replyTemplate: rule.replyTemplate,
      senderPattern: rule.senderPattern || "",
      subjectPattern: rule.subjectPattern || "",
      bodyKeywords: Array.isArray(rule.bodyKeywords) ? rule.bodyKeywords.join(", ") : "",
      minConfidence: rule.minConfidence || "0.7",
      replySubjectPrefix: rule.replySubjectPrefix || "Re:",
      tone: rule.tone || "professional",
      includeOriginal: rule.includeOriginal ?? true,
      delayMinutes: rule.delayMinutes || 0,
      autoSend: rule.autoSend ?? false,
      createTask: rule.createTask ?? true,
      notifyOwner: rule.notifyOwner ?? false,
      priority: rule.priority || 0,
    });
    setShowCreateDialog(true);
  };

  const handleCloseDialog = () => {
    setShowCreateDialog(false);
    setEditingRule(null);
    setFormData(defaultFormData);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Auto-Reply Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure automatic email responses based on category and conditions
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !rules || rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Zap className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Auto-Reply Rules</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create rules to automatically respond to incoming emails
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule: any) => (
            <Card key={rule.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.isEnabled}
                      onCheckedChange={(checked) => 
                        toggleRuleMutation.mutate({ id: rule.id, isEnabled: checked })
                      }
                    />
                    <div>
                      <CardTitle className="text-base">{rule.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{rule.category}</Badge>
                        <Badge variant={rule.autoSend ? "default" : "secondary"}>
                          {rule.autoSend ? "Auto-send" : "Queue for approval"}
                        </Badge>
                        {rule.delayMinutes > 0 && (
                          <Badge variant="outline">{rule.delayMinutes}min delay</Badge>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="text-destructive"
                      onClick={() => deleteRuleMutation.mutate({ id: rule.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Tone:</span>{" "}
                    <span className="capitalize">{rule.tone}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Min Confidence:</span>{" "}
                    {Number(rule.minConfidence) * 100}%
                  </div>
                  {rule.senderPattern && (
                    <div>
                      <span className="text-muted-foreground">Sender Pattern:</span>{" "}
                      {rule.senderPattern}
                    </div>
                  )}
                  {rule.subjectPattern && (
                    <div>
                      <span className="text-muted-foreground">Subject Pattern:</span>{" "}
                      {rule.subjectPattern}
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Times Triggered:</span>{" "}
                    {rule.timesTriggered || 0}
                    {rule.lastTriggeredAt && (
                      <span className="text-muted-foreground ml-2">
                        (Last: {new Date(rule.lastTriggeredAt).toLocaleString()})
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Reply Template:</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                    {rule.replyTemplate}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Auto-Reply Rule" : "Create Auto-Reply Rule"}
            </DialogTitle>
            <DialogDescription>
              Configure when and how to automatically respond to emails
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Invoice Acknowledgment"
                />
              </div>
              <div className="space-y-2">
                <Label>Email Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value as RuleCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reply Template *</Label>
              <Textarea
                value={formData.replyTemplate}
                onChange={(e) => setFormData({ ...formData, replyTemplate: e.target.value })}
                placeholder="Thank you for your email regarding {{subject}}. We have received your {{category}} and will process it shortly..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Use placeholders: {"{{subject}}"}, {"{{sender}}"}, {"{{category}}"}, {"{{date}}"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sender Pattern (optional)</Label>
                <Input
                  value={formData.senderPattern}
                  onChange={(e) => setFormData({ ...formData, senderPattern: e.target.value })}
                  placeholder="e.g., *@vendor.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Subject Pattern (optional)</Label>
                <Input
                  value={formData.subjectPattern}
                  onChange={(e) => setFormData({ ...formData, subjectPattern: e.target.value })}
                  placeholder="e.g., *invoice*"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Body Keywords (comma-separated)</Label>
                <Input
                  value={formData.bodyKeywords}
                  onChange={(e) => setFormData({ ...formData, bodyKeywords: e.target.value })}
                  placeholder="e.g., payment, due, invoice"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Confidence</Label>
                <Select
                  value={formData.minConfidence}
                  onValueChange={(value) => setFormData({ ...formData, minConfidence: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">50%</SelectItem>
                    <SelectItem value="0.6">60%</SelectItem>
                    <SelectItem value="0.7">70%</SelectItem>
                    <SelectItem value="0.8">80%</SelectItem>
                    <SelectItem value="0.9">90%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tone</Label>
                <Select
                  value={formData.tone}
                  onValueChange={(value) => setFormData({ ...formData, tone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {toneOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject Prefix</Label>
                <Input
                  value={formData.replySubjectPrefix}
                  onChange={(e) => setFormData({ ...formData, replySubjectPrefix: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Delay (minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.delayMinutes}
                  onChange={(e) => setFormData({ ...formData, delayMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-3 border rounded-lg p-4">
              <h4 className="font-medium">Actions</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <Label>Auto-send reply</Label>
                  <Switch
                    checked={formData.autoSend}
                    onCheckedChange={(checked) => setFormData({ ...formData, autoSend: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Include original email</Label>
                  <Switch
                    checked={formData.includeOriginal}
                    onCheckedChange={(checked) => setFormData({ ...formData, includeOriginal: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Create AI task</Label>
                  <Switch
                    checked={formData.createTask}
                    onCheckedChange={(checked) => setFormData({ ...formData, createTask: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Notify owner</Label>
                  <Switch
                    checked={formData.notifyOwner}
                    onCheckedChange={(checked) => setFormData({ ...formData, notifyOwner: checked })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || !formData.replyTemplate || createRuleMutation.isPending || updateRuleMutation.isPending}
            >
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
