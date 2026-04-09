import { relations } from "drizzle-orm";
import {
  users,
  localAuthCredentials,
  teamInvitations,
  userPermissions,
  googleOAuthTokens,
  quickbooksOAuthTokens,
  quickbooksAccounts,
  quickbooksAccountMappings,
  quickbooksItems,
  companies,
  customers,
  vendors,
  products,
  accounts,
  invoices,
  invoiceItems,
  payments,
  transactions,
  transactionLines,
  orders,
  orderItems,
  inventory,
  warehouses,
  inventoryTransfers,
  inventoryTransferItems,
  purchaseOrders,
  purchaseOrderItems,
  shipments,
  departments,
  employees,
  compensationHistory,
  employeePayments,
  contracts,
  contractKeyDates,
  disputes,
  documents,
  projects,
  projectMilestones,
  projectTasks,
  auditLogs,
  notifications,
  aiConversations,
  aiMessages,
  billOfMaterials,
  bomComponents,
  rawMaterials,
  workOrders,
  workOrderMaterials,
  salesOrders,
  salesOrderLines,
  dataRooms,
  dataRoomFolders,
  dataRoomDocuments,
  dataRoomLinks,
  dataRoomVisitors,
  crmContacts,
  crmTags,
  crmContactTags,
  crmDeals,
  crmPipelines,
  vendorRfqs,
  vendorQuotes,
  supplyChainWorkflows,
  workflowRuns,
  workflowSteps,
  ediTradingPartners,
  ediTransactions,
  ediTransactionItems,
} from "./schema";

// ============================================
// USER & ACCESS CONTROL
// ============================================

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  linkedVendor: one(vendors, { fields: [users.linkedVendorId], references: [vendors.id] }),
  permissions: many(userPermissions),
  googleOAuthTokens: many(googleOAuthTokens),
  quickbooksOAuthTokens: many(quickbooksOAuthTokens),
  notifications: many(notifications),
  aiConversations: many(aiConversations),
  auditLogs: many(auditLogs),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, { fields: [userPermissions.userId], references: [users.id] }),
}));

export const googleOAuthTokensRelations = relations(googleOAuthTokens, ({ one }) => ({
  user: one(users, { fields: [googleOAuthTokens.userId], references: [users.id] }),
}));

export const quickbooksOAuthTokensRelations = relations(quickbooksOAuthTokens, ({ one }) => ({
  user: one(users, { fields: [quickbooksOAuthTokens.userId], references: [users.id] }),
}));

// ============================================
// CORE ENTITIES
// ============================================

export const companiesRelations = relations(companies, ({ one, many }) => ({
  parentCompany: one(companies, { fields: [companies.parentCompanyId], references: [companies.id] }),
  customers: many(customers),
  vendors: many(vendors),
  products: many(products),
  accounts: many(accounts),
  invoices: many(invoices),
  orders: many(orders),
  purchaseOrders: many(purchaseOrders),
  departments: many(departments),
  employees: many(employees),
  warehouses: many(warehouses),
  projects: many(projects),
  contracts: many(contracts),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  company: one(companies, { fields: [customers.companyId], references: [companies.id] }),
  invoices: many(invoices),
  orders: many(orders),
  payments: many(payments),
  contracts: many(contracts),
  salesOrders: many(salesOrders),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  company: one(companies, { fields: [vendors.companyId], references: [companies.id] }),
  purchaseOrders: many(purchaseOrders),
  payments: many(payments),
  contracts: many(contracts),
  vendorQuotes: many(vendorQuotes),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  company: one(companies, { fields: [products.companyId], references: [companies.id] }),
  invoiceItems: many(invoiceItems),
  orderItems: many(orderItems),
  purchaseOrderItems: many(purchaseOrderItems),
  inventory: many(inventory),
  salesOrderLines: many(salesOrderLines),
}));

// ============================================
// FINANCE
// ============================================

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  company: one(companies, { fields: [accounts.companyId], references: [companies.id] }),
  parentAccount: one(accounts, { fields: [accounts.parentAccountId], references: [accounts.id] }),
  transactionLines: many(transactionLines),
  payments: many(payments),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  product: one(products, { fields: [invoiceItems.productId], references: [products.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  account: one(accounts, { fields: [payments.accountId], references: [accounts.id] }),
  vendor: one(vendors, { fields: [payments.vendorId], references: [vendors.id] }),
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  company: one(companies, { fields: [transactions.companyId], references: [companies.id] }),
  lines: many(transactionLines),
}));

export const transactionLinesRelations = relations(transactionLines, ({ one }) => ({
  transaction: one(transactions, { fields: [transactionLines.transactionId], references: [transactions.id] }),
  account: one(accounts, { fields: [transactionLines.accountId], references: [accounts.id] }),
}));

// ============================================
// ORDERS & INVENTORY
// ============================================

export const ordersRelations = relations(orders, ({ one, many }) => ({
  company: one(companies, { fields: [orders.companyId], references: [companies.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, { fields: [inventory.productId], references: [products.id] }),
  company: one(companies, { fields: [inventory.companyId], references: [companies.id] }),
  warehouse: one(warehouses, { fields: [inventory.warehouseId], references: [warehouses.id] }),
}));

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
  company: one(companies, { fields: [warehouses.companyId], references: [companies.id] }),
  inventory: many(inventory),
}));

