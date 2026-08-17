import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Briefcase, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const ROUND_TYPES = [
  { value: "pre_seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
  { value: "bridge", label: "Bridge" },
  { value: "convertible_note", label: "Convertible Note" },
  { value: "safe", label: "SAFE" },
  { value: "debt", label: "Debt" },
  { value: "grant", label: "Grant" },
  { value: "strategic", label: "Strategic" },
  { value: "other", label: "Other" },
] as const;
type RoundType = typeof ROUND_TYPES[number]["value"];

const ROUND_STATUSES = ["planning", "open", "closing", "closed", "cancelled"] as const;
type RoundStatus = typeof ROUND_STATUSES[number];

const INVESTOR_TYPES = [
  "individual", "angel", "vc", "pe", "corporate", "government",
  "family_office", "crowd", "strategic", "employee", "other",
] as const;
type InvestorType = typeof INVESTOR_TYPES[number];

const INVESTOR_STATUSES = [
  "introduced", "in_diligence", "term_sheet", "committed",
  "wired", "closed", "declined", "lapsed",
] as const;
type InvestorStatus = typeof INVESTOR_STATUSES[number];

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-500/10 text-gray-700 border-gray-200",
  open: "bg-primary/10 text-primary border-primary/20",
  closing: "bg-muted text-foreground font-semibold border-transparent",
  closed: "bg-muted text-muted-foreground border-transparent",
  cancelled: "bg-[oklch(0.30_0.02_262)] text-white border-transparent",
};

