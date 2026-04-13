import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Users,
  Package,
  Factory,
  Truck,
  ArrowLeft,
  PenSquare,
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
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
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

  const { data: emailDetail } = trpc.emailScanning.getById.useQuery(
    { id: selectedEmailId! },
    { enabled: !!selectedEmailId }
  );

  // Mutations
  const archiveEmailMutation = trpc.emailScanning.archiveEmail.useMutation({
    onSuccess: () => {
      toast.success("Email archived");
      setSelectedEmailId(null);
      utils.emailScanning.list.invalidate();
    },
  });

  const deleteEmailMutation = trpc.emailScanning.deleteEmail.useMutation({
    onSuccess: () => {
      toast.success("Email deleted");
      setSelectedEmailId(null);
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

  // Filter emails by search query and category
  const filteredEmails = emails?.filter((email: any) => {
    if (categoryFilter === "starred") return starredEmails.has(email.id);
    if (categoryFilter !== "all") {
      if (email.category !== categoryFilter) return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (email.subject || "").toLowerCase().includes(q) ||
      (email.fromName || "").toLowerCase().includes(q) ||
      (email.fromEmail || "").toLowerCase().includes(q) ||
      (email.bodyText || "").toLowerCase().includes(q)
    );
  });

  const selectedEmail = emails?.find((e: any) => e.id === selectedEmailId);

  // Sidebar folder config
  const sidebarFolders = [
    { key: "all", label: "Inbox", icon: Inbox, count: emails?.filter((e: any) => e.parsingStatus !== "archived").length ?? 0 },
    { key: "starred", label: "Starred", icon: Star, count: starredEmails.size },
    { key: "archived", label: "Archive", icon: Archive, count: 0 },
    { key: "trash", label: "Trash", icon: Trash2, count: 0 },
  ];

  // Category label config for sidebar
  const sidebarLabels = [
    { key: "purchase_order", label: "Sales", icon: Users, dot: "bg-blue-500" },
    { key: "invoice", label: "Invoices", icon: Package, dot: "bg-orange-500" },
    { key: "receipt", label: "Receipts", icon: Factory, dot: "bg-emerald-500" },
    { key: "shipping_confirmation", label: "Freight", icon: Truck, dot: "bg-violet-500" },
  ];

  // Render stripped body text
  const renderBody = (raw: string) => {
    if (!raw) return "(No content)";
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
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    return raw;
  };

  return (
    <>
      {/* Gmail-style two-panel layout */}
      <div
        className="-m-3 -mb-4 md:-m-6 lg:-m-8 flex overflow-hidden bg-background"
        style={{ height: "calc(100vh - 5.25rem)" }}
      >
        {/* ── LEFT SIDEBAR ── */}
        <div className="w-56 shrink-0 flex flex-col border-r bg-background">
          {/* Compose / Connect button */}
          <div className="p-3 pb-2">
            <Button
              variant="outline"
              className="rounded-2xl shadow h-12 w-full gap-2 justify-start pl-5 text-sm font-medium"
              onClick={() => setShowScanDialog(true)}
            >
              <PenSquare className="h-4 w-4" />
              Connect Inbox
            </Button>
          </div>

          {/* Folder nav */}
          <nav className="flex-1 overflow-y-auto py-1 space-y-0.5">
            {sidebarFolders.map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                className={`flex items-center gap-3 pl-4 pr-3 py-1.5 text-sm w-[calc(100%-8px)] rounded-r-full transition-colors hover:bg-accent/60 ${
                  categoryFilter === key ? "bg-accent font-semibold" : "font-normal"
                }`}
                onClick={() => { setCategoryFilter(key); setSelectedEmailId(null); }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {count > 0 && (
                  <span className="text-xs font-semibold">{count}</span>
                )}
              </button>
            ))}

            {/* Labels section */}
            <div className="pt-3 px-4 pb-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Labels</p>
            </div>
            {sidebarLabels.map(({ key, label, dot }) => (
              <button
                key={key}
                className={`flex items-center gap-3 pl-4 pr-3 py-1.5 text-sm w-[calc(100%-8px)] rounded-r-full transition-colors hover:bg-accent/60 ${
                  categoryFilter === key ? "bg-accent font-semibold" : "font-normal"
                }`}
                onClick={() => { setCategoryFilter(key); setSelectedEmailId(null); }}
              >
                <span className={`h-3 w-3 rounded-full shrink-0 ${dot}`} />
                <span className="flex-1 text-left">{label}</span>
              </button>
            ))}
          </nav>

          {/* Bottom toolbar */}
          <div className="px-2 py-2 border-t flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Refresh"
              onClick={() => utils.emailScanning.list.invalidate()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Categorize"
              onClick={() => bulkCategorizeMutation.mutate({ useAi: false, limit: 100 })}
              disabled={bulkCategorizeMutation.isPending}
            >
              {bulkCategorizeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Scan Now"
              onClick={() => scanNowMutation.mutate({ folders: ["INBOX"], unseenOnly: false, limit: 200 })}
              disabled={scanNowMutation.isPending}
            >
              {scanNowMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Inbox className="h-4 w-4" />
              )}
            </Button>
            <div className="ml-auto flex items-center gap-1 text-xs text-green-500 pr-1" title="Auto-syncing">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="hidden sm:inline">Live</span>
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar + bulk actions */}
          <div className="border-b px-4 py-2 flex items-center gap-2 bg-background">
            <div className="flex-1 relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search mail"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 rounded-full bg-accent/40 border-0 focus-visible:ring-1 text-sm"
              />
            </div>
            {selectedEmails.size > 0 && (
              <div className="flex items-center gap-1 ml-2">
                <span className="text-xs text-muted-foreground mr-1">{selectedEmails.size} selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    selectedEmails.forEach((id) => archiveEmailMutation.mutate({ id }));
                    setSelectedEmails(new Set());
                  }}
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                  onClick={() => {
                    selectedEmails.forEach((id) => deleteEmailMutation.mutate({ id }));
                    setSelectedEmails(new Set());
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedEmails(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {/* ── EMAIL LIST ── */}
          {!selectedEmailId || !selectedEmail ? (
            <div className="flex-1 overflow-y-auto">
              {emailsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredEmails || filteredEmails.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No emails found</p>
                  {searchQuery && (
                    <p className="text-xs mt-1">No results for "{searchQuery}"</p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {filteredEmails.map((email: any) => {
                    const isUnread = email.parsingStatus === "pending";
                    const isStarred = starredEmails.has(email.id);
                    const isChecked = selectedEmails.has(email.id);
                    const catConfig = categoryConfig[email.category || "general"] || categoryConfig.general;

                    return (
                      <div
                        key={email.id}
                        className={`group flex items-center gap-2 px-4 h-11 cursor-pointer select-none transition-colors hover:bg-accent/50 hover:shadow-[inset_3px_0_0] hover:shadow-primary/50 ${
                          isUnread ? "font-semibold bg-accent/10" : ""
                        } ${isChecked ? "bg-primary/5" : ""}`}
                        onClick={() => setSelectedEmailId(email.id)}
                      >
                        {/* Checkbox */}
                        <div className={`h-4 w-4 shrink-0 transition-opacity ${!isChecked ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-primary rounded"
                            checked={isChecked}
                            onChange={() => {}}
                            onClick={(e) => toggleCheckbox(e, email.id)}
                          />
                        </div>

                        {/* Star */}
                        <Star
                          className={`h-4 w-4 shrink-0 cursor-pointer transition-all ${
                            isStarred
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-muted-foreground/30 hover:text-yellow-400 opacity-0 group-hover:opacity-100"
                          }`}
                          onClick={(e) => toggleStar(e, email.id)}
                        />

                        {/* Sender */}
                        <span className={`w-36 shrink-0 truncate text-sm ${isUnread ? "font-semibold" : "text-muted-foreground"}`}>
                          {email.fromName || email.fromEmail}
                        </span>

                        {/* Subject + snippet */}
                        <span className="flex-1 min-w-0 truncate text-sm">
                          <span className={isUnread ? "font-semibold" : ""}>{email.subject || "(No subject)"}</span>
                          {email.bodyText && (
                            <span className="text-muted-foreground font-normal">
                              {" — "}{email.bodyText.substring(0, 80)}
                            </span>
                          )}
                        </span>

                        {/* Category dot (hidden on hover) */}
                        <div className="flex items-center gap-1 shrink-0 group-hover:invisible">
                          <span className={`h-2 w-2 rounded-full ${catConfig.dot}`} title={catConfig.label} />
                        </div>

                        {/* Hover action icons */}
                        <div
                          className="hidden group-hover:flex items-center gap-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
                            title="Archive"
                            onClick={(e) => { e.stopPropagation(); archiveEmailMutation.mutate({ id: email.id }); }}
                          >
                            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
                            title="Delete"
                            onClick={(e) => { e.stopPropagation(); setDeleteTargetId(email.id); setShowDeleteConfirm(true); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>

                        {/* Date */}
                        <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                          {formatEmailDate(email.receivedAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {filteredEmails && filteredEmails.length > 0 && (
                <p className="text-xs text-muted-foreground px-4 py-2 border-t">
                  {filteredEmails.length} email{filteredEmails.length !== 1 ? "s" : ""}
                  {searchQuery && ` matching "${searchQuery}"`}
                </p>
              )}
            </div>
          ) : (
            /* ── READING PANE ── */
            <div className="flex-1 overflow-y-auto">
              {/* Sticky header */}
              <div className="sticky top-0 bg-background border-b px-4 py-2.5 flex items-center gap-2 z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-1 shrink-0"
                  title="Back to inbox"
                  onClick={() => setSelectedEmailId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="font-semibold flex-1 truncate text-base">
                  {selectedEmail.subject || "(No subject)"}
                </h2>
                <button
                  className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent transition-colors shrink-0"
                  title={starredEmails.has(selectedEmail.id) ? "Unstar" : "Star"}
                  onClick={(e) => toggleStar(e, selectedEmail.id)}
                >
                  <Star
                    className={`h-4 w-4 ${
                      starredEmails.has(selectedEmail.id)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Archive"
                  onClick={() => archiveEmailMutation.mutate({ id: selectedEmail.id })}
                  disabled={archiveEmailMutation.isPending}
                >
                  <Archive className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  title="Delete"
                  onClick={() => { setDeleteTargetId(selectedEmail.id); setShowDeleteConfirm(true); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Email content */}
              <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
                {/* Sender info row */}
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shrink-0 select-none">
                    {(selectedEmail.fromName || selectedEmail.fromEmail || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {selectedEmail.fromName
                          ? `${selectedEmail.fromName} <${selectedEmail.fromEmail}>`
                          : selectedEmail.fromEmail}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {selectedEmail.parsingStatus}
                      </Badge>
                      {(categoryConfig[selectedEmail.category || "general"] || categoryConfig.general) && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${(categoryConfig[selectedEmail.category || "general"] || categoryConfig.general).dot}`} />
                          {(categoryConfig[selectedEmail.category || "general"] || categoryConfig.general).label}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(selectedEmail.receivedAt).toLocaleString()}
                    </div>
                  </div>
                  {/* Quick actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => reparseEmailMutation.mutate({ id: selectedEmail.id })}
                      disabled={reparseEmailMutation.isPending}
                    >
                      {reparseEmailMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ClipboardList className="h-3.5 w-3.5" />
                      )}
                      Reparse
                    </Button>
                  </div>
                </div>

                {/* Parsed documents */}
                {emailDetail && emailDetail.id === selectedEmail.id && emailDetail.documents && emailDetail.documents.length > 0 && (
                  <div className="flex flex-wrap gap-2 py-3 border-y">
                    <span className="text-xs text-muted-foreground font-medium w-full">
                      Parsed Documents ({emailDetail.documents.length})
                    </span>
                    {emailDetail.documents.map((doc: any) => (
                      <Badge key={doc.id} variant="secondary" className="text-xs gap-1">
                        <FileText className="h-3 w-3" />
                        {doc.documentType?.replace(/_/g, " ")}
                        {doc.totalAmount && ` — $${Number(doc.totalAmount).toFixed(2)}`}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Email body */}
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {renderBody(
                    (emailDetail && emailDetail.id === selectedEmail.id)
                      ? (emailDetail.bodyText || emailDetail.bodyHtml || "")
                      : (selectedEmail.bodyText || selectedEmail.bodyHtml || "")
                  )}
                </div>

                {/* Inline reply box */}
                <div className="border rounded-xl p-4 space-y-3 bg-background">
                  <div className="flex items-center gap-2 text-sm">
                    <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Reply to{" "}
                      <span className="font-medium text-foreground">
                        {selectedEmail.fromName || selectedEmail.fromEmail}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 gap-1.5 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700"
                      onClick={() => handleGenerateAiReply(selectedEmail)}
                      disabled={isGeneratingReply && aiReplyEmailId === selectedEmail.id}
                    >
                      {isGeneratingReply && aiReplyEmailId === selectedEmail.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      AI Reply
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Write a reply..."
                    rows={4}
                    className="text-sm resize-none border bg-accent/20"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-1.5 h-8">
                      <Send className="h-3.5 w-3.5" />
                      Send
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                      Discard
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* IMAP Scan / Connect Inbox Dialog */}
      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect Email Inbox</DialogTitle>
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
