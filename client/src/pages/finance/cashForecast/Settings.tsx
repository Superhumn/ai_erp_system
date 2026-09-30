import { useEffect, useState } from "react";
import { Bell, Play, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CashSettingsPanel({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-4">
      <Channels isAdmin={isAdmin} />
      <AlertSettings isAdmin={isAdmin} />
      {isAdmin && <BankMapping />}
    </div>
  );
}

type ChannelType = "slack" | "google_chat" | "whatsapp" | "email" | "webhook";
const CHANNEL_META: Record<ChannelType, { label: string; placeholder: string; help: string }> = {
  slack: { label: "Slack", placeholder: "https://hooks.slack.com/services/…", help: "Slack → Apps → Incoming Webhooks → Add to channel → copy the URL." },
  google_chat: { label: "Google Chat", placeholder: "https://chat.googleapis.com/v1/spaces/…", help: "Open the space → Apps & integrations → Webhooks → Add → copy the URL." },
  whatsapp: { label: "WhatsApp", placeholder: "+14155551234", help: "Sent from the company Twilio WhatsApp number. Needs TWILIO_WHATSAPP_NUMBER on the server." },
  email: { label: "Email", placeholder: "you@company.com", help: "Plain email with the same digest." },
  webhook: { label: "Webhook (Teams, Zapier, other)", placeholder: "https://…", help: "POSTs JSON: { title, text, startingCash, lowestCash, … }. Point Zapier or a Teams connector at it." },
};

function Channels({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.cashForecast.channels.list.useQuery();
  const invalidate = () => utils.cashForecast.channels.list.invalidate();
  const create = trpc.cashForecast.channels.create.useMutation({ onSuccess: () => { invalidate(); setTarget(""); setLabel(""); toast.success("Destination added"); }, onError: (e) => toast.error(e.message) });
  const update = trpc.cashForecast.channels.update.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const remove = trpc.cashForecast.channels.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Removed"); }, onError: (e) => toast.error(e.message) });
  const test = trpc.cashForecast.channels.test.useMutation({ onSuccess: () => { invalidate(); toast.success("Test digest sent"); }, onError: (e) => { invalidate(); toast.error(e.message); } });
  const runDigest = trpc.cashForecast.channels.runDigestNow.useMutation({ onSuccess: (r) => toast.success(`Digest: ${r.sent} sent, ${r.failed} failed across ${r.scopes} scope(s)`), onError: (e) => toast.error(e.message) });
  const [type, setType] = useState<ChannelType>("slack");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const meta = CHANNEL_META[type];

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5"><Send className="h-4 w-4" />Where the Monday digest and alerts go</div>
          <p className="text-xs text-muted-foreground">Every Monday: cash now, low point, week-13 cash, this week's movements, biggest risks, cash in inventory, and per-entity numbers. Low-cash alerts use the same destinations.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Channel</label>
            <Select value={type} onValueChange={(v) => setType(v as ChannelType)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(CHANNEL_META) as ChannelType[]).map((k) => <SelectItem key={k} value={k}>{CHANNEL_META[k].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">Destination</label>
            <Input className="h-8 text-sm" placeholder={meta.placeholder} value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Label (optional)</label>
            <Input className="h-8 text-sm" placeholder="#finance" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">{meta.help}</p>
          <Button size="sm" onClick={() => create.mutate({ type, target, label: label || null })} disabled={create.isPending || !target.trim()}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add
          </Button>
        </div>
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {rows && rows.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/40">
                <th className="py-1 text-left font-medium">Channel</th>
                <th className="py-1 text-left font-medium">Destination</th>
                <th className="py-1 text-center font-medium">Digest</th>
                <th className="py-1 text-center font-medium">Alerts</th>
                <th className="py-1 text-center font-medium">Active</th>
                <th className="py-1 text-left font-medium">Last</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{CHANNEL_META[r.type as ChannelType]?.label ?? r.type}{r.label ? <span className="text-muted-foreground"> · {r.label}</span> : null}</td>
                  <td className="py-1.5 pr-2 max-w-[260px] truncate" title={r.target}>{r.type === "slack" || r.type === "google_chat" || r.type === "webhook" ? r.target.replace(/^https:\/\//, "").slice(0, 40) + "…" : r.target}</td>
                  <td className="py-1.5 text-center"><Switch aria-label={`Send Monday digest to ${r.label || r.target}`} checked={r.sendDigest} onCheckedChange={(v) => update.mutate({ id: r.id, sendDigest: v })} /></td>
                  <td className="py-1.5 text-center"><Switch aria-label={`Send low-cash alerts to ${r.label || r.target}`} checked={r.sendAlerts} onCheckedChange={(v) => update.mutate({ id: r.id, sendAlerts: v })} /></td>
                  <td className="py-1.5 text-center"><Switch aria-label={`${r.label || r.target} active`} checked={r.isActive} onCheckedChange={(v) => update.mutate({ id: r.id, isActive: v })} /></td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {r.lastError ? <Badge variant="destructive" className="text-[10px]" title={r.lastError}>failed</Badge> : r.lastSentAt ? <span className="text-muted-foreground">{String(r.lastSentAt).slice(0, 10)}</span> : <span className="text-muted-foreground">never</span>}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => test.mutate({ id: r.id })} disabled={test.isPending}>Test</Button>
                    <button aria-label="Remove" className="text-muted-foreground hover:text-destructive ml-1" onClick={() => remove.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isAdmin && (
          <div>
            <Button size="sm" variant="outline" onClick={() => runDigest.mutate()} disabled={runDigest.isPending}>
              <Play className="h-3.5 w-3.5 mr-1" />Send digest to everyone now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertSettings({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data } = trpc.cashForecast.alerts.get.useQuery();
  const set = trpc.cashForecast.alerts.set.useMutation({ onSuccess: () => { utils.cashForecast.alerts.get.invalidate(); toast.success("Alert saved"); }, onError: (e) => toast.error(e.message) });
  const runNow = trpc.cashForecast.alerts.runNow.useMutation({ onSuccess: (r) => toast.success(`Checked ${r.checked}, sent ${r.sent}, skipped ${r.skipped}`), onError: (e) => toast.error(e.message) });
  const [threshold, setThreshold] = useState("");
  const [recipients, setRecipients] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!data) return;
    setThreshold(String(data.thresholdAmount));
    setRecipients(data.recipients.join(", "));
    setActive(data.isActive);
  }, [data]);

  const save = () => {
    const t = Number(threshold.replace(/[$,\s]/g, ""));
    const list = recipients.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!Number.isFinite(t) || list.length === 0) {
      toast.error("Enter a cash floor and at least one email");
      return;
    }
    set.mutate({ thresholdAmount: t, recipients: list, isActive: active });
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5"><Bell className="h-4 w-4" />Low-cash alert</div>
            <p className="text-xs text-muted-foreground">Checked daily. If the 13-week low point drops under the floor, an email goes out. Repeats weekly while it stays under, or sooner if it gets 10% worse.</p>
          </div>
          {data?.lastAlertedAt && <Badge variant="outline" className="text-[10px]">Last sent {String(data.lastAlertedAt).slice(0, 10)} at {usd0.format(data.lastAlertLowestCash ?? 0)}</Badge>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Cash floor (USD)</label>
            <Input className="h-8 text-sm" placeholder="e.g. 150000" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">Email recipients (comma separated)</label>
            <Input className="h-8 text-sm" placeholder="jade@superhumn.co, finance@…" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs"><Switch checked={active} onCheckedChange={setActive} />Active</label>
          <Button size="sm" onClick={save} disabled={set.isPending}>Save</Button>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              <Play className="h-3.5 w-3.5 mr-1" />Run check now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BankMapping() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.cashForecast.bankAccounts.list.useQuery();
  const set = trpc.cashForecast.bankAccounts.set.useMutation({
    onSuccess: () => { utils.cashForecast.bankAccounts.list.invalidate(); utils.cashForecast.get.invalidate(); toast.success("Mapping saved"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">Bank accounts by entity</div>
          <p className="text-xs text-muted-foreground">Tell the forecast which entity each Mercury account belongs to. Entity-scoped users then see only their own cash. Unmapped accounts count for global users only.</p>
        </div>
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {data && !data.configured && <p className="text-xs text-muted-foreground">Mercury is not connected (MERCURY_API_TOKEN).</p>}
        {data?.error && <p className="text-xs text-destructive">{data.error}</p>}
        {data && data.accounts.length > 0 && (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/40">
                <th className="py-1 text-left font-medium">Account</th>
                <th className="py-1 text-right font-medium">Balance</th>
                <th className="py-1 text-left font-medium pl-4">Entity</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 pr-2">{a.name}</td>
                  <td className="py-1.5 text-right">{usd0.format(a.balance)}</td>
                  <td className="py-1.5 pl-4">
                    <Select value={a.companyId ? String(a.companyId) : "none"} onValueChange={(v) => set.mutate({ externalAccountId: a.id, accountName: a.name, companyId: v === "none" ? null : Number(v) })}>
                      <SelectTrigger className="h-7 w-56 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Unmapped —</SelectItem>
                        {data.companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
