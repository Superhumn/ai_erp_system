import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Megaphone, Calendar as CalendarIcon, PenSquare, Inbox, Target,
  Loader2, Plus, Send, Sparkles, Link as LinkIcon, CheckCircle2,
  TrendingUp, Eye, MousePointerClick, MessageCircle, AlertTriangle,
  Users as UsersIcon, DollarSign, Mail, ExternalLink, Trash2, Star,
} from "lucide-react";
import { toast } from "sonner";
import { format, isSameDay, addDays, startOfDay } from "date-fns";
import { Link } from "wouter";
import BrandAmbassadors from "./BrandAmbassadors";

// The merged AppRouter type is large enough that the tRPC React client
// silently drops some top-level namespaces from its inferred type (existing
// code does the same for trpc.ai). Cast once here so route calls stay one-liners
// while still exercising every server route at runtime.
const m: any = trpc;

const PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "X / Twitter" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "threads", label: "Threads" },
] as const;

type Platform = typeof PLATFORMS[number]["value"];

function StatCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: any; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            <div className="text-lg font-semibold leading-tight">{value}</div>
            {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function platformsFrom(post: any): Platform[] {
  try { return JSON.parse(post.platforms || "[]"); } catch { return []; }
}

function ProviderBanner() {
  const { data } = m.marketing.providerStatus.useQuery();
  if (!data || data.configured) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
      <div>
        <div className="font-medium">Social provider in simulation mode</div>
        <div className="text-muted-foreground">
          Set <code>AYRSHARE_API_KEY</code> to publish real posts. Scheduling and
          analytics work against saved records until then.
        </div>
      </div>
    </div>
  );
}

// ---------- Overview ----------

