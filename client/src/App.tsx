import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

// Pages
import Home from "./pages/Home";
import AIAssistant from "./pages/AIAssistant";
import Settings from "./pages/Settings";
import GlobalSearch from "./pages/GlobalSearch";
import Notifications from "./pages/Notifications";

// Finance
import Accounts from "./pages/finance/Accounts";
import Invoices from "./pages/finance/Invoices";
import InvoiceDetail from "./pages/finance/InvoiceDetail";
import Payments from "./pages/finance/Payments";
import Transactions from "./pages/finance/Transactions";

// Sales
import Orders from "./pages/sales/Orders";
import OrderDetail from "./pages/sales/OrderDetail";
import Customers from "./pages/sales/Customers";
import CustomerDetail from "./pages/sales/CustomerDetail";
import SalesHub from "./pages/sales/SalesHub";

// CRM
import CRMHub from "./pages/crm/CRMHub";

// Operations
import Products from "./pages/operations/Products";
import ProductDetail from "./pages/operations/ProductDetail";
import Inventory from "./pages/operations/Inventory";
import Vendors from "./pages/operations/Vendors";
import VendorDetail from "./pages/operations/VendorDetail";
import PurchaseOrders from "./pages/operations/PurchaseOrders";
import PurchaseOrderDetail from "./pages/operations/PurchaseOrderDetail";
import Shipments from "./pages/operations/Shipments";
import ShipmentDetail from "./pages/operations/ShipmentDetail";
import Locations from "./pages/operations/Locations";
import Transfers from "./pages/operations/Transfers";
import TransferDetail from "./pages/operations/TransferDetail";
import BOM from "./pages/operations/BOM";
import BOMDetail from "./pages/operations/BOMDetail";
import RawMaterials from "./pages/operations/RawMaterials";
import WorkOrders from "./pages/operations/WorkOrders";
import WorkOrderDetail from "./pages/operations/WorkOrderDetail";
import POReceiving from "./pages/operations/POReceiving";
import Forecasting from "./pages/operations/Forecasting";
import CoreOperations from "./pages/operations/CoreOperations";
import EmailInbox from "./pages/operations/EmailInbox";
import Logistics from "./pages/operations/Logistics";
import Procurement from "./pages/operations/Procurement";
import ManufacturingHub from "./pages/operations/ManufacturingHub";
import ProcurementHub from "./pages/operations/ProcurementHub";
import LogisticsHub from "./pages/operations/LogisticsHub";
import InventoryHub from "./pages/operations/InventoryHub";
import OperationsHub from "./pages/operations/OperationsHub";
import DocumentImport from "./pages/operations/DocumentImport";
import SupplierPortal from "./pages/SupplierPortal";

// Freight
import FreightDashboard from "./pages/freight/FreightDashboard";
import Carriers from "./pages/freight/Carriers";
import RFQs from "./pages/freight/RFQs";
import RFQDetail from "./pages/freight/RFQDetail";
import CustomsClearance from "./pages/freight/CustomsClearance";
import CustomsDetail from "./pages/freight/CustomsDetail";

// HR
import Employees from "./pages/hr/Employees";
import EmployeeDetail from "./pages/hr/EmployeeDetail";
import Payroll from "./pages/hr/Payroll";

// Legal
import Contracts from "./pages/legal/Contracts";
import ContractDetail from "./pages/legal/ContractDetail";
import Disputes from "./pages/legal/Disputes";
import Documents from "./pages/legal/Documents";

// Settings
import Integrations from "./pages/settings/Integrations";
import NotificationSettings from "./pages/settings/Notifications";

// Projects
import Projects from "./pages/projects/Projects";

// Import
import Import from "./pages/Import";

// Settings
import Team from "./pages/settings/Team";

// Portals
import CopackerPortal from "./pages/portal/CopackerPortal";
import VendorPortal from "./pages/portal/VendorPortal";

// Data Room
import DataRooms from "./pages/DataRooms";
import DataRoomDetail from "./pages/DataRoomDetail";
import DataRoomPublic from "./pages/DataRoomPublic";

