import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Scale, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "-";
  try { return format(new Date(v), "MMM d, yyyy"); } catch { return "-"; }
}

const typeLabels: Record<string, string> = {
  trademark: "Trademark",
  litigation: "Litigation",
  compliance: "Compliance",
  contract_dispute: "Contract Dispute",
  ip: "IP",
  regulatory: "Regulatory",
  employment: "Employment",
  other: "Other",
};

const statusColors: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  pending: "bg-muted text-foreground font-semibold",
  in_review: "bg-primary/10 text-primary",
  resolved: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
  dismissed: "bg-muted text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-muted text-muted-foreground",
  high: "bg-muted text-foreground font-semibold",
  critical: "bg-[oklch(0.30_0.02_262)] text-white",
};

export default function CaseTracker() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const toggleCard = (key: string) => setCardFilter((cur) => (cur === key ? null : key));
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    caseNumber: "",
    title: "",
    type: "other" as string,
    status: "open" as string,
    priority: "medium" as string,
    opposingParty: "",
    attorney: "",
    lawFirm: "",
    filedDate: "",
    nextHearingDate: "",
    jurisdiction: "",
    description: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: cases, isLoading } = trpc.legalCases.list.useQuery();

  const createCase = trpc.legalCases.create.useMutation({
    onSuccess: () => {
      toast.success("Case created");
      setIsOpen(false);
      setForm({
        caseNumber: "", title: "", type: "other", status: "open", priority: "medium",
        opposingParty: "", attorney: "", lawFirm: "", filedDate: "", nextHearingDate: "",
        jurisdiction: "", description: "", notes: "",
      });
      utils.legalCases.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!cases) return [];
    return cases.filter((c: any) => {
      const matchSearch = c.title?.toLowerCase().includes(search.toLowerCase()) ||
        c.caseNumber?.toLowerCase().includes(search.toLowerCase()) ||
        c.opposingParty?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      const matchType = typeFilter === "all" || c.type === typeFilter;
      const matchCard =
        !cardFilter ||
        (cardFilter === "open" && c.status === "open") ||
        (cardFilter === "pending" && (c.status === "pending" || c.status === "in_review")) ||
        (cardFilter === "resolved" && (c.status === "resolved" || c.status === "closed")) ||
        (cardFilter === "critical" && (c.priority === "critical" || c.priority === "high"));
      return matchSearch && matchStatus && matchType && matchCard;
    });
  }, [cases, search, statusFilter, typeFilter, cardFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCase.mutate({
      caseNumber: form.caseNumber || undefined,
      title: form.title,
      type: form.type as any,
      status: form.status as any,
      priority: form.priority as any,
      opposingParty: form.opposingParty || undefined,
      attorney: form.attorney || undefined,
      lawFirm: form.lawFirm || undefined,
      filedDate: form.filedDate || undefined,
      nextHearingDate: form.nextHearingDate || undefined,
      jurisdiction: form.jurisdiction || undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
    });
  };

  // Summary stats
  const openCount = cases?.filter((c: any) => c.status === "open").length ?? 0;
  const pendingCount = cases?.filter((c: any) => c.status === "pending" || c.status === "in_review").length ?? 0;
  const resolvedCount = cases?.filter((c: any) => c.status === "resolved" || c.status === "closed").length ?? 0;
  const criticalCount = cases?.filter((c: any) => c.priority === "critical" || c.priority === "high").length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Scale className="h-8 w-8" />
            Legal Case Tracker
          </h1>
          <p className="text-muted-foreground mt-1">
            Track litigation, IP, compliance, and contract disputes
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Case
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Add Legal Case</DialogTitle>
                <DialogDescription>Create a new case for tracking.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Case Number</Label>
                    <Input placeholder="e.g. LC-2026-001" value={form.caseNumber} onChange={(e) => setForm({ ...form, caseNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(typeLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opposing Party</Label>
                    <Input value={form.opposingParty} onChange={(e) => setForm({ ...form, opposingParty: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Attorney</Label>
                    <Input value={form.attorney} onChange={(e) => setForm({ ...form, attorney: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Law Firm</Label>
                    <Input value={form.lawFirm} onChange={(e) => setForm({ ...form, lawFirm: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Jurisdiction</Label>
                    <Input value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Filed Date</Label>
                    <Input type="date" value={form.filedDate} onChange={(e) => setForm({ ...form, filedDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Next Hearing</Label>
                    <Input type="date" value={form.nextHearingDate} onChange={(e) => setForm({ ...form, nextHearingDate: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createCase.isPending}>
                  {createCase.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Case
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards — click to filter the list */}
      <div className="grid grid-cols-4 gap-4">
        {([
          { key: "open", label: "Open Cases", value: openCount, color: "text-primary" },
          { key: "pending", label: "Pending / In Review", value: pendingCount, color: "text-foreground" },
          { key: "resolved", label: "Resolved / Closed", value: resolvedCount, color: "text-muted-foreground" },
          { key: "critical", label: "High / Critical", value: criticalCount, color: "text-foreground" },
        ] as const).map((c) => (
          <Card
            key={c.key}
            role="button"
            tabIndex={0}
            aria-pressed={cardFilter === c.key}
            onClick={() => toggleCard(c.key)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCard(c.key); } }}
            className={`cursor-pointer transition-colors hover:bg-muted/40 ${cardFilter === c.key ? "ring-2 ring-primary" : ""}`}
          >
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <div className={`text-2xl font-semibold font-display tabular-nums ${c.color}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search cases..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(typeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No cases found</p>
              <p className="text-sm">Create your first legal case to start tracking.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">Case #</TableHead>
                    <TableHead className="min-w-[180px]">Title</TableHead>
                    <TableHead className="min-w-[110px]">Type</TableHead>
                    <TableHead className="min-w-[90px]">Status</TableHead>
                    <TableHead className="min-w-[90px]">Priority</TableHead>
                    <TableHead className="min-w-[140px]">Opposing Party</TableHead>
                    <TableHead className="min-w-[120px]">Attorney</TableHead>
                    <TableHead className="min-w-[100px]">Filed Date</TableHead>
                    <TableHead className="min-w-[110px]">Next Hearing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c: any) => (
                    <TableRow key={c.id} className="h-9">
                      <TableCell className="font-mono text-xs">{c.caseNumber || "-"}</TableCell>
                      <TableCell className="font-medium">{c.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{typeLabels[c.type] || c.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[c.status] || "bg-muted text-muted-foreground"}>
                          {c.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityColors[c.priority] || "bg-muted text-muted-foreground"}>
                          {c.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.opposingParty || "-"}</TableCell>
                      <TableCell>{c.attorney || "-"}</TableCell>
                      <TableCell>{fmtDate(c.filedDate)}</TableCell>
                      <TableCell>{fmtDate(c.nextHearingDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
