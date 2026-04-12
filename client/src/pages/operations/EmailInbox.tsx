import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Mail,
  FileText,
  RefreshCw,
  Star,
  Archive,
  Trash2,
  Inbox,
  Settings,
  Loader2,
  Zap,
  Sparkles,
  Send,
  Clock,
  Reply,
  ClipboardList,
  Search,
  ChevronDown,
  ChevronUp,
  Users,
  Package,
  Factory,
  Truck,
} from "lucide-react";

// Category display configuration
const categoryConfig: Record<string, { label: string; dot: string }> = {
  receipt: { label: "Receipt", dot: "bg-emerald-500" },
  purchase_order: { label: "PO", dot: "bg-blue-500" },
  invoice: { label: "Invoice", dot: "bg-orange-500" },
  shipping_confirmation: { label: "Shipping", dot: "bg-violet-500" },
  freight_quote: { label: "Freight", dot: "bg-cyan-500" },
  delivery_notification: { label: "Delivery", dot: "bg-emerald-400" },
  order_confirmation: { label: "Order", dot: "bg-indigo-500" },
  payment_confirmation: { label: "Payment", dot: "bg-teal-500" },
  general: { label: "General", dot: "bg-gray-400" },
};

function formatEmailDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
}

export default function EmailInbox() {
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [starredEmails, setStarredEmails] = useState<Set<number>>(new Set());
  const [selectedEmails, setSelectedEmails] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Scan dialog state
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

  // AI Reply state
  const [showAiReplyDialog, setShowAiReplyDialog] = useState(false);
  const [aiReplyEmailId, setAiReplyEmailId] = useState<number | null>(null);
  const [generatedReply, setGeneratedReply] = useState<{
    subject: string;
    body: string;
    tone: string;
    confidence: number;
    suggestedActions?: string[];
  } | null>(null);
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);

  const utils = trpc.useUtils();

  // Build query params for email list
  const emailQueryParams = {
    ...(categoryFilter !== "all" && { category: categoryFilter }),
  };

  // Queries
  const { data: emails, isLoading: emailsLoading } = trpc.emailScanning.list.useQuery(
    Object.keys(emailQueryParams).length > 0 ? emailQueryParams : undefined
  );

  const { data: emailDetail, isLoading: emailDetailLoading } = trpc.emailScanning.getById.useQuery(
    { id: expandedEmail! },
    { enabled: !!expandedEmail }
  );

  // Mutations
  const archiveEmailMutation = trpc.emailScanning.archiveEmail.useMutation({
    onSuccess: () => {
      toast.success("Email archived");
      setExpandedEmail(null);
      utils.emailScanning.list.invalidate();
    },
  });

  const deleteEmailMutation = trpc.emailScanning.deleteEmail.useMutation({
    onSuccess: () => {
      toast.success("Email deleted");
      setExpandedEmail(null);
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      utils.emailScanning.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const reparseEmailMutation = trpc.emailScanning.reparseEmail.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Reparsed successfully! Found ${result.documentsFound} document(s)`);
        utils.emailScanning.list.invalidate();
      } else {
        toast.error(`Reparse failed: ${result.error}`);
      }
    },
  });

  // Inbox scanning mutations
  const scanInboxMutation = trpc.emailScanning.scanInbox.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `Inbox scanned! Imported ${result.imported} emails, skipped ${result.skipped} duplicates.`
        );
        setShowScanDialog(false);
        utils.emailScanning.list.invalidate();
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

  const scanNowMutation = (trpc.emailScanning as any).scanNow.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Scanned inbox: ${result.emailsProcessed} emails, ${result.attachmentsParsed} attachments parsed`);
      utils.emailScanning.list.invalidate();
    },
    onError: (error: any) => toast.error("Scan failed: " + error.message),
  });

  const bulkCategorizeMutation = trpc.emailScanning.bulkCategorize.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Categorized ${result.categorized} of ${result.total} emails.`);
        utils.emailScanning.list.invalidate();
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // AI Email Reply mutations
  const generateReplyMutation = trpc.aiAgent.generateEmailReply.useMutation({
    onSuccess: (result) => {
      setGeneratedReply(result as any);
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

  const handleGenerateAiReply = (email: any) => {
    setAiReplyEmailId(email.id);
    setIsGeneratingReply(true);
    generateReplyMutation.mutate({
      originalEmail: {
        from: email.fromEmail,
        subject: email.subject || '',
        body: email.bodyText || '',
        emailId: email.id,
      },
    });
  };

  const handleSendReply = (autoSend: boolean) => {
    if (!aiReplyEmailId || !generatedReply) return;
    const email = emails?.find((e: any) => e.id === aiReplyEmailId);
    if (!email) return;

    if (autoSend) {
      sendReplyMutation.mutate({
        originalEmail: {
          from: email.fromEmail,
          subject: email.subject || '',
          body: email.bodyText || '',
          emailId: email.id,
        },
        autoSend: true,
      });
    } else {
      createReplyTaskMutation.mutate({
        to: email.fromEmail,
        originalSubject: email.subject || '',
        originalBody: email.bodyText || '',
        emailId: email.id,
        priority: email.priority === 'high' ? 'high' : 'medium',
      });
    }
  };

  const toggleStar = (e: React.MouseEvent, emailId: number) => {
    e.stopPropagation();
    setStarredEmails(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  const toggleCheckbox = (e: React.MouseEvent, emailId: number) => {
    e.stopPropagation();
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  const toggleExpand = (emailId: number) => {
    setExpandedEmail(prev => prev === emailId ? null : emailId);
  };

  // Filter emails by search query
  const filteredEmails = emails?.filter((email: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (email.subject || "").toLowerCase().includes(q) ||
      (email.fromName || "").toLowerCase().includes(q) ||
      (email.fromEmail || "").toLowerCase().includes(q) ||
      (email.bodyText || "").toLowerCase().includes(q)
    );
  });

  // Folder filter config
  const folderFilters = [
    { key: "all", label: "All", icon: Inbox },
    { key: "purchase_order", label: "Sales", icon: Users },
    { key: "invoice", label: "Raw Materials", icon: Package },
    { key: "receipt", label: "Copackers", icon: Factory },
    { key: "shipping_confirmation", label: "Freight", icon: Truck },
    { key: "archived", label: "Archived", icon: Archive },
  ];

  return (
    <>
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold shrink-0">Email Inbox</h1>
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                utils.emailScanning.list.invalidate();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => bulkCategorizeMutation.mutate({ useAi: false, limit: 100 })}
              disabled={bulkCategorizeMutation.isPending}
            >
              {bulkCategorizeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Categorize
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => scanNowMutation.mutate({ folders: ["INBOX"], unseenOnly: false, limit: 200 })}
              disabled={scanNowMutation.isPending}
            >
              {scanNowMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />}
              {scanNowMutation.isPending ? "Scanning..." : "Scan All"}
            </Button>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-500 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Auto-syncing
            </div>
            <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
              <DialogTrigger asChild className="hidden">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Inbox className="h-3.5 w-3.5" />
                  Scan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Scan Email Inbox</DialogTitle>
                  <DialogDescription>
                    Connect to your email inbox via IMAP to automatically import and categorize emails.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
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
                  {(selectedPreset === "gmail" || selectedPreset === "outlook") && (
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950 p-3 text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        Note for {selectedPreset === "gmail" ? "Gmail" : "Outlook"}:
                      </p>
                      <p className="text-amber-700 dark:text-amber-300 mt-1">
                        {selectedPreset === "gmail"
                          ? "Use an App Password instead of your regular password. Go to Google Account > Security > 2-Step Verification > App passwords."
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
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {folderFilters.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={categoryFilter === (key === "all" ? "all" : key) && key !== "archived" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={() => setCategoryFilter(key === "all" ? "all" : key)}
            >
              <Icon className="h-3 w-3" />
              {label}
            </Button>
          ))}
        </div>

        {/* Email list */}
        <div className="border rounded-lg overflow-hidden bg-card">
          {emailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredEmails || filteredEmails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No emails found</p>
            </div>
          ) : (
            <>
            {/* Bulk action bar */}
            {selectedEmails.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b">
                <span className="text-xs font-medium">{selectedEmails.size} selected</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => {
                    selectedEmails.forEach((id) => archiveEmailMutation.mutate({ id }));
                    setSelectedEmails(new Set());
                  }}
                >
                  <Archive className="h-3 w-3" /> Archive
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1 text-destructive hover:text-destructive"
                  onClick={() => {
                    selectedEmails.forEach((id) => deleteEmailMutation.mutate({ id }));
                    setSelectedEmails(new Set());
                  }}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSelectedEmails(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}
            <div className="divide-y divide-border/30">
              {filteredEmails.map((email: any) => {
                const isUnread = email.parsingStatus === "pending";
                const isExpanded = expandedEmail === email.id;
                const isStarred = starredEmails.has(email.id);
                const isChecked = selectedEmails.has(email.id);
                const catConfig = categoryConfig[email.category || "general"] || categoryConfig.general;

                return (
                  <div key={email.id}>
                    {/* Compact row */}
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/40 transition-colors text-xs ${
                        isUnread ? 'bg-accent/20' : ''
                      } ${isExpanded ? 'bg-accent/30' : ''}`}
                      onClick={() => toggleExpand(email.id)}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-muted-foreground/30 cursor-pointer accent-primary"
                        checked={isChecked}
                        onChange={() => {}}
                        onClick={(e) => toggleCheckbox(e, email.id)}
                      />
                      <Star
                        className={`h-4 w-4 shrink-0 cursor-pointer transition-colors ${
                          isStarred
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-muted-foreground/40 hover:text-yellow-400'
                        }`}
                        onClick={(e) => toggleStar(e, email.id)}
                      />
                      <span className={`w-[120px] truncate shrink-0 ${isUnread ? 'font-semibold' : ''}`}>
                        {email.fromName || email.fromEmail}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`${isUnread ? 'font-semibold' : ''}`}>
                          {email.subject || "(No subject)"}
                        </span>
                        <span className="text-muted-foreground">
                          {email.bodyText ? ` — ${email.bodyText.substring(0, 60)}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" title={catConfig.label}>
                        <span className={`h-2 w-2 rounded-full ${catConfig.dot}`} />
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                          {catConfig.label}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 w-[70px] text-right">
                        {formatEmailDate(email.receivedAt)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-6 py-4 bg-muted/30 border-t border-border/20">
                        <div className="space-y-3 max-w-3xl">
                          {/* From / Subject / Date row */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium">
                                {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {email.subject || "(No subject)"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(email.receivedAt).toLocaleString()}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {email.parsingStatus}
                            </Badge>
                          </div>

                          {/* Body — prefer HTML content (strip tags), fall back to plain text */}
                          <div className="p-3 bg-background rounded-md border text-sm whitespace-pre-wrap max-h-[70vh] overflow-y-auto leading-relaxed">
                            {emailDetailLoading && expandedEmail === email.id ? (
                              <span className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Loading…
                              </span>
                            ) : (
                              (() => {
                                const detail = emailDetail && emailDetail.id === email.id ? emailDetail : null;
                                // Prefer the richer HTML body from the detail query; fall back to
                                // the list-level bodyHtml, then bodyText from either source.
                                const raw =
                                  detail?.bodyHtml ||
                                  email.bodyHtml ||
                                  detail?.bodyText ||
                                  email.bodyText ||
                                  "(No content)";
                                // Strip HTML if it contains tags
                                if (raw.includes("<") && raw.includes(">")) {
                                  return raw
                                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                                    .replace(/<br\s*\/?>/gi, "\n")
                                    .replace(/<\/p>/gi, "\n\n")
                                    .replace(/<\/div>/gi, "\n")
                                    .replace(/<\/tr>/gi, "\n")
                                    .replace(/<\/li>/gi, "\n")
                                    .replace(/<[^>]+>/g, "")
                                    .replace(/&nbsp;/g, " ")
                                    .replace(/&amp;/g, "&")
                                    .replace(/&lt;/g, "<")
                                    .replace(/&gt;/g, ">")
                                    .replace(/&quot;/g, '"')
                                    .replace(/\n{3,}/g, "\n\n")
                                    .trim();
                                }
                                return raw;
                              })()
                            )}
                          </div>

                          {/* Parsed documents (if any from detail) */}
                          {emailDetail && emailDetail.id === email.id && emailDetail.documents && emailDetail.documents.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">
                                Parsed Documents ({emailDetail.documents.length})
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {emailDetail.documents.map((doc: any) => (
                                  <Badge key={doc.id} variant="secondary" className="text-xs gap-1">
                                    <FileText className="h-3 w-3" />
                                    {doc.documentType?.replace(/_/g, " ")}
                                    {doc.totalAmount && ` - $${Number(doc.totalAmount).toFixed(2)}`}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateAiReply(email);
                              }}
                              disabled={isGeneratingReply && aiReplyEmailId === email.id}
                            >
                              {isGeneratingReply && aiReplyEmailId === email.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Reply className="h-3.5 w-3.5" />
                              )}
                              Reply
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                reparseEmailMutation.mutate({ id: email.id });
                              }}
                              disabled={reparseEmailMutation.isPending}
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              Reparse
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                archiveEmailMutation.mutate({ id: email.id });
                              }}
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archive
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTargetId(email.id);
                                setShowDeleteConfirm(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>

        {/* Count footer */}
        {filteredEmails && filteredEmails.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        )}
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
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className="capitalize">
                  {generatedReply.tone} tone
                </Badge>
                <span className="text-muted-foreground">
                  Confidence: {generatedReply.confidence}%
                </span>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={generatedReply.subject}
                  onChange={(e) => setGeneratedReply({ ...generatedReply, subject: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={generatedReply.body}
                  onChange={(e) => setGeneratedReply({ ...generatedReply, body: e.target.value })}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
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
              onClick={() => deleteTargetId && deleteEmailMutation.mutate({ id: deleteTargetId })}
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
