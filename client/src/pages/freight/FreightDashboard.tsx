import React, { lazy, Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Truck, FileText, Package, Plus, Loader2, Users,
} from "lucide-react";
import { Link } from "wouter";

const LogisticsHub = lazy(() => import("../operations/LogisticsHub"));

export default function FreightDashboard() {
  const { data: stats, isLoading } = trpc.freight.dashboardStats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-8 w-8" />
            Logistics
          </h1>
          <p className="text-muted-foreground text-sm">
            Shipments, customs, and freight management
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/freight/carriers">
            <Button variant="outline" size="sm">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Carriers
            </Button>
          </Link>
          <Link href="/freight/customs">
            <Button variant="outline" size="sm">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Customs
            </Button>
          </Link>
          <Link href="/freight/tracking">
            <Button variant="outline" size="sm">
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Track
            </Button>
          </Link>
          <Link href="/freight/rfqs">
            <Button size="sm">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New RFQ
            </Button>
          </Link>
        </div>
      </div>

      {/* Compact KPI bar */}
      <div className="flex items-center gap-5 flex-wrap text-sm border rounded-xl px-4 py-3 bg-card">
        <div>
          <span className="text-xs text-muted-foreground">Active RFQs</span>
          <div className="font-bold text-base">{stats?.activeRfqs || 0}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">In Transit</span>
          <div className="font-bold text-base">{stats?.activeBookings || 0}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Clearances</span>
          <div className="font-bold text-base">{stats?.pendingClearances || 0}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Carriers</span>
          <div className="font-bold text-base">{stats?.totalCarriers || 0}</div>
        </div>
      </div>

      {/* Shipments — the main view */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <LogisticsHub />
      </Suspense>
    </div>
  );
}