const INVESTOR_STATUS_COLORS: Record<string, string> = {
  introduced: "bg-gray-500/10 text-gray-700 border-gray-200",
  in_diligence: "bg-primary/10 text-primary border-primary/20",
  term_sheet: "bg-muted text-foreground border-transparent",
  committed: "bg-muted text-foreground font-semibold border-transparent",
  wired: "bg-primary/10 text-primary border-primary/20",
  closed: "bg-muted text-muted-foreground border-transparent",
  declined: "bg-[oklch(0.30_0.02_262)] text-white border-transparent",
  lapsed: "bg-gray-500/10 text-gray-600 border-gray-200",
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

export default function SubsidiaryFundraising() {
  const { data: rounds, refetch } = trpc.subsidiaryFundraising.listRounds.useQuery({});
  const { data: companies } = (trpc as any).companies.list.useQuery();
  const companyName = (id: number | null | undefined) =>
    id == null ? "-" : ((companies as any[] | undefined)?.find((c) => c.id === id)?.name ?? `Company #${id}`);
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const blank = {
    subsidiaryCompanyId: "",
    name: "",
    roundType: "seed" as RoundType,
    targetAmount: "",
    currency: "USD",
    preMoneyValuation: "",
    leadInvestorName: "",
    openedDate: new Date().toISOString().slice(0, 10),
    status: "planning" as RoundStatus,
    notes: "",
  };
  const [form, setForm] = useState(blank);

  const create = trpc.subsidiaryFundraising.createRound.useMutation({
    onSuccess: async () => {
      toast.success("Round created");
      await refetch();
      setOpen(false);
      setForm({ ...blank });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <h2 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-primary" />
            Subsidiary Fundraising
          </h2>
          <span className="text-muted-foreground">
            Rounds for subsidiaries (kept separate from parent cap table)
          </span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Round</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>New Subsidiary Round</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Subsidiary</Label>
                  <Select
                    value={form.subsidiaryCompanyId || undefined}
                    onValueChange={(v) => setForm({ ...form, subsidiaryCompanyId: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select subsidiary" /></SelectTrigger>
                    <SelectContent>
                      {(companies as any[] | undefined ?? []).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}{c.type && c.type !== "parent" ? ` · ${c.type}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Round name</Label>
                  <Input placeholder="India JV Seed" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Round type</Label>
                  <Select value={form.roundType} onValueChange={(v: RoundType) => setForm({ ...form, roundType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROUND_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Target amount</Label>
                  <Input type="number" step="0.01" value={form.targetAmount}
                    onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Input maxLength={3} value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Pre-money valuation</Label>
                  <Input type="number" step="0.01" value={form.preMoneyValuation}
                    onChange={(e) => setForm({ ...form, preMoneyValuation: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Lead investor</Label>
                  <Input value={form.leadInvestorName}
                    onChange={(e) => setForm({ ...form, leadInvestorName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Opened date</Label>
                  <Input type="date" value={form.openedDate}
                    onChange={(e) => setForm({ ...form, openedDate: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v: RoundStatus) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROUND_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={create.isPending || !form.name.trim() || !form.subsidiaryCompanyId.trim()}
                onClick={() => create.mutate({
                  subsidiaryCompanyId: parseInt(form.subsidiaryCompanyId),
                  name: form.name.trim(),
                  roundType: form.roundType,
                  targetAmount: form.targetAmount || undefined,
                  currency: form.currency || "USD",
                  preMoneyValuation: form.preMoneyValuation || undefined,
                  leadInvestorName: form.leadInvestorName || undefined,
                  openedDate: form.openedDate ? new Date(form.openedDate) : undefined,
                  status: form.status,
                  notes: form.notes || undefined,
                })}
              >
                {create.isPending ? "Saving..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {!rounds || rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              {rounds === undefined ? "Loading..." : "No subsidiary rounds yet. Create one to track e.g. an India JV raise."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead>Subsidiary</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Raised</TableHead>
                  <TableHead className="text-right">Pre-money</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((r: any) => {
                  const target = parseFloat(r.targetAmount ?? "0") || 0;
                  const raised = parseFloat(r.raisedAmount ?? "0") || 0;
                  const pct = target > 0 ? Math.min(100, (raised / target) * 100) : 0;
                  const roundTypeLabel = ROUND_TYPES.find(t => t.value === r.roundType)?.label ?? r.roundType;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs">{companyName(r.subsidiaryCompanyId)}</TableCell>
                      <TableCell><Badge variant="outline">{roundTypeLabel}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(r.targetAmount, r.currency || "USD")}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoney(r.raisedAmount, r.currency || "USD")}
                        {target > 0 && <span className="ml-1 text-xs text-muted-foreground">({pct.toFixed(0)}%)</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(r.preMoneyValuation, r.currency || "USD")}</TableCell>
                      <TableCell className="text-xs">{r.leadInvestorName ?? "-"}</TableCell>
                      <TableCell className="text-xs">{r.openedDate ? new Date(r.openedDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell><Badge className={STATUS_COLORS[r.status] ?? ""}>{r.status}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>
                          <TrendingUp className="h-4 w-4" />
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
        <RoundDetailDialog id={detailId} onClose={() => setDetailId(null)} onChanged={refetch} />
      )}
    </div>
  );
}

function RoundDetailDialog({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => Promise<any> }) {
  const { data: round, refetch } = trpc.subsidiaryFundraising.getRound.useQuery({ id });
  const [addOpen, setAddOpen] = useState(false);
  const blank = {
    investorName: "",
    investorType: "individual" as InvestorType,
    email: "",
    country: "",
    commitmentAmount: "",
    currency: round?.currency || "USD",
    status: "introduced" as InvestorStatus,
    notes: "",
  };
  const [form, setForm] = useState(blank);

  const addInvestor = trpc.subsidiaryFundraising.addInvestor.useMutation({
    onSuccess: async () => {
      toast.success("Investor added");
      await Promise.all([refetch(), onChanged()]);
      setAddOpen(false);
      setForm({ ...blank, currency: round?.currency || "USD" });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateInvestor = trpc.subsidiaryFundraising.updateInvestor.useMutation({
    onSuccess: async () => {
      toast.success("Investor updated");
      await Promise.all([refetch(), onChanged()]);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!round) return null;
  const roundTypeLabel = ROUND_TYPES.find(t => t.value === round.roundType)?.label ?? round.roundType;
  const target = parseFloat(round.targetAmount ?? "0") || 0;
  const totalCommitted = (round.investors ?? []).reduce((s: number, i: any) => s + (parseFloat(i.commitmentAmount ?? "0") || 0), 0);
  const totalWired = (round.investors ?? []).reduce((s: number, i: any) => s + (parseFloat(i.fundedAmount ?? "0") || 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />{round.name}
          </DialogTitle>
          <CardDescription>{roundTypeLabel} · {round.status}</CardDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <DetailField label="Target" value={formatMoney(round.targetAmount, round.currency || "USD")} />
            <DetailField label="Committed" value={formatMoney(totalCommitted, round.currency || "USD")} />
            <DetailField label="Wired" value={formatMoney(totalWired, round.currency || "USD")} />
            <DetailField label="Pre-money" value={formatMoney(round.preMoneyValuation, round.currency || "USD")} />
            <DetailField label="Lead" value={round.leadInvestorName} />
            <DetailField label="Parent ownership before" value={round.parentOwnershipPctBefore != null ? `${round.parentOwnershipPctBefore}%` : null} />
            <DetailField label="Parent ownership after" value={round.parentOwnershipPctAfter != null ? `${round.parentOwnershipPctAfter}%` : null} />
            <DetailField label="Opened" value={round.openedDate ? new Date(round.openedDate).toLocaleDateString() : null} />
          </div>
          {target > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{((totalCommitted / target) * 100).toFixed(0)}% committed · {((totalWired / target) * 100).toFixed(0)}% wired</span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (totalWired / target) * 100)}%` }} />
              </div>
            </div>
          )}
          {round.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{round.notes}</p>}

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Investors ({(round.investors ?? []).length})</h4>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add investor</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add investor</DialogTitle></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Investor name</Label>
                        <Input value={form.investorName} onChange={(e) => setForm({ ...form, investorName: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Type</Label>
                        <Select value={form.investorType} onValueChange={(v: InvestorType) => setForm({ ...form, investorType: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {INVESTOR_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Email</Label>
                        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Country</Label>
                        <Input maxLength={8} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Commitment</Label>
                        <Input type="number" step="0.01" value={form.commitmentAmount}
                          onChange={(e) => setForm({ ...form, commitmentAmount: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Currency</Label>
                        <Input maxLength={3} value={form.currency}
                          onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={(v: InvestorStatus) => setForm({ ...form, status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {INVESTOR_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Notes</Label>
                      <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button
                      disabled={addInvestor.isPending || !form.investorName.trim()}
                      onClick={() => addInvestor.mutate({
                        roundId: id,
                        investorName: form.investorName.trim(),
                        investorType: form.investorType,
                        email: form.email || undefined,
                        country: form.country || undefined,
                        commitmentAmount: form.commitmentAmount || undefined,
                        currency: form.currency || "USD",
                        status: form.status,
                        notes: form.notes || undefined,
                      })}
                    >
                      {addInvestor.isPending ? "Saving..." : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {(round.investors ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No investors yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Commitment</TableHead>
                    <TableHead className="text-right">Funded</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(round.investors as any[]).map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.investorName}</TableCell>
                      <TableCell className="text-xs">{inv.investorType.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">{inv.country ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(inv.commitmentAmount, inv.currency || round.currency || "USD")}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(inv.fundedAmount, inv.currency || round.currency || "USD")}</TableCell>
                      <TableCell>
                        <Select value={inv.status} onValueChange={(v: InvestorStatus) => updateInvestor.mutate({ id: inv.id, patch: { status: v } })}>
                          <SelectTrigger className="h-7 text-xs w-32">
                            <SelectValue>
                              <Badge className={INVESTOR_STATUS_COLORS[inv.status] ?? ""}>{inv.status.replace(/_/g, " ")}</Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {INVESTOR_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
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
