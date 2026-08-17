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
import { Plus, Shield, AlertTriangle, Eye } from "lucide-react";
import { toast } from "sonner";

const LICENSE_TYPES = [
  { value: "fssai_central",         label: "FSSAI Central" },
  { value: "fssai_state",           label: "FSSAI State" },
  { value: "fssai_basic",           label: "FSSAI Basic" },
  { value: "dpiit_startup_india",   label: "DPIIT Startup India" },
  { value: "efsa_novel_food",       label: "EFSA Novel Food" },
  { value: "fic_1169_2011_label",   label: "FIC 1169/2011 (EU label)" },
  { value: "traces_nt",             label: "TRACES NT" },
  { value: "eu_organic",            label: "EU Organic" },
  { value: "fda_food_facility",     label: "FDA Food Facility" },
  { value: "fda_ffr",               label: "FDA FFR" },
  { value: "usda_organic",          label: "USDA Organic" },
  { value: "usda_amS",              label: "USDA AMS" },
  { value: "haccp",                 label: "HACCP" },
  { value: "iso_22000",             label: "ISO 22000" },
  { value: "brc",                   label: "BRC" },
  { value: "sqf",                   label: "SQF" },
  { value: "halal",                 label: "Halal" },
  { value: "kosher",                label: "Kosher" },
  { value: "non_gmo",               label: "Non-GMO" },
  { value: "vegan_certified",       label: "Vegan Certified" },
  { value: "gst_registration",      label: "GST Registration" },
  { value: "iec_import_export",     label: "IEC (Import-Export)" },
  { value: "rcmc",                  label: "RCMC" },
  { value: "pmksy_grant",           label: "PMKSY Grant" },
  { value: "maharashtra_agro_grant",label: "Maharashtra Agro Grant" },
  { value: "karnataka_udyog_mitra", label: "Karnataka Udyog Mitra" },
  { value: "trademark",             label: "Trademark" },
  { value: "patent",                label: "Patent" },
  { value: "copyright",             label: "Copyright" },
  { value: "other",                 label: "Other" },
] as const;
type LicenseTypeValue = typeof LICENSE_TYPES[number]["value"];

const STATUSES = [
  "planned", "applied", "in_review", "issued", "active",
  "expiring_soon", "expired", "revoked", "renewed", "rejected", "withdrawn",
] as const;
type StatusValue = typeof STATUSES[number];

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-muted text-muted-foreground border-transparent",
  applied: "bg-muted text-muted-foreground border-transparent",
  in_review: "bg-primary/10 text-primary border-primary/20",
  issued: "bg-muted text-muted-foreground border-transparent",
  active: "bg-muted text-muted-foreground border-transparent",
  expiring_soon: "bg-muted text-foreground font-semibold border-transparent",
  expired: "bg-[oklch(0.30_0.02_262)] text-white border-transparent",
  revoked: "bg-[oklch(0.30_0.02_262)] text-white border-transparent",
  renewed: "bg-muted text-muted-foreground border-transparent",
  rejected: "bg-[oklch(0.30_0.02_262)] text-white border-transparent",
  withdrawn: "bg-muted text-muted-foreground border-transparent",
};

function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function licenseLabel(v: string): string {
  return LICENSE_TYPES.find(t => t.value === v)?.label ?? v;
}