function OverviewTab() {
  const { data: stats } = m.marketing.overview.useQuery();
  const { data: upcoming } = m.marketing.posts.list.useQuery({ status: "scheduled", limit: 5 });
  const { data: recentEngagement } = m.marketing.engagement.list.useQuery({ limit: 8 });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Posts scheduled"
          value={stats?.posts.scheduled ?? 0}
          icon={CalendarIcon}
          hint={`${stats?.posts.posted ?? 0} published total`}
        />
        <StatCard
          label="Active campaigns"
          value={stats?.campaigns.active ?? 0}
          icon={Target}
        />
        <StatCard
          label="Impressions"
          value={(stats?.totals.impressions ?? 0).toLocaleString()}
          icon={Eye}
          hint={`${(stats?.totals.clicks ?? 0).toLocaleString()} clicks`}
        />
        <StatCard
          label="Engagements"
          value={stats?.engagement.total ?? 0}
          icon={MessageCircle}
          hint={`${stats?.engagement.unreplied ?? 0} unreplied`}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Upcoming posts</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming && upcoming.length > 0 ? (
              <div className="space-y-2">
                {upcoming.map((p: any) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {p.scheduledAt ? format(new Date(p.scheduledAt), "MMM d, h:mm a") : "No schedule"}
                      </div>
                      <div className="text-sm line-clamp-2">{p.title || p.body}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {platformsFrom(p).map((pl) => (
                          <Badge key={pl} variant="secondary" className="text-[10px]">{pl}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-6 text-center">No scheduled posts.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent engagement</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEngagement && recentEngagement.length > 0 ? (
              <div className="space-y-2">
                {recentEngagement.map((e: any) => (
                  <div key={e.id} className="flex items-start gap-2 rounded-md border p-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">{e.platform}</Badge>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{e.authorName ?? e.authorHandle ?? "Unknown"}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{e.body ?? `(${e.type})`}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No engagement yet. Sync a published post from the Engagement tab.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- Composer ----------

function ComposerTab({ onSaved }: { onSaved?: () => void }) {
  const { data: campaigns } = m.marketing.campaigns.list.useQuery();
  const utils = m.useUtils();

  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(["linkedin"]);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");

  const create = m.marketing.posts.create.useMutation({
    onSuccess: () => {
      toast.success("Post saved");
      setBody(""); setTitle(""); setScheduledAt("");
      utils.marketing.posts.list.invalidate();
      utils.marketing.overview.invalidate();
      onSaved?.();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const publish = m.marketing.posts.publish.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.simulated ? "Published (simulated)" : "Published");
      utils.marketing.posts.list.invalidate();
      utils.marketing.overview.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleSave = (publishNow: boolean) => {
    if (!body.trim()) { toast.error("Post body is required"); return; }
    if (platforms.length === 0) { toast.error("Pick at least one platform"); return; }
    const scheduled = scheduledAt ? new Date(scheduledAt) : undefined;
    create.mutate(
      {
        title: title || undefined,
        body,
        platforms,
        scheduledAt: scheduled,
        campaignId: campaignId ? Number(campaignId) : undefined,
      },
      {
        onSuccess: async ({ id }: any) => {
          if (publishNow) publish.mutate({ id });
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">New post</CardTitle>
          <Link href="/marketing/content">
            <Button size="sm" variant="ghost" className="h-7 text-xs">
              <Sparkles className="h-3 w-3 mr-1" /> Generate with AI
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Title (internal)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Campaign</Label>
            <Select value={campaignId || "none"} onValueChange={(v) => setCampaignId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {campaigns?.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Body</Label>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's the post?" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Platforms</Label>
          <div className="flex flex-wrap gap-1">
            {PLATFORMS.map((p) => {
              const selected = platforms.includes(p.value);
              return (
                <Button
                  key={p.value}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => togglePlatform(p.value)}
                >
                  {p.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Schedule (optional)</Label>
            <Input
              type="datetime-local"
              className="h-8"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => handleSave(false)} disabled={create.isPending} variant="outline">
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Save draft
            </Button>
            <Button onClick={() => handleSave(true)} disabled={create.isPending || publish.isPending}>
              {publish.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {scheduledAt ? "Schedule" : "Publish"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Calendar ----------

function CalendarTab() {
  const { data: posts } = m.marketing.posts.list.useQuery({});
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    (posts ?? []).forEach((p: any) => {
      if (!p.scheduledAt) return;
      const key = format(new Date(p.scheduledAt), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    return map;
  }, [posts]);

  return (
    <div className="space-y-3">
      <ComposerTab />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Next 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const dayPosts = postsByDay.get(key) ?? [];
              const isToday = isSameDay(d, today);
              return (
                <div key={key} className={`rounded-md border p-2 min-h-[80px] ${isToday ? "bg-muted/40" : ""}`}>
                  <div className="text-[11px] text-muted-foreground">{format(d, "EEE")}</div>
                  <div className="text-sm font-semibold">{format(d, "d")}</div>
                  <div className="mt-1 space-y-1">
                    {dayPosts.map((p: any) => (
                      <div key={p.id} className="text-[11px] truncate rounded bg-primary/10 px-1 py-0.5">
                        {format(new Date(p.scheduledAt), "HH:mm")} · {platformsFrom(p)[0] ?? "?"}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Engagement Inbox ----------

function EngagementTab() {
  const [unlinkedOnly, setUnlinkedOnly] = useState(true);
  const { data: engagements, refetch } = m.marketing.engagement.list.useQuery({ unlinkedOnly });
  const linkMutation = m.marketing.engagement.linkContact.useMutation({
    onSuccess: () => { toast.success("Linked to contact"); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });
  const replyMutation = m.marketing.engagement.markReplied.useMutation({
    onSuccess: () => { refetch(); },
  });

  const [suggestFor, setSuggestFor] = useState<{ engagementId: number; handle: string } | null>(null);
  const { data: suggestions } = m.marketing.engagement.suggestContact.useQuery(
    { handle: suggestFor?.handle ?? "" },
    { enabled: !!suggestFor },
  );

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Engagement inbox</CardTitle>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={unlinkedOnly} onChange={(e) => setUnlinkedOnly(e.target.checked)} />
            Unlinked only
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {engagements && engagements.length > 0 ? (
          <div className="space-y-2">
            {engagements.map((e: any) => (
              <div key={e.id} className="rounded-md border p-2 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{e.platform}</Badge>
                  <Badge variant="secondary">{e.type}</Badge>
                  <span className="text-muted-foreground">
                    {e.occurredAt ? format(new Date(e.occurredAt), "MMM d, h:mm a") : ""}
                  </span>
                  {e.repliedAt && <Badge className="bg-emerald-600">Replied</Badge>}
                </div>
                <div className="text-sm">{e.body ?? `(${e.type})`}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {e.authorName ?? e.authorHandle ?? "Unknown"}
                  </span>
                  {e.contactId ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Linked (#{e.contactId})
                    </Badge>
                  ) : (
                    <Dialog
                      open={suggestFor?.engagementId === e.id}
                      onOpenChange={(open) => {
                        if (open) setSuggestFor({ engagementId: e.id, handle: e.authorHandle ?? "" });
                        else setSuggestFor(null);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-6 text-xs">
                          <LinkIcon className="h-3 w-3 mr-1" /> Link to CRM
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Link to CRM contact</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                          {suggestions && suggestions.length > 0 ? (
                            suggestions.map((c: any) => (
                              <div key={c.id} className="flex items-center justify-between rounded-md border p-2">
                                <div>
                                  <div className="text-sm font-medium">{c.fullName}</div>
                                  <div className="text-xs text-muted-foreground">{c.email ?? c.organization ?? ""}</div>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    linkMutation.mutate({ engagementId: e.id, contactId: c.id });
                                    setSuggestFor(null);
                                  }}
                                >
                                  Link
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-muted-foreground py-4 text-center">
                              No CRM matches for <code>{e.authorHandle}</code>. Create the contact from CRM first.
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                  {!e.repliedAt && (
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => replyMutation.mutate({ engagementId: e.id })}>
                      Mark replied
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-6 text-center">
            No engagement yet. Publish a post, then click "Sync engagement" on a post to pull comments & mentions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Campaigns + ROI ----------

function CampaignsTab() {
  const utils = m.useUtils();
  const { data: campaigns } = m.marketing.campaigns.list.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: roi } = m.marketing.campaigns.roi.useQuery(
    { id: selectedId ?? 0 },
    { enabled: !!selectedId },
  );

  const { data: influencerRollup } = m.marketing.participations.campaignRollup.useQuery(
    { campaignId: selectedId ?? 0 },
    { enabled: !!selectedId },
  );

  const { data: campaignParticipations } = m.marketing.participations.list.useQuery(
    { campaignId: selectedId ?? 0 },
    { enabled: !!selectedId },
  );

  const [newName, setNewName] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const create = m.marketing.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campaign created");
      setNewName(""); setNewBudget("");
      utils.marketing.campaigns.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <Card className="md:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Campaigns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            <Input placeholder="Campaign name" className="h-8" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Budget (optional)" className="h-8" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} />
            <Button
              size="sm"
              className="w-full"
              disabled={!newName.trim() || create.isPending}
              onClick={() => create.mutate({ name: newName.trim(), budgetAmount: newBudget || undefined, status: "active", startDate: new Date() })}
            >
              <Plus className="h-3 w-3 mr-1" /> New campaign
            </Button>
          </div>
          <div className="border-t pt-2 space-y-1">
            {campaigns?.map((c: any) => (
              <button
                key={c.id}
                className={`w-full text-left rounded-md border p-2 text-sm ${selectedId === c.id ? "bg-muted" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Badge variant="outline">{c.status}</Badge>
                  {c.budgetAmount && <span>Budget ${Number(c.budgetAmount).toLocaleString()}</span>}
                </div>
              </button>
            ))}
            {(!campaigns || campaigns.length === 0) && (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No campaigns. Create one to start attributing posts and orders.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ROI</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedId && <div className="text-xs text-muted-foreground py-6 text-center">Select a campaign.</div>}
          {selectedId && roi && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Impressions" value={roi.metrics.impressions.toLocaleString()} icon={Eye} />
                <StatCard label="Clicks" value={roi.metrics.clicks.toLocaleString()} icon={MousePointerClick} />
                <StatCard label="Engagements" value={roi.engagementCount} icon={MessageCircle} />
                <StatCard label="Attributed contacts" value={roi.attributedContacts} icon={TrendingUp} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Spend"
                  value={`$${roi.spend.toLocaleString()}`}
                  icon={Target}
                />
                <StatCard
                  label="Attributed revenue"
                  value={`$${roi.attributedRevenue.toLocaleString()}`}
                  icon={TrendingUp}
                  hint={`${roi.attributedOrderCount} orders`}
                />
                <StatCard
                  label="ROI"
                  value={roi.roi == null ? "—" : `${(roi.roi * 100).toFixed(0)}%`}
                  icon={TrendingUp}
                  hint={roi.roi == null ? "Set spend to compute" : ""}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">
                Attribution: CRM contacts that engaged with any of this campaign's posts, joined to orders placed on or after the campaign start date.
              </div>

              {influencerRollup && (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium flex items-center gap-1">
                      <UsersIcon className="h-3 w-3" /> Influencers on this campaign
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {influencerRollup.participants} creator(s) · ${influencerRollup.totalCommitted.toLocaleString()} committed · ${influencerRollup.totalPaid.toLocaleString()} paid
                    </div>
                  </div>
                  {campaignParticipations && campaignParticipations.length > 0 ? (
                    <div className="space-y-1">
                      {campaignParticipations.map((row: any) => (
                        <div key={row.participation.id} className="text-xs rounded border p-2 flex items-center justify-between">
                          <div>
                            <span className="font-medium">{row.influencer?.fullName ?? "—"}</span>
                            {row.influencer?.primaryHandle && (
                              <span className="text-muted-foreground"> · @{row.influencer.primaryHandle}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{row.participation.status}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{row.participation.paymentStatus}</Badge>
                            {row.participation.agreedFee && (
                              <span className="text-muted-foreground">${Number(row.participation.agreedFee).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-2 text-center">
                      No influencers on this campaign yet. Add some from the Influencers tab.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Posts list ----------

function PostsTab() {
  const { data: posts } = m.marketing.posts.list.useQuery({});
  const utils = m.useUtils();
  const publish = m.marketing.posts.publish.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.simulated ? "Published (simulated)" : "Published");
      utils.marketing.posts.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const syncEngagement = m.marketing.engagement.sync.useMutation({
    onSuccess: (r: any) => toast.success(`Imported ${r.imported} engagements${r.simulated ? " (simulated)" : ""}`),
    onError: (err: any) => toast.error(err.message),
  });
  const syncMetrics = m.marketing.metrics.syncForPost.useMutation({
    onSuccess: (r: any) => toast.success(`Recorded ${r.recorded} metric snapshot(s)`),
    onError: (err: any) => toast.error(err.message),
  });
  const del = m.marketing.posts.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); utils.marketing.posts.list.invalidate(); },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">All posts</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Body</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts?.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-xs truncate">{p.title || p.body}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {platformsFrom(p).map((pl) => (
                      <Badge key={pl} variant="secondary" className="text-[10px]">{pl}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                <TableCell className="text-xs">
                  {p.scheduledAt ? format(new Date(p.scheduledAt), "MMM d, h:mm a") : "—"}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {p.status !== "posted" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => publish.mutate({ id: p.id })}>
                      Publish
                    </Button>
                  )}
                  {p.status === "posted" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => syncEngagement.mutate({ postId: p.id })}>
                        Sync engagement
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => syncMetrics.mutate({ postId: p.id })}>
                        Sync metrics
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => del.mutate({ id: p.id })}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!posts || posts.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                  No posts yet. Create one from the Composer tab.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Influencer CRM ----------

const INFLUENCER_STATUSES = [
  { value: "prospect", label: "Prospect" },
  { value: "contacted", label: "Contacted" },
  { value: "negotiating", label: "Negotiating" },
  { value: "agreed", label: "Agreed" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "blacklisted", label: "Blacklisted" },
] as const;


function tierFromFollowers(n: number): "nano" | "micro" | "mid" | "macro" | "mega" {
  if (n < 10_000) return "nano";
  if (n < 100_000) return "micro";
  if (n < 500_000) return "mid";
  if (n < 1_000_000) return "macro";
  return "mega";
}

function NewInfluencerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    primaryHandle: "",
    primaryPlatform: "instagram" as Platform,
    email: "",
    followerCount: "",
    niche: "",
    notes: "",
  });
  const create = m.marketing.influencers.create.useMutation({
    onSuccess: () => {
      toast.success("Influencer added");
      setOpen(false);
      setForm({ fullName: "", primaryHandle: "", primaryPlatform: "instagram", email: "", followerCount: "", niche: "", notes: "" });
      onCreated();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const handleSubmit = () => {
    if (!form.fullName.trim()) { toast.error("Name is required"); return; }
    const followerCount = form.followerCount ? Number(form.followerCount) : 0;
    create.mutate({
      fullName: form.fullName.trim(),
      primaryHandle: form.primaryHandle || undefined,
      primaryPlatform: form.primaryPlatform,
      email: form.email || undefined,
      followerCount,
      tier: tierFromFollowers(followerCount),
      niche: form.niche || undefined,
      notes: form.notes || undefined,
      status: "prospect",
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-3 w-3 mr-1" /> Add influencer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New influencer</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Full name *</Label>
              <Input className="h-8" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Primary platform</Label>
              <Select value={form.primaryPlatform} onValueChange={(v) => setForm({ ...form, primaryPlatform: v as Platform })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Handle</Label>
              <Input className="h-8" placeholder="@handle" value={form.primaryHandle} onChange={(e) => setForm({ ...form, primaryHandle: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input className="h-8" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Follower count</Label>
              <Input className="h-8" type="number" value={form.followerCount} onChange={(e) => setForm({ ...form, followerCount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Niche</Label>
              <Input className="h-8" placeholder="food / fitness / tech" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfluencerDetailDialog({ id, open, onOpenChange }: { id: number | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const enabled = !!id;
  const { data: influencer } = m.marketing.influencers.get.useQuery({ id: id ?? 0 }, { enabled });
  const { data: perf } = m.marketing.influencers.performance.useQuery({ id: id ?? 0 }, { enabled });
  const { data: outreach, refetch: refetchOutreach } = m.marketing.influencers.outreach.list.useQuery({ influencerId: id ?? 0 }, { enabled });
  const { data: participations, refetch: refetchParticipations } = m.marketing.participations.list.useQuery({ influencerId: id ?? 0 }, { enabled });
  const { data: campaigns } = m.marketing.campaigns.list.useQuery(undefined, { enabled });

  const utils = m.useUtils();
  const updateStatus = m.marketing.influencers.update.useMutation({
    onSuccess: () => {
      utils.marketing.influencers.get.invalidate();
      utils.marketing.influencers.list.invalidate();
      utils.marketing.influencers.pipelineCounts.invalidate();
    },
  });
  const logOutreach = m.marketing.influencers.outreach.log.useMutation({
    onSuccess: () => { toast.success("Outreach logged"); refetchOutreach(); setOutreachBody(""); setOutreachSubject(""); },
    onError: (err: any) => toast.error(err.message),
  });
  const addParticipation = m.marketing.participations.create.useMutation({
    onSuccess: () => { toast.success("Added to campaign"); refetchParticipations(); setNewParticipationCampaign(""); setNewParticipationFee(""); },
    onError: (err: any) => toast.error(err.message),
  });

  const [outreachChannel, setOutreachChannel] = useState<"email" | "dm" | "phone" | "agent" | "platform_message">("email");
  const [outreachSubject, setOutreachSubject] = useState("");
  const [outreachBody, setOutreachBody] = useState("");
  const [newParticipationCampaign, setNewParticipationCampaign] = useState("");
  const [newParticipationFee, setNewParticipationFee] = useState("");

  if (!influencer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> {influencer.fullName}
            {influencer.primaryHandle && (
              <span className="text-xs text-muted-foreground font-normal">@{influencer.primaryHandle}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Followers" value={(influencer.followerCount ?? 0).toLocaleString()} icon={UsersIcon} hint={influencer.tier ?? ""} />
          <StatCard label="Campaigns" value={perf?.participationCount ?? 0} icon={Target} />
          <StatCard label="Total spend" value={`$${(perf?.totalSpend ?? 0).toLocaleString()}`} icon={DollarSign} hint={`$${(perf?.pendingSpend ?? 0).toLocaleString()} pending`} />
          <StatCard label="Impressions" value={(perf?.metrics.impressions ?? 0).toLocaleString()} icon={Eye} hint={perf?.cpm ? `$${perf.cpm.toFixed(2)} CPM` : ""} />
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs">Status</Label>
          <Select value={influencer.status} onValueChange={(v) => updateStatus.mutate({ id: influencer.id, status: v as any })}>
            <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INFLUENCER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {influencer.email && <a href={`mailto:${influencer.email}`} className="text-xs underline ml-auto"><Mail className="h-3 w-3 inline mr-1" />{influencer.email}</a>}
          {influencer.websiteUrl && <a href={influencer.websiteUrl} target="_blank" rel="noreferrer" className="text-xs underline"><ExternalLink className="h-3 w-3 inline mr-1" />website</a>}
        </div>

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Outreach log</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {outreach && outreach.length > 0 ? outreach.map((o: any) => (
                  <div key={o.id} className="text-xs rounded border p-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">{o.channel}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{o.direction}</Badge>
                      <span>{format(new Date(o.sentAt), "MMM d, h:mm a")}</span>
                      <Badge className="text-[10px] ml-auto">{o.response}</Badge>
                    </div>
                    {o.subject && <div className="font-medium mt-1">{o.subject}</div>}
                    {o.body && <div className="line-clamp-2 mt-1">{o.body}</div>}
                  </div>
                )) : <div className="text-xs text-muted-foreground py-2 text-center">No outreach yet.</div>}
              </div>
              <div className="border-t pt-2 space-y-1">
                <div className="flex gap-1">
                  <Select value={outreachChannel} onValueChange={(v) => setOutreachChannel(v as any)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="dm">DM</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="platform_message">Platform</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="h-7 text-xs" placeholder="Subject (optional)" value={outreachSubject} onChange={(e) => setOutreachSubject(e.target.value)} />
                </div>
                <Textarea rows={2} placeholder="Message body" className="text-xs" value={outreachBody} onChange={(e) => setOutreachBody(e.target.value)} />
                <Button
                  size="sm"
                  className="h-7 text-xs w-full"
                  disabled={!outreachBody.trim() || logOutreach.isPending}
                  onClick={() => logOutreach.mutate({ influencerId: influencer.id, channel: outreachChannel, subject: outreachSubject || undefined, body: outreachBody })}
                >
                  Log outreach
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Campaign deals</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {participations && participations.length > 0 ? participations.map((row: any) => (
                  <div key={row.participation.id} className="text-xs rounded border p-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.campaign?.name ?? `Campaign #${row.participation.campaignId}`}</span>
                      <Badge variant="outline" className="text-[10px]">{row.participation.status}</Badge>
                      <Badge className="text-[10px]" variant="secondary">{row.participation.paymentStatus}</Badge>
                    </div>
                    {row.participation.agreedFee && (
                      <div className="text-muted-foreground mt-1">${Number(row.participation.agreedFee).toLocaleString()} {row.participation.currency}</div>
                    )}
                  </div>
                )) : <div className="text-xs text-muted-foreground py-2 text-center">Not on any campaigns yet.</div>}
              </div>
              <div className="border-t pt-2 space-y-1">
                <Select value={newParticipationCampaign} onValueChange={setNewParticipationCampaign}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Add to campaign…" /></SelectTrigger>
                  <SelectContent>
                    {campaigns?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-1">
                  <Input className="h-7 text-xs" placeholder="Agreed fee" value={newParticipationFee} onChange={(e) => setNewParticipationFee(e.target.value)} />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!newParticipationCampaign || addParticipation.isPending}
                    onClick={() => addParticipation.mutate({
                      influencerId: influencer.id,
                      campaignId: Number(newParticipationCampaign),
                      agreedFee: newParticipationFee || undefined,
                      status: "invited",
                    })}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfluencersTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { data: list, refetch } = m.marketing.influencers.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search || undefined,
  });
  const { data: pipeline } = m.marketing.influencers.pipelineCounts.useQuery();
  const utils = m.useUtils();
  const del = m.marketing.influencers.delete.useMutation({
    onSuccess: () => { toast.success("Removed"); utils.marketing.influencers.list.invalidate(); utils.marketing.influencers.pipelineCounts.invalidate(); },
  });
  const [detailId, setDetailId] = useState<number | null>(null);

  const pipelineMap = useMemo(() => {
    const map = new Map<string, number>();
    (pipeline ?? []).forEach((row: any) => map.set(row.status, Number(row.count)));
    return map;
  }, [pipeline]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Pipeline</CardTitle>
          <NewInfluencerDialog onCreated={() => { refetch(); utils.marketing.influencers.pipelineCounts.invalidate(); }} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {INFLUENCER_STATUSES.map((s) => {
              const count = pipelineMap.get(s.value) ?? 0;
              const active = statusFilter === s.value;
              return (
                <button
                  key={s.value}
                  className={`rounded-md border p-2 text-left ${active ? "bg-muted" : ""}`}
                  onClick={() => setStatusFilter(active ? "all" : s.value)}
                >
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
                  <div className="text-lg font-semibold">{count}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Roster</CardTitle>
          <div className="flex items-center gap-2">
            <Input className="h-7 text-xs w-48" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INFLUENCER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Followers</TableHead>
                <TableHead>Niche</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list?.map((inf: any) => (
                <TableRow key={inf.id}>
                  <TableCell className="font-medium">{inf.fullName}</TableCell>
                  <TableCell>
                    {inf.primaryHandle ? (
                      <span className="text-xs">
                        <Badge variant="outline" className="text-[10px] mr-1">{inf.primaryPlatform}</Badge>
                        @{inf.primaryHandle}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{inf.tier ? <Badge variant="secondary" className="text-[10px]">{inf.tier}</Badge> : "—"}</TableCell>
                  <TableCell>{(inf.followerCount ?? 0).toLocaleString()}</TableCell>
                  <TableCell>{inf.niche ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{inf.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetailId(inf.id)}>Open</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => del.mutate({ id: inf.id })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!list || list.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                    No influencers yet. Add one to start tracking outreach and deals.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <InfluencerDetailDialog id={detailId} open={detailId !== null} onOpenChange={(v) => { if (!v) setDetailId(null); }} />
    </div>
  );
}

// ---------- Hub ----------

export default function MarketingHub() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Marketing
          </h1>
          <p className="text-muted-foreground text-sm">Social scheduling, engagement, campaigns, and creator deals</p>
        </div>
      </div>

      <ProviderBanner />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview"><Megaphone className="h-3 w-3 mr-1" /> Overview</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarIcon className="h-3 w-3 mr-1" /> Calendar</TabsTrigger>
          <TabsTrigger value="posts"><PenSquare className="h-3 w-3 mr-1" /> Posts</TabsTrigger>
          <TabsTrigger value="engagement"><Inbox className="h-3 w-3 mr-1" /> Engagement</TabsTrigger>
          <TabsTrigger value="campaigns"><Target className="h-3 w-3 mr-1" /> Campaigns</TabsTrigger>
          <TabsTrigger value="influencers"><UsersIcon className="h-3 w-3 mr-1" /> Influencers</TabsTrigger>
          <TabsTrigger value="ambassadors"><Star className="h-3 w-3 mr-1" /> Ambassadors</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        <TabsContent value="posts"><PostsTab /></TabsContent>
        <TabsContent value="engagement"><EngagementTab /></TabsContent>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
        <TabsContent value="influencers"><InfluencersTab /></TabsContent>
        <TabsContent value="ambassadors"><BrandAmbassadors /></TabsContent>
      </Tabs>
    </div>
  );
}
