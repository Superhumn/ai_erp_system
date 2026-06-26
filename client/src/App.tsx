import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AIAgentProvider } from "./contexts/AIAgentContext";
import DashboardLayout from "./components/DashboardLayout";
import { ModuleErrorBoundary } from "./components/ModuleErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useAuth } from "@/_core/hooks/useAuth";

// Eagerly loaded pages (high-traffic, first paint)
import Home from "./pages/Home";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import RecoverAccount from "./pages/RecoverAccount";
import NotFound from "@/pages/NotFound";

// Lazy-loaded pages — split into separate chunks for smaller initial bundle
const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const Settings = lazy(() => import("./pages/Settings"));
const GlobalSearch = lazy(() => import("./pages/GlobalSearch"));
const Notifications = lazy(() => import("./pages/Notifications"));

// Finance
const FinanceHub = lazy(() => import("./pages/finance/FinanceHub"));
const Accounts = lazy(() => import("./pages/finance/Accounts"));
const Invoices = lazy(() => import("./pages/finance/Invoices"));
const Payments = lazy(() => import("./pages/finance/Payments"));
const Transactions = lazy(() => import("./pages/finance/Transactions"));
const FinancialReports = lazy(() => import("./pages/finance/FinancialReports"));
const Banking = lazy(() => import("./pages/finance/Banking"));
const RdTaxCredit = lazy(() => import("./pages/finance/RdTaxCredit"));

// Sales
const Orders = lazy(() => import("./pages/sales/Orders"));
const OrderDetail = lazy(() => import("./pages/sales/OrderDetail"));
const Customers = lazy(() => import("./pages/sales/Customers"));
const CustomerDetail = lazy(() => import("./pages/sales/CustomerDetail"));
const SalesHub = lazy(() => import("./pages/sales/SalesHub"));
const CRMDashboard = lazy(() => import("./pages/sales/CRMDashboard"));
const CRMInvestors = lazy(() => import("./pages/sales/CRMInvestors"));
const FundraisingCampaigns = lazy(() => import("./pages/sales/FundraisingCampaigns"));
const SalesAutomation = lazy(() => import("./pages/sales/SalesAutomation"));

// CX
const CustomerSupport = lazy(() => import("./pages/cx/CustomerSupport"));

// CRM
const CRMHub = lazy(() => import("./pages/crm/CRMHub"));

// Operations
const Products = lazy(() => import("./pages/operations/Products"));
const ProductDetail = lazy(() => import("./pages/operations/ProductDetail"));
const Inventory = lazy(() => import("./pages/operations/Inventory"));
const Vendors = lazy(() => import("./pages/operations/Vendors"));
const PurchaseOrders = lazy(() => import("./pages/operations/PurchaseOrders"));
const Shipments = lazy(() => import("./pages/operations/Shipments"));
const Locations = lazy(() => import("./pages/operations/Locations"));
const Transfers = lazy(() => import("./pages/operations/Transfers"));
const TransferDetail = lazy(() => import("./pages/operations/TransferDetail"));
const BOM = lazy(() => import("./pages/operations/BOM"));
const Recipes = lazy(() => import("./pages/operations/Recipes"));
const BOMDetail = lazy(() => import("./pages/operations/BOMDetail"));
const RawMaterials = lazy(() => import("./pages/operations/RawMaterials"));
const WorkOrders = lazy(() => import("./pages/operations/WorkOrders"));
const WorkOrderDetail = lazy(() => import("./pages/operations/WorkOrderDetail"));
const POReceiving = lazy(() => import("./pages/operations/POReceiving"));
const Forecasting = lazy(() => import("./pages/operations/Forecasting"));
const CoreOperations = lazy(() => import("./pages/operations/CoreOperations"));
const EmailInbox = lazy(() => import("./pages/operations/EmailInbox"));
const Procurement = lazy(() => import("./pages/operations/Procurement"));
const ManufacturingHub = lazy(() => import("./pages/operations/ManufacturingHub"));
const ProcurementHub = lazy(() => import("./pages/operations/ProcurementHub"));
const LogisticsHub = lazy(() => import("./pages/operations/LogisticsHub"));
const InventoryHub = lazy(() => import("./pages/operations/InventoryHub"));
const OperationsHub = lazy(() => import("./pages/operations/OperationsHub"));
const DocumentImport = lazy(() => import("./pages/operations/DocumentImport"));
const Profitability = lazy(() => import("./pages/operations/Profitability"));
const ReconciliationReport = lazy(() => import("./pages/operations/ReconciliationReport"));
const InventoryCosting = lazy(() => import("./pages/operations/InventoryCosting"));
const VendorNegotiations = lazy(() => import("./pages/operations/VendorNegotiations"));
const SupplierPortal = lazy(() => import("./pages/SupplierPortal"));

