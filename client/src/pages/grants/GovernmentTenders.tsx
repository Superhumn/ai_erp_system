import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Landmark, AlertTriangle, Calendar, Eye } from "lucide-react";
import { toast } from "sonner";

const PORTALS = [
  { value: "gem", label: "GeM" },
  { value: "irctc", label: "IRCTC" },
  { value: "icds", label: "ICDS" },
  { value: "csd", label: "CSD" },
  { value: "aiims", label: "AIIMS" },
  { value: "state_nutrition", label: "State nutrition" },
  { value: "state_hospital", label: "State hospital" },
  { value: "ministry_defense", label: "Min. of Defense" },
  { value: "ministry_railways", label: "Min. of Railways" },
  { value: "ministry_health", label: "Min. of Health" },
  { value: "ministry_food", label: "Min. of Food" },
  { value: "eu_ted", label: "EU TED" },
  { value: "us_sam_gov", label: "US SAM.gov" },
  { value: "uk_contracts_finder", label: "UK Contracts Finder" },
  { value: "other", label: "Other" },
] as const;
type PortalValue = typeof PORTALS[number]["value"];

const CATEGORIES = [
  { value: "food_supply", label: "Food supply" },
  { value: "defense_canteen", label: "Defense canteen" },
  { value: "midday_meal", label: "Midday meal" },
  { value: "hospital_procurement", label: "Hospital procurement" },
  { value: "railway_catering", label: "Railway catering" },
  { value: "school_nutrition", label: "School nutrition" },
  { value: "humanitarian_aid", label: "Humanitarian aid" },
  { value: "other", label: "Other" },
] as const;
type CategoryValue = typeof CATEGORIES[number]["value"];

const STATUSES = [
  "watching", "qualifying", "preparing", "submitted", "under_review",
  "shortlisted", "awarded", "lost", "withdrawn", "cancelled",
] as const;
type StatusValue = typeof STATUSES[number];

const STATUS_COLORS: Record<string, string> = {
  watching: "bg-gray-500/10 text-gray-700 border-gray-200",
  qualifying: "bg-blue-500/10 text-blue-700 border-blue-200",
  preparing: "bg-amber-500/10 text-amber-700 border-amber-200",
  submitted: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  under_review: "bg-purple-500/10 text-purple-700 border-purple-200",
  shortlisted: "bg-teal-500/10 text-teal-700 border-teal-200",
  awarded: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  lost: "bg-red-500/10 text-red-700 border-red-200",
  withdrawn: "bg-gray-500/10 text-gray-600 border-gray-200",
  cancelled: "bg-gray-500/10 text-gray-600 border-gray-200",
};

function formatMoney(value: string | number | null | undefined, currency: string): string {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(num);
  } catch {
    return `${num.toFixed(0)} ${currency}`;
  }
}

