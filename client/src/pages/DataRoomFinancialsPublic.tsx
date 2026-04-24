import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, TrendingUp, TrendingDown, Wallet, Clock, Receipt, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { NdaSigningGate } from "./DataRoomPublic";

// Formats a number as a currency figure. Defaults to USD since
// `computeLiveFinancials` also hands back USD today; if we ever start
// honoring multi-currency this will need to be driven by the response.
function formatCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatRunway(months: number | null): string {
  if (months === null) return "—";
  if (months <= 0) return "0 mo";
  if (months >= 36) return "36+ mo";
  return `${months.toFixed(1)} mo`;
}

export default function DataRoomFinancialsPublic() {
  const params = useParams<{ code: string }>();
  const linkCode = params.code || "";

  // Access gate state — mirrors DataRoomPublic so the user only has to sign
  // in once per session if they're hopping between /dr/:code and
  // /dr/:code/financials.
  const [accessGranted, setAccessGranted] = useState(false);
  const [password, setPassword] = useState("");
  const [visitorInfo, setVisitorInfo] = useState({ email: "", name: "", company: "" });
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [dataRoomId, setDataRoomId] = useState<number | null>(null);
  const [visitorId, setVisitorId] = useState<number | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);

  const accessMutation = trpc.dataRoom.public.accessByLink.useMutation({
    onSuccess: (data) => {
      if (data.requiresPassword) {
        setRequiresPassword(true);
        return;
      }
      if (data.requiresInfo) {
        setRequiredFields(data.requiredFields || []);
        return;
      }
      if (data.dataRoomId) {
        setDataRoomId(data.dataRoomId);
        setVisitorId(data.visitorId);
        setAccessGranted(true);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  // Room shell — used for NDA gating + branding on the financials page.
  // We deliberately reuse `getContent` rather than stuffing more fields into
  // `accessByLink` so the existing access-gate contract is unchanged.
  const { data: content } = trpc.dataRoom.public.getContent.useQuery(
    {
      dataRoomId: dataRoomId!,
      visitorId: visitorId || undefined,
      visitorEmail: visitorInfo.email || undefined,
    },
    { enabled: accessGranted && !!dataRoomId },
  );

  const needsNda = !!content?.room.requiresNda && !ndaAccepted;
  // The NDA signature has to be tied to a visitor row so the server can
  // verify `visitor.ndaAcceptedAt` on subsequent `getFinancials` calls.
  // `accessByLink` only creates a visitor when an email is provided, so
  // for NDA-required rooms that don't otherwise collect email (e.g. the
  // link is fully anonymous) we force an email prompt before signing.
  const needsEmailForNda = needsNda && visitorId === null;

  const {
    data: financialsData,
    isLoading: financialsLoading,
    error: financialsError,
  } = trpc.dataRoom.public.getFinancials.useQuery(
    { linkCode, visitorId: visitorId || undefined },
    { enabled: accessGranted && !needsNda && !needsEmailForNda, retry: false },
  );

  // Initial access attempt
  useEffect(() => {
    if (linkCode) {
      accessMutation.mutate({ linkCode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode]);

  const handleAccessSubmit = () => {
    accessMutation.mutate({
      linkCode,
      password: password || undefined,
      visitorInfo: {
        email: visitorInfo.email || undefined,
        name: visitorInfo.name || undefined,
        company: visitorInfo.company || undefined,
      },
    });
  };

  const brandColor = content?.room.brandingColor || content?.room.brandColor || undefined;

  // ---------------------------------------------------------------------------
  // RENDER: Access Gate
  // ---------------------------------------------------------------------------
  if (!accessGranted) {
    const showGateForm = requiresPassword || requiredFields.length > 0;
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #0a0c14 0%, #111827 50%, #0f172a 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: brandColor
              ? `radial-gradient(ellipse 60% 50% at 50% 40%, ${brandColor}12 0%, transparent 70%)`
              : "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(99,102,241,0.06) 0%, transparent 70%)",
          }}
        />
        <div className="w-full max-w-md relative z-10 dr-fade-in">
          <div className="text-center mb-8">
            <div
              className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-5 border"
              style={{
                background: brandColor ? `${brandColor}18` : "rgba(99,102,241,0.1)",
                borderColor: brandColor ? `${brandColor}30` : "rgba(99,102,241,0.2)",
              }}
            >
              <Shield className="h-7 w-7" style={{ color: brandColor || "#818cf8" }} />
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Live Financials</h1>
            <p className="text-sm text-gray-400 mt-2">
              {requiresPassword
                ? "Enter the password to continue"
                : requiredFields.length > 0
                  ? "Please provide your information to continue"
                  : "Verifying access..."}
            </p>
          </div>

          {showGateForm && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6 space-y-5 dr-fade-in">
              {requiresPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300 text-sm">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}
              {requiredFields.includes("email") && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300 text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={visitorInfo.email}
                    onChange={(e) => setVisitorInfo({ ...visitorInfo, email: e.target.value })}
                    placeholder="you@company.com"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}
              {requiredFields.includes("name") && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-300 text-sm">Name</Label>
                  <Input
                    id="name"
                    value={visitorInfo.name}
                    onChange={(e) => setVisitorInfo({ ...visitorInfo, name: e.target.value })}
                    placeholder="Your name"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}
              {requiredFields.includes("company") && (
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-gray-300 text-sm">Company</Label>
                  <Input
                    id="company"
                    value={visitorInfo.company}
                    onChange={(e) => setVisitorInfo({ ...visitorInfo, company: e.target.value })}
                    placeholder="Your company"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}
              <Button
                className="w-full h-11 rounded-xl font-medium text-sm"
                style={brandColor ? { background: brandColor, color: "#fff" } : undefined}
                onClick={handleAccessSubmit}
                disabled={accessMutation.isPending}
              >
                {accessMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "View Financials"
                )}
              </Button>
            </div>
          )}

          {!showGateForm && accessMutation.isPending && (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: brandColor || "#818cf8" }} />
              <span className="text-sm">Verifying access...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Email capture before NDA (when the link didn't already collect it)
  // ---------------------------------------------------------------------------
  if (needsEmailForNda) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "linear-gradient(145deg, #0a0c14 0%, #111827 50%, #0f172a 100%)" }}
      >
        <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
          <h2 className="text-lg font-semibold text-white mb-2">One more step</h2>
          <p className="text-sm text-gray-400 mb-4">
            Please share the email the NDA should be signed under. We attach
            it to your visit so you only have to sign once.
          </p>
          <input
            type="email"
            autoFocus
            value={visitorInfo.email}
            onChange={(e) => setVisitorInfo({ ...visitorInfo, email: e.target.value })}
            placeholder="you@company.com"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm mb-3"
          />
          <button
            type="button"
            disabled={!visitorInfo.email.includes("@") || accessMutation.isPending}
            onClick={() => {
              // Re-run accessByLink with the collected email so the server
              // issues us a visitor row that NDA signing can attach to.
              accessMutation.mutate({
                linkCode,
                password: password || undefined,
                visitorInfo: {
                  email: visitorInfo.email,
                  name: visitorInfo.name || undefined,
                  company: visitorInfo.company || undefined,
                },
              });
            }}
            className="w-full py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium"
          >
            Continue to NDA
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: NDA Gate (delegates to the same component the document page uses)
  // ---------------------------------------------------------------------------
  if (needsNda) {
    return (
      <NdaSigningGate
        dataRoomId={dataRoomId!}
        visitorId={visitorId}
        visitorEmail={visitorInfo.email}
        visitorName={visitorInfo.name}
        visitorCompany={visitorInfo.company}
        ndaText={content?.room.ndaText ?? null}
        onSigned={() => setNdaAccepted(true)}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Financials page
  // ---------------------------------------------------------------------------
  const fin = financialsData?.financials;
  const room = financialsData?.room;
  const asOfLabel = fin ? new Date(fin.asOf).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) : "";

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: "linear-gradient(145deg, #0a0c14 0%, #111827 50%, #0f172a 100%)" }}
    >
      {/* Watermark overlay — render only when the room enables it AND we
          have an email to watermark against. */}
      {content?.watermark && (
        <div
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
          style={{ opacity: content.watermark.opacity }}
        >
          {content.watermark.position === "tiled" && content.watermark.tiledPositions ? (
            content.watermark.tiledPositions.slice(0, 50).map((pos, i) => (
              <div
                key={i}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  transform: `rotate(${content.watermark!.rotation}deg)`,
                  fontSize: `${content.watermark!.fontSize}px`,
                  color: content.watermark!.color,
                  fontFamily: "Arial, sans-serif",
                  userSelect: "none",
                }}
              >
                {content.watermark!.text}
              </div>
            ))
          ) : null}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/[0.06] relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {(room?.brandingLogo || room?.logoUrl) && (
                <img src={room.brandingLogo || room.logoUrl!} alt="Logo" className="h-8 w-auto" />
              )}
              <div className="min-w-0">
                {room?.brandingCompanyName && (
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-0.5"
                    style={{ color: brandColor || "#818cf8" }}
                  >
                    {room.brandingCompanyName}
                  </p>
                )}
                <h1 className="text-lg font-semibold text-white tracking-tight truncate">
                  {room?.name || content?.room.name || "Live Financials"}
                </h1>
                {asOfLabel && (
                  <p className="text-xs text-gray-500 mt-0.5">Live — updated {asOfLabel}</p>
                )}
              </div>
            </div>
            <a
              href={`/dr/${linkCode}`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to data room</span>
            </a>
          </div>
        </div>
        <div
          className="h-[1px]"
          style={{ background: brandColor ? `linear-gradient(90deg, transparent, ${brandColor}40, transparent)` : undefined }}
        />
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {financialsLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin mb-3" style={{ color: brandColor || "#818cf8" }} />
            <p className="text-sm">Loading live financials…</p>
          </div>
        )}

        {financialsError && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
            {financialsError.message}
          </div>
        )}

        {fin && (
          <div className="space-y-8 dr-fade-in">
            {/* Headline KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                icon={<Wallet className="h-4 w-4" />}
                label="Cash on hand"
                value={formatCurrency(fin.cash, fin.currency)}
                brandColor={brandColor}
              />
              <KpiCard
                icon={<TrendingDown className="h-4 w-4" />}
                label="Monthly burn (avg, 3mo)"
                value={formatCurrency(fin.avgMonthlyBurn, fin.currency)}
                brandColor={brandColor}
              />
              <KpiCard
                icon={<Clock className="h-4 w-4" />}
                label="Runway"
                value={formatRunway(fin.runwayMonths)}
                brandColor={brandColor}
              />
              {fin.arTotal !== null ? (
                <KpiCard
                  icon={<Receipt className="h-4 w-4" />}
                  label="Outstanding AR"
                  value={formatCurrency(fin.arTotal, fin.currency)}
                  brandColor={brandColor}
                />
              ) : (
                <KpiCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Last month revenue"
                  value={formatCurrency(
                    fin.last3MoRevenue[fin.last3MoRevenue.length - 1]?.revenue ?? 0,
                    fin.currency,
                  )}
                  brandColor={brandColor}
                />
              )}
            </div>

            {/* Revenue & burn breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendCard
                title="Revenue — last 3 months"
                items={fin.last3MoRevenue.map((m) => ({ label: m.label, amount: m.revenue }))}
                currency={fin.currency}
                brandColor={brandColor}
                tone="positive"
              />
              <TrendCard
                title="Burn — last 3 months"
                items={fin.last3MoBurn.map((m) => ({ label: m.label, amount: m.burn }))}
                currency={fin.currency}
                brandColor={brandColor}
                tone="negative"
              />
            </div>

            <p className="text-xs text-gray-500 pt-4 border-t border-white/[0.04]">
              Figures are computed live from the issuer&rsquo;s ERP at the time shown above.
              This page is intentionally narrow — for full financial statements, see the
              documents shared in this data room.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  brandColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  brandColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-3">
        <span style={{ color: brandColor || "#818cf8" }}>{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold text-white tracking-tight">{value}</p>
    </div>
  );
}

function TrendCard({
  title,
  items,
  currency,
  brandColor,
  tone,
}: {
  title: string;
  items: Array<{ label: string; amount: number }>;
  currency: string;
  brandColor?: string;
  tone: "positive" | "negative";
}) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  const barColor = tone === "positive" ? (brandColor || "#4ade80") : "#f87171";
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">{title}</p>
      <div className="space-y-3">
        {items.map((item) => {
          const pct = (item.amount / max) * 100;
          return (
            <div key={item.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm text-gray-300">{item.label}</span>
                <span className="text-sm font-medium text-white">
                  {formatCurrency(item.amount, currency)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