// EDI
const EDIDashboard = lazy(() => import("./pages/edi/EDIDashboard"));
const TradingPartners = lazy(() => import("./pages/edi/TradingPartners"));
const EDITransactions = lazy(() => import("./pages/edi/EDITransactions"));
const RetailerOnboarding = lazy(() => import("./pages/edi/RetailerOnboarding"));

// Freight
const FreightDashboard = lazy(() => import("./pages/freight/FreightDashboard"));
const FreightTracking = lazy(() => import("./pages/freight/FreightTracking"));
const FDAPriorNotice = lazy(() => import("./pages/freight/FDAPriorNotice"));
const Carriers = lazy(() => import("./pages/freight/Carriers"));
const RFQs = lazy(() => import("./pages/freight/RFQs"));
const RFQDetail = lazy(() => import("./pages/freight/RFQDetail"));
const CustomsClearance = lazy(() => import("./pages/freight/CustomsClearance"));
const CustomsDetail = lazy(() => import("./pages/freight/CustomsDetail"));

// HR
const HRHub = lazy(() => import("./pages/hr/HRHub"));
const Employees = lazy(() => import("./pages/hr/Employees"));
const EmployeePortal = lazy(() => import("./pages/hr/EmployeePortal"));
const Payroll = lazy(() => import("./pages/hr/Payroll"));
const EquityPortal = lazy(() => import("./pages/hr/EquityPortal"));
const EquityReports = lazy(() => import("./pages/hr/EquityReports"));
const InvestorsHub = lazy(() => import("./pages/hr/InvestorsHub"));
const InvestorPortal = lazy(() => import("./pages/InvestorPortal"));
const TimeTracking = lazy(() => import("./pages/hr/TimeTracking"));
const GlobalStructure = lazy(() => import("./pages/structure/GlobalStructure"));

// Marketing
const ContentHub = lazy(() => import("./pages/marketing/ContentHub"));
const MarketingHub = lazy(() => import("./pages/marketing/MarketingHub"));

// Recruiting
const Recruiting = lazy(() => import("./pages/hr/Recruiting"));

// Legal
const LegalHub = lazy(() => import("./pages/legal/LegalHub"));
const Contracts = lazy(() => import("./pages/legal/Contracts"));
const CaseTracker = lazy(() => import("./pages/legal/CaseTracker"));
const Disputes = lazy(() => import("./pages/legal/Disputes"));
const Documents = lazy(() => import("./pages/legal/Documents"));

// Settings
const Integrations = lazy(() => import("./pages/settings/Integrations"));
const NotificationSettings = lazy(() => import("./pages/settings/Notifications"));
const TransactionalEmails = lazy(() => import("./pages/settings/TransactionalEmails"));
const Fireflies = lazy(() => import("./pages/settings/Fireflies"));
const QuickBooksIntegration = lazy(() => import("./pages/settings/QuickBooksIntegration"));
const ShopifySettings = lazy(() => import("./pages/settings/ShopifySettings"));
const Team = lazy(() => import("./pages/settings/Team"));

// Projects
const Projects = lazy(() => import("./pages/projects/Projects"));
const InvestmentGrantChecklist = lazy(() => import("./pages/projects/InvestmentGrantChecklist"));

// PM module (Market × Function matrix for international expansion)
const PmIndex = lazy(() => import("./pages/pm/Index"));
const PmMatrix = lazy(() => import("./pages/pm/Matrix"));
const PmMarket = lazy(() => import("./pages/pm/Market"));
const PmFunction = lazy(() => import("./pages/pm/Function"));
const PmCockpit = lazy(() => import("./pages/pm/Cockpit"));
const PmCash = lazy(() => import("./pages/pm/Cash"));
const PmTimeline = lazy(() => import("./pages/pm/Timeline"));
const PmProject = lazy(() => import("./pages/pm/Project"));
const PmAdmin = lazy(() => import("./pages/pm/Admin"));

