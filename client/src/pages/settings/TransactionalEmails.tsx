import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Send,
  Clock,
  Loader2,
  Eye,
  RotateCcw,
  Activity,
  FileText
} from "lucide-react";

const TEMPLATE_NAMES = [
  { value: "QUOTE", label: "Quote" },
  { value: "PO", label: "Purchase Order" },
  { value: "SHIPMENT", label: "Shipment" },
  { value: "ALERT", label: "Alert" },
  { value: "RFQ", label: "Request for Quote" },
  { value: "INVOICE", label: "Invoice" },
  { value: "PAYMENT_REMINDER", label: "Payment Reminder" },
  { value: "WELCOME", label: "Welcome" },
  { value: "GENERAL", label: "General" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "queued", label: "Queued" },
  { value: "sending", label: "Sending" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "bounced", label: "Bounced" },
  { value: "dropped", label: "Dropped" },
  { value: "failed", label: "Failed" },
  { value: "deferred", label: "Deferred" },
];

export default function TransactionalEmailsPage() {
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [viewingMessage, setViewingMessage] = useState<any>(null);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    providerTemplateId: "",
    description: "",
    defaultSubject: "",
    isActive: true,
  });
  const [messageFilters, setMessageFilters] = useState({
    status: "",
    templateName: "",
    toEmail: "",
  });

  // Queries
  const { data: status, refetch: refetchStatus } = trpc.transactionalEmail.getStatus.useQuery();
  const { data: stats, refetch: refetchStats } = trpc.transactionalEmail.getStats.useQuery();
  const { data: templates, refetch: refetchTemplates } = trpc.transactionalEmail.templates.list.useQuery();
  const { data: messages, refetch: refetchMessages } = trpc.transactionalEmail.messages.list.useQuery({
    status: messageFilters.status || undefined,
    templateName: messageFilters.templateName || undefined,
    toEmail: messageFilters.toEmail || undefined,
    limit: 50,
  });
  const { data: events } = trpc.transactionalEmail.events.list.useQuery({ limit: 50 });

  // Mutations
  const createTemplateMutation = trpc.transactionalEmail.templates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created successfully");
      setShowAddTemplate(false);
      setNewTemplate({ name: "", providerTemplateId: "", description: "", defaultSubject: "", isActive: true });
      refetchTemplates();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateTemplateMutation = trpc.transactionalEmail.templates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated successfully");
      setEditingTemplate(null);
      refetchTemplates();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteTemplateMutation = trpc.transactionalEmail.templates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted successfully");
      refetchTemplates();
    },
    onError: (error) => toast.error(error.message),
  });

  const retryMessageMutation = trpc.transactionalEmail.messages.retry.useMutation({
    onSuccess: () => {
      toast.success("Email queued for retry");
      refetchMessages();
    },
    onError: (error) => toast.error(error.message),
  });

  const processQueueMutation = trpc.transactionalEmail.processQueue.useMutation({
    onSuccess: (data) => {
      toast.success(`Processed ${data.processed} emails: ${data.successful} successful, ${data.failed} failed`);
      refetchMessages();
      refetchStats();
    },
    onError: (error) => toast.error(error.message),
  });

  const getStatusBadge = (messageStatus: string) => {
    switch (messageStatus) {
      case "delivered":
        return <Badge className="bg-primary/10 text-primary border-primary/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Delivered</Badge>;
      case "sent":
        return <Badge className="bg-muted text-foreground"><Send className="w-3 h-3 mr-1" /> Sent</Badge>;
      case "queued":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Queued</Badge>;
      case "sending":
        return <Badge className="bg-muted text-foreground font-semibold"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "bounced":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Bounced</Badge>;
      case "dropped":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Dropped</Badge>;
      case "deferred":
        return <Badge className="bg-muted text-foreground font-semibold"><Clock className="w-3 h-3 mr-1" /> Deferred</Badge>;
      default:
        return <Badge variant="outline">{messageStatus}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Transactional Emails</h1>
          <p className="text-muted-foreground mt-1">
            Manage SendGrid templates, view email logs, and monitor delivery
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { refetchStatus(); refetchStats(); refetchMessages(); refetchTemplates(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => processQueueMutation.mutate({})}>
            <Send className="w-4 h-4 mr-2" />
            Process Queue
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl font-display tabular-nums">{stats?.total || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Queued</CardDescription>
            <CardTitle className="text-2xl font-display tabular-nums">{stats?.queued || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent</CardDescription>
            <CardTitle className="text-2xl font-display tabular-nums">{stats?.sent || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Delivered</CardDescription>
            <CardTitle className="text-2xl font-display tabular-nums">{((stats as any)?.delivered) || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-2xl font-display tabular-nums">{stats?.failed || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bounced</CardDescription>
            <CardTitle className="text-2xl font-display tabular-nums">{((stats as any)?.bounced) || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Service Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${status?.configured ? 'bg-primary/10' : 'bg-muted'}`}>
                <Mail className={`w-5 h-5 ${status?.configured ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <CardTitle className="text-lg">Email Service Status</CardTitle>
                <CardDescription>SendGrid Configuration</CardDescription>
              </div>
            </div>
            {status?.configured ? (
              <Badge className="bg-primary/10 text-primary border-primary/20">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Configured
              </Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="w-3 h-3 mr-1" /> Not Configured
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              {status?.configDetails?.hasApiKey ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-foreground" />}
              <span>API Key</span>
            </div>
            <div className="flex items-center gap-2">
              {status?.configDetails?.hasFromEmail ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-foreground" />}
              <span>From Email</span>
            </div>
            <div className="flex items-center gap-2">
              {status?.configDetails?.hasReplyTo ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertCircle className="w-4 h-4 text-muted-foreground" />}
              <span>Reply-To (optional)</span>
            </div>
            <div className="flex items-center gap-2">
              {status?.configDetails?.hasWebhookSecret ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertCircle className="w-4 h-4 text-muted-foreground" />}
              <span>Webhook Secret (optional)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">
            <FileText className="w-4 h-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="w-4 h-4 mr-2" />
            Email Logs
          </TabsTrigger>
          <TabsTrigger value="events">
            <Clock className="w-4 h-4 mr-2" />
            Webhook Events
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Configure SendGrid dynamic template IDs for each email type
            </p>
            <Dialog open={showAddTemplate} onOpenChange={setShowAddTemplate}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Email Template</DialogTitle>
                  <DialogDescription>
                    Map a SendGrid dynamic template to an email type
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Template Type</Label>
                    <Select value={newTemplate.name} onValueChange={(v) => setNewTemplate({ ...newTemplate, name: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select template type" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_NAMES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>SendGrid Template ID</Label>
                    <Input
                      placeholder="d-xxxxxxxxxxxxxxxxx"
                      value={newTemplate.providerTemplateId}
                      onChange={(e) => setNewTemplate({ ...newTemplate, providerTemplateId: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Find this in SendGrid Dashboard &gt; Email API &gt; Dynamic Templates
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea
                      placeholder="What this template is used for..."
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Subject (optional)</Label>
                    <Input
                      placeholder="Fallback subject line"
                      value={newTemplate.defaultSubject}
                      onChange={(e) => setNewTemplate({ ...newTemplate, defaultSubject: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newTemplate.isActive}
                      onCheckedChange={(c) => setNewTemplate({ ...newTemplate, isActive: c })}
                    />
                    <Label>Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddTemplate(false)}>Cancel</Button>
                  <Button
                    onClick={() => createTemplateMutation.mutate(newTemplate as any)}
                    disabled={!newTemplate.name || !newTemplate.providerTemplateId}
                  >
                    Create Template
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>SendGrid Template ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No templates configured. Add a template to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  templates?.map((template: any) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">
                        {TEMPLATE_NAMES.find(t => t.value === template.name)?.label || template.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{template.providerTemplateId}</TableCell>
                      <TableCell className="max-w-xs truncate">{template.description}</TableCell>
                      <TableCell>
                        {template.isActive ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingTemplate(template)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this template?")) {
                                deleteTemplateMutation.mutate({ id: template.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Email Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label>Filter by Status</Label>
              <Select value={messageFilters.status} onValueChange={(v) => setMessageFilters({ ...messageFilters, status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <Label>Filter by Template</Label>
              <Select value={messageFilters.templateName} onValueChange={(v) => setMessageFilters({ ...messageFilters, templateName: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="All Templates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Templates</SelectItem>
                  {TEMPLATE_NAMES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <Label>Search by Email</Label>
              <Input
                placeholder="recipient@example.com"
                value={messageFilters.toEmail}
                onChange={(e) => setMessageFilters({ ...messageFilters, toEmail: e.target.value })}
              />
            </div>
            <Button variant="outline" onClick={() => refetchMessages()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No email messages found
                    </TableCell>
                  </TableRow>
                ) : (
                  messages?.map((message: any) => (
                    <TableRow key={message.id}>
                      <TableCell className="font-mono text-sm">{message.id}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{message.toName || message.toEmail || message.to}</div>
                          {message.toName && <div className="text-xs text-muted-foreground">{message.toEmail || message.to}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{message.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {TEMPLATE_NAMES.find(t => t.value === message.templateName)?.label || message.templateName || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(message.status)}</TableCell>
                      <TableCell className="text-sm">
                        {message.sentAt ? new Date(message.sentAt).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingMessage(message)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {message.status === "failed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => retryMessageMutation.mutate({ id: message.id })}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Webhook Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Webhook Events</CardTitle>
              <CardDescription>
                Events received from SendGrid webhooks (delivered, bounced, dropped, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Provider Message ID</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No webhook events received yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    events?.map((event: any) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Badge variant="outline">{event.providerEventType || event.eventType}</Badge>
                        </TableCell>
                        <TableCell>{event.email || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{event.providerMessageId}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm">{(event.metadata as any)?.reason || "-"}</TableCell>
                        <TableCell className="text-sm">
                          {event.providerTimestamp ? new Date(event.providerTimestamp).toLocaleString() : (event.createdAt ? new Date(event.createdAt).toLocaleString() : "-")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Update the SendGrid template configuration
            </DialogDescription>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template Type</Label>
                <Input value={TEMPLATE_NAMES.find(t => t.value === editingTemplate.name)?.label || editingTemplate.name} disabled />
              </div>
              <div className="space-y-2">
                <Label>SendGrid Template ID</Label>
                <Input
                  value={editingTemplate.providerTemplateId}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, providerTemplateId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingTemplate.description || ""}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Subject</Label>
                <Input
                  value={editingTemplate.defaultSubject || ""}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, defaultSubject: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingTemplate.isActive}
                  onCheckedChange={(c) => setEditingTemplate({ ...editingTemplate, isActive: c })}
                />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancel</Button>
            <Button onClick={() => updateTemplateMutation.mutate({
              id: editingTemplate.id,
              providerTemplateId: editingTemplate.providerTemplateId,
              description: editingTemplate.description,
              defaultSubject: editingTemplate.defaultSubject,
              isActive: editingTemplate.isActive,
            })}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Message Dialog */}
      <Dialog open={!!viewingMessage} onOpenChange={(open) => !open && setViewingMessage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
          </DialogHeader>
          {viewingMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">To</Label>
                  <p>{viewingMessage.toName ? `${viewingMessage.toName} <${viewingMessage.toEmail}>` : viewingMessage.toEmail}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">From</Label>
                  <p>{viewingMessage.fromName ? `${viewingMessage.fromName} <${viewingMessage.fromEmail}>` : viewingMessage.fromEmail}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Subject</Label>
                  <p>{viewingMessage.subject}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Template</Label>
                  <p>{TEMPLATE_NAMES.find(t => t.value === viewingMessage.templateName)?.label || viewingMessage.templateName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(viewingMessage.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Provider Message ID</Label>
                  <p className="font-mono text-sm">{viewingMessage.providerMessageId || "-"}</p>
                </div>
                {viewingMessage.relatedEntityType && (
                  <div>
                    <Label className="text-muted-foreground">Related Entity</Label>
                    <p>{viewingMessage.relatedEntityType} #{viewingMessage.relatedEntityId}</p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p>{new Date(viewingMessage.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {viewingMessage.payloadJson && (
                <div>
                  <Label className="text-muted-foreground">Template Payload</Label>
                  <pre className="mt-2 p-4 bg-muted rounded-lg text-sm overflow-auto max-h-48">
                    {JSON.stringify(viewingMessage.payloadJson, null, 2)}
                  </pre>
                </div>
              )}

              {viewingMessage.errorJson && (
                <div>
                  <Label className="text-foreground font-semibold">Error Details</Label>
                  <pre className="mt-2 p-4 bg-muted rounded-lg text-sm overflow-auto max-h-48 text-foreground">
                    {JSON.stringify(viewingMessage.errorJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingMessage(null)}>Close</Button>
            {viewingMessage?.status === "failed" && (
              <Button onClick={() => {
                retryMessageMutation.mutate({ id: viewingMessage.id });
                setViewingMessage(null);
              }}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry Send
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
