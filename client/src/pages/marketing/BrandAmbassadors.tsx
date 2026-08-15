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
import { Plus, Star, Eye } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { value: "celebrity",          label: "Celebrity" },
  { value: "athlete",            label: "Athlete" },
  { value: "influencer",         label: "Influencer" },
  { value: "chef",               label: "Chef" },
  { value: "musician",           label: "Musician" },
  { value: "actor",              label: "Actor" },
  { value: "podcaster",          label: "Podcaster" },
  { value: "youtuber",           label: "YouTuber" },
  { value: "streamer",           label: "Streamer" },
  { value: "model",              label: "Model" },
  { value: "creator",            label: "Creator" },
  { value: "animated_character", label: "Animated Character" },
  { value: "fictional_character",label: "Fictional Character" },
  { value: "mascot",             label: "Mascot" },
  { value: "other",              label: "Other" },
] as const;
type TypeValue = typeof TYPES[number]["value"];

const STAGES = [
  "shortlist", "prospect", "contacted", "in_negotiation",
  "term_sheet", "signed", "active", "paused", "ended", "declined", "blacklisted",
] as const;
type StageValue = typeof STAGES[number];

const STAGE_COLORS: Record<string, string> = {
  shortlist: "bg-muted text-muted-foreground border-transparent",
  prospect: "bg-muted text-muted-foreground border-transparent",
  contacted: "bg-muted text-muted-foreground border-transparent",
  in_negotiation: "bg-muted text-muted-foreground border-transparent",
  term_sheet: "bg-muted text-muted-foreground border-transparent",
  signed: "bg-muted text-muted-foreground border-transparent",
  active: "bg-primary/10 text-primary border-primary/20",
  paused: "bg-muted text-muted-foreground border-transparent",
  ended: "bg-muted text-muted-foreground border-transparent",
  declined: "bg-[oklch(0.30_0.02_262)] text-white border-transparent",
  blacklisted: "bg-[oklch(0.30_0.02_262)] text-white border-transparent",
};

const ACTIVITY_TYPES = [
  "outreach", "meeting", "call", "email", "proposal_sent",
  "contract_sent", "contract_signed", "content_published",
  "appearance", "shipment", "payment", "note",
] as const;
type ActivityType = typeof ACTIVITY_TYPES[number];

function typeLabel(v: string) { return TYPES.find(t => t.value === v)?.label ?? v; }

function formatFollowers(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "-";
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toString();
}

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