// Grants & Bids
const GrantBidSubmitter = lazy(() => import("./pages/grants/GrantBidSubmitter"));

// Import
const Import = lazy(() => import("./pages/Import"));

// Portals
const CopackerPortal = lazy(() => import("./pages/portal/CopackerPortal"));
const VendorPortal = lazy(() => import("./pages/portal/VendorPortal"));

// SOPs
const SOPs = lazy(() => import("./pages/SOPs"));

// Meetings
const Meetings = lazy(() => import("./pages/Meetings"));

// Quick Notes
const Notes = lazy(() => import("./pages/Notes"));

// Messaging
const Messaging = lazy(() => import("./pages/Messaging"));

// Investor Updates
const InvestorUpdates = lazy(() => import("./pages/InvestorUpdates"));

// Data Room
const DataRooms = lazy(() => import("./pages/DataRooms"));
const DataRoomDetail = lazy(() => import("./pages/DataRoomDetail"));
const DataRoomPublic = lazy(() => import("./pages/DataRoomPublic"));
const DataRoomFinancialsPublic = lazy(() => import("./pages/DataRoomFinancialsPublic"));

// Component Showcase
const ComponentShowcase = lazy(() => import("./pages/ComponentShowcase"));

// Code
const CodeEditor = lazy(() => import("./pages/Code"));

// AI Agent
const ApprovalQueue = lazy(() => import("./pages/ai/ApprovalQueue"));

// AI Analytics Pages
const FinanceAI = lazy(() => import("./pages/finance/FinanceAI"));
const HRAIInsights = lazy(() => import("./pages/hr/HRAIInsights"));
const ManufacturingAI = lazy(() => import("./pages/operations/ManufacturingAI"));
const LegalAI = lazy(() => import("./pages/legal/LegalAI"));
const ProjectsAI = lazy(() => import("./pages/projects/ProjectsAI"));
const SupplierScoring = lazy(() => import("./pages/operations/SupplierScoring"));

