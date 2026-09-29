import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3, Megaphone, Users as UsersIcon, Link2, Gift, Plug, Plus, RefreshCw, Trash2, Copy, Loader2, AlertTriangle, CheckCircle2, Pencil,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import {
  AD_CAMPAIGN_STATUSES, AD_CREDIT_STATUSES, AD_PLATFORM_LABELS, AD_PLATFORM_NAMES, addIsoDays, buildTrackingUrl, creditRemainingUsd, toIsoDate,
  type AdPlatformName,
} from "../../../../shared/adMarketing";

// ---------------------------------------------------------------------------
// Paid ads: the paperwork behind ads. Ads are still built on each platform;
// this screen records spend, leads, links and credits and shows cost per
// signup (spend ÷ signups) by platform. All calls: adMarketing.*
// ---------------------------------------------------------------------------

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Platform = RouterOutputs["adMarketing"]["platforms"]["list"][number];
type Campaign = RouterOutputs["adMarketing"]["campaigns"]["list"][number];
type Credit = RouterOutputs["adMarketing"]["credits"]["list"][number];

const money = (v: number | string | null | undefined) => (v == null || v === "" ? "—" : formatCurrency(v));
const cps = (v: number | null | undefined) => (v == null ? "—" : formatCurrency(v));
const dateStr = (v: Date | string | null | undefined) => {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy");
};
const toInputDate = (v: Date | string | null | undefined) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "" : toIsoDate(d);
};
const platformLabel = (p: string | null | undefined) => (p ? AD_PLATFORM_LABELS[p as AdPlatformName] ?? p : "—");

