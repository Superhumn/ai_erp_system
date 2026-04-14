import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Headphones, Plus, Search, Loader2, MessageSquare, Star,
  AlertTriangle, CheckCircle, Clock, TrendingUp, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Ticket types
const priorities = ["low", "medium", "high", "urgent"] as const;
const statuses = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
const channels = ["email", "chat", "phone", "social", "review"] as const;

const priorityColors: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-600",
  medium: "bg-blue-500/10 text-blue-600",
  high: "bg-amber-500/10 text-amber-600",
  urgent: "bg-red-500/10 text-red-600",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600",
  in_progress: "bg-purple-500/10 text-purple-600",
  waiting: "bg-amber-500/10 text-amber-600",
  resolved: "bg-green-500/10 text-green-600",
  closed: "bg-gray-500/10 text-gray-600",
};

interface Ticket {
  id: number;
  subject: string;
  customerName: string;
  customerEmail: string;
  channel: string;
  priority: string;
  status: string;
  sentiment: string;
  message: string;
  aiSuggestedResponse?: string;
  assignedTo?: string;
  createdAt: string;
  resolvedAt?: string;
}

export default function CustomerSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [formData, setFormData] = useState({
    subject: "", customerName: "", customerEmail: "", channel: "email" as string,
    priority: "medium" as string, message: "",
  });

  // Stats
  const stats = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter(t => t.status === "open" || t.status === "in_progress").length,
    resolved: tickets.filter(t => t.status === "resolved" || t.status === "closed").length,
    avgResponseTime: "< 2h",
    satisfaction: "4.2/5",
  }), [tickets]);

  const handleCreate = () => {
    const newTicket: Ticket = {
      id: Date.now(),
      ...formData,
      status: "open",
      sentiment: "neutral",
      createdAt: new Date().toISOString(),
    };
    setTickets([newTicket, ...tickets]);
    setIsOpen(false);
    setFormData({ subject: "", customerName: "", customerEmail: "", channel: "email", priority: "medium", message: "" });
    toast.success("Ticket created");
  };

  const handleResolve = (id: number) => {
    setTickets(tickets.map(t => t.id === id ? { ...t, status: "resolved", resolvedAt: new Date().toISOString() } : t));
    toast.success("Ticket resolved");
  };

  const filtered = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return t.subject.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q) || t.customerEmail.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] flex items-center gap-2">
            <Headphones className="h-6 w-6" /> Customer Support
          </h1>
          <p className="text-muted-foreground text-sm">Tickets, sentiment analysis, and AI responses</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> New Ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Support Ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Customer Name</Label><Input value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={formData.customerEmail} onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Subject</Label><Input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Channel</Label>
                  <Select value={formData.channel} onValueChange={(v) => setFormData({ ...formData, channel: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {channels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Priority</Label>
                  <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {priorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Message</Label><Textarea value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!formData.subject || !formData.customerName}>Create Ticket</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI bar */}
      <div className="flex items-center gap-4 text-xs border rounded-xl px-3 py-2 bg-card">
        <div><span className="text-muted-foreground">Open</span> <span className="font-bold">{stats.open}</span></div>
        <div className="h-5 w-px bg-border" />
        <div><span className="text-muted-foreground">Resolved</span> <span className="font-bold text-green-600">{stats.resolved}</span></div>
        <div className="h-5 w-px bg-border" />
        <div><span className="text-muted-foreground">Avg Response</span> <span className="font-bold">{stats.avgResponseTime}</span></div>
        <div className="h-5 w-px bg-border" />
        <div><span className="text-muted-foreground">CSAT</span> <span className="font-bold">{stats.satisfaction}</span></div>
        <div className="h-5 w-px bg-border" />
        <div><span className="text-muted-foreground">Total</span> <span className="font-bold">{stats.total}</span></div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tickets */}
      <Card className="py-2">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Headphones className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{tickets.length === 0 ? "No tickets yet" : "No tickets match filters"}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(ticket => {
                const isExpanded = expandedId === ticket.id;
                return (
                  <div key={ticket.id}>
                    <button
                      className={`w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors text-xs ${isExpanded ? "bg-muted/20" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{ticket.subject}</span>
                            <Badge className={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
                            <Badge className={statusColors[ticket.status]}>{ticket.status.replace(/_/g, " ")}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-muted-foreground">
                            <span>{ticket.customerName}</span>
                            <span>{ticket.channel}</span>
                            <span>{format(new Date(ticket.createdAt), "MMM d, h:mm a")}</span>
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 bg-muted/10 border-t space-y-3">
                        <div className="text-sm whitespace-pre-wrap bg-background p-3 rounded border">{ticket.message}</div>
                        {/* AI suggested response */}
                        <div className="bg-primary/5 p-3 rounded border border-primary/20">
                          <p className="text-[10px] text-primary font-medium uppercase tracking-wider mb-1">AI Suggested Response</p>
                          <p className="text-sm">Thank you for reaching out. I understand your concern about "{ticket.subject}". Let me look into this and get back to you shortly.</p>
                        </div>
                        {/* Reply */}
                        <div className="flex gap-2">
                          <Input placeholder="Write a reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} className="h-8 text-sm" />
                          <Button size="sm" className="h-8" onClick={() => { toast.success("Reply sent"); setReplyText(""); }}>Send</Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => handleResolve(ticket.id)}>Resolve</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
