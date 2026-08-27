import {
  ArrowRightLeft,
  Boxes,
  Brain,
  Calculator,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileText,
  FlaskConical,
  Gauge,
  Grid3x3,
  GitCompare,
  Handshake,
  Layers,
  LineChart,
  MapPin,
  Package,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  ScanLine,
  ShoppingCart,
  Split,
  Star,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

/**
 * Operations information architecture — the single source of truth.
 *
 * The sidebar is frozen (see CLAUDE.md), so Operations gets exactly one nav
 * entry for ~30 pages. Everything below that entry is navigated from here:
 * `OperationsLayout` renders the section tabs, `OperationsHub` renders the
 * overview cards, and `OperationsSection` mounts the routes. Add a page in one
 * place and it becomes reachable in all three.
 *
 * `operationsNav.test.ts` enforces that every section path resolves to a real
 * item and that no page is orphaned.
 */

export interface OperationsItem {
  label: string;
  path: string;
  /** What you come to this page to do — shown under the label on the overview. */
  desc: string;
  icon: LucideIcon;
  /** Omitted = visible to every role that can see Operations at all. */
  roles?: readonly string[];
}

export interface OperationsSection {
  id: string;
  label: string;
  /** Where the section tab lands — always one of its own items' paths. */
  path: string;
  icon: LucideIcon;
  /** The question this section answers, in the user's words. */
  blurb: string;
  items: readonly OperationsItem[];
}

export const OPERATIONS_ROOT = "/operations";

/**
 * Pages that live under /operations/* but are NOT part of Operations.
 *
 * The locked sidebar lists these as its own top-level destinations
 * (Command Center → Email Inbox, Operations → Logistics), so wrapping them in
 * the Operations shell would put a misleading tab bar above them.
 */
export const OPERATIONS_SHELL_EXCLUDED: readonly string[] = [
  "/operations/email-inbox",
  "/operations/logistics-hub",
];

export const OPERATIONS_SECTIONS: readonly OperationsSection[] = [
  {
    id: "inventory",
    label: "Inventory",
    path: "/operations/inventory-hub",
    icon: Boxes,
    blurb: "What do we have, where is it, and is the number right?",
    items: [
      {
        label: "Inventory Overview",
        path: "/operations/inventory-hub",
        desc: "Stock position, inbound shipments, and low-stock alerts",
        icon: Boxes,
      },
      {
        label: "Stock on Hand",
        path: "/operations/inventory",
        desc: "Quantity by product and warehouse, with adjustments",
        icon: Package,
      },
      {
        label: "Products",
        path: "/operations/products",
        desc: "Product master data, SKUs, and reorder levels",
        icon: PackageSearch,
      },
      {
        label: "Lots & Traceability",
        path: "/operations/core",
        desc: "Lot-level balances and movement history",
        icon: Layers,
      },
      {
        label: "Cycle Counts",
        path: "/operations/cycle-counts",
        desc: "Count sheets, variance review, and approval",
        icon: ClipboardCheck,
      },
      {
        label: "Expiry & Picking",
        path: "/operations/expiry",
        desc: "What is about to expire, and FEFO lot selection for shipments",
        icon: CalendarClock,
      },
      {
        label: "Transfers",
        path: "/operations/transfers",
        desc: "Move stock between warehouses",
        icon: ArrowRightLeft,
      },
      {
        label: "Warehouses",
        path: "/operations/locations",
        desc: "Warehouse records and addresses",
        icon: MapPin,
      },
      {
        label: "Zones & Bins",
        path: "/operations/bins",
        desc: "Where stock sits inside a warehouse, and the pick walk order",
        icon: Grid3x3,
      },
      {
        label: "Serial Numbers",
        path: "/operations/serials",
        desc: "Unit-level tracking and per-unit traceability",
        icon: ScanLine,
      },
      {
        label: "Costing & Valuation",
        path: "/operations/inventory-costing",
        desc: "Unit cost, landed cost, and inventory value",
        icon: Calculator,
      },
      {
        label: "Reconciliation",
        path: "/operations/reconciliation",
        desc: "Where book quantity and physical stock disagree",
        icon: GitCompare,
      },
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    path: "/operations/manufacturing-hub",
    icon: Factory,
    blurb: "What are we making, and do we have what it takes to make it?",
    items: [
      {
        label: "Production Overview",
        path: "/operations/manufacturing-hub",
        desc: "Open work orders and production status",
        icon: Factory,
      },
      {
        label: "Work Orders",
        path: "/operations/work-orders",
        desc: "Schedule, start, and complete production runs",
        icon: ClipboardList,
      },
      {
        label: "Production Batches",
        path: "/operations/production-batches",
        desc: "Batch records and yields",
        icon: Boxes,
      },
      {
        label: "Bills of Materials",
        path: "/operations/bom",
        desc: "What goes into each finished product",
        icon: Layers,
      },
      {
        label: "Recipes",
        path: "/operations/recipes",
        desc: "Formulations and process steps",
        icon: FlaskConical,
        // Trade secrets — admin + ops only, matching the sidebar's own gate.
        roles: ["admin", "ops"],
      },
      {
        label: "Raw Materials",
        path: "/operations/raw-materials",
        desc: "Input material master data and stock",
        icon: Warehouse,
      },
      {
        label: "Ingredients",
        path: "/operations/ingredients",
        desc: "Ingredient specifications and costs",
        icon: FlaskConical,
      },
      {
        label: "Manufacturing AI",
        path: "/operations/manufacturing-ai",
        desc: "Assisted planning and production questions",
        icon: Brain,
      },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    path: "/operations/procurement-hub",
    icon: ShoppingCart,
    blurb: "What are we buying, from whom, and did it arrive?",
    items: [
      {
        label: "Procurement Overview",
        path: "/operations/procurement-hub",
        desc: "RFQs, open POs, and supplier activity",
        icon: ShoppingCart,
      },
      {
        label: "Purchase Orders",
        path: "/operations/purchase-orders",
        desc: "Raise, send, and track purchase orders",
        icon: FileText,
      },
      {
        label: "Receiving",
        path: "/operations/receiving",
        desc: "Receive against a PO and post stock",
        icon: PackageCheck,
      },
      {
        label: "Inbound Shipments",
        path: "/operations/shipments",
        desc: "Shipments in transit and their documents",
        icon: Truck,
      },
      {
        label: "Vendors",
        path: "/operations/vendors",
        desc: "Supplier records, terms, and contacts",
        icon: Users,
      },
      {
        label: "Negotiations",
        path: "/operations/vendor-negotiations",
        desc: "Price and term negotiations in flight",
        icon: Handshake,
      },
      {
        label: "Supplier Scoring",
        path: "/operations/supplier-scoring",
        desc: "On-time delivery and quality performance",
        icon: Star,
      },
      {
        label: "Material Supply",
        path: "/operations/material-supply",
        desc: "Coverage of raw material demand against supply",
        icon: Warehouse,
      },
      {
        label: "Document Import",
        path: "/operations/document-import",
        desc: "Pull POs and invoices out of supplier documents",
        icon: FileText,
      },
    ],
  },
  {
    id: "planning",
    label: "Planning",
    path: "/operations/inventory-planning",
    icon: LineChart,
    blurb: "What will we need, and where should it go?",
    items: [
      {
        label: "Inventory Planning",
        path: "/operations/inventory-planning",
        desc: "Forecast, PO, and freight status on one board",
        icon: Gauge,
      },
      {
        label: "Replenishment",
        path: "/operations/replenishment",
        desc: "What to reorder and how much, from demand and lead time",
        icon: RefreshCw,
      },
      {
        label: "Demand Forecast",
        path: "/operations/forecasting",
        desc: "Projected demand by product and period",
        icon: LineChart,
      },
      {
        label: "Channel Allocations",
        path: "/operations/allocations",
        desc: "Split available stock across sales channels",
        icon: Split,
      },
    ],
  },
];

/** Every item across every section, flattened. */
export function allOperationsItems(): OperationsItem[] {
  return OPERATIONS_SECTIONS.flatMap((section) => section.items);
}

/** Sections filtered to what `role` may see, dropping any left empty. */
export function visibleOperationsSections(
  role: string | undefined,
): OperationsSection[] {
  return OPERATIONS_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.roles || (role ? item.roles.includes(role) : false),
    ),
  })).filter((section) => section.items.length > 0);
}

/**
 * The section a path belongs to, or undefined for the overview and for pages
 * excluded from the shell. Detail routes (`/operations/work-orders/123`) match
 * their parent so the tab bar stays put as you drill in.
 */
export function sectionForPath(path: string): OperationsSection | undefined {
  const candidates = OPERATIONS_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({ section, path: item.path })),
  )
    // Longest first, so /operations/bom/1 prefers /operations/bom over a
    // shorter prefix that also happens to match.
    .sort((a, b) => b.path.length - a.path.length);

  const hit = candidates.find(
    (candidate) => path === candidate.path || path.startsWith(`${candidate.path}/`),
  );
  return hit?.section;
}