// Autonomous Supply Chain
const AutonomousDashboard = lazy(() => import("./pages/autonomous/Dashboard"));
const AutonomousApprovals = lazy(() => import("./pages/autonomous/Approvals"));
const AutonomousExceptions = lazy(() => import("./pages/autonomous/Exceptions"));
const AutonomousSettings = lazy(() => import("./pages/autonomous/Settings"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

// External / outside-the-org roles are confined to their own portal. Their
// landing route, and the only routes they may reach — any other path redirects
// back to this home. This is the enforcement layer behind the portal-only menu
// in getMenuGroups(); hiding nav is not access control on its own.
const EXTERNAL_ROLE_HOME: Record<string, string> = {
  copacker: "/portal/copacker",
  vendor: "/portal/vendor",
  investor: "/investor-portal",
  contractor: "/projects",
};

function Router() {
  const { user } = useAuth();
  const role = user?.role;
  const externalHome = role ? EXTERNAL_ROLE_HOME[role] : undefined;

  // Outsiders: render only the routes their role is allowed to reach; redirect
  // everything else (including direct-URL attempts at internal pages) home.
  if (user && externalHome) {
    const allowed =
      role === "copacker"
        ? [<Route key="cp" path="/portal/copacker" component={CopackerPortal} />]
        : role === "vendor"
        ? [<Route key="vp" path="/portal/vendor" component={VendorPortal} />]
        : role === "investor"
        ? [<Route key="ip" path="/investor-portal" component={InvestorPortal} />]
        : role === "contractor"
        ? [
            <Route key="pj" path="/projects" component={Projects} />,
            <Route key="pjai" path="/projects/ai" component={ProjectsAI} />,
          ]
        : [];
    return (
      <DashboardLayout>
        <ModuleErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              {allowed}
              <Route>
                <Redirect to={externalHome} />
              </Route>
            </Switch>
          </Suspense>
        </ModuleErrorBoundary>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ModuleErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Overview */}
          <Route path="/" component={Home} />
          <Route path="/ai" component={AIAssistant} />
          <Route path="/ai/approvals" component={ApprovalQueue} />
          <Route path="/search" component={GlobalSearch} />

          {/* Autonomous Supply Chain */}
          <Route path="/autonomous-dashboard" component={AutonomousDashboard} />
          <Route path="/approvals" component={AutonomousApprovals} />
          <Route path="/exceptions" component={AutonomousExceptions} />
          <Route path="/autonomous-settings" component={AutonomousSettings} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/settings" component={Settings} />
          <Route path="/settings/integrations" component={Integrations} />
          <Route path="/settings/notifications" component={NotificationSettings} />
          <Route path="/settings/emails" component={TransactionalEmails} />
          <Route path="/settings/fireflies" component={Fireflies} />
          <Route path="/settings/quickbooks" component={QuickBooksIntegration} />
          <Route path="/settings/shopify" component={ShopifySettings} />

          {/* Finance */}
          <Route path="/finance" component={FinanceHub} />
          <Route path="/finance/accounts" component={Accounts} />
          <Route path="/finance/invoices" component={Invoices} />
          <Route path="/finance/payments" component={Payments} />
          <Route path="/finance/transactions" component={Transactions} />
          <Route path="/finance/reports" component={FinancialReports} />
          <Route path="/finance/banking" component={Banking} />
          <Route path="/finance/rd-tax-credit" component={RdTaxCredit} />
          <Route path="/finance/ai" component={FinanceAI} />

          {/* Sales */}
          <Route path="/sales/orders/:id" component={OrderDetail} />
          <Route path="/sales/orders" component={Orders} />
          <Route path="/sales/customers/:id" component={CustomerDetail} />
          <Route path="/sales/customers" component={Customers} />
          <Route path="/sales/hub" component={SalesHub} />
          <Route path="/cx/support" component={CustomerSupport} />
          <Route path="/sales/automation" component={SalesAutomation} />
          <Route path="/crm/investors" component={CRMInvestors} />
          <Route path="/crm/campaigns" component={FundraisingCampaigns} />

          {/* CRM — /crm/hub is canonical (sidebar-locked); /crm is a legacy alias */}
          <Route path="/crm/hub" component={CRMHub} />
          <Route path="/crm/dashboard" component={CRMDashboard} />
          <Route path="/crm"><Redirect to="/crm/hub" /></Route>

          {/* Operations */}
          <Route path="/operations" component={OperationsHub} />
          <Route path="/operations/products/:id" component={ProductDetail} />
          <Route path="/operations/products" component={Products} />
          <Route path="/operations/inventory" component={Inventory} />
          <Route path="/operations/vendors" component={Vendors} />
          <Route path="/operations/purchase-orders" component={PurchaseOrders} />
          <Route path="/operations/shipments" component={Shipments} />
          <Route path="/operations/locations" component={Locations} />
          <Route path="/operations/transfers" component={Transfers} />
          <Route path="/operations/transfers/:id" component={TransferDetail} />
          <Route path="/operations/bom" component={BOM} />
          <Route path="/operations/recipes" component={Recipes} />
          <Route path="/operations/bom/:id" component={BOMDetail} />
          <Route path="/operations/raw-materials" component={RawMaterials} />
          <Route path="/operations/work-orders" component={WorkOrders} />
          <Route path="/operations/work-orders/:id" component={WorkOrderDetail} />
          <Route path="/operations/receiving" component={POReceiving} />
          <Route path="/operations/forecasting" component={Forecasting} />
          <Route path="/operations/core" component={CoreOperations} />
          <Route path="/operations/email-inbox" component={EmailInbox} />
          <Route path="/operations/procurement" component={Procurement} />
          <Route path="/operations/manufacturing-hub" component={ManufacturingHub} />
          <Route path="/operations/procurement-hub" component={ProcurementHub} />
          <Route path="/operations/logistics-hub" component={LogisticsHub} />
          <Route path="/operations/inventory-hub" component={InventoryHub} />
          <Route path="/operations/profitability" component={Profitability} />
          <Route path="/operations/document-import" component={DocumentImport} />
          <Route path="/operations/reconciliation" component={ReconciliationReport} />
          <Route path="/operations/inventory-costing" component={InventoryCosting} />
          <Route path="/operations/vendor-negotiations" component={VendorNegotiations} />
          <Route path="/operations/manufacturing-ai" component={ManufacturingAI} />
          <Route path="/operations/supplier-scoring" component={SupplierScoring} />

          {/* EDI */}
          <Route path="/edi" component={EDIDashboard} />
          <Route path="/edi/connect" component={RetailerOnboarding} />
          <Route path="/edi/partners" component={TradingPartners} />
          <Route path="/edi/transactions" component={EDITransactions} />

          {/* Freight */}
          <Route path="/freight" component={FreightDashboard} />
          <Route path="/freight/tracking" component={FreightTracking} />
          <Route path="/freight/fda" component={FDAPriorNotice} />
          <Route path="/freight/carriers" component={Carriers} />
          <Route path="/freight/rfqs" component={RFQs} />
          <Route path="/freight/rfqs/:id" component={RFQDetail} />
          <Route path="/freight/customs" component={CustomsClearance} />
          <Route path="/freight/customs/:id" component={CustomsDetail} />

          {/* Marketing */}
          <Route path="/marketing" component={MarketingHub} />
          <Route path="/marketing/content" component={ContentHub} />

          {/* Recruiting */}
          <Route path="/hr/recruiting" component={Recruiting} />

          {/* HR */}
          <Route path="/hr" component={HRHub} />
          <Route path="/hr/me" component={EmployeePortal} />
          <Route path="/hr/employees" component={Employees} />
          <Route path="/hr/payroll" component={Payroll} />
          <Route path="/hr/ai" component={HRAIInsights} />
          <Route path="/hr/equity-portal" component={EquityPortal} />
          <Route path="/hr/equity-reports" component={EquityReports} />
          <Route path="/hr/investors" component={InvestorsHub} />
          <Route path="/investor-portal" component={InvestorPortal} />
          <Route path="/hr/time-tracking" component={TimeTracking} />
          <Route path="/structure" component={GlobalStructure} />

          {/* Legal */}
          <Route path="/legal" component={LegalHub} />
          <Route path="/legal/contracts" component={Contracts} />
          <Route path="/legal/cases" component={CaseTracker} />
          <Route path="/legal/disputes" component={Disputes} />
          <Route path="/legal/documents" component={Documents} />
          <Route path="/legal/ai" component={LegalAI} />

          {/* Projects */}
          <Route path="/projects" component={Projects} />
          <Route path="/projects/ai" component={ProjectsAI} />
          <Route path="/projects/investment-grants" component={InvestmentGrantChecklist} />

          {/* PM module — Market × Function matrix */}
          <Route path="/pm" component={PmIndex} />
          <Route path="/pm/matrix" component={PmMatrix} />
          <Route path="/pm/timeline" component={PmTimeline} />
          <Route path="/pm/cockpit" component={PmCockpit} />
          <Route path="/pm/cash" component={PmCash} />
          <Route path="/pm/admin" component={PmAdmin} />
          <Route path="/pm/market/:code" component={PmMarket} />
          <Route path="/pm/function/:code" component={PmFunction} />
          <Route path="/pm/project/:id" component={PmProject} />

          {/* Investor Updates */}
          <Route path="/investor-updates" component={InvestorUpdates} />

          {/* SOPs */}
          <Route path="/sops" component={SOPs} />

          {/* Meetings */}
          <Route path="/meetings" component={Meetings} />

          {/* Quick Notes */}
          <Route path="/notes" component={Notes} />

          {/* Messaging */}
          <Route path="/messaging" component={Messaging} />

          {/* Grants & Bids */}
          <Route path="/grants/submitter" component={GrantBidSubmitter} />

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

          {/* Code */}
          <Route path="/code" component={CodeEditor} />

          {/* Component Showcase */}
          <Route path="/showcase" component={ComponentShowcase} />

          {/* Fallback */}
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      </ModuleErrorBoundary>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <AIAgentProvider>
          <TooltipProvider>
            <Toaster />
            <OfflineIndicator />
            <Suspense fallback={<PageLoader />}>
              <Switch>
                {/* Public routes (outside dashboard) */}
                <Route path="/login" component={Login} />
                <Route path="/reset-password" component={ResetPassword} />
                <Route path="/recover-account" component={RecoverAccount} />
                {/* Public Data Room Access (outside dashboard) */}
                <Route path="/share/:code/financials" component={DataRoomFinancialsPublic} />
                <Route path="/dr/:code/financials" component={DataRoomFinancialsPublic} />
                <Route path="/share/:code" component={DataRoomPublic} />
                <Route path="/dr/:code" component={DataRoomPublic} />
                {/* Supplier Portal (public) */}
                <Route path="/supplier-portal/:token" component={SupplierPortal} />
                {/* All other routes go through dashboard */}
                <Route component={Router} />
              </Switch>
            </Suspense>
          </TooltipProvider>
        </AIAgentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
