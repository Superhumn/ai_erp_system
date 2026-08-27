import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";
import OperationsLayout from "./OperationsLayout";

const OperationsHub = lazy(() => import("./OperationsHub"));

// Inventory
const InventoryHub = lazy(() => import("./InventoryHub"));
const Inventory = lazy(() => import("./Inventory"));
const Products = lazy(() => import("./Products"));
const ProductDetail = lazy(() => import("./ProductDetail"));
const CoreOperations = lazy(() => import("./CoreOperations"));
const CycleCounts = lazy(() => import("./CycleCounts"));
const ExpiryAndPicking = lazy(() => import("./ExpiryAndPicking"));
const Transfers = lazy(() => import("./Transfers"));
const TransferDetail = lazy(() => import("./TransferDetail"));
const Locations = lazy(() => import("./Locations"));
const InventoryCosting = lazy(() => import("./InventoryCosting"));
const ReconciliationReport = lazy(() => import("./ReconciliationReport"));

// Manufacturing
const ManufacturingHub = lazy(() => import("./ManufacturingHub"));
const WorkOrders = lazy(() => import("./WorkOrders"));
const WorkOrderDetail = lazy(() => import("./WorkOrderDetail"));
const ProductionBatches = lazy(() => import("./ProductionBatches"));
const BOM = lazy(() => import("./BOM"));
const BOMDetail = lazy(() => import("./BOMDetail"));
const Recipes = lazy(() => import("./Recipes"));
const RawMaterials = lazy(() => import("./RawMaterials"));
const Ingredients = lazy(() => import("./Ingredients"));
const ManufacturingAI = lazy(() => import("./ManufacturingAI"));

// Procurement
const ProcurementHub = lazy(() => import("./ProcurementHub"));
const PurchaseOrders = lazy(() => import("./PurchaseOrders"));
const POReceiving = lazy(() => import("./POReceiving"));
const Shipments = lazy(() => import("./Shipments"));
const Vendors = lazy(() => import("./Vendors"));
const VendorNegotiations = lazy(() => import("./VendorNegotiations"));
const SupplierScoring = lazy(() => import("./SupplierScoring"));
const MaterialSupply = lazy(() => import("./MaterialSupply"));
const DocumentImport = lazy(() => import("./DocumentImport"));

// Planning
const InventoryPlanning = lazy(() => import("./InventoryPlanning"));
const Forecasting = lazy(() => import("./Forecasting"));
const Allocations = lazy(() => import("./Allocations"));

// Legacy — kept reachable so old links and bookmarks resolve.
const Profitability = lazy(() => import("./Profitability"));

function SectionLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Every Operations route, mounted inside the shared shell.
 *
 * These used to be 33 sibling routes in App.tsx with nothing linking them
 * together — 11 of them unreachable from any link in the app. Keeping them here
 * means the section tabs stay mounted as you move between and drill into pages,
 * and `operationsNav.ts` stays the one list that has to be updated.
 *
 * Detail routes are declared before their list route: wouter takes the first
 * match, so `/operations/products` would otherwise swallow `/products/:id`.
 */
export default function OperationsSection() {
  return (
    <OperationsLayout>
      <Suspense fallback={<SectionLoader />}>
        <Switch>
          {/* Inventory */}
          <Route path="/operations/inventory-hub" component={InventoryHub} />
          <Route path="/operations/inventory" component={Inventory} />
          <Route path="/operations/products/:id" component={ProductDetail} />
          <Route path="/operations/products" component={Products} />
          <Route path="/operations/core" component={CoreOperations} />
          <Route path="/operations/cycle-counts" component={CycleCounts} />
          <Route path="/operations/expiry" component={ExpiryAndPicking} />
          <Route path="/operations/transfers/:id" component={TransferDetail} />
          <Route path="/operations/transfers" component={Transfers} />
          <Route path="/operations/locations" component={Locations} />
          <Route
            path="/operations/inventory-costing"
            component={InventoryCosting}
          />
          <Route
            path="/operations/reconciliation"
            component={ReconciliationReport}
          />

          {/* Manufacturing */}
          <Route
            path="/operations/manufacturing-hub"
            component={ManufacturingHub}
          />
          <Route path="/operations/work-orders/:id" component={WorkOrderDetail} />
          <Route path="/operations/work-orders" component={WorkOrders} />
          <Route
            path="/operations/production-batches"
            component={ProductionBatches}
          />
          <Route path="/operations/bom/:id" component={BOMDetail} />
          <Route path="/operations/bom" component={BOM} />
          <Route path="/operations/recipes" component={Recipes} />
          <Route path="/operations/raw-materials" component={RawMaterials} />
          <Route path="/operations/ingredients" component={Ingredients} />
          <Route
            path="/operations/manufacturing-ai"
            component={ManufacturingAI}
          />

          {/* Procurement */}
          <Route
            path="/operations/procurement-hub"
            component={ProcurementHub}
          />
          <Route
            path="/operations/purchase-orders"
            component={PurchaseOrders}
          />
          <Route path="/operations/receiving" component={POReceiving} />
          <Route path="/operations/shipments" component={Shipments} />
          <Route path="/operations/vendors" component={Vendors} />
          <Route
            path="/operations/vendor-negotiations"
            component={VendorNegotiations}
          />
          <Route
            path="/operations/supplier-scoring"
            component={SupplierScoring}
          />
          <Route path="/operations/material-supply" component={MaterialSupply} />
          <Route path="/operations/document-import" component={DocumentImport} />

          {/* Planning */}
          <Route
            path="/operations/inventory-planning"
            component={InventoryPlanning}
          />
          <Route path="/operations/forecasting" component={Forecasting} />
          <Route path="/operations/allocations" component={Allocations} />

          {/* Legacy aliases. `/operations/procurement` predates the richer
              procurement hub and showed a strict subset of it; `/profitability`
              has always just bounced to the finance report. */}
          <Route path="/operations/procurement">
            <Redirect to="/operations/procurement-hub" />
          </Route>
          <Route path="/operations/profitability" component={Profitability} />

          {/* Overview — last, so it only catches a bare /operations. */}
          <Route path="/operations" component={OperationsHub} />
        </Switch>
      </Suspense>
    </OperationsLayout>
  );
}
