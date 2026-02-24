import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AutoReplyRulesTab } from "@/components/AutoReplyRulesTab";
import { SentEmailsTab } from "@/components/SentEmailsTab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { 
import { AITriggerButton } from "@/components/FloatingAIAssistant";
  Mail, 
  FileText, 
  Plus, 
  RefreshCw, 
  Check, 
  X, 
  Eye,
  Building2,
  Receipt,
  Truck,
  Package,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Archive,
  Ship,
  CreditCard,
  ShoppingCart,
  FileCheck,
  Tag,
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
  Inbox,
  Settings,
  Loader2,
  Zap,
  Reply,
  Sparkles,
  Send,
  Trash2,
  FolderOpen,
  Users,
  Factory,
  MoreHorizontal
} from "lucide-react";

// Category display configuration
const categoryConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  receipt: { label: "Receipt", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: <Receipt className="h-3 w-3" /> },
  purchase_order: { label: "Purchase Order", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: <Package className="h-3 w-3" /> },
  invoice: { label: "Invoice", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", icon: <FileText className="h-3 w-3" /> },
  shipping_confirmation: { label: "Shipping", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: <Truck className="h-3 w-3" /> },
  freight_quote: { label: "Freight Quote", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200", icon: <Ship className="h-3 w-3" /> },
  delivery_notification: { label: "Delivery", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  order_confirmation: { label: "Order Confirm", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200", icon: <ShoppingCart className="h-3 w-3" /> },
  payment_confirmation: { label: "Payment", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200", icon: <CreditCard className="h-3 w-3" /> },
  general: { label: "General", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200", icon: <Mail className="h-3 w-3" /> },
};

// Priority display configuration
const priorityConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  high: { label: "High", color: "text-red-600", icon: <ArrowUpCircle className="h-3 w-3" /> },
  medium: { label: "Medium", color: "text-yellow-600", icon: <MinusCircle className="h-3 w-3" /> },
  low: { label: "Low", color: "text-green-600", icon: <ArrowDownCircle className="h-3 w-3" /> },
};

export default function EmailInbox() {
  const [activeTab, setActiveTab] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<number | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>("all");
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [selectedEmails, setSelectedEmails] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state for manual email submission
  const [emailForm, setEmailForm] = useState({
    fromEmail: "",
    fromName: "",
    subject: "",
    bodyText: "",
  });

  // Inbox scan state
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanConfig, setScanConfig] = useState({
    host: "",
    port: 993,
    user: "",
    password: "",
    folder: "INBOX",
    limit: 50,
    unseenOnly: true,
    markAsSeen: false,
    fullAiParsing: false,
  });
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  // Approval options
  // AI Reply state
  const [showAiReplyDialog, setShowAiReplyDialog] = useState(false);
  const [generatedReply, setGeneratedReply] = useState<{
    subject: string;
    body: string;
    tone: string;
    confidence: number;
    suggestedActions?: string[];
  } | null>(null);
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);

  const [approvalOptions, setApprovalOptions] = useState({
    createVendor: false,
    createTransaction: false,
  });

  const utils = trpc.useUtils();

  // Build query params for email list
  const emailQueryParams = {
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(categoryFilter !== "all" && { category: categoryFilter }),
    ...(priorityFilter !== "all" && { priority: priorityFilter }),
  };

  // Queries
  const { data: emails, isLoading: emailsLoading } = trpc.emailScanning.list.useQuery(
    Object.keys(emailQueryParams).length > 0 ? emailQueryParams : undefined
  );
  
  const { data: emailDetail } = trpc.emailScanning.getById.useQuery(
    { id: selectedEmail! },
    { enabled: !!selectedEmail }
  );

  const { data: documents, isLoading: documentsLoading } = trpc.emailScanning.getDocuments.useQuery(
    documentTypeFilter !== "all" ? { documentType: documentTypeFilter } : undefined
  );

  const { data: documentDetail } = trpc.emailScanning.getDocument.useQuery(
    { id: selectedDocument! },
    { enabled: !!selectedDocument }
  );

  const { data: stats } = trpc.emailScanning.getStats.useQuery();
  const { data: categoryStats } = trpc.emailScanning.getCategoryStats.useQuery();

  // Mutations
  const submitEmailMutation = trpc.emailScanning.submitEmail.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Email parsed successfully! Found ${result.documents.length} document(s)`);
        setShowSubmitDialog(false);
        setEmailForm({ fromEmail: "", fromName: "", subject: "", bodyText: "" });
        utils.emailScanning.list.invalidate();
        utils.emailScanning.getStats.invalidate();
        utils.emailScanning.getCategoryStats.invalidate();
      } else {
        toast.error(`Parsing failed: ${result.error}`);
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const approveDocumentMutation = trpc.emailScanning.approveDocument.useMutation({
    onSuccess: () => {
      toast.success("Document approved successfully");
      setShowApproveDialog(false);
      setSelectedDocument(null);
      utils.emailScanning.getDocuments.invalidate();
      utils.emailScanning.getStats.invalidate();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const rejectDocumentMutation = trpc.emailScanning.rejectDocument.useMutation({
    onSuccess: () => {
      toast.success("Document rejected");
      setSelectedDocument(null);
      utils.emailScanning.getDocuments.invalidate();
      utils.emailScanning.getStats.invalidate();
    },
  });

  const reparseEmailMutation = trpc.emailScanning.reparseEmail.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Reparsed successfully! Found ${result.documentsFound} document(s)`);
        utils.emailScanning.list.invalidate();
        utils.emailScanning.getDocuments.invalidate();
        utils.emailScanning.getCategoryStats.invalidate();
      } else {
        toast.error(`Reparse failed: ${result.error}`);
      }
    },
  });

  const archiveEmailMutation = trpc.emailScanning.archiveEmail.useMutation({
    onSuccess: () => {
      toast.success("Email archived");
      setSelectedEmail(null);
      setSelectedEmails(new Set());
      utils.emailScanning.list.invalidate();
    },
  });

  const deleteEmailMutation = trpc.emailScanning.deleteEmail.useMutation({
    onSuccess: () => {
      toast.success("Email deleted");
      setSelectedEmail(null);
      setSelectedEmails(new Set());
      setShowDeleteConfirm(false);
      utils.emailScanning.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  // Inbox scanning queries and mutations
  const { data: inboxConfig } = trpc.emailScanning.isInboxConfigured.useQuery();

  const scanInboxMutation = trpc.emailScanning.scanInbox.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `Inbox scanned! Imported ${result.imported} emails, skipped ${result.skipped} duplicates.`
        );
        setShowScanDialog(false);
        utils.emailScanning.list.invalidate();
        utils.emailScanning.getStats.invalidate();
        utils.emailScanning.getCategoryStats.invalidate();
      } else {
        toast.error(`Scan failed: ${result.error}`);
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const testConnectionMutation = trpc.emailScanning.testInboxConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Connected! Found ${result.mailboxes?.length || 0} mailboxes.`);
      } else {
        toast.error(`Connection failed: ${result.error}`);
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const bulkCategorizeMutation = trpc.emailScanning.bulkCategorize.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Categorized ${result.categorized} of ${result.total} emails.`);
        utils.emailScanning.list.invalidate();
        utils.emailScanning.getCategoryStats.invalidate();
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // AI Email Reply mutations
  const generateReplyMutation = trpc.aiAgent.generateEmailReply.useMutation({
    onSuccess: (result) => {
      setGeneratedReply(result);
      setShowAiReplyDialog(true);
      setIsGeneratingReply(false);
    },
    onError: (error) => {
      toast.error(`Failed to generate reply: ${error.message}`);
      setIsGeneratingReply(false);
    },
  });

  const sendReplyMutation = trpc.aiAgent.sendEmailReply.useMutation({
    onSuccess: (result) => {
      if (result.emailSent) {
        toast.success("Email reply sent successfully!");
        setShowAiReplyDialog(false);
        setGeneratedReply(null);
      } else {
        toast.error("Failed to send email reply");
      }
    },
    onError: (error) => {
      toast.error(`Error sending reply: ${error.message}`);
    },
  });

  const createReplyTaskMutation = trpc.aiAgent.createEmailReplyTask.useMutation({
    onSuccess: () => {
      toast.success("Email reply task created for approval");
      setShowAiReplyDialog(false);
      setGeneratedReply(null);
    },
    onError: (error) => {
      toast.error(`Error creating task: ${error.message}`);
    },
  });

  // Handle AI reply generation
  const handleGenerateAiReply = async () => {
    if (!emailDetail) return;
    setIsGeneratingReply(true);
    generateReplyMutation.mutate({
      originalEmail: {
        from: emailDetail.fromEmail,
        subject: emailDetail.subject || '',
        body: emailDetail.bodyText || '',
        emailId: emailDetail.id,
      },
    });
  };

  // Handle sending the AI-generated reply
  const handleSendReply = (autoSend: boolean) => {
    if (!emailDetail || !generatedReply) return;
    
    if (autoSend) {
      sendReplyMutation.mutate({
        originalEmail: {
          from: emailDetail.fromEmail,
          subject: emailDetail.subject || '',
          body: emailDetail.bodyText || '',
          emailId: emailDetail.id,
        },
        autoSend: true,
      });
    } else {
      // Create task for approval queue
      createReplyTaskMutation.mutate({
        to: emailDetail.fromEmail,
        originalSubject: emailDetail.subject || '',
        originalBody: emailDetail.bodyText || '',
        emailId: emailDetail.id,
        priority: emailDetail.priority === 'high' ? 'high' : 'medium',
      });
    }
  };

  // IMAP presets
  const imapPresets: Record<string, { host: string; port: number }> = {
    gmail: { host: "imap.gmail.com", port: 993 },
    outlook: { host: "outlook.office365.com", port: 993 },
    yahoo: { host: "imap.mail.yahoo.com", port: 993 },
    icloud: { host: "imap.mail.me.com", port: 993 },
  };

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset && imapPresets[preset]) {
      setScanConfig(prev => ({
        ...prev,
        host: imapPresets[preset].host,
        port: imapPresets[preset].port,
      }));
    }
  };

  const handleScanInbox = () => {
    if (!scanConfig.host || !scanConfig.user || !scanConfig.password) {
      toast.error("Please fill in all connection details");
      return;
    }
    scanInboxMutation.mutate(scanConfig);
  };

  const handleTestConnection = () => {
    if (!scanConfig.host || !scanConfig.user || !scanConfig.password) {
      toast.error("Please fill in all connection details");
      return;
    }
    testConnectionMutation.mutate({
      host: scanConfig.host,
      port: scanConfig.port,
      secure: true,
      user: scanConfig.user,
      password: scanConfig.password,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "processing":
        return <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Processing</Badge>;
      case "parsed":
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Parsed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      case "archived":
        return <Badge variant="outline" className="gap-1"><Archive className="h-3 w-3" /> Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryBadge = (category: string | null) => {
    const config = categoryConfig[category || "general"] || categoryConfig.general;
    return (
      <Badge variant="outline" className={`gap-1 ${config.color}`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const getPriorityIndicator = (priority: string | null) => {
    const config = priorityConfig[priority || "medium"] || priorityConfig.medium;
    return (
      <span className={`flex items-center gap-1 text-xs ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case "receipt":
        return <Receipt className="h-4 w-4" />;
      case "invoice":
        return <FileText className="h-4 w-4" />;
      case "purchase_order":
        return <Package className="h-4 w-4" />;
      case "shipping_notice":
        return <Truck className="h-4 w-4" />;
      case "freight_quote":
        return <Ship className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const handleSubmitEmail = () => {
    if (!emailForm.fromEmail || !emailForm.subject || !emailForm.bodyText) {
      toast.error("Please fill in all required fields");
      return;
    }
    submitEmailMutation.mutate(emailForm);
  };

  const handleApproveDocument = () => {
    if (!selectedDocument) return;
    approveDocumentMutation.mutate({
      id: selectedDocument,
      createVendor: approvalOptions.createVendor,
      createTransaction: approvalOptions.createTransaction,
    });
  };

  return (
    <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Email Inbox</h1>
            <p className="text-muted-foreground">
              Scan emails for receipts, invoices, and shipping documents with AI auto-categorization
            </p>
          </div>
          <div className="flex gap-2">
            {/* Scan Inbox Button */}
            <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Inbox className="h-4 w-4" />
                  Scan Inbox
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Scan Email Inbox</DialogTitle>
                  <DialogDescription>
                    Connect to your email inbox via IMAP to automatically import and categorize all emails.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Email Provider Preset */}
                  <div className="space-y-2">
                    <Label>Email Provider</Label>
                    <Select value={selectedPreset} onValueChange={handlePresetChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider or enter custom" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gmail">Gmail</SelectItem>
                        <SelectItem value="outlook">Outlook / Office 365</SelectItem>
                        <SelectItem value="yahoo">Yahoo Mail</SelectItem>
                        <SelectItem value="icloud">iCloud Mail</SelectItem>
                        <SelectItem value="custom">Custom IMAP Server</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* IMAP Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="imapHost">IMAP Host</Label>
                      <Input
                        id="imapHost"
                        placeholder="imap.gmail.com"
                        value={scanConfig.host}
                        onChange={(e) => setScanConfig({ ...scanConfig, host: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imapPort">Port</Label>
                      <Input
                        id="imapPort"
                        type="number"
                        value={scanConfig.port}
                        onChange={(e) => setScanConfig({ ...scanConfig, port: parseInt(e.target.value) || 993 })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="imapUser">Email / Username</Label>
                      <Input
                        id="imapUser"
                        placeholder="you@gmail.com"
                        value={scanConfig.user}
                        onChange={(e) => setScanConfig({ ...scanConfig, user: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imapPassword">Password / App Password</Label>
                      <Input
                        id="imapPassword"
                        type="password"
                        placeholder="••••••••"
                        value={scanConfig.password}
                        onChange={(e) => setScanConfig({ ...scanConfig, password: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Scan Options */}
                  <div className="space-y-3 border-t pt-4">
                    <Label className="text-sm font-medium">Scan Options</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="folder">Folder</Label>
                        <Input
                          id="folder"
                          value={scanConfig.folder}
                          onChange={(e) => setScanConfig({ ...scanConfig, folder: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="limit">Max Emails</Label>
                        <Input
                          id="limit"
                          type="number"
                          value={scanConfig.limit}
                          onChange={(e) => setScanConfig({ ...scanConfig, limit: parseInt(e.target.value) || 50 })}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="unseenOnly"
                          checked={scanConfig.unseenOnly}
                          onCheckedChange={(checked) => setScanConfig({ ...scanConfig, unseenOnly: !!checked })}
                        />
                        <Label htmlFor="unseenOnly" className="text-sm">Only unread emails</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="markAsSeen"
                          checked={scanConfig.markAsSeen}
                          onCheckedChange={(checked) => setScanConfig({ ...scanConfig, markAsSeen: !!checked })}
                        />
                        <Label htmlFor="markAsSeen" className="text-sm">Mark as read after scanning</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="fullAiParsing"
                          checked={scanConfig.fullAiParsing}
                          onCheckedChange={(checked) => setScanConfig({ ...scanConfig, fullAiParsing: !!checked })}
                        />
                        <Label htmlFor="fullAiParsing" className="text-sm">Full AI parsing (slower, more accurate)</Label>
                      </div>
                    </div>
                  </div>

                  {/* Gmail/Outlook Note */}
                  {(selectedPreset === "gmail" || selectedPreset === "outlook") && (
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950 p-3 text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-200">Note for {selectedPreset === "gmail" ? "Gmail" : "Outlook"}:</p>
                      <p className="text-amber-700 dark:text-amber-300 mt-1">
                        {selectedPreset === "gmail" 
                          ? "Use an App Password instead of your regular password. Go to Google Account → Security → 2-Step Verification → App passwords."
                          : "You may need to enable IMAP access in Outlook settings and use an App Password if 2FA is enabled."}
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={handleTestConnection} disabled={testConnectionMutation.isPending}>
                    {testConnectionMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                    ) : (
                      <><Settings className="h-4 w-4 mr-2" /> Test Connection</>
                    )}
                  </Button>
                  <Button onClick={handleScanInbox} disabled={scanInboxMutation.isPending}>
                    {scanInboxMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                    ) : (
                      <><Inbox className="h-4 w-4 mr-2" /> Scan Inbox</>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Bulk Categorize Button */}
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => bulkCategorizeMutation.mutate({ useAi: false, limit: 100 })}
              disabled={bulkCategorizeMutation.isPending}
            >
              {bulkCategorizeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Categorizing...</>
              ) : (
                <><Zap className="h-4 w-4" /> Auto-Categorize</>
              )}
            </Button>

            {/* Submit Email Button */}
            <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Submit Email
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Submit Email for Parsing</DialogTitle>
                <DialogDescription>
                  Paste or forward an email to extract receipts, invoices, and shipping information. 
                  The AI will automatically categorize the email.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">From Email *</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      placeholder="vendor@example.com"
                      value={emailForm.fromEmail}
                      onChange={(e) => setEmailForm({ ...emailForm, fromEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromName">From Name</Label>
                    <Input
                      id="fromName"
                      placeholder="Vendor Name"
                      value={emailForm.fromName}
                      onChange={(e) => setEmailForm({ ...emailForm, fromName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    placeholder="Invoice #12345 from ABC Supplies"
                    value={emailForm.subject}
                    onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bodyText">Email Body *</Label>
                  <Textarea
                    id="bodyText"
                    placeholder="Paste the email content here..."
                    rows={10}
                    value={emailForm.bodyText}
                    onChange={(e) => setEmailForm({ ...emailForm, bodyText: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmitEmail} disabled={submitEmailMutation.isPending}>
                  {submitEmailMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Parse Email
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.documents || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pending || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Parsed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.parsed || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Priority</CardTitle>
              <ArrowUpCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {categoryStats?.priorities?.find(p => p.priority === "high")?.count || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Distribution */}
        {categoryStats && categoryStats.categories && categoryStats.categories.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Email Categories
              </CardTitle>
              <AITriggerButton message="Analyze our emails - categorize messages, identify urgent items, suggest replies, and summarize key communications" label="AI Email Assistant" />
            </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {categoryStats.categories.map((cat) => {
                  const config = categoryConfig[cat.category] || categoryConfig.general;
                  return (
                    <Badge 
                      key={cat.category} 
                      variant="outline" 
                      className={`gap-1 cursor-pointer hover:opacity-80 ${config.color} ${
                        categoryFilter === cat.category ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setCategoryFilter(categoryFilter === cat.category ? "all" : cat.category)}
                    >
                      {config.icon}
                      {config.label}: {cat.count}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="inbox" className="gap-2">
              <Mail className="h-4 w-4" />
              Inbox
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="h-4 w-4" />
              Parsed Documents
            </TabsTrigger>
            <TabsTrigger value="auto-reply" className="gap-2">
              <Zap className="h-4 w-4" />
              Auto-Reply Rules
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Send className="h-4 w-4" />
              Sent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="space-y-4">
            {/* Smart Folders */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant={activeFolder === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActiveFolder("all"); setCategoryFilter("all"); }}
              >
                <Inbox className="h-4 w-4 mr-1" />
                All
              </Button>
              <Button
                variant={activeFolder === "sales" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActiveFolder("sales"); setCategoryFilter("purchase_order"); }}
              >
                <Users className="h-4 w-4 mr-1" />
                Sales
              </Button>
              <Button
                variant={activeFolder === "raw_materials" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActiveFolder("raw_materials"); setCategoryFilter("invoice"); }}
              >
                <Package className="h-4 w-4 mr-1" />
                Raw Materials
              </Button>
              <Button
                variant={activeFolder === "copackers" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActiveFolder("copackers"); setCategoryFilter("receipt"); }}
              >
                <Factory className="h-4 w-4 mr-1" />
                Copackers
              </Button>
              <Button
                variant={activeFolder === "freight" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActiveFolder("freight"); setCategoryFilter("shipping_confirmation"); }}
              >
                <Truck className="h-4 w-4 mr-1" />
                Freight
              </Button>
              <Button
                variant={activeFolder === "archived" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActiveFolder("archived"); setStatusFilter("archived"); }}
              >
                <Archive className="h-4 w-4 mr-1" />
                Archived
              </Button>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="parsed">Parsed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="purchase_order">Purchase Order</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="shipping_confirmation">Shipping</SelectItem>
                  <SelectItem value="freight_quote">Freight Quote</SelectItem>
                  <SelectItem value="delivery_notification">Delivery</SelectItem>
                  <SelectItem value="order_confirmation">Order Confirm</SelectItem>
                  <SelectItem value="payment_confirmation">Payment</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setCategoryFilter("all");
                  setPriorityFilter("all");
                }}
              >
                Clear Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  utils.emailScanning.list.invalidate();
                  utils.emailScanning.getCategoryStats.invalidate();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Email List */}
              <Card>
                <CardHeader>
                  <CardTitle>Emails</CardTitle>
                  <CardDescription>
                    {emails?.length || 0} email(s) in inbox
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {emailsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : emails?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No emails yet</p>
                      <p className="text-sm">Submit an email to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {emails?.map((email: any) => (
                        <div
                          key={email.id}
                          className={`p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                            selectedEmail === email.id ? "border-primary bg-accent" : ""
                          }`}
                          onClick={() => setSelectedEmail(email.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{email.subject || "(No subject)"}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {email.fromName || email.fromEmail}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {getStatusBadge(email.parsingStatus)}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              {getCategoryBadge(email.category)}
                              {getPriorityIndicator(email.priority)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(email.receivedAt).toLocaleString()}
                            </p>
                          </div>
                          {email.categoryConfidence && (
                            <div className="mt-1 flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">
                                Confidence: {Math.round(Number(email.categoryConfidence))}%
                              </span>
                              {email.categoryKeywords && Array.isArray(email.categoryKeywords) && email.categoryKeywords.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  • Keywords: {email.categoryKeywords.slice(0, 3).join(", ")}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Email Detail */}
              <Card>
                <CardHeader>
                  <CardTitle>Email Details</CardTitle>
                  <CardDescription>
                    {selectedEmail ? "View email content and parsed documents" : "Select an email to view details"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!selectedEmail ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Select an email from the list</p>
                    </div>
                  ) : !emailDetail ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-muted-foreground">From</Label>
                          {getStatusBadge(emailDetail.parsingStatus)}
                        </div>
                        <p className="font-medium">
                          {emailDetail.fromName ? `${emailDetail.fromName} <${emailDetail.fromEmail}>` : emailDetail.fromEmail}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Subject</Label>
                        <p className="font-medium">{emailDetail.subject || "(No subject)"}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Category</Label>
                        <div className="flex items-center gap-2">
                          {getCategoryBadge(emailDetail.category)}
                          {getPriorityIndicator(emailDetail.priority)}
                          {emailDetail.categoryConfidence && (
                            <span className="text-xs text-muted-foreground">
                              ({Math.round(Number(emailDetail.categoryConfidence))}% confidence)
                            </span>
                          )}
                        </div>
                        {emailDetail.suggestedAction && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Suggested: {emailDetail.suggestedAction}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Received</Label>
                        <p>{new Date(emailDetail.receivedAt).toLocaleString()}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Body</Label>
                        <div className="max-h-48 overflow-y-auto p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                          {emailDetail.bodyText || "(No content)"}
                        </div>
                      </div>

                      {/* Parsed Documents */}
                      {emailDetail.documents && emailDetail.documents.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">Parsed Documents ({emailDetail.documents.length})</Label>
                          <div className="space-y-2">
                            {emailDetail.documents.map((doc: any) => (
                              <div key={doc.id} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {getDocumentTypeIcon(doc.documentType)}
                                    <span className="font-medium capitalize">{doc.documentType.replace(/_/g, " ")}</span>
                                  </div>
                                  <Badge variant={doc.isApproved ? "default" : "outline"}>
                                    {doc.isApproved ? "Approved" : doc.isReviewed ? "Reviewed" : "Pending Review"}
                                  </Badge>
                                </div>
                                {doc.vendorName && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Vendor: {doc.vendorName}
                                  </p>
                                )}
                                {doc.totalAmount && (
                                  <p className="text-sm text-muted-foreground">
                                    Amount: ${Number(doc.totalAmount).toFixed(2)} {doc.currency || "USD"}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-4 flex-wrap">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleGenerateAiReply()}
                          disabled={isGeneratingReply}
                          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                        >
                          {isGeneratingReply ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              AI Reply
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reparseEmailMutation.mutate({ id: selectedEmail })}
                          disabled={reparseEmailMutation.isPending}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${reparseEmailMutation.isPending ? "animate-spin" : ""}`} />
                          Reparse
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => archiveEmailMutation.mutate({ id: selectedEmail })}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setShowDeleteConfirm(true)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="purchase_order">Purchase Order</SelectItem>
                  <SelectItem value="freight_quote">Freight Quote</SelectItem>
                  <SelectItem value="bill_of_lading">Bill of Lading</SelectItem>
                  <SelectItem value="packing_list">Packing List</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => utils.emailScanning.getDocuments.invalidate()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Document List */}
              <Card>
                <CardHeader>
                  <CardTitle>Parsed Documents</CardTitle>
                  <CardDescription>
                    {documents?.length || 0} document(s) extracted
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {documentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : documents?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No documents yet</p>
                      <p className="text-sm">Submit emails to extract documents</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {documents?.map((doc: any) => (
                        <div
                          key={doc.id}
                          className={`p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                            selectedDocument === doc.id ? "border-primary bg-accent" : ""
                          }`}
                          onClick={() => setSelectedDocument(doc.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {getDocumentTypeIcon(doc.documentType)}
                              <div>
                                <p className="font-medium capitalize">{doc.documentType.replace(/_/g, " ")}</p>
                                <p className="text-sm text-muted-foreground">
                                  {doc.vendorName || "Unknown vendor"}
                                </p>
                              </div>
                            </div>
                            <Badge variant={doc.isApproved ? "default" : doc.isReviewed ? "secondary" : "outline"}>
                              {doc.isApproved ? "Approved" : doc.isReviewed ? "Reviewed" : "Pending"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                            <span>{doc.documentNumber || "No ref"}</span>
                            <span>
                              {doc.totalAmount ? `$${Number(doc.totalAmount).toFixed(2)}` : "-"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Document Detail */}
              <Card>
                <CardHeader>
                  <CardTitle>Document Details</CardTitle>
                  <CardDescription>
                    {selectedDocument ? "Review and approve document" : "Select a document to view details"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!selectedDocument ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Select a document from the list</p>
                    </div>
                  ) : !documentDetail ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getDocumentTypeIcon(documentDetail.documentType)}
                          <span className="font-medium capitalize text-lg">
                            {documentDetail.documentType.replace(/_/g, " ")}
                          </span>
                        </div>
                        <Badge variant={documentDetail.isApproved ? "default" : "outline"}>
                          {documentDetail.isApproved ? "Approved" : documentDetail.isReviewed ? "Reviewed" : "Pending Review"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-muted-foreground">Vendor</Label>
                          <p className="font-medium">{documentDetail.vendorName || "-"}</p>
                          {documentDetail.vendorEmail && (
                            <p className="text-sm text-muted-foreground">{documentDetail.vendorEmail}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Document #</Label>
                          <p className="font-medium">{documentDetail.documentNumber || "-"}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Date</Label>
                          <p className="font-medium">
                            {documentDetail.documentDate 
                              ? new Date(documentDetail.documentDate).toLocaleDateString() 
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Total Amount</Label>
                          <p className="font-medium text-lg">
                            {documentDetail.totalAmount 
                              ? `$${Number(documentDetail.totalAmount).toFixed(2)} ${documentDetail.currency || "USD"}`
                              : "-"}
                          </p>
                        </div>
                      </div>

                      {documentDetail.trackingNumber && (
                        <div>
                          <Label className="text-muted-foreground">Tracking</Label>
                          <p className="font-medium">{documentDetail.trackingNumber}</p>
                          {documentDetail.carrierName && (
                            <p className="text-sm text-muted-foreground">{documentDetail.carrierName}</p>
                          )}
                        </div>
                      )}

                      {/* Line Items */}
                      {documentDetail.lineItems && documentDetail.lineItems.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">Line Items</Label>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted">
                                <tr>
                                  <th className="text-left p-2">Description</th>
                                  <th className="text-right p-2">Qty</th>
                                  <th className="text-right p-2">Price</th>
                                  <th className="text-right p-2">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {documentDetail.lineItems.map((item: any, idx: number) => (
                                  <tr key={idx} className="border-t">
                                    <td className="p-2">{item.description}</td>
                                    <td className="text-right p-2">{item.quantity || "-"}</td>
                                    <td className="text-right p-2">
                                      {item.unitPrice ? `$${Number(item.unitPrice).toFixed(2)}` : "-"}
                                    </td>
                                    <td className="text-right p-2">
                                      {item.totalPrice ? `$${Number(item.totalPrice).toFixed(2)}` : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Confidence */}
                      <div>
                        <Label className="text-muted-foreground">Extraction Confidence</Label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all"
                              style={{ width: `${documentDetail.confidence || 0}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{Math.round(Number(documentDetail.confidence) || 0)}%</span>
                        </div>
                      </div>

                      {/* Actions */}
                      {!documentDetail.isApproved && (
                        <div className="pt-4 space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="createVendor"
                                checked={approvalOptions.createVendor}
                                onCheckedChange={(checked) => 
                                  setApprovalOptions({ ...approvalOptions, createVendor: !!checked })
                                }
                                disabled={!!documentDetail.vendorId}
                              />
                              <Label htmlFor="createVendor" className="text-sm">
                                Create new vendor from this document
                                {documentDetail.vendorId && " (already linked)"}
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="createTransaction"
                                checked={approvalOptions.createTransaction}
                                onCheckedChange={(checked) => 
                                  setApprovalOptions({ ...approvalOptions, createTransaction: !!checked })
                                }
                              />
                              <Label htmlFor="createTransaction" className="text-sm">
                                Create expense transaction
                              </Label>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1"
                              onClick={handleApproveDocument}
                              disabled={approveDocumentMutation.isPending}
                            >
                              <Check className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => rejectDocumentMutation.mutate({ id: selectedDocument })}
                              disabled={rejectDocumentMutation.isPending}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Auto-Reply Rules Tab */}
          <TabsContent value="auto-reply" className="space-y-4">
            <AutoReplyRulesTab />
          </TabsContent>

          {/* Sent Emails Tab */}
          <TabsContent value="sent" className="space-y-4">
            <SentEmailsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* AI Reply Dialog */}
      <Dialog open={showAiReplyDialog} onOpenChange={setShowAiReplyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              AI-Generated Reply
            </DialogTitle>
            <DialogDescription>
              Review and send the AI-generated email reply
            </DialogDescription>
          </DialogHeader>

          {generatedReply && (
            <div className="space-y-4">
              {/* Reply Metadata */}
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className="capitalize">
                  {generatedReply.tone} tone
                </Badge>
                <span className="text-muted-foreground">
                  Confidence: {generatedReply.confidence}%
                </span>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={generatedReply.subject}
                  onChange={(e) => setGeneratedReply({ ...generatedReply, subject: e.target.value })}
                />
              </div>

              {/* Body */}
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={generatedReply.body}
                  onChange={(e) => setGeneratedReply({ ...generatedReply, body: e.target.value })}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>

              {/* Suggested Actions */}
              {generatedReply.suggestedActions && generatedReply.suggestedActions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Suggested Follow-up Actions</Label>
                  <div className="flex flex-wrap gap-2">
                    {generatedReply.suggestedActions.map((action, i) => (
                      <Badge key={i} variant="secondary">{action}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Original Email Preview */}
              {emailDetail && (
                <div className="border-t pt-4">
                  <Label className="text-muted-foreground text-xs">Replying to:</Label>
                  <p className="text-sm text-muted-foreground truncate">
                    {emailDetail.fromEmail} - {emailDetail.subject}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => handleSendReply(false)}
              disabled={createReplyTaskMutation.isPending}
            >
              {createReplyTaskMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Clock className="h-4 w-4 mr-2" />
              )}
              Queue for Approval
            </Button>
            <Button
              onClick={() => handleSendReply(true)}
              disabled={sendReplyMutation.isPending}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
            >
              {sendReplyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Email</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this email? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedEmail && deleteEmailMutation.mutate({ id: selectedEmail })}
              disabled={deleteEmailMutation.isPending}
            >
              {deleteEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