export const inventoryTransfersRelations = relations(inventoryTransfers, ({ one, many }) => ({
  fromWarehouse: one(warehouses, { fields: [inventoryTransfers.fromWarehouseId], references: [warehouses.id], relationName: "transfersFrom" }),
  toWarehouse: one(warehouses, { fields: [inventoryTransfers.toWarehouseId], references: [warehouses.id], relationName: "transfersTo" }),
  items: many(inventoryTransferItems),
}));

export const inventoryTransferItemsRelations = relations(inventoryTransferItems, ({ one }) => ({
  transfer: one(inventoryTransfers, { fields: [inventoryTransferItems.transferId], references: [inventoryTransfers.id] }),
}));

// ============================================
// PURCHASING
// ============================================

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  vendor: one(vendors, { fields: [purchaseOrders.vendorId], references: [vendors.id] }),
  company: one(companies, { fields: [purchaseOrders.companyId], references: [companies.id] }),
  items: many(purchaseOrderItems),
  shipments: many(shipments),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderItems.purchaseOrderId], references: [purchaseOrders.id] }),
  product: one(products, { fields: [purchaseOrderItems.productId], references: [products.id] }),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  company: one(companies, { fields: [shipments.companyId], references: [companies.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [shipments.purchaseOrderId], references: [purchaseOrders.id] }),
}));

// ============================================
// HR
// ============================================

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  company: one(companies, { fields: [departments.companyId], references: [companies.id] }),
  parentDepartment: one(departments, { fields: [departments.parentDepartmentId], references: [departments.id] }),
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  company: one(companies, { fields: [employees.companyId], references: [companies.id] }),
  department: one(departments, { fields: [employees.departmentId], references: [departments.id] }),
  manager: one(employees, { fields: [employees.managerId], references: [employees.id] }),
  compensationHistory: many(compensationHistory),
  employeePayments: many(employeePayments),
}));

export const compensationHistoryRelations = relations(compensationHistory, ({ one }) => ({
  employee: one(employees, { fields: [compensationHistory.employeeId], references: [employees.id] }),
}));

export const employeePaymentsRelations = relations(employeePayments, ({ one }) => ({
  employee: one(employees, { fields: [employeePayments.employeeId], references: [employees.id] }),
}));

// ============================================
// CONTRACTS & PROJECTS
// ============================================

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  company: one(companies, { fields: [contracts.companyId], references: [companies.id] }),
  customer: one(customers, { fields: [contracts.customerId], references: [customers.id] }),
  vendor: one(vendors, { fields: [contracts.vendorId], references: [vendors.id] }),
  keyDates: many(contractKeyDates),
}));

export const contractKeyDatesRelations = relations(contractKeyDates, ({ one }) => ({
  contract: one(contracts, { fields: [contractKeyDates.contractId], references: [contracts.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, { fields: [projects.companyId], references: [companies.id] }),
  milestones: many(projectMilestones),
  tasks: many(projectTasks),
}));

export const projectMilestonesRelations = relations(projectMilestones, ({ one, many }) => ({
  project: one(projects, { fields: [projectMilestones.projectId], references: [projects.id] }),
  tasks: many(projectTasks),
}));

export const projectTasksRelations = relations(projectTasks, ({ one }) => ({
  project: one(projects, { fields: [projectTasks.projectId], references: [projects.id] }),
  milestone: one(projectMilestones, { fields: [projectTasks.milestoneId], references: [projectMilestones.id] }),
}));

// ============================================
// AUDIT & SYSTEM
// ============================================

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, { fields: [aiMessages.conversationId], references: [aiConversations.id] }),
}));

// ============================================
// MANUFACTURING (BOM & Work Orders)
// ============================================

export const billOfMaterialsRelations = relations(billOfMaterials, ({ many }) => ({
  components: many(bomComponents),
  workOrders: many(workOrders),
}));

export const bomComponentsRelations = relations(bomComponents, ({ one }) => ({
  bom: one(billOfMaterials, { fields: [bomComponents.bomId], references: [billOfMaterials.id] }),
  rawMaterial: one(rawMaterials, { fields: [bomComponents.rawMaterialId], references: [rawMaterials.id] }),
}));

export const rawMaterialsRelations = relations(rawMaterials, ({ many }) => ({
  bomComponents: many(bomComponents),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  bom: one(billOfMaterials, { fields: [workOrders.bomId], references: [billOfMaterials.id] }),
  materials: many(workOrderMaterials),
}));

export const workOrderMaterialsRelations = relations(workOrderMaterials, ({ one }) => ({
  workOrder: one(workOrders, { fields: [workOrderMaterials.workOrderId], references: [workOrders.id] }),
}));

// ============================================
// SALES
// ============================================

export const salesOrdersRelations = relations(salesOrders, ({ one, many }) => ({
  customer: one(customers, { fields: [salesOrders.customerId], references: [customers.id] }),
  lines: many(salesOrderLines),
}));

