import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Scale, Plus, Search, Loader2,
  DollarSign, Gavel, Upload,
  Calendar, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { DetailSheet } from "@/components/DetailSheet";

const priorityColors: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500/10 text-orange-600",
  medium: "bg-yellow-500/10 text-yellow-600",
  low: "bg-gray-500/10 text-gray-600",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600",
  investigating: "bg-purple-500/10 text-purple-600",
  negotiating: "bg-amber-500/10 text-amber-600",
  resolved: "bg-green-500/10 text-green-600",
  escalated: "bg-red-500/10 text-red-600",
  closed: "bg-gray-500/10 text-gray-600",
};

const typeColors: Record<string, string> = {
  customer: "bg-blue-500/10 text-blue-600",
  vendor: "bg-green-500/10 text-green-600",
  employee: "bg-purple-500/10 text-purple-600",
  legal: "bg-amber-500/10 text-amber-600",
  regulatory: "bg-red-500/10 text-red-600",
  other: "bg-gray-500/10 text-gray-600",
};

export default function Disputes() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    type: "customer" as "customer" | "vendor" | "employee" | "legal" | "regulatory" | "other",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    partyName: "",
    filedDate: "",
    estimatedValue: "",
    description: "",
    // Case tracker fields
    caseNumber: "",
    jurisdiction: "",
    court: "",
    assignedAttorney: "",
    nextHearingDate: "",
  });

  const utils = trpc.useUtils();
  const { data: disputes, isLoading } = trpc.disputes.list.useQuery();
  const createDispute = trpc.disputes.create.useMutation({
    onSuccess: () => {
      toast.success("Case created");
      setIsOpen(false);
      setFormData({
        title: "", type: "customer", priority: "medium", partyName: "",
        filedDate: "", estimatedValue: "", description: "",
        caseNumber: "", jurisdiction: "", court: "", assignedAttorney: "", nextHearingDate: "",
      });
      utils.disputes.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtered = disputes?.filter((d: any) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      d.title.toLowerCase().includes(q) ||
      d.disputeNumber?.toLowerCase().includes(q) ||
      (d.partyName || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchType = typeFilter === "all" || d.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  // Stats
  const stats = {
    total: disputes?.length || 0,
    open: disputes?.filter((d: any) => d.status === "open" || d.status === "investigating" || d.status === "negotiating" || d.status === "escalated").length || 0,
    resolved: disputes?.filter((d: any) => d.status === "resolved" || d.status === "closed").length || 0,
    totalValue: disputes?.reduce((s: number, d: any) => s + parseFloat(d.estimatedValue || "0"), 0) || 0,
    critical: disputes?.filter((d: any) => d.priority === "critical" || d.priority === "high").length || 0,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDispute.mutate({
      title: formData.title,
      type: formData.type,
      priority: formData.priority,
      partyName: formData.partyName || undefined,
      filedDate: formData.filedDate ? new Date(formData.filedDate) : undefined,
      estimatedValue: formData.estimatedValue || undefined,
      description: [
        formData.description,
        formData.caseNumber && `Case #: ${formData.caseNumber}`,
        formData.jurisdiction && `Jurisdiction: ${formData.jurisdiction}`,
        formData.court && `Court: ${formData.court}`,
        formData.assignedAttorney && `Attorney: ${formData.assignedAttorney}`,
        formData.nextHearingDate && `Next Hearing: ${formData.nextHearingDate}`,
      ].filter(Boolean).join("\n"),
    } as any);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Gavel className="h-7 w-7" />
            Legal Case Tracker
          </h1>
          <p className="text-muted-foreground mt-1">
            Track disputes, litigation, and legal issues
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.href = "/import"}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Case
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>New Legal Case</DialogTitle>
                  <DialogDescription>Create a new dispute or legal case to track.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Case title" required />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                          <SelectItem value="legal">Legal</SelectItem>
                          <SelectItem value="regulatory">Regulatory</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={formData.priority} onValueChange={(v: any) => setFormData({ ...formData, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated Value</Label>
                      <Input type="number" step="0.01" value={formData.estimatedValue} onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })} placeholder="0.00" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Counterparty</Label>
                      <Input value={formData.partyName} onChange={(e) => setFormData({ ...formData, partyName: e.target.value })} placeholder="Company or person" />
                    </div>
                    <div className="space-y-2">
                      <Label>Filed Date</Label>
                      <Input type="date" value={formData.filedDate} onChange={(e) => setFormData({ ...formData, filedDate: e.target.value })} />
                    </div>
                  </div>
                  {/* Case Details */}
                  <div className="border-t pt-4 mt-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Case Details</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="space-y-2">
                        <Label>Case / Docket Number</Label>
                        <Input value={formData.caseNumber} onChange={(e) => setFormData({ ...formData, caseNumber: e.target.value })} placeholder="e.g. 2026-CV-01234" />
                      </div>
                      <div className="space-y-2">
                        <Label>Jurisdiction</Label>
                        <Input value={formData.jurisdiction} onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })} placeholder="e.g. Delaware, Federal" />
                      </div>
                      <div className="space-y-2">
                        <Label>Court / Tribunal</Label>
                        <Input value={formData.court} onChange={(e) => setFormData({ ...formData, court: e.target.value })} placeholder="e.g. Superior Court" />
                      </div>
                      <div className="space-y-2">
                        <Label>Assigned Attorney</Label>
                        <Input value={formData.assignedAttorney} onChange={(e) => setFormData({ ...formData, assignedAttorney: e.target.value })} placeholder="Attorney name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Next Hearing Date</Label>
                        <Input type="date" value={formData.nextHearingDate} onChange={(e) => setFormData({ ...formData, nextHearingDate: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Description / Notes</Label>
                    <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Case details, background, key facts..." rows={3} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createDispute.isPending}>
                    {createDispute.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Case
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-muted-foreground">Total Cases</div>
            <div className="text-2xl font-semibold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-semibold text-blue-600">{stats.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-muted-foreground">Resolved</div>
            <div className="text-2xl font-semibold text-green-600">{stats.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-muted-foreground">High Priority</div>
            <div className="text-2xl font-semibold text-red-600">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-muted-foreground">Total Exposure</div>
            <div className="text-2xl font-semibold">{formatCurrency(stats.totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search cases..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="negotiating">Negotiating</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
                <SelectItem value="regulatory">Regulatory</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>{disputes?.length === 0 ? "No cases yet" : "No cases match your filters"}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((dispute: any) => (
                <button
                  key={dispute.id}
                  className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                  onClick={() => setSelectedDispute(dispute)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{dispute.title}</span>
                        <span className="text-xs text-muted-foreground">{dispute.disputeNumber}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {dispute.partyName && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{dispute.partyName}</span>}
                        {dispute.filedDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(dispute.filedDate), "MMM d, yyyy")}</span>}
                        {dispute.estimatedValue && parseFloat(dispute.estimatedValue) > 0 && (
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(parseFloat(dispute.estimatedValue))}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <Badge className={priorityColors[dispute.priority] || priorityColors.medium}>
                        {dispute.priority || "medium"}
                      </Badge>
                      <Badge className={typeColors[dispute.type] || typeColors.other}>
                        {dispute.type}
                      </Badge>
                      <Badge className={statusColors[dispute.status] || statusColors.open}>
                        {dispute.status}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispute Detail Side Panel */}
      {(() => {
        if (!selectedDispute) return null;
        const lines = (selectedDispute.description || "").split("\n");
        const mainDesc = lines.filter((l: string) => !l.startsWith("Case #:") && !l.startsWith("Jurisdiction:") && !l.startsWith("Court:") && !l.startsWith("Attorney:") && !l.startsWith("Next Hearing:")).join("\n").trim();
        const caseNum = lines.find((l: string) => l.startsWith("Case #:"))?.replace("Case #: ", "") || "";
        const jurisdiction = lines.find((l: string) => l.startsWith("Jurisdiction:"))?.replace("Jurisdiction: ", "") || "";
        const court = lines.find((l: string) => l.startsWith("Court:"))?.replace("Court: ", "") || "";
        const attorney = lines.find((l: string) => l.startsWith("Attorney:"))?.replace("Attorney: ", "") || "";
        const nextHearing = lines.find((l: string) => l.startsWith("Next Hearing:"))?.replace("Next Hearing: ", "") || "";
        return (
          <DetailSheet
            open={!!selectedDispute}
            onOpenChange={(o) => !o && setSelectedDispute(null)}
            title={selectedDispute.title}
            subtitle={selectedDispute.disputeNumber}
            width="md"
          >
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge className={priorityColors[selectedDispute.priority] || priorityColors.medium}>{selectedDispute.priority || "medium"}</Badge>
                <Badge className={typeColors[selectedDispute.type] || typeColors.other}>{selectedDispute.type}</Badge>
                <Badge className={statusColors[selectedDispute.status] || statusColors.open}>{selectedDispute.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {selectedDispute.partyName && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Counterparty</p>
                    <p className="font-medium">{selectedDispute.partyName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Filed</p>
                  <p className="font-medium">{selectedDispute.filedDate ? format(new Date(selectedDispute.filedDate), "MMM d, yyyy") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Exposure</p>
                  <p className="font-medium">{selectedDispute.estimatedValue ? formatCurrency(parseFloat(selectedDispute.estimatedValue)) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Assigned To</p>
                  <p className="font-medium">{selectedDispute.assignedTo || "Unassigned"}</p>
                </div>
                {caseNum && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Case Number</p>
                    <p className="font-medium font-mono">{caseNum}</p>
                  </div>
                )}
                {jurisdiction && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Jurisdiction</p>
                    <p className="font-medium">{jurisdiction}</p>
                  </div>
                )}
                {court && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Court</p>
                    <p className="font-medium">{court}</p>
                  </div>
                )}
                {attorney && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Attorney</p>
                    <p className="font-medium">{attorney}</p>
                  </div>
                )}
                {nextHearing && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Next Hearing</p>
                    <p className="font-medium text-amber-600">{nextHearing}</p>
                  </div>
                )}
              </div>
              {mainDesc && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/40 p-3 rounded border">{mainDesc}</p>
                </div>
              )}
              {selectedDispute.resolution && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Resolution</p>
                  <p className="text-sm whitespace-pre-wrap bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200">{selectedDispute.resolution}</p>
                </div>
              )}
            </div>
          </DetailSheet>
        );
      })()}
    </div>
  );
}