export default function RegulatoryLicenses() {
  const { data: licenses, refetch } = trpc.regulatoryLicenses.list.useQuery({});
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const blank = {
    licenseType: "fssai_central" as LicenseTypeValue,
    customTypeName: "",
    country: "IN",
    state: "",
    authority: "",
    licenseNumber: "",
    status: "planned" as StatusValue,
    appliedDate: "",
    issuedDate: "",
    expirationDate: "",
    renewalDueDate: "",
    renewalReminderDays: 60,
    applicationFee: "",
    annualFee: "",
    currency: "INR",
    contactName: "",
    contactEmail: "",
    portalUrl: "",
    documentUrl: "",
    notes: "",
  };
  const [form, setForm] = useState(blank);

  const create = trpc.regulatoryLicenses.create.useMutation({
    onSuccess: async () => {
      toast.success("License added");
      await refetch();
      setOpen(false);
      setForm({ ...blank });
    },
    onError: (e) => toast.error(e.message),
  });

  const annotated = (licenses ?? []).map((l: any) => ({
    ...l,
    daysToExpiry: daysUntil(l.expirationDate),
    daysToRenewal: daysUntil(l.renewalDueDate),
  }));

  const filtered = annotated.filter(l => {
    if (filter === "all") return true;
    if (filter === "expiring") return l.daysToExpiry !== null && l.daysToExpiry <= (l.renewalReminderDays ?? 60) && l.daysToExpiry >= 0;
    if (filter === "expired") return l.daysToExpiry !== null && l.daysToExpiry < 0;
    if (filter === "active") return ["issued", "active"].includes(l.status);
    if (filter === "pending") return ["planned", "applied", "in_review"].includes(l.status);
    return true;
  });

  const stats = annotated.reduce((acc, l) => {
    acc.total++;
    if (["issued", "active"].includes(l.status)) acc.active++;
    if (["planned", "applied", "in_review"].includes(l.status)) acc.pending++;
    if (l.daysToExpiry !== null && l.daysToExpiry >= 0 && l.daysToExpiry <= (l.renewalReminderDays ?? 60)) acc.expiringSoon++;
    if (l.daysToExpiry !== null && l.daysToExpiry < 0) acc.expired++;
    return acc;
  }, { total: 0, active: 0, pending: 0, expiringSoon: 0, expired: 0 });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />Regulatory Licenses
          </CardTitle>
          <CardDescription>
            FSSAI, DPIIT, EFSA Novel Food, FDA, ISO, halal/kosher and more — with renewal reminders
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-xs">
            <div><span className="text-muted-foreground">Active</span> <span className="font-bold text-foreground">{stats.active}</span></div>
            <div className="h-4 w-px bg-border" />
            <div><span className="text-muted-foreground">Pending</span> <span className="font-bold text-foreground">{stats.pending}</span></div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Expiring</span>
              <span className={`font-bold ${stats.expiringSoon > 0 ? "text-foreground" : ""}`}>{stats.expiringSoon}</span>
              {stats.expiringSoon > 0 && <AlertTriangle className="h-3 w-3 text-foreground" />}
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Expired</span>
              <span className={`font-bold ${stats.expired > 0 ? "text-foreground" : ""}`}>{stats.expired}</span>
              {stats.expired > 0 && <AlertTriangle className="h-3 w-3 text-foreground" />}
            </div>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="expiring">Expiring soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add License</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add Regulatory License</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>License type</Label>
                    <Select value={form.licenseType} onValueChange={(v: LicenseTypeValue) => setForm({ ...form, licenseType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {LICENSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
                {form.licenseType === "other" && (
                  <div className="space-y-1">
                    <Label>Custom name</Label>
                    <Input value={form.customTypeName} onChange={(e) => setForm({ ...form, customTypeName: e.target.value })} />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Country</Label>
                    <Input maxLength={8} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="space-y-1">
                    <Label>State</Label>
                    <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Authority</Label>
                    <Input value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>License number</Label>
                    <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Renewal reminder (days)</Label>
                    <Input type="number" value={form.renewalReminderDays}
                      onChange={(e) => setForm({ ...form, renewalReminderDays: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Applied date</Label>
                    <Input type="date" value={form.appliedDate} onChange={(e) => setForm({ ...form, appliedDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Issued date</Label>
                    <Input type="date" value={form.issuedDate} onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Expiration date</Label>
                    <Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Renewal due date</Label>
                    <Input type="date" value={form.renewalDueDate} onChange={(e) => setForm({ ...form, renewalDueDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Application fee</Label>
                    <Input type="number" step="0.01" value={form.applicationFee}
                      onChange={(e) => setForm({ ...form, applicationFee: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Annual fee</Label>
                    <Input type="number" step="0.01" value={form.annualFee}
                      onChange={(e) => setForm({ ...form, annualFee: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <Input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                  </div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Portal URL</Label>
                    <Input type="url" value={form.portalUrl} onChange={(e) => setForm({ ...form, portalUrl: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Document URL (issued license scan)</Label>
                    <Input type="url" value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={create.isPending || !form.country.trim()}
                  onClick={() => create.mutate({
                    licenseType: form.licenseType,
                    customTypeName: form.licenseType === "other" ? (form.customTypeName || undefined) : undefined,
                    country: form.country.trim(),
                    state: form.state || undefined,
                    authority: form.authority || undefined,
                    licenseNumber: form.licenseNumber || undefined,
                    status: form.status,
                    appliedDate: form.appliedDate ? new Date(form.appliedDate) : undefined,
                    issuedDate: form.issuedDate ? new Date(form.issuedDate) : undefined,
                    expirationDate: form.expirationDate ? new Date(form.expirationDate) : undefined,
                    renewalDueDate: form.renewalDueDate ? new Date(form.renewalDueDate) : undefined,
                    renewalReminderDays: form.renewalReminderDays,
                    applicationFee: form.applicationFee || undefined,
                    annualFee: form.annualFee || undefined,
                    currency: form.currency,
                    contactName: form.contactName || undefined,
                    contactEmail: form.contactEmail || undefined,
                    portalUrl: form.portalUrl || undefined,
                    documentUrl: form.documentUrl || undefined,
                    notes: form.notes || undefined,
                  })}
                >
                  {create.isPending ? "Saving..." : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">
            {licenses === undefined ? "Loading..." : "No licenses to show."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License</TableHead>
                <TableHead>Country / State</TableHead>
                <TableHead>Authority</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered
                .slice()
                .sort((a, b) => {
                  const ad = a.daysToExpiry ?? Number.MAX_SAFE_INTEGER;
                  const bd = b.daysToExpiry ?? Number.MAX_SAFE_INTEGER;
                  return ad - bd;
                })
                .map((l: any) => {
                  const reminder = l.renewalReminderDays ?? 60;
                  const expiringSoon = l.daysToExpiry !== null && l.daysToExpiry >= 0 && l.daysToExpiry <= reminder;
                  const expired = l.daysToExpiry !== null && l.daysToExpiry < 0;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.licenseType === "other" && l.customTypeName ? l.customTypeName : licenseLabel(l.licenseType)}</TableCell>
                      <TableCell className="text-xs">{l.country}{l.state ? ` / ${l.state}` : ""}</TableCell>
                      <TableCell className="text-xs">{l.authority ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.licenseNumber ?? "-"}</TableCell>
                      <TableCell className="text-xs">
                        {l.expirationDate ? (
                          <span className={expired ? "text-foreground font-semibold" : expiringSoon ? "text-foreground font-medium" : ""}>
                            {new Date(l.expirationDate).toLocaleDateString()}
                            {l.daysToExpiry !== null && l.daysToExpiry >= 0 && (
                              <span className="ml-1 text-muted-foreground">({l.daysToExpiry}d)</span>
                            )}
                            {expired && <span className="ml-1 font-medium">(expired)</span>}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[l.status] ?? ""}>{(l.status as string).replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(l.id)}>
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

      {detailId !== null && (
        <LicenseDetailDialog id={detailId} onClose={() => setDetailId(null)} onChanged={refetch} />
      )}
    </Card>
  );
}

function LicenseDetailDialog({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => Promise<any> }) {
  const { data: license } = trpc.regulatoryLicenses.get.useQuery({ id });
  const [status, setStatus] = useState<StatusValue | "">("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [renewalDueDate, setRenewalDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const update = trpc.regulatoryLicenses.update.useMutation({
    onSuccess: async () => {
      toast.success("License updated");
      await onChanged();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!license) return null;
  const typeLabel = license.licenseType === "other" && (license as any).customTypeName
    ? (license as any).customTypeName
    : licenseLabel(license.licenseType);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />{typeLabel}
          </DialogTitle>
          <CardDescription>{license.country}{license.state ? ` / ${license.state}` : ""} · {license.authority ?? "-"}</CardDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailField label="License #" value={license.licenseNumber} />
            <DetailField label="Status" value={(license.status as string).replace(/_/g, " ")} />
            <DetailField label="Applied" value={license.appliedDate ? new Date(license.appliedDate).toLocaleDateString() : null} />
            <DetailField label="Issued" value={license.issuedDate ? new Date(license.issuedDate).toLocaleDateString() : null} />
            <DetailField label="Expires" value={license.expirationDate ? new Date(license.expirationDate).toLocaleDateString() : null} />
            <DetailField label="Renewal due" value={license.renewalDueDate ? new Date(license.renewalDueDate).toLocaleDateString() : null} />
            <DetailField label="Application fee" value={license.applicationFee} />
            <DetailField label="Annual fee" value={license.annualFee} />
          </div>
          {license.notes && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{license.notes}</p>}
          {(license.portalUrl || license.documentUrl) && (
            <div className="space-y-1 text-sm">
              {license.portalUrl && <a href={license.portalUrl} target="_blank" rel="noreferrer" className="block text-primary underline">Portal</a>}
              {license.documentUrl && <a href={license.documentUrl} target="_blank" rel="noreferrer" className="block text-primary underline">Issued license document</a>}
            </div>
          )}

          <div className="border-t pt-3 space-y-3">
            <h4 className="text-sm font-medium">Update</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v: StatusValue) => setStatus(v)}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>License number</Label>
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Issued date</Label>
                <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Expiration date</Label>
                <Input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Renewal due</Label>
                <Input type="date" value={renewalDueDate} onChange={(e) => setRenewalDueDate(e.target.value)} />
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
            disabled={update.isPending || (!status && !licenseNumber && !issuedDate && !expirationDate && !renewalDueDate && !notes)}
            onClick={() => {
              const patch: any = {};
              if (status) patch.status = status;
              if (licenseNumber) patch.licenseNumber = licenseNumber;
              if (issuedDate) patch.issuedDate = new Date(issuedDate);
              if (expirationDate) patch.expirationDate = new Date(expirationDate);
              if (renewalDueDate) patch.renewalDueDate = new Date(renewalDueDate);
              if (notes) patch.notes = notes;
              update.mutate({ id, patch });
            }}
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
