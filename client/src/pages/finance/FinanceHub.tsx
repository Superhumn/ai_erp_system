import { lazy, Suspense, useState, type ReactNode } from "react";
import { DollarSign, Loader2, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ── 1 · CFO Dashboard (command center — always first) ──────────
const CFODashboard = lazy(() => import("./CFODashboard"));
// ── 2 · Model vs Actual ────────────────────────────────────────
const ModelVsActual = lazy(() =>
  import("./FinancialReports").then((m) => ({ default: m.ModelVsActual })),
);
// ── 3 · Financials / 5-year projections + margin trends ────────
const FinancialsCharts = lazy(() =>
  import("./FinancialReports").then((m) => ({ default: m.FinancialsCharts })),
);
// ── 4 · Actions / CFO Strategy ─────────────────────────────────
const CFOStrategy = lazy(() =>
  import("./CFODashboard").then((m) => ({ default: m.CFOStrategy })),
);
// ── 5 · Reports (collapsible) ──────────────────────────────────
const ReportsSection = lazy(() =>
  import("./FinancialReports").then((m) => ({ default: m.ReportsSection })),
);
// ── 6 · Transactions + Chart of Accounts (collapsible) ─────────
const AccountsAndTransactions = lazy(() => import("./AccountsAndTransactions"));
// ── 7 · KPI Goals (collapsible) ────────────────────────────────
const KpiGoalsSection = lazy(() =>
  import("./FinancialReports").then((m) => ({ default: m.KpiGoalsSection })),
);
// ── 8 · Banking (collapsible) ──────────────────────────────────
const BankingSection = lazy(() =>
  import("./FinancialReports").then((m) => ({ default: m.BankingSection })),
);
// ── 9 · R&D Tax Credit (collapsible) ───────────────────────────
const RdTaxCredit = lazy(() => import("./RdTaxCredit"));
// ── 10 · Product Costing & COGS (collapsible) ──────────────────
const Costing = lazy(() => import("./Costing"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const divider = <div className="border-t border-border/40" />;

// Reference / set-and-check sections collapse by default so the page
// always opens on the CFO Dashboard and the analytical flow above.
function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left group">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3">
        <Suspense fallback={fallback}>{children}</Suspense>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function FinanceHub() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
        <DollarSign className="h-4 w-4" />
        Finance
      </h1>

      {/* 1 · CFO Dashboard — the reason a finance user visits this page */}
      <Suspense fallback={fallback}><CFODashboard /></Suspense>

      {divider}

      {/* 2 · Model vs Actual — are we on track vs plan? */}
      <Suspense fallback={fallback}><ModelVsActual /></Suspense>

      {divider}

      {/* 3 · Financials — 5-year projections + margin trends */}
      <Suspense fallback={fallback}><FinancialsCharts /></Suspense>

      {divider}

      {/* 4 · Actions / CFO Strategy — what should I do about all this? */}
      <Suspense fallback={fallback}><CFOStrategy /></Suspense>

      {divider}

      {/* 5 · Reports — on-demand deep dives */}
      <CollapsibleSection
        title="Reports"
        subtitle="On-demand P&L, balance sheet, cash flow, and more"
      >
        <ReportsSection />
      </CollapsibleSection>

      {divider}

      {/* 6 · Transactions + Chart of Accounts — the raw QB ledger */}
      <CollapsibleSection
        title="Transactions & Chart of Accounts"
        subtitle="Reference / audit views — the raw QuickBooks ledger"
      >
        <AccountsAndTransactions />
      </CollapsibleSection>

      {divider}

      {/* 7 · KPI Goals — set-and-check */}
      <CollapsibleSection
        title="KPI Goals"
        subtitle="Set targets once, then check progress"
      >
        <KpiGoalsSection />
      </CollapsibleSection>

      {divider}

      {/* 8 · Banking — supplemental account detail */}
      <CollapsibleSection
        title="Banking"
        subtitle="Account balances (summarized in the dashboard) and connections"
      >
        <BankingSection />
      </CollapsibleSection>

      {divider}

      {/* 9 · R&D Tax Credit — specialized, infrequent */}
      <CollapsibleSection
        title="R&D Tax Credit"
        subtitle="Specialized — calculate eligible credits"
      >
        <RdTaxCredit />
      </CollapsibleSection>

      {divider}

      {/* 10 · Product Costing & COGS — profitability, valuation, COGS */}
      <CollapsibleSection
        title="Product Costing & COGS"
        subtitle="Profitability, inventory valuation, landed-cost allocation"
      >
        <Costing />
      </CollapsibleSection>
    </div>
  );
}
