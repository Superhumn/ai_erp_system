import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Loader2, Trash2, Edit, Megaphone, Tag, Send, Users, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { ContactMultiPicker } from "@/components/ContactMultiPicker";
import {
  type CampaignStatus,
  campaignStatusLabel,
  canEditRecipients,
  canSendCampaign,
  parseDateTimeLocal,
  recipientStatusCounts,
  toDateTimeLocalValue,
  unsentRecipientCount,
} from "@/lib/emailOutreach";

// ============================================
// CRM ADMIN PAGE (Issue #268)
// Campaigns CRUD + ContactTagsPicker component
// ============================================

export default function CRMAdmin() {
  const [activeTab, setActiveTab] = useState<"campaigns" | "tags">("campaigns");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          CRM Admin
        </h1>
        <p className="text-muted-foreground">Manage CRM campaigns and contact tags</p>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${activeTab === "campaigns" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Megaphone className="h-4 w-4 inline mr-1" /> Campaigns
        </button>
        <button
          onClick={() => setActiveTab("tags")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${activeTab === "tags" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Tag className="h-4 w-4 inline mr-1" /> Tags
        </button>
      </div>

      {activeTab === "campaigns" && <CampaignsSection />}
      {activeTab === "tags" && <TagsSection />}
    </div>
  );
}

// ============================================
// CAMPAIGNS SECTION
// ============================================
function CampaignsSection() {
  const utils = trpc.useUtils();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    bodyHtml: "",
    type: "custom" as "newsletter" | "drip" | "announcement" | "follow_up" | "custom",
    status: "draft" as CampaignStatus,
    scheduledAt: "",
  });

  const { data: campaigns, isLoading } = trpc.crm.campaigns.list.useQuery({});

  const createCampaign = trpc.crm.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campaign created");
      setShowNew(false);
      resetForm();
      utils.crm.campaigns.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCampaign = trpc.crm.campaigns.update.useMutation({
    onSuccess: () => {
      toast.success("Campaign updated");
      setEditingId(null);
      resetForm();
      utils.crm.campaigns.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => setForm({ name: "", subject: "", bodyHtml: "", type: "custom", status: "draft", scheduledAt: "" });

  const openEdit = (c: any) => {
    setForm({
      name: c.name || "",
      subject: c.subject || "",
      bodyHtml: c.bodyHtml || "",
      type: c.type || "custom",
      status: c.status || "draft",
      // Format as local YYYY-MM-DD (en-CA) so the date shown in the date input
      // doesn't shift for users outside UTC.
      scheduledAt: c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString("en-CA") : "",
    });
    setEditingId(c.id);
  };

  const isDialogOpen = showNew || editingId !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>CRM Campaigns</CardTitle>
          <Button size="sm" onClick={() => { resetForm(); setShowNew(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Campaign
          </Button>
        </div>
        <CardDescription>Create and manage CRM-side campaigns for contact engagement</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No campaigns yet. Create one to start engaging contacts.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaigns as any[]).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{c.type || "custom"}</Badge></TableCell>
                  <TableCell>
                    <Badge className={
                      c.status === "sent" ? "bg-muted text-muted-foreground" :
                      c.status === "sending" ? "bg-primary/10 text-primary" :
                      c.status === "scheduled" ? "bg-muted text-foreground" :
                      c.status === "paused" ? "bg-muted text-foreground font-semibold" :
                      c.status === "cancelled" ? "bg-[oklch(0.30_0.02_262)] text-white" :
                      c.status === "partially_failed" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }>{campaignStatusLabel(c.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setSendingId(c.id)} title="Recipients & send">
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="Edit">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={(o) => { if (!o) { setShowNew(false); setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Campaign" : "New Campaign"}</DialogTitle>
            <DialogDescription>Configure your CRM campaign</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Campaign name" /></div>
            <div><Label>Subject</Label><Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Email subject line" /></div>
            <div><Label>Body</Label><Textarea value={form.bodyHtml} onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))} rows={4} placeholder="Email body (HTML allowed)" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newsletter">Newsletter</SelectItem>
                    <SelectItem value="drip">Drip</SelectItem>
                    <SelectItem value="announcement">Announcement</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="sending">Sending</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Scheduled At</Label><Input type="date" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setEditingId(null); resetForm(); }}>Cancel</Button>
            <Button
              disabled={!form.name || !form.subject || createCampaign.isPending || updateCampaign.isPending}
              onClick={() => {
                // Parse the date-only value as local time (no timezone suffix)
                // so the intended day isn't shifted by UTC interpretation.
                const scheduledAt = form.scheduledAt ? new Date(`${form.scheduledAt}T00:00:00`) : undefined;
                const payload = {
                  name: form.name,
                  subject: form.subject,
                  bodyHtml: form.bodyHtml,
                  type: form.type,
                  // partially_failed is set by the sender only; leave it untouched on edit.
                  status: form.status === "partially_failed" ? undefined : form.status,
                  scheduledAt,
                };
                if (editingId) {
                  updateCampaign.mutate({ id: editingId, ...payload });
                } else {
                  createCampaign.mutate(payload);
                }
              }}
            >
              {(createCampaign.isPending || updateCampaign.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Save Changes" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {sendingId !== null && <CampaignSendDialog campaignId={sendingId} onClose={() => setSendingId(null)} />}
    </Card>
  );
}

// ============================================
// CAMPAIGN RECIPIENTS + SEND
// ============================================
const CONTACT_TYPES = ["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"] as const;
const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

function CampaignSendDialog({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: campaign } = trpc.crm.campaigns.get.useQuery({ id: campaignId });
  const { data: recipients, isLoading } = trpc.crm.campaigns.recipients.useQuery({ campaignId });
  const [picked, setPicked] = useState<number[]>([]);
  const [segTypes, setSegTypes] = useState<Array<(typeof CONTACT_TYPES)[number]>>([]);
  const [segStages, setSegStages] = useState<Array<(typeof PIPELINE_STAGES)[number]>>([]);
  const [testTo, setTestTo] = useState("");
  const [scheduleAt, setScheduleAt] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [confirm, setConfirm] = useState<"send" | "schedule" | null>(null);

  const refresh = () => {
    utils.crm.campaigns.recipients.invalidate({ campaignId });
    utils.crm.campaigns.get.invalidate({ id: campaignId });
    utils.crm.campaigns.list.invalidate();
  };
  const onError = (e: { message: string }) => toast.error(e.message);

  const addRecipients = trpc.crm.campaigns.addRecipients.useMutation({
    onSuccess: (r) => {
      toast.success(`Added ${r.added} recipient${r.added === 1 ? "" : "s"}${r.skipped.length ? ` (${r.skipped.length} skipped)` : ""}`);
      setPicked([]);
      refresh();
    },
    onError,
  });
  const removeRecipient = trpc.crm.campaigns.removeRecipient.useMutation({ onSuccess: refresh, onError });
  const sendTest = trpc.crm.campaigns.sendTest.useMutation({ onSuccess: () => toast.success(`Test sent to ${testTo}`), onError });
  const send = trpc.crm.campaigns.send.useMutation({
    onSuccess: (r) => {
      if (r.failed > 0) toast.warning(`Sent ${r.sent}, ${r.failed} failed — send again to retry the failures`);
      else toast.success(`Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} skipped)` : ""}`);
      refresh();
    },
    onError: (e) => { onError(e); refresh(); },
  });
  const schedule = trpc.crm.campaigns.schedule.useMutation({
    onSuccess: (r) => { toast.success(`Scheduled for ${new Date(r.scheduledAt).toLocaleString()}`); refresh(); },
    onError,
  });
  const unschedule = trpc.crm.campaigns.unschedule.useMutation({ onSuccess: () => { toast.success("Schedule cleared"); refresh(); }, onError });

  const rows = recipients ?? [];
  const editable = canEditRecipients(campaign?.status);
  const unsent = unsentRecipientCount(rows);
  const onCampaign = new Set(rows.map((r) => r.contactId));
  const scheduleDate = parseDateTimeLocal(scheduleAt);
  const toggleIn = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {campaign?.name ?? "Campaign"}
            {campaign && <Badge variant="outline" className="capitalize">{campaignStatusLabel(campaign.status)}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Subject: {campaign?.subject ?? "…"} · Merge fields: {"{{firstName}}"}, {"{{lastName}}"}, {"{{company}}"}, {"{{jobTitle}}"}; fallback with {"{{firstName|there}}"}.
            {campaign?.status === "scheduled" && campaign.scheduledAt && <> · Scheduled for {new Date(campaign.scheduledAt).toLocaleString()}</>}
          </DialogDescription>
        </DialogHeader>

        {/* Recipients */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4" /> Recipients ({rows.length})</h3>
            <div className="flex gap-1 flex-wrap">
              {recipientStatusCounts(rows).map(([s, n]) => <Badge key={s} variant="outline" className="capitalize">{s}: {n}</Badge>)}
            </div>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recipients yet — add contacts below.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Contact</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead><TableHead></TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.contactName ?? `#${r.contactId}`}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${r.status === "failed" ? "text-destructive border-destructive/40" : ""}`} title={r.error ?? undefined}>{r.status ?? "pending"}</Badge>
                        {r.error && <div className="text-xs text-muted-foreground mt-1 max-w-[220px] truncate" title={r.error}>{r.error}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        {editable && (r.status === "pending" || r.status === "failed" || r.status === "skipped") && (
                          <Button variant="ghost" size="sm" disabled={removeRecipient.isPending} onClick={() => removeRecipient.mutate({ campaignId, recipientId: r.id })} title="Remove">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {editable && (
          <div className="grid md:grid-cols-2 gap-4 border-t pt-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Add contacts</h3>
              <ContactMultiPicker value={picked} onChange={setPicked} excludeIds={onCampaign} />
              <Button size="sm" disabled={!picked.length || addRecipients.isPending} onClick={() => addRecipients.mutate({ campaignId, contactIds: picked })}>
                <Plus className="h-4 w-4 mr-1" /> Add {picked.length || ""} selected
              </Button>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Add a segment</h3>
              <p className="text-xs text-muted-foreground">Active contacts with an email who have not opted out.</p>
              <div>
                <Label className="text-xs">Contact types</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {CONTACT_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-1 text-xs capitalize">
                      <Checkbox checked={segTypes.includes(t)} onCheckedChange={(v) => setSegTypes((l) => toggleIn(l, t, v === true))} /> {t}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Pipeline stages</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PIPELINE_STAGES.map((t) => (
                    <label key={t} className="flex items-center gap-1 text-xs capitalize">
                      <Checkbox checked={segStages.includes(t)} onCheckedChange={(v) => setSegStages((l) => toggleIn(l, t, v === true))} /> {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" disabled={(!segTypes.length && !segStages.length) || addRecipients.isPending}
                  onClick={() => addRecipients.mutate({ campaignId, segment: { contactTypes: segTypes, pipelineStages: segStages } })}>
                  Add segment
                </Button>
                {(campaign?.targetContactTypes || campaign?.targetPipelineStages || campaign?.targetTags) && (
                  <Button size="sm" variant="outline" disabled={addRecipients.isPending}
                    onClick={() => addRecipients.mutate({ campaignId, segment: { useCampaignTargeting: true } })}>
                    Use campaign targeting
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Test + send */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Send a test to</Label>
              <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@company.com" />
            </div>
            <Button variant="outline" disabled={!testTo.includes("@") || sendTest.isPending} onClick={() => sendTest.mutate({ campaignId, to: testTo.trim() })}>
              {sendTest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send test
            </Button>
          </div>
          {canSendCampaign(campaign?.status) ? (
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-xs">Schedule for</Label>
                <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              </div>
              <Button variant="outline" disabled={!unsent || !scheduleDate || schedule.isPending} onClick={() => setConfirm("schedule")}>
                <Clock className="h-4 w-4 mr-1" /> Schedule
              </Button>
              {campaign?.status === "scheduled" && (
                <Button variant="ghost" disabled={unschedule.isPending} onClick={() => unschedule.mutate({ campaignId })}>Clear schedule</Button>
              )}
              <div className="flex-1" />
              <Button disabled={!unsent || send.isPending} onClick={() => setConfirm("send")}>
                {send.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Send now ({unsent})
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This campaign is {campaignStatusLabel(campaign?.status)}; nothing left to send.</p>
          )}
        </div>

        <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm === "send" ? "Send campaign now?" : "Schedule campaign?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm === "send"
                  ? `This emails ${unsent} recipient${unsent === 1 ? "" : "s"} immediately. Recipients already sent to are never emailed again.`
                  : `This emails ${unsent} recipient${unsent === 1 ? "" : "s"} at ${scheduleDate?.toLocaleString() ?? "the chosen time"} (checked every 5 minutes).`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                if (confirm === "send") send.mutate({ campaignId });
                else if (scheduleDate) schedule.mutate({ campaignId, scheduledAt: scheduleDate });
                setConfirm(null);
              }}>
                {confirm === "send" ? "Send" : "Schedule"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// TAGS SECTION
// ============================================
function TagsSection() {
  const utils = trpc.useUtils();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newCategory, setNewCategory] = useState<"contact" | "deal" | "general">("contact");

  const { data: tags, isLoading } = trpc.crm.tags.list.useQuery({});

  const createTag = trpc.crm.tags.create.useMutation({
    onSuccess: () => {
      toast.success("Tag created");
      setNewName("");
      utils.crm.tags.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTag = trpc.crm.tags.delete.useMutation({
    onSuccess: () => {
      toast.success("Tag deleted");
      utils.crm.tags.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" /> Tag Taxonomy</CardTitle>
        <CardDescription>Create and manage tags that can be assigned to contacts and deals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !tags || (tags as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No tags yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(tags as any[]).map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color || "#94a3b8" }} />
                <span className="flex-1 text-sm font-medium">{t.name}</span>
                {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete tag "${t.name}"?`)) deleteTag.mutate({ id: t.id }); }} disabled={deleteTag.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Tag</Label>
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 rounded border bg-background cursor-pointer" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
            <Input placeholder="Tag name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={newCategory} onChange={(e) => setNewCategory(e.target.value as any)}>
              <option value="contact">contact</option>
              <option value="deal">deal</option>
              <option value="general">general</option>
            </select>
            <Button size="sm" disabled={!newName.trim() || createTag.isPending} onClick={() => createTag.mutate({ name: newName.trim(), color: newColor, category: newCategory })}>
              {createTag.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// CONTACT TAGS PICKER (reusable component)
// Drop into contact detail pages to assign tags
// ============================================
export function ContactTagsPicker({ contactId }: { contactId: number }) {
  const utils = trpc.useUtils();
  const { data: allTags } = trpc.crm.tags.list.useQuery({});
  const { data: contactTags } = trpc.crm.tags.getForContact.useQuery({ contactId });

  const addTag = trpc.crm.tags.addToContact.useMutation({
    onSuccess: () => { toast.success("Tag added"); utils.crm.tags.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeTag = trpc.crm.tags.removeFromContact.useMutation({
    onSuccess: () => { toast.success("Tag removed"); utils.crm.tags.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignedTagIds = new Set((contactTags as any[] || []).map((t: any) => t.id));

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Tags</Label>
      <div className="flex flex-wrap gap-1">
        {(allTags as any[] || []).filter((t: any) => t.category === "contact" || t.category === "general").map((tag: any) => {
          const assigned = assignedTagIds.has(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => {
                if (assigned) removeTag.mutate({ contactId, tagId: tag.id });
                else addTag.mutate({ contactId, tagId: tag.id });
              }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${assigned ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: tag.color || "#94a3b8" }} />
              {tag.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
