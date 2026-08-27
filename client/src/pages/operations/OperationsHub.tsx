import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { visibleOperationsSections } from "./operationsNav";

/**
 * Operations overview.
 *
 * This page used to stack the Inventory, Manufacturing, and Procurement hubs
 * on top of each other — three full pages, three competing <h1>s, everything
 * mounted at once, and no way to get to the ~20 pages none of them linked to.
 * It is now what an overview should be: the exceptions worth acting on, then a
 * map of every page underneath.
 */
export default function OperationsHub() {
  const { user } = useAuth();
  const sections = visibleOperationsSections(user?.role);

  const inventory = trpc.inventory.list.useQuery();
  const purchaseOrders = trpc.purchaseOrders.list.useQuery();
  const workOrders = trpc.workOrders.list.useQuery();
  const cycleCounts = trpc.cycleCounts.list.useQuery();

  const belowReorder = (inventory.data ?? []).filter((row) => {
    if (row.reorderLevel == null) return false;
    return Number(row.quantity) <= Number(row.reorderLevel);
  }).length;

  const openPos = (purchaseOrders.data ?? []).filter((po) =>
    ["draft", "sent", "confirmed", "partial"].includes(po.status),
  ).length;

  const openWos = (workOrders.data ?? []).filter((wo) =>
    ["draft", "scheduled", "in_progress"].includes(wo.status),
  ).length;

  const countsToReview = (cycleCounts.data ?? []).filter(
    (count) => count.status === "pending_review",
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Below reorder level"
          value={belowReorder}
          loading={inventory.isLoading}
          href="/operations/inventory"
          alert={belowReorder > 0}
        />
        <Kpi
          label="Open purchase orders"
          value={openPos}
          loading={purchaseOrders.isLoading}
          href="/operations/purchase-orders"
        />
        <Kpi
          label="Open work orders"
          value={openWos}
          loading={workOrders.isLoading}
          href="/operations/work-orders"
        />
        <Kpi
          label="Counts awaiting review"
          value={countsToReview}
          loading={cycleCounts.isLoading}
          href="/operations/cycle-counts"
          alert={countsToReview > 0}
        />
      </div>

      {sections.map((section) => (
        <section key={section.id} className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold tracking-[-0.02em] flex items-center gap-1.5">
              <section.icon className="h-4 w-4 text-muted-foreground" />
              {section.label}
            </h2>
            <p className="text-xs text-muted-foreground">{section.blurb}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.items.map((item) => (
              <Link key={item.path} href={item.path}>
                <Card className="cursor-pointer hover:border-primary/30 transition-colors h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.desc}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  href,
  alert = false,
}: {
  label: string;
  value: number;
  loading: boolean;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:border-primary/30 transition-colors h-full">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            {alert && value > 0 && (
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            )}
            {label}
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              value
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
