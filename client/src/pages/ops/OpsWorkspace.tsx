// Ops Toolkit workspace — the authenticated home for the four Stackby-style
// capabilities:
//   • Views      (Item 1) — grid/kanban/calendar/timeline over Orders / POs / Grants
//   • Forms      (Item 2) — intake form builder + submissions
//   • Automations(Item 3) — trigger -> condition -> action rules
//   • Reports    (Item 4) — self-serve pivot builder
//
// Reachable at /ops (also /ops/views, /ops/forms, /ops/automations, /ops/reports).
// The sidebar is locked, so this page is entry-pointed from module pages and by URL.

import { useState } from "react";
import { useRoute } from "wouter";
import {
  LayoutDashboard, FileText, Zap, PieChart, Plus, Trash2, Pencil,
  Link2, Inbox, Play, Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import DataViews from "@/components/opsToolkit/DataViews";
import PivotTable from "@/components/opsToolkit/PivotTable";
import FormBuilder, { type FormDraft } from "@/components/opsToolkit/FormBuilder";
import AutomationBuilder, { type AutomationDraft } from "@/components/opsToolkit/AutomationBuilder";
import type { Row } from "@/lib/opsToolkit/viewData";
import type { FormField } from "@shared/opsToolkit";

const DATA_MODULES = [
  { key: "orders", label: "Orders", title: "orderNumber", group: "status", date: "orderDate" },
  { key: "procurement", label: "Procurement (POs)", title: "poNumber", group: "status", date: "expectedDate" },
  { key: "grants", label: "Grants", title: "title", group: "status", date: "submissionDeadline" },
] as const;

type DataModuleKey = (typeof DATA_MODULES)[number]["key"];

// Shared hook: fetch the record list for the selected module (only the active one).
function useModuleRows(module: DataModuleKey) {
  const ordersQ = trpc.orders.list.useQuery(undefined, { enabled: module === "orders" });
  const poQ = trpc.purchaseOrders.list.useQuery(undefined, { enabled: module === "procurement" });
  const grantsQ = trpc.grantBid.applications.list.useQuery({}, { enabled: module === "grants" });
  const active = module === "orders" ? ordersQ : module === "procurement" ? poQ : grantsQ;
  return {
    rows: ((active.data as unknown as Row[]) || []),
    isLoading: active.isLoading,
    meta: DATA_MODULES.find((m) => m.key === module)!,
  };
}

export default function OpsWorkspace() {
  const [, params] = useRoute("/ops/:tab");
  const tabParam = (params as { tab?: string } | null)?.tab;
  const initialTab = tabParam && ["views", "forms", "automations", "reports"].includes(tabParam) ? tabParam : "views";
  const [tab, setTab] = useState<string>(initialTab);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ops Toolkit</h1>
        <p className="text-sm text-muted-foreground">
          Spreadsheet-database capabilities on top of your ERP — flexible views, intake forms, automations, and reports.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="views" className="gap-1.5"><LayoutDashboard className="h-4 w-4" /> Views</TabsTrigger>
          <TabsTrigger value="forms" className="gap-1.5"><FileText className="h-4 w-4" /> Forms</TabsTrigger>
          <TabsTrigger value="automations" className="gap-1.5"><Zap className="h-4 w-4" /> Automations</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><PieChart className="h-4 w-4" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="views" className="pt-4"><ViewsPanel /></TabsContent>
        <TabsContent value="forms" className="pt-4"><FormsPanel /></TabsContent>
        <TabsContent value="automations" className="pt-4"><AutomationsPanel /></TabsContent>
        <TabsContent value="reports" className="pt-4"><ReportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item 1 — Views
// ---------------------------------------------------------------------------
function ModulePicker({ value, onChange }: { value: DataModuleKey; onChange: (v: DataModuleKey) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DataModuleKey)}>
      <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
      <SelectContent>{DATA_MODULES.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function ViewsPanel() {
  const [module, setModule] = useState<DataModuleKey>("orders");
  const { rows, isLoading, meta } = useModuleRows(module);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Dataset</span>
        <ModulePicker value={module} onChange={setModule} />
        <span className="text-xs text-muted-foreground">{rows.length} records</span>
      </div>
      <DataViews
        key={module}
        module={module}
        rows={rows}
        isLoading={isLoading}
        titleField={meta.title}
        defaultGroupByField={meta.group}
        defaultDateField={meta.date}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item 4 — Reports
// ---------------------------------------------------------------------------
function ReportsPanel() {
  const [module, setModule] = useState<DataModuleKey>("orders");
  const { rows, isLoading } = useModuleRows(module);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Dataset</span>
        <ModulePicker value={module} onChange={setModule} />
        <span className="text-xs text-muted-foreground">{rows.length} records</span>
      </div>
      <PivotTable key={module} module={module} rows={rows} isLoading={isLoading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item 2 — Forms
// ---------------------------------------------------------------------------
function FormsPanel() {
  const utils = trpc.useUtils();
  const { data: forms, isLoading } = trpc.opsForms.list.useQuery();
  const [editing, setEditing] = useState<null | { id?: number; draft?: Partial<FormDraft> }>(null);
  const [submissionsFor, setSubmissionsFor] = useState<number | null>(null);

  const createForm = trpc.opsForms.create.useMutation({
    onSuccess: () => { toast.success("Form created"); setEditing(null); utils.opsForms.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateForm = trpc.opsForms.update.useMutation({
    onSuccess: () => { toast.success("Form saved"); setEditing(null); utils.opsForms.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteForm = trpc.opsForms.delete.useMutation({
    onSuccess: () => { toast.success("Form deleted"); utils.opsForms.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function save(draft: FormDraft) {
    if (editing?.id) updateForm.mutate({ id: editing.id, ...draft });
    else createForm.mutate(draft);
  }
  function copyLink(slug: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/f/${slug}`);
    toast.success("Share link copied");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gap-1.5" onClick={() => setEditing({ draft: {} })}><Plus className="h-4 w-4" /> New form</Button>
      </div>

      {isLoading ? (
        <Loading />
      ) : !forms || forms.length === 0 ? (
        <Empty icon={FileText} text="No intake forms yet. Create one to capture leads, requests, or onboarding info." />
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    {f.isPublished ? <Badge variant="secondary">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                    {f.isPublic && <Badge variant="outline">Public</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{(f.fields as FormField[] | null)?.length ?? 0} fields · /f/{f.slug}</p>
                </div>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => copyLink(f.slug)}><Link2 className="h-4 w-4" /> Link</Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setSubmissionsFor(f.id)}><Inbox className="h-4 w-4" /> Submissions</Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing({ id: f.id, draft: toFormDraft(f) })}><Pencil className="h-4 w-4" /> Edit</Button>
                <Button size="icon-sm" variant="ghost" onClick={() => { if (confirm(`Delete “${f.name}”?`)) deleteForm.mutate({ id: f.id }); }}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Builder dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit form" : "New form"}</DialogTitle></DialogHeader>
          {editing && (
            <FormBuilder initial={editing.draft} saving={createForm.isPending || updateForm.isPending} onSave={save} />
          )}
        </DialogContent>
      </Dialog>

      {/* Submissions dialog */}
      <Dialog open={submissionsFor !== null} onOpenChange={(o) => !o && setSubmissionsFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Submissions</DialogTitle></DialogHeader>
          {submissionsFor !== null && <SubmissionsList formId={submissionsFor} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmissionsList({ formId }: { formId: number }) {
  const utils = trpc.useUtils();
  const { data: subs, isLoading } = trpc.opsForms.submissions.useQuery({ formId });
  const setStatus = trpc.opsForms.updateSubmissionStatus.useMutation({
    onSuccess: () => utils.opsForms.submissions.invalidate({ formId }),
  });
  if (isLoading) return <Loading />;
  if (!subs || subs.length === 0) return <Empty icon={Inbox} text="No submissions yet." />;
  return (
    <div className="space-y-2">
      {subs.map((s) => (
        <Card key={s.id}>
          <CardContent className="space-y-1 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {s.submittedByName || s.submittedByEmail || "Anonymous"} · {new Date(s.createdAt).toLocaleString()}
              </span>
              <Select value={s.status} onValueChange={(v) => setStatus.mutate({ id: s.id, status: v as "new" | "reviewed" | "archived" })}>
                <SelectTrigger className="h-7 w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
              {Object.entries((s.data as Record<string, unknown>) || {}).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-muted-foreground">{k}</dt>
                  <dd className="truncate">{Array.isArray(v) ? v.join(", ") : String(v ?? "")}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item 3 — Automations
// ---------------------------------------------------------------------------
function AutomationsPanel() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.opsAutomations.list.useQuery();
  const [editing, setEditing] = useState<null | { id?: number; draft?: Partial<AutomationDraft> }>(null);

  const createRule = trpc.opsAutomations.create.useMutation({
    onSuccess: () => { toast.success("Rule created"); setEditing(null); utils.opsAutomations.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateRule = trpc.opsAutomations.update.useMutation({
    onSuccess: () => { toast.success("Rule saved"); setEditing(null); utils.opsAutomations.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.opsAutomations.delete.useMutation({
    onSuccess: () => { toast.success("Rule deleted"); utils.opsAutomations.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = trpc.opsAutomations.update.useMutation({ onSuccess: () => utils.opsAutomations.list.invalidate() });
  const testRun = trpc.opsAutomations.testRun.useMutation({
    onSuccess: (r) => toast.success(r.detail || "Test complete"),
    onError: (e) => toast.error(e.message),
  });

  function save(draft: AutomationDraft) {
    if (editing?.id) updateRule.mutate({ id: editing.id, ...draft });
    else createRule.mutate(draft);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gap-1.5" onClick={() => setEditing({ draft: {} })}><Plus className="h-4 w-4" /> New automation</Button>
      </div>

      {isLoading ? (
        <Loading />
      ) : !rules || rules.length === 0 ? (
        <Empty icon={Zap} text="No automations yet. Create a rule to notify people or call a webhook when records change." />
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <Badge variant={r.isActive ? "secondary" : "outline"}>{r.isActive ? "Active" : "Paused"}</Badge>
                    <Badge variant="outline" className="capitalize">{r.module}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {labelTrigger(r.triggerType)} → {labelAction(r.actionType)} · ran {r.runCount}×
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="gap-1.5" disabled={testRun.isPending} onClick={() => testRun.mutate({ ruleId: r.id, sampleRecord: {} })}>
                  <Play className="h-4 w-4" /> Test
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}>
                  {r.isActive ? "Pause" : "Activate"}
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing({ id: r.id, draft: toAutomationDraft(r) })}><Pencil className="h-4 w-4" /> Edit</Button>
                <Button size="icon-sm" variant="ghost" onClick={() => { if (confirm(`Delete “${r.name}”?`)) deleteRule.mutate({ id: r.id }); }}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit automation" : "New automation"}</DialogTitle></DialogHeader>
          {editing && (
            <AutomationBuilder initial={editing.draft} saving={createRule.isPending || updateRule.isPending} onSave={save} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- small shared bits ----
function Loading() {
  return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;
}
function Empty({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="rounded-lg border border-dashed py-16 text-center">
      <Icon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function toFormDraft(f: any): Partial<FormDraft> {
  return {
    name: f.name,
    description: f.description || "",
    fields: (f.fields as FormField[]) || [],
    targetModule: f.targetModule || "custom",
    isPublished: f.isPublished,
    isPublic: f.isPublic,
    submitMessage: f.submitMessage || "",
    notifyEmails: f.notifyEmails || "",
  };
}

function toAutomationDraft(r: any): Partial<AutomationDraft> {
  return {
    name: r.name,
    description: r.description || "",
    module: r.module,
    triggerType: r.triggerType as AutomationDraft["triggerType"],
    triggerConfig: (r.triggerConfig as AutomationDraft["triggerConfig"]) || {},
    conditions: (r.conditions as AutomationDraft["conditions"]) || [],
    actionType: r.actionType as AutomationDraft["actionType"],
    actionConfig: (r.actionConfig as AutomationDraft["actionConfig"]) || {},
    isActive: r.isActive,
  };
}

function labelTrigger(t: string) {
  return ({ record_created: "On create", record_updated: "On update", field_changed: "On field change", form_submitted: "On form submit", scheduled: "Scheduled" } as Record<string, string>)[t] || t;
}
function labelAction(a: string) {
  return ({ send_email: "Send email", create_notification: "Notify", webhook: "Webhook" } as Record<string, string>)[a] || a;
}
