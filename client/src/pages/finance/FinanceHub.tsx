import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, ArrowLeftRight, BarChart3, FlaskConical } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const Accounts = lazy(() => import("./Accounts"));
const Transactions = lazy(() => import("./Transactions"));
const FinancialReports = lazy(() => import("./FinancialReports"));
const RdTaxCredit = lazy(() => import("./RdTaxCredit"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function FinanceHub() {
  const [tab, setTab] = useState("accounts");

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <DollarSign className="h-8 w-8" />
          Finance
        </h1>
        <p className="text-muted-foreground mt-1">
          Accounts, transactions, reports, and R&D tax credits
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="accounts" className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4" />
            Transactions
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

        <TabsContent value="accounts">
          <Suspense fallback={fallback}><Accounts /></Suspense>
        </TabsContent>
        <TabsContent value="transactions">
          <Suspense fallback={fallback}><Transactions /></Suspense>
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
