import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, Wallet, Clock, Receipt, LineChart, Megaphone, Shield, FileText, Download, UserCog, PieChart, Gavel, ExternalLink, Rocket, CheckCircle2, Building2 } from "lucide-react";
import { toast } from "sonner";

// The logged-in existing-investor view. Reuses the same tRPC client the
// rest of the dashboard uses, so the session auth cookie gates everything
// — no public-link code here, unlike /dr/:code/financials.

function formatCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function formatRunway(months: number | null): string {
  if (months === null) return "—";
  if (months <= 0) return "0 mo";
  if (months >= 48) return "48+ mo";
  return `${months.toFixed(1)} mo`;
}

function formatShares(s: number | string | null | undefined): string {
  const n = typeof s === "string" ? parseFloat(s) : s ?? 0;
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export default function InvestorPortal() {
  const { user } = useAuth();
  // Multi-entity: an investor with stakes in parent + JVs picks which
  // entity they're viewing. Default (undefined) → server picks the
  // earliest stakeholder row.
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const queryInput = companyId !== undefined ? { companyId } : undefined;
  const { data: me, isLoading: meLoading, error: meError } = trpc.investorPortal.me.useQuery(queryInput);
  const { data: fin, isLoading: finLoading } = trpc.investorPortal.financials.useQuery(queryInput);
  const { data: updates } = trpc.investorPortal.updates.useQuery(queryInput);

  // Client-side guard mirrors the vendor/copacker portals. Server endpoints
  // are still the source of truth, but admins/exec can preview the view.
  if (user && user.role !== "investor" && user.role !== "admin" && user.role !== "exec") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              You don't have access to the Investor Portal.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (meLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The server returns NOT_FOUND when the logged-in user has no
  // `stakeholders.userId` link. That's a broken-onboarding state, not an
  // error to panic about — explain it and let them contact support.
  if (meError) {
    return (
      <div className="max-w-xl mx-auto mt-16">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Portal not yet activated</CardTitle>
            </div>
            <CardDescription>
              {meError.message || "No cap-table record is linked to your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If you believe this is a mistake, reach out to the team that sent you the
              invite and ask them to link your stakeholder record to your login.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!me) return null;

  type Grant = {
    id: number;
    grantType: string;
    grantDate: string | Date | null;
    shares: string | number | null;
    pricePerShare: string | number | null;
    shareClassId: number;
    shareClass: { name?: string; type?: string } | null;
  };
  const classOf = (g: Pick<Grant, "shareClass">) =>
    g.shareClass ? `${g.shareClass.name ?? ""}` : "—";
  const grants = me.grants as unknown as Grant[];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Investor Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, {me.stakeholder.name}. This is your always-current view of your
              equity position and the company's financials.
            </p>
          </div>
          {me.entities && me.entities.length > 1 ? (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Viewing entity:</span>
              <Select
                value={String(me.entity?.id ?? me.entities[0].id)}
                onValueChange={(v) => setCompanyId(Number(v))}
              >
                <SelectTrigger className="h-7 w-auto min-w-[12rem] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {me.entities.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}{e.country ? ` — ${e.country}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                ({me.entities.length} stakes)
              </span>
            </div>
          ) : (
            me.entity && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Viewing entity:
                <span className="font-medium text-foreground">{me.entity.name}</span>
                {me.entity.country && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{me.entity.country}</Badge>
                )}
                <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">{me.entity.type}</Badge>
              </p>
            )
          )}
        </div>
        {me.stakeholder.accreditedInvestor && (
          <Badge variant="outline">Accredited</Badge>
        )}
      </div>

      {/* Equity position */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your equity position</CardTitle>
          <CardDescription>
            Based on {formatShares(me.totalSharesOutstanding)} total shares outstanding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KpiTile label="Your shares" value={formatShares(me.sharesOutstanding)} />
            <KpiTile label="Ownership" value={`${me.ownershipPct.toFixed(2)}%`} />
            <KpiTile label="Grants" value={`${grants.length}`} />
          </div>
          {grants.length > 0 ? (
            <div className="space-y-2">
              {grants.map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{classOf(g)}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.grantType} · granted {g.grantDate ? new Date(g.grantDate).toLocaleDateString("en-US") : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatShares(g.shares)} shares</p>
                    <p className="text-xs text-muted-foreground">
                      @ {formatCurrency(parseFloat(String(g.pricePerShare ?? "0")))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active grants on file. If you expect a position here, contact the company admin.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Financials */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Company financials</CardTitle>
          </div>
          <CardDescription>
            Live — computed at the time of this page load.
            {fin?.asOf && ` Last refreshed ${new Date(fin.asOf).toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            })}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {finLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : fin ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                <KpiTile icon={<Wallet className="h-4 w-4" />} label="Cash" value={formatCurrency(fin.cash, fin.currency)} />
                <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="ARR (3mo-avg × 12)" value={formatCurrency(fin.arr, fin.currency)} />
                <KpiTile icon={<TrendingDown className="h-4 w-4" />} label="Monthly burn" value={formatCurrency(fin.avgMonthlyBurn, fin.currency)} />
                <KpiTile icon={<Clock className="h-4 w-4" />} label="Runway" value={formatRunway(fin.runwayMonths)} sub={fin.cashOutMonth ? `cash-out ~${fin.cashOutMonth}` : undefined} />
                <KpiTile label="MoM growth" value={formatPct(fin.momGrowthPct)} />
                <KpiTile label="YoY growth" value={formatPct(fin.yoyGrowthPct)} />
                <KpiTile
                  label="Gross margin"
                  value={fin.grossMarginPct !== null ? formatPct(fin.grossMarginPct, 0) : "—"}
                  sub={fin.marginSource === "none" ? "no source connected" : undefined}
                />
                <KpiTile icon={<Receipt className="h-4 w-4" />} label="Outstanding AR" value={formatCurrency(fin.arTotal, fin.currency)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <TrendPanel
                  title="Revenue — trailing 12 months"
                  items={fin.months.map((m) => ({ label: m.label, amount: m.revenue }))}
                  currency={fin.currency}
                  tone="positive"
                />
                <TrendPanel
                  title="Burn — trailing 12 months"
                  items={fin.months.map((m) => ({ label: m.label, amount: m.burn }))}
                  currency={fin.currency}
                  tone="negative"
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Updates */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Investor updates</CardTitle>
          </div>
          <CardDescription>
            Most recent updates published by the company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!updates || updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No updates have been published yet.</p>
          ) : (
            <div className="space-y-3">
              {updates.slice(0, 10).map((raw) => {
                const u = raw as {
                  id: number;
                  title: string;
                  period: string | null;
                  highlights: string | null;
                  sentAt: string | Date | null;
                };
                return (
                  <div key={u.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-sm font-medium">{u.title}</p>
                      <p className="text-xs text-muted-foreground flex-shrink-0">
                        {u.sentAt ? new Date(u.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                      </p>
                    </div>
                    {u.period && (
                      <p className="text-xs text-muted-foreground mb-2">{u.period}</p>
                    )}
                    {u.highlights && (
                      <p className="text-sm whitespace-pre-wrap line-clamp-4">{u.highlights}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My Documents */}
      <MyDocumentsSection companyId={companyId} />

      {/* Active rounds — only renders when the company has an open round.
          The query returns an empty array otherwise; the section hides itself. */}
      <ActiveRoundsSection companyId={companyId} />

      {/* Cap table summary */}
      <CapTableSummarySection companyId={companyId} />

      {/* Board materials — only renders when the investor holds tier=board. */}
      {me.stakeholder.tier === "board" && <BoardMaterialsSection companyId={companyId} />}

      {/* Profile & Preferences */}
      <ProfileSection companyId={companyId} />
    </div>
  );
}

// ─── Board materials (board-tier only) ───────────────────────────────
//
// Renders only when the investor's stakeholder has tier='board'. The
// server independently re-checks the tier so a tampered client can't
// just unhide this section to fetch the data. Drafts and in-review
// resolutions are hidden server-side (only approved / signed /
// archived flow through).
function BoardMaterialsSection({ companyId }: { companyId?: number }) {
  const { data: resolutions, isLoading } = trpc.investorPortal.boardMaterials.useQuery(
    companyId !== undefined ? { companyId } : undefined,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Board materials</CardTitle>
          <Badge variant="outline" className="ml-1">Board seat</Badge>
        </div>
        <CardDescription>
          Approved board resolutions. Drafts and pre-decisional materials are not shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !resolutions || resolutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No board resolutions have been approved yet.
          </p>
        ) : (
          <div className="space-y-2">
            {resolutions.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <p className="text-sm font-medium">{r.title}</p>
                  <Badge variant="outline" className="capitalize flex-shrink-0">
                    {r.type.replace(/_/g, " ")}
                  </Badge>
                </div>
                {r.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3 mb-1">
                    {r.description}
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {r.status === "signed" ? "Signed" : "Approved"}
                    {r.approvedAt ? ` ${new Date(r.approvedAt).toLocaleDateString("en-US")}` : ""}
                  </p>
                  {r.documentUrl && (
                    <a
                      href={r.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View document <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active rounds ────────────────────────────────────────────────────
//
// Surfaces every fundraisingCampaign with status='active' and lets the
// investor signal pro-rata interest. The signal is non-binding — IR
// follows up offline to collect subscription docs. Hides itself when
// no active rounds exist (typical case).
function ActiveRoundsSection({ companyId }: { companyId?: number }) {
  const { data: rounds, isLoading } = trpc.investorPortal.activeRounds.useQuery(
    companyId !== undefined ? { companyId } : undefined,
  );
  if (isLoading) return null;
  if (!rounds || rounds.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Active rounds</CardTitle>
        </div>
        <CardDescription>
          The team is currently raising. Indicate interest below if you'd like to
          participate — IR will follow up to share subscription documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rounds.map((raw) => (
          <RoundCard key={raw.id} round={raw as RoundShape} companyId={companyId} />
        ))}
      </CardContent>
    </Card>
  );
}

type RoundShape = {
  id: number;
  name: string;
  description: string | null;
  roundType: string;
  targetAmount: string | null;
  raisedAmount: string | null;
  minimumInvestment: string | null;
  valuation: string | null;
  equityOffered: string | null;
  targetCloseDate: string | Date | null;
  myIndication: {
    indicatedAmount: string | null;
    notes: string | null;
    status: string;
    createdAt: string | Date;
  } | null;
};

function RoundCard({ round, companyId }: { round: RoundShape; companyId?: number }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(round.myIndication?.status !== "interested");
  const [amount, setAmount] = useState(round.myIndication?.indicatedAmount ?? "");
  const [notes, setNotes] = useState(round.myIndication?.notes ?? "");

  const indicate = trpc.investorPortal.indicateInterest.useMutation({
    onSuccess: () => {
      toast.success("Interest noted — IR will reach out shortly.");
      setEditing(false);
      utils.investorPortal.activeRounds.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const withdraw = trpc.investorPortal.indicateInterest.useMutation({
    onSuccess: () => {
      toast.success("Interest withdrawn");
      utils.investorPortal.activeRounds.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const fmtMoney = (v: string | null) => {
    if (!v) return "—";
    const n = parseFloat(v);
    return Number.isFinite(n) ? formatCurrency(n) : "—";
  };
  const closeLabel = round.targetCloseDate
    ? new Date(round.targetCloseDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-sm font-semibold">{round.name}</p>
        <Badge variant="outline" className="capitalize flex-shrink-0">
          {round.roundType.replace(/_/g, " ")}
        </Badge>
      </div>
      {round.description && (
        <p className="text-sm text-muted-foreground mb-3">{round.description}</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <KpiTile label="Target" value={fmtMoney(round.targetAmount)} />
        <KpiTile label="Raised" value={fmtMoney(round.raisedAmount)} />
        <KpiTile label="Valuation" value={fmtMoney(round.valuation)} />
        <KpiTile label="Min check" value={fmtMoney(round.minimumInvestment)} />
      </div>
      {closeLabel && (
        <p className="text-xs text-muted-foreground mb-3">Target close: {closeLabel}</p>
      )}

      {/* Indication state machine: previously-signaled (compact) vs editable form. */}
      {!editing && round.myIndication?.status === "interested" ? (
        <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Interest signaled
              </p>
              {round.myIndication.indicatedAmount && (
                <p className="text-sm mt-0.5">
                  Indicated amount: {fmtMoney(round.myIndication.indicatedAmount)}
                </p>
              )}
              {round.myIndication.notes && (
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                  {round.myIndication.notes}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Update</Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={withdraw.isPending}
                onClick={() => {
                  if (confirm("Withdraw your interest in this round?")) {
                    withdraw.mutate({ campaignId: round.id, withdraw: true, companyId });
                  }
                }}
              >
                Withdraw
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <FormField
            label="Indicated amount (optional)"
            hint="A directional figure helps IR prioritize follow-ups. You can leave it blank if you'd rather discuss live."
          >
            <Input
              inputMode="decimal"
              placeholder="e.g. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <FormField label="Notes (optional)">
            <Textarea
              rows={2}
              placeholder="Anything you want IR to know — timing, structure preferences, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-1">
            {round.myIndication && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setAmount(round.myIndication?.indicatedAmount ?? "");
                  setNotes(round.myIndication?.notes ?? "");
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              disabled={indicate.isPending}
              onClick={() => indicate.mutate({
                campaignId: round.id,
                companyId,
                indicatedAmount: amount.trim() || undefined,
                notes: notes.trim() || undefined,
              })}
            >
              {indicate.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {round.myIndication ? "Update" : "Signal interest"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cap table summary ────────────────────────────────────────────────
//
// Tier-aware: ordinary investors see share-class totals + option pool;
// major / board tiers additionally see a top-holders list (name + %,
// never check size). The server enforces the gate — this component
// just renders whatever the server returned.
function CapTableSummarySection({ companyId }: { companyId?: number }) {
  const { data, isLoading } = trpc.investorPortal.capTableSummary.useQuery(
    companyId !== undefined ? { companyId } : undefined,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Cap table summary</CardTitle>
        </div>
        <CardDescription>
          Fully-diluted ownership by share class as of today.
          {data.tier !== "ordinary" && " Includes a top-holders list since you're at major/board tier."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border p-3 mb-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Total shares outstanding
          </p>
          <p className="text-lg font-semibold">{formatShares(data.totalSharesOutstanding)}</p>
          {data.optionPool && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Option pool: {formatShares(data.optionPool.sharesIssued)} ({data.optionPool.ownershipPct.toFixed(2)}%)
              {data.optionPool.authorized
                ? ` · ${formatShares(data.optionPool.authorized - data.optionPool.sharesIssued)} unallocated`
                : ""}
            </p>
          )}
        </div>

        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          By share class
        </p>
        <div className="space-y-2 mb-4">
          {data.classBreakdown.map((c) => (
            <div key={c.id} className="flex items-baseline justify-between gap-3 rounded-lg border p-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{c.type.replace(/_/g, " ")}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium">{formatShares(c.sharesIssued)}</p>
                <p className="text-xs text-muted-foreground">{c.ownershipPct.toFixed(2)}%</p>
              </div>
            </div>
          ))}
        </div>

        {data.topHolders && data.topHolders.length > 0 && (
          <>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Top holders (top 10)
            </p>
            <div className="space-y-1">
              {data.topHolders.map((h) => (
                <div key={h.name} className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded text-sm">
                  <span className="truncate">{h.name}</span>
                  <span className="text-muted-foreground flex-shrink-0">{h.ownershipPct.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </>
        )}

        {!data.topHolders && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            Individual holder names are visible to major and board-tier investors only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── My Documents ──────────────────────────────────────────────────────
//
// Per-investor locker: executed agreements, side letters, K-1s,
// capital-call / distribution notices. Downloads go through a
// short-lived signed URL the server issues per request — we never
// hand the storage key to the browser.
function MyDocumentsSection({ companyId }: { companyId?: number }) {
  const { data: docs, isLoading } = trpc.investorPortal.documents.list.useQuery(
    companyId !== undefined ? { companyId } : undefined,
  );
  const downloadMutation = trpc.investorPortal.documents.downloadUrl.useMutation({
    onSuccess: ({ url }) => {
      // Open in a new tab — keeps the portal context, lets the browser
      // handle PDF preview / save-as for any other mime type.
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => toast.error(err.message),
  });

  const labelFor = (cat: string) => {
    switch (cat) {
      case "agreement": return "Agreement";
      case "side_letter": return "Side Letter";
      case "k1": return "K-1";
      case "capital_call": return "Capital Call";
      case "distribution": return "Distribution";
      default: return "Document";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">My documents</CardTitle>
        </div>
        <CardDescription>
          Executed agreements, side letters, tax forms, and capital-call / distribution notices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !docs || docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents have been shared with you yet. The team will upload your executed
            agreements and tax documents here as they're available.
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const pendingForThisRow = downloadMutation.isPending
                && (downloadMutation.variables as { id?: number } | undefined)?.id === d.id;
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <Badge variant="outline" className="flex-shrink-0">{labelFor(d.category)}</Badge>
                    </div>
                    {d.description && (
                      <p className="text-xs text-muted-foreground truncate">{d.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Added {d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-US") : "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingForThisRow}
                    onClick={() => downloadMutation.mutate({ id: d.id, companyId })}
                  >
                    {pendingForThisRow ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Download
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Profile & Preferences ─────────────────────────────────────────────
//
// Investor self-services: contact email, mailing address (for K-1s),
// payment-preference note, and accreditation re-attestation. Edits use
// optimistic-ish form state — we don't reset on every keystroke from
// the server.
function ProfileSection({ companyId }: { companyId?: number }) {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.investorPortal.profile.get.useQuery(
    companyId !== undefined ? { companyId } : undefined,
  );
  const [draft, setDraft] = useState<{
    name: string; email: string; address: string;
    mailingAddress: string; paymentPreference: string;
  } | null>(null);
  const [editing, setEditing] = useState(false);

  const updateMutation = trpc.investorPortal.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      setEditing(false);
      utils.investorPortal.profile.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const reAttest = trpc.investorPortal.profile.reAttestAccreditation.useMutation({
    onSuccess: () => {
      toast.success("Accreditation status recorded");
      utils.investorPortal.profile.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !profile) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const startEdit = () => {
    setDraft({
      name: profile.name ?? "",
      email: profile.email ?? "",
      address: profile.address ?? "",
      mailingAddress: profile.mailingAddress ?? "",
      paymentPreference: profile.paymentPreference ?? "",
    });
    setEditing(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Profile &amp; preferences</CardTitle>
        </div>
        <CardDescription>
          Keep your contact, mailing, and payment info up to date so we send K-1s and
          distributions to the right place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing || !draft ? (
          <>
            <ReadOnlyField label="Name" value={profile.name} />
            <ReadOnlyField label="Email" value={profile.email} />
            <ReadOnlyField label="Legal address" value={profile.address} multiline />
            <ReadOnlyField label="Mailing address (for K-1s)" value={profile.mailingAddress} multiline />
            <ReadOnlyField label="Payment preference" value={profile.paymentPreference} multiline />
            <div className="pt-2 flex justify-end">
              <Button size="sm" onClick={startEdit}>Edit</Button>
            </div>
          </>
        ) : (
          <>
            <FormField label="Name">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </FormField>
            <FormField label="Legal address">
              <Textarea
                rows={2}
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </FormField>
            <FormField
              label="Mailing address (for K-1s)"
              hint="Where to send paper tax documents — leave blank to use the legal address."
            >
              <Textarea
                rows={2}
                value={draft.mailingAddress}
                onChange={(e) => setDraft({ ...draft, mailingAddress: e.target.value })}
              />
            </FormField>
            <FormField
              label="Payment preference"
              hint="A short note describing how you'd like to receive distributions — e.g. 'ACH preferred — contact admin to share routing details over a secure channel.' We don't store routing/account numbers in the portal."
            >
              <Textarea
                rows={3}
                value={draft.paymentPreference}
                onChange={(e) => setDraft({ ...draft, paymentPreference: e.target.value })}
              />
            </FormField>
            <div className="pt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setDraft(null); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ ...draft, companyId })}
              >
                {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          </>
        )}

        <div className="border-t pt-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Accreditation
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <p>
                Status:{" "}
                <span className="font-medium">
                  {profile.accreditedInvestor ? "Accredited" : "Not on file"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {profile.accreditedReAttestedAt
                  ? `Last re-attested ${new Date(profile.accreditedReAttestedAt).toLocaleDateString("en-US")}`
                  : "Has not been re-attested yet."}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={reAttest.isPending}
              onClick={() => reAttest.mutate({ accredited: true, companyId })}
            >
              {reAttest.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Re-attest
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyField({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm ${value ? "" : "text-muted-foreground italic"} ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function FormField({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function TrendPanel({
  title,
  items,
  currency,
  tone,
}: {
  title: string;
  items: Array<{ label: string; amount: number }>;
  currency: string;
  tone: "positive" | "negative";
}) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  const color = tone === "positive" ? "bg-emerald-500" : "bg-red-500";
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</p>
      <div className="space-y-2">
        {items.map((item) => {
          const pct = (item.amount / max) * 100;
          return (
            <div key={item.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="text-xs font-medium">{formatCurrency(item.amount, currency)}</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

