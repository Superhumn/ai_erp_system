// The live tRPC router. One file per top-level key; `_shared.ts` holds the
// helpers they have in common. Add a new feature as a new file + one line here.
import { router } from "../_core/trpc";
import { systemRouter } from "../_core/systemRouter";
import { freightControlTowerRouter } from "../freightControlTowerRouter";
import { autonomousWorkflowRouter } from "../autonomousWorkflowRouter";
import { agentRouter } from "../agent";
import { employeePortalRouter } from "./employeePortal";
import { materialSupplyRouter } from "./materialSupply";
import { codeRouter } from "./code";
import { backgroundTasksRouter } from "./backgroundTasks";
import { opsViewsRouter } from "./opsViews";
import { opsFormsRouter } from "./opsForms";
import { opsAutomationsRouter } from "./opsAutomations";
import { opsReportsRouter } from "./opsReports";
import { quickAddRouter } from "./quickAdd";
import { schedulingRouter } from "./scheduling";
import { plannerRouter } from "./planner";
import { authRouter } from "./auth";
import { usersRouter } from "./users";
import { companiesRouter } from "./companies";
import { customersRouter } from "./customers";
import { vendorsRouter } from "./vendors";
import { productsRouter } from "./products";
import { accountsRouter } from "./accounts";
import { invoicesRouter } from "./invoices";
import { billsRouter } from "./bills";
import { paymentsRouter } from "./payments";
import { transactionsRouter } from "./transactions";
import { ordersRouter } from "./orders";
import { orderItemsRouter } from "./orderItems";
import { inventoryRouter } from "./inventory";
import { warehouseLocationsRouter } from "./warehouseLocations";
import { serialsRouter } from "./serials";
import { warehousesRouter } from "./warehouses";
import { transfersRouter } from "./transfers";
import { cogsRouter } from "./cogs";
import { productionBatchesRouter } from "./productionBatches";
import { purchaseOrdersRouter } from "./purchaseOrders";
import { shipmentsRouter } from "./shipments";
import { departmentsRouter } from "./departments";
import { employeesRouter } from "./employees";
import { employeePaymentsRouter } from "./employeePayments";
import { contractsRouter } from "./contracts";
import { disputesRouter } from "./disputes";
import { documentsRouter } from "./documents";
import { projectsRouter } from "./projects";
import { rdTaxCreditRouter } from "./rdTaxCredit";
import { investmentGrantsRouter } from "./investmentGrants";
import { dashboardRouter } from "./dashboard";
import { auditLogsRouter } from "./auditLogs";
import { notificationsRouter } from "./notifications";
import { integrationsRouter } from "./integrations";
import { transactionalEmailRouter } from "./transactionalEmail";
import { sheetsImportRouter } from "./sheetsImport";
import { gmailRouter } from "./gmail";
import { googleWorkspaceRouter } from "./googleWorkspace";
import { calendarRouter } from "./calendar";
import { quickbooksRouter } from "./quickbooks";
import { recruitingRouter } from "./recruiting";
import { aiRouter } from "./ai";
import { aiAgentRouter } from "./aiAgent";
import { freightRouter } from "./freight";
import { freightQuotesRouter } from "./freightQuotes";
import { customsRouter } from "./customs";
import { teamRouter } from "./team";
import { invitationsRouter } from "./invitations";
import { teamInvitesRouter } from "./teamInvites";
import { copackerPortalRouter } from "./copackerPortal";
import { vendorPortalRouter } from "./vendorPortal";
import { bomRouter } from "./bom";
import { rawMaterialsRouter } from "./rawMaterials";
import { ingredientsRouter } from "./ingredients";
import { recipesRouter } from "./recipes";
import { moistureRouter } from "./moisture";
import { workOrdersRouter } from "./workOrders";
import { productionOrdersRouter } from "./productionOrders";
import { rawMaterialInventoryRouter } from "./rawMaterialInventory";
import { poReceivingRouter } from "./poReceiving";
import { forecastingRouter } from "./forecasting";
import { alertsRouter } from "./alerts";
import { recommendationsRouter } from "./recommendations";
import { vendorQuotesRouter } from "./vendorQuotes";
import { currencyRouter } from "./currency";
import { shopifyRouter } from "./shopify";
import { salesOrdersRouter } from "./salesOrders";
import { inventoryLotsRouter } from "./inventoryLots";
import { cycleCountsRouter } from "./cycleCounts";
import { reconciliationRouter } from "./reconciliation";
import { allocationsRouter } from "./allocations";
import { emailScanningRouter } from "./emailScanning";
import { dataRoomRouter } from "./dataRoom";
import { imapCredentialsRouter } from "./imapCredentials";
import { emailCredentialsRouter } from "./emailCredentials";
import { ndaRouter } from "./nda";
import { recurringInvoicesRouter } from "./recurringInvoices";
import { supplierPortalRouter } from "./supplierPortal";
import { documentImportRouter } from "./documentImport";
import { crmRouter } from "./crm";
import { inventoryCostingRouter } from "./inventoryCosting";
import { vendorNegotiationsRouter } from "./vendorNegotiations";
import { ediRouter } from "./edi";
import { inventoryManagementRouter } from "./inventoryManagement";
import { financeAiRouter } from "./financeAi";
import { firefliesRouter } from "./fireflies";
import { hrAiRouter } from "./hrAi";
import { manufacturingAiRouter } from "./manufacturingAi";
import { legalAiRouter } from "./legalAi";
import { projectsAiRouter } from "./projectsAi";
import { ediAiRouter } from "./ediAi";
import { supplierScoringRouter } from "./supplierScoring";
import { grantBidRouter } from "./grantBid";
import { capTableRouter } from "./capTable";
import { exerciseRequestsRouter } from "./exerciseRequests";
import { offerLettersRouter } from "./offerLetters";
import { timeTrackingRouter } from "./timeTracking";
import { bankingRouter } from "./banking";
import { investorPortalRouter } from "./investorPortal";
import { investorUpdatesRouter } from "./investorUpdates";
import { financialModelRouter } from "./financialModel";
import { kpiGoalsRouter } from "./kpiGoals";
import { legalCasesRouter } from "./legalCases";
import { financialReportsRouter } from "./financialReports";
import { marketingRouter } from "./marketing";
import { notesRouter } from "./notes";
import { emailSequencesRouter } from "./emailSequences";
import { emailCannedResponsesRouter } from "./emailCannedResponses";
import { pmRouter } from "./pm";
import { priceBookRouter } from "./priceBook";
import { regionalSkusRouter } from "./regionalSkus";
import { governmentTendersRouter } from "./governmentTenders";
import { regulatoryLicensesRouter } from "./regulatoryLicenses";
import { subsidiaryFundraisingRouter } from "./subsidiaryFundraising";
import { brandAmbassadorsRouter } from "./brandAmbassadors";

