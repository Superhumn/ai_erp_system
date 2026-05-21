import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Video, Plus, Upload, Send, Loader2, ExternalLink,
  CheckCircle2, AlertTriangle, XCircle, Clock, Link2, Unlink,
} from "lucide-react";
import { toast } from "sonner";

const PLATFORMS = [
  { value: "tiktok",          label: "TikTok",          requires: "9:16 vertical" },
  { value: "youtube",         label: "YouTube",         requires: "16:9 horizontal preferred" },
  { value: "youtube_shorts",  label: "YouTube Shorts",  requires: "9:16 vertical" },
  { value: "instagram_reels", label: "Instagram Reels", requires: "9:16 vertical preferred" },
  { value: "instagram_feed",  label: "Instagram Feed",  requires: "1:1 square preferred" },
] as const;

type PlatformKey = typeof PLATFORMS[number]["value"];

const STATUS_STYLES: Record<string, { icon: any; cls: string }> = {
  published: { icon: CheckCircle2, cls: "bg-green-500/10 text-green-700" },
  scheduled: { icon: Clock,        cls: "bg-blue-500/10 text-blue-700" },
  uploading: { icon: Loader2,      cls: "bg-blue-500/10 text-blue-700" },
  pending:   { icon: Clock,        cls: "bg-gray-500/10 text-gray-600" },
  skipped:   { icon: AlertTriangle,cls: "bg-amber-500/10 text-amber-700" },
  failed:    { icon: XCircle,      cls: "bg-red-500/10 text-red-700" },
};