// AI Agent
import ApprovalQueue from "./pages/ai/ApprovalQueue";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        {/* Overview */}
        <Route path="/" component={Home} />
        <Route path="/ai" component={AIAssistant} />
        <Route path="/ai/approvals" component={ApprovalQueue} />
        <Route path="/search" component={GlobalSearch} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/settings" component={Settings} />
        <Route path="/settings/integrations" component={Integrations} />
        <Route path="/settings/notifications" component={NotificationSettings} />

        {/* Finance */}
        <Route path="/finance/accounts" component={Accounts} />
        <Route path="/finance/invoices/:id" component={InvoiceDetail} />
        <Route path="/finance/invoices" component={Invoices} />
        <Route path="/finance/payments" component={Payments} />
        <Route path="/finance/transactions" component={Transactions} />

        {/* Sales */}
        <Route path="/sales/orders/:id" component={OrderDetail} />
        <Route path="/sales/orders" component={Orders} />
        <Route path="/sales/customers/:id" component={CustomerDetail} />
        <Route path="/sales/customers" component={Customers} />
        <Route path="/sales/hub" component={SalesHub} />

        {/* CRM */}
        <Route path="/crm" component={CRMHub} />
        <Route path="/crm/hub" component={CRMHub} />

        {/* Operations */}
        <Route path="/operations" component={OperationsHub} />
        <Route path="/operations/products/:id" component={ProductDetail} />
        <Route path="/operations/products" component={Products} />
        <Route path="/operations/inventory" component={Inventory} />
        <Route path="/operations/vendors/:id" component={VendorDetail} />
        <Route path="/operations/vendors" component={Vendors} />
        <Route path="/operations/purchase-orders/:id" component={PurchaseOrderDetail} />
        <Route path="/operations/purchase-orders" component={PurchaseOrders} />
        <Route path="/operations/shipments/:id" component={ShipmentDetail} />
        <Route path="/operations/shipments" component={Shipments} />
        <Route path="/operations/locations" component={Locations} />
        <Route path="/operations/transfers" component={Transfers} />
        <Route path="/operations/transfers/:id" component={TransferDetail} />
        <Route path="/operations/bom" component={BOM} />
        <Route path="/operations/bom/:id" component={BOMDetail} />
        <Route path="/operations/raw-materials" component={RawMaterials} />
        <Route path="/operations/work-orders" component={WorkOrders} />
        <Route path="/operations/work-orders/:id" component={WorkOrderDetail} />
        <Route path="/operations/receiving" component={POReceiving} />
        <Route path="/operations/forecasting" component={Forecasting} />
        <Route path="/operations/core" component={CoreOperations} />
        <Route path="/operations/email-inbox" component={EmailInbox} />
        <Route path="/operations/logistics" component={Logistics} />
        <Route path="/operations/procurement" component={Procurement} />
        <Route path="/operations/manufacturing-hub" component={ManufacturingHub} />
        <Route path="/operations/procurement-hub" component={ProcurementHub} />
        <Route path="/operations/logistics-hub" component={LogisticsHub} />
        <Route path="/operations/inventory-hub" component={InventoryHub} />
        <Route path="/operations/document-import" component={DocumentImport} />

        {/* Freight */}
        <Route path="/freight" component={FreightDashboard} />
        <Route path="/freight/carriers" component={Carriers} />
        <Route path="/freight/rfqs" component={RFQs} />
        <Route path="/freight/rfqs/:id" component={RFQDetail} />
        <Route path="/freight/customs" component={CustomsClearance} />
        <Route path="/freight/customs/:id" component={CustomsDetail} />

        {/* HR */}
        <Route path="/hr/employees/:id" component={EmployeeDetail} />
        <Route path="/hr/employees" component={Employees} />
        <Route path="/hr/payroll" component={Payroll} />

        {/* Legal */}
        <Route path="/legal/contracts/:id" component={ContractDetail} />
        <Route path="/legal/contracts" component={Contracts} />
        <Route path="/legal/disputes" component={Disputes} />
        <Route path="/legal/documents" component={Documents} />

        {/* Projects */}
        <Route path="/projects" component={Projects} />

        {/* Import */}
        <Route path="/import" component={Import} />

        {/* Settings */}
        <Route path="/settings/team" component={Team} />

        {/* Portals */}
        <Route path="/portal/copacker" component={CopackerPortal} />
        <Route path="/portal/vendor" component={VendorPortal} />

        {/* Data Room */}
        <Route path="/datarooms" component={DataRooms} />
        <Route path="/dataroom/:id" component={DataRoomDetail} />

        {/* Fallback */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Switch>
            {/* Public Data Room Access (outside dashboard) */}
            <Route path="/share/:code" component={DataRoomPublic} />
            {/* Supplier Portal (public) */}
            <Route path="/supplier-portal/:token" component={SupplierPortal} />
            {/* All other routes go through dashboard */}
            <Route component={Router} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