function Stat({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: LucideIcon; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            <div className="text-lg font-semibold leading-tight font-display tabular-nums">{value}</div>
            {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function usePlatforms() {
  return trpc.adMarketing.platforms.list.useQuery();
}
function useCampaigns() {
  return trpc.adMarketing.campaigns.list.useQuery();
}

// ---------- Cost per signup ----------

function CostPerSignupTab() {
  const today = toIsoDate(new Date());
  const [from, setFrom] = useState(addIsoDays(today, -30));
  const [to, setTo] = useState(addIsoDays(today, -1));
  const summary = trpc.adMarketing.spend.summary.useQuery({ from, to }, { enabled: from <= to });
  const s = summary.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((n) => (
            <Button key={n} size="sm" variant="outline" className="h-8" onClick={() => { setTo(addIsoDays(today, -1)); setFrom(addIsoDays(today, -n)); }}>{n}d</Button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground ml-auto">Spend updates every morning from each platform.</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Spend" value={money(s?.total.spendUsd ?? 0)} icon={BarChart3} />
        <Stat label="Clicks" value={s?.total.clicks ?? 0} icon={Link2} hint={s?.total.clickRate != null ? `${s.total.clickRate}% of impressions` : undefined} />
        <Stat label="Signups" value={s?.total.signups ?? 0} icon={UsersIcon} />
        <Stat label="Cost per signup" value={cps(s?.total.costPerSignup)} icon={Megaphone} hint={s?.total.costPerClick != null ? `${money(s.total.costPerClick)} per click` : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">By platform</CardTitle></CardHeader>
        <CardContent>
          {summary.isLoading && <div className="text-xs text-muted-foreground py-2">Loading…</div>}
          {s && s.byPlatform.length === 0 && <div className="text-xs text-muted-foreground py-2">No spend recorded in this range. Connect a platform or record a day by hand on the Campaigns tab.</div>}
          {s && s.byPlatform.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Signups</TableHead>
                  <TableHead className="text-right">Cost per signup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.byPlatform.map((p) => (
                  <TableRow key={p.platform}>
                    <TableCell className="font-medium">{p.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.spendUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.signups}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{cps(p.costPerSignup)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {s && s.byCampaign.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">By campaign</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Signups</TableHead>
                  <TableHead className="text-right">Cost per signup</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.byCampaign.map((c) => {
                  const target = c.targetCostPerSignupUsd != null ? parseFloat(String(c.targetCostPerSignupUsd)) : null;
                  const over = target != null && c.costPerSignup != null && c.costPerSignup > target;
                  return (
                    <TableRow key={c.campaignId}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{platformLabel(c.platform)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.spendUsd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.clicks.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.signups}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${over ? "text-destructive" : ""}`}>{cps(c.costPerSignup)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{target != null ? money(target) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {s && s.byDate.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">By day</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Signups</TableHead>
                  <TableHead className="text-right">Cost per signup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...s.byDate].reverse().map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{d.date}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(d.spendUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.signups}</TableCell>
                    <TableCell className="text-right tabular-nums">{cps(d.costPerSignup)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------- Campaigns ----------

type CampaignForm = {
  platformId: string; name: string; objective: string; dailyBudgetUsd: string; totalBudgetUsd: string; targetCostPerSignupUsd: string;
  startDate: string; endDate: string; status: (typeof AD_CAMPAIGN_STATUSES)[number]; externalId: string; utmCampaign: string;
  welcomeSubject: string; welcomeBody: string; notes: string;
};
const emptyCampaign = (platformId = ""): CampaignForm => ({
  platformId, name: "", objective: "", dailyBudgetUsd: "", totalBudgetUsd: "", targetCostPerSignupUsd: "", startDate: "", endDate: "",
  status: "planned", externalId: "", utmCampaign: "", welcomeSubject: "", welcomeBody: "", notes: "",
});
const optMoney = (v: string) => (v.trim() ? v.trim() : null);
const optStr = (v: string) => (v.trim() ? v.trim() : null);
const optDate = (v: string) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

function CampaignDialog({ open, onClose, initial, platforms }: { open: boolean; onClose: () => void; initial?: Campaign; platforms: Platform[] }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState<CampaignForm>(() =>
    initial
      ? {
          platformId: String(initial.platformId), name: initial.name, objective: initial.objective ?? "",
          dailyBudgetUsd: initial.dailyBudgetUsd ?? "", totalBudgetUsd: initial.totalBudgetUsd ?? "", targetCostPerSignupUsd: initial.targetCostPerSignupUsd ?? "",
          startDate: toInputDate(initial.startDate), endDate: toInputDate(initial.endDate), status: initial.status, externalId: initial.externalId ?? "",
          utmCampaign: initial.utmCampaign ?? "", welcomeSubject: initial.welcomeSubject ?? "", welcomeBody: initial.welcomeBody ?? "", notes: initial.notes ?? "",
        }
      : emptyCampaign(platforms[0] ? String(platforms[0].id) : ""),
  );
  const set = <K extends keyof CampaignForm>(k: K, v: CampaignForm[K]) => setF((s) => ({ ...s, [k]: v }));
  const done = () => { utils.adMarketing.campaigns.list.invalidate(); utils.adMarketing.spend.summary.invalidate(); onClose(); };
  const create = trpc.adMarketing.campaigns.create.useMutation({ onSuccess: () => { toast.success("Campaign added"); done(); }, onError: (e) => toast.error(e.message) });
  const update = trpc.adMarketing.campaigns.update.useMutation({ onSuccess: () => { toast.success("Campaign updated"); done(); }, onError: (e) => toast.error(e.message) });
  const pending = create.isPending || update.isPending;

  const submit = () => {
    if (!f.platformId) return toast.error("Pick a platform");
    if (!f.name.trim()) return toast.error("Enter a name");
    const payload = {
      platformId: Number(f.platformId), name: f.name.trim(), objective: optStr(f.objective), externalId: optStr(f.externalId),
      dailyBudgetUsd: optMoney(f.dailyBudgetUsd), totalBudgetUsd: optMoney(f.totalBudgetUsd), targetCostPerSignupUsd: optMoney(f.targetCostPerSignupUsd),
      startDate: optDate(f.startDate), endDate: optDate(f.endDate), status: f.status, utmCampaign: optStr(f.utmCampaign),
      welcomeSubject: optStr(f.welcomeSubject), welcomeBody: optStr(f.welcomeBody), notes: optStr(f.notes),
    };
    if (initial) update.mutate({ id: initial.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Edit campaign" : "New campaign"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Platform</Label>
            <Select value={f.platformId} onValueChange={(v) => set("platformId", v)}>
              <SelectTrigger><SelectValue placeholder="Pick a platform" /></SelectTrigger>
              <SelectContent>{platforms.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.label || platformLabel(p.name)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Name</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Fall launch — Instagram" /></div>
          <div><Label>Objective</Label><Input value={f.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Signups" /></div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v as CampaignForm["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AD_CAMPAIGN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Daily budget (USD)</Label><Input type="number" min="0" step="0.01" value={f.dailyBudgetUsd} onChange={(e) => set("dailyBudgetUsd", e.target.value)} /></div>
          <div><Label>Total budget (USD)</Label><Input type="number" min="0" step="0.01" value={f.totalBudgetUsd} onChange={(e) => set("totalBudgetUsd", e.target.value)} /></div>
          <div><Label>Start date</Label><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
          <div><Label>End date</Label><Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></div>
          <div>
            <Label>Cost per signup target (USD)</Label>
            <Input type="number" min="0" step="0.01" value={f.targetCostPerSignupUsd} onChange={(e) => set("targetCostPerSignupUsd", e.target.value)} placeholder="Alert after 3 days above this" />
          </div>
          <div>
            <Label>Platform campaign id</Label>
            <Input value={f.externalId} onChange={(e) => set("externalId", e.target.value)} placeholder="Matches synced spend and leads" />
          </div>
          <div>
            <Label>UTM campaign</Label>
            <Input value={f.utmCampaign} onChange={(e) => set("utmCampaign", e.target.value)} placeholder="Defaults to the name, lowercased" />
          </div>
          <div className="md:col-span-2 border-t pt-3">
            <div className="text-xs font-medium mb-2">Welcome email to each new lead (leave empty to send none)</div>
            <div className="grid gap-2">
              <Input value={f.welcomeSubject} onChange={(e) => set("welcomeSubject", e.target.value)} placeholder="Subject — you can use {{firstName}}" />
              <Textarea value={f.welcomeBody} onChange={(e) => set("welcomeBody", e.target.value)} rows={4} placeholder={"Hi {{firstName}},\n\nThanks for signing up…"} />
            </div>
          </div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}{initial ? "Save" : "Add campaign"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordSpendDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(addIsoDays(toIsoDate(new Date()), -1));
  const [spend, setSpend] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [signups, setSignups] = useState("");
  const record = trpc.adMarketing.spend.record.useMutation({
    onSuccess: () => { toast.success("Day recorded"); utils.adMarketing.spend.summary.invalidate(); utils.adMarketing.campaigns.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record a day — {campaign.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Spend (USD)</Label><Input type="number" min="0" step="0.01" value={spend} onChange={(e) => setSpend(e.target.value)} /></div>
          <div><Label>Impressions</Label><Input type="number" min="0" value={impressions} onChange={(e) => setImpressions(e.target.value)} /></div>
          <div><Label>Clicks</Label><Input type="number" min="0" value={clicks} onChange={(e) => setClicks(e.target.value)} /></div>
          <div><Label>Signups</Label><Input type="number" min="0" value={signups} onChange={(e) => setSignups(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={record.isPending || !date || !spend} onClick={() => record.mutate({
            campaignId: campaign.id, date, spendUsd: spend, impressions: Number(impressions || 0), clicks: Number(clicks || 0), signups: Number(signups || 0),
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignsTab() {
  const utils = trpc.useUtils();
  const platforms = usePlatforms();
  const campaigns = useCampaigns();
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [recording, setRecording] = useState<Campaign | null>(null);
  const del = trpc.adMarketing.campaigns.delete.useMutation({
    onSuccess: () => { toast.success("Campaign deleted"); utils.adMarketing.campaigns.list.invalidate(); utils.adMarketing.spend.summary.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const platformOf = useMemo(() => new Map((platforms.data ?? []).map((p) => [p.id, p])), [platforms.data]);
  const noPlatforms = platforms.data && platforms.data.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Budget, dates, status and owner for each campaign. Synced platforms add their campaigns here on their own.</div>
        <Button size="sm" onClick={() => setEditing("new")} disabled={!!noPlatforms}><Plus className="h-3 w-3 mr-1" /> New campaign</Button>
      </div>
      {noPlatforms && <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">Add a platform on the Platforms tab first.</div>}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Signups</TableHead>
                <TableHead className="text-right">Cost per signup</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaigns.data ?? []).map((c) => {
                const t = c.totals;
                const cpsVal = t && t.signups > 0 ? t.spendUsd / t.signups : null;
                const budget = c.totalBudgetUsd ?? (c.dailyBudgetUsd ? `${c.dailyBudgetUsd}/day` : null);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      {c.utmCampaign && <div className="text-[11px] text-muted-foreground">utm_campaign={c.utmCampaign}</div>}
                    </TableCell>
                    <TableCell>{platformOf.get(c.platformId)?.label || platformLabel(platformOf.get(c.platformId)?.name)}</TableCell>
                    <TableCell><Badge variant={c.status === "active" ? "default" : "outline"} className="text-[10px]">{c.status}</Badge></TableCell>
                    <TableCell className="text-xs">{dateStr(c.startDate)} → {dateStr(c.endDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{budget && !String(budget).includes("/day") ? money(budget) : budget ? `${money(c.dailyBudgetUsd)}/day` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(t?.spendUsd ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t?.signups ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{cps(cpsVal)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRecording(c)}>Record day</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(c)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete "${c.name}" and its spend rows?`)) del.mutate({ id: c.id }); }}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {campaigns.data && campaigns.data.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">No campaigns yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing && <CampaignDialog open onClose={() => setEditing(null)} initial={editing === "new" ? undefined : editing} platforms={platforms.data ?? []} />}
      {recording && <RecordSpendDialog campaign={recording} onClose={() => setRecording(null)} />}
    </div>
  );
}

// ---------- Leads ----------

function LeadsTab() {
  const utils = trpc.useUtils();
  const leads = trpc.adMarketing.leads.list.useQuery({ limit: 200 });
  const campaigns = useCampaigns();
  const platforms = usePlatforms();
  const campaignName = useMemo(() => new Map((campaigns.data ?? []).map((c) => [c.id, c.name])), [campaigns.data]);
  const platformName = useMemo(() => new Map((platforms.data ?? []).map((p) => [p.id, p.label || platformLabel(p.name)])), [platforms.data]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ campaignId: "", fullName: "", email: "", phone: "", organization: "", sendWelcome: false });
  const create = trpc.adMarketing.leads.create.useMutation({
    onSuccess: (r) => { toast.success(r.duplicate ? "Already recorded" : r.contactCreated ? "Lead added to CRM" : "Lead matched to an existing contact"); utils.adMarketing.leads.list.invalidate(); setAdding(false); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Every signup, with its platform and campaign. Each one is matched or added in CRM automatically.</div>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-3 w-3 mr-1" /> Add lead by hand</Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Welcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leads.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{l.receivedAt ? format(new Date(l.receivedAt), "MMM d, h:mm a") : "—"}</TableCell>
                  <TableCell className="font-medium">{l.fullName || "—"}</TableCell>
                  <TableCell className="text-xs">{l.email || "—"}</TableCell>
                  <TableCell className="text-xs">{l.platformId ? platformName.get(l.platformId) ?? platformLabel(l.source) : platformLabel(l.source)}{l.utmSource && l.utmSource !== l.source ? ` (${l.utmSource})` : ""}</TableCell>
                  <TableCell className="text-xs">{l.campaignId ? campaignName.get(l.campaignId) ?? `#${l.campaignId}` : l.utmCampaign || "—"}</TableCell>
                  <TableCell className="text-xs">{l.contactId ? <a className="underline" href={`/crm/contacts/${l.contactId}`}>Contact #{l.contactId}</a> : <span className="text-muted-foreground">Not linked</span>}</TableCell>
                  <TableCell className="text-xs">
                    {l.welcomeEmailSentAt ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : l.welcomeEmailError ? <span title={l.welcomeEmailError}><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /></span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
              {leads.data && leads.data.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No leads yet. Leads arrive from the Meta webhook, the LinkedIn poll, or the landing-page form.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a lead by hand</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Campaign</Label>
              <Select value={f.campaignId} onValueChange={(v) => setF((s) => ({ ...s, campaignId: v }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{(campaigns.data ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Name</Label><Input value={f.fullName} onChange={(e) => setF((s) => ({ ...s, fullName: e.target.value }))} /></div>
            <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF((s) => ({ ...s, phone: e.target.value }))} /></div>
            <div><Label>Company</Label><Input value={f.organization} onChange={(e) => setF((s) => ({ ...s, organization: e.target.value }))} /></div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.sendWelcome} onChange={(e) => setF((s) => ({ ...s, sendWelcome: e.target.checked }))} /> Send the campaign's welcome email</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button disabled={create.isPending || (!f.email && !f.fullName)} onClick={() => create.mutate({
              campaignId: f.campaignId ? Number(f.campaignId) : null, fullName: f.fullName || undefined, email: f.email || undefined,
              phone: f.phone || undefined, organization: f.organization || undefined, sendWelcome: f.sendWelcome,
            })}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Tracking links ----------

function LinksTab() {
  const utils = trpc.useUtils();
  const links = trpc.adMarketing.links.list.useQuery();
  const campaigns = useCampaigns();
  const [f, setF] = useState({ baseUrl: "", source: "instagram", medium: "paid_social", campaign: "", content: "", campaignId: "", label: "" });
  const preview = useMemo(() => {
    if (!f.baseUrl || !f.campaign) return { url: null as string | null, error: null as string | null };
    try { return { url: buildTrackingUrl(f.baseUrl, f), error: null }; } catch (e) { return { url: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [f]);
  const create = trpc.adMarketing.links.create.useMutation({
    onSuccess: (r) => { toast.success("Link saved"); navigator.clipboard?.writeText(r.fullUrl).catch(() => {}); utils.adMarketing.links.list.invalidate(); setF((s) => ({ ...s, content: "", label: "" })); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.adMarketing.links.delete.useMutation({ onSuccess: () => utils.adMarketing.links.list.invalidate(), onError: (e) => toast.error(e.message) });
  const copy = (url: string) => navigator.clipboard?.writeText(url).then(() => toast.success("Copied")).catch(() => toast.error("Copy failed"));
  const pickCampaign = (id: string) => {
    const c = (campaigns.data ?? []).find((x) => String(x.id) === id);
    setF((s) => ({ ...s, campaignId: id, campaign: c?.utmCampaign || c?.name || s.campaign }));
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Build a tagged link</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3"><Label>Page address</Label><Input value={f.baseUrl} onChange={(e) => setF((s) => ({ ...s, baseUrl: e.target.value }))} placeholder="https://superhumn.co/signup" /></div>
          <div>
            <Label>Campaign</Label>
            <Select value={f.campaignId} onValueChange={pickCampaign}>
              <SelectTrigger><SelectValue placeholder="Pick or type below" /></SelectTrigger>
              <SelectContent>{(campaigns.data ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Campaign name (utm_campaign)</Label><Input value={f.campaign} onChange={(e) => setF((s) => ({ ...s, campaign: e.target.value }))} placeholder="fall_launch" /></div>
          <div>
            <Label>Source (utm_source)</Label>
            <Select value={f.source} onValueChange={(v) => setF((s) => ({ ...s, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["instagram", "facebook", "linkedin", "reddit", "google", "tiktok", "newsletter", "other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Medium (utm_medium)</Label><Input value={f.medium} onChange={(e) => setF((s) => ({ ...s, medium: e.target.value }))} /></div>
          <div><Label>Content / variant (optional)</Label><Input value={f.content} onChange={(e) => setF((s) => ({ ...s, content: e.target.value }))} placeholder="video_a" /></div>
          <div><Label>Label (optional)</Label><Input value={f.label} onChange={(e) => setF((s) => ({ ...s, label: e.target.value }))} placeholder="Story link, week 1" /></div>
          <div className="md:col-span-3 rounded-md bg-muted/50 border px-3 py-2 text-xs break-all min-h-9 flex items-center justify-between gap-2">
            <span className={preview.error ? "text-destructive" : ""}>{preview.url ?? preview.error ?? "The tagged link appears here as you type."}</span>
            {preview.url && <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={() => copy(preview.url!)}><Copy className="h-3 w-3" /></Button>}
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button size="sm" disabled={!preview.url || create.isPending} onClick={() => create.mutate({
              baseUrl: f.baseUrl, source: f.source, medium: f.medium || undefined, campaign: f.campaign, content: f.content || undefined,
              campaignId: f.campaignId ? Number(f.campaignId) : null, label: f.label || undefined,
            })}>Save and copy</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Saved links</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(links.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{l.label || dateStr(l.createdAt)}</TableCell>
                  <TableCell className="text-xs">{l.utmSource} / {l.utmMedium}</TableCell>
                  <TableCell className="text-xs">{l.utmCampaign}{l.utmContent ? ` · ${l.utmContent}` : ""}</TableCell>
                  <TableCell className="text-xs max-w-md truncate" title={l.fullUrl}>{l.fullUrl}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(l.fullUrl)}><Copy className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => del.mutate({ id: l.id })}><Trash2 className="h-3 w-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {links.data && links.data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No links saved yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Credits ----------

type CreditForm = { platformId: string; offer: string; amountUsd: string; amountUsedUsd: string; conditions: string; claimedAt: string; expiresAt: string; status: (typeof AD_CREDIT_STATUSES)[number]; notes: string };

function CreditDialog({ initial, platforms, onClose }: { initial?: Credit; platforms: Platform[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState<CreditForm>(initial
    ? { platformId: initial.platformId ? String(initial.platformId) : "", offer: initial.offer, amountUsd: initial.amountUsd, amountUsedUsd: initial.amountUsedUsd, conditions: initial.conditions ?? "", claimedAt: toInputDate(initial.claimedAt), expiresAt: toInputDate(initial.expiresAt), status: initial.status, notes: initial.notes ?? "" }
    : { platformId: "", offer: "", amountUsd: "", amountUsedUsd: "0", conditions: "", claimedAt: "", expiresAt: "", status: "available", notes: "" });
  const set = <K extends keyof CreditForm>(k: K, v: CreditForm[K]) => setF((s) => ({ ...s, [k]: v }));
  const done = () => { utils.adMarketing.credits.list.invalidate(); onClose(); };
  const create = trpc.adMarketing.credits.create.useMutation({ onSuccess: () => { toast.success("Credit added"); done(); }, onError: (e) => toast.error(e.message) });
  const update = trpc.adMarketing.credits.update.useMutation({ onSuccess: () => { toast.success("Credit updated"); done(); }, onError: (e) => toast.error(e.message) });
  const submit = () => {
    if (!f.offer.trim()) return toast.error("Enter the offer");
    if (!f.amountUsd.trim()) return toast.error("Enter the amount");
    const payload = {
      platformId: f.platformId ? Number(f.platformId) : null, offer: f.offer.trim(), amountUsd: f.amountUsd.trim(), amountUsedUsd: f.amountUsedUsd.trim() || "0",
      conditions: optStr(f.conditions), claimedAt: optDate(f.claimedAt), expiresAt: optDate(f.expiresAt), status: f.status, notes: optStr(f.notes),
    };
    if (initial) update.mutate({ id: initial.id, ...payload }); else create.mutate(payload);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{initial ? "Edit credit" : "Log an ad credit"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Offer</Label><Input value={f.offer} onChange={(e) => set("offer", e.target.value)} placeholder="Meta $500 startup credit" /></div>
          <div>
            <Label>Platform</Label>
            <Select value={f.platformId} onValueChange={(v) => set("platformId", v)}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{platforms.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.label || platformLabel(p.name)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v as CreditForm["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AD_CREDIT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Amount (USD)</Label><Input type="number" min="0" step="0.01" value={f.amountUsd} onChange={(e) => set("amountUsd", e.target.value)} /></div>
          <div><Label>Used so far (USD)</Label><Input type="number" min="0" step="0.01" value={f.amountUsedUsd} onChange={(e) => set("amountUsedUsd", e.target.value)} /></div>
          <div><Label>Claimed on</Label><Input type="date" value={f.claimedAt} onChange={(e) => set("claimedAt", e.target.value)} /></div>
          <div><Label>Expires on</Label><Input type="date" value={f.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} /></div>
          <div className="col-span-2"><Label>Terms</Label><Textarea rows={2} value={f.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="Spend $500 first; new accounts only" /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>{initial ? "Save" : "Add credit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditsTab() {
  const utils = trpc.useUtils();
  const credits = trpc.adMarketing.credits.list.useQuery();
  const platforms = usePlatforms();
  const platformName = useMemo(() => new Map((platforms.data ?? []).map((p) => [p.id, p.label || platformLabel(p.name)])), [platforms.data]);
  const [editing, setEditing] = useState<Credit | "new" | null>(null);
  const del = trpc.adMarketing.credits.delete.useMutation({ onSuccess: () => utils.adMarketing.credits.list.invalidate(), onError: (e) => toast.error(e.message) });
  const now = new Date();
  const remainingTotal = (credits.data ?? []).filter((c) => c.status !== "expired" && c.status !== "used").reduce((s, c) => s + creditRemainingUsd(c.amountUsd, c.amountUsedUsd), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Each ad credit, its terms and expiry. You get an alert 14 days before one lapses. Remaining across open credits: <span className="font-medium text-foreground">{money(remainingTotal)}</span></div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-3 w-3 mr-1" /> Log credit</Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Offer</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(credits.data ?? []).map((c) => {
                const remaining = creditRemainingUsd(c.amountUsd, c.amountUsedUsd);
                const exp = c.expiresAt ? new Date(c.expiresAt) : null;
                const days = exp ? Math.floor((exp.getTime() - now.getTime()) / 86400000) : null;
                const soon = days != null && days <= 14 && remaining > 0 && c.status !== "used" && c.status !== "expired";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.offer}</TableCell>
                    <TableCell className="text-xs">{c.platformId ? platformName.get(c.platformId) ?? "—" : "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{c.status}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{money(c.amountUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(remaining)}</TableCell>
                    <TableCell className={`text-xs whitespace-nowrap ${soon ? "text-amber-600 font-medium" : ""}`}>
                      {exp ? dateStr(exp) : "—"}{days != null && soon ? ` (${days <= 0 ? "today" : `${days}d`})` : ""}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={c.conditions ?? ""}>{c.conditions || "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(c)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete "${c.offer}"?`)) del.mutate({ id: c.id }); }}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {credits.data && credits.data.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">No credits logged.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing && <CreditDialog initial={editing === "new" ? undefined : editing} platforms={platforms.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------- Platforms ----------

function PlatformDialog({ initial, onClose }: { initial?: Platform; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ name: (initial?.name ?? "meta") as AdPlatformName, label: initial?.label ?? "", accountId: initial?.accountId ?? "", pageId: initial?.pageId ?? "", accessToken: "" });
  const upsert = trpc.adMarketing.platforms.upsert.useMutation({
    onSuccess: () => { toast.success(initial ? "Platform updated" : "Platform added"); utils.adMarketing.platforms.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Edit platform" : "Add platform"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Platform</Label>
            <Select value={f.name} onValueChange={(v) => setF((s) => ({ ...s, name: v as AdPlatformName }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AD_PLATFORM_NAMES.map((n) => <SelectItem key={n} value={n}>{AD_PLATFORM_LABELS[n]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Label (optional)</Label><Input value={f.label} onChange={(e) => setF((s) => ({ ...s, label: e.target.value }))} placeholder="Superhumn main account" /></div>
          <div>
            <Label>Ad account id</Label>
            <Input value={f.accountId} onChange={(e) => setF((s) => ({ ...s, accountId: e.target.value }))} placeholder={f.name === "meta" ? "act_123456789" : f.name === "linkedin" ? "123456789" : "a2_abc123"} />
          </div>
          {f.name === "meta" && <div><Label>Facebook page id (for lead forms)</Label><Input value={f.pageId} onChange={(e) => setF((s) => ({ ...s, pageId: e.target.value }))} /></div>}
          <div>
            <Label>Access token {initial?.hasToken ? "(leave empty to keep the current one)" : ""}</Label>
            <Input type="password" value={f.accessToken} onChange={(e) => setF((s) => ({ ...s, accessToken: e.target.value }))} placeholder="Pasted from the platform's developer console" />
            <div className="text-[11px] text-muted-foreground mt-1">Stored encrypted. Needed for the morning spend sync and lead intake.</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={upsert.isPending} onClick={() => upsert.mutate({
            id: initial?.id, name: f.name, label: f.label || null, accountId: f.accountId || null, pageId: f.pageId || null,
            accessToken: f.accessToken ? f.accessToken : undefined,
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlatformsTab({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const platforms = usePlatforms();
  const logs = trpc.adMarketing.platforms.syncLogs.useQuery({ limit: 50 });
  const [editing, setEditing] = useState<Platform | "new" | null>(null);
  const refresh = () => { utils.adMarketing.platforms.list.invalidate(); utils.adMarketing.platforms.syncLogs.invalidate(); utils.adMarketing.spend.summary.invalidate(); utils.adMarketing.campaigns.list.invalidate(); };
  const sync = trpc.adMarketing.platforms.syncNow.useMutation({
    onSuccess: (r) => { r.error ? toast.error(r.error) : toast.success(`${r.rows} days synced, ${r.campaignsCreated} new campaigns`); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const disconnect = trpc.adMarketing.platforms.disconnect.useMutation({ onSuccess: () => { toast.success("Disconnected"); refresh(); }, onError: (e) => toast.error(e.message) });
  const del = trpc.adMarketing.platforms.delete.useMutation({ onSuccess: () => { toast.success("Platform removed"); refresh(); }, onError: (e) => toast.error(e.message) });
  const runAlerts = trpc.adMarketing.automations.runAlertChecks.useMutation({
    onSuccess: (r) => toast.success(`Checked: ${r.cpsAlerts} cost alerts, ${r.budgetAlerts} budget alerts, ${r.creditAlerts} credit alerts`),
    onError: (e) => toast.error(e.message),
  });
  const platformName = useMemo(() => new Map((platforms.data ?? []).map((p) => [p.id, p.label || platformLabel(p.name)])), [platforms.data]);
  const statusBadge = (p: Platform) => p.connectionStatus === "connected"
    ? <Badge className="text-[10px]">Connected</Badge>
    : p.connectionStatus === "error" ? <Badge variant="destructive" className="text-[10px]">Error</Badge> : <Badge variant="outline" className="text-[10px]">Not connected</Badge>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Where spend and leads come from. Each morning the ERP pulls yesterday's numbers from every connected platform.</div>
        <div className="flex gap-2">
          {isAdmin && <Button size="sm" variant="outline" onClick={() => runAlerts.mutate()} disabled={runAlerts.isPending}>Run alert checks</Button>}
          {isAdmin && <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-3 w-3 mr-1" /> Add platform</Button>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(platforms.data ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="truncate">{p.label || platformLabel(p.name)}</span>
                {statusBadge(p)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <div className="text-muted-foreground">{platformLabel(p.name)} · account {p.accountId || "—"}</div>
              <div className="text-muted-foreground">Last sync: {p.lastSyncAt ? format(new Date(p.lastSyncAt), "MMM d, h:mm a") : "never"}</div>
              {p.lastSyncError && <div className="text-destructive flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{p.lastSyncError}</div>}
              {isAdmin && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={!p.hasToken || sync.isPending} onClick={() => sync.mutate({ id: p.id })}><RefreshCw className={`h-3 w-3 mr-1 ${sync.isPending ? "animate-spin" : ""}`} /> Sync last 7 days</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(p)}><Pencil className="h-3 w-3" /></Button>
                  {p.hasToken && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => disconnect.mutate({ id: p.id })}>Disconnect</Button>}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("Remove this platform?")) del.mutate({ id: p.id }); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {platforms.data && platforms.data.length === 0 && (
          <Card className="md:col-span-3"><CardContent className="py-6 text-center text-xs text-muted-foreground">No platforms yet. Add Instagram (Meta), LinkedIn and Reddit to start.</CardContent></Card>
        )}
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Automation log</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(l.ranAt), "MMM d, h:mm a")}</TableCell>
                  <TableCell className="text-xs">{l.kind.replace("_", " ")}</TableCell>
                  <TableCell className="text-xs">{l.platformId ? platformName.get(l.platformId) ?? "—" : "—"}</TableCell>
                  <TableCell className="text-xs">{l.period}</TableCell>
                  <TableCell><Badge variant={l.status === "failed" ? "destructive" : "outline"} className="text-[10px]">{l.status}</Badge></TableCell>
                  <TableCell className="text-xs max-w-md truncate" title={l.message ?? ""}>{l.message || (l.rowsAffected ? `${l.rowsAffected} rows` : "—")}</TableCell>
                </TableRow>
              ))}
              {logs.data && logs.data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Nothing has run yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing && <PlatformDialog initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------- Page ----------

export function PaidAdsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("cps");
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-3">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="cps"><BarChart3 className="h-3 w-3 mr-1" /> Cost per signup</TabsTrigger>
        <TabsTrigger value="campaigns"><Megaphone className="h-3 w-3 mr-1" /> Campaigns</TabsTrigger>
        <TabsTrigger value="leads"><UsersIcon className="h-3 w-3 mr-1" /> Leads</TabsTrigger>
        <TabsTrigger value="links"><Link2 className="h-3 w-3 mr-1" /> Links</TabsTrigger>
        <TabsTrigger value="credits"><Gift className="h-3 w-3 mr-1" /> Credits</TabsTrigger>
        <TabsTrigger value="platforms"><Plug className="h-3 w-3 mr-1" /> Platforms</TabsTrigger>
      </TabsList>
      <TabsContent value="cps"><CostPerSignupTab /></TabsContent>
      <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
      <TabsContent value="leads"><LeadsTab /></TabsContent>
      <TabsContent value="links"><LinksTab /></TabsContent>
      <TabsContent value="credits"><CreditsTab /></TabsContent>
      <TabsContent value="platforms"><PlatformsTab isAdmin={isAdmin} /></TabsContent>
    </Tabs>
  );
}

export default function PaidAds() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold font-display">Paid ads</h1>
        <p className="text-xs text-muted-foreground">Leads, spend and cost per signup by platform. Ads are still built and launched on each platform.</p>
      </div>
      <PaidAdsPanel />
    </div>
  );
}