export default function SocialPosts() {
  const utils = trpc.useUtils?.();
  const videosQuery = trpc.marketing.listVideos.useQuery();
  const postsQuery = trpc.marketing.listPosts.useQuery();
  const credsQuery = trpc.marketing.listCredentials.useQuery();

  // The YouTube OAuth callback redirects back to /marketing with a query
  // string. Surface success/error as toasts and clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("yt_success")) {
      toast.success("YouTube connected");
      utils?.marketing?.listCredentials?.invalidate();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("yt_error")) {
      toast.error(`YouTube connect failed: ${params.get("yt_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [utils]);

  const connectMut = trpc.marketing.getConnectUrl.useMutation({
    onSuccess: (data: any) => {
      // Top-level redirect (rather than popup) so the session cookie carries.
      window.location.href = data.url;
    },
    onError: (e: any) => toast.error(e.message),
  });
  const disconnectMut = trpc.marketing.disconnectCredential.useMutation({
    onSuccess: () => {
      toast.success("Disconnected");
      utils?.marketing?.listCredentials?.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [horizontalUrl, setHorizontalUrl] = useState("");
  const [verticalUrl, setVerticalUrl] = useState("");
  const [squareUrl, setSquareUrl] = useState("");
  const [tags, setTags] = useState("");

  const createVideo = trpc.marketing.createVideo.useMutation({
    onSuccess: () => {
      toast.success("Video saved");
      setCreateOpen(false);
      setTitle(""); setDescription(""); setHorizontalUrl(""); setVerticalUrl(""); setSquareUrl(""); setTags("");
      utils?.marketing?.listVideos?.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    if (!horizontalUrl && !verticalUrl && !squareUrl) {
      toast.error("Provide at least one video URL (horizontal, vertical, or square)");
      return;
    }
    createVideo.mutate({
      title,
      description: description || undefined,
      horizontalUrl: horizontalUrl || undefined,
      verticalUrl: verticalUrl || undefined,
      squareUrl: squareUrl || undefined,
      tags: tags || undefined,
    });
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
          <Video className="h-4 w-4" /> Social Video Publishing
        </h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8"><Plus className="h-3 w-3 mr-1" /> New Video</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Add video</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description / default caption</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Horizontal cut URL (16:9) — used for YouTube long-form</Label>
                  <Input placeholder="https://…/horizontal.mp4" value={horizontalUrl} onChange={(e) => setHorizontalUrl(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vertical cut URL (9:16) — used for TikTok, Shorts, Reels</Label>
                  <Input placeholder="https://…/vertical.mp4" value={verticalUrl} onChange={(e) => setVerticalUrl(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Square cut URL (1:1) — preferred for Instagram feed</Label>
                  <Input placeholder="https://…/square.mp4" value={squareUrl} onChange={(e) => setSquareUrl(e.target.value)} className="h-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hashtags / tags</Label>
                <Input placeholder="#plantbased #protein" value={tags} onChange={(e) => setTags(e.target.value)} className="h-8" />
              </div>
              <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground flex gap-1.5">
                <Upload className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Paste public URLs to your video files for now (S3, Drive, etc).
                  Direct upload + transcoding is on the roadmap.
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createVideo.isPending}>
                {createVideo.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Connected accounts</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {(["youtube", "tiktok", "instagram"] as const).map(p => {
            const cred = (credsQuery.data ?? []).find((c: any) => c.platform === p);
            const connected = !!cred?.isConnected && cred?.isActive;
            const label = p === "youtube" ? "YouTube" : p === "tiktok" ? "TikTok" : "Instagram";
            return (
              <div key={p} className="flex items-center justify-between border rounded-md px-2 py-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{label}</span>
                  {connected ? (
                    <Badge className="bg-green-500/10 text-green-700 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-0.5" /> Connected{cred.accountHandle ? ` · ${cred.accountHandle}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Not connected</Badge>
                  )}
                </div>
                {connected ? (
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => disconnectMut.mutate({ platform: p })}
                    disabled={disconnectMut.isPending}
                  >
                    <Unlink className="h-3 w-3 mr-1" /> Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm" className="h-7 text-xs"
                    onClick={() => connectMut.mutate({ platform: p })}
                    disabled={connectMut.isPending}
                  >
                    <Link2 className="h-3 w-3 mr-1" /> Connect
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Videos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!videosQuery.data || videosQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No videos yet. Click "New Video" to add one.</p>
          ) : (
            videosQuery.data.map((v: any) => (
              <VideoRow key={v.id} video={v} onChanged={() => { utils?.marketing?.listPosts?.invalidate(); utils?.marketing?.listVideos?.invalidate(); }} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent posts</CardTitle></CardHeader>
        <CardContent>
          {!postsQuery.data || postsQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No posts yet.</p>
          ) : (
            <div className="space-y-1">
              {postsQuery.data.map((p: any) => {
                const cfg = STATUS_STYLES[p.status] ?? STATUS_STYLES.pending;
                const Icon = cfg.icon;
                return (
                  <div key={p.id} className="flex items-center justify-between border rounded-md px-2 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{p.platform}</Badge>
                      <Badge variant="outline" className="text-[10px]">{p.aspectRatio}</Badge>
                      <span className="text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</span>
                      {p.skipReason && <span className="text-amber-700">{p.skipReason}</span>}
                      {p.errorMessage && <span className="text-red-700">{p.errorMessage}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.externalUrl && (
                        <a href={p.externalUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <Badge className={cfg.cls + " text-[10px]"}>
                        <Icon className={"h-3 w-3 mr-0.5" + (p.status === "uploading" ? " animate-spin" : "")} />
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VideoRow({ video, onChanged }: { video: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlatformKey[]>(
    PLATFORMS.map(p => p.value).filter((key) => {
      // Pre-select platforms whose preferred ratio is available.
      if (key === "tiktok" || key === "youtube_shorts" || key === "instagram_reels") return !!video.verticalUrl;
      if (key === "youtube") return !!video.horizontalUrl || !!video.verticalUrl;
      if (key === "instagram_feed") return !!video.squareUrl || !!video.verticalUrl;
      return false;
    }) as PlatformKey[]
  );
  const [caption, setCaption] = useState("");

  const planQuery = trpc.marketing.planPosts.useQuery(
    { videoId: video.id, platforms: selected },
    { enabled: open && selected.length > 0 },
  );

  const publish = trpc.marketing.publish.useMutation({
    onSuccess: (data: any) => {
      const ok = data.results.filter((r: any) => r.status === "published").length;
      const skipped = data.results.filter((r: any) => r.status === "skipped").length;
      const failed = data.results.filter((r: any) => r.status === "failed").length;
      toast.success(`Published ${ok} · skipped ${skipped} · failed ${failed}`);
      setOpen(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateVideo = trpc.marketing.updateVideo.useMutation({
    onSuccess: () => {
      toast.success("Video updated");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteVideo = trpc.marketing.deleteVideo.useMutation({
    onSuccess: () => {
      toast.success("Video deleted");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (key: PlatformKey) => {
    setSelected(s => s.includes(key) ? s.filter(k => k !== key) : [...s, key]);
  };

  return (
    <div className="border rounded-md p-2 flex items-center justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{video.title}</span>
          {video.horizontalUrl && <Badge variant="outline" className="text-[10px]">16:9</Badge>}
          {video.verticalUrl   && <Badge variant="outline" className="text-[10px]">9:16</Badge>}
          {video.squareUrl     && <Badge variant="outline" className="text-[10px]">1:1</Badge>}
        </div>
        {video.description && <p className="text-xs text-muted-foreground line-clamp-1">{video.description}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            const newTitle = prompt("Update video title", video.title);
            if (newTitle && newTitle !== video.title) {
              updateVideo.mutate({ id: video.id, title: newTitle });
            }
          }}
          disabled={updateVideo.isPending}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (confirm(`Delete "${video.title}"? This removes the video record and any unpublished cuts.`)) {
              deleteVideo.mutate({ id: video.id });
            }
          }}
          disabled={deleteVideo.isPending}
        >
          Delete
        </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs"><Send className="h-3 w-3 mr-1" /> Publish</Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Publish "{video.title}"</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Platforms</Label>
              <div className="space-y-1">
                {PLATFORMS.map(p => {
                  const fit = (planQuery.data ?? []).find((r: any) => r.platform === p.value);
                  const isSkipped = fit && !fit.pickedRatio;
                  return (
                    <div key={p.value} className="flex items-start gap-2 text-xs">
                      <Checkbox
                        id={`p-${video.id}-${p.value}`}
                        checked={selected.includes(p.value)}
                        onCheckedChange={() => toggle(p.value)}
                      />
                      <label htmlFor={`p-${video.id}-${p.value}`} className="flex-1 cursor-pointer">
                        <div className="font-medium">{p.label}</div>
                        <div className="text-muted-foreground">{p.requires}</div>
                        {fit && fit.pickedRatio && (
                          <div className="text-green-700">→ will use {fit.pickedRatio} cut</div>
                        )}
                        {isSkipped && (
                          <div className="text-amber-700">→ will skip: {fit.skipReason}</div>
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Caption (optional — defaults to title)</Label>
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder={video.description || video.title} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => publish.mutate({ videoId: video.id, platforms: selected, caption: caption || undefined })}
              disabled={publish.isPending || selected.length === 0}
            >
              {publish.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Publish to {selected.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