export default function BrandAmbassadors() {
  const { data: ambassadors, refetch } = trpc.brandAmbassadors.list.useQuery({});
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const blank = {
    name: "",
    type: "celebrity" as TypeValue,
    category: "",
    country: "",
    stage: "prospect" as StageValue,
    priority: "medium" as "low" | "medium" | "high",
    agencyName: "",
    agentName: "",
    agentEmail: "",
    agentPhone: "",
    campaignName: "",
    followerCount: "",
    contractStartDate: "",
    contractEndDate: "",
    contractValue: "",
    currency: "USD",
    deliverables: "",
    exclusivity: "",
    usageRights: "",
    notes: "",
  };
  const [form, setForm] = useState(blank);

  const create = trpc.brandAmbassadors.create.useMutation({
    onSuccess: async () => {
      toast.success("Ambassador added");
      await refetch();
      setOpen(false);
      setForm({ ...blank });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStage = trpc.brandAmbassadors.updateStage.useMutation({
    onSuccess: async () => {
      toast.success("Stage updated");
      await refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (ambassadors ?? []).filter(a => {
    if (filter === "all") return true;
    if (filter === "active") return ["signed", "active"].includes(a.stage as string);
    if (filter === "pipeline") return ["shortlist", "prospect", "contacted", "in_negotiation", "term_sheet"].includes(a.stage as string);
    if (filter === "ended") return ["paused", "ended", "declined", "blacklisted"].includes(a.stage as string);
    return true;
  });

  const stats = (ambassadors ?? []).reduce((acc, a: any) => {
    acc.total++;
    if (["signed", "active"].includes(a.stage)) acc.active++;
    if (["shortlist", "prospect", "contacted", "in_negotiation", "term_sheet"].includes(a.stage)) acc.pipeline++;
    return acc;
  }, { total: 0, active: 0, pipeline: 0 });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <h2 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <Star className="h-4 w-4 text-primary" />
            Brand Ambassadors
          </h2>
          <span className="text-muted-foreground">Celebrities, athletes, characters — distinct from micro-influencers</span>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Total</span> <span className="font-bold">{stats.total}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Active</span> <span className="font-bold text-foreground">{stats.active}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Pipeline</span> <span className="font-bold text-foreground">{stats.pipeline}</span></div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pipeline">Pipeline</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Ambassador</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add Brand Ambassador</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label>Name</Label>
                    <Input placeholder="Virat Kohli" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v: TypeValue) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Input placeholder="cricket, bollywood..." value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Country</Label>
                    <Input maxLength={8} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Follower count</Label>
                    <Input type="number" placeholder="260000000" value={form.followerCount}
                      onChange={(e) => setForm({ ...form, followerCount: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Stage</Label>
                    <Select value={form.stage} onValueChange={(v: StageValue) => setForm({ ...form, stage: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Campaign</Label>
                    <Input value={form.campaignName}
                      onChange={(e) => setForm({ ...form, campaignName: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Agency</Label>
                    <Input value={form.agencyName} onChange={(e) => setForm({ ...form, agencyName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Agent name</Label>
                    <Input value={form.agentName} onChange={(e) => setForm({ ...form, agentName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Agent email</Label>
                    <Input type="email" value={form.agentEmail} onChange={(e) => setForm({ ...form, agentEmail: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Agent phone</Label>
                    <Input value={form.agentPhone} onChange={(e) => setForm({ ...form, agentPhone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Contract start</Label>
                    <Input type="date" value={form.contractStartDate}
                      onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Contract end</Label>
                    <Input type="date" value={form.contractEndDate}
                      onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Contract value</Label>
                    <div className="flex gap-1">
                      <Input type="number" step="0.01" className="flex-1" value={form.contractValue}
                        onChange={(e) => setForm({ ...form, contractValue: e.target.value })} />
                      <Input className="w-16" maxLength={3} value={form.currency}
                        onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Deliverables</Label>
                  <Textarea rows={2} placeholder="e.g. 3 IG posts, 1 reel, 1 appearance" value={form.deliverables}
                    onChange={(e) => setForm({ ...form, deliverables: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Exclusivity</Label>
                    <Textarea rows={2} value={form.exclusivity}
                      onChange={(e) => setForm({ ...form, exclusivity: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Usage rights</Label>
                    <Textarea rows={2} value={form.usageRights}
                      onChange={(e) => setForm({ ...form, usageRights: e.target.value })} />
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
                  disabled={create.isPending || !form.name.trim()}
                  onClick={() => create.mutate({
                    name: form.name.trim(),
                    type: form.type,
                    category: form.category || undefined,
                    country: form.country || undefined,
                    followerCount: form.followerCount ? parseInt(form.followerCount) : undefined,
                    stage: form.stage,
                    priority: form.priority,
                    agencyName: form.agencyName || undefined,
                    agentName: form.agentName || undefined,
                    agentEmail: form.agentEmail || undefined,
                    agentPhone: form.agentPhone || undefined,
                    campaignName: form.campaignName || undefined,
                    contractStartDate: form.contractStartDate ? new Date(form.contractStartDate) : undefined,
                    contractEndDate: form.contractEndDate ? new Date(form.contractEndDate) : undefined,
                    contractValue: form.contractValue || undefined,
                    currency: form.currency || "USD",
                    deliverables: form.deliverables || undefined,
                    exclusivity: form.exclusivity || undefined,
                    usageRights: form.usageRights || undefined,
                    notes: form.notes || undefined,
                  })}
                >
                  {create.isPending ? "Saving..." : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              {ambassadors === undefined ? "Loading..." : "No ambassadors yet. Add a celebrity, athlete, or character to start tracking."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Followers</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Contract value</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell><Badge variant="outline">{typeLabel(a.type)}</Badge></TableCell>
                    <TableCell className="text-xs">{a.country ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono">{formatFollowers(a.followerCount)}</TableCell>
                    <TableCell className="text-xs max-w-[18ch] truncate" title={a.agencyName ?? ""}>{a.agencyName ?? "-"}</TableCell>
                    <TableCell className="text-xs max-w-[24ch] truncate" title={a.campaignName ?? ""}>{a.campaignName ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(a.contractValue, a.currency || "USD")}</TableCell>
                    <TableCell>
                      <Select value={a.stage} onValueChange={(v: StageValue) => updateStage.mutate({ id: a.id, stage: v })}>
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue>
                            <Badge className={STAGE_COLORS[a.stage] ?? ""}>{(a.stage as string).replace(/_/g, " ")}</Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(a.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {detailId !== null && (
        <AmbassadorDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

function AmbassadorDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: amb, refetch } = trpc.brandAmbassadors.get.useQuery({ id });
  const [activityOpen, setActivityOpen] = useState(false);
  const blank = {
    activityType: "outreach" as ActivityType,
    occurredAt: new Date().toISOString().slice(0, 10),
    summary: "",
    details: "",
    postUrl: "",
    impressions: "",
    engagements: "",
  };
  const [form, setForm] = useState(blank);

  const logActivity = trpc.brandAmbassadors.logActivity.useMutation({
    onSuccess: async () => {
      toast.success("Activity logged");
      await refetch();
      setActivityOpen(false);
      setForm({ ...blank });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!amb) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />{amb.name}
          </DialogTitle>
          <CardDescription>
            {typeLabel(amb.type)}{amb.category ? ` · ${amb.category}` : ""}{amb.country ? ` · ${amb.country}` : ""}
          </CardDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <DetailField label="Followers" value={formatFollowers(amb.followerCount)} />
            <DetailField label="Estimated reach" value={formatFollowers(amb.estimatedReach)} />
            <DetailField label="Priority" value={amb.priority} />
            <DetailField label="Campaign" value={amb.campaignName} />
            <DetailField label="Contract value" value={formatMoney(amb.contractValue, amb.currency || "USD")} />
            <DetailField label="Payment terms" value={amb.paymentTerms} />
            <DetailField label="Contract start" value={amb.contractStartDate ? new Date(amb.contractStartDate).toLocaleDateString() : null} />
            <DetailField label="Contract end" value={amb.contractEndDate ? new Date(amb.contractEndDate).toLocaleDateString() : null} />
            <DetailField label="Agency" value={amb.agencyName} />
            <DetailField label="Agent" value={amb.agentName} />
            <DetailField label="Agent email" value={amb.agentEmail} />
            <DetailField label="Agent phone" value={amb.agentPhone} />
          </div>
          {amb.deliverables && (
            <div className="text-sm">
              <div className="text-xs text-muted-foreground mb-1">Deliverables</div>
              <p className="whitespace-pre-wrap">{amb.deliverables}</p>
            </div>
          )}
          {(amb.exclusivity || amb.usageRights) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {amb.exclusivity && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Exclusivity</div>
                  <p className="whitespace-pre-wrap">{amb.exclusivity}</p>
                </div>
              )}
              {amb.usageRights && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Usage rights</div>
                  <p className="whitespace-pre-wrap">{amb.usageRights}</p>
                </div>
              )}
            </div>
          )}
          {amb.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{amb.notes}</p>}

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Activity ({(amb.activities ?? []).length})</h4>
              <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Log activity</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Log activity</DialogTitle></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Type</Label>
                        <Select value={form.activityType} onValueChange={(v: ActivityType) => setForm({ ...form, activityType: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ACTIVITY_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>When</Label>
                        <Input type="date" value={form.occurredAt}
                          onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Summary</Label>
                      <Input value={form.summary}
                        onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Details</Label>
                      <Textarea rows={2} value={form.details}
                        onChange={(e) => setForm({ ...form, details: e.target.value })} />
                    </div>
                    {form.activityType === "content_published" && (
                      <>
                        <div className="space-y-1">
                          <Label>Post URL</Label>
                          <Input type="url" value={form.postUrl}
                            onChange={(e) => setForm({ ...form, postUrl: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Impressions</Label>
                            <Input type="number" value={form.impressions}
                              onChange={(e) => setForm({ ...form, impressions: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label>Engagements</Label>
                            <Input type="number" value={form.engagements}
                              onChange={(e) => setForm({ ...form, engagements: e.target.value })} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setActivityOpen(false)}>Cancel</Button>
                    <Button
                      disabled={logActivity.isPending}
                      onClick={() => logActivity.mutate({
                        ambassadorId: id,
                        activityType: form.activityType,
                        occurredAt: new Date(form.occurredAt),
                        summary: form.summary || undefined,
                        details: form.details || undefined,
                        postUrl: form.postUrl || undefined,
                        impressions: form.impressions ? parseInt(form.impressions) : undefined,
                        engagements: form.engagements ? parseInt(form.engagements) : undefined,
                      })}
                    >
                      {logActivity.isPending ? "Saving..." : "Log"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {(amb.activities ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Post</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Engagements</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(amb.activities as any[]).map(act => (
                    <TableRow key={act.id}>
                      <TableCell className="text-xs">{act.occurredAt ? new Date(act.occurredAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-xs">{(act.activityType as string).replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-sm">{act.summary ?? "-"}</TableCell>
                      <TableCell>
                        {act.postUrl ? <a href={act.postUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">open</a> : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatFollowers(act.impressions)}</TableCell>
                      <TableCell className="text-right font-mono">{formatFollowers(act.engagements)}</TableCell>
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

function DetailField({ label, value }: { label: string | number | null | undefined; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value || value === 0 ? String(value) : "-"}</div>
    </div>
  );
}
