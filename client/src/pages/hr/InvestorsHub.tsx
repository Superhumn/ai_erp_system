import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileBarChart, Megaphone, Sparkles } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const EquityReports = lazy(() => import("./EquityReports"));
const InvestorUpdates = lazy(() => import("../InvestorUpdates"));
const DashboardGenerator = lazy(() => import("./DashboardGenerator"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function InvestorsHub() {
  const [tab, setTab] = useState("captable");

  return (
    <div className="space-y-2 animate-fade-in">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="captable" className="flex items-center gap-1.5">
            <FileBarChart className="h-3.5 w-3.5" />
            Cap Table
          </TabsTrigger>
          <TabsTrigger value="updates" className="flex items-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5" />
            Investor Updates
          </TabsTrigger>
          <TabsTrigger value="generator" className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Dashboard Generator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="captable">
          <Suspense fallback={fallback}><EquityReports /></Suspense>
        </TabsContent>
        <TabsContent value="updates">
          <Suspense fallback={fallback}><InvestorUpdates /></Suspense>
        </TabsContent>
        <TabsContent value="generator">
          <Suspense fallback={fallback}><DashboardGenerator /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