export const appRouter = router({
  system: systemRouter,
  // Freight Control Tower — Meridian shipment & inventory control tower
  freightControlTower: freightControlTowerRouter,
  // Autonomous Supply Chain Workflows
  autonomousWorkflows: autonomousWorkflowRouter,
  // Reasoning Agent
  agent: agentRouter,
  // Employee self-service portal
  employeePortal: employeePortalRouter,
  // Material Supply & Reorder — inventory + inbound freight + reorder recommendations.
  // No caller-supplied companyId: the param would let any ops user scope to an
  // arbitrary tenant, and there is no per-user company to validate it against.
  materialSupply: materialSupplyRouter,
  // Admin-only AI code IDE (snippets, sandboxed execution, AI actions)
  code: codeRouter,
  // Generic background-task tracking — long-running, user-initiated operations
  // (e.g. Data Room ↔ Google Drive sync) that continue running after the user
  // navigates away and are surfaced app-wide via the global task tray.
  backgroundTasks: backgroundTasksRouter,
  // ============================================
  // OPS TOOLKIT (Stackby-style capabilities layered on the ERP)
  //   opsViews       — saved grid/kanban/calendar/timeline views per module
  //   opsForms       — intake form builder + submissions (+ public endpoints)
  //   opsAutomations — lightweight trigger -> condition -> action rules
  //   opsReports     — saved pivot/report configurations
  // Internal-staff tools (internalProcedure) except the two public form
  // endpoints used by the shareable /f/:slug link.
  // ============================================
  opsViews: opsViewsRouter,
  opsForms: opsFormsRouter,
  opsAutomations: opsAutomationsRouter,
  opsReports: opsReportsRouter,
  // ============================================
  // PLANNER — universal NL quick-add, auto-scheduling, unified Today agenda
  // ============================================
  quickAdd: quickAddRouter,
  scheduling: schedulingRouter,
  planner: plannerRouter,
  auth: authRouter,
  // ============================================
  // USER MANAGEMENT
  // ============================================
  users: usersRouter,
  // ============================================
  // COMPANY MANAGEMENT
  // ============================================
  companies: companiesRouter,
  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================
  customers: customersRouter,
  // ============================================
  // VENDOR MANAGEMENT
  // ============================================
  vendors: vendorsRouter,
  // ============================================
  // PRODUCT MANAGEMENT
  // ============================================
  products: productsRouter,
  // ============================================
  // FINANCE - ACCOUNTS
  // ============================================
  accounts: accountsRouter,
  // ============================================
  // FINANCE - INVOICES
  // ============================================
  invoices: invoicesRouter,
  // ============================================
  // FINANCE - BILLS
  // ============================================
  bills: billsRouter,
  // ============================================
  // FINANCE - PAYMENTS
  // ============================================
  payments: paymentsRouter,
  // ============================================
  transactions: transactionsRouter,
  // ============================================
  // SALES - ORDERS
  // ============================================
  orders: ordersRouter,
  // ============================================
  // SALES - ORDER ITEMS
  // ============================================
  orderItems: orderItemsRouter,
  // ============================================
  // OPERATIONS - INVENTORY
  // ============================================
  inventory: inventoryRouter,
  // ============================================
  // OPERATIONS - ZONES & BINS
  // ============================================
  // `inventoryBalances.zoneId` / `binId` were free text with nothing behind
  // them. These give the codes a master table, a walk order, and a capacity.
  warehouseLocations: warehouseLocationsRouter,
  // ============================================
  // OPERATIONS - SERIAL NUMBERS
  // ============================================
  // Unit-level tracking beneath lots: a lot says which batch a unit came from,
  // a serial says where that exact unit is now.
  serials: serialsRouter,
  // ============================================
  // OPERATIONS - WAREHOUSES
  // ============================================
  warehouses: warehousesRouter,
  // ============================================
  // INVENTORY TRANSFERS
  // ============================================
  transfers: transfersRouter,
  // ============================================
  // COGS & PROFITABILITY TRACKING
  // ============================================
  cogs: cogsRouter,
  // ============================================
  // OPERATIONS - PRODUCTION BATCHES
  // ============================================
  productionBatches: productionBatchesRouter,
  // ============================================
  // OPERATIONS - PURCHASE ORDERS
  // ============================================
  purchaseOrders: purchaseOrdersRouter,
  // ============================================
  // OPERATIONS - SHIPMENTS
  // ============================================
  shipments: shipmentsRouter,
  // ============================================
  // HR - DEPARTMENTS
  // ============================================
  departments: departmentsRouter,
  // ============================================
  // HR - EMPLOYEES
  // ============================================
  employees: employeesRouter,
  // ============================================
  // HR - EMPLOYEE PAYMENTS
  // ============================================
  employeePayments: employeePaymentsRouter,
  // ============================================
  // LEGAL - CONTRACTS
  // ============================================
  contracts: contractsRouter,
  // ============================================
  // LEGAL - DISPUTES
  // ============================================
  disputes: disputesRouter,
  // ============================================
  // LEGAL - DOCUMENTS
  // ============================================
  documents: documentsRouter,
  // ============================================
  // PROJECTS
  // ============================================
  projects: projectsRouter,
  // ============================================
  // R&D TAX CREDIT (IRC SECTION 41)
  // ============================================
  rdTaxCredit: rdTaxCreditRouter,
  // ============================================
  // SAUDI INVESTMENT GRANT CHECKLIST
  // ============================================
  investmentGrants: investmentGrantsRouter,
  // ============================================
  // DASHBOARD & METRICS
  // ============================================
  dashboard: dashboardRouter,
  // ============================================
  // AUDIT LOGS
  // ============================================
  auditLogs: auditLogsRouter,
  // ============================================
  // NOTIFICATIONS
  // ============================================
  notifications: notificationsRouter,
  // ============================================
  // INTEGRATIONS
  // ============================================
  integrations: integrationsRouter,
  // ============================================
  // TRANSACTIONAL EMAIL SYSTEM (SendGrid)
  // ============================================
  transactionalEmail: transactionalEmailRouter,
  // ============================================
  // GOOGLE SHEETS IMPORT (OAuth + Drive API)
  // ============================================
  sheetsImport: sheetsImportRouter,
  // ============================================
  // GMAIL INTEGRATION
  // ============================================
  gmail: gmailRouter,
  // ============================================
  // GOOGLE WORKSPACE (DOCS & SHEETS)
  // ============================================
  googleWorkspace: googleWorkspaceRouter,
  // ============================================
  // GOOGLE CALENDAR INTEGRATION
  // ============================================
  calendar: calendarRouter,
  // ============================================
  // QUICKBOOKS INTEGRATION
  // ============================================
  quickbooks: quickbooksRouter,
  // ============================================
  // RECRUITING
  // ============================================
  recruiting: recruitingRouter,
  // ============================================
  // AI ASSISTANT
  // ============================================
  ai: aiRouter,
  // ============================================
  // AI AGENT SYSTEM
  // ============================================
  aiAgent: aiAgentRouter,
  // ============================================
  // FREIGHT MANAGEMENT
  // ============================================
  freight: freightRouter,
  // ============================================
  // STANDALONE FREIGHT QUOTES (simplified quoting)
  // ============================================
  freightQuotes: freightQuotesRouter,
  // ============================================
  // CUSTOMS CLEARANCE
  // ============================================
  customs: customsRouter,
  // Team Management
  team: teamRouter,
  // Team Invitations
  invitations: invitationsRouter,
  // Team Invites (email-based invite flow)
  teamInvites: teamInvitesRouter,
  // Copacker Portal - restricted views for copackers
  copackerPortal: copackerPortalRouter,
  // Vendor Portal - restricted views for vendors
  vendorPortal: vendorPortalRouter,
  // ============================================
  // BILL OF MATERIALS (BOM) MODULE
  // ============================================
  bom: bomRouter,
  // Raw Materials
  rawMaterials: rawMaterialsRouter,
  ingredients: ingredientsRouter,
  recipes: recipesRouter,
  moisture: moistureRouter,
  // Work Orders
  workOrders: workOrdersRouter,
  // Production Orders
  productionOrders: productionOrdersRouter,
  // Raw Material Inventory
  rawMaterialInventory: rawMaterialInventoryRouter,
  // PO Receiving
  poReceiving: poReceivingRouter,
  // ============================================
  // AI PRODUCTION FORECASTING
  // ============================================
  forecasting: forecastingRouter,
  // ============================================
  // ALERT SYSTEM
  // ============================================
  alerts: alertsRouter,
  // Recommendations
  recommendations: recommendationsRouter,
  // ============================================
  // VENDOR QUOTE MANAGEMENT (RFQ System)
  // ============================================
  vendorQuotes: vendorQuotesRouter,
  // ============================================
  // CURRENCY RATES (FX basis for quote comparison)
  // ============================================
  currency: currencyRouter,
  // ============================================
  // SHOPIFY INTEGRATION
  // ============================================
  shopify: shopifyRouter,
  // ============================================
  // SALES ORDERS
  // ============================================
  salesOrders: salesOrdersRouter,
  // ============================================
  // INVENTORY LOTS
  // ============================================
  inventoryLots: inventoryLotsRouter,
  // ============================================
  // CYCLE COUNTING / PHYSICAL INVENTORY
  // ============================================
  cycleCounts: cycleCountsRouter,
  // ============================================
  // INVENTORY RECONCILIATION
  // ============================================
  reconciliation: reconciliationRouter,
  // ============================================
  // INVENTORY ALLOCATIONS
  // ============================================
  allocations: allocationsRouter,
  // ============================================
  // EMAIL SCANNING & DOCUMENT PARSING
  // ============================================
  emailScanning: emailScanningRouter,
  // ============================================
  // DATA ROOM
  // ============================================
  dataRoom: dataRoomRouter,
  // ============================================
  // IMAP CREDENTIALS
  // ============================================
  imapCredentials: imapCredentialsRouter,
  // ============================================
  // EMAIL CREDENTIALS & SCHEDULED SCANNING
  // ============================================
  emailCredentials: emailCredentialsRouter,
  // ============================================
  // NDA E-SIGNATURES
  // ============================================
  nda: ndaRouter,
  // ============================================
  // RECURRING INVOICES
  // ============================================
  recurringInvoices: recurringInvoicesRouter,
  // ============================================
  // SUPPLIER PORTAL (PUBLIC)
  // ============================================
  supplierPortal: supplierPortalRouter,
  // ============================================
  // DOCUMENT IMPORT
  // ============================================
  documentImport: documentImportRouter,
  // ============================================
  // CRM MODULE - Contacts, Messaging & Tracking
  // ============================================
  crm: crmRouter,
  inventoryCosting: inventoryCostingRouter,
  // ============================================
  // AUTOMATED VENDOR NEGOTIATIONS
  // ============================================
  vendorNegotiations: vendorNegotiationsRouter,
  // ============================================
  // EDI MODULE - Retail Customer Connections
  // ============================================
  edi: ediRouter,
  // ============================================
  // INVENTORY MANAGEMENT (enriched view)
  // ============================================
  inventoryManagement: inventoryManagementRouter,
  // ============================================
  // AI-POWERED FINANCE ANALYTICS
  // ============================================
  financeAi: financeAiRouter,
  // ============================================
  // FIREFLIES INTEGRATION
  // ============================================
  fireflies: firefliesRouter,
  // ============================================
  // AI-POWERED HR ANALYTICS
  // ============================================
  hrAi: hrAiRouter,
  // ============================================
  // AI-POWERED MANUFACTURING ANALYTICS
  // ============================================
  manufacturingAi: manufacturingAiRouter,
  // ============================================
  // AI-POWERED LEGAL ANALYTICS
  // ============================================
  legalAi: legalAiRouter,
  // ============================================
  // AI-POWERED PROJECT ANALYTICS
  // ============================================
  projectsAi: projectsAiRouter,
  // ============================================
  // AI-POWERED EDI ANALYTICS
  // ============================================
  ediAi: ediAiRouter,
  // ============================================
  // AI-POWERED SUPPLIER SCORING
  // ============================================
  supplierScoring: supplierScoringRouter,
  // ============================================
  // GRANT & BID APPLICATION SUBMITTER
  // ============================================
  grantBid: grantBidRouter,
  // ============================================
  // CAP TABLE & EQUITY MANAGEMENT
  // ============================================
  capTable: capTableRouter,
  // ============================================
  // EXERCISE REQUESTS
  // ============================================
  exerciseRequests: exerciseRequestsRouter,
  // ============================================
  // OFFER LETTERS
  // ============================================
  offerLetters: offerLettersRouter,
  // ============================================
  // TIME TRACKING
  // ============================================
  timeTracking: timeTrackingRouter,
  // ============================================
  // MERCURY BANKING INTEGRATION
  // ============================================
  banking: bankingRouter,
  // ============================================
  // INVESTOR PORTAL (logged-in existing-investor view)
  // ============================================
  //
  // Three procedures are gated to users with role='investor' (or admin/exec
  // for support/testing). A fourth, `inviteToPortal`, is admin-only and
  // drives the invite flow that turns a cap-table stakeholder into a user.
  investorPortal: investorPortalRouter,
  // Investor Updates
  investorUpdates: investorUpdatesRouter,
  // ============================================
  // FINANCIAL MODEL
  // ============================================
  financialModel: financialModelRouter,
  // ============================================
  // KPI GOALS
  // ============================================
  kpiGoals: kpiGoalsRouter,
  // ============================================
  // LEGAL CASES
  // ============================================
  legalCases: legalCasesRouter,
  // ============================================
  // FINANCIAL REPORTS
  // ============================================
  financialReports: financialReportsRouter,
  // ============================================
  // MARKETING — VIDEO ASSETS & SOCIAL POSTING
  // ============================================
  marketing: marketingRouter,
  // ============================================
  // QUICK NOTES — Apple-Notes-style capture + LLM routing
  // ============================================
  notes: notesRouter,
  // ============================================
  // EMAIL SEQUENCES
  // ============================================
  emailSequences: emailSequencesRouter,
  // ============================================
  // EMAIL CANNED RESPONSES
  // ============================================
  emailCannedResponses: emailCannedResponsesRouter,
  // ============================================
  // PROJECT MANAGEMENT MODULE
  // Market × Function matrix for international expansion tracking.
  // See docs/pm-module.md.
  // ============================================
  pm: pmRouter,
  // ============================================
  // MULTI-TIER PRICE BOOK  (foodservice / wholesale / MSRP per region)
  // ============================================
  priceBook: priceBookRouter,
  // ============================================
  // REGIONAL SKUs  (SH-BWS-001 ↔ SH-BWS-001-SA, etc.)
  // ============================================
  regionalSkus: regionalSkusRouter,
  // ============================================
  // GOVERNMENT TENDERS  (GeM, IRCTC, ICDS, CSD, AIIMS...)
  // ============================================
  governmentTenders: governmentTendersRouter,
  // ============================================
  // REGULATORY LICENSES  (FSSAI, DPIIT, EFSA Novel Food, ...)
  // ============================================
  regulatoryLicenses: regulatoryLicensesRouter,
  // ============================================
  // SUBSIDIARY FUNDRAISING ROUNDS
  // ============================================
  subsidiaryFundraising: subsidiaryFundraisingRouter,
  // ============================================
  // BRAND AMBASSADORS / INFLUENCERS / CHARACTERS
  // ============================================
  brandAmbassadors: brandAmbassadorsRouter,
});

export type AppRouter = typeof appRouter;

// Helpers the former server/routers.ts exported; still importable from this entry point.
export { financeProcedure, opsProcedure, resolveRequestScope, scopedProcedure, createAuditLog, detectSheetType, generateNumber } from "./_shared";
export type { DriveSyncResult } from "./_shared";
