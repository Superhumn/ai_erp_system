import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Wallet, Clock, Receipt, LineChart, Megaphone, Shield } from "lucide-react";

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
  const { data: me, isLoading: meLoading, error: meError } = trpc.investorPortal.me.useQuery();
  const { data: fin, isLoading: finLoading } = trpc.investorPortal.financials.useQuery();
  const { data: updates } = trpc.investorPortal.updates.useQuery();

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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investor Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {me.stakeholder.name}. This is your always-current view of your
            equity position and the company's financials.
          </p>
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

