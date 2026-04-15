import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, Receipt, FileCheck, ClipboardList } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const Employees = lazy(() => import("./Employees"));
const TimeTracking = lazy(() => import("./TimeTracking"));
const Payroll = lazy(() => import("./Payroll"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function HRHub() {
  const [tab, setTab] = useState("team");

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-8 w-8" />
          HR
        </h1>
        <p className="text-muted-foreground mt-1">
          Team management, time tracking, payments, and onboarding
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="team" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="time-tracking" className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Time Tracking
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1.5">
            <Receipt className="h-4 w-4" />
            Payments & 1099s
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Onboarding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <Suspense fallback={fallback}><Employees /></Suspense>
        </TabsContent>
        <TabsContent value="time-tracking">
          <Suspense fallback={fallback}><TimeTracking /></Suspense>
        </TabsContent>
        <TabsContent value="payments">
          <Suspense fallback={fallback}><Payroll /></Suspense>
        </TabsContent>
        <TabsContent value="onboarding">
          <div className="rounded-lg border bg-card p-8 text-center">
            <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-1">Onboarding Checklists</h3>
            <p className="text-sm text-muted-foreground">
              Employee onboarding workflows coming soon.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