function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export default function GovernmentTenders() {
  const { data: tenders, refetch } = trpc.governmentTenders.list.useQuery({});
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const blank = {
    title: "",
    portal: "gem" as PortalValue,
    customPortalName: "",
    category: "food_supply" as CategoryValue,
    solicitationNumber: "",
    agency: "",
    country: "IN",
    state: "",
    publishedDate: "",
    submissionDeadline: "",
    estimatedValue: "",
    emdAmount: "",
    currency: "INR",
    status: "watching" as StatusValue,
    classILocalSupplier: false,
    fssaiRequired: false,
    bomRequired: false,
    bankGuaranteeRequired: false,
    contactName: "",
    contactEmail: "",
    portalUrl: "",
    notes: "",
  };
  const [form, setForm] = useState(blank);

  const create = trpc.governmentTenders.create.useMutation({
    onSuccess: async () => {
      toast.success("Tender added");
      await refetch();
      setOpen(false);
      setForm({ ...blank });
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (tenders ?? []).filter(t => {
    if (filter === "all") return true;
    if (filter === "urgent") {
      const d = daysUntil(t.submissionDeadline);
      return d !== null && d <= 14 && ["watching", "qualifying", "preparing"].includes(t.status as string);
    }
    if (filter === "live") return ["preparing", "submitted", "under_review", "shortlisted"].includes(t.status as string);
    if (filter === "awarded") return t.status === "awarded";
    return true;
  });

  // Stats
  const stats = (tenders ?? []).reduce((acc, t) => {
    acc.total++;
    if (["preparing", "submitted", "under_review", "shortlisted"].includes(t.status as string)) acc.live++;
    if (t.status === "awarded") acc.awarded++;
    const d = daysUntil(t.submissionDeadline);
    if (d !== null && d >= 0 && d <= 14 && ["watching", "qualifying", "preparing"].includes(t.status as string)) acc.urgent++;
    return acc;
  }, { total: 0, live: 0, awarded: 0, urgent: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <h2 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <Landmark className="h-4 w-4 text-primary" />
            Government Tenders
          </h2>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Total</span> <span className="font-bold">{stats.total}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Live</span> <span className="font-bold text-indigo-600">{stats.live}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Awarded</span> <span className="font-bold text-emerald-600">{stats.awarded}</span></div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Urgent</span>
            <span className={`font-bold ${stats.urgent > 0 ? "text-red-600" : ""}`}>{stats.urgent}</span>
            {stats.urgent > 0 && <AlertTriangle className="h-3 w-3 text-red-600" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="urgent">Urgent (≤14 days)</SelectItem>
              <SelectItem value="live">Live (submitted / under review)</SelectItem>
              <SelectItem value="awarded">Awarded</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Tender</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New Government Tender</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
                <div className="space-y-1">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. IRCTC catering tender — Phase 1" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Portal</Label>
                    <Select value={form.portal} onValueChange={(v: PortalValue) => setForm({ ...form, portal: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PORTALS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v: CategoryValue) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v: StatusValue) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Solicitation #</Label>
                    <Input value={form.solicitationNumber} onChange={(e) => setForm({ ...form, solicitationNumber: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Agency</Label>
                    <Input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Country</Label>
                    <Input maxLength={8} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>State</Label>
                    <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Published Date</Label>
                    <Input type="date" value={form.publishedDate} onChange={(e) => setForm({ ...form, publishedDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Submission Deadline</Label>
                    <Input type="date" value={form.submissionDeadline} onChange={(e) => setForm({ ...form, submissionDeadline: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Estimated Value</Label>
                    <Input type="number" step="0.01" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>EMD Amount</Label>
                    <Input type="number" step="0.01" value={form.emdAmount} onChange={(e) => setForm({ ...form, emdAmount: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <Input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.classILocalSupplier}
                      onChange={(e) => setForm({ ...form, classILocalSupplier: e.target.checked })} />
                    Class I Local Supplier required
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.fssaiRequired}
                      onChange={(e) => setForm({ ...form, fssaiRequired: e.target.checked })} />
                    FSSAI required
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.bomRequired}
                      onChange={(e) => setForm({ ...form, bomRequired: e.target.checked })} />
                    BoM required
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.bankGuaranteeRequired}
                      onChange={(e) => setForm({ ...form, bankGuaranteeRequired: e.target.checked })} />
                    Bank guarantee required
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Contact name</Label>
                    <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Contact email</Label>
                    <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Portal URL</Label>
                  <Input type="url" value={form.portalUrl} onChange={(e) => setForm({ ...form, portalUrl: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={create.isPending || !form.title.trim()}
                  onClick={() => create.mutate({
                    title: form.title.trim(),
                    portal: form.portal,
                    customPortalName: form.portal === "other" && form.customPortalName ? form.customPortalName : undefined,
                    category: form.category,
                    solicitationNumber: form.solicitationNumber || undefined,
                    agency: form.agency || undefined,
                    country: form.country || undefined,
                    state: form.state || undefined,
                    publishedDate: form.publishedDate ? new Date(form.publishedDate) : undefined,
                    submissionDeadline: form.submissionDeadline ? new Date(form.submissionDeadline) : undefined,
                    estimatedValue: form.estimatedValue || undefined,
                    emdAmount: form.emdAmount || undefined,
                    currency: form.currency,
                    status: form.status,
                    classILocalSupplier: form.classILocalSupplier,
                    fssaiRequired: form.fssaiRequired,
                    bomRequired: form.bomRequired,
                    bankGuaranteeRequired: form.bankGuaranteeRequired,
                    contactName: form.contactName || undefined,
                    contactEmail: form.contactEmail || undefined,
                    portalUrl: form.portalUrl || undefined,
                    notes: form.notes || undefined,
                  })}
                >
                  {create.isPending ? "Saving..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              {tenders === undefined ? "Loading..." : "No tenders to show. Click \"New Tender\" to add one."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Country / State</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead className="text-right">Est. value</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t: any) => {
                  const days = daysUntil(t.submissionDeadline);
                  const urgent = days !== null && days >= 0 && days <= 14 && ["watching", "qualifying", "preparing"].includes(t.status);
                  const portalLabel = PORTALS.find(p => p.value === t.portal)?.label ?? t.portal;
                  const categoryLabel = CATEGORIES.find(c => c.value === t.category)?.label ?? t.category;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium max-w-[28ch] truncate" title={t.title}>{t.title}</TableCell>
                      <TableCell><Badge variant="outline">{portalLabel}</Badge></TableCell>
                      <TableCell className="text-xs">{categoryLabel}</TableCell>
                      <TableCell className="text-xs">
                        {t.country ?? "-"}{t.state ? ` / ${t.state}` : ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.submissionDeadline ? (
                          <span className={urgent ? "text-red-600 font-medium" : ""}>
                            {new Date(t.submissionDeadline).toLocaleDateString()}
                            {days !== null && days >= 0 && <span className="ml-1 text-muted-foreground">({days}d)</span>}
                            {days !== null && days < 0 && <span className="ml-1 text-muted-foreground">(past)</span>}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(t.estimatedValue, t.currency || "INR")}</TableCell>
                      <TableCell className="text-xs space-x-1">
                        {t.fssaiRequired && <Badge variant="outline" className="text-[10px]">FSSAI</Badge>}
                        {t.classILocalSupplier && <Badge variant="outline" className="text-[10px]">Class I</Badge>}
                        {t.bomRequired && <Badge variant="outline" className="text-[10px]">BoM</Badge>}
                        {t.bankGuaranteeRequired && <Badge variant="outline" className="text-[10px]">BG</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[t.status] ?? ""}>{(t.status as string).replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(t.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {detailId !== null && (
        <TenderDetailDialog id={detailId} onClose={() => setDetailId(null)} onChanged={refetch} />
      )}
    </div>
  );
}

function TenderDetailDialog({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => Promise<any> }) {
  const { data: tender } = trpc.governmentTenders.get.useQuery({ id });
  const [nextStatus, setNextStatus] = useState<StatusValue | "">("");
  const [bidAmount, setBidAmount] = useState("");
  const [awardedAmount, setAwardedAmount] = useState("");
  const [awardDate, setAwardDate] = useState("");
  const [notes, setNotes] = useState("");

  const update = trpc.governmentTenders.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("Tender updated");
      await onChanged();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!tender) return null;
  const portalLabel = PORTALS.find(p => p.value === tender.portal)?.label ?? tender.portal;
  const categoryLabel = CATEGORIES.find(c => c.value === tender.category)?.label ?? tender.category;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />{tender.title}
          </DialogTitle>
          <CardDescription>{portalLabel} · {categoryLabel} · {tender.country ?? "-"}</CardDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailField label="Solicitation #" value={tender.solicitationNumber} />
            <DetailField label="Agency" value={tender.agency} />
            <DetailField label="Status" value={tender.status} />
            <DetailField label="Submission deadline"
              value={tender.submissionDeadline ? new Date(tender.submissionDeadline).toLocaleString() : null} />
            <DetailField label="Estimated value"
              value={formatMoney(tender.estimatedValue, tender.currency || "INR")} />
            <DetailField label="EMD"
              value={formatMoney(tender.emdAmount, tender.currency || "INR")} />
            <DetailField label="Bid amount"
              value={formatMoney(tender.bidAmount, tender.currency || "INR")} />
            <DetailField label="Awarded amount"
              value={formatMoney(tender.awardedAmount, tender.currency || "INR")} />
          </div>
          <div className="flex flex-wrap gap-1">
            {tender.fssaiRequired && <Badge variant="outline" className="text-[10px]">FSSAI</Badge>}
            {tender.classILocalSupplier && <Badge variant="outline" className="text-[10px]">Class I</Badge>}
            {tender.bomRequired && <Badge variant="outline" className="text-[10px]">BoM</Badge>}
            {tender.bankGuaranteeRequired && <Badge variant="outline" className="text-[10px]">Bank guarantee</Badge>}
          </div>
          {tender.notes && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{tender.notes}</p>}
          {tender.portalUrl && (
            <a href={tender.portalUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
              Open portal
            </a>
          )}

          <div className="border-t pt-3 space-y-3">
            <h4 className="text-sm font-medium">Update status</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>New status</Label>
                <Select value={nextStatus} onValueChange={(v: StatusValue) => setNextStatus(v)}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Award date</Label>
                <Input type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Bid amount</Label>
                <Input type="number" step="0.01" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Awarded amount</Label>
                <Input type="number" step="0.01" value={awardedAmount} onChange={(e) => setAwardedAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes (appended)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            disabled={update.isPending || !nextStatus}
            onClick={() => nextStatus && update.mutate({
              id,
              status: nextStatus,
              bidAmount: bidAmount || undefined,
              awardedAmount: awardedAmount || undefined,
              awardDate: awardDate ? new Date(awardDate) : undefined,
              notes: notes || undefined,
            })}
          >
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value || value === 0 ? String(value) : "-"}</div>
    </div>
  );
}
