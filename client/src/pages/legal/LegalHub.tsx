import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scale, FileText, Gavel } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const Contracts = lazy(() => import("./Contracts"));
const Disputes = lazy(() => import("./Disputes"));
const Documents = lazy(() => import("./Documents"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function LegalHub() {
  const [location] = useLocation();
  // Default tab based on route
  const defaultTab = location.includes("disputes") ? "cases" : location.includes("documents") ? "documents" : "contracts";
  const [tab, setTab] = useState(defaultTab);

  return (
    <div className="space-y-2 animate-fade-in">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <Scale className="h-4 w-4" />
            Legal
          </h1>
          <TabsList>
          <TabsTrigger value="contracts" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Contracts
          </TabsTrigger>
          <TabsTrigger value="cases" className="flex items-center gap-1.5">
            <Gavel className="h-4 w-4" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="contracts">
          <Suspense fallback={fallback}><Contracts /></Suspense>
        </TabsContent>
        <TabsContent value="cases">
          <Suspense fallback={fallback}><Disputes /></Suspense>
        </TabsContent>
        <TabsContent value="documents">
          <Suspense fallback={fallback}><Documents /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
