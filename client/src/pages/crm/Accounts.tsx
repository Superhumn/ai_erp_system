import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DetailSheet } from "@/components/DetailSheet";
import { buildAccountTree, flattenAccountTree, type AccountTreeNode } from "@/lib/crmAccounts";
import { ArrowLeft, Building2, ChevronDown, ChevronRight, GitMerge, Loader2, Plus, Search, Sparkles, Trash2, Users } from "lucide-react";
import { QuickAddTask, TaskList } from "./CrmTasks";

type AccountType = "district" | "school" | "distributor" | "operator" | "gpo" | "other";
const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "district", label: "District" },
  { value: "school", label: "School" },
  { value: "distributor", label: "Distributor" },
  { value: "operator", label: "Operator" },
  { value: "gpo", label: "GPO" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = { name: "", type: "district" as AccountType, parentAccountId: "", region: "", state: "", mealsPerDay: "", externalId: "", website: "", notes: "" };

function typeLabel(t: string | null | undefined) {
  return ACCOUNT_TYPES.find((a) => a.value === t)?.label ?? "Other";
}

/** Standalone /crm/accounts route. */
export default function Accounts() {
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 min-w-0">
        <Link href="/crm/hub" className="text-muted-foreground hover:text-foreground" title="Back to CRM Hub">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Building2 className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-bold tracking-[-0.02em]">Accounts</h1>
      </div>
      <AccountsPanel />
    </div>
  );
}

/**
 * Account list with parent → child tree (flat when searching or filtering),
 * create dialog and detail sheet. Rendered on /crm/accounts and as the
 * Accounts tab of the CRM Hub.
 */
