import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  Loader2, Plus, Send, Sparkles, CheckCircle2, AlertTriangle,
  Users as UsersIcon, ExternalLink, Trash2, Star, Video, Link2, Unlink,
  Construction, Eye, MessageCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { format, isSameDay, addDays, startOfDay } from "date-fns";
import { Link } from "wouter";
import BrandAmbassadors from "./BrandAmbassadors";

// ---------------------------------------------------------------------------
// Everything on this page calls a procedure that exists on the live router:
//   marketing.{listVideos,getVideo,createVideo,updateVideo,deleteVideo,
//              listPosts,planPosts,publish,listCredentials,getConnectUrl,
//              disconnectCredential}
//   crm.campaigns.list        (Campaigns tab — email campaigns)
//   brandAmbassadors.list     (Influencers tab — creator roster)
// Features with no backend yet (engagement inbox, post metrics/ROI, influencer
// outreach & deals) render a clearly labelled "Not available yet" card instead
// of issuing calls.
// ---------------------------------------------------------------------------

type RouterOutputs = inferRouterOutputs<AppRouter>;
type MarketingVideo = RouterOutputs["marketing"]["listVideos"][number];
type SocialPost = RouterOutputs["marketing"]["listPosts"][number];
type SocialCredential = RouterOutputs["marketing"]["listCredentials"][number];
type EmailCampaign = RouterOutputs["crm"]["campaigns"]["list"][number];
type Ambassador = RouterOutputs["brandAmbassadors"]["list"][number];

// Publish targets — mirrors the enum in marketing.publish / marketing.planPosts.
const PLATFORMS = [
  { value: "tiktok", label: "TikTok", requires: "9:16 vertical" },
  { value: "youtube", label: "YouTube", requires: "16:9 horizontal preferred" },
  { value: "youtube_shorts", label: "YouTube Shorts", requires: "9:16 vertical" },
  { value: "instagram_reels", label: "Instagram Reels", requires: "9:16 vertical preferred" },
  { value: "instagram_feed", label: "Instagram Feed", requires: "1:1 square preferred" },
] as const;
type Platform = typeof PLATFORMS[number]["value"];

// OAuth accounts — mirrors the enum in marketing.getConnectUrl / disconnectCredential.
const ACCOUNTS = [
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
] as const;
type Account = typeof ACCOUNTS[number]["value"];

const platformLabel = (p: string) => PLATFORMS.find((x) => x.value === p)?.label ?? p;
const toDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDateTime = (v: Date | string | null | undefined, fallback = "—") => {
  const d = toDate(v);
  return d ? format(d, "MMM d, h:mm a") : fallback;
};

function StatCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: LucideIcon; hint?: string }) {
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

// Placeholder for a section whose backend does not exist yet. Renders no queries.
function NotAvailableCard({ title, description, className }: { title: string; description: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {title}
          <Badge variant="outline" className="text-[10px] font-normal">Not available yet</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
          <Construction className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{description}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Connected accounts ----------

function useConnectedAccounts() {
  const utils = trpc.useUtils();
  const creds = trpc.marketing.listCredentials.useQuery();
  const connectMut = trpc.marketing.getConnectUrl.useMutation({
    // Top-level redirect (rather than popup) so the session cookie carries.
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (e) => toast.error(e.message),
  });
  const disconnectMut = trpc.marketing.disconnectCredential.useMutation({
    onSuccess: () => { toast.success("Disconnected"); utils.marketing.listCredentials.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const isConnected = (c: SocialCredential | undefined) => !!c && c.isConnected && !!c.isActive;
  const byAccount = (p: Account) => (creds.data ?? []).find((c) => c.platform === p);
  const connectedCount = ACCOUNTS.filter((a) => isConnected(byAccount(a.value))).length;
  return { creds, connectMut, disconnectMut, isConnected, byAccount, connectedCount };
}

function ConnectedAccountsCard() {
  const { creds, connectMut, disconnectMut, isConnected, byAccount } = useConnectedAccounts();
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Connected accounts</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {creds.isLoading && <div className="text-xs text-muted-foreground py-2">Loading…</div>}
        {ACCOUNTS.map((a) => {
          const cred = byAccount(a.value);
          const connected = isConnected(cred);
          return (
            <div key={a.value} className="flex items-center justify-between border rounded-md px-2 py-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{a.label}</span>
                {connected ? (
                  <Badge className="bg-muted text-foreground text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-0.5" /> Connected{cred?.accountHandle ? ` · ${cred.accountHandle}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Not connected</Badge>
                )}
              </div>
              {connected ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={disconnectMut.isPending}
                  onClick={() => disconnectMut.mutate({ platform: a.value })}>
                  <Unlink className="h-3 w-3 mr-1" /> Disconnect
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs" disabled={connectMut.isPending}
                  onClick={() => connectMut.mutate({ platform: a.value })}>
                  <Link2 className="h-3 w-3 mr-1" /> Connect
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ProviderBanner() {
  const { creds, connectedCount } = useConnectedAccounts();
  if (creds.isLoading || connectedCount > 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs">
      <AlertTriangle className="h-4 w-4 mt-0.5 text-foreground shrink-0" />
      <div>
        <div className="font-medium">No social accounts connected</div>
        <div className="text-muted-foreground">
          Connect YouTube from the Overview tab to publish. Posts to unconnected platforms are recorded but will fail to upload.
        </div>
      </div>
    </div>
  );
}

// ---------- Overview ----------

function OverviewTab() {
  const { data: posts } = trpc.marketing.listPosts.useQuery();
  const { data: videos } = trpc.marketing.listVideos.useQuery();
  const { connectedCount } = useConnectedAccounts();

  const scheduled = useMemo(() => (posts ?? []).filter((p) => p.status === "scheduled"), [posts]);
  const published = useMemo(() => (posts ?? []).filter((p) => p.status === "published"), [posts]);
  const failed = useMemo(() => (posts ?? []).filter((p) => p.status === "failed" || p.status === "skipped"), [posts]);
  const upcoming = useMemo(
    () => [...scheduled]
      .sort((a, b) => (toDate(a.scheduledAt)?.getTime() ?? 0) - (toDate(b.scheduledAt)?.getTime() ?? 0))
      .slice(0, 5),
    [scheduled],
  );
  const videoTitle = useMemo(() => new Map((videos ?? []).map((v) => [v.id, v.title])), [videos]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Posts scheduled" value={scheduled.length} icon={CalendarIcon} hint={`${published.length} published total`} />
        <StatCard label="Videos" value={videos?.length ?? 0} icon={Video} hint={`${failed.length} failed / skipped posts`} />
        <StatCard label="Connected accounts" value={connectedCount} icon={Link2} hint={`of ${ACCOUNTS.length} platforms`} />
        <StatCard label="Impressions" value="—" icon={Eye} hint="Analytics not available yet" />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Upcoming posts</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length > 0 ? (
              <div className="space-y-2">
                {upcoming.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{fmtDateTime(p.scheduledAt, "No schedule")}</div>
                      <div className="text-sm line-clamp-2">{p.caption || videoTitle.get(p.videoId) || `Video #${p.videoId}`}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="secondary" className="text-[10px]">{platformLabel(p.platform)}</Badge>
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

        <ConnectedAccountsCard />
      </div>

      <NotAvailableCard
        title="Recent engagement"
        description="Comments, mentions and post metrics are not synced yet. Published posts can be opened on their platform from the Posts tab."
      />
    </div>
  );
}

// ---------- New video dialog ----------

function NewVideoDialog({ onCreated }: { onCreated?: (id: number) => void }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", horizontalUrl: "", verticalUrl: "", squareUrl: "", tags: "" });
  const createVideo = trpc.marketing.createVideo.useMutation({
    onSuccess: (row) => {
      toast.success("Video saved");
      setOpen(false);
      setForm({ title: "", description: "", horizontalUrl: "", verticalUrl: "", squareUrl: "", tags: "" });
      utils.marketing.listVideos.invalidate();
      onCreated?.(row.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.horizontalUrl && !form.verticalUrl && !form.squareUrl) {
      toast.error("Provide at least one video URL (horizontal, vertical, or square)");
      return;
    }
    createVideo.mutate({
      title: form.title.trim(),
      description: form.description || undefined,
      horizontalUrl: form.horizontalUrl || undefined,
      verticalUrl: form.verticalUrl || undefined,
      squareUrl: form.squareUrl || undefined,
      tags: form.tags || undefined,
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" /> New video</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Add video</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input className="h-8" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description / default caption</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Horizontal cut URL (16:9) — YouTube long-form</Label>
            <Input className="h-8" placeholder="https://…/horizontal.mp4" value={form.horizontalUrl} onChange={(e) => setForm({ ...form, horizontalUrl: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vertical cut URL (9:16) — TikTok, Shorts, Reels</Label>
            <Input className="h-8" placeholder="https://…/vertical.mp4" value={form.verticalUrl} onChange={(e) => setForm({ ...form, verticalUrl: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Square cut URL (1:1) — Instagram feed</Label>
            <Input className="h-8" placeholder="https://…/square.mp4" value={form.squareUrl} onChange={(e) => setForm({ ...form, squareUrl: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hashtags / tags</Label>
            <Input className="h-8" placeholder="#plantbased #protein" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          <p className="text-[11px] text-muted-foreground">Paste public URLs to your video files (S3, Drive, etc). Direct upload is on the roadmap.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createVideo.isPending}>
            {createVideo.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Composer ----------

function ComposerTab({ onPublished }: { onPublished?: () => void }) {
  const utils = trpc.useUtils();
  const { data: videos } = trpc.marketing.listVideos.useQuery();

  const [videoId, setVideoId] = useState<string>("");
  const [platforms, setPlatforms] = useState<Platform[]>(["youtube"]);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const selectedVideoId = videoId ? Number(videoId) : null;
  const plan = trpc.marketing.planPosts.useQuery(
    { videoId: selectedVideoId ?? 0, platforms },
    { enabled: selectedVideoId !== null && platforms.length > 0 },
  );

  const publish = trpc.marketing.publish.useMutation({
    onSuccess: (data) => {
      const ok = data.results.filter((r) => r.status === "published").length;
      const sched = data.results.filter((r) => r.status === "scheduled").length;
      const skipped = data.results.filter((r) => r.status === "skipped").length;
      const failed = data.results.filter((r) => r.status === "failed").length;
      toast.success(`Published ${ok} · scheduled ${sched} · skipped ${skipped} · failed ${failed}`);
      setCaption(""); setHashtags(""); setScheduledAt("");
      utils.marketing.listPosts.invalidate();
      onPublished?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handlePublish = () => {
    if (selectedVideoId === null) { toast.error("Pick a video"); return; }
    if (platforms.length === 0) { toast.error("Pick at least one platform"); return; }
    const scheduled = scheduledAt ? new Date(scheduledAt) : undefined;
    if (scheduled && Number.isNaN(scheduled.getTime())) { toast.error("Invalid schedule"); return; }
    publish.mutate({
      videoId: selectedVideoId,
      platforms,
      caption: caption || undefined,
      hashtags: hashtags || undefined,
      scheduledAt: scheduled,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">New post</CardTitle>
          <div className="flex items-center gap-1">
            <NewVideoDialog onCreated={(id) => setVideoId(String(id))} />
            <Link href="/marketing/content">
              <Button size="sm" variant="ghost" className="h-7 text-xs">
                <Sparkles className="h-3 w-3 mr-1" /> Generate with AI
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Video</Label>
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Pick a video to publish" /></SelectTrigger>
            <SelectContent>
              {(videos ?? []).map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {videos && videos.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No videos yet — add one with “New video”.</p>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Platforms</Label>
          <div className="flex flex-wrap gap-1">
            {PLATFORMS.map((p) => {
              const selected = platforms.includes(p.value);
              const fit = plan.data?.find((r) => r.platform === p.value);
              const willSkip = !!fit && !fit.pickedRatio;
              return (
                <Button
                  key={p.value}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  title={willSkip ? `Will skip: ${fit?.skipReason ?? "no compatible cut"}` : p.requires}
                  onClick={() => togglePlatform(p.value)}
                >
                  {p.label}
                  {selected && fit?.pickedRatio && <span className="ml-1 opacity-70">· {fit.pickedRatio}</span>}
                  {selected && willSkip && <AlertTriangle className="h-3 w-3 ml-1" />}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Caption (defaults to the video description)</Label>
            <Textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What's the post?" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hashtags</Label>
            <Input className="h-8" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#plantbased #protein" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Schedule (optional)</Label>
            <Input type="datetime-local" className="h-8" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={handlePublish} disabled={publish.isPending || selectedVideoId === null || platforms.length === 0}>
              {publish.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {scheduledAt ? "Schedule" : "Publish"} to {platforms.length}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Calendar ----------

function CalendarTab() {
  const { data: posts } = trpc.marketing.listPosts.useQuery();
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    (posts ?? []).forEach((p) => {
      const d = toDate(p.scheduledAt);
      if (!d) return;
      const key = format(d, "yyyy-MM-dd");
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
                    {dayPosts.map((p) => (
                      <div key={p.id} className="text-[11px] truncate rounded bg-primary/10 px-1 py-0.5">
                        {format(toDate(p.scheduledAt)!, "HH:mm")} · {platformLabel(p.platform)}
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
  return (
    <NotAvailableCard
      title="Engagement inbox"
      description="Comment and mention syncing, CRM contact linking and reply tracking have no backend yet. Nothing is fetched here."
    />
  );
}

// ---------- Campaigns ----------

function CampaignsTab() {
  const { data: campaigns, isLoading } = trpc.crm.campaigns.list.useQuery({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = (campaigns ?? []).find((c: EmailCampaign) => c.id === selectedId) ?? null;

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <Card className="md:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Email campaigns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Campaigns are created and sent from the CRM. Social campaign budgets and ROI are not tracked yet.
          </p>
          <div className="border-t pt-2 space-y-1">
            {isLoading && <div className="text-xs text-muted-foreground py-4 text-center">Loading…</div>}
            {(campaigns ?? []).map((c: EmailCampaign) => (
              <button
                key={c.id}
                className={`w-full text-left rounded-md border p-2 text-sm ${selectedId === c.id ? "bg-muted" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Badge variant="outline">{c.status ?? "draft"}</Badge>
                  {c.type && <span>{c.type.replace(/_/g, " ")}</span>}
                </div>
              </button>
            ))}
            {!isLoading && (!campaigns || campaigns.length === 0) && (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No email campaigns yet. Create one from the CRM.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="md:col-span-2 space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Campaign performance</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected && <div className="text-xs text-muted-foreground py-6 text-center">Select a campaign.</div>}
            {selected && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Recipients" value={(selected.totalRecipients ?? 0).toLocaleString()} icon={UsersIcon} />
                  <StatCard label="Sent" value={(selected.sentCount ?? 0).toLocaleString()} icon={Send} hint={`${(selected.deliveredCount ?? 0).toLocaleString()} delivered`} />
                  <StatCard label="Opened" value={(selected.openedCount ?? 0).toLocaleString()} icon={Eye} />
                  <StatCard label="Clicked" value={(selected.clickedCount ?? 0).toLocaleString()} icon={MessageCircle} hint={`${(selected.bouncedCount ?? 0).toLocaleString()} bounced`} />
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Subject:</span> {selected.subject}
                  {selected.sentAt && <> · sent {fmtDateTime(selected.sentAt)}</>}
                  {!selected.sentAt && selected.scheduledAt && <> · scheduled {fmtDateTime(selected.scheduledAt)}</>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <NotAvailableCard
          title="ROI & influencer rollup"
          description="Spend, attributed revenue and per-campaign influencer participation are not tracked yet."
        />
      </div>
    </div>
  );
}

// ---------- Posts list ----------

function VideoRow({ video }: { video: MarketingVideo }) {
  const utils = trpc.useUtils();
  const refresh = () => { utils.marketing.listVideos.invalidate(); utils.marketing.listPosts.invalidate(); };
  const updateVideo = trpc.marketing.updateVideo.useMutation({
    onSuccess: () => { toast.success("Video updated"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteVideo = trpc.marketing.deleteVideo.useMutation({
    onSuccess: () => { toast.success("Video deleted"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="border rounded-md p-2 flex items-center justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{video.title}</span>
          {video.horizontalUrl && <Badge variant="outline" className="text-[10px]">16:9</Badge>}
          {video.verticalUrl && <Badge variant="outline" className="text-[10px]">9:16</Badge>}
          {video.squareUrl && <Badge variant="outline" className="text-[10px]">1:1</Badge>}
        </div>
        {video.description && <p className="text-xs text-muted-foreground line-clamp-1">{video.description}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={updateVideo.isPending}
          onClick={() => {
            const next = prompt("Update video title", video.title);
            if (next && next !== video.title) updateVideo.mutate({ id: video.id, title: next });
          }}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" disabled={deleteVideo.isPending}
          onClick={() => {
            if (confirm(`Delete "${video.title}"? This removes the video record.`)) deleteVideo.mutate({ id: video.id });
          }}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function PostsTab() {
  const { data: posts } = trpc.marketing.listPosts.useQuery();
  const { data: videos } = trpc.marketing.listVideos.useQuery();
  const videoTitle = useMemo(() => new Map((videos ?? []).map((v) => [v.id, v.title])), [videos]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All posts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Video / caption</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(posts ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-xs">
                    <div className="truncate font-medium">{videoTitle.get(p.videoId) ?? `Video #${p.videoId}`}</div>
                    {p.caption && <div className="text-xs text-muted-foreground truncate">{p.caption}</div>}
                    {p.skipReason && <div className="text-xs text-foreground">{p.skipReason}</div>}
                    {p.errorMessage && <div className="text-xs text-foreground font-medium">{p.errorMessage}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{platformLabel(p.platform)}</Badge>
                      <Badge variant="outline" className="text-[10px]">{p.aspectRatio}</Badge>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                  <TableCell className="text-xs">{fmtDateTime(p.scheduledAt)}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(p.publishedAt)}</TableCell>
                  <TableCell className="text-right">
                    {p.externalUrl ? (
                      <a href={p.externalUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 text-xs">
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(!posts || posts.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                    No posts yet. Publish a video from the Calendar tab.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Videos</CardTitle>
          <NewVideoDialog />
        </CardHeader>
        <CardContent className="space-y-2">
          {!videos || videos.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No videos yet.</p>
          ) : (
            videos.map((v) => <VideoRow key={v.id} video={v} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Influencers (creator roster from brandAmbassadors) ----------

// Mirrors the `stage` enum on brand_ambassadors.
const CREATOR_STAGES = [
  { value: "shortlist", label: "Shortlist" },
  { value: "prospect", label: "Prospect" },
  { value: "contacted", label: "Contacted" },
  { value: "in_negotiation", label: "Negotiating" },
  { value: "term_sheet", label: "Term sheet" },
  { value: "signed", label: "Signed" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "ended", label: "Ended" },
  { value: "declined", label: "Declined" },
  { value: "blacklisted", label: "Blacklisted" },
] as const;

function primaryHandle(a: Ambassador): string | null {
  const handles = a.socialHandles;
  if (!handles || typeof handles !== "object") return null;
  const entries = Object.entries(handles as Record<string, unknown>);
  const first = entries.find(([, v]) => typeof v === "string" && v);
  return first ? `${first[0]}: ${String(first[1])}` : null;
}

function InfluencersTab({ onOpenAmbassadors }: { onOpenAmbassadors: () => void }) {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { data: list } = trpc.brandAmbassadors.list.useQuery(
    stageFilter === "all" ? undefined : { stage: stageFilter },
  );
  // Pipeline counts are unfiltered so the tiles stay stable while filtering the roster.
  const { data: all } = trpc.brandAmbassadors.list.useQuery(undefined);

  const pipelineMap = useMemo(() => {
    const map = new Map<string, number>();
    (all ?? []).forEach((row) => map.set(row.stage, (map.get(row.stage) ?? 0) + 1));
    return map;
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list ?? []).filter((a) => !q || a.name.toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q));
  }, [list, search]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Pipeline</CardTitle>
          <Button size="sm" onClick={onOpenAmbassadors}><Plus className="h-3 w-3 mr-1" /> Add creator (Ambassadors)</Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {CREATOR_STAGES.map((s) => {
              const count = pipelineMap.get(s.value) ?? 0;
              const active = stageFilter === s.value;
              return (
                <button
                  key={s.value}
                  className={`rounded-md border p-2 text-left ${active ? "bg-muted" : ""}`}
                  onClick={() => setStageFilter(active ? "all" : s.value)}
                >
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
                  <div className="text-lg font-semibold font-display tabular-nums">{count}</div>
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
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {CREATOR_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Followers</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{a.type.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-xs">{primaryHandle(a) ?? "—"}</TableCell>
                  <TableCell>{(a.followerCount ?? 0).toLocaleString()}</TableCell>
                  <TableCell>{a.category ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{a.stage.replace(/_/g, " ")}</Badge></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                    No creators yet. Add one from the Ambassadors tab.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NotAvailableCard
        title="Outreach log & campaign deals"
        description="Per-creator outreach history, agreed fees, payment status and performance (CPM, impressions) are not tracked yet. Deal terms live on the ambassador record in the Ambassadors tab."
      />
    </div>
  );
}

// ---------- Hub ----------

export default function MarketingHub() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("overview");

  // The YouTube OAuth callback redirects back to /marketing with a query
  // string. Surface success/error as toasts and clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("yt_success")) {
      toast.success("YouTube connected");
      utils.marketing.listCredentials.invalidate();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("yt_error")) {
      toast.error(`YouTube connect failed: ${params.get("yt_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [utils]);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Marketing
          </h1>
          <p className="text-muted-foreground text-sm">Social video publishing, campaigns, and creator deals</p>
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
        <TabsContent value="influencers"><InfluencersTab onOpenAmbassadors={() => setTab("ambassadors")} /></TabsContent>
        <TabsContent value="ambassadors"><BrandAmbassadors /></TabsContent>
      </Tabs>
    </div>
  );
}