export const salesOrderLinesRelations = relations(salesOrderLines, ({ one }) => ({
  salesOrder: one(salesOrders, { fields: [salesOrderLines.salesOrderId], references: [salesOrders.id] }),
  product: one(products, { fields: [salesOrderLines.productId], references: [products.id] }),
}));

// ============================================
// DATA ROOMS
// ============================================

export const dataRoomsRelations = relations(dataRooms, ({ many }) => ({
  folders: many(dataRoomFolders),
  documents: many(dataRoomDocuments),
  links: many(dataRoomLinks),
  visitors: many(dataRoomVisitors),
}));

export const dataRoomFoldersRelations = relations(dataRoomFolders, ({ one, many }) => ({
  dataRoom: one(dataRooms, { fields: [dataRoomFolders.dataRoomId], references: [dataRooms.id] }),
  documents: many(dataRoomDocuments),
}));

export const dataRoomDocumentsRelations = relations(dataRoomDocuments, ({ one }) => ({
  dataRoom: one(dataRooms, { fields: [dataRoomDocuments.dataRoomId], references: [dataRooms.id] }),
  folder: one(dataRoomFolders, { fields: [dataRoomDocuments.folderId], references: [dataRoomFolders.id] }),
}));

export const dataRoomLinksRelations = relations(dataRoomLinks, ({ one }) => ({
  dataRoom: one(dataRooms, { fields: [dataRoomLinks.dataRoomId], references: [dataRooms.id] }),
}));

export const dataRoomVisitorsRelations = relations(dataRoomVisitors, ({ one }) => ({
  dataRoom: one(dataRooms, { fields: [dataRoomVisitors.dataRoomId], references: [dataRooms.id] }),
}));

// ============================================
// CRM
// ============================================

export const crmContactsRelations = relations(crmContacts, ({ many }) => ({
  tags: many(crmContactTags),
  deals: many(crmDeals),
}));

export const crmTagsRelations = relations(crmTags, ({ many }) => ({
  contactTags: many(crmContactTags),
}));

export const crmContactTagsRelations = relations(crmContactTags, ({ one }) => ({
  contact: one(crmContacts, { fields: [crmContactTags.contactId], references: [crmContacts.id] }),
  tag: one(crmTags, { fields: [crmContactTags.tagId], references: [crmTags.id] }),
}));

export const crmPipelinesRelations = relations(crmPipelines, ({ many }) => ({
  deals: many(crmDeals),
}));

export const crmDealsRelations = relations(crmDeals, ({ one }) => ({
  contact: one(crmContacts, { fields: [crmDeals.contactId], references: [crmContacts.id] }),
  pipeline: one(crmPipelines, { fields: [crmDeals.pipelineId], references: [crmPipelines.id] }),
}));

// ============================================
// VENDOR RFQs
// ============================================

export const vendorRfqsRelations = relations(vendorRfqs, ({ many }) => ({
  quotes: many(vendorQuotes),
}));

export const vendorQuotesRelations = relations(vendorQuotes, ({ one }) => ({
  rfq: one(vendorRfqs, { fields: [vendorQuotes.rfqId], references: [vendorRfqs.id] }),
  vendor: one(vendors, { fields: [vendorQuotes.vendorId], references: [vendors.id] }),
}));

// ============================================
// SUPPLY CHAIN WORKFLOWS
// ============================================

export const supplyChainWorkflowsRelations = relations(supplyChainWorkflows, ({ many }) => ({
  runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
  workflow: one(supplyChainWorkflows, { fields: [workflowRuns.workflowId], references: [supplyChainWorkflows.id] }),
  steps: many(workflowSteps),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  run: one(workflowRuns, { fields: [workflowSteps.runId], references: [workflowRuns.id] }),
}));

// ============================================
// EDI
// ============================================

export const ediTradingPartnersRelations = relations(ediTradingPartners, ({ many }) => ({
  transactions: many(ediTransactions),
}));

export const ediTransactionsRelations = relations(ediTransactions, ({ one, many }) => ({
  partner: one(ediTradingPartners, { fields: [ediTransactions.partnerId], references: [ediTradingPartners.id] }),
  items: many(ediTransactionItems),
}));

export const ediTransactionItemsRelations = relations(ediTransactionItems, ({ one }) => ({
  transaction: one(ediTransactions, { fields: [ediTransactionItems.transactionId], references: [ediTransactions.id] }),
}));

// ============================================
// QUICKBOOKS
// ============================================

export const quickbooksAccountsRelations = relations(quickbooksAccounts, ({ one }) => ({
  company: one(companies, { fields: [quickbooksAccounts.companyId], references: [companies.id] }),
}));

export const quickbooksAccountMappingsRelations = relations(quickbooksAccountMappings, ({ one }) => ({
  company: one(companies, { fields: [quickbooksAccountMappings.companyId], references: [companies.id] }),
}));

export const quickbooksItemsRelations = relations(quickbooksItems, ({ one }) => ({
  company: one(companies, { fields: [quickbooksItems.companyId], references: [companies.id] }),
  product: one(products, { fields: [quickbooksItems.productId], references: [products.id] }),
}));