export function AccountsPanel() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const filtering = !!search || typeFilter !== "all";
  const { data: filtered, isLoading: filteredLoading } = trpc.crm.accounts.list.useQuery(
    { search: search || undefined, type: typeFilter === "all" ? undefined : (typeFilter as AccountType), limit: 500 },
    { enabled: filtering },
  );
  const { data: allAccounts, isLoading: allLoading } = trpc.crm.accounts.list.useQuery({ limit: 1000 });

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

  // tRPC output types are all-optional in the client build; pin the tree keys.
  const normalize = (rows: typeof allAccounts) =>
    (rows ?? []).map((a) => ({ ...a, id: a.id as number, name: a.name ?? "", parentAccountId: a.parentAccountId ?? null }));
  type Row = ReturnType<typeof normalize>[number];
  const treeRows = useMemo(() => {
    if (filtering) return normalize(filtered).map((a) => ({ node: { account: a, children: [] } as AccountTreeNode<Row>, depth: 0 }));
    return flattenAccountTree(buildAccountTree(normalize(allAccounts)), collapsed);
  }, [filtering, filtered, allAccounts, collapsed]);
  const isLoading = filtering ? filteredLoading : allLoading;
  const accountOptions = normalize(allAccounts).map((a) => ({ id: a.id, name: a.name }));

  const toggle = (id: number) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsed(next);
  };

  return (
    <div className="space-y-3">
      <Card className="py-3">
        <CardHeader className="pb-2">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 min-w-0 md:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2 md:ml-auto">
              <Button variant="outline" size="sm" className="flex-1 md:flex-none" disabled={backfill.isPending} onClick={() => {
                if (confirm("Create an account for every distinct contact organization and link contacts + deals to it?")) backfill.mutate();
              }}>
                {backfill.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Backfill
              </Button>
              <Button size="sm" className="flex-1 md:flex-none" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" /> New Account
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : treeRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{filtering ? "No accounts match." : "No accounts yet. Create one, or backfill from your contacts' organizations."}</p>
            </div>
          ) : (
            <div className="divide-y border rounded-md">
              <div className="hidden md:grid grid-cols-[1fr_100px_90px_90px_70px_70px_80px] gap-2 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Name</span><span>Type</span><span>State</span><span className="text-right">Meals/day</span>
                <span className="text-right">Contacts</span><span className="text-right">Children</span><span className="text-right">Open deals</span>
              </div>
              {treeRows.map(({ node, depth }) => {
                const a = node.account;
                const hasChildren = !filtering && node.children.length > 0;
                return (
                  <div
                    key={a.id}
                    className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_90px_90px_70px_70px_80px] gap-2 px-2 py-1.5 text-xs hover:bg-muted/50 items-center"
                  >
                    <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: depth * 16 }}>
                      {hasChildren ? (
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-muted shrink-0"
                          onClick={() => toggle(a.id)}
                          aria-label={`${collapsed.has(a.id) ? "Expand" : "Collapse"} ${a.name}`}
                          aria-expanded={!collapsed.has(a.id)}
                        >
                          {collapsed.has(a.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      ) : <span className="w-[18px] shrink-0" />}
                      {/* Keyboard-reachable: Tab to the name, Enter / Space opens the account. */}
                      <button
                        type="button"
                        className="font-medium truncate text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        onClick={() => setSelectedId(a.id)}
                        aria-label={`Open ${a.name}`}
                      >
                        {a.name}
                      </button>
                      {filtering && a.parentName && <span className="text-muted-foreground truncate hidden sm:inline">· {a.parentName}</span>}
                    </div>
                    <div className="md:contents flex items-center gap-2 justify-end text-muted-foreground">
                      <span><Badge variant="secondary" className="text-[10px]">{typeLabel(a.type)}</Badge></span>
                      <span className="hidden md:block">{a.state ?? a.region ?? "—"}</span>
                      <span className="hidden md:block text-right tabular-nums">{a.mealsPerDay != null ? a.mealsPerDay.toLocaleString() : "—"}</span>
                      <span className="hidden md:block text-right tabular-nums">{a.contactCount}</span>
                      <span className="hidden md:block text-right tabular-nums">{a.childCount}</span>
                      <span className="text-right tabular-nums md:text-foreground">{a.openDealCount}<span className="md:hidden"> open</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Account</DialogTitle>
            <DialogDescription>A district, school, distributor, operator or GPO.</DialogDescription>
          </DialogHeader>
          <AccountFields form={form} setForm={setForm} parentOptions={accountOptions} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!form.name.trim() || createAccount.isPending} onClick={() => createAccount.mutate({
              name: form.name.trim(),
              type: form.type,
              parentAccountId: form.parentAccountId ? Number(form.parentAccountId) : null,
              region: form.region || undefined,
              state: form.state || undefined,
              mealsPerDay: form.mealsPerDay ? Number(form.mealsPerDay) : null,
              externalId: form.externalId || undefined,
              website: form.website || undefined,
              notes: form.notes || undefined,
            })}>
              {createAccount.isPending ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DetailSheet open={selectedId != null} onOpenChange={(o) => !o && setSelectedId(null)} title="Account" width="lg" className="w-full">
        {selectedId != null && (
          <AccountDetail
            key={selectedId}
            id={selectedId}
            allAccounts={accountOptions}
            onNavigate={setSelectedId}
            onChanged={invalidate}
            onDeleted={() => { setSelectedId(null); utils.crm.accounts.list.invalidate(); }}
          />
        )}
      </DetailSheet>
    </div>
  );
}

function AccountFields({ form, setForm, parentOptions }: {
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  parentOptions: { id: number; name: string }[];
}) {
  return (
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
              {parentOptions.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">State</Label>
          <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="e.g. CA" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Region</Label>
          <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. Northeast" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Meals per day</Label>
          <Input type="number" min={0} value={form.mealsPerDay} onChange={(e) => setForm({ ...form, mealsPerDay: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">External ID</Label>
          <Input value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} placeholder="NCES id, account #" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Website</Label>
          <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </div>
  );
}

function AccountDetail({ id, allAccounts, onNavigate, onChanged, onDeleted }: {
  id: number;
  allAccounts: { id: number; name: string }[];
  onNavigate: (id: number) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  // One page size for the three lists; "Show more" grows it. Totals come from rollup (full subtree).
  const [limit, setLimit] = useState(50);
  const { data, isLoading, isFetching } = trpc.crm.accounts.get.useQuery({ id, limit }, { placeholderData: (prev) => prev });
  const [tab, setTab] = useState<"overview" | "contacts" | "deals" | "tasks" | "timeline">("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [merging, setMerging] = useState(false);
  const [mergeId, setMergeId] = useState("");

  const update = trpc.crm.accounts.update.useMutation({
    onSuccess: () => { toast.success("Account updated"); setEditing(false); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.crm.accounts.delete.useMutation({
    onSuccess: () => { toast.success("Account deleted"); onDeleted(); },
    onError: (e) => toast.error(e.message),
  });
  const merge = trpc.crm.accounts.merge.useMutation({
    onSuccess: (r) => { toast.success(`Merged ${r.merged} account${r.merged === 1 ? "" : "s"} into this one`); setMerging(false); setMergeId(""); onChanged(); },
    onError: (e) => toast.error(e.message),
  });

  const otherAccounts = useMemo(() => allAccounts.filter((a) => a.id !== id), [allAccounts, id]);

  if (isLoading || !data) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const startEdit = () => {
    setForm({
      name: data.name,
      type: data.type as AccountType,
      parentAccountId: data.parentAccountId ? String(data.parentAccountId) : "",
      region: data.region ?? "",
      state: data.state ?? "",
      mealsPerDay: data.mealsPerDay != null ? String(data.mealsPerDay) : "",
      externalId: data.externalId ?? "",
      website: data.website ?? "",
      notes: data.notes ?? "",
    });
    setEditing(true);
  };

  const tabClass = (t: string) => `px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`;
  const allDeals = data.deals;
  const more = (shown: number, hasMore: boolean | undefined, label: string) => hasMore ? (
    <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
      <span>Showing the latest {shown} {label} — there are more.</span>
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isFetching} onClick={() => setLimit((l) => Math.min(l + 50, 500))}>
        {isFetching ? "Loading…" : "Show more"}
      </Button>
    </div>
  ) : null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">{data.name}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px]">{typeLabel(data.type)}</Badge>
            {data.state && <span>· {data.state}</span>}
            {data.region && <span>· {data.region}</span>}
            {data.mealsPerDay != null && <span>· {data.mealsPerDay.toLocaleString()} meals/day</span>}
          </div>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <QuickAddTask accountId={id} label="Task" />
            <Button size="sm" variant="outline" onClick={startEdit}>Edit</Button>
            <Button size="sm" variant="outline" onClick={() => setMerging((m) => !m)}><GitMerge className="h-3.5 w-3.5 mr-1" />Merge</Button>
            <Button size="sm" variant="outline" className="text-destructive" disabled={del.isPending} onClick={() => {
              if (confirm(`Delete "${data.name}"? Contacts and deals stay but are unlinked; child accounts move up a level.`)) del.mutate({ id });
            }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>

      {merging && (
        <div className="rounded-md border p-2 space-y-2 text-xs">
          <p className="text-muted-foreground">Pick a duplicate to merge into <span className="font-medium text-foreground">{data.name}</span>. Its contacts, deals, tasks and child accounts move here and it is deleted.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={mergeId} onValueChange={setMergeId}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Duplicate account" /></SelectTrigger>
              <SelectContent>{otherAccounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" className="h-8" disabled={!mergeId || merge.isPending} onClick={() => merge.mutate({ primaryId: id, duplicateIds: [Number(mergeId)] })}>
              {merge.isPending ? "Merging…" : "Merge"}
            </Button>
          </div>
        </div>
      )}

      {data.parent && (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => onNavigate(data.parent!.id)}>
          Part of <span className="font-medium text-foreground">{data.parent.name}</span> <ChevronRight className="h-3 w-3" />
        </button>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Stat label="Sub-accounts" value={data.rollup.descendantCount.toLocaleString()} />
        <Stat label="Contacts (all)" value={data.rollup.contactCount.toLocaleString()} />
        <Stat label="Open deals (all)" value={data.rollup.openDealCount.toLocaleString()} />
        <Stat label="Open pipeline" value={`$${data.rollup.openDealAmount.toLocaleString()}`} />
      </div>

      <div className="flex gap-1 border-b pb-2 overflow-x-auto">
        <button className={tabClass("overview")} onClick={() => setTab("overview")}>Overview</button>
        <button className={tabClass("contacts")} onClick={() => setTab("contacts")}>Contacts ({data.rollup.contactCount})</button>
        <button className={tabClass("deals")} onClick={() => setTab("deals")}>Deals ({allDeals.length}{data.hasMore.deals ? "+" : ""})</button>
        <button className={tabClass("tasks")} onClick={() => setTab("tasks")}>Tasks</button>
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

      {tab === "overview" && editing && (
        <div className="space-y-3">
          <AccountFields form={form} setForm={setForm} parentOptions={otherAccounts} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" disabled={!form.name.trim() || update.isPending} onClick={() => update.mutate({
              id,
              name: form.name.trim(),
              type: form.type,
              parentAccountId: form.parentAccountId ? Number(form.parentAccountId) : null,
              region: form.region || null,
              state: form.state || null,
              mealsPerDay: form.mealsPerDay ? Number(form.mealsPerDay) : null,
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
                <div className="flex items-center gap-1.5">
                  {c.leadScore ? <Badge variant="outline" className="text-[10px] tabular-nums">{c.leadScore}</Badge> : null}
                  <Badge variant="secondary" className="capitalize text-[11px]">{c.contactType}</Badge>
                </div>
              </div>
            ))}
            {more(data.contacts.length, data.hasMore.contacts, "contacts")}
          </div>
        )
      )}

      {tab === "deals" && (
        allDeals.length === 0 ? <p className="text-sm text-muted-foreground italic">No deals for this account or its sub-accounts.</p> : (
          <div className="space-y-1">
            {allDeals.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-1 p-2 border rounded-lg text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.name}{d.accountId !== id && <span className="text-xs text-muted-foreground font-normal"> · sub-account</span>}</div>
                  <div className="text-xs text-muted-foreground capitalize">{d.stage.replace(/_/g, " ")} · {d.status}{d.isStale ? " · stale" : ""}</div>
                </div>
                <div className="font-semibold tabular-nums">${Number(d.amount ?? 0).toLocaleString()}</div>
              </div>
            ))}
            {more(allDeals.length, data.hasMore.deals, "deals")}
          </div>
        )
      )}

      {tab === "tasks" && <TaskList filter={{ accountId: id }} compact />}

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
            {more(data.timeline.length, data.hasMore.timeline, "activities")}
          </div>
        )
      )}

      <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-2 border-t">
        <Users className="h-3 w-3" /> Timeline and totals roll up across sub-accounts.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
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
