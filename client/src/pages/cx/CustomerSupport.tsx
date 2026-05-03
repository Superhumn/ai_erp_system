import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Headphones, Search, Plus, Loader2, Sparkles,
  ChevronDown, ChevronUp, Send, Clock, CheckCircle2,
  AlertTriangle, Mail, MessageSquare, Phone, Share2,
  Filter, BarChart3,
} from "lucide-react";

// ── Types ──

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "open" | "in_progress" | "waiting" | "resolved" | "closed";
type Channel = "email" | "chat" | "phone" | "social";

interface Ticket {
  id: number;
  subject: string;
  customer: string;
  email: string;
  priority: Priority;
  status: Status;
  channel: Channel;
  created: string;
  updated: string;
  description: string;
  aiSuggestion?: string;
}

// ── Color maps ──

const priorityColors: Record<Priority, string> = {
  low: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  medium: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  high: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  urgent: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const statusColors: Record<Status, string> = {
  open: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_progress: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  waiting: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  resolved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

const channelIcons: Record<Channel, typeof Mail> = {
  email: Mail,
  chat: MessageSquare,
  phone: Phone,
  social: Share2,
};

// ── Seed data ──

const SEED_TICKETS: Ticket[] = [
  { id: 1, subject: "Order #4521 not received", customer: "Sarah Chen", email: "sarah@acme.com", priority: "high", status: "open", channel: "email", created: "2026-04-29T10:30:00Z", updated: "2026-04-29T10:30:00Z", description: "Customer reports order placed 2 weeks ago has not arrived. Tracking shows delivered but they never received it." },
  { id: 2, subject: "Bulk pricing inquiry", customer: "Mike Johnson", email: "mike@bigretail.com", priority: "medium", status: "in_progress", channel: "chat", created: "2026-04-28T14:00:00Z", updated: "2026-04-29T09:15:00Z", description: "Requesting volume discount for 500+ units monthly. Current account does 200/mo." },
  { id: 3, subject: "Product quality complaint - Batch #889", customer: "Lisa Park", email: "lisa@organicfoods.com", priority: "urgent", status: "open", channel: "phone", created: "2026-04-29T08:00:00Z", updated: "2026-04-29T08:00:00Z", description: "Reports off-taste in latest batch. Requesting lab report and replacement shipment. Potential recall concern." },
  { id: 4, subject: "Invoice discrepancy", customer: "Tom Williams", email: "tom@freshmart.com", priority: "low", status: "waiting", channel: "email", created: "2026-04-27T16:00:00Z", updated: "2026-04-28T11:00:00Z", description: "Invoice #INV-3892 shows $12,500 but PO was for $11,800. Needs credit memo for difference." },
  { id: 5, subject: "API integration help", customer: "Dev Team @ NaturalCo", email: "dev@naturalco.com", priority: "medium", status: "in_progress", channel: "chat", created: "2026-04-26T09:00:00Z", updated: "2026-04-29T14:00:00Z", description: "Need help setting up EDI 850/856 integration. Getting 422 errors on PO submission." },
  { id: 6, subject: "Return authorization request", customer: "Amy Rodriguez", email: "amy@healthplus.com", priority: "medium", status: "resolved", channel: "email", created: "2026-04-25T10:00:00Z", updated: "2026-04-28T16:00:00Z", description: "Wants to return 50 units of SKU-2234 due to overstock. Within 30-day return window." },
  { id: 7, subject: "Shipping damage claim", customer: "Bob Fischer", email: "bob@grocerychain.com", priority: "high", status: "open", channel: "phone", created: "2026-04-29T11:00:00Z", updated: "2026-04-29T11:00:00Z", description: "Pallet arrived with 30% damage. Photos attached. Requesting replacement + freight claim filing." },
  { id: 8, subject: "Account setup for new location", customer: "Carol Diaz", email: "carol@freshfarms.com", priority: "low", status: "closed", channel: "social", created: "2026-04-20T13:00:00Z", updated: "2026-04-22T09:00:00Z", description: "New warehouse location in Austin, TX needs separate shipping/billing setup." },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CustomerSupport() {
  const [tickets, setTickets] = useState<Ticket[]>(SEED_TICKETS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ subject: "", customer: "", email: "", priority: "medium" as Priority, channel: "email" as Channel, description: "" });

  const aiMutation = trpc.ai.query.useMutation({
    onSuccess: (data: any, variables: any) => {
      const text = data.response || data.answer || "No suggestion available.";
      const ticketId = variables?.context?.ticketId;
      if (ticketId) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, aiSuggestion: text } : t));
      }
      setAiLoading(null);
    },
    onError: () => { toast.error("AI suggestion failed"); setAiLoading(null); },
  });

  const handleAiSuggest = (ticket: Ticket) => {
    setAiLoading(ticket.id);
    aiMutation.mutate({
      prompt: `You are a customer support agent. Draft a professional, empathetic reply for this ticket:\n\nSubject: ${ticket.subject}\nCustomer: ${ticket.customer}\nPriority: ${ticket.priority}\nDescription: ${ticket.description}\n\nKeep the reply concise (3-5 sentences). Be solution-oriented.`,
      context: { ticketId: ticket.id },
    });
  };

  const handleReply = (ticketId: number) => {
    const text = replyText[ticketId]?.trim();
    if (!text) return;
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: "in_progress" as Status, updated: new Date().toISOString() } : t));
    setReplyText(prev => ({ ...prev, [ticketId]: "" }));
    toast.success("Reply sent");
  };

  const handleStatusChange = (ticketId: number, status: Status) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status, updated: new Date().toISOString() } : t));
    toast.success(`Ticket #${ticketId} marked ${status.replace(/_/g, " ")}`);
  };

  const handleCreate = () => {
    if (!newForm.subject || !newForm.customer) return;
    const ticket: Ticket = {
      id: Date.now(),
      ...newForm,
      status: "open",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    setTickets(prev => [ticket, ...prev]);
    setNewForm({ subject: "", customer: "", email: "", priority: "medium", channel: "email", description: "" });
    setShowNew(false);
    toast.success("Ticket created");
  };

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.subject.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [tickets, search, statusFilter, priorityFilter]);

  // ── KPIs ──
  const openCount = tickets.filter(t => t.status === "open" || t.status === "in_progress").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;
  const avgResponseMins = 42; // mock
  const csat = 4.3; // mock

  return (
    <div className="space-y-2 p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Headphones className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Customer Support</h1>
          <Badge variant="secondary" className="text-xs">{tickets.length} tickets</Badge>
        </div>
        <Button size="sm" onClick={() => setShowNew(!showNew)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Ticket
        </Button>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Open", value: openCount, icon: AlertTriangle, color: "text-blue-500" },
          { label: "Resolved", value: resolvedCount, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "Avg Response", value: `${avgResponseMins}m`, icon: Clock, color: "text-amber-500" },
          { label: "CSAT", value: `${csat}/5`, icon: BarChart3, color: "text-violet-500" },
        ].map(kpi => (
          <Card key={kpi.label} className="p-2">
            <div className="flex items-center gap-2">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-base font-semibold">{kpi.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* New ticket form */}
      {showNew && (
        <Card className="p-3 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <Input placeholder="Subject" value={newForm.subject} onChange={e => setNewForm(f => ({ ...f, subject: e.target.value }))} className="col-span-2 text-sm h-8" />
            <Input placeholder="Customer" value={newForm.customer} onChange={e => setNewForm(f => ({ ...f, customer: e.target.value }))} className="text-sm h-8" />
            <Input placeholder="Email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} className="text-sm h-8" />
          </div>
          <div className="flex gap-2 items-end">
            <Select value={newForm.priority} onValueChange={v => setNewForm(f => ({ ...f, priority: v as Priority }))}>
              <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["low", "medium", "high", "urgent"] as Priority[]).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newForm.channel} onValueChange={v => setNewForm(f => ({ ...f, channel: v as Channel }))}>
              <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["email", "chat", "phone", "social"] as Channel[]).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Description" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} rows={1} className="flex-1 text-sm" />
            <Button size="sm" onClick={handleCreate}>Create</Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-8 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-sm"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(["open", "in_progress", "waiting", "resolved", "closed"] as Status[]).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {(["urgent", "high", "medium", "low"] as Priority[]).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Ticket list */}
      <div className="space-y-1">
        {filtered.map(ticket => {
          const expanded = expandedId === ticket.id;
          const ChannelIcon = channelIcons[ticket.channel];
          return (
            <Card key={ticket.id} className="overflow-hidden">
              {/* Row */}
              <button
                className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : ticket.id)}
              >
                <span className="text-xs text-muted-foreground w-12 shrink-0">#{ticket.id}</span>
                <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{ticket.subject}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">{ticket.customer}</span>
                <Badge variant="secondary" className={`${priorityColors[ticket.priority]} text-[11px] shrink-0`}>{ticket.priority}</Badge>
                <Badge variant="secondary" className={`${statusColors[ticket.status]} text-[11px] shrink-0`}>{ticket.status.replace(/_/g, " ")}</Badge>
                <span className="text-xs text-muted-foreground w-14 text-right shrink-0">{timeAgo(ticket.updated)}</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>

              {/* Expanded detail */}
              {expanded && (
                <div className="px-3 pb-3 pt-1 border-t space-y-2">
                  <p className="text-sm text-muted-foreground">{ticket.description}</p>

                  {/* Status actions */}
                  <div className="flex gap-1 flex-wrap">
                    {(["open", "in_progress", "waiting", "resolved", "closed"] as Status[]).map(s => (
                      <Button key={s} size="sm" variant={ticket.status === s ? "default" : "outline"} className="h-6 text-xs px-2"
                        onClick={() => handleStatusChange(ticket.id, s)}>
                        {s.replace(/_/g, " ")}
                      </Button>
                    ))}
                  </div>

                  {/* AI suggestion */}
                  <div className="flex items-start gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => handleAiSuggest(ticket)} disabled={aiLoading === ticket.id}>
                      {aiLoading === ticket.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      AI Suggest
                    </Button>
                    {ticket.aiSuggestion && (
                      <div className="flex-1 bg-violet-500/5 border border-violet-500/20 rounded p-2">
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Sparkles className="h-3 w-3 text-violet-500" /> AI Suggested Reply</p>
                        <p className="text-sm">{ticket.aiSuggestion}</p>
                        <Button size="sm" variant="ghost" className="h-5 text-xs mt-1 px-1" onClick={() => setReplyText(prev => ({ ...prev, [ticket.id]: ticket.aiSuggestion || "" }))}>
                          Use this
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Reply box */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type reply..."
                      value={replyText[ticket.id] || ""}
                      onChange={e => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                      rows={2}
                      className="flex-1 text-sm"
                    />
                    <Button size="sm" className="self-end h-8" onClick={() => handleReply(ticket.id)} disabled={!replyText[ticket.id]?.trim()}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Send
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">No tickets match filters</div>
        )}
      </div>
    </div>
  );
}
