import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  PenSquare,
  ListOrdered,
  MessageSquare,
  Rss,
  FolderOpen,
  Plus,
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  Edit2,
  X,
  Check,
  BookOpen,
  MailOpen,
  AlertCircle,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

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
  if (isToday) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
}

function isReplyToday(email: any): boolean {
  return email.priority === "high" || email.parsingStatus === "pending";
}

function groupEmailsByDate(emails: any[]) {
  const pinned: any[] = [];
  const today: any[] = [];
  const yesterday: any[] = [];
  const thisWeek: any[] = [];
  const older: any[] = [];
  const now = new Date();
  const todayStr = now.toDateString();
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterdayStr = yest.toDateString();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  for (const e of emails) {
    if (e._pinned) { pinned.push(e); continue; }
    const d = new Date(e.receivedAt);
    if (d.toDateString() === todayStr) { today.push(e); continue; }
    if (d.toDateString() === yesterdayStr) { yesterday.push(e); continue; }
    if (d >= weekAgo) { thisWeek.push(e); continue; }
    older.push(e);
  }
  return { pinned, today, yesterday, thisWeek, older };
}

function HtmlEmailBody({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const getIsDarkMode = () =>
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateMode = () => setIsDarkMode(getIsDarkMode());
    updateMode();

    const observer = new MutationObserver(updateMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    mediaQuery.addEventListener("change", updateMode);
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", updateMode);
    };
  }, []);

  const resizeIframe = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument?.documentElement) return;
      const height = iframe.contentDocument.documentElement.scrollHeight;
      if (height > 0) iframe.style.height = `${height}px`;
    } catch {
      // Sandbox or cross-origin access blocked; iframe retains its min-height
    }
  }, []);

  const wrappedHtml = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_blank">
<style>
  :root { color-scheme: ${isDarkMode ? "dark" : "light"}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: ${isDarkMode ? "#e5e7eb" : "#1a1a1a"}; background: ${isDarkMode ? "#111827" : "#ffffff"}; word-wrap: break-word; overflow-wrap: break-word; }
  img { max-width: 100%; height: auto; display: inline-block; }
  a { color: ${isDarkMode ? "#93c5fd" : "#1a73e8"}; text-decoration: underline; }
  pre, code { white-space: pre-wrap; word-break: break-all; font-family: monospace; }
  table { max-width: 100% !important; border-collapse: collapse; }
  td, th { word-wrap: break-word; max-width: 600px; }
  blockquote { border-left: 3px solid ${isDarkMode ? "#4b5563" : "#d0d0d0"}; margin: 8px 0; padding-left: 12px; color: ${isDarkMode ? "#9ca3af" : "#666"}; }
  hr { border: none; border-top: 1px solid ${isDarkMode ? "#374151" : "#e0e0e0"}; }
  p { margin: 0 0 8px 0; }
