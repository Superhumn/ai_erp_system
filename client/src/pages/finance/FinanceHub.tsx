import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, BarChart3, FlaskConical, Zap } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AccountsAndTransactions = lazy(() => import("./AccountsAndTransactions"));
const FinancialReports = lazy(() => import("./FinancialReports"));
const CFODashboard = lazy(() => import("./CFODashboard"));
const RdTaxCredit = lazy(() => import("./RdTaxCredit"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function FinanceHub() {
  const [tab, setTab] = useState("ledger");

  return (
    <div className="space-y-2 animate-fade-in">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            Finance
          </h1>
          <TabsList>
          <TabsTrigger value="ledger" className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            Accounts & Transactions
          </TabsTrigger>
          <TabsTrigger value="cfo" className="flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            CFO
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="rd-tax-credit" className="flex items-center gap-1.5">
            <FlaskConical className="h-4 w-4" />
            R&D Tax Credit
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="ledger">
          <Suspense fallback={fallback}><AccountsAndTransactions /></Suspense>
        </TabsContent>
        <TabsContent value="cfo">
          <Suspense fallback={fallback}><CFODashboard /></Suspense>
        </TabsContent>
        <TabsContent value="reports">
          <Suspense fallback={fallback}><FinancialReports /></Suspense>
        </TabsContent>
        <TabsContent value="rd-tax-credit">
          <Suspense fallback={fallback}><RdTaxCredit /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
