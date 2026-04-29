import { lazy, Suspense } from "react";
import { DollarSign } from "lucide-react";
import { Loader2 } from "lucide-react";

const AccountsAndTransactions = lazy(() => import("./AccountsAndTransactions"));
const CFODashboard = lazy(() => import("./CFODashboard"));
const FinancialReports = lazy(() => import("./FinancialReports"));
const RdTaxCredit = lazy(() => import("./RdTaxCredit"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function FinanceHub() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
        <DollarSign className="h-4 w-4" />
        Finance
      </h1>

      <Suspense fallback={fallback}><AccountsAndTransactions /></Suspense>

      <div className="border-t border-border/40" />

      <Suspense fallback={fallback}><CFODashboard /></Suspense>

      <div className="border-t border-border/40" />

      <Suspense fallback={fallback}><FinancialReports /></Suspense>

      <div className="border-t border-border/40" />

      <Suspense fallback={fallback}><RdTaxCredit /></Suspense>
    </div>
  );
}