</style>
</head>
<body>${html}</body>
</html>`,
    [html, isDarkMode]
  );

  useEffect(() => {
    resizeIframe();
  }, [resizeIframe, wrappedHtml]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={wrappedHtml}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={resizeIframe}
      className="w-full border-0 min-h-[120px]"
      title="Email content"
    />
  );
}

function EmailBody({ body }: { body: string }) {
  if (!body) return <p className="text-sm text-muted-foreground">(No content)</p>;
  const isHtml = /<[a-z][^>]*>/i.test(body);
  if (isHtml) return <HtmlEmailBody html={body} />;
  return <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{body}</div>;
}

type Tab = "important" | "sales" | "hiring" | "raise" | "other";

function tabFilter(emails: any[], tab: Tab): any[] {
  if (tab === "important") return emails.filter((e: any) => e.priority === "high" || e.parsingStatus === "pending");
  if (tab === "sales") return emails.filter((e: any) => ["purchase_order", "order_confirmation"].includes(e.category));
  if (tab === "hiring") return emails.filter((e: any) => {
    const text = ((e.subject || "") + " " + (e.bodyText || "")).toLowerCase();
    return text.includes("hire") || text.includes("hiring") || text.includes("recruit") || text.includes("candidate") || text.includes("interview");
  });
  if (tab === "raise") return emails.filter((e: any) => {
    const text = ((e.subject || "") + " " + (e.bodyText || "")).toLowerCase();
    return text.includes("fundrais") || text.includes("investor") || text.includes("raise") || text.includes("series") || e.category === "invoice";
  });
  return emails;
}

type Folder = "inbox" | "sequences" | "sent" | "drafts" | "scheduled" | "archive" | "spam" | "trash" | "messages" | "feeds";

export default function EmailInbox() {
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");
  const [activeTab, setActiveTab] = useState<Tab>("important");
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [starredEmails, setStarredEmails] = useState<Set<number>>(new Set());
  const [pinnedEmails, setPinnedEmails] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [labelsExpanded, setLabelsExpanded] = useState(true);
  const [scanConfig, setScanConfig] = useState({ host: "", port: 993, user: "", password: "", folder: "INBOX", limit: 50, unseenOnly: true, markAsSeen: false, fullAiParsing: false });
  const [selectedPreset, setSelectedPreset] = useState("");
  const [showAiReplyDialog, setShowAiReplyDialog] = useState(false);
  const [aiReplyEmailId, setAiReplyEmailId] = useState<number | null>(null);
  const [generatedReply, setGeneratedReply] = useState<{ subject: string; body: string; tone: string; confidence: number; suggestedActions?: string[] } | null>(null);
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);
  const [showNewSequenceDialog, setShowNewSequenceDialog] = useState(false);
  const [newSeqForm, setNewSeqForm] = useState({ name: "", description: "" });
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [stepForm, setStepForm] = useState({ subject: "", body: "", delayDays: 1 });
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [showCannedManager, setShowCannedManager] = useState(false);
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [cannedSearch, setCannedSearch] = useState("");
  const [cannedForm, setCannedForm] = useState<{ open: boolean; id: number | null; name: string; content: string; shortcut: string; category: string }>({ open: false, id: null, name: "", content: "", shortcut: "", category: "" });
  const cannedPickerRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const { data: emails, isLoading: emailsLoading } = trpc.emailScanning.list.useQuery(
    categoryFilter !== "all" ? { category: categoryFilter } : undefined
  );
  const { data: emailDetail } = trpc.emailScanning.getById.useQuery({ id: selectedEmailId! }, { enabled: !!selectedEmailId });
  const { data: sequences, isLoading: seqLoading } = trpc.emailSequences.list.useQuery(undefined, { enabled: activeFolder === "sequences" });
  const { data: selectedSeq } = trpc.emailSequences.get.useQuery({ id: selectedSequenceId! }, { enabled: !!selectedSequenceId && activeFolder === "sequences" });
  const { data: cannedResponses } = trpc.emailCannedResponses.list.useQuery();

  const archiveEmailMutation = trpc.emailScanning.archiveEmail.useMutation({ onSuccess: () => { toast.success("Email archived"); setSelectedEmailId(null); utils.emailScanning.list.invalidate(); } });
  const deleteEmailMutation = trpc.emailScanning.deleteEmail.useMutation({ onSuccess: () => { toast.success("Email deleted"); setSelectedEmailId(null); setShowDeleteConfirm(false); setDeleteTargetId(null); utils.emailScanning.list.invalidate(); }, onError: (e) => toast.error(`Failed: ${e.message}`) });
  const reparseEmailMutation = trpc.emailScanning.reparseEmail.useMutation({ onSuccess: (r) => { if (r.success) { toast.success(`Reparsed! ${r.documentsFound} docs`); utils.emailScanning.list.invalidate(); } else toast.error(`Reparse failed: ${r.error}`); } });
  const scanInboxMutation = trpc.emailScanning.scanInbox.useMutation({ onSuccess: (r) => { if (r.success) { toast.success(`Scanned! Imported ${r.imported}`); setShowScanDialog(false); utils.emailScanning.list.invalidate(); } else toast.error(`Failed: ${r.error}`); }, onError: (e) => toast.error(e.message) });
  const testConnectionMutation = trpc.emailScanning.testInboxConnection.useMutation({ onSuccess: (r) => { if (r.success) toast.success(`Connected! ${r.mailboxes?.length || 0} mailboxes`); else toast.error(`Failed: ${r.error}`); }, onError: (e) => toast.error(e.message) });
  const scanNowMutation = (trpc.emailScanning as any).scanNow.useMutation({ onSuccess: (r: any) => { toast.success(`Scanned: ${r.emailsProcessed} emails`); utils.emailScanning.list.invalidate(); }, onError: (e: any) => toast.error("Scan failed: " + e.message) });
  const bulkCategorizeMutation = trpc.emailScanning.bulkCategorize.useMutation({ onSuccess: (r) => { if (r.success) { toast.success(`Categorized ${r.categorized}`); utils.emailScanning.list.invalidate(); } }, onError: (e) => toast.error(e.message) });
  const generateReplyMutation = trpc.aiAgent.generateEmailReply.useMutation({ onSuccess: (r) => { setGeneratedReply(r as any); setShowAiReplyDialog(true); setIsGeneratingReply(false); }, onError: (e) => { toast.error(`Failed: ${e.message}`); setIsGeneratingReply(false); } });
  const sendReplyMutation = trpc.aiAgent.sendEmailReply.useMutation({ onSuccess: (r) => { if (r.emailSent) { toast.success("Reply sent!"); setShowAiReplyDialog(false); setGeneratedReply(null); } else toast.error("Failed to send"); }, onError: (e) => toast.error(e.message) });
  const createReplyTaskMutation = trpc.aiAgent.createEmailReplyTask.useMutation({ onSuccess: () => { toast.success("Reply queued"); setShowAiReplyDialog(false); setGeneratedReply(null); }, onError: (e) => toast.error(e.message) });

  const createSeqMutation = trpc.emailSequences.create.useMutation({ onSuccess: (r) => { toast.success("Sequence created"); setShowNewSequenceDialog(false); setNewSeqForm({ name: "", description: "" }); utils.emailSequences.list.invalidate(); setSelectedSequenceId(r.id); }, onError: (e) => toast.error(e.message) });
  const updateSeqMutation = trpc.emailSequences.update.useMutation({ onSuccess: () => { utils.emailSequences.list.invalidate(); if (selectedSequenceId) utils.emailSequences.get.invalidate({ id: selectedSequenceId }); } });
  const deleteSeqMutation = trpc.emailSequences.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); setSelectedSequenceId(null); utils.emailSequences.list.invalidate(); } });
  const addStepMutation = trpc.emailSequences.addStep.useMutation({ onSuccess: () => { toast.success("Step added"); setShowStepDialog(false); setStepForm({ subject: "", body: "", delayDays: 1 }); setEditingStepId(null); if (selectedSequenceId) utils.emailSequences.get.invalidate({ id: selectedSequenceId }); }, onError: (e) => toast.error(e.message) });
  const updateStepMutation = trpc.emailSequences.updateStep.useMutation({ onSuccess: () => { toast.success("Step updated"); setShowStepDialog(false); setStepForm({ subject: "", body: "", delayDays: 1 }); setEditingStepId(null); if (selectedSequenceId) utils.emailSequences.get.invalidate({ id: selectedSequenceId }); }, onError: (e) => toast.error(e.message) });
  const deleteStepMutation = trpc.emailSequences.deleteStep.useMutation({ onSuccess: () => { toast.success("Step deleted"); if (selectedSequenceId) utils.emailSequences.get.invalidate({ id: selectedSequenceId }); } });

  const createCannedMutation = trpc.emailCannedResponses.create.useMutation({ onSuccess: () => { toast.success("Canned response saved"); setCannedForm({ open: false, id: null, name: "", content: "", shortcut: "", category: "" }); utils.emailCannedResponses.list.invalidate(); }, onError: (e) => toast.error(e.message) });
  const updateCannedMutation = trpc.emailCannedResponses.update.useMutation({ onSuccess: () => { toast.success("Updated"); setCannedForm({ open: false, id: null, name: "", content: "", shortcut: "", category: "" }); utils.emailCannedResponses.list.invalidate(); }, onError: (e) => toast.error(e.message) });
  const deleteCannedMutation = trpc.emailCannedResponses.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); utils.emailCannedResponses.list.invalidate(); } });
  const incrementCannedMutation = trpc.emailCannedResponses.incrementUsage.useMutation();

  const imapPresets: Record<string, { host: string; port: number }> = { gmail: { host: "imap.gmail.com", port: 993 }, outlook: { host: "outlook.office365.com", port: 993 }, yahoo: { host: "imap.mail.yahoo.com", port: 993 }, icloud: { host: "imap.mail.me.com", port: 993 } };
  const handlePresetChange = (preset: string) => { setSelectedPreset(preset); if (preset && imapPresets[preset]) setScanConfig(prev => ({ ...prev, ...imapPresets[preset] })); };
  const handleGenerateAiReply = (email: any) => { setAiReplyEmailId(email.id); setIsGeneratingReply(true); generateReplyMutation.mutate({ originalEmail: { from: email.fromEmail, subject: email.subject || "", body: email.bodyText || "", emailId: email.id } }); };
  const handleSendReply = (autoSend: boolean) => {
    if (!aiReplyEmailId || !generatedReply) return;
    const email = emails?.find((e: any) => e.id === aiReplyEmailId);
    if (!email) return;
    if (autoSend) sendReplyMutation.mutate({ originalEmail: { from: email.fromEmail, subject: email.subject || "", body: email.bodyText || "", emailId: email.id }, autoSend: true });
    else createReplyTaskMutation.mutate({ to: email.fromEmail, originalSubject: email.subject || "", originalBody: email.bodyText || "", emailId: email.id, priority: email.priority === "high" ? "high" : "medium" });
  };
  const toggleStar = (e: React.MouseEvent, id: number) => { e.stopPropagation(); setStarredEmails(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const togglePin = (e: React.MouseEvent, id: number) => { e.stopPropagation(); setPinnedEmails(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const insertCannedResponse = (content: string, id: number) => { setReplyText(content); setShowCannedPicker(false); incrementCannedMutation.mutate({ id }); };

  const baseEmails = emails?.filter((e: any) => {
    if (activeFolder === "archive") return e.parsingStatus === "archived";
    if (activeFolder === "trash") return false;
    if (activeFolder !== "inbox") return false;
    if (e.parsingStatus === "archived") return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    if (labelFilter) { const q = labelFilter.toLowerCase(); if (!((e.subject || "").toLowerCase().includes(q) || (e.fromName || "").toLowerCase().includes(q) || (e.fromEmail || "").toLowerCase().includes(q) || (e.bodyText || "").toLowerCase().includes(q))) return false; }
    if (searchQuery) { const q = searchQuery.toLowerCase(); return (e.subject || "").toLowerCase().includes(q) || (e.fromName || "").toLowerCase().includes(q) || (e.fromEmail || "").toLowerCase().includes(q); }
    return true;
  }) ?? [];
  const tabEmails = activeFolder === "inbox" ? tabFilter(baseEmails, activeTab) : baseEmails;
  const emailsWithPin = tabEmails.map((e: any) => ({ ...e, _pinned: pinnedEmails.has(e.id) }));
  const grouped = groupEmailsByDate(emailsWithPin);
  const selectedEmail = emails?.find((e: any) => e.id === selectedEmailId);

  useEffect(() => {
    if (!emails?.length) return;
    const id = Number(new URLSearchParams(window.location.search).get("emailId"));
    if (id && Number.isFinite(id) && id > 0 && emails.some((e: any) => e.id === id) && selectedEmailId !== id) setSelectedEmailId(id);
  }, [emails]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (cannedPickerRef.current && !cannedPickerRef.current.contains(e.target as Node)) setShowCannedPicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const inboxCount = emails?.filter((e: any) => e.parsingStatus !== "archived").length ?? 0;
  const seqCount = sequences?.length ?? 0;
  const sidebarFolders: { key: Folder; label: string; icon: any; count?: number }[] = [
    { key: "inbox", label: "Inbox", icon: Inbox, count: inboxCount },
    { key: "sequences", label: "Sequences", icon: ListOrdered, count: seqCount },
    { key: "sent", label: "Sent", icon: Send },
    { key: "drafts", label: "Drafts", icon: PenSquare },
    { key: "scheduled", label: "Scheduled", icon: Clock },
    { key: "archive", label: "Archive", icon: Archive },
    { key: "spam", label: "Spam", icon: AlertCircle },
    { key: "trash", label: "Trash", icon: Trash2 },
    { key: "messages", label: "Messages", icon: MessageSquare },
    { key: "feeds", label: "Feeds", icon: Rss },
  ];
  const userFolders = ["2026 Q2 GTM", "Series B Raise", "Hiring"];
  const userLabels = [
    { label: "Investors", color: "bg-violet-500" }, { label: "LinkedIn", color: "bg-blue-600" },
    { label: "Product", color: "bg-emerald-500" }, { label: "Engineering", color: "bg-orange-500" },
    { label: "Legal", color: "bg-red-500" }, { label: "Partnerships", color: "bg-amber-500" },
    { label: "Board", color: "bg-gray-500" }, { label: "Recruiting", color: "bg-pink-500" },
  ];

  const EmailRow = ({ email }: { email: any }) => {
    const isUnread = email.parsingStatus === "pending";
    const isStarred = starredEmails.has(email.id);
    const isPinned = pinnedEmails.has(email.id);
    const isSelected = selectedEmailId === email.id;
    const replyToday = isReplyToday(email);
    const catConfig = categoryConfig[email.category || "general"] || categoryConfig.general;
    return (
      <div
        className={`group relative flex items-start gap-2 px-3 py-2.5 cursor-pointer select-none border-b border-border/20 transition-colors hover:bg-accent/40 ${isSelected ? "bg-accent/60 border-l-2 border-l-primary" : ""} ${isUnread ? "font-medium" : ""}`}
        onClick={() => setSelectedEmailId(isSelected ? null : email.id)}
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/70 to-primary shrink-0 flex items-center justify-center text-primary-foreground font-semibold text-xs select-none mt-0.5">
          {(email.fromName || email.fromEmail || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm truncate flex-1 ${isUnread ? "font-semibold" : "text-muted-foreground"}`}>{email.fromName || email.fromEmail}</span>
            <span className="text-xs text-muted-foreground shrink-0">{formatEmailDate(email.receivedAt)}</span>
            {isPinned && <span className="text-xs shrink-0">📌</span>}
          </div>
          <p className={`text-sm truncate ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>{email.subject || "(No subject)"}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{(email.bodyText || "").substring(0, 80)}</p>
          <div className="flex items-center gap-2 mt-1">
            {replyToday && <span className="inline-flex items-center gap-1 text-xs text-orange-500 font-medium"><span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />Reply Today</span>}
            {email.suggestedAction && <span className="text-xs text-primary/70 truncate flex items-center gap-1"><Sparkles className="h-2.5 w-2.5 shrink-0" />{email.suggestedAction}</span>}
          </div>
        </div>
        <div className="hidden group-hover:flex flex-col gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent" title="Star" onClick={e => toggleStar(e, email.id)}><Star className={`h-3 w-3 ${isStarred ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`} /></button>
          <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent" title="Pin" onClick={e => togglePin(e, email.id)}><span className="text-xs">📌</span></button>
          <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent" title="Archive" onClick={e => { e.stopPropagation(); archiveEmailMutation.mutate({ id: email.id }); }}><Archive className="h-3 w-3 text-muted-foreground" /></button>
        </div>
        <div className="absolute right-2 top-2.5 group-hover:hidden"><span className={`h-2 w-2 rounded-full ${catConfig.dot}`} /></div>
      </div>
    );
  };

  const EmailGroup = ({ label, emails: groupEmails }: { label: string; emails: any[] }) => {
    if (!groupEmails.length) return null;
    return (
      <div>
        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 sticky top-0 z-10">{label}</div>
        {groupEmails.map((e: any) => <EmailRow key={e.id} email={e} />)}
      </div>
    );
  };

  const SequencesPanel = () => (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-80 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b flex items-center justify-between bg-background">
          <span className="text-sm font-semibold">Sequences</span>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowNewSequenceDialog(true)}><Plus className="h-3.5 w-3.5" /> New</Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {seqLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !sequences?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <ListOrdered className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No sequences yet</p>
              <p className="text-xs mt-1">Create your first automated outreach sequence</p>
              <Button size="sm" className="mt-4 gap-1" onClick={() => setShowNewSequenceDialog(true)}><Plus className="h-3.5 w-3.5" /> Create Sequence</Button>
            </div>
          ) : sequences.map((seq: any) => (
            <div key={seq.id} className={`px-3 py-3 border-b border-border/20 cursor-pointer hover:bg-accent/40 transition-colors ${selectedSequenceId === seq.id ? "bg-accent/60" : ""}`} onClick={() => setSelectedSequenceId(seq.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{seq.name}</p>
                  {seq.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{seq.description}</p>}
                </div>
                <Badge variant="outline" className={`text-xs shrink-0 ${seq.status === "active" ? "border-emerald-500 text-emerald-600" : seq.status === "paused" ? "border-orange-500 text-orange-600" : "text-muted-foreground"}`}>{seq.status}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{seq.stepCount ?? 0} step{(seq.stepCount ?? 0) !== 1 ? "s" : ""}</span>
                {seq.totalContacts > 0 && <span>{seq.totalContacts} contacts</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/10">
        {!selectedSeq ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ListOrdered className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-sm">Select a sequence to view or edit it</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{selectedSeq.name}</h2>
                {selectedSeq.description && <p className="text-sm text-muted-foreground mt-1">{selectedSeq.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedSeq.status !== "active" ? (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-emerald-600 border-emerald-500 hover:bg-emerald-50" onClick={() => updateSeqMutation.mutate({ id: selectedSeq.id, status: "active" })}><Play className="h-3.5 w-3.5" /> Activate</Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-orange-600 border-orange-400" onClick={() => updateSeqMutation.mutate({ id: selectedSeq.id, status: "paused" })}><Pause className="h-3.5 w-3.5" /> Pause</Button>
                )}
                <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this sequence?")) deleteSeqMutation.mutate({ id: selectedSeq.id }); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Email Steps</h3>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditingStepId(null); setStepForm({ subject: "", body: "", delayDays: 1 }); setShowStepDialog(true); }}><Plus className="h-3.5 w-3.5" /> Add Step</Button>
              </div>
              {!selectedSeq.steps?.length ? (
                <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No steps yet. Add the first email in your sequence.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedSeq.steps.map((step: any, idx: number) => (
                    <div key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</div>
                        {idx < selectedSeq.steps.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                      </div>
                      <div className="flex-1 border rounded-lg p-3 bg-background mb-1 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{step.subject}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{step.body}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent" onClick={() => { setEditingStepId(step.id); setStepForm({ subject: step.subject, body: step.body, delayDays: step.delayDays }); setShowStepDialog(true); }}><Edit2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
                            <button className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent" onClick={() => { if (confirm("Delete step?")) deleteStepMutation.mutate({ stepId: step.id }); }}><X className="h-3.5 w-3.5 text-destructive" /></button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{idx === 0 ? "Send immediately" : `Wait ${step.delayDays} day${step.delayDays !== 1 ? "s" : ""} after previous`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const ReadingPane = () => {
    if (!selectedEmail) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
          <MailOpen className="h-14 w-14 opacity-15 mb-4" />
          <p className="text-sm font-medium">Select an email to read</p>
          <p className="text-xs mt-1 opacity-70">Your messages will appear here</p>
        </div>
      );
    }
    const detail = emailDetail?.id === selectedEmail.id ? emailDetail : null;
    const bodyRaw = (detail as any)?.bodyHtml || (detail as any)?.bodyText || selectedEmail.bodyHtml || selectedEmail.bodyText || "";
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <div className="border-b px-4 py-2.5 flex items-center gap-2 bg-background shrink-0">
          <h2 className="font-semibold flex-1 truncate text-sm">{selectedEmail.subject || "(No subject)"}</h2>
          <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent" onClick={e => toggleStar(e, selectedEmail.id)}><Star className={`h-4 w-4 ${starredEmails.has(selectedEmail.id) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`} /></button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => archiveEmailMutation.mutate({ id: selectedEmail.id })} disabled={archiveEmailMutation.isPending}><Archive className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setDeleteTargetId(selectedEmail.id); setShowDeleteConfirm(true); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/70 to-primary shrink-0 flex items-center justify-center text-primary-foreground font-semibold text-sm select-none">{(selectedEmail.fromName || selectedEmail.fromEmail || "?")[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{selectedEmail.fromName ? `${selectedEmail.fromName} <${selectedEmail.fromEmail}>` : selectedEmail.fromEmail}</span>
                <Badge variant="secondary" className="text-xs gap-1"><span className={`h-1.5 w-1.5 rounded-full ${(categoryConfig[selectedEmail.category || "general"] || categoryConfig.general).dot}`} />{(categoryConfig[selectedEmail.category || "general"] || categoryConfig.general).label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{new Date(selectedEmail.receivedAt).toLocaleString()}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0 gap-1" onClick={() => reparseEmailMutation.mutate({ id: selectedEmail.id })} disabled={reparseEmailMutation.isPending}>
              {reparseEmailMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}Reparse
            </Button>
          </div>
          {(detail as any)?.documents?.length > 0 && (
            <div className="flex flex-wrap gap-2 py-2 border-y">
              <span className="text-xs text-muted-foreground font-medium w-full">Parsed Documents ({(detail as any).documents.length})</span>
              {(detail as any).documents.map((doc: any) => <Badge key={doc.id} variant="secondary" className="text-xs gap-1"><FileText className="h-3 w-3" />{doc.documentType?.replace(/_/g, " ")}{doc.totalAmount && ` — $${Number(doc.totalAmount).toFixed(2)}`}</Badge>)}
            </div>
          )}
          <EmailBody body={bodyRaw} />
          <div className="border rounded-xl p-3 space-y-2 bg-background">
            <div className="flex items-center gap-2 text-sm">
              <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-xs">Reply to <span className="font-medium text-foreground">{selectedEmail.fromName || selectedEmail.fromEmail}</span></span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700" onClick={() => handleGenerateAiReply(selectedEmail)} disabled={isGeneratingReply && aiReplyEmailId === selectedEmail.id}>
                {isGeneratingReply && aiReplyEmailId === selectedEmail.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}AI Reply
              </Button>
            </div>
            <Textarea placeholder="Write a reply..." rows={3} className="text-sm resize-none border bg-accent/20" value={replyText} onChange={e => setReplyText(e.target.value)} />
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { if (replyText.trim()) { navigator.clipboard.writeText(replyText.trim()); toast.success("Reply copied — paste in Gmail to send"); setReplyText(""); } }}><Send className="h-3.5 w-3.5" /> Send</Button>
              <div className="relative" ref={cannedPickerRef}>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setShowCannedPicker(p => !p); setCannedSearch(""); }}><BookOpen className="h-3.5 w-3.5" /> Canned</Button>
                {showCannedPicker && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-2 border-b"><Input placeholder="Search canned responses..." className="h-7 text-xs" value={cannedSearch} onChange={e => setCannedSearch(e.target.value)} autoFocus /></div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {(cannedResponses ?? []).filter((r: any) => !cannedSearch || r.name.toLowerCase().includes(cannedSearch.toLowerCase()) || r.content.toLowerCase().includes(cannedSearch.toLowerCase())).map((r: any) => (
                        <div key={r.id} className="px-3 py-2 hover:bg-accent cursor-pointer" onClick={() => insertCannedResponse(r.content, r.id)}>
                          <p className="text-xs font-medium truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{r.content.substring(0, 60)}</p>
                        </div>
                      ))}
                      {!(cannedResponses ?? []).length && <div className="px-3 py-4 text-xs text-muted-foreground text-center">No canned responses. <button className="text-primary underline" onClick={() => { setShowCannedPicker(false); setShowCannedManager(true); }}>Create one</button></div>}
                    </div>
                    <div className="border-t px-3 py-1.5"><button className="text-xs text-primary hover:underline" onClick={() => { setShowCannedPicker(false); setShowCannedManager(true); }}>Manage canned responses →</button></div>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setReplyText("")}>Discard</Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="-m-3 -mb-4 md:-m-6 lg:-m-8 flex overflow-hidden bg-background" style={{ height: "calc(100vh - 5.25rem)" }}>

        {/* LEFT SIDEBAR */}
        <div className="w-52 shrink-0 flex flex-col border-r bg-background overflow-hidden">
          <div className="p-2 pb-1">
            <Button className="rounded-2xl shadow h-10 w-full gap-2 justify-start pl-4 text-sm font-medium" onClick={() => setShowScanDialog(true)}>
              <PenSquare className="h-4 w-4" />New Email
            </Button>
          </div>
          <nav className="flex-1 overflow-y-auto py-1 space-y-0">
            {sidebarFolders.map(({ key, label, icon: Icon, count }) => (
              <button key={key} className={`flex items-center gap-2.5 pl-3 pr-2 py-1.5 text-sm w-full rounded-r-full transition-colors hover:bg-accent/60 ${activeFolder === key ? "bg-accent font-semibold" : "font-normal"}`} onClick={() => { setActiveFolder(key); setSelectedEmailId(null); setSelectedSequenceId(null); setLabelFilter(null); }}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {count !== undefined && count > 0 && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${activeFolder === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{count}</span>}
              </button>
            ))}
            <div className="pt-2">
              <button className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide w-full hover:text-foreground" onClick={() => setFoldersExpanded(p => !p)}>
                {foldersExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Folders<Plus className="h-3 w-3 ml-auto" />
              </button>
              {foldersExpanded && userFolders.map(f => (
                <button key={f} className="flex items-center gap-2 pl-6 pr-3 py-1 text-sm w-full rounded-r-full hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" /><span className="flex-1 text-left truncate">{f}</span>
                </button>
              ))}
            </div>
            <div className="pt-1">
              <button className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide w-full hover:text-foreground" onClick={() => setLabelsExpanded(p => !p)}>
                {labelsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Labels<Plus className="h-3 w-3 ml-auto" />
              </button>
              {labelsExpanded && userLabels.map(({ label, color }) => (
                <button key={label} className={`flex items-center gap-2 pl-6 pr-3 py-1 text-sm w-full rounded-r-full hover:bg-accent/60 transition-colors ${labelFilter === label ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setLabelFilter(labelFilter === label ? null : label)}>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color}`} /><span className="flex-1 text-left truncate">{label}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="px-2 py-1.5 border-t flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Refresh" onClick={() => utils.emailScanning.list.invalidate()}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Auto-categorize" onClick={() => bulkCategorizeMutation.mutate({ useAi: false, limit: 100 })} disabled={bulkCategorizeMutation.isPending}>{bulkCategorizeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Scan inbox" onClick={() => scanNowMutation.mutate({ folders: ["INBOX"], unseenOnly: false, limit: 200 })} disabled={scanNowMutation.isPending}>{scanNowMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />}</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Canned responses" onClick={() => setShowCannedManager(true)}><BookOpen className="h-3.5 w-3.5" /></Button>
            <div className="ml-auto flex items-center pr-1"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /></div>
          </div>
        </div>

        {/* MIDDLE + RIGHT */}
        {activeFolder === "sequences" ? <SequencesPanel /> : (
          <>
            {/* Email list */}
            <div className="w-80 shrink-0 border-r flex flex-col overflow-hidden">
              <div className="border-b px-2 py-1.5 flex items-center gap-0.5 bg-background shrink-0">
                {(["important", "sales", "hiring", "raise", "other"] as Tab[]).map(t => (
                  <button key={t} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${activeTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`} onClick={() => setActiveTab(t)}>{t}</button>
                ))}
              </div>
              <div className="px-2 py-1.5 border-b shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Search emails..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-7 rounded-full bg-accent/40 border-0 focus-visible:ring-1 text-xs" />
                </div>
              </div>
              {activeFolder === "inbox" && (
                <div className="px-3 py-1.5 border-b flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span className="font-medium text-foreground">All {tabEmails.length}</span>
                  <span>• <span className="text-orange-500 font-medium">Reply Today {tabEmails.filter((e: any) => isReplyToday(e)).length}</span></span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {emailsLoading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : !tabEmails.length ? (
                  <div className="text-center py-16 text-muted-foreground"><Mail className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No emails found</p>{searchQuery && <p className="text-xs mt-1">No results for "{searchQuery}"</p>}</div>
                ) : (
                  <>
                    <EmailGroup label="Pinned" emails={grouped.pinned} />
                    <EmailGroup label="Today" emails={grouped.today} />
                    <EmailGroup label="Yesterday" emails={grouped.yesterday} />
                    <EmailGroup label="This Week" emails={grouped.thisWeek} />
                    <EmailGroup label="Older" emails={grouped.older} />
                  </>
                )}
              </div>
            </div>
            <ReadingPane />
          </>
        )}
      </div>

      {/* IMAP Dialog */}
      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Connect Email Inbox</DialogTitle><DialogDescription>Connect via IMAP to import and categorize emails.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Email Provider</Label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}><SelectTrigger><SelectValue placeholder="Select provider or enter custom" /></SelectTrigger><SelectContent><SelectItem value="gmail">Gmail</SelectItem><SelectItem value="outlook">Outlook / Office 365</SelectItem><SelectItem value="yahoo">Yahoo Mail</SelectItem><SelectItem value="icloud">iCloud Mail</SelectItem><SelectItem value="custom">Custom IMAP Server</SelectItem></SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>IMAP Host</Label><Input placeholder="imap.gmail.com" value={scanConfig.host} onChange={e => setScanConfig({ ...scanConfig, host: e.target.value })} /></div>
              <div className="space-y-2"><Label>Port</Label><Input type="number" value={scanConfig.port} onChange={e => setScanConfig({ ...scanConfig, port: parseInt(e.target.value) || 993 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email / Username</Label><Input placeholder="you@gmail.com" value={scanConfig.user} onChange={e => setScanConfig({ ...scanConfig, user: e.target.value })} /></div>
              <div className="space-y-2"><Label>Password / App Password</Label><Input type="password" placeholder="••••••••" value={scanConfig.password} onChange={e => setScanConfig({ ...scanConfig, password: e.target.value })} /></div>
            </div>
            <div className="border-t pt-3 space-y-3"><Label className="text-sm font-medium">Scan Options</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Folder</Label><Input value={scanConfig.folder} onChange={e => setScanConfig({ ...scanConfig, folder: e.target.value })} /></div>
                <div className="space-y-2"><Label>Max Emails</Label><Input type="number" value={scanConfig.limit} onChange={e => setScanConfig({ ...scanConfig, limit: parseInt(e.target.value) || 50 })} /></div>
              </div>
              <div className="flex flex-col gap-2">
                {([["unseenOnly", "Only unread emails"], ["markAsSeen", "Mark as read after scanning"], ["fullAiParsing", "Full AI parsing (slower, more accurate)"]] as const).map(([field, label]) => (
                  <div key={field} className="flex items-center space-x-2"><Checkbox id={field} checked={scanConfig[field]} onCheckedChange={v => setScanConfig({ ...scanConfig, [field]: !!v })} /><Label htmlFor={field} className="text-sm">{label}</Label></div>
                ))}
              </div>
            </div>
            {(selectedPreset === "gmail" || selectedPreset === "outlook") && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950 p-3 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">Note for {selectedPreset === "gmail" ? "Gmail" : "Outlook"}:</p>
                <p className="text-amber-700 dark:text-amber-300 mt-1">{selectedPreset === "gmail" ? "Use an App Password. Go to Google Account › Security › 2-Step Verification › App passwords." : "Enable IMAP in Outlook and use an App Password if 2FA is enabled."}</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { if (!scanConfig.host || !scanConfig.user || !scanConfig.password) { toast.error("Fill in connection details"); return; } testConnectionMutation.mutate({ host: scanConfig.host, port: scanConfig.port, secure: true, user: scanConfig.user, password: scanConfig.password }); }} disabled={testConnectionMutation.isPending}>{testConnectionMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing...</> : <><Settings className="h-4 w-4 mr-2" />Test Connection</>}</Button>
            <Button onClick={() => { if (!scanConfig.host || !scanConfig.user || !scanConfig.password) { toast.error("Fill in connection details"); return; } scanInboxMutation.mutate(scanConfig); }} disabled={scanInboxMutation.isPending}>{scanInboxMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning...</> : <><Inbox className="h-4 w-4 mr-2" />Scan Inbox</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Reply Dialog */}
      <Dialog open={showAiReplyDialog} onOpenChange={setShowAiReplyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-500" />AI-Generated Reply</DialogTitle><DialogDescription>Review and send the AI-generated reply</DialogDescription></DialogHeader>
          {generatedReply && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm"><Badge variant="outline" className="capitalize">{generatedReply.tone} tone</Badge><span className="text-muted-foreground">Confidence: {generatedReply.confidence}%</span></div>
              <div className="space-y-2"><Label>Subject</Label><Input value={generatedReply.subject} onChange={e => setGeneratedReply({ ...generatedReply, subject: e.target.value })} /></div>
              <div className="space-y-2"><Label>Message</Label><Textarea value={generatedReply.body} onChange={e => setGeneratedReply({ ...generatedReply, body: e.target.value })} rows={10} className="font-mono text-sm" /></div>
              {generatedReply.suggestedActions && generatedReply.suggestedActions.length > 0 && <div className="space-y-2"><Label className="text-muted-foreground">Suggested Actions</Label><div className="flex flex-wrap gap-2">{generatedReply.suggestedActions.map((a, i) => <Badge key={i} variant="secondary">{a}</Badge>)}</div></div>}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleSendReply(false)} disabled={createReplyTaskMutation.isPending}>{createReplyTaskMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}Queue for Approval</Button>
            <Button onClick={() => handleSendReply(true)} disabled={sendReplyMutation.isPending} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">{sendReplyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Send Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Email</DialogTitle><DialogDescription>Are you sure? This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTargetId && deleteEmailMutation.mutate({ id: deleteTargetId })} disabled={deleteEmailMutation.isPending}>{deleteEmailMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Sequence Dialog */}
      <Dialog open={showNewSequenceDialog} onOpenChange={setShowNewSequenceDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Sequence</DialogTitle><DialogDescription>Build a multi-step automated email sequence</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input placeholder="e.g. Sales Outreach Q2" value={newSeqForm.name} onChange={e => setNewSeqForm({ ...newSeqForm, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label><Textarea placeholder="What is this sequence for?" rows={2} value={newSeqForm.description} onChange={e => setNewSeqForm({ ...newSeqForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSequenceDialog(false)}>Cancel</Button>
            <Button onClick={() => createSeqMutation.mutate({ name: newSeqForm.name, description: newSeqForm.description || undefined })} disabled={!newSeqForm.name.trim() || createSeqMutation.isPending}>{createSeqMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Dialog */}
      <Dialog open={showStepDialog} onOpenChange={setShowStepDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingStepId ? "Edit Step" : "Add Step"}</DialogTitle><DialogDescription>Configure this email step in the sequence</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Subject</Label><Input placeholder="Email subject line" value={stepForm.subject} onChange={e => setStepForm({ ...stepForm, subject: e.target.value })} /></div>
            <div className="space-y-2"><Label>Body</Label><Textarea placeholder="Email body..." rows={6} value={stepForm.body} onChange={e => setStepForm({ ...stepForm, body: e.target.value })} /></div>
            <div className="space-y-2"><Label>Delay (days after previous step)</Label><Input type="number" min={0} value={stepForm.delayDays} onChange={e => setStepForm({ ...stepForm, delayDays: parseInt(e.target.value) || 0 })} /><p className="text-xs text-muted-foreground">Set to 0 to send immediately (first step only)</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStepDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!stepForm.subject.trim() || !stepForm.body.trim()) { toast.error("Subject and body required"); return; }
              if (editingStepId) updateStepMutation.mutate({ stepId: editingStepId, subject: stepForm.subject, body: stepForm.body, delayDays: stepForm.delayDays });
              else addStepMutation.mutate({ sequenceId: selectedSequenceId!, subject: stepForm.subject, body: stepForm.body, delayDays: stepForm.delayDays });
            }} disabled={addStepMutation.isPending || updateStepMutation.isPending}>
              {(addStepMutation.isPending || updateStepMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}{editingStepId ? "Update" : "Add"} Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Canned Responses Manager */}
      <Dialog open={showCannedManager} onOpenChange={v => { setShowCannedManager(v); if (!v) setCannedForm({ open: false, id: null, name: "", content: "", shortcut: "", category: "" }); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Canned Responses</DialogTitle><DialogDescription>Pre-written replies you can insert while composing</DialogDescription></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
            {!cannedForm.open ? (
              <>
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5" onClick={() => setCannedForm({ open: true, id: null, name: "", content: "", shortcut: "", category: "" })}><Plus className="h-4 w-4" /> New Canned Response</Button>
                </div>
                {!(cannedResponses ?? []).length ? (
                  <div className="text-center py-12 text-muted-foreground"><BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No canned responses yet</p><p className="text-xs mt-1">Create your first template to speed up email replies</p></div>
                ) : (
                  <div className="space-y-2">
                    {(cannedResponses ?? []).map((r: any) => (
                      <div key={r.id} className="border rounded-lg p-3 group hover:border-primary/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2"><p className="text-sm font-medium">{r.name}</p>{r.shortcut && <Badge variant="outline" className="text-xs">{r.shortcut}</Badge>}{r.category && <Badge variant="secondary" className="text-xs">{r.category}</Badge>}</div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.content}</p>
                            {r.usageCount > 0 && <p className="text-xs text-muted-foreground mt-1">Used {r.usageCount} time{r.usageCount !== 1 ? "s" : ""}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCannedForm({ open: true, id: r.id, name: r.name, content: r.content, shortcut: r.shortcut || "", category: r.category || "" })}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete?")) deleteCannedMutation.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2"><Button variant="ghost" size="sm" className="gap-1" onClick={() => setCannedForm({ open: false, id: null, name: "", content: "", shortcut: "", category: "" })}>← Back</Button><h3 className="text-sm font-semibold">{cannedForm.id ? "Edit" : "New"} Canned Response</h3></div>
                <div className="space-y-2"><Label>Name</Label><Input placeholder="e.g. Meeting follow-up" value={cannedForm.name} onChange={e => setCannedForm({ ...cannedForm, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Content</Label><Textarea placeholder="Pre-written reply content..." rows={6} value={cannedForm.content} onChange={e => setCannedForm({ ...cannedForm, content: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Shortcut <span className="text-muted-foreground text-xs">(optional)</span></Label><Input placeholder="e.g. /followup" value={cannedForm.shortcut} onChange={e => setCannedForm({ ...cannedForm, shortcut: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Category <span className="text-muted-foreground text-xs">(optional)</span></Label><Input placeholder="e.g. Sales, Support" value={cannedForm.category} onChange={e => setCannedForm({ ...cannedForm, category: e.target.value })} /></div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setCannedForm({ open: false, id: null, name: "", content: "", shortcut: "", category: "" })}>Cancel</Button>
                  <Button onClick={() => {
                    if (!cannedForm.name.trim() || !cannedForm.content.trim()) { toast.error("Name and content required"); return; }
                    if (cannedForm.id) updateCannedMutation.mutate({ id: cannedForm.id, name: cannedForm.name, content: cannedForm.content, shortcut: cannedForm.shortcut || undefined, category: cannedForm.category || undefined });
                    else createCannedMutation.mutate({ name: cannedForm.name, content: cannedForm.content, shortcut: cannedForm.shortcut || undefined, category: cannedForm.category || undefined });
                  }} disabled={createCannedMutation.isPending || updateCannedMutation.isPending}>
                    {(createCannedMutation.isPending || updateCannedMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}{cannedForm.id ? "Update" : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
