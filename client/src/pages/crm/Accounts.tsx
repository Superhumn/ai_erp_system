import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DetailSheet } from "@/components/DetailSheet";
import { ArrowLeft, Building2, ChevronRight, Loader2, Plus, Search, Sparkles, Users } from "lucide-react";

type AccountType = "district" | "school" | "distributor" | "operator" | "gpo" | "other";
const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "district", label: "District" },
  { value: "school", label: "School" },
  { value: "distributor", label: "Distributor" },
  { value: "operator", label: "Operator" },
  { value: "gpo", label: "GPO" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = { name: "", type: "district" as AccountType, parentAccountId: "", region: "", mealCount: "", externalId: "", website: "", notes: "" };

function typeLabel(t: string | null | undefined) {
  return ACCOUNT_TYPES.find((a) => a.value === t)?.label ?? "Other";
}

export default function Accounts() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: accounts, isLoading } = trpc.crm.accounts.list.useQuery({
    search: search || undefined,
    type: typeFilter === "all" ? undefined : (typeFilter as AccountType),
  });
  const { data: allAccounts } = trpc.crm.accounts.list.useQuery({ limit: 1000 });

  const invalidate = () => {
    utils.crm.accounts.list.invalidate();
    if (selectedId) utils.crm.accounts.get.invalidate({ id: selectedId });
  };

  const createAccount = trpc.crm.accounts.create.useMutation({
    onSuccess: () => { toast.success("Account created"); setShowCreate(false); setForm(EMPTY_FORM); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const backfill = trpc.crm.accounts.backfill.useMutation({
    onSuccess: (r) => { toast.success(`Created ${r.accountsCreated} accounts, linked ${r.contactsLinked} contacts and ${r.dealsLinked} deals`); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rows = accounts ?? [];

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/crm/hub" className="text-muted-foreground hover:text-foreground" title="Back to CRM Hub">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Building2 className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-bold tracking-[-0.02em]">Accounts</h1>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={backfill.isPending} onClick={() => {
            if (confirm("Create an account for every distinct contact organization and link contacts + deals to it?")) backfill.mutate();
          }}>
            {backfill.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Backfill from organizations
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Account
          </Button>
        </div>
      </div>

      <Card className="py-3">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No accounts yet. Create one, or backfill from your contacts' organizations.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Name</TableHead>
                    <TableHead className="min-w-[90px]">Type</TableHead>
                    <TableHead className="min-w-[140px]">Parent</TableHead>
                    <TableHead className="min-w-[100px]">Region</TableHead>
                    <TableHead className="text-right min-w-[80px]">Meals/day</TableHead>
                    <TableHead className="text-right min-w-[70px]">Children</TableHead>
                    <TableHead className="text-right min-w-[70px]">Contacts</TableHead>
                    <TableHead className="text-right min-w-[80px]">Open deals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.id} className="hover:bg-muted/50 cursor-pointer text-xs" onClick={() => setSelectedId(a.id)}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{typeLabel(a.type)}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{a.parentName ?? "—"}</TableCell>
                      <TableCell>{a.region ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.mealCount != null ? a.mealCount.toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.childCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.contactCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.openDealCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Account</DialogTitle>
            <DialogDescription>A district, school, distributor, operator or GPO.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Los Angeles Unified School District" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AccountType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Parent account</Label>
                <Select value={form.parentAccountId || "none"} onValueChange={(v) => setForm({ ...form, parentAccountId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(allAccounts ?? []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Region</Label>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. CA, Northeast" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Meals per day</Label>
                <Input type="number" min={0} value={form.mealCount} onChange={(e) => setForm({ ...form, mealCount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">External ID</Label>
                <Input value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} placeholder="NCES id, account #" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Website</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!form.name.trim() || createAccount.isPending} onClick={() => createAccount.mutate({
              name: form.name.trim(),
              type: form.type,
              parentAccountId: form.parentAccountId ? Number(form.parentAccountId) : null,
              region: form.region || undefined,
              mealCount: form.mealCount ? Number(form.mealCount) : null,
              externalId: form.externalId || undefined,
              website: form.website || undefined,
              notes: form.notes || undefined,
            })}>
              {createAccount.isPending ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DetailSheet open={selectedId != null} onOpenChange={(o) => !o && setSelectedId(null)} title="Account" width="lg">
        {selectedId != null && (
          <AccountDetail
            key={selectedId}
            id={selectedId}
            allAccounts={(allAccounts ?? []).flatMap((a) => (a.id != null && a.name ? [{ id: a.id, name: a.name }] : []))}
            onNavigate={setSelectedId}
            onChanged={invalidate}
          />
        )}
      </DetailSheet>
    </div>
  );
}

function AccountDetail({ id, allAccounts, onNavigate, onChanged }: {
  id: number;
  allAccounts: { id: number; name: string }[];
  onNavigate: (id: number) => void;
  onChanged: () => void;
}) {
  const { data, isLoading } = trpc.crm.accounts.get.useQuery({ id });
  const [tab, setTab] = useState<"overview" | "contacts" | "deals" | "timeline">("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null);

  const update = trpc.crm.accounts.update.useMutation({
    onSuccess: () => { toast.success("Account updated"); setEditing(false); onChanged(); },
    onError: (e) => toast.error(e.message),
  });

  const parentOptions = useMemo(() => allAccounts.filter((a) => a.id !== id), [allAccounts, id]);

  if (isLoading || !data) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const startEdit = () => {
    setForm({
      name: data.name,
      type: data.type as AccountType,
      parentAccountId: data.parentAccountId ? String(data.parentAccountId) : "",
      region: data.region ?? "",
      mealCount: data.mealCount != null ? String(data.mealCount) : "",
      externalId: data.externalId ?? "",
      website: data.website ?? "",
      notes: data.notes ?? "",
    });
    setEditing(true);
  };

  const tabClass = (t: string) => `px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`;

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">{data.name}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px]">{typeLabel(data.type)}</Badge>
            {data.region && <span>· {data.region}</span>}
            {data.mealCount != null && <span>· {data.mealCount.toLocaleString()} meals/day</span>}
          </div>
        </div>
        {!editing && <Button size="sm" variant="outline" onClick={startEdit}>Edit</Button>}
      </div>

      {data.parent && (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => onNavigate(data.parent!.id)}>
          Part of <span className="font-medium text-foreground">{data.parent.name}</span> <ChevronRight className="h-3 w-3" />
        </button>
      )}

      <div className="flex gap-1 border-b pb-2 overflow-x-auto">
        <button className={tabClass("overview")} onClick={() => setTab("overview")}>Overview</button>
        <button className={tabClass("contacts")} onClick={() => setTab("contacts")}>Contacts ({data.contacts.length})</button>
        <button className={tabClass("deals")} onClick={() => setTab("deals")}>Deals ({data.deals.length})</button>
        <button className={tabClass("timeline")} onClick={() => setTab("timeline")}>Timeline</button>
      </div>

      {tab === "overview" && !editing && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Field label="External ID" value={data.externalId} />
            <Field label="Website" value={data.website} />
            <Field label="Customer ID" value={data.customerId != null ? String(data.customerId) : null} />
            <Field label="Created" value={format(new Date(data.createdAt), "MMM d, yyyy")} />
          </div>
          {data.notes && <div><div className="text-xs text-muted-foreground">Notes</div><div className="text-sm whitespace-pre-wrap">{data.notes}</div></div>}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Child accounts ({data.children.length})</div>
            {data.children.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No child accounts.</p>
            ) : (
              <div className="space-y-1">
                {data.children.map((c) => (
                  <button key={c.id} type="button" onClick={() => onNavigate(c.id)} className="w-full text-left flex items-center justify-between p-2 border rounded-lg text-sm hover:border-primary">
                    <span className="truncate">{c.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0"><Badge variant="outline" className="text-[10px]">{typeLabel(c.type)}</Badge><ChevronRight className="h-3 w-3" /></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "overview" && editing && form && (
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AccountType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Parent account</Label>
              <Select value={form.parentAccountId || "none"} onValueChange={(v) => setForm({ ...form, parentAccountId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {parentOptions.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Region</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Meals per day</Label><Input type="number" min={0} value={form.mealCount} onChange={(e) => setForm({ ...form, mealCount: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">External ID</Label><Input value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" disabled={!form.name.trim() || update.isPending} onClick={() => update.mutate({
              id,
              name: form.name.trim(),
              type: form.type,
              parentAccountId: form.parentAccountId ? Number(form.parentAccountId) : null,
              region: form.region || null,
              mealCount: form.mealCount ? Number(form.mealCount) : null,
              externalId: form.externalId || null,
              website: form.website || null,
              notes: form.notes || null,
            })}>{update.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      )}

      {tab === "contacts" && (
        data.contacts.length === 0 ? <p className="text-sm text-muted-foreground italic">No contacts linked to this account.</p> : (
          <div className="space-y-1">
            {data.contacts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-1 p-2 border rounded-lg text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.fullName}</div>
                  <div className="text-xs text-muted-foreground truncate">{[c.jobTitle, c.email].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <Badge variant="secondary" className="capitalize text-[11px]">{c.contactType}</Badge>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "deals" && (
        data.deals.length === 0 ? <p className="text-sm text-muted-foreground italic">No deals for this account.</p> : (
          <div className="space-y-1">
            {data.deals.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-1 p-2 border rounded-lg text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{d.stage.replace(/_/g, " ")} · {d.status}</div>
                </div>
                <div className="font-semibold tabular-nums">${Number(d.amount ?? 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "timeline" && (
        data.timeline.length === 0 ? <p className="text-sm text-muted-foreground italic">No activity yet.</p> : (
          <div className="space-y-2">
            {data.timeline.map((i) => (
              <div key={i.id} className="p-2.5 border rounded-lg text-sm">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-xs">{i.channel}</Badge>
                  <span className="text-xs text-muted-foreground">{format(new Date(i.createdAt), "MMM d, HH:mm")}</span>
                </div>
                <p className="text-sm">{i.subject || i.content || i.summary || "—"}</p>
              </div>
            ))}
          </div>
        )
      )}

      <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-2 border-t">
        <Users className="h-3 w-3" /> Contacts and deals link here via their account field.
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm break-words">{value || "—"}</div>
    </div>
  );
}
