import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, bigint } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

// ============================================
// USER & ACCESS CONTROL
// ============================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "finance", "ops", "legal", "exec", "copacker", "vendor", "contractor"]).default("user").notNull(),
  departmentId: int("departmentId"),
  avatarUrl: text("avatarUrl"),
  phone: varchar("phone", { length: 32 }),
  // For external users (copackers, vendors), link to their entity
  linkedVendorId: int("linkedVendorId"),
  linkedWarehouseId: int("linkedWarehouseId"),
  isActive: boolean("isActive").default(true).notNull(),
  invitedBy: int("invitedBy"),
  invitedAt: timestamp("invitedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Team invitations for onboarding new users
export const teamInvitations = mysqlTable("teamInvitations", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["user", "admin", "finance", "ops", "legal", "exec", "copacker", "vendor", "contractor"]).default("user").notNull(),
  inviteCode: varchar("inviteCode", { length: 64 }).notNull().unique(),
  invitedBy: int("invitedBy").notNull(),
  linkedVendorId: int("linkedVendorId"),
  linkedWarehouseId: int("linkedWarehouseId"),
  customPermissions: text("customPermissions"), // JSON array of permission keys
  status: mysqlEnum("status", ["pending", "accepted", "expired", "revoked"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  acceptedByUserId: int("acceptedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type InsertTeamInvitation = typeof teamInvitations.$inferInsert;

// User permissions for granular access control
export const userPermissions = mysqlTable("userPermissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  permission: varchar("permission", { length: 64 }).notNull(), // e.g., 'inventory.update', 'shipments.upload'
  grantedBy: int("grantedBy").notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
});

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;

// Google OAuth tokens for Drive/Sheets access
export const googleOAuthTokens = mysqlTable("googleOAuthTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  tokenType: varchar("tokenType", { length: 32 }).default("Bearer"),
  expiresAt: timestamp("expiresAt"),
  scope: text("scope"),
  googleEmail: varchar("googleEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GoogleOAuthToken = typeof googleOAuthTokens.$inferSelect;
export type InsertGoogleOAuthToken = typeof googleOAuthTokens.$inferInsert;

// ============================================
// CORE ENTITIES
// ============================================

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  legalName: varchar("legalName", { length: 255 }),
  taxId: varchar("taxId", { length: 64 }),
  type: mysqlEnum("type", ["parent", "subsidiary", "branch"]).default("parent").notNull(),
  parentCompanyId: int("parentCompanyId"),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 512 }),
  industry: varchar("industry", { length: 128 }),
  status: mysqlEnum("status", ["active", "inactive", "pending"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),
  type: mysqlEnum("type", ["individual", "business"]).default("business").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "prospect"]).default("active").notNull(),
  creditLimit: decimal("creditLimit", { precision: 15, scale: 2 }),
  paymentTerms: int("paymentTerms").default(30),
  notes: text("notes"),
  shopifyCustomerId: varchar("shopifyCustomerId", { length: 64 }),
  quickbooksCustomerId: varchar("quickbooksCustomerId", { length: 64 }),
  hubspotContactId: varchar("hubspotContactId", { length: 64 }),
  syncSource: mysqlEnum("syncSource", ["manual", "shopify", "hubspot", "quickbooks"]).default("manual"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  shopifyData: text("shopifyData"),
  hubspotData: text("hubspotData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const vendors = mysqlTable("vendors", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),
  type: mysqlEnum("type", ["supplier", "contractor", "service"]).default("supplier").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "pending"]).default("active").notNull(),
  paymentTerms: int("paymentTerms").default(30),
  taxId: varchar("taxId", { length: 64 }),
  bankAccount: varchar("bankAccount", { length: 128 }),
  bankRouting: varchar("bankRouting", { length: 64 }),
  notes: text("notes"),
  quickbooksVendorId: varchar("quickbooksVendorId", { length: 64 }),
  defaultLeadTimeDays: int("defaultLeadTimeDays").default(14), // Default lead time for this vendor
  minOrderAmount: decimal("minOrderAmount", { precision: 12, scale: 2 }), // Minimum order amount
  shippingMethod: varchar("shippingMethod", { length: 64 }), // Preferred shipping method
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  sku: varchar("sku", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  type: mysqlEnum("type", ["physical", "digital", "service"]).default("physical").notNull(),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  costPrice: decimal("costPrice", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  taxable: boolean("taxable").default(true),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["active", "inactive", "discontinued"]).default("active").notNull(),
  shopifyProductId: varchar("shopifyProductId", { length: 64 }),
  quickbooksItemId: varchar("quickbooksItemId", { length: 64 }),
  preferredVendorId: int("preferredVendorId"), // Preferred vendor for auto-purchase orders
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// FINANCE MODULE
// ============================================

export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  subtype: varchar("subtype", { length: 64 }),
  description: text("description"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  isActive: boolean("isActive").default(true),
  parentAccountId: int("parentAccountId"),
  quickbooksAccountId: varchar("quickbooksAccountId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  customerId: int("customerId"),
  type: mysqlEnum("type", ["invoice", "credit_note", "quote"]).default("invoice").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "paid", "partial", "overdue", "cancelled"]).default("draft").notNull(),
  issueDate: timestamp("issueDate").notNull(),
  dueDate: timestamp("dueDate"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0"),
  discountAmount: decimal("discountAmount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: decimal("paidAmount", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  notes: text("notes"),
  terms: text("terms"),
  quickbooksInvoiceId: varchar("quickbooksInvoiceId", { length: 64 }),
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const invoiceItems = mysqlTable("invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  productId: int("productId"),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0"),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0"),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  paymentNumber: varchar("paymentNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["received", "made"]).notNull(),
  invoiceId: int("invoiceId"),
  vendorId: int("vendorId"),
  customerId: int("customerId"),
  accountId: int("accountId"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "check", "bank_transfer", "credit_card", "ach", "wire", "other"]).default("bank_transfer"),
  paymentDate: timestamp("paymentDate").notNull(),
  referenceNumber: varchar("referenceNumber", { length: 128 }),
  status: mysqlEnum("status", ["pending", "completed", "failed", "cancelled"]).default("pending").notNull(),
  notes: text("notes"),
  quickbooksPaymentId: varchar("quickbooksPaymentId", { length: 64 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  transactionNumber: varchar("transactionNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["journal", "invoice", "payment", "expense", "transfer", "adjustment"]).notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  date: timestamp("date").notNull(),
  description: text("description"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["draft", "posted", "void"]).default("draft").notNull(),
  createdBy: int("createdBy"),
  postedBy: int("postedBy"),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const transactionLines = mysqlTable("transaction_lines", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  accountId: int("accountId").notNull(),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// SALES MODULE
// ============================================

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  orderNumber: varchar("orderNumber", { length: 64 }).notNull(),
  customerId: int("customerId"),
  type: mysqlEnum("type", ["sales", "return"]).default("sales").notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]).default("pending").notNull(),
  orderDate: timestamp("orderDate").notNull(),
  shippingAddress: text("shippingAddress"),
  billingAddress: text("billingAddress"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0"),
  shippingAmount: decimal("shippingAmount", { precision: 15, scale: 2 }).default("0"),
  discountAmount: decimal("discountAmount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  notes: text("notes"),
  shopifyOrderId: varchar("shopifyOrderId", { length: 64 }),
  invoiceId: int("invoiceId"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId"),
  sku: varchar("sku", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0"),
  discountAmount: decimal("discountAmount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// OPERATIONS MODULE
// ============================================

export const inventory = mysqlTable("inventory", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId"),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  reservedQuantity: decimal("reservedQuantity", { precision: 15, scale: 4 }).default("0"),
  reorderLevel: decimal("reorderLevel", { precision: 15, scale: 4 }),
  reorderQuantity: decimal("reorderQuantity", { precision: 15, scale: 4 }),
  lastCountDate: timestamp("lastCountDate"),
  lastCountQuantity: decimal("lastCountQuantity", { precision: 15, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const warehouses = mysqlTable("warehouses", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),
  type: mysqlEnum("type", ["warehouse", "store", "distribution", "copacker", "3pl"]).default("warehouse").notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  isPrimary: boolean("isPrimary").default(false),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Warehouse = typeof warehouses.$inferSelect;
export type InsertWarehouse = typeof warehouses.$inferInsert;

// Inventory transfers between locations
export const inventoryTransfers = mysqlTable("inventory_transfers", {
  id: int("id").autoincrement().primaryKey(),
  transferNumber: varchar("transferNumber", { length: 64 }).notNull(),
  fromWarehouseId: int("fromWarehouseId").notNull(),
  toWarehouseId: int("toWarehouseId").notNull(),
  status: mysqlEnum("status", ["draft", "pending", "in_transit", "received", "cancelled"]).default("draft").notNull(),
  requestedDate: timestamp("requestedDate").notNull(),
  shippedDate: timestamp("shippedDate"),
  receivedDate: timestamp("receivedDate"),
  expectedArrival: timestamp("expectedArrival"),
  trackingNumber: varchar("trackingNumber", { length: 128 }),
  carrier: varchar("carrier", { length: 128 }),
  notes: text("notes"),
  requestedBy: int("requestedBy"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryTransfer = typeof inventoryTransfers.$inferSelect;
export type InsertInventoryTransfer = typeof inventoryTransfers.$inferInsert;

// Transfer line items
export const inventoryTransferItems = mysqlTable("inventory_transfer_items", {
  id: int("id").autoincrement().primaryKey(),
  transferId: int("transferId").notNull(),
  productId: int("productId").notNull(),
  requestedQuantity: decimal("requestedQuantity", { precision: 15, scale: 4 }).notNull(),
  shippedQuantity: decimal("shippedQuantity", { precision: 15, scale: 4 }),
  receivedQuantity: decimal("receivedQuantity", { precision: 15, scale: 4 }),
  lotNumber: varchar("lotNumber", { length: 64 }),
  expirationDate: timestamp("expirationDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryTransferItem = typeof inventoryTransferItems.$inferSelect;
export type InsertInventoryTransferItem = typeof inventoryTransferItems.$inferInsert;

export const productionBatches = mysqlTable("production_batches", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  batchNumber: varchar("batchNumber", { length: 64 }).notNull(),
  productId: int("productId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "cancelled"]).default("planned").notNull(),
  startDate: timestamp("startDate"),
  completionDate: timestamp("completionDate"),
  warehouseId: int("warehouseId"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  poNumber: varchar("poNumber", { length: 64 }).notNull(),
  vendorId: int("vendorId").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "confirmed", "partial", "received", "cancelled"]).default("draft").notNull(),
  orderDate: timestamp("orderDate").notNull(),
  expectedDate: timestamp("expectedDate"),
  receivedDate: timestamp("receivedDate"),
  shippingAddress: text("shippingAddress"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0"),
  shippingAmount: decimal("shippingAmount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  productId: int("productId"),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  receivedQuantity: decimal("receivedQuantity", { precision: 15, scale: 4 }).default("0"),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const shipments = mysqlTable("shipments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  shipmentNumber: varchar("shipmentNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["inbound", "outbound"]).notNull(),
  orderId: int("orderId"),
  purchaseOrderId: int("purchaseOrderId"),
  carrier: varchar("carrier", { length: 128 }),
  trackingNumber: varchar("trackingNumber", { length: 128 }),
  status: mysqlEnum("status", ["pending", "in_transit", "delivered", "returned", "cancelled"]).default("pending").notNull(),
  shipDate: timestamp("shipDate"),
  deliveryDate: timestamp("deliveryDate"),
  fromAddress: text("fromAddress"),
  toAddress: text("toAddress"),
  weight: decimal("weight", { precision: 10, scale: 2 }),
  cost: decimal("cost", { precision: 15, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// HR MODULE
// ============================================

export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 32 }),
  parentDepartmentId: int("parentDepartmentId"),
  managerId: int("managerId"),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  userId: int("userId"),
  employeeNumber: varchar("employeeNumber", { length: 32 }),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  personalEmail: varchar("personalEmail", { length: 320 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),
  dateOfBirth: timestamp("dateOfBirth"),
  hireDate: timestamp("hireDate"),
  terminationDate: timestamp("terminationDate"),
  departmentId: int("departmentId"),
  managerId: int("managerId"),
  jobTitle: varchar("jobTitle", { length: 255 }),
  employmentType: mysqlEnum("employmentType", ["full_time", "part_time", "contractor", "intern"]).default("full_time").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "on_leave", "terminated"]).default("active").notNull(),
  salary: decimal("salary", { precision: 15, scale: 2 }),
  salaryFrequency: mysqlEnum("salaryFrequency", ["hourly", "weekly", "biweekly", "monthly", "annual"]).default("annual"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  bankAccount: varchar("bankAccount", { length: 128 }),
  bankRouting: varchar("bankRouting", { length: 64 }),
  taxId: varchar("taxId", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const compensationHistory = mysqlTable("compensation_history", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  effectiveDate: timestamp("effectiveDate").notNull(),
  salary: decimal("salary", { precision: 15, scale: 2 }).notNull(),
  salaryFrequency: mysqlEnum("salaryFrequency", ["hourly", "weekly", "biweekly", "monthly", "annual"]).default("annual"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  reason: varchar("reason", { length: 255 }),
  approvedBy: int("approvedBy"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const employeePayments = mysqlTable("employee_payments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  employeeId: int("employeeId").notNull(),
  paymentNumber: varchar("paymentNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["salary", "bonus", "commission", "reimbursement", "other"]).default("salary").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentDate: timestamp("paymentDate").notNull(),
  payPeriodStart: timestamp("payPeriodStart"),
  payPeriodEnd: timestamp("payPeriodEnd"),
  paymentMethod: mysqlEnum("paymentMethod", ["check", "direct_deposit", "wire", "other"]).default("direct_deposit"),
  status: mysqlEnum("status", ["pending", "processed", "cancelled"]).default("pending").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// LEGAL MODULE
// ============================================

export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  contractNumber: varchar("contractNumber", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["customer", "vendor", "employment", "nda", "partnership", "lease", "service", "other"]).notNull(),
  status: mysqlEnum("status", ["draft", "pending_review", "pending_signature", "active", "expired", "terminated", "renewed"]).default("draft").notNull(),
  partyType: mysqlEnum("partyType", ["customer", "vendor", "employee", "other"]),
  partyId: int("partyId"),
  partyName: varchar("partyName", { length: 255 }),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  renewalDate: timestamp("renewalDate"),
  autoRenewal: boolean("autoRenewal").default(false),
  value: decimal("value", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  description: text("description"),
  terms: text("terms"),
  documentUrl: text("documentUrl"),
  signedDocumentUrl: text("signedDocumentUrl"),
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const contractKeyDates = mysqlTable("contract_key_dates", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  dateType: varchar("dateType", { length: 64 }).notNull(),
  date: timestamp("date").notNull(),
  description: text("description"),
  reminderDays: int("reminderDays").default(30),
  reminderSent: boolean("reminderSent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const disputes = mysqlTable("disputes", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  disputeNumber: varchar("disputeNumber", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["customer", "vendor", "employee", "legal", "regulatory", "other"]).notNull(),
  status: mysqlEnum("status", ["open", "investigating", "negotiating", "resolved", "escalated", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  partyType: mysqlEnum("partyType", ["customer", "vendor", "employee", "other"]),
  partyId: int("partyId"),
  partyName: varchar("partyName", { length: 255 }),
  contractId: int("contractId"),
  description: text("description"),
  resolution: text("resolution"),
  estimatedValue: decimal("estimatedValue", { precision: 15, scale: 2 }),
  actualValue: decimal("actualValue", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  filedDate: timestamp("filedDate"),
  resolvedDate: timestamp("resolvedDate"),
  assignedTo: int("assignedTo"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["contract", "invoice", "receipt", "report", "legal", "hr", "other"]).notNull(),
  category: varchar("category", { length: 128 }),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 128 }),
  description: text("description"),
  tags: json("tags"),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// PROJECTS MODULE
// ============================================

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  projectNumber: varchar("projectNumber", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["internal", "client", "product", "research", "other"]).default("internal").notNull(),
  status: mysqlEnum("status", ["planning", "active", "on_hold", "completed", "cancelled"]).default("planning").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  ownerId: int("ownerId"),
  departmentId: int("departmentId"),
  startDate: timestamp("startDate"),
  targetEndDate: timestamp("targetEndDate"),
  actualEndDate: timestamp("actualEndDate"),
  budget: decimal("budget", { precision: 15, scale: 2 }),
  actualCost: decimal("actualCost", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  progress: int("progress").default(0),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const projectMilestones = mysqlTable("project_milestones", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: timestamp("dueDate"),
  completedDate: timestamp("completedDate"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "overdue"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const projectTasks = mysqlTable("project_tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  milestoneId: int("milestoneId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  assigneeId: int("assigneeId"),
  status: mysqlEnum("status", ["todo", "in_progress", "review", "completed", "cancelled"]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  dueDate: timestamp("dueDate"),
  completedDate: timestamp("completedDate"),
  estimatedHours: decimal("estimatedHours", { precision: 10, scale: 2 }),
  actualHours: decimal("actualHours", { precision: 10, scale: 2 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// AUDIT & SYSTEM
// ============================================

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  userId: int("userId"),
  action: mysqlEnum("action", ["create", "update", "delete", "view", "export", "approve", "reject"]).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: int("entityId"),
  entityName: varchar("entityName", { length: 255 }),
  oldValues: json("oldValues"),
  newValues: json("newValues"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notificationTypeEnum = mysqlEnum("notification_type", [
  "shipping_update",
  "inventory_low",
  "inventory_received",
  "inventory_adjustment",
  "po_approved",
  "po_shipped",
  "po_received",
  "po_fulfilled",
  "work_order_started",
  "work_order_completed",
  "work_order_shortage",
  "sales_order_new",
  "sales_order_shipped",
  "sales_order_delivered",
  "alert",
  "system",
  "info",
  "warning",
  "error",
  "success",
  "reminder",
]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: notificationTypeEnum.default("info").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  link: varchar("link", { length: 512 }),
  entityType: varchar("entityType", { length: 50 }), // e.g., "shipment", "purchase_order", "inventory"
  entityId: int("entityId"),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("info"),
  isRead: boolean("isRead").default(false),
  readAt: timestamp("readAt"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  notificationType: varchar("notificationType", { length: 50 }).notNull(),
  inApp: boolean("inApp").default(true),
  email: boolean("email").default(false),
  push: boolean("push").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const integrationConfigs = mysqlTable("integration_configs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  type: mysqlEnum("type", ["quickbooks", "shopify", "stripe", "slack", "email", "webhook"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  config: json("config"),
  credentials: json("credentials"),
  isActive: boolean("isActive").default(true),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aiConversations = mysqlTable("ai_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aiMessages = mysqlTable("ai_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// EMAIL SCANNING & DOCUMENT PARSING
// ============================================

export const emailParsingStatusEnum = mysqlEnum("email_parsing_status", [
  "pending",
  "processing",
  "parsed",
  "failed",
  "reviewed",
  "archived",
]);

export const parsedDocumentTypeEnum = mysqlEnum("parsed_document_type", [
  "receipt",
  "invoice",
  "purchase_order",
  "bill_of_lading",
  "packing_list",
  "customs_document",
  "freight_quote",
  "shipping_label",
  "other",
]);

// Email category enum for automatic classification
export const emailCategoryEnum = mysqlEnum("email_category", [
  "receipt",
  "purchase_order",
  "invoice",
  "shipping_confirmation",
  "freight_quote",
  "delivery_notification",
  "order_confirmation",
  "payment_confirmation",
  "general",
]);

export const emailPriorityEnum = mysqlEnum("email_priority", [
  "high",
  "medium",
  "low",
]);

export const inboundEmails = mysqlTable("inbound_emails", {
  id: int("id").autoincrement().primaryKey(),
  messageId: varchar("messageId", { length: 255 }).unique(),
  fromEmail: varchar("fromEmail", { length: 255 }).notNull(),
  fromName: varchar("fromName", { length: 255 }),
  toEmail: varchar("toEmail", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  bodyText: text("bodyText"),
  bodyHtml: text("bodyHtml"),
  receivedAt: timestamp("receivedAt").notNull(),
  parsingStatus: emailParsingStatusEnum.default("pending").notNull(),
  parsedAt: timestamp("parsedAt"),
  errorMessage: text("errorMessage"),
  // Auto-categorization fields
  category: emailCategoryEnum.default("general"),
  categoryConfidence: decimal("categoryConfidence", { precision: 5, scale: 2 }),
  categoryKeywords: json("categoryKeywords"), // Array of keywords that influenced categorization
  suggestedAction: varchar("suggestedAction", { length: 255 }),
  priority: emailPriorityEnum.default("medium"),
  subcategory: varchar("subcategory", { length: 100 }),
  rawHeaders: json("rawHeaders"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const emailAttachments = mysqlTable("email_attachments", {
  id: int("id").autoincrement().primaryKey(),
  emailId: int("emailId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  size: int("size"),
  storageUrl: varchar("storageUrl", { length: 512 }),
  storageKey: varchar("storageKey", { length: 255 }),
  isProcessed: boolean("isProcessed").default(false),
  extractedText: text("extractedText"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const parsedDocuments = mysqlTable("parsed_documents", {
  id: int("id").autoincrement().primaryKey(),
  emailId: int("emailId"),
  attachmentId: int("attachmentId"),
  documentType: parsedDocumentTypeEnum.notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  
  // Common fields
  vendorName: varchar("vendorName", { length: 255 }),
  vendorEmail: varchar("vendorEmail", { length: 255 }),
  vendorId: int("vendorId"), // Link to existing vendor if matched
  documentNumber: varchar("documentNumber", { length: 100 }), // Invoice #, PO #, Receipt #
  documentDate: timestamp("documentDate"),
  dueDate: timestamp("dueDate"),
  
  // Financial fields
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  shippingAmount: decimal("shippingAmount", { precision: 12, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Freight-specific fields
  trackingNumber: varchar("trackingNumber", { length: 100 }),
  carrierName: varchar("carrierName", { length: 255 }),
  shipmentId: int("shipmentId"), // Link to existing shipment
  
  // PO-specific fields
  purchaseOrderId: int("purchaseOrderId"), // Link to existing PO
  
  // Line items stored as JSON
  lineItems: json("lineItems"), // Array of {description, quantity, unitPrice, total, sku?}
  
  // Processing status
  isReviewed: boolean("isReviewed").default(false),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  isApproved: boolean("isApproved").default(false),
  
  // Created records
  createdTransactionId: int("createdTransactionId"),
  createdVendorId: int("createdVendorId"),
  
  rawExtractedData: json("rawExtractedData"), // Full AI extraction result
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Auto-reply rules for email automation
export const autoReplyRules = mysqlTable("auto_reply_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: emailCategoryEnum.notNull(), // Which email category triggers this rule
  isEnabled: boolean("isEnabled").default(true).notNull(),
  priority: int("priority").default(0).notNull(), // Higher = runs first
  
  // Conditions
  senderPattern: varchar("senderPattern", { length: 255 }), // Regex or wildcard for sender email
  subjectPattern: varchar("subjectPattern", { length: 255 }), // Regex or wildcard for subject
  bodyKeywords: json("bodyKeywords"), // Array of keywords that must be present
  minConfidence: decimal("minConfidence", { precision: 5, scale: 2 }).default("0.7"), // Min category confidence
  
  // Reply configuration
  replyTemplate: text("replyTemplate").notNull(), // Template with {{placeholders}}
  replySubjectPrefix: varchar("replySubjectPrefix", { length: 100 }).default("Re:"),
  tone: mysqlEnum("tone", ["professional", "friendly", "formal"]).default("professional"),
  includeOriginal: boolean("includeOriginal").default(true),
  
  // Timing
  delayMinutes: int("delayMinutes").default(0), // Delay before sending (0 = immediate)
  
  // Actions
  autoSend: boolean("autoSend").default(false), // If false, queue for approval
  createTask: boolean("createTask").default(true), // Create AI agent task
  notifyOwner: boolean("notifyOwner").default(false),
  
  // Stats
  timesTriggered: int("timesTriggered").default(0),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutoReplyRule = typeof autoReplyRules.$inferSelect;
export type InsertAutoReplyRule = typeof autoReplyRules.$inferInsert;

// Sent/Outbound emails for tracking
export const sentEmails = mysqlTable("sent_emails", {
  id: int("id").autoincrement().primaryKey(),
  inboundEmailId: int("inboundEmailId"), // If this is a reply to an inbound email
  relatedEntityType: varchar("relatedEntityType", { length: 50 }), // 'purchase_order', 'invoice', 'rfq', etc.
  relatedEntityId: int("relatedEntityId"), // ID of the related entity
  toEmail: varchar("toEmail", { length: 255 }).notNull(),
  toName: varchar("toName", { length: 255 }),
  fromEmail: varchar("fromEmail", { length: 255 }).notNull(),
  fromName: varchar("fromName", { length: 255 }),
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyHtml: text("bodyHtml"),
  bodyText: text("bodyText"),
  status: mysqlEnum("status", ["queued", "sent", "delivered", "failed", "bounced"]).default("queued").notNull(),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  errorMessage: text("errorMessage"),
  messageId: varchar("messageId", { length: 255 }), // Email provider message ID
  threadId: varchar("threadId", { length: 255 }), // For threading replies
  sentBy: int("sentBy"), // User who sent it
  aiGenerated: boolean("aiGenerated").default(false),
  aiTaskId: int("aiTaskId"), // Link to AI agent task if AI-generated
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SentEmail = typeof sentEmails.$inferSelect;
export type InsertSentEmail = typeof sentEmails.$inferInsert;

export const parsedDocumentLineItems = mysqlTable("parsed_document_line_items", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  lineNumber: int("lineNumber").default(1),
  description: varchar("description", { length: 500 }),
  sku: varchar("sku", { length: 100 }),
  quantity: decimal("quantity", { precision: 12, scale: 4 }),
  unit: varchar("unit", { length: 50 }),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 4 }),
  totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }),
  productId: int("productId"), // Matched product
  rawMaterialId: int("rawMaterialId"), // Matched raw material
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export type Inventory = typeof inventory.$inferSelect;
export type InsertInventory = typeof inventory.$inferInsert;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;

export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = typeof disputes.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ============================================
// FREIGHT & LOGISTICS MANAGEMENT
// ============================================

// Freight carriers and forwarders database
export const freightCarriers = mysqlTable("freightCarriers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["ocean", "air", "ground", "rail", "multimodal"]).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  address: text("address"),
  country: varchar("country", { length: 100 }),
  website: varchar("website", { length: 500 }),
  notes: text("notes"),
  rating: int("rating"), // 1-5 star rating
  isPreferred: boolean("isPreferred").default(false),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Freight Request for Quotes (RFQ)
export const freightRfqs = mysqlTable("freightRfqs", {
  id: int("id").autoincrement().primaryKey(),
  rfqNumber: varchar("rfqNumber", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "awaiting_quotes", "quotes_received", "awarded", "cancelled"]).default("draft").notNull(),
  
  // Shipment details
  originCountry: varchar("originCountry", { length: 100 }),
  originCity: varchar("originCity", { length: 255 }),
  originAddress: text("originAddress"),
  destinationCountry: varchar("destinationCountry", { length: 100 }),
  destinationCity: varchar("destinationCity", { length: 255 }),
  destinationAddress: text("destinationAddress"),
  
  // Cargo details
  cargoDescription: text("cargoDescription"),
  cargoType: mysqlEnum("cargoType", ["general", "hazardous", "refrigerated", "oversized", "fragile", "liquid", "bulk"]).default("general"),
  totalWeight: decimal("totalWeight", { precision: 12, scale: 2 }), // in kg
  totalVolume: decimal("totalVolume", { precision: 12, scale: 2 }), // in cbm
  numberOfPackages: int("numberOfPackages"),
  dimensions: text("dimensions"), // JSON string for package dimensions
  hsCode: varchar("hsCode", { length: 20 }),
  declaredValue: decimal("declaredValue", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Shipping preferences
  preferredMode: mysqlEnum("preferredMode", ["ocean_fcl", "ocean_lcl", "air", "express", "ground", "rail", "any"]).default("any"),
  incoterms: varchar("incoterms", { length: 10 }), // EXW, FOB, CIF, DDP, etc.
  requiredPickupDate: timestamp("requiredPickupDate"),
  requiredDeliveryDate: timestamp("requiredDeliveryDate"),
  insuranceRequired: boolean("insuranceRequired").default(false),
  customsClearanceRequired: boolean("customsClearanceRequired").default(true),
  
  // Related records
  purchaseOrderId: int("purchaseOrderId"),
  vendorId: int("vendorId"),
  
  // Metadata
  notes: text("notes"),
  createdById: int("createdById"),
  quoteDueDate: timestamp("quoteDueDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Freight quotes received from carriers
export const freightQuotes = mysqlTable("freightQuotes", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  carrierId: int("carrierId").notNull(),
  quoteNumber: varchar("quoteNumber", { length: 50 }),
  status: mysqlEnum("status", ["pending", "received", "under_review", "accepted", "rejected", "expired"]).default("pending").notNull(),
  
  // Pricing
  freightCost: decimal("freightCost", { precision: 15, scale: 2 }),
  fuelSurcharge: decimal("fuelSurcharge", { precision: 15, scale: 2 }),
  originCharges: decimal("originCharges", { precision: 15, scale: 2 }),
  destinationCharges: decimal("destinationCharges", { precision: 15, scale: 2 }),
  customsFees: decimal("customsFees", { precision: 15, scale: 2 }),
  insuranceCost: decimal("insuranceCost", { precision: 15, scale: 2 }),
  otherCharges: decimal("otherCharges", { precision: 15, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Transit details
  transitDays: int("transitDays"),
  shippingMode: varchar("shippingMode", { length: 50 }),
  routeDescription: text("routeDescription"),
  validUntil: timestamp("validUntil"),
  
  // AI analysis
  aiScore: int("aiScore"), // AI-generated score 1-100
  aiAnalysis: text("aiAnalysis"), // AI-generated analysis
  aiRecommendation: text("aiRecommendation"),
  
  // Communication
  receivedVia: mysqlEnum("receivedVia", ["email", "portal", "phone", "manual"]).default("email"),
  emailThreadId: varchar("emailThreadId", { length: 255 }),
  rawEmailContent: text("rawEmailContent"),
  
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// AI Email communications for freight
export const freightEmails = mysqlTable("freightEmails", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId"),
  carrierId: int("carrierId"),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).notNull(),
  emailType: mysqlEnum("emailType", ["rfq_request", "quote_response", "follow_up", "clarification", "booking_confirmation", "document_request", "customs_update", "other"]).notNull(),
  
  // Email details
  fromEmail: varchar("fromEmail", { length: 320 }),
  toEmail: varchar("toEmail", { length: 320 }),
  ccEmails: text("ccEmails"),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  htmlBody: text("htmlBody"),
  
  // AI processing
  aiGenerated: boolean("aiGenerated").default(false),
  aiParsed: boolean("aiParsed").default(false),
  aiExtractedData: text("aiExtractedData"), // JSON of extracted quote data
  
  // Status
  status: mysqlEnum("status", ["draft", "sent", "delivered", "read", "replied", "failed"]).default("draft"),
  sentAt: timestamp("sentAt"),
  readAt: timestamp("readAt"),
  
  // Attachments stored in S3
  attachments: text("attachments"), // JSON array of {name, url, type}
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Customs clearance tracking
export const customsClearances = mysqlTable("customsClearances", {
  id: int("id").autoincrement().primaryKey(),
  clearanceNumber: varchar("clearanceNumber", { length: 50 }).notNull().unique(),
  shipmentId: int("shipmentId"),
  rfqId: int("rfqId"),
  
  // Clearance details
  type: mysqlEnum("type", ["import", "export"]).notNull(),
  status: mysqlEnum("status", ["pending_documents", "documents_submitted", "under_review", "additional_info_required", "cleared", "held", "rejected"]).default("pending_documents").notNull(),
  
  // Port/customs office
  customsOffice: varchar("customsOffice", { length: 255 }),
  portOfEntry: varchar("portOfEntry", { length: 255 }),
  country: varchar("country", { length: 100 }),
  
  // Broker info
  customsBrokerId: int("customsBrokerId"),
  brokerReference: varchar("brokerReference", { length: 100 }),
  
  // Key dates
  submissionDate: timestamp("submissionDate"),
  expectedClearanceDate: timestamp("expectedClearanceDate"),
  actualClearanceDate: timestamp("actualClearanceDate"),
  
  // Duties and taxes
  dutyAmount: decimal("dutyAmount", { precision: 15, scale: 2 }),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }),
  otherFees: decimal("otherFees", { precision: 15, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Compliance
  hsCode: varchar("hsCode", { length: 20 }),
  countryOfOrigin: varchar("countryOfOrigin", { length: 100 }),
  certificateOfOrigin: boolean("certificateOfOrigin").default(false),
  
  notes: text("notes"),
  aiSummary: text("aiSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Customs documents
export const customsDocuments = mysqlTable("customsDocuments", {
  id: int("id").autoincrement().primaryKey(),
  clearanceId: int("clearanceId").notNull(),
  documentType: mysqlEnum("documentType", [
    "commercial_invoice",
    "packing_list",
    "bill_of_lading",
    "airway_bill",
    "certificate_of_origin",
    "customs_declaration",
    "import_license",
    "export_license",
    "insurance_certificate",
    "inspection_certificate",
    "phytosanitary_certificate",
    "fumigation_certificate",
    "dangerous_goods_declaration",
    "other"
  ]).notNull(),
  
  name: varchar("name", { length: 255 }).notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 500 }),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  
  status: mysqlEnum("status", ["pending", "uploaded", "verified", "rejected", "expired"]).default("pending"),
  expiryDate: timestamp("expiryDate"),
  verifiedAt: timestamp("verifiedAt"),
  verifiedById: int("verifiedById"),
  
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Freight bookings (when a quote is accepted)
export const freightBookings = mysqlTable("freightBookings", {
  id: int("id").autoincrement().primaryKey(),
  bookingNumber: varchar("bookingNumber", { length: 50 }).notNull().unique(),
  quoteId: int("quoteId").notNull(),
  rfqId: int("rfqId").notNull(),
  carrierId: int("carrierId").notNull(),
  
  status: mysqlEnum("status", ["pending", "confirmed", "in_transit", "arrived", "delivered", "cancelled"]).default("pending").notNull(),
  
  // Tracking
  trackingNumber: varchar("trackingNumber", { length: 100 }),
  containerNumber: varchar("containerNumber", { length: 50 }),
  vesselName: varchar("vesselName", { length: 255 }),
  voyageNumber: varchar("voyageNumber", { length: 50 }),
  
  // Key dates
  bookingDate: timestamp("bookingDate"),
  pickupDate: timestamp("pickupDate"),
  departureDate: timestamp("departureDate"),
  arrivalDate: timestamp("arrivalDate"),
  deliveryDate: timestamp("deliveryDate"),
  
  // Costs
  agreedCost: decimal("agreedCost", { precision: 15, scale: 2 }),
  actualCost: decimal("actualCost", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Type exports for freight tables
export type FreightCarrier = typeof freightCarriers.$inferSelect;
export type InsertFreightCarrier = typeof freightCarriers.$inferInsert;

export type FreightRfq = typeof freightRfqs.$inferSelect;
export type InsertFreightRfq = typeof freightRfqs.$inferInsert;

export type FreightQuote = typeof freightQuotes.$inferSelect;
export type InsertFreightQuote = typeof freightQuotes.$inferInsert;

export type FreightEmail = typeof freightEmails.$inferSelect;
export type InsertFreightEmail = typeof freightEmails.$inferInsert;

export type CustomsClearance = typeof customsClearances.$inferSelect;
export type InsertCustomsClearance = typeof customsClearances.$inferInsert;

export type CustomsDocument = typeof customsDocuments.$inferSelect;
export type InsertCustomsDocument = typeof customsDocuments.$inferInsert;

export type FreightBooking = typeof freightBookings.$inferSelect;
export type InsertFreightBooking = typeof freightBookings.$inferInsert;


// ============================================
// BILL OF MATERIALS (BOM) MODULE
// ============================================

// BOM header - defines a product's bill of materials
export const billOfMaterials = mysqlTable("billOfMaterials", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  productId: int("productId").notNull(), // The finished product
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 32 }).default("1.0").notNull(),
  status: mysqlEnum("status", ["draft", "active", "obsolete"]).default("draft").notNull(),
  effectiveDate: timestamp("effectiveDate"),
  obsoleteDate: timestamp("obsoleteDate"),
  batchSize: decimal("batchSize", { precision: 15, scale: 4 }).default("1"), // Standard batch quantity
  batchUnit: varchar("batchUnit", { length: 32 }).default("EA"), // Unit of measure for batch
  laborCost: decimal("laborCost", { precision: 15, scale: 2 }).default("0"),
  overheadCost: decimal("overheadCost", { precision: 15, scale: 2 }).default("0"),
  totalMaterialCost: decimal("totalMaterialCost", { precision: 15, scale: 2 }), // Calculated from components
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }), // Material + Labor + Overhead
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// BOM components - individual items that make up a product
export const bomComponents = mysqlTable("bomComponents", {
  id: int("id").autoincrement().primaryKey(),
  bomId: int("bomId").notNull(), // Reference to billOfMaterials
  componentType: mysqlEnum("componentType", ["product", "raw_material", "packaging", "labor"]).default("raw_material").notNull(),
  productId: int("productId"), // If component is another product (sub-assembly)
  rawMaterialId: int("rawMaterialId"), // If component is a raw material
  name: varchar("name", { length: 255 }).notNull(), // Component name (for display)
  sku: varchar("sku", { length: 64 }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("EA").notNull(),
  wastagePercent: decimal("wastagePercent", { precision: 5, scale: 2 }).default("0"), // Expected waste/scrap %
  unitCost: decimal("unitCost", { precision: 15, scale: 4 }),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }), // quantity * unitCost * (1 + wastage)
  leadTimeDays: int("leadTimeDays").default(0),
  isOptional: boolean("isOptional").default(false),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Raw materials - ingredients and materials not tracked as products
export const rawMaterials = mysqlTable("rawMaterials", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  sku: varchar("sku", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  unit: varchar("unit", { length: 32 }).default("EA").notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 4 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  minOrderQty: decimal("minOrderQty", { precision: 15, scale: 4 }),
  leadTimeDays: int("leadTimeDays").default(0),
  preferredVendorId: int("preferredVendorId"),
  status: mysqlEnum("status", ["active", "inactive", "discontinued"]).default("active").notNull(),
  // Receiving tracking fields
  receivingStatus: mysqlEnum("receivingStatus", ["none", "ordered", "in_transit", "received", "inspected"]).default("none"),
  lastPoId: int("lastPoId"), // Reference to most recent PO
  quantityOnOrder: decimal("quantityOnOrder", { precision: 15, scale: 4 }).default("0"),
  quantityInTransit: decimal("quantityInTransit", { precision: 15, scale: 4 }).default("0"),
  quantityReceived: decimal("quantityReceived", { precision: 15, scale: 4 }).default("0"),
  expectedDeliveryDate: timestamp("expectedDeliveryDate"),
  lastReceivedDate: timestamp("lastReceivedDate"),
  lastReceivedQty: decimal("lastReceivedQty", { precision: 15, scale: 4 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// BOM version history for tracking changes
export const bomVersionHistory = mysqlTable("bomVersionHistory", {
  id: int("id").autoincrement().primaryKey(),
  bomId: int("bomId").notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  changeType: mysqlEnum("changeType", ["created", "updated", "activated", "obsoleted"]).notNull(),
  changeDescription: text("changeDescription"),
  changedBy: int("changedBy"),
  snapshotData: text("snapshotData"), // JSON snapshot of BOM at this version
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Type exports for BOM tables
export type BillOfMaterials = typeof billOfMaterials.$inferSelect;
export type InsertBillOfMaterials = typeof billOfMaterials.$inferInsert;
export type BomComponent = typeof bomComponents.$inferSelect;
export type InsertBomComponent = typeof bomComponents.$inferInsert;
export type RawMaterial = typeof rawMaterials.$inferSelect;
export type InsertRawMaterial = typeof rawMaterials.$inferInsert;
export type BomVersionHistory = typeof bomVersionHistory.$inferSelect;
export type InsertBomVersionHistory = typeof bomVersionHistory.$inferInsert;

// ============================================
// PRODUCTION & WORK ORDERS
// ============================================

// Work orders for production runs
export const workOrders = mysqlTable("workOrders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  workOrderNumber: varchar("workOrderNumber", { length: 64 }).notNull(),
  bomId: int("bomId").notNull(),
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId"), // Production location
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(), // Target production quantity
  completedQuantity: decimal("completedQuantity", { precision: 15, scale: 4 }).default("0"),
  unit: varchar("unit", { length: 32 }).default("EA").notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "in_progress", "completed", "cancelled"]).default("draft").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  scheduledStartDate: timestamp("scheduledStartDate"),
  scheduledEndDate: timestamp("scheduledEndDate"),
  actualStartDate: timestamp("actualStartDate"),
  actualEndDate: timestamp("actualEndDate"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  assignedTo: int("assignedTo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Work order material requirements (auto-calculated from BOM)
export const workOrderMaterials = mysqlTable("workOrderMaterials", {
  id: int("id").autoincrement().primaryKey(),
  workOrderId: int("workOrderId").notNull(),
  rawMaterialId: int("rawMaterialId"),
  productId: int("productId"), // For sub-assemblies
  name: varchar("name", { length: 255 }).notNull(),
  requiredQuantity: decimal("requiredQuantity", { precision: 15, scale: 4 }).notNull(),
  reservedQuantity: decimal("reservedQuantity", { precision: 15, scale: 4 }).default("0"),
  consumedQuantity: decimal("consumedQuantity", { precision: 15, scale: 4 }).default("0"),
  unit: varchar("unit", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending", "reserved", "partial", "consumed", "shortage"]).default("pending").notNull(),
  warehouseId: int("warehouseId"), // Source location for material
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Raw material inventory (separate from finished goods inventory)
export const rawMaterialInventory = mysqlTable("rawMaterialInventory", {
  id: int("id").autoincrement().primaryKey(),
  rawMaterialId: int("rawMaterialId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("0").notNull(),
  reservedQuantity: decimal("reservedQuantity", { precision: 15, scale: 4 }).default("0"),
  availableQuantity: decimal("availableQuantity", { precision: 15, scale: 4 }).default("0"),
  unit: varchar("unit", { length: 32 }).notNull(),
  lotNumber: varchar("lotNumber", { length: 64 }),
  expirationDate: timestamp("expirationDate"),
  lastReceivedDate: timestamp("lastReceivedDate"),
  lastCountDate: timestamp("lastCountDate"),
  reorderPoint: decimal("reorderPoint", { precision: 15, scale: 4 }),
  reorderQuantity: decimal("reorderQuantity", { precision: 15, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Raw material inventory transactions (ledger)
export const rawMaterialTransactions = mysqlTable("rawMaterialTransactions", {
  id: int("id").autoincrement().primaryKey(),
  rawMaterialId: int("rawMaterialId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  transactionType: mysqlEnum("transactionType", ["receive", "consume", "adjust", "transfer_in", "transfer_out", "return"]).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(), // Positive for in, negative for out
  previousQuantity: decimal("previousQuantity", { precision: 15, scale: 4 }).notNull(),
  newQuantity: decimal("newQuantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  referenceType: varchar("referenceType", { length: 64 }), // 'purchase_order', 'work_order', 'adjustment'
  referenceId: int("referenceId"),
  lotNumber: varchar("lotNumber", { length: 64 }),
  notes: text("notes"),
  performedBy: int("performedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Link PO items to raw materials for receiving
export const purchaseOrderRawMaterials = mysqlTable("purchaseOrderRawMaterials", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderItemId: int("purchaseOrderItemId").notNull(),
  rawMaterialId: int("rawMaterialId").notNull(),
  orderedQuantity: decimal("orderedQuantity", { precision: 15, scale: 4 }).notNull(),
  receivedQuantity: decimal("receivedQuantity", { precision: 15, scale: 4 }).default("0"),
  unit: varchar("unit", { length: 32 }).notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 4 }),
  status: mysqlEnum("status", ["ordered", "partial", "received", "cancelled"]).default("ordered").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// PO Receiving records (when shipments arrive)
export const poReceivingRecords = mysqlTable("poReceivingRecords", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  shipmentId: int("shipmentId"),
  receivedDate: timestamp("receivedDate").notNull(),
  receivedBy: int("receivedBy"),
  warehouseId: int("warehouseId").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Individual items received in a PO receiving
export const poReceivingItems = mysqlTable("poReceivingItems", {
  id: int("id").autoincrement().primaryKey(),
  receivingRecordId: int("receivingRecordId").notNull(),
  purchaseOrderItemId: int("purchaseOrderItemId"),
  rawMaterialId: int("rawMaterialId"),
  productId: int("productId"),
  receivedQuantity: decimal("receivedQuantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  lotNumber: varchar("lotNumber", { length: 64 }),
  expirationDate: timestamp("expirationDate"),
  condition: mysqlEnum("condition", ["good", "damaged", "rejected"]).default("good").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Type exports
export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = typeof workOrders.$inferInsert;
export type WorkOrderMaterial = typeof workOrderMaterials.$inferSelect;
export type InsertWorkOrderMaterial = typeof workOrderMaterials.$inferInsert;
export type RawMaterialInventory = typeof rawMaterialInventory.$inferSelect;
export type InsertRawMaterialInventory = typeof rawMaterialInventory.$inferInsert;
export type RawMaterialTransaction = typeof rawMaterialTransactions.$inferSelect;
export type InsertRawMaterialTransaction = typeof rawMaterialTransactions.$inferInsert;
export type PurchaseOrderRawMaterial = typeof purchaseOrderRawMaterials.$inferSelect;
export type InsertPurchaseOrderRawMaterial = typeof purchaseOrderRawMaterials.$inferInsert;
export type PoReceivingRecord = typeof poReceivingRecords.$inferSelect;
export type InsertPoReceivingRecord = typeof poReceivingRecords.$inferInsert;
export type PoReceivingItem = typeof poReceivingItems.$inferSelect;
export type InsertPoReceivingItem = typeof poReceivingItems.$inferInsert;


// ============================================
// AI PRODUCTION FORECASTING
// ============================================

// Demand forecasts generated by AI
export const demandForecasts = mysqlTable("demandForecasts", {
  id: int("id").autoincrement().primaryKey(),
  forecastNumber: varchar("forecastNumber", { length: 32 }).notNull(),
  productId: int("productId"),
  forecastDate: timestamp("forecastDate").notNull(), // Date this forecast was generated
  forecastPeriodStart: timestamp("forecastPeriodStart").notNull(), // Start of forecast period
  forecastPeriodEnd: timestamp("forecastPeriodEnd").notNull(), // End of forecast period
  forecastedQuantity: decimal("forecastedQuantity", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 16 }).default("EA"),
  confidenceLevel: decimal("confidenceLevel", { precision: 5, scale: 2 }), // 0-100%
  forecastMethod: varchar("forecastMethod", { length: 64 }), // 'ai_trend', 'historical_avg', 'seasonal', etc.
  dataPointsUsed: int("dataPointsUsed"), // Number of historical data points used
  aiAnalysis: text("aiAnalysis"), // AI explanation of the forecast
  seasonalFactors: text("seasonalFactors"), // JSON with seasonal adjustments
  trendDirection: mysqlEnum("trendDirection", ["up", "down", "stable"]),
  status: mysqlEnum("status", ["draft", "active", "superseded", "expired"]).default("draft").notNull(),
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DemandForecast = typeof demandForecasts.$inferSelect;
export type InsertDemandForecast = typeof demandForecasts.$inferInsert;

// Production plans derived from demand forecasts
export const productionPlans = mysqlTable("productionPlans", {
  id: int("id").autoincrement().primaryKey(),
  planNumber: varchar("planNumber", { length: 32 }).notNull(),
  demandForecastId: int("demandForecastId"),
  productId: int("productId").notNull(),
  bomId: int("bomId"),
  plannedQuantity: decimal("plannedQuantity", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 16 }).default("EA"),
  plannedStartDate: timestamp("plannedStartDate"),
  plannedEndDate: timestamp("plannedEndDate"),
  currentInventory: decimal("currentInventory", { precision: 12, scale: 4 }),
  safetyStock: decimal("safetyStock", { precision: 12, scale: 4 }),
  reorderPoint: decimal("reorderPoint", { precision: 12, scale: 4 }),
  status: mysqlEnum("status", ["draft", "approved", "in_progress", "completed", "cancelled"]).default("draft").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductionPlan = typeof productionPlans.$inferSelect;
export type InsertProductionPlan = typeof productionPlans.$inferInsert;

// Material requirements derived from production plans
export const materialRequirements = mysqlTable("materialRequirements", {
  id: int("id").autoincrement().primaryKey(),
  productionPlanId: int("productionPlanId").notNull(),
  rawMaterialId: int("rawMaterialId").notNull(),
  requiredQuantity: decimal("requiredQuantity", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 16 }).default("KG"),
  currentInventory: decimal("currentInventory", { precision: 12, scale: 4 }),
  onOrderQuantity: decimal("onOrderQuantity", { precision: 12, scale: 4 }), // Already ordered but not received
  shortageQuantity: decimal("shortageQuantity", { precision: 12, scale: 4 }), // Gap to fill
  suggestedOrderQuantity: decimal("suggestedOrderQuantity", { precision: 12, scale: 4 }),
  preferredVendorId: int("preferredVendorId"),
  estimatedUnitCost: decimal("estimatedUnitCost", { precision: 12, scale: 4 }),
  estimatedTotalCost: decimal("estimatedTotalCost", { precision: 12, scale: 4 }),
  leadTimeDays: int("leadTimeDays"),
  requiredByDate: timestamp("requiredByDate"), // When material is needed for production
  latestOrderDate: timestamp("latestOrderDate"), // Latest date to place order based on lead time
  estimatedDeliveryDate: timestamp("estimatedDeliveryDate"), // Expected delivery if ordered now
  isUrgent: boolean("isUrgent").default(false), // True if lead time exceeds available time
  status: mysqlEnum("status", ["pending", "po_generated", "ordered", "received"]).default("pending").notNull(),
  generatedPoId: int("generatedPoId"), // Link to auto-generated PO
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MaterialRequirement = typeof materialRequirements.$inferSelect;
export type InsertMaterialRequirement = typeof materialRequirements.$inferInsert;

// Suggested purchase orders (auto-generated, pending approval)
export const suggestedPurchaseOrders = mysqlTable("suggestedPurchaseOrders", {
  id: int("id").autoincrement().primaryKey(),
  suggestedPoNumber: varchar("suggestedPoNumber", { length: 32 }).notNull(),
  vendorId: int("vendorId").notNull(),
  productionPlanId: int("productionPlanId"),
  totalAmount: decimal("totalAmount", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 8 }).default("USD"),
  suggestedOrderDate: timestamp("suggestedOrderDate"),
  requiredByDate: timestamp("requiredByDate"),
  estimatedDeliveryDate: timestamp("estimatedDeliveryDate"), // Based on vendor lead time
  vendorLeadTimeDays: int("vendorLeadTimeDays"), // Lead time used for calculation
  daysUntilRequired: int("daysUntilRequired"), // Days between now and required date
  isUrgent: boolean("isUrgent").default(false), // True if lead time > days until required
  aiRationale: text("aiRationale"), // AI explanation for this suggestion
  priorityScore: int("priorityScore"), // 1-100, higher = more urgent
  status: mysqlEnum("status", ["pending", "approved", "rejected", "converted"]).default("pending").notNull(),
  convertedPoId: int("convertedPoId"), // Link to actual PO after approval
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SuggestedPurchaseOrder = typeof suggestedPurchaseOrders.$inferSelect;
export type InsertSuggestedPurchaseOrder = typeof suggestedPurchaseOrders.$inferInsert;

// Suggested PO line items
export const suggestedPoItems = mysqlTable("suggestedPoItems", {
  id: int("id").autoincrement().primaryKey(),
  suggestedPoId: int("suggestedPoId").notNull(),
  materialRequirementId: int("materialRequirementId"),
  rawMaterialId: int("rawMaterialId").notNull(),
  productId: int("productId"),
  description: varchar("description", { length: 512 }),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 16 }).default("KG"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 4 }),
  totalAmount: decimal("totalAmount", { precision: 14, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SuggestedPoItem = typeof suggestedPoItems.$inferSelect;
export type InsertSuggestedPoItem = typeof suggestedPoItems.$inferInsert;

// Forecast accuracy tracking
export const forecastAccuracy = mysqlTable("forecastAccuracy", {
  id: int("id").autoincrement().primaryKey(),
  demandForecastId: int("demandForecastId").notNull(),
  productId: int("productId"),
  forecastedQuantity: decimal("forecastedQuantity", { precision: 12, scale: 4 }).notNull(),
  actualQuantity: decimal("actualQuantity", { precision: 12, scale: 4 }),
  varianceQuantity: decimal("varianceQuantity", { precision: 12, scale: 4 }),
  variancePercent: decimal("variancePercent", { precision: 8, scale: 2 }),
  mape: decimal("mape", { precision: 8, scale: 2 }), // Mean Absolute Percentage Error
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
});

export type ForecastAccuracy = typeof forecastAccuracy.$inferSelect;
export type InsertForecastAccuracy = typeof forecastAccuracy.$inferInsert;


// ============================================
// LOT/BATCH TRACKING SYSTEM
// ============================================

// Inventory lots for batch/lot tracking
export const inventoryLots = mysqlTable("inventoryLots", {
  id: int("id").autoincrement().primaryKey(),
  lotCode: varchar("lotCode", { length: 64 }).notNull(),
  productId: int("productId").notNull(),
  productType: mysqlEnum("productType", ["finished", "wip", "material", "packaging", "subassembly"]).default("finished").notNull(),
  expiryDate: timestamp("expiryDate"),
  manufactureDate: timestamp("manufactureDate"),
  attributes: json("attributes"), // Custom attributes JSON
  sourceType: mysqlEnum("sourceType", ["production", "purchase", "transfer", "adjustment", "opening"]).default("purchase").notNull(),
  sourceReferenceId: int("sourceReferenceId"), // work_order_id, po_id, etc.
  status: mysqlEnum("status", ["active", "expired", "consumed", "quarantine"]).default("active").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryLot = typeof inventoryLots.$inferSelect;
export type InsertInventoryLot = typeof inventoryLots.$inferInsert;

// Inventory balance by lot and location with status
export const inventoryBalances = mysqlTable("inventoryBalances", {
  id: int("id").autoincrement().primaryKey(),
  lotId: int("lotId").notNull(),
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  zoneId: varchar("zoneId", { length: 64 }), // Zone within warehouse
  binId: varchar("binId", { length: 64 }), // Bin within zone
  status: mysqlEnum("status", ["available", "hold", "reserved", "quarantine", "damaged"]).default("available").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("0").notNull(),
  unit: varchar("unit", { length: 32 }).default("EA").notNull(),
  lastCountDate: timestamp("lastCountDate"),
  lastCountQuantity: decimal("lastCountQuantity", { precision: 15, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryBalance = typeof inventoryBalances.$inferSelect;
export type InsertInventoryBalance = typeof inventoryBalances.$inferInsert;

// Inventory transaction ledger for all movements
export const inventoryTransactions = mysqlTable("inventoryTransactions", {
  id: int("id").autoincrement().primaryKey(),
  transactionNumber: varchar("transactionNumber", { length: 64 }).notNull(),
  transactionType: mysqlEnum("transactionType", [
    "receive", "consume", "adjust", "transfer_in", "transfer_out", 
    "reserve", "release", "ship", "return", "scrap", "count_adjust"
  ]).notNull(),
  lotId: int("lotId"),
  productId: int("productId").notNull(),
  fromWarehouseId: int("fromWarehouseId"),
  toWarehouseId: int("toWarehouseId"),
  fromStatus: mysqlEnum("fromStatus", ["available", "hold", "reserved", "quarantine", "damaged"]),
  toStatus: mysqlEnum("toStatus", ["available", "hold", "reserved", "quarantine", "damaged"]),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("EA").notNull(),
  previousBalance: decimal("previousBalance", { precision: 15, scale: 4 }),
  newBalance: decimal("newBalance", { precision: 15, scale: 4 }),
  referenceType: varchar("referenceType", { length: 64 }), // 'work_order', 'purchase_order', 'sales_order', 'transfer', 'adjustment'
  referenceId: int("referenceId"),
  reason: text("reason"),
  performedBy: int("performedBy"),
  performedAt: timestamp("performedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = typeof inventoryTransactions.$inferInsert;

// Work order output lots
export const workOrderOutputs = mysqlTable("workOrderOutputs", {
  id: int("id").autoincrement().primaryKey(),
  workOrderId: int("workOrderId").notNull(),
  lotId: int("lotId").notNull(),
  productId: int("productId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("EA").notNull(),
  yieldPercent: decimal("yieldPercent", { precision: 8, scale: 2 }), // Actual vs target
  qualityGrade: mysqlEnum("qualityGrade", ["A", "B", "C", "reject"]).default("A"),
  warehouseId: int("warehouseId"),
  notes: text("notes"),
  producedAt: timestamp("producedAt").defaultNow().notNull(),
  producedBy: int("producedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkOrderOutput = typeof workOrderOutputs.$inferSelect;
export type InsertWorkOrderOutput = typeof workOrderOutputs.$inferInsert;

// ============================================
// ALERT SYSTEM
// ============================================

export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  alertNumber: varchar("alertNumber", { length: 32 }).notNull(),
  type: mysqlEnum("type", [
    "low_stock", "shortage", "late_shipment", "yield_variance", 
    "expiring_lot", "quality_issue", "po_overdue", "reconciliation_variance"
  ]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  status: mysqlEnum("status", ["open", "acknowledged", "in_progress", "resolved", "dismissed"]).default("open").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  entityType: varchar("entityType", { length: 64 }), // 'product', 'lot', 'shipment', 'work_order', etc.
  entityId: int("entityId"),
  thresholdValue: decimal("thresholdValue", { precision: 15, scale: 4 }),
  actualValue: decimal("actualValue", { precision: 15, scale: 4 }),
  assignedTo: int("assignedTo"),
  acknowledgedBy: int("acknowledgedBy"),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNotes: text("resolutionNotes"),
  autoGenerated: boolean("autoGenerated").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

// Recommendations with approval workflow
export const recommendations = mysqlTable("recommendations", {
  id: int("id").autoincrement().primaryKey(),
  alertId: int("alertId"), // Optional link to alert
  type: mysqlEnum("type", ["create_po", "create_work_order", "transfer_inventory", "adjust_forecast", "other"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  actionPayload: json("actionPayload"), // Structured action data
  status: mysqlEnum("status", ["pending", "approved", "rejected", "executed"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  aiGenerated: boolean("aiGenerated").default(true),
  aiRationale: text("aiRationale"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),
  executedAt: timestamp("executedAt"),
  executionResult: text("executionResult"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = typeof recommendations.$inferInsert;

// ============================================
// SHOPIFY INTEGRATION
// ============================================

// Shopify store configuration
export const shopifyStores = mysqlTable("shopifyStores", {
  id: int("id").autoincrement().primaryKey(),
  storeDomain: varchar("storeDomain", { length: 255 }).notNull().unique(), // mystore.myshopify.com
  storeName: varchar("storeName", { length: 255 }),
  accessToken: text("accessToken"), // Encrypted in production
  apiVersion: varchar("apiVersion", { length: 16 }).default("2024-01"),
  isEnabled: boolean("isEnabled").default(true),
  syncInventory: boolean("syncInventory").default(true),
  syncOrders: boolean("syncOrders").default(true),
  inventoryAuthority: mysqlEnum("inventoryAuthority", ["erp", "shopify", "hybrid"]).default("hybrid"),
  lastSyncAt: timestamp("lastSyncAt"),
  webhookSecret: varchar("webhookSecret", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShopifyStore = typeof shopifyStores.$inferSelect;
export type InsertShopifyStore = typeof shopifyStores.$inferInsert;

// Webhook event log for idempotency
export const webhookEvents = mysqlTable("webhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["shopify", "quickbooks", "hubspot", "stripe", "other"]).default("shopify").notNull(),
  topic: varchar("topic", { length: 128 }).notNull(), // orders/create, inventory_levels/update, etc.
  idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
  payload: json("payload"),
  status: mysqlEnum("status", ["received", "processing", "processed", "failed", "ignored"]).default("received").notNull(),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

// SKU mapping between Shopify and ERP
export const shopifySkuMappings = mysqlTable("shopifySkuMappings", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  shopifyProductId: varchar("shopifyProductId", { length: 64 }).notNull(),
  shopifyVariantId: varchar("shopifyVariantId", { length: 64 }).notNull(),
  shopifySku: varchar("shopifySku", { length: 128 }),
  productId: int("productId").notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShopifySkuMapping = typeof shopifySkuMappings.$inferSelect;
export type InsertShopifySkuMapping = typeof shopifySkuMappings.$inferInsert;

// Location mapping between Shopify and ERP
export const shopifyLocationMappings = mysqlTable("shopifyLocationMappings", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  shopifyLocationId: varchar("shopifyLocationId", { length: 64 }).notNull(),
  shopifyLocationName: varchar("shopifyLocationName", { length: 255 }),
  warehouseId: int("warehouseId").notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShopifyLocationMapping = typeof shopifyLocationMappings.$inferSelect;
export type InsertShopifyLocationMapping = typeof shopifyLocationMappings.$inferInsert;

// ============================================
// SALES ORDERS & RESERVATIONS
// ============================================

// Sales orders (from Shopify or manual)
export const salesOrders = mysqlTable("salesOrders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 64 }).notNull(),
  source: mysqlEnum("source", ["shopify", "manual", "api", "other"]).default("manual").notNull(),
  shopifyOrderId: varchar("shopifyOrderId", { length: 64 }),
  shopifyOrderNumber: varchar("shopifyOrderNumber", { length: 64 }),
  customerId: int("customerId"),
  status: mysqlEnum("status", ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]).default("pending").notNull(),
  fulfillmentStatus: mysqlEnum("fulfillmentStatus", ["unfulfilled", "partial", "fulfilled"]).default("unfulfilled").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "partial", "refunded"]).default("pending").notNull(),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0"),
  shippingAmount: decimal("shippingAmount", { precision: 15, scale: 2 }).default("0"),
  discountAmount: decimal("discountAmount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  shippingAddress: json("shippingAddress"),
  billingAddress: json("billingAddress"),
  notes: text("notes"),
  orderDate: timestamp("orderDate").defaultNow().notNull(),
  shippedAt: timestamp("shippedAt"),
  deliveredAt: timestamp("deliveredAt"),
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesOrder = typeof salesOrders.$inferSelect;
export type InsertSalesOrder = typeof salesOrders.$inferInsert;

// Sales order line items
export const salesOrderLines = mysqlTable("salesOrderLines", {
  id: int("id").autoincrement().primaryKey(),
  salesOrderId: int("salesOrderId").notNull(),
  productId: int("productId").notNull(),
  shopifyLineItemId: varchar("shopifyLineItemId", { length: 64 }),
  sku: varchar("sku", { length: 64 }),
  name: varchar("name", { length: 255 }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  fulfilledQuantity: decimal("fulfilledQuantity", { precision: 15, scale: 4 }).default("0"),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  totalPrice: decimal("totalPrice", { precision: 15, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("EA"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SalesOrderLine = typeof salesOrderLines.$inferSelect;
export type InsertSalesOrderLine = typeof salesOrderLines.$inferInsert;

// Inventory reservations for sales orders
export const inventoryReservations = mysqlTable("inventoryReservations", {
  id: int("id").autoincrement().primaryKey(),
  salesOrderId: int("salesOrderId").notNull(),
  salesOrderLineId: int("salesOrderLineId").notNull(),
  lotId: int("lotId"),
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  reservedQuantity: decimal("reservedQuantity", { precision: 15, scale: 4 }).notNull(),
  fulfilledQuantity: decimal("fulfilledQuantity", { precision: 15, scale: 4 }).default("0"),
  releasedQuantity: decimal("releasedQuantity", { precision: 15, scale: 4 }).default("0"),
  unit: varchar("unit", { length: 32 }).default("EA"),
  status: mysqlEnum("status", ["reserved", "partial_fulfilled", "fulfilled", "released", "cancelled"]).default("reserved").notNull(),
  reservedAt: timestamp("reservedAt").defaultNow().notNull(),
  fulfilledAt: timestamp("fulfilledAt"),
  releasedAt: timestamp("releasedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryReservation = typeof inventoryReservations.$inferSelect;
export type InsertInventoryReservation = typeof inventoryReservations.$inferInsert;

// ============================================
// INVENTORY ALLOCATION BY CHANNEL
// ============================================

// Inventory allocation pools by channel
export const inventoryAllocations = mysqlTable("inventoryAllocations", {
  id: int("id").autoincrement().primaryKey(),
  channel: mysqlEnum("channel", ["shopify", "amazon", "wholesale", "retail", "other"]).default("shopify").notNull(),
  storeId: int("storeId"), // For Shopify, link to shopifyStores
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  allocatedQuantity: decimal("allocatedQuantity", { precision: 15, scale: 4 }).notNull(),
  remainingQuantity: decimal("remainingQuantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("EA"),
  lastSyncedToChannel: timestamp("lastSyncedToChannel"),
  channelReportedQuantity: decimal("channelReportedQuantity", { precision: 15, scale: 4 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryAllocation = typeof inventoryAllocations.$inferSelect;
export type InsertInventoryAllocation = typeof inventoryAllocations.$inferInsert;

// Sales events from channel fulfillments
export const salesEvents = mysqlTable("salesEvents", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["shopify", "amazon", "manual", "other"]).default("shopify").notNull(),
  eventType: mysqlEnum("eventType", ["order_created", "order_fulfilled", "order_cancelled", "order_refunded"]).notNull(),
  shopifyOrderId: varchar("shopifyOrderId", { length: 64 }),
  shopifyFulfillmentId: varchar("shopifyFulfillmentId", { length: 64 }),
  salesOrderId: int("salesOrderId"),
  allocationId: int("allocationId"),
  productId: int("productId"),
  quantity: decimal("quantity", { precision: 15, scale: 4 }),
  eventData: json("eventData"),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SalesEvent = typeof salesEvents.$inferSelect;
export type InsertSalesEvent = typeof salesEvents.$inferInsert;

// ============================================
// INVENTORY RECONCILIATION
// ============================================

// Reconciliation runs
export const reconciliationRuns = mysqlTable("reconciliationRuns", {
  id: int("id").autoincrement().primaryKey(),
  runNumber: varchar("runNumber", { length: 32 }).notNull(),
  type: mysqlEnum("type", ["scheduled", "manual"]).default("scheduled").notNull(),
  channel: mysqlEnum("channel", ["shopify", "amazon", "all"]).default("shopify").notNull(),
  storeId: int("storeId"),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  totalSkus: int("totalSkus").default(0),
  passedSkus: int("passedSkus").default(0),
  warningSkus: int("warningSkus").default(0),
  criticalSkus: int("criticalSkus").default(0),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  initiatedBy: int("initiatedBy"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type InsertReconciliationRun = typeof reconciliationRuns.$inferInsert;

// Reconciliation line items
export const reconciliationLines = mysqlTable("reconciliationLines", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  productId: int("productId").notNull(),
  sku: varchar("sku", { length: 64 }),
  warehouseId: int("warehouseId"),
  erpQuantity: decimal("erpQuantity", { precision: 15, scale: 4 }).notNull(),
  channelQuantity: decimal("channelQuantity", { precision: 15, scale: 4 }).notNull(),
  deltaQuantity: decimal("deltaQuantity", { precision: 15, scale: 4 }).notNull(),
  variancePercent: decimal("variancePercent", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["pass", "warning", "critical"]).default("pass").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReconciliationLine = typeof reconciliationLines.$inferSelect;
export type InsertReconciliationLine = typeof reconciliationLines.$inferInsert;


// ============================================
// INTEGRATION SYNC LOGS
// ============================================

export const syncLogs = mysqlTable("syncLogs", {
  id: int("id").autoincrement().primaryKey(),
  integration: varchar("integration", { length: 64 }).notNull(), // shopify, sendgrid, google, quickbooks
  action: varchar("action", { length: 128 }).notNull(), // product_sync, order_sync, test_email, etc.
  status: mysqlEnum("status", ["success", "error", "warning", "pending"]).default("pending").notNull(),
  details: text("details"),
  recordsProcessed: int("recordsProcessed"),
  recordsFailed: int("recordsFailed"),
  errorMessage: text("errorMessage"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;


// Email scanning types
export type InboundEmail = typeof inboundEmails.$inferSelect;
export type InsertInboundEmail = typeof inboundEmails.$inferInsert;

export type EmailAttachment = typeof emailAttachments.$inferSelect;
export type InsertEmailAttachment = typeof emailAttachments.$inferInsert;

export type ParsedDocument = typeof parsedDocuments.$inferSelect;
export type InsertParsedDocument = typeof parsedDocuments.$inferInsert;

export type ParsedDocumentLineItem = typeof parsedDocumentLineItems.$inferSelect;
export type InsertParsedDocumentLineItem = typeof parsedDocumentLineItems.$inferInsert;


// ============================================
// DATA ROOM (DocSend-like)
// ============================================

// Data Rooms - top level container
export const dataRooms = mysqlTable("data_rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  slug: varchar("slug", { length: 128 }).notNull().unique(), // URL-friendly identifier
  ownerId: int("ownerId").notNull(), // User who created the room
  
  // Access settings
  isPublic: boolean("isPublic").default(false).notNull(),
  invitationOnly: boolean("invitationOnly").default(true).notNull(), // Only invited emails can access
  requireEmailVerification: boolean("requireEmailVerification").default(true).notNull(),
  password: varchar("password", { length: 255 }), // Hashed password for protected rooms
  requiresNda: boolean("requiresNda").default(false).notNull(),
  ndaText: text("ndaText"),
  
  // Customization
  logoUrl: varchar("logoUrl", { length: 512 }),
  brandColor: varchar("brandColor", { length: 7 }), // Hex color
  welcomeMessage: text("welcomeMessage"),
  
  // Settings
  allowDownload: boolean("allowDownload").default(true).notNull(),
  allowPrint: boolean("allowPrint").default(true).notNull(),
  expiresAt: timestamp("expiresAt"),
  watermarkEnabled: boolean("watermarkEnabled").default(false).notNull(),
  watermarkText: varchar("watermarkText", { length: 255 }), // Custom watermark text, defaults to visitor email
  
  // Google Drive sync
  googleDriveFolderId: varchar("googleDriveFolderId", { length: 255 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  
  status: mysqlEnum("status", ["active", "archived", "draft"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoom = typeof dataRooms.$inferSelect;
export type InsertDataRoom = typeof dataRooms.$inferInsert;

// Data Room Folders - hierarchical folder structure
export const dataRoomFolders = mysqlTable("data_room_folders", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  parentId: int("parentId"), // null for root folders
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  
  // Google Drive sync
  googleDriveFolderId: varchar("googleDriveFolderId", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomFolder = typeof dataRoomFolders.$inferSelect;
export type InsertDataRoomFolder = typeof dataRoomFolders.$inferInsert;

// Data Room Documents - files within folders
export const dataRoomDocuments = mysqlTable("data_room_documents", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  folderId: int("folderId"), // null for root level documents
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // File info
  fileType: varchar("fileType", { length: 64 }).notNull(), // pdf, doc, xls, ppt, image, etc.
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: bigint("fileSize", { mode: "number" }),
  pageCount: int("pageCount"),
  
  // Storage - either S3 or Google Drive
  storageType: mysqlEnum("storageType", ["s3", "google_drive"]).default("s3").notNull(),
  storageUrl: varchar("storageUrl", { length: 512 }),
  storageKey: varchar("storageKey", { length: 255 }),
  googleDriveFileId: varchar("googleDriveFileId", { length: 255 }),
  googleDriveWebViewLink: varchar("googleDriveWebViewLink", { length: 512 }),
  
  // Thumbnail
  thumbnailUrl: varchar("thumbnailUrl", { length: 512 }),
  
  sortOrder: int("sortOrder").default(0).notNull(),
  isHidden: boolean("isHidden").default(false).notNull(),
  
  // Version tracking
  version: int("version").default(1).notNull(),
  originalDocumentId: int("originalDocumentId"), // For version history
  
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomDocument = typeof dataRoomDocuments.$inferSelect;
export type InsertDataRoomDocument = typeof dataRoomDocuments.$inferInsert;

// Shareable Links - unique access links for data rooms
export const dataRoomLinks = mysqlTable("data_room_links", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  linkCode: varchar("linkCode", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }), // Optional name for the link
  
  // Access controls
  password: varchar("password", { length: 255 }), // Link-specific password (hashed)
  expiresAt: timestamp("expiresAt"),
  maxViews: int("maxViews"), // null = unlimited
  viewCount: int("viewCount").default(0).notNull(),
  
  // Permissions
  allowDownload: boolean("allowDownload").default(true).notNull(),
  allowPrint: boolean("allowPrint").default(true).notNull(),
  
  // Restrict to specific folders/documents
  restrictedFolderIds: json("restrictedFolderIds"), // Array of folder IDs
  restrictedDocumentIds: json("restrictedDocumentIds"), // Array of document IDs
  
  // Info capture settings
  requireEmail: boolean("requireEmail").default(true).notNull(),
  requireName: boolean("requireName").default(false).notNull(),
  requireCompany: boolean("requireCompany").default(false).notNull(),
  requirePhone: boolean("requirePhone").default(false).notNull(),
  customFields: json("customFields"), // Array of custom field definitions
  
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomLink = typeof dataRoomLinks.$inferSelect;
export type InsertDataRoomLink = typeof dataRoomLinks.$inferInsert;

// Data Room Visitors - people who accessed via links
export const dataRoomVisitors = mysqlTable("data_room_visitors", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  linkId: int("linkId"), // Which link they used
  
  // Captured info
  email: varchar("email", { length: 320 }),
  name: varchar("name", { length: 255 }),
  company: varchar("company", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  customFieldData: json("customFieldData"), // Answers to custom fields
  
  // NDA
  ndaAcceptedAt: timestamp("ndaAcceptedAt"),
  ndaIpAddress: varchar("ndaIpAddress", { length: 45 }),
  ndaSignatureId: int("ndaSignatureId"), // Reference to signed NDA
  
  // Access control
  accessStatus: mysqlEnum("accessStatus", ["active", "blocked", "revoked", "expired"]).default("active").notNull(),
  blockedAt: timestamp("blockedAt"),
  blockedReason: text("blockedReason"),
  revokedAt: timestamp("revokedAt"),
  revokedReason: text("revokedReason"),
  
  // Tracking
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  referrer: varchar("referrer", { length: 512 }),
  
  // Engagement summary
  totalViews: int("totalViews").default(0).notNull(),
  totalTimeSpent: int("totalTimeSpent").default(0).notNull(), // seconds
  lastViewedAt: timestamp("lastViewedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomVisitor = typeof dataRoomVisitors.$inferSelect;
export type InsertDataRoomVisitor = typeof dataRoomVisitors.$inferInsert;

// Document Views - detailed view analytics
export const documentViews = mysqlTable("document_views", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  visitorId: int("visitorId").notNull(),
  linkId: int("linkId"),
  
  // View details
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  duration: int("duration"), // seconds
  
  // Page-level tracking
  pagesViewed: json("pagesViewed"), // Array of page numbers viewed
  totalPagesViewed: int("totalPagesViewed").default(0).notNull(),
  percentViewed: decimal("percentViewed", { precision: 5, scale: 2 }),
  
  // Actions
  downloaded: boolean("downloaded").default(false).notNull(),
  downloadedAt: timestamp("downloadedAt"),
  printed: boolean("printed").default(false).notNull(),
  
  // Device info
  deviceType: varchar("deviceType", { length: 32 }), // desktop, mobile, tablet
  browser: varchar("browser", { length: 64 }),
  os: varchar("os", { length: 64 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentView = typeof documentViews.$inferSelect;
export type InsertDocumentView = typeof documentViews.$inferInsert;

// Data Room Invitations - direct invitations to specific users
export const dataRoomInvitations = mysqlTable("data_room_invitations", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),
  
  // Permissions
  role: mysqlEnum("role", ["viewer", "editor", "admin"]).default("viewer").notNull(),
  allowDownload: boolean("allowDownload").default(true).notNull(),
  allowPrint: boolean("allowPrint").default(true).notNull(),
  
  // Restrict to specific folders/documents (null = access all)
  allowedFolderIds: json("allowedFolderIds"), // Array of folder IDs this user can access (null = all)
  allowedDocumentIds: json("allowedDocumentIds"), // Array of document IDs this user can access (null = all)
  restrictedFolderIds: json("restrictedFolderIds"), // Explicitly blocked folders
  restrictedDocumentIds: json("restrictedDocumentIds"), // Explicitly blocked documents
  
  // Invitation status
  inviteCode: varchar("inviteCode", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "accepted", "declined", "expired"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt"),
  acceptedAt: timestamp("acceptedAt"),
  
  // Link to visitor record once accepted
  visitorId: int("visitorId"),
  
  message: text("message"), // Personal message with invitation
  invitedBy: int("invitedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomInvitation = typeof dataRoomInvitations.$inferSelect;
export type InsertDataRoomInvitation = typeof dataRoomInvitations.$inferInsert;

// ============================================
// EMAIL IMAP CREDENTIALS
// ============================================

export const imapCredentials = mysqlTable("imap_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(), // Friendly name like "Work Gmail"
  
  // Connection settings
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").default(993).notNull(),
  secure: boolean("secure").default(true).notNull(),
  
  // Credentials (password is encrypted)
  email: varchar("email", { length: 320 }).notNull(),
  encryptedPassword: text("encryptedPassword").notNull(),
  
  // Scan settings
  folder: varchar("folder", { length: 128 }).default("INBOX").notNull(),
  unseenOnly: boolean("unseenOnly").default(true).notNull(),
  markAsSeen: boolean("markAsSeen").default(false).notNull(),
  
  // Polling settings
  pollingEnabled: boolean("pollingEnabled").default(false).notNull(),
  pollingIntervalMinutes: int("pollingIntervalMinutes").default(15).notNull(),
  lastPolledAt: timestamp("lastPolledAt"),
  lastMessageUid: int("lastMessageUid"), // Track last processed message
  
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  lastError: text("lastError"),
  lastSuccessAt: timestamp("lastSuccessAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImapCredential = typeof imapCredentials.$inferSelect;
export type InsertImapCredential = typeof imapCredentials.$inferInsert;


// ============================================
// EMAIL CREDENTIALS & SCHEDULED SCANNING
// ============================================

export const emailCredentials = mysqlTable("emailCredentials", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Main Inbox", "Invoices Inbox"
  provider: mysqlEnum("provider", ["gmail", "outlook", "yahoo", "icloud", "custom"]).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  // IMAP settings (encrypted in production)
  imapHost: varchar("imapHost", { length: 255 }),
  imapPort: int("imapPort").default(993),
  imapSecure: boolean("imapSecure").default(true),
  imapUsername: varchar("imapUsername", { length: 255 }),
  imapPassword: text("imapPassword"), // Should be encrypted
  // OAuth tokens (for Gmail/Outlook)
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  // Scan settings
  scanFolder: varchar("scanFolder", { length: 255 }).default("INBOX"),
  scanUnreadOnly: boolean("scanUnreadOnly").default(true),
  markAsRead: boolean("markAsRead").default(false),
  maxEmailsPerScan: int("maxEmailsPerScan").default(50),
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  lastScanAt: timestamp("lastScanAt"),
  lastScanStatus: mysqlEnum("lastScanStatus", ["success", "failed", "partial"]),
  lastScanError: text("lastScanError"),
  emailsScanned: int("emailsScanned").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailCredential = typeof emailCredentials.$inferSelect;
export type InsertEmailCredential = typeof emailCredentials.$inferInsert;

export const scheduledEmailScans = mysqlTable("scheduledEmailScans", {
  id: int("id").autoincrement().primaryKey(),
  credentialId: int("credentialId").notNull(),
  companyId: int("companyId"),
  // Schedule settings
  isEnabled: boolean("isEnabled").default(true).notNull(),
  intervalMinutes: int("intervalMinutes").default(15).notNull(), // How often to scan
  // Execution tracking
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "failed", "running"]),
  lastRunError: text("lastRunError"),
  lastRunEmailsFound: int("lastRunEmailsFound").default(0),
  totalRuns: int("totalRuns").default(0),
  totalEmailsProcessed: int("totalEmailsProcessed").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledEmailScan = typeof scheduledEmailScans.$inferSelect;
export type InsertScheduledEmailScan = typeof scheduledEmailScans.$inferInsert;

export const emailScanLogs = mysqlTable("emailScanLogs", {
  id: int("id").autoincrement().primaryKey(),
  credentialId: int("credentialId").notNull(),
  scheduledScanId: int("scheduledScanId"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  status: mysqlEnum("status", ["running", "success", "failed", "partial"]).default("running").notNull(),
  emailsFound: int("emailsFound").default(0),
  emailsProcessed: int("emailsProcessed").default(0),
  emailsCategorized: int("emailsCategorized").default(0),
  errorMessage: text("errorMessage"),
  details: text("details"), // JSON with detailed breakdown
});

export type EmailScanLog = typeof emailScanLogs.$inferSelect;
export type InsertEmailScanLog = typeof emailScanLogs.$inferInsert;


// ============================================
// NDA E-SIGNATURES
// ============================================

// NDA Documents - uploaded NDA PDFs for data rooms
export const ndaDocuments = mysqlTable("nda_documents", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 32 }).default("1.0").notNull(),
  
  // File storage
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).default("application/pdf").notNull(),
  fileSize: bigint("fileSize", { mode: "number" }),
  pageCount: int("pageCount"),
  
  // Settings
  isActive: boolean("isActive").default(true).notNull(),
  requiresSignature: boolean("requiresSignature").default(true).notNull(),
  allowTypedSignature: boolean("allowTypedSignature").default(true).notNull(),
  allowDrawnSignature: boolean("allowDrawnSignature").default(true).notNull(),
  
  // Metadata
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NdaDocument = typeof ndaDocuments.$inferSelect;
export type InsertNdaDocument = typeof ndaDocuments.$inferInsert;

// NDA Signatures - signed NDA records
export const ndaSignatures = mysqlTable("nda_signatures", {
  id: int("id").autoincrement().primaryKey(),
  ndaDocumentId: int("ndaDocumentId").notNull(),
  dataRoomId: int("dataRoomId").notNull(),
  visitorId: int("visitorId"), // Link to data room visitor
  linkId: int("linkId"), // Which link they used
  
  // Signer information
  signerName: varchar("signerName", { length: 255 }).notNull(),
  signerEmail: varchar("signerEmail", { length: 320 }).notNull(),
  signerTitle: varchar("signerTitle", { length: 255 }),
  signerCompany: varchar("signerCompany", { length: 255 }),
  
  // Signature data
  signatureType: mysqlEnum("signatureType", ["typed", "drawn"]).notNull(),
  signatureData: text("signatureData").notNull(), // Base64 image for drawn, or typed name
  signatureImageUrl: varchar("signatureImageUrl", { length: 1024 }), // S3 URL for drawn signature
  
  // Signed document
  signedDocumentKey: varchar("signedDocumentKey", { length: 512 }), // S3 key for signed PDF
  signedDocumentUrl: varchar("signedDocumentUrl", { length: 1024 }), // S3 URL for signed PDF
  
  // Verification & audit
  signedAt: timestamp("signedAt").defaultNow().notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  userAgent: text("userAgent"),
  
  // Legal compliance
  agreementText: text("agreementText"), // Snapshot of NDA text at signing time
  consentCheckbox: boolean("consentCheckbox").default(true).notNull(),
  
  // Status
  status: mysqlEnum("status", ["pending", "signed", "revoked", "expired"]).default("signed").notNull(),
  revokedAt: timestamp("revokedAt"),
  revokedReason: text("revokedReason"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NdaSignature = typeof ndaSignatures.$inferSelect;
export type InsertNdaSignature = typeof ndaSignatures.$inferInsert;

// NDA Signature Audit Log - detailed audit trail
export const ndaSignatureAuditLog = mysqlTable("nda_signature_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  signatureId: int("signatureId").notNull(),
  action: mysqlEnum("action", [
    "viewed_nda",
    "started_signing",
    "completed_signature",
    "downloaded_signed_copy",
    "signature_revoked",
    "access_granted",
    "access_denied"
  ]).notNull(),
  
  // Context
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  details: json("details"), // Additional context
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NdaSignatureAuditLog = typeof ndaSignatureAuditLog.$inferSelect;
export type InsertNdaSignatureAuditLog = typeof ndaSignatureAuditLog.$inferInsert;


// ============================================
// RECURRING INVOICES
// ============================================

export const recurringInvoiceFrequency = mysqlEnum("recurringInvoiceFrequency", [
  "weekly",
  "biweekly", 
  "monthly",
  "quarterly",
  "annually",
]);

export const recurringInvoices = mysqlTable("recurringInvoices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  customerId: int("customerId").notNull(),
  
  // Template info
  templateName: varchar("templateName", { length: 255 }).notNull(),
  description: text("description"),
  
  // Scheduling
  frequency: recurringInvoiceFrequency.notNull(),
  dayOfWeek: int("dayOfWeek"), // 0-6 for weekly
  dayOfMonth: int("dayOfMonth"), // 1-31 for monthly
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate"), // null = no end
  nextGenerationDate: timestamp("nextGenerationDate").notNull(),
  
  // Invoice template data
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }).default("0"),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }),
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  
  // Settings
  autoSend: boolean("autoSend").default(false).notNull(),
  daysUntilDue: int("daysUntilDue").default(30).notNull(),
  notes: text("notes"),
  terms: text("terms"),
  
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  lastGeneratedAt: timestamp("lastGeneratedAt"),
  generationCount: int("generationCount").default(0).notNull(),
  
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecurringInvoice = typeof recurringInvoices.$inferSelect;
export type InsertRecurringInvoice = typeof recurringInvoices.$inferInsert;

// Line items for recurring invoice template
export const recurringInvoiceItems = mysqlTable("recurringInvoiceItems", {
  id: int("id").autoincrement().primaryKey(),
  recurringInvoiceId: int("recurringInvoiceId").notNull(),
  productId: int("productId"),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1").notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).default("0").notNull(),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RecurringInvoiceItem = typeof recurringInvoiceItems.$inferSelect;
export type InsertRecurringInvoiceItem = typeof recurringInvoiceItems.$inferInsert;

// Track generated invoices from recurring templates
export const recurringInvoiceHistory = mysqlTable("recurringInvoiceHistory", {
  id: int("id").autoincrement().primaryKey(),
  recurringInvoiceId: int("recurringInvoiceId").notNull(),
  generatedInvoiceId: int("generatedInvoiceId").notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  scheduledFor: timestamp("scheduledFor").notNull(),
  status: mysqlEnum("status", ["generated", "sent", "failed"]).default("generated").notNull(),
  errorMessage: text("errorMessage"),
});

export type RecurringInvoiceHistory = typeof recurringInvoiceHistory.$inferSelect;


// ============================================
// SUPPLIER PORTAL
// ============================================

export const supplierPortalSessions = mysqlTable("supplierPortalSessions", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  vendorId: int("vendorId").notNull(),
  vendorEmail: varchar("vendorEmail", { length: 320 }),
  status: mysqlEnum("status", ["active", "completed", "expired"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupplierPortalSession = typeof supplierPortalSessions.$inferSelect;
export type InsertSupplierPortalSession = typeof supplierPortalSessions.$inferInsert;

export const supplierDocuments = mysqlTable("supplierDocuments", {
  id: int("id").autoincrement().primaryKey(),
  portalSessionId: int("portalSessionId").notNull(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  vendorId: int("vendorId").notNull(),
  documentType: mysqlEnum("documentType", [
    "commercial_invoice",
    "packing_list",
    "dimensions_weight",
    "hs_codes",
    "certificate_of_origin",
    "msds_sds",
    "bill_of_lading",
    "customs_declaration",
    "other"
  ]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  notes: text("notes"),
  // Extracted data from document (JSON)
  extractedData: text("extractedData"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewNotes: text("reviewNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierDocument = typeof supplierDocuments.$inferSelect;
export type InsertSupplierDocument = typeof supplierDocuments.$inferInsert;

// Customs/freight info submitted by supplier
export const supplierFreightInfo = mysqlTable("supplierFreightInfo", {
  id: int("id").autoincrement().primaryKey(),
  portalSessionId: int("portalSessionId").notNull(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  vendorId: int("vendorId").notNull(),
  // Shipment details
  totalPackages: int("totalPackages"),
  totalGrossWeight: decimal("totalGrossWeight", { precision: 10, scale: 2 }),
  totalNetWeight: decimal("totalNetWeight", { precision: 10, scale: 2 }),
  weightUnit: varchar("weightUnit", { length: 10 }).default("kg"),
  totalVolume: decimal("totalVolume", { precision: 10, scale: 3 }),
  volumeUnit: varchar("volumeUnit", { length: 10 }).default("cbm"),
  // Dimensions (JSON array of package dimensions)
  packageDimensions: text("packageDimensions"),
  // HS codes (JSON array)
  hsCodes: text("hsCodes"),
  // Shipping preferences
  preferredShipDate: timestamp("preferredShipDate"),
  preferredCarrier: varchar("preferredCarrier", { length: 100 }),
  incoterms: varchar("incoterms", { length: 20 }),
  specialInstructions: text("specialInstructions"),
  // Dangerous goods
  hasDangerousGoods: boolean("hasDangerousGoods").default(false),
  dangerousGoodsClass: varchar("dangerousGoodsClass", { length: 50 }),
  unNumber: varchar("unNumber", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierFreightInfo = typeof supplierFreightInfo.$inferSelect;
export type InsertSupplierFreightInfo = typeof supplierFreightInfo.$inferInsert;


// ============================================
// AI AGENT SYSTEM
// ============================================

// AI Agent tasks - pending actions that need approval or are in progress
export const aiAgentTasks = mysqlTable("aiAgentTasks", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  // Task type and status
  taskType: mysqlEnum("taskType", [
    "generate_po", 
    "send_rfq", 
    "send_quote_request",
    "send_email",
    "update_inventory",
    "create_shipment",
    "generate_invoice",
    "reconcile_payment",
    "reorder_materials",
    "vendor_followup",
    "create_work_order",
    "query",
    "reply_email",
    "approve_po",
    "approve_invoice",
    "create_vendor",
    "create_material",
    "create_product",
    "create_bom",
    "create_customer"
  ]).notNull(),
  status: mysqlEnum("status", [
    "pending_approval",
    "approved",
    "rejected", 
    "in_progress",
    "completed",
    "failed",
    "cancelled"
  ]).default("pending_approval").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  // Task details (JSON)
  taskData: text("taskData").notNull(), // JSON with all task parameters
  // AI reasoning
  aiReasoning: text("aiReasoning"), // Why the AI decided to create this task
  aiConfidence: decimal("aiConfidence", { precision: 5, scale: 2 }), // 0-100 confidence score
  // Related entities
  relatedEntityType: varchar("relatedEntityType", { length: 50 }), // e.g., "purchaseOrder", "vendor", "rawMaterial"
  relatedEntityId: int("relatedEntityId"),
  // Approval workflow
  requiresApproval: boolean("requiresApproval").default(true).notNull(),
  approvalThreshold: decimal("approvalThreshold", { precision: 12, scale: 2 }), // Auto-approve below this amount
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),
  // Execution
  executedAt: timestamp("executedAt"),
  executionResult: text("executionResult"), // JSON with result details
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0),
  maxRetries: int("maxRetries").default(3),
  // Scheduling
  scheduledFor: timestamp("scheduledFor"),
  expiresAt: timestamp("expiresAt"),
  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiAgentTask = typeof aiAgentTasks.$inferSelect;
export type InsertAiAgentTask = typeof aiAgentTasks.$inferInsert;

// AI Agent rules - configurable automation rules
export const aiAgentRules = mysqlTable("aiAgentRules", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Rule type and trigger
  ruleType: mysqlEnum("ruleType", [
    "inventory_reorder",
    "po_auto_generate",
    "rfq_auto_send",
    "vendor_followup",
    "payment_reminder",
    "shipment_tracking",
    "price_alert",
    "quality_check"
  ]).notNull(),
  triggerCondition: text("triggerCondition").notNull(), // JSON condition definition
  // Action configuration
  actionConfig: text("actionConfig").notNull(), // JSON action parameters
  // Approval settings
  requiresApproval: boolean("requiresApproval").default(true).notNull(),
  autoApproveThreshold: decimal("autoApproveThreshold", { precision: 12, scale: 2 }),
  notifyUsers: text("notifyUsers"), // JSON array of user IDs to notify
  // Rule status
  isActive: boolean("isActive").default(true).notNull(),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  triggerCount: int("triggerCount").default(0),
  // Audit
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiAgentRule = typeof aiAgentRules.$inferSelect;
export type InsertAiAgentRule = typeof aiAgentRules.$inferInsert;

// AI Agent logs - detailed execution history
export const aiAgentLogs = mysqlTable("aiAgentLogs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  taskId: int("taskId"),
  ruleId: int("ruleId"),
  // Log details
  action: varchar("action", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["info", "success", "warning", "error"]).default("info").notNull(),
  message: text("message").notNull(),
  details: text("details"), // JSON with additional context
  // Performance
  durationMs: int("durationMs"),
  tokensUsed: int("tokensUsed"),
  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AiAgentLog = typeof aiAgentLogs.$inferSelect;
export type InsertAiAgentLog = typeof aiAgentLogs.$inferInsert;

// Email templates for AI-generated communications
export const emailTemplates = mysqlTable("emailTemplates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  templateType: mysqlEnum("templateType", [
    "po_to_vendor",
    "rfq_request",
    "quote_request",
    "shipment_confirmation",
    "payment_reminder",
    "vendor_followup",
    "quality_issue",
    "general"
  ]).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyTemplate: text("bodyTemplate").notNull(), // Template with {{placeholders}}
  isDefault: boolean("isDefault").default(false),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;


// ==========================================
// VENDOR QUOTE MANAGEMENT (RFQ System)
// ==========================================

// Vendor RFQ (Request for Quote) - sent to vendors for material pricing
export const vendorRfqs = mysqlTable("vendorRfqs", {
  id: int("id").autoincrement().primaryKey(),
  rfqNumber: varchar("rfqNumber", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "partially_received", "all_received", "awarded", "cancelled", "expired"]).default("draft").notNull(),
  
  // Material details
  rawMaterialId: int("rawMaterialId"),
  materialName: varchar("materialName", { length: 255 }).notNull(),
  materialDescription: text("materialDescription"),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  specifications: text("specifications"), // Technical specs, quality requirements
  
  // Delivery requirements
  requiredDeliveryDate: timestamp("requiredDeliveryDate"),
  deliveryLocation: varchar("deliveryLocation", { length: 255 }),
  deliveryAddress: text("deliveryAddress"),
  incoterms: varchar("incoterms", { length: 10 }), // EXW, FOB, CIF, DDP, etc.
  
  // Timeline
  quoteDueDate: timestamp("quoteDueDate"),
  validityPeriod: int("validityPeriod"), // Days the quote should be valid
  
  // Related records
  purchaseRequestId: int("purchaseRequestId"),
  projectId: int("projectId"),
  
  // Metadata
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal"),
  notes: text("notes"),
  internalNotes: text("internalNotes"),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Vendor quotes received in response to RFQs
export const vendorQuotes = mysqlTable("vendorQuotes", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  vendorId: int("vendorId").notNull(),
  quoteNumber: varchar("quoteNumber", { length: 50 }),
  status: mysqlEnum("status", ["pending", "received", "under_review", "accepted", "rejected", "expired", "converted_to_po"]).default("pending").notNull(),
  
  // Pricing
  unitPrice: decimal("unitPrice", { precision: 15, scale: 4 }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }),
  totalPrice: decimal("totalPrice", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Additional costs
  shippingCost: decimal("shippingCost", { precision: 15, scale: 2 }),
  handlingFee: decimal("handlingFee", { precision: 15, scale: 2 }),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }),
  otherCharges: decimal("otherCharges", { precision: 15, scale: 2 }),
  totalWithCharges: decimal("totalWithCharges", { precision: 15, scale: 2 }),
  
  // Delivery details
  leadTimeDays: int("leadTimeDays"),
  estimatedDeliveryDate: timestamp("estimatedDeliveryDate"),
  minimumOrderQty: decimal("minimumOrderQty", { precision: 15, scale: 4 }),
  
  // Quote validity
  validUntil: timestamp("validUntil"),
  paymentTerms: varchar("paymentTerms", { length: 100 }), // Net 30, COD, etc.
  
  // AI analysis
  aiScore: int("aiScore"), // AI-generated score 1-100
  aiAnalysis: text("aiAnalysis"), // AI-generated analysis
  aiRecommendation: text("aiRecommendation"),
  priceComparisonRank: int("priceComparisonRank"), // 1 = best price
  leadTimeComparisonRank: int("leadTimeComparisonRank"), // 1 = fastest
  overallRank: int("overallRank"), // Combined ranking
  
  // Communication
  receivedVia: mysqlEnum("receivedVia", ["email", "portal", "phone", "manual"]).default("email"),
  emailThreadId: varchar("emailThreadId", { length: 255 }),
  rawEmailContent: text("rawEmailContent"),
  attachments: text("attachments"), // JSON array of attachment URLs
  
  // Conversion to PO
  convertedToPOId: int("convertedToPOId"),
  convertedAt: timestamp("convertedAt"),
  
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Email communications for vendor RFQs
export const vendorRfqEmails = mysqlTable("vendorRfqEmails", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId"),
  vendorId: int("vendorId"),
  quoteId: int("quoteId"),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).notNull(),
  emailType: mysqlEnum("emailType", ["rfq_request", "quote_response", "follow_up", "clarification", "award_notification", "rejection_notification", "other"]).notNull(),
  
  // Email details
  fromEmail: varchar("fromEmail", { length: 320 }),
  toEmail: varchar("toEmail", { length: 320 }),
  ccEmails: text("ccEmails"),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  htmlBody: text("htmlBody"),
  
  // AI processing
  aiGenerated: boolean("aiGenerated").default(false),
  aiParsed: boolean("aiParsed").default(false),
  aiExtractedData: text("aiExtractedData"), // JSON of extracted quote data
  
  // Status
  sendStatus: mysqlEnum("sendStatus", ["draft", "queued", "sent", "delivered", "failed", "bounced"]).default("draft"),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  openedAt: timestamp("openedAt"),
  errorMessage: text("errorMessage"),
  
  // External IDs
  externalMessageId: varchar("externalMessageId", { length: 255 }),
  threadId: varchar("threadId", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Vendors invited to an RFQ
export const vendorRfqInvitations = mysqlTable("vendorRfqInvitations", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  vendorId: int("vendorId").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "viewed", "responded", "declined", "no_response"]).default("pending").notNull(),
  
  invitedAt: timestamp("invitedAt"),
  viewedAt: timestamp("viewedAt"),
  respondedAt: timestamp("respondedAt"),
  reminderSentAt: timestamp("reminderSentAt"),
  reminderCount: int("reminderCount").default(0),
  
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VendorRfq = typeof vendorRfqs.$inferSelect;
export type InsertVendorRfq = typeof vendorRfqs.$inferInsert;

export type VendorQuote = typeof vendorQuotes.$inferSelect;
export type InsertVendorQuote = typeof vendorQuotes.$inferInsert;

export type VendorRfqEmail = typeof vendorRfqEmails.$inferSelect;
export type InsertVendorRfqEmail = typeof vendorRfqEmails.$inferInsert;

export type VendorRfqInvitation = typeof vendorRfqInvitations.$inferSelect;
export type InsertVendorRfqInvitation = typeof vendorRfqInvitations.$inferInsert;

// ============================================
// CRM MODULE - Contacts, Messaging & Tracking
// ============================================

// CRM Contacts - Individual contact persons (separate from customer accounts)
export const crmContacts = mysqlTable("crm_contacts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),

  // Basic info
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  whatsappNumber: varchar("whatsappNumber", { length: 32 }),
  linkedinUrl: varchar("linkedinUrl", { length: 512 }),

  // Organization info
  organization: varchar("organization", { length: 255 }),
  jobTitle: varchar("jobTitle", { length: 255 }),
  department: varchar("department", { length: 128 }),

  // Address
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),

  // CRM classification
  contactType: mysqlEnum("contactType", ["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"]).default("lead").notNull(),
  source: mysqlEnum("source", ["iphone_bump", "whatsapp", "linkedin_scan", "business_card", "website", "referral", "event", "cold_outreach", "import", "manual"]).default("manual").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "unsubscribed", "bounced"]).default("active").notNull(),

  // Sales/Fundraising context
  pipelineStage: mysqlEnum("pipelineStage", ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).default("new"),
  dealValue: decimal("dealValue", { precision: 15, scale: 2 }),
  dealCurrency: varchar("dealCurrency", { length: 3 }).default("USD"),

  // Engagement tracking
  leadScore: int("leadScore").default(0),
  lastContactedAt: timestamp("lastContactedAt"),
  lastRepliedAt: timestamp("lastRepliedAt"),
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  totalInteractions: int("totalInteractions").default(0),

  // Communication preferences
  preferredChannel: mysqlEnum("preferredChannel", ["email", "whatsapp", "phone", "sms", "linkedin"]).default("email"),
  optedOutEmail: boolean("optedOutEmail").default(false),
  optedOutSms: boolean("optedOutSms").default(false),
  optedOutWhatsapp: boolean("optedOutWhatsapp").default(false),

  // External integrations
  customerId: int("customerId"), // Link to customer if converted
  hubspotContactId: varchar("hubspotContactId", { length: 64 }),
  salesforceContactId: varchar("salesforceContactId", { length: 64 }),

  // Capture metadata
  captureDeviceId: varchar("captureDeviceId", { length: 128 }),
  captureSessionId: varchar("captureSessionId", { length: 128 }),
  capturedBy: int("capturedBy"),
  captureData: text("captureData"), // JSON - raw data from capture source

  // Additional info
  notes: text("notes"),
  tags: text("tags"), // JSON array of tag names
  customFields: text("customFields"), // JSON object for custom fields
  avatarUrl: text("avatarUrl"),

  assignedTo: int("assignedTo"), // User responsible for this contact
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmContact = typeof crmContacts.$inferSelect;
export type InsertCrmContact = typeof crmContacts.$inferInsert;

// CRM Contact Tags for categorization
export const crmTags = mysqlTable("crm_tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 7 }).default("#3B82F6"), // Hex color
  category: mysqlEnum("category", ["contact", "deal", "general"]).default("general"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CrmTag = typeof crmTags.$inferSelect;
export type InsertCrmTag = typeof crmTags.$inferInsert;

// Contact-Tag associations
export const crmContactTags = mysqlTable("crm_contact_tags", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// WhatsApp Messages - Track WhatsApp conversations
export const whatsappMessages = mysqlTable("whatsapp_messages", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId"),

  // Message identifiers
  messageId: varchar("messageId", { length: 128 }), // WhatsApp message ID
  conversationId: varchar("conversationId", { length: 128 }), // Conversation thread

  // Contact info
  whatsappNumber: varchar("whatsappNumber", { length: 32 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),

  // Message details
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  messageType: mysqlEnum("messageType", ["text", "image", "video", "audio", "document", "location", "contact", "template"]).default("text"),
  content: text("content"),
  mediaUrl: text("mediaUrl"),
  mediaType: varchar("mediaType", { length: 128 }),

  // Status tracking
  status: mysqlEnum("status", ["pending", "sent", "delivered", "read", "failed"]).default("pending"),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  failedReason: text("failedReason"),

  // Template tracking (for business API)
  templateName: varchar("templateName", { length: 128 }),
  templateParams: text("templateParams"), // JSON

  // AI processing
  aiProcessed: boolean("aiProcessed").default(false),
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]),
  aiSummary: text("aiSummary"),
  aiSuggestedReply: text("aiSuggestedReply"),

  // Context
  relatedEntityType: varchar("relatedEntityType", { length: 50 }),
  relatedEntityId: int("relatedEntityId"),

  sentBy: int("sentBy"),
  metadata: text("metadata"), // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = typeof whatsappMessages.$inferInsert;

// CRM Interactions - Unified activity log across all channels
export const crmInteractions = mysqlTable("crm_interactions", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),

  // Interaction type
  channel: mysqlEnum("channel", ["email", "whatsapp", "sms", "phone", "meeting", "linkedin", "note", "task"]).notNull(),
  interactionType: mysqlEnum("interactionType", ["sent", "received", "call_made", "call_received", "meeting_scheduled", "meeting_completed", "note_added", "task_completed"]).notNull(),

  // Content
  subject: varchar("subject", { length: 500 }),
  content: text("content"),
  summary: text("summary"),

  // Linked records
  emailId: int("emailId"), // Link to sentEmails or inboundEmails
  whatsappMessageId: int("whatsappMessageId"),

  // Call details (if phone)
  callDuration: int("callDuration"), // seconds
  callOutcome: mysqlEnum("callOutcome", ["answered", "voicemail", "no_answer", "busy", "wrong_number"]),

  // Meeting details
  meetingStartTime: timestamp("meetingStartTime"),
  meetingEndTime: timestamp("meetingEndTime"),
  meetingLocation: varchar("meetingLocation", { length: 255 }),
  meetingLink: varchar("meetingLink", { length: 512 }),

  // Engagement metrics
  opened: boolean("opened").default(false),
  clicked: boolean("clicked").default(false),
  replied: boolean("replied").default(false),

  // AI analysis
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]),
  aiNotes: text("aiNotes"),

  // Context
  relatedDealId: int("relatedDealId"),
  performedBy: int("performedBy"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmInteraction = typeof crmInteractions.$inferSelect;
export type InsertCrmInteraction = typeof crmInteractions.$inferInsert;

// CRM Pipelines - For sales and fundraising
export const crmPipelines = mysqlTable("crm_pipelines", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["sales", "fundraising", "partnerships", "other"]).default("sales").notNull(),
  stages: text("stages").notNull(), // JSON array of stage names and order
  isDefault: boolean("isDefault").default(false),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmPipeline = typeof crmPipelines.$inferSelect;
export type InsertCrmPipeline = typeof crmPipelines.$inferInsert;

// CRM Deals - Track opportunities/deals
export const crmDeals = mysqlTable("crm_deals", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: int("pipelineId").notNull(),
  contactId: int("contactId").notNull(),

  // Deal info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  stage: varchar("stage", { length: 64 }).notNull(),

  // Value
  amount: decimal("amount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  probability: int("probability").default(0), // 0-100%
  expectedCloseDate: timestamp("expectedCloseDate"),

  // Status
  status: mysqlEnum("status", ["open", "won", "lost", "stalled"]).default("open").notNull(),
  lostReason: varchar("lostReason", { length: 255 }),
  wonAt: timestamp("wonAt"),
  lostAt: timestamp("lostAt"),

  // Assignment
  assignedTo: int("assignedTo"),

  // Source tracking
  source: varchar("source", { length: 128 }),
  campaign: varchar("campaign", { length: 128 }),

  notes: text("notes"),
  customFields: text("customFields"), // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmDeal = typeof crmDeals.$inferSelect;
export type InsertCrmDeal = typeof crmDeals.$inferInsert;

// Contact Captures - Track how contacts were captured
export const contactCaptures = mysqlTable("contact_captures", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId"),

  // Capture method
  captureMethod: mysqlEnum("captureMethod", ["iphone_bump", "airdrop", "nfc", "qr_code", "whatsapp_scan", "linkedin_scan", "business_card_scan", "manual"]).notNull(),

  // Raw captured data
  rawData: text("rawData").notNull(), // JSON - vCard, LinkedIn profile data, etc.
  parsedData: text("parsedData"), // JSON - Parsed/normalized data

  // vCard specific fields
  vcardData: text("vcardData"),

  // LinkedIn specific fields
  linkedinProfileUrl: varchar("linkedinProfileUrl", { length: 512 }),
  linkedinProfileData: text("linkedinProfileData"), // JSON

  // Business card scan
  imageUrl: text("imageUrl"),
  ocrText: text("ocrText"),

  // Processing status
  status: mysqlEnum("status", ["pending", "parsed", "contact_created", "merged", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),

  // Context
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  capturedBy: int("capturedBy"),
  eventName: varchar("eventName", { length: 255 }), // Name of event where captured
  eventLocation: varchar("eventLocation", { length: 255 }),

  // Device info
  deviceType: varchar("deviceType", { length: 64 }),
  deviceId: varchar("deviceId", { length: 128 }),

  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactCapture = typeof contactCaptures.$inferSelect;
export type InsertContactCapture = typeof contactCaptures.$inferInsert;

// Email Campaigns for CRM
export const crmEmailCampaigns = mysqlTable("crm_email_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyHtml: text("bodyHtml").notNull(),
  bodyText: text("bodyText"),

  // Campaign type
  type: mysqlEnum("type", ["newsletter", "drip", "announcement", "follow_up", "custom"]).default("custom"),

  // Status
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "paused", "cancelled"]).default("draft"),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),

  // Targeting
  targetTags: text("targetTags"), // JSON array of tag IDs
  targetContactTypes: text("targetContactTypes"), // JSON array
  targetPipelineStages: text("targetPipelineStages"), // JSON array

  // Stats
  totalRecipients: int("totalRecipients").default(0),
  sentCount: int("sentCount").default(0),
  deliveredCount: int("deliveredCount").default(0),
  openedCount: int("openedCount").default(0),
  clickedCount: int("clickedCount").default(0),
  bouncedCount: int("bouncedCount").default(0),
  unsubscribedCount: int("unsubscribedCount").default(0),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmEmailCampaign = typeof crmEmailCampaigns.$inferSelect;
export type InsertCrmEmailCampaign = typeof crmEmailCampaigns.$inferInsert;

// Campaign recipients tracking
export const crmCampaignRecipients = mysqlTable("crm_campaign_recipients", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  contactId: int("contactId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),

  status: mysqlEnum("status", ["pending", "sent", "delivered", "opened", "clicked", "bounced", "unsubscribed"]).default("pending"),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  openedAt: timestamp("openedAt"),
  clickedAt: timestamp("clickedAt"),

  messageId: varchar("messageId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CrmCampaignRecipient = typeof crmCampaignRecipients.$inferSelect;
export type InsertCrmCampaignRecipient = typeof crmCampaignRecipients.$inferInsert;

// ============================================
// SALES AUTOMATION SYSTEM - Million Dollar Sales Machine
// ============================================

// Sales Territories - Geographic/account-based territories for sales reps
export const salesTerritories = mysqlTable("sales_territories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  // Territory definition
  type: mysqlEnum("type", ["geographic", "industry", "account_size", "product", "named_accounts", "custom"]).default("geographic").notNull(),
  rules: text("rules"), // JSON - rules for auto-assignment (regions, industries, deal sizes, etc.)

  // Assignment
  ownerId: int("ownerId"), // Primary owner (user ID)
  teamMembers: text("teamMembers"), // JSON array of user IDs

  // Targets
  annualTarget: decimal("annualTarget", { precision: 15, scale: 2 }),
  quarterlyTarget: decimal("quarterlyTarget", { precision: 15, scale: 2 }),
  monthlyTarget: decimal("monthlyTarget", { precision: 15, scale: 2 }),

  // Performance tracking
  ytdRevenue: decimal("ytdRevenue", { precision: 15, scale: 2 }).default("0"),
  qtdRevenue: decimal("qtdRevenue", { precision: 15, scale: 2 }).default("0"),
  mtdRevenue: decimal("mtdRevenue", { precision: 15, scale: 2 }).default("0"),

  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesTerritory = typeof salesTerritories.$inferSelect;
export type InsertSalesTerritory = typeof salesTerritories.$inferInsert;

// Sales Quotas - Individual and team quotas with period tracking
export const salesQuotas = mysqlTable("sales_quotas", {
  id: int("id").autoincrement().primaryKey(),

  // Assignment (one of these should be set)
  userId: int("userId"), // Individual quota
  territoryId: int("territoryId"), // Territory quota
  teamId: int("teamId"), // Team quota

  // Period
  periodType: mysqlEnum("periodType", ["monthly", "quarterly", "annual"]).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  fiscalYear: int("fiscalYear").notNull(),
  fiscalQuarter: int("fiscalQuarter"),
  fiscalMonth: int("fiscalMonth"),

  // Quota amounts
  revenueQuota: decimal("revenueQuota", { precision: 15, scale: 2 }).notNull(),
  dealCountQuota: int("dealCountQuota"),
  newBusinessQuota: decimal("newBusinessQuota", { precision: 15, scale: 2 }),
  renewalQuota: decimal("renewalQuota", { precision: 15, scale: 2 }),
  upsellQuota: decimal("upsellQuota", { precision: 15, scale: 2 }),

  // Achievement tracking
  revenueAchieved: decimal("revenueAchieved", { precision: 15, scale: 2 }).default("0"),
  dealCountAchieved: int("dealCountAchieved").default(0),
  newBusinessAchieved: decimal("newBusinessAchieved", { precision: 15, scale: 2 }).default("0"),
  renewalAchieved: decimal("renewalAchieved", { precision: 15, scale: 2 }).default("0"),
  upsellAchieved: decimal("upsellAchieved", { precision: 15, scale: 2 }).default("0"),

  // Attainment percentage (calculated field stored for querying)
  attainmentPercent: decimal("attainmentPercent", { precision: 5, scale: 2 }).default("0"),

  // Status
  status: mysqlEnum("status", ["draft", "active", "closed"]).default("draft"),

  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesQuota = typeof salesQuotas.$inferSelect;
export type InsertSalesQuota = typeof salesQuotas.$inferInsert;

// Commission Plans - Flexible commission structures
export const commissionPlans = mysqlTable("commission_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  // Plan type
  type: mysqlEnum("type", ["flat_rate", "tiered", "accelerator", "draw", "hybrid"]).default("flat_rate").notNull(),

  // Base commission rates (JSON for flexibility)
  // Example: { "base": 10, "tiers": [{ "min": 100, "max": 150, "rate": 12 }, { "min": 150, "rate": 15 }] }
  rateStructure: text("rateStructure").notNull(),

  // Conditions
  dealTypeRates: text("dealTypeRates"), // JSON - different rates for new/renewal/upsell
  productRates: text("productRates"), // JSON - different rates by product

  // Caps and floors
  minPayout: decimal("minPayout", { precision: 15, scale: 2 }),
  maxPayout: decimal("maxPayout", { precision: 15, scale: 2 }),

  // Calculation timing
  calculationFrequency: mysqlEnum("calculationFrequency", ["realtime", "daily", "weekly", "monthly"]).default("monthly"),
  payoutFrequency: mysqlEnum("payoutFrequency", ["weekly", "biweekly", "monthly", "quarterly"]).default("monthly"),

  // Clawback rules
  clawbackEnabled: boolean("clawbackEnabled").default(false),
  clawbackPeriodDays: int("clawbackPeriodDays").default(90),
  clawbackRules: text("clawbackRules"), // JSON

  effectiveDate: timestamp("effectiveDate").notNull(),
  expirationDate: timestamp("expirationDate"),
  isActive: boolean("isActive").default(true),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommissionPlan = typeof commissionPlans.$inferSelect;
export type InsertCommissionPlan = typeof commissionPlans.$inferInsert;

// Commission Assignments - Link users to commission plans
export const commissionAssignments = mysqlTable("commission_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  planId: int("planId").notNull(),

  // Override rates (if different from plan defaults)
  customRateStructure: text("customRateStructure"), // JSON

  // Draw amount (for draw-based plans)
  drawAmount: decimal("drawAmount", { precision: 15, scale: 2 }),

  effectiveDate: timestamp("effectiveDate").notNull(),
  expirationDate: timestamp("expirationDate"),
  isActive: boolean("isActive").default(true),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommissionAssignment = typeof commissionAssignments.$inferSelect;
export type InsertCommissionAssignment = typeof commissionAssignments.$inferInsert;

// Commission Transactions - Individual commission events
export const commissionTransactions = mysqlTable("commission_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  assignmentId: int("assignmentId").notNull(),

  // Source of commission
  dealId: int("dealId"),
  invoiceId: int("invoiceId"),
  orderId: int("orderId"),

  // Transaction details
  transactionType: mysqlEnum("transactionType", ["earned", "paid", "clawback", "adjustment", "draw"]).notNull(),

  // Amounts
  dealAmount: decimal("dealAmount", { precision: 15, scale: 2 }),
  commissionRate: decimal("commissionRate", { precision: 5, scale: 4 }),
  commissionAmount: decimal("commissionAmount", { precision: 15, scale: 2 }).notNull(),

  // Status
  status: mysqlEnum("status", ["pending", "approved", "paid", "clawedback"]).default("pending"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  paidAt: timestamp("paidAt"),

  // Period
  earnedPeriod: varchar("earnedPeriod", { length: 7 }), // YYYY-MM format
  payoutPeriod: varchar("payoutPeriod", { length: 7 }),

  notes: text("notes"),
  metadata: text("metadata"), // JSON for additional calculation details
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommissionTransaction = typeof commissionTransactions.$inferSelect;
export type InsertCommissionTransaction = typeof commissionTransactions.$inferInsert;

// Lead Scoring Rules - AI-powered lead scoring configuration
export const leadScoringRules = mysqlTable("lead_scoring_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  // Rule type
  category: mysqlEnum("category", ["demographic", "firmographic", "behavioral", "engagement", "fit", "custom"]).notNull(),

  // Scoring criteria (JSON)
  // Example: { "field": "jobTitle", "operator": "contains", "value": "VP", "score": 25 }
  criteria: text("criteria").notNull(),

  // Score impact
  scoreValue: int("scoreValue").notNull(), // Points to add/subtract
  scoreType: mysqlEnum("scoreType", ["add", "subtract", "multiply", "set"]).default("add"),

  // Decay settings (for behavioral scores)
  decayEnabled: boolean("decayEnabled").default(false),
  decayDays: int("decayDays"), // Days until score starts decaying
  decayRate: decimal("decayRate", { precision: 3, scale: 2 }), // Percentage decay per day

  // Limits
  maxApplications: int("maxApplications"), // How many times this rule can apply to one lead

  priority: int("priority").default(0), // Higher priority rules evaluated first
  isActive: boolean("isActive").default(true),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadScoringRule = typeof leadScoringRules.$inferSelect;
export type InsertLeadScoringRule = typeof leadScoringRules.$inferInsert;

// Lead Score History - Track score changes over time
export const leadScoreHistory = mysqlTable("lead_score_history", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),

  // Score details
  previousScore: int("previousScore").notNull(),
  newScore: int("newScore").notNull(),
  scoreChange: int("scoreChange").notNull(),

  // What caused the change
  changeReason: mysqlEnum("changeReason", ["rule_applied", "manual_adjustment", "decay", "activity", "profile_update", "conversion"]).notNull(),
  ruleId: int("ruleId"), // If rule-based
  activityType: varchar("activityType", { length: 64 }), // If activity-based

  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LeadScoreHistory = typeof leadScoreHistory.$inferSelect;
export type InsertLeadScoreHistory = typeof leadScoreHistory.$inferInsert;

// Sales Automation Rules - Triggered automations for sales workflows
export const salesAutomationRules = mysqlTable("sales_automation_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  // Trigger configuration
  triggerType: mysqlEnum("triggerType", [
    "deal_created", "deal_stage_changed", "deal_won", "deal_lost", "deal_stalled",
    "contact_created", "contact_updated", "contact_score_changed",
    "email_opened", "email_clicked", "email_replied",
    "no_activity", "follow_up_due", "meeting_scheduled", "meeting_completed",
    "quote_sent", "quote_viewed", "quote_accepted",
    "invoice_sent", "invoice_paid", "invoice_overdue",
    "custom_field_changed", "tag_added", "tag_removed",
    "schedule" // Time-based triggers
  ]).notNull(),

  // Trigger conditions (JSON)
  // Example: { "stage": "proposal", "amount_gt": 10000 }
  triggerConditions: text("triggerConditions"),

  // Schedule (for time-based triggers)
  schedule: text("schedule"), // Cron expression or interval

  // Actions to perform (JSON array)
  // Example: [{ "type": "send_email", "templateId": 1, "delay": "1d" }, { "type": "create_task", "assignTo": "owner" }]
  actions: text("actions").notNull(),

  // Execution settings
  delayMinutes: int("delayMinutes").default(0), // Delay before executing actions
  onlyDuringBusinessHours: boolean("onlyDuringBusinessHours").default(false),
  businessHoursTimezone: varchar("businessHoursTimezone", { length: 64 }),

  // Targeting
  applyToPipelines: text("applyToPipelines"), // JSON array of pipeline IDs (null = all)
  applyToContactTypes: text("applyToContactTypes"), // JSON array
  applyToTags: text("applyToTags"), // JSON array

  // Rate limiting
  maxExecutionsPerContact: int("maxExecutionsPerContact"),
  cooldownMinutes: int("cooldownMinutes"), // Min time between executions for same contact

  // Stats
  totalExecutions: int("totalExecutions").default(0),
  lastExecutedAt: timestamp("lastExecutedAt"),

  priority: int("priority").default(0),
  isActive: boolean("isActive").default(true),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesAutomationRule = typeof salesAutomationRules.$inferSelect;
export type InsertSalesAutomationRule = typeof salesAutomationRules.$inferInsert;

// Sales Automation Executions - Log of automation runs
export const salesAutomationExecutions = mysqlTable("sales_automation_executions", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull(),

  // Target entity
  contactId: int("contactId"),
  dealId: int("dealId"),

  // Trigger info
  triggerEvent: varchar("triggerEvent", { length: 64 }).notNull(),
  triggerData: text("triggerData"), // JSON - data that triggered the automation

  // Execution status
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),

  // Actions executed (JSON array with results)
  actionsExecuted: text("actionsExecuted"),

  // Timing
  scheduledFor: timestamp("scheduledFor"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),

  // Error handling
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SalesAutomationExecution = typeof salesAutomationExecutions.$inferSelect;
export type InsertSalesAutomationExecution = typeof salesAutomationExecutions.$inferInsert;

// Email Sequences - Multi-step drip campaigns
export const emailSequences = mysqlTable("email_sequences", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  // Sequence type
  type: mysqlEnum("type", ["nurture", "onboarding", "re_engagement", "upsell", "follow_up", "event", "custom"]).default("nurture").notNull(),

  // Entry triggers (JSON)
  // Example: { "type": "tag_added", "tag": "interested" }
  entryTriggers: text("entryTriggers"),

  // Exit triggers (JSON) - when to remove from sequence
  exitTriggers: text("exitTriggers"),

  // Settings
  sendOnWeekends: boolean("sendOnWeekends").default(false),
  sendingWindow: text("sendingWindow"), // JSON - { "start": "09:00", "end": "17:00", "timezone": "America/New_York" }

  // Goal tracking
  goalType: mysqlEnum("goalType", ["reply", "click", "meeting_booked", "deal_created", "deal_won", "custom"]),
  goalCondition: text("goalCondition"), // JSON

  // Stats
  totalEnrolled: int("totalEnrolled").default(0),
  totalCompleted: int("totalCompleted").default(0),
  totalConverted: int("totalConverted").default(0),

  isActive: boolean("isActive").default(true),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertEmailSequence = typeof emailSequences.$inferInsert;

// Email Sequence Steps - Individual steps in a sequence
export const emailSequenceSteps = mysqlTable("email_sequence_steps", {
  id: int("id").autoincrement().primaryKey(),
  sequenceId: int("sequenceId").notNull(),

  stepNumber: int("stepNumber").notNull(),
  name: varchar("name", { length: 128 }),

  // Step type
  stepType: mysqlEnum("stepType", ["email", "task", "wait", "condition", "webhook"]).default("email").notNull(),

  // Timing (for wait steps and delays before this step)
  delayDays: int("delayDays").default(0),
  delayHours: int("delayHours").default(0),
  delayMinutes: int("delayMinutes").default(0),

  // Email content (for email steps)
  emailTemplateId: int("emailTemplateId"),
  subject: varchar("subject", { length: 500 }),
  bodyHtml: text("bodyHtml"),
  bodyText: text("bodyText"),

  // Task details (for task steps)
  taskTitle: varchar("taskTitle", { length: 255 }),
  taskDescription: text("taskDescription"),
  taskAssignTo: mysqlEnum("taskAssignTo", ["owner", "specific_user", "round_robin"]),
  taskAssignUserId: int("taskAssignUserId"),

  // Condition (for branching)
  conditionType: varchar("conditionType", { length: 64 }),
  conditionConfig: text("conditionConfig"), // JSON
  trueNextStep: int("trueNextStep"),
  falseNextStep: int("falseNextStep"),

  // Webhook (for webhook steps)
  webhookUrl: text("webhookUrl"),
  webhookPayload: text("webhookPayload"), // JSON template

  // A/B testing
  isAbTest: boolean("isAbTest").default(false),
  abVariants: text("abVariants"), // JSON array of variant configs

  // Stats
  totalSent: int("totalSent").default(0),
  totalOpened: int("totalOpened").default(0),
  totalClicked: int("totalClicked").default(0),
  totalReplied: int("totalReplied").default(0),

  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailSequenceStep = typeof emailSequenceSteps.$inferSelect;
export type InsertEmailSequenceStep = typeof emailSequenceSteps.$inferInsert;

// Email Sequence Enrollments - Contacts enrolled in sequences
export const emailSequenceEnrollments = mysqlTable("email_sequence_enrollments", {
  id: int("id").autoincrement().primaryKey(),
  sequenceId: int("sequenceId").notNull(),
  contactId: int("contactId").notNull(),

  // Current position
  currentStepId: int("currentStepId"),
  currentStepNumber: int("currentStepNumber").default(1),

  // Status
  status: mysqlEnum("status", ["active", "paused", "completed", "exited", "bounced", "unsubscribed"]).default("active").notNull(),
  exitReason: varchar("exitReason", { length: 128 }),

  // Goal achievement
  goalAchieved: boolean("goalAchieved").default(false),
  goalAchievedAt: timestamp("goalAchievedAt"),

  // Scheduling
  nextStepScheduledAt: timestamp("nextStepScheduledAt"),

  // Stats for this enrollment
  emailsSent: int("emailsSent").default(0),
  emailsOpened: int("emailsOpened").default(0),
  emailsClicked: int("emailsClicked").default(0),
  emailsReplied: int("emailsReplied").default(0),

  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  enrolledBy: int("enrolledBy"),
  completedAt: timestamp("completedAt"),
  exitedAt: timestamp("exitedAt"),

  metadata: text("metadata"), // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailSequenceEnrollment = typeof emailSequenceEnrollments.$inferSelect;
export type InsertEmailSequenceEnrollment = typeof emailSequenceEnrollments.$inferInsert;

// Email Sequence Events - Track all events in sequences
export const emailSequenceEvents = mysqlTable("email_sequence_events", {
  id: int("id").autoincrement().primaryKey(),
  enrollmentId: int("enrollmentId").notNull(),
  stepId: int("stepId"),

  eventType: mysqlEnum("eventType", [
    "enrolled", "step_started", "email_sent", "email_opened", "email_clicked", "email_replied", "email_bounced",
    "task_created", "task_completed", "condition_evaluated", "webhook_fired",
    "paused", "resumed", "step_completed", "sequence_completed", "goal_achieved", "exited", "error"
  ]).notNull(),

  eventData: text("eventData"), // JSON
  errorMessage: text("errorMessage"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailSequenceEvent = typeof emailSequenceEvents.$inferSelect;
export type InsertEmailSequenceEvent = typeof emailSequenceEvents.$inferInsert;

// Sales Activities - Detailed activity tracking for sales process
export const salesActivities = mysqlTable("sales_activities", {
  id: int("id").autoincrement().primaryKey(),

  // Linked entities
  contactId: int("contactId"),
  dealId: int("dealId"),
  companyId: int("companyId"),

  // Activity type
  activityType: mysqlEnum("activityType", [
    "email_sent", "email_received", "email_opened", "email_clicked",
    "call_made", "call_received", "call_missed", "voicemail_left",
    "meeting_scheduled", "meeting_completed", "meeting_cancelled", "meeting_no_show",
    "demo_scheduled", "demo_completed",
    "proposal_sent", "proposal_viewed", "proposal_accepted", "proposal_rejected",
    "contract_sent", "contract_signed",
    "note_added", "task_created", "task_completed",
    "stage_changed", "deal_created", "deal_won", "deal_lost",
    "document_shared", "document_viewed",
    "linkedin_message", "linkedin_connection",
    "sms_sent", "sms_received",
    "whatsapp_sent", "whatsapp_received",
    "chat_message", "form_submitted", "page_visited",
    "custom"
  ]).notNull(),

  // Activity details
  subject: varchar("subject", { length: 500 }),
  description: text("description"),
  outcome: varchar("outcome", { length: 128 }),

  // Duration (for calls/meetings)
  durationMinutes: int("durationMinutes"),

  // Linked records
  emailId: int("emailId"),
  meetingId: int("meetingId"),
  taskId: int("taskId"),
  documentId: int("documentId"),

  // Attribution
  performedBy: int("performedBy"),

  // Value impact
  revenueImpact: decimal("revenueImpact", { precision: 15, scale: 2 }),

  // AI analysis
  aiSummary: text("aiSummary"),
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]),
  nextStepSuggestion: text("nextStepSuggestion"),

  metadata: text("metadata"), // JSON
  activityDate: timestamp("activityDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SalesActivity = typeof salesActivities.$inferSelect;
export type InsertSalesActivity = typeof salesActivities.$inferInsert;

// Deal Stage History - Track deal progression through pipeline
export const dealStageHistory = mysqlTable("deal_stage_history", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),

  fromStage: varchar("fromStage", { length: 64 }),
  toStage: varchar("toStage", { length: 64 }).notNull(),

  // Time in stage
  daysInPreviousStage: int("daysInPreviousStage"),

  // Context
  changedBy: int("changedBy"),
  changeReason: varchar("changeReason", { length: 255 }),
  notes: text("notes"),

  // Probability change
  previousProbability: int("previousProbability"),
  newProbability: int("newProbability"),

  // Amount change (if any)
  previousAmount: decimal("previousAmount", { precision: 15, scale: 2 }),
  newAmount: decimal("newAmount", { precision: 15, scale: 2 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DealStageHistory = typeof dealStageHistory.$inferSelect;
export type InsertDealStageHistory = typeof dealStageHistory.$inferInsert;

// Sales Forecasts - Revenue forecasting
export const salesForecasts = mysqlTable("sales_forecasts", {
  id: int("id").autoincrement().primaryKey(),

  // Forecast scope
  userId: int("userId"),
  territoryId: int("territoryId"),
  pipelineId: int("pipelineId"),

  // Period
  forecastPeriod: varchar("forecastPeriod", { length: 7 }).notNull(), // YYYY-MM or YYYY-QN
  periodType: mysqlEnum("periodType", ["monthly", "quarterly"]).notNull(),

  // Forecast categories (using MEDDIC or similar methodology)
  // Commit - highly likely to close
  commitAmount: decimal("commitAmount", { precision: 15, scale: 2 }).default("0"),
  commitDealCount: int("commitDealCount").default(0),

  // Best Case - probable to close
  bestCaseAmount: decimal("bestCaseAmount", { precision: 15, scale: 2 }).default("0"),
  bestCaseDealCount: int("bestCaseDealCount").default(0),

  // Pipeline - all open opportunities
  pipelineAmount: decimal("pipelineAmount", { precision: 15, scale: 2 }).default("0"),
  pipelineDealCount: int("pipelineDealCount").default(0),

  // Weighted forecast (probability-weighted)
  weightedAmount: decimal("weightedAmount", { precision: 15, scale: 2 }).default("0"),

  // AI-predicted forecast
  aiPredictedAmount: decimal("aiPredictedAmount", { precision: 15, scale: 2 }),
  aiConfidence: decimal("aiConfidence", { precision: 3, scale: 2 }),
  aiReasoning: text("aiReasoning"),

  // Actuals (filled in when period closes)
  actualAmount: decimal("actualAmount", { precision: 15, scale: 2 }),
  actualDealCount: int("actualDealCount"),

  // Accuracy tracking
  forecastAccuracy: decimal("forecastAccuracy", { precision: 5, scale: 2 }),

  // Override
  manualOverride: decimal("manualOverride", { precision: 15, scale: 2 }),
  overrideReason: text("overrideReason"),
  overrideBy: int("overrideBy"),

  notes: text("notes"),
  lastUpdated: timestamp("lastUpdated").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesForecast = typeof salesForecasts.$inferSelect;
export type InsertSalesForecast = typeof salesForecasts.$inferInsert;

// Sales Goals - Personal and team goals beyond quotas
export const salesGoals = mysqlTable("sales_goals", {
  id: int("id").autoincrement().primaryKey(),

  // Assignment
  userId: int("userId"),
  teamId: int("teamId"),

  // Goal definition
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  goalType: mysqlEnum("goalType", [
    "revenue", "deal_count", "calls", "meetings", "demos", "proposals",
    "new_customers", "upsells", "renewals", "win_rate", "avg_deal_size",
    "activity_count", "response_time", "custom"
  ]).notNull(),

  // Target
  targetValue: decimal("targetValue", { precision: 15, scale: 2 }).notNull(),
  targetUnit: varchar("targetUnit", { length: 32 }), // e.g., "USD", "deals", "calls"

  // Current progress
  currentValue: decimal("currentValue", { precision: 15, scale: 2 }).default("0"),
  progressPercent: decimal("progressPercent", { precision: 5, scale: 2 }).default("0"),

  // Period
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),

  // Status
  status: mysqlEnum("status", ["not_started", "in_progress", "at_risk", "on_track", "achieved", "missed"]).default("not_started"),

  // Milestones (JSON array)
  milestones: text("milestones"),

  // Rewards/incentives
  rewardDescription: text("rewardDescription"),
  rewardValue: decimal("rewardValue", { precision: 15, scale: 2 }),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesGoal = typeof salesGoals.$inferSelect;
export type InsertSalesGoal = typeof salesGoals.$inferInsert;

// Sales Playbooks - Guided selling processes
export const salesPlaybooks = mysqlTable("sales_playbooks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  // When to use this playbook
  dealType: mysqlEnum("dealType", ["new_business", "upsell", "renewal", "expansion", "all"]).default("all"),
  dealSizeMin: decimal("dealSizeMin", { precision: 15, scale: 2 }),
  dealSizeMax: decimal("dealSizeMax", { precision: 15, scale: 2 }),
  industryFocus: text("industryFocus"), // JSON array

  // Playbook stages with tasks/guidance (JSON)
  stages: text("stages").notNull(),

  // Success metrics
  avgDealCycleTarget: int("avgDealCycleTarget"), // Days
  winRateTarget: decimal("winRateTarget", { precision: 5, scale: 2 }),

  // Stats
  dealsUsing: int("dealsUsing").default(0),
  avgWinRate: decimal("avgWinRate", { precision: 5, scale: 2 }),
  avgDealCycle: int("avgDealCycle"),

  isDefault: boolean("isDefault").default(false),
  isActive: boolean("isActive").default(true),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesPlaybook = typeof salesPlaybooks.$inferSelect;
export type InsertSalesPlaybook = typeof salesPlaybooks.$inferInsert;

// Deal Playbook Assignments - Link deals to playbooks
export const dealPlaybookAssignments = mysqlTable("deal_playbook_assignments", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  playbookId: int("playbookId").notNull(),

  // Progress
  currentStageIndex: int("currentStageIndex").default(0),
  completedTasks: text("completedTasks"), // JSON array of task IDs

  // Metrics
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DealPlaybookAssignment = typeof dealPlaybookAssignments.$inferSelect;
export type InsertDealPlaybookAssignment = typeof dealPlaybookAssignments.$inferInsert;

// Sales Coaching Notes - Manager coaching and feedback
export const salesCoachingNotes = mysqlTable("sales_coaching_notes", {
  id: int("id").autoincrement().primaryKey(),

  // Who's being coached
  repUserId: int("repUserId").notNull(),
  coachUserId: int("coachUserId").notNull(),

  // Context
  dealId: int("dealId"),
  callRecordingId: int("callRecordingId"),
  activityId: int("activityId"),

  // Coaching content
  type: mysqlEnum("type", ["deal_review", "call_coaching", "pipeline_review", "skill_development", "performance_review", "win_analysis", "loss_analysis"]).notNull(),

  title: varchar("title", { length: 255 }),
  notes: text("notes").notNull(),

  // Action items (JSON array)
  actionItems: text("actionItems"),

  // Ratings (1-5)
  overallRating: int("overallRating"),
  ratings: text("ratings"), // JSON - { "discovery": 4, "objection_handling": 3, etc. }

  // Follow-up
  followUpDate: timestamp("followUpDate"),
  followUpCompleted: boolean("followUpCompleted").default(false),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesCoachingNote = typeof salesCoachingNotes.$inferSelect;
export type InsertSalesCoachingNote = typeof salesCoachingNotes.$inferInsert;

// Sales Leaderboard Snapshots - Gamification and competition
export const salesLeaderboardSnapshots = mysqlTable("sales_leaderboard_snapshots", {
  id: int("id").autoincrement().primaryKey(),

  // Period
  periodType: mysqlEnum("periodType", ["daily", "weekly", "monthly", "quarterly", "annual"]).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),

  // Rankings (JSON array of { userId, rank, metric, value })
  revenueRankings: text("revenueRankings"),
  dealCountRankings: text("dealCountRankings"),
  activityRankings: text("activityRankings"),
  winRateRankings: text("winRateRankings"),

  // Snapshot time
  snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SalesLeaderboardSnapshot = typeof salesLeaderboardSnapshots.$inferSelect;
export type InsertSalesLeaderboardSnapshot = typeof salesLeaderboardSnapshots.$inferInsert;

// Deal Competitors - Track competitive deals
export const dealCompetitors = mysqlTable("deal_competitors", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),

  competitorName: varchar("competitorName", { length: 128 }).notNull(),

  // Competitive intelligence
  status: mysqlEnum("status", ["identified", "actively_competing", "eliminated", "won_against", "lost_to"]).default("identified"),
  threatLevel: mysqlEnum("threatLevel", ["low", "medium", "high", "critical"]).default("medium"),

  // Pricing intel
  estimatedPrice: decimal("estimatedPrice", { precision: 15, scale: 2 }),
  priceConfidence: mysqlEnum("priceConfidence", ["rumor", "estimate", "confirmed"]),

  // Strengths/weaknesses
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  ourAdvantages: text("ourAdvantages"),

  // Battle card (link to content)
  battleCardUrl: text("battleCardUrl"),

  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DealCompetitor = typeof dealCompetitors.$inferSelect;
export type InsertDealCompetitor = typeof dealCompetitors.$inferInsert;

// Sales Metrics Daily - Pre-aggregated daily metrics for fast dashboards
export const salesMetricsDaily = mysqlTable("sales_metrics_daily", {
  id: int("id").autoincrement().primaryKey(),

  metricDate: timestamp("metricDate").notNull(),
  userId: int("userId"),
  territoryId: int("territoryId"),
  pipelineId: int("pipelineId"),

  // Pipeline metrics
  newDealsCount: int("newDealsCount").default(0),
  newDealsValue: decimal("newDealsValue", { precision: 15, scale: 2 }).default("0"),

  wonDealsCount: int("wonDealsCount").default(0),
  wonDealsValue: decimal("wonDealsValue", { precision: 15, scale: 2 }).default("0"),

  lostDealsCount: int("lostDealsCount").default(0),
  lostDealsValue: decimal("lostDealsValue", { precision: 15, scale: 2 }).default("0"),

  // Activity metrics
  emailsSent: int("emailsSent").default(0),
  emailsOpened: int("emailsOpened").default(0),
  callsMade: int("callsMade").default(0),
  callsConnected: int("callsConnected").default(0),
  meetingsBooked: int("meetingsBooked").default(0),
  meetingsCompleted: int("meetingsCompleted").default(0),
  proposalsSent: int("proposalsSent").default(0),

  // Engagement metrics
  totalActivities: int("totalActivities").default(0),
  averageResponseTime: int("averageResponseTime"), // Minutes

  // Pipeline health
  pipelineValue: decimal("pipelineValue", { precision: 15, scale: 2 }).default("0"),
  weightedPipeline: decimal("weightedPipeline", { precision: 15, scale: 2 }).default("0"),
  avgDealSize: decimal("avgDealSize", { precision: 15, scale: 2 }),
  avgSalesCycle: int("avgSalesCycle"), // Days

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesMetricsDaily = typeof salesMetricsDaily.$inferSelect;
export type InsertSalesMetricsDaily = typeof salesMetricsDaily.$inferInsert;

// Type exports for new tables
// ============================================
// WORLD-CLASS SALES SYSTEM - REVENUE INTELLIGENCE
// ============================================

// Sales Calls with Recording and AI Analysis
export const salesCalls = mysqlTable("sales_calls", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId"),
  contactId: int("contactId"),
  accountId: int("accountId"),
  userId: int("userId").notNull(), // Rep who made the call

  // Call details
  callType: mysqlEnum("callType", ["discovery", "demo", "negotiation", "closing", "followup", "qbr", "other"]).default("other"),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).default("outbound"),
  callDate: timestamp("callDate").notNull(),
  duration: int("duration"), // Seconds
  phoneNumber: varchar("phoneNumber", { length: 32 }),

  // Recording
  recordingUrl: text("recordingUrl"),
  recordingDuration: int("recordingDuration"),
  transcriptText: text("transcriptText"),
  transcriptJson: text("transcriptJson"), // Structured with timestamps
  transcriptStatus: mysqlEnum("transcriptStatus", ["pending", "processing", "completed", "failed"]).default("pending"),

  // AI Analysis
  aiAnalysisJson: text("aiAnalysisJson"),
  sentiment: mysqlEnum("sentiment", ["very_positive", "positive", "neutral", "negative", "very_negative"]),
  talkRatio: decimal("talkRatio", { precision: 5, scale: 2 }), // Rep talk percentage
  longestMonologue: int("longestMonologue"), // Seconds
  questionsAsked: int("questionsAsked"),
  nextStepsIdentified: text("nextStepsIdentified"), // JSON array
  objectionsMentioned: text("objectionsMentioned"), // JSON array
  competitorsMentioned: text("competitorsMentioned"), // JSON array
  pricingDiscussed: boolean("pricingDiscussed").default(false),
  decisionMakerPresent: boolean("decisionMakerPresent"),
  followUpRequired: boolean("followUpRequired").default(false),
  keyTopics: text("keyTopics"), // JSON array
  actionItems: text("actionItems"), // JSON array
  riskSignals: text("riskSignals"), // JSON array
  buyingSignals: text("buyingSignals"), // JSON array

  // Scoring
  callScore: int("callScore"), // 0-100
  engagementScore: int("engagementScore"),

  notes: text("notes"),
  outcome: mysqlEnum("outcome", ["connected", "voicemail", "no_answer", "busy", "wrong_number", "meeting_scheduled", "followup_needed"]),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesCall = typeof salesCalls.$inferSelect;
export type InsertSalesCall = typeof salesCalls.$inferInsert;

// Conversation Insights - Aggregated from calls
export const conversationInsights = mysqlTable("conversation_insights", {
  id: int("id").autoincrement().primaryKey(),
  callId: int("callId").notNull(),
  insightType: mysqlEnum("insightType", [
    "competitor_mention", "pricing_objection", "timeline_mention", "budget_discussion",
    "decision_maker_identified", "champion_identified", "blocker_identified",
    "technical_requirement", "integration_need", "risk_signal", "buying_signal",
    "next_step", "action_item", "key_phrase", "sentiment_shift"
  ]).notNull(),
  content: text("content").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }), // 0-1
  timestampStart: int("timestampStart"), // Seconds into call
  timestampEnd: int("timestampEnd"),
  speaker: mysqlEnum("speaker", ["rep", "prospect", "unknown"]),
  metadata: text("metadata"), // JSON for additional context

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConversationInsight = typeof conversationInsights.$inferSelect;
export type InsertConversationInsight = typeof conversationInsights.$inferInsert;

// ============================================
// DEAL RISK SCORING & AI INSIGHTS
// ============================================

// Deal Risk Scores - Real-time AI-powered risk assessment
export const dealRiskScores = mysqlTable("deal_risk_scores", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),

  // Overall risk
  riskScore: int("riskScore").notNull(), // 0-100 (100 = highest risk)
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).notNull(),
  winProbability: int("winProbability"), // AI-adjusted 0-100

  // Risk factors (each 0-100)
  engagementRisk: int("engagementRisk"), // Low activity/response
  velocityRisk: int("velocityRisk"), // Stuck in stage too long
  stakeholderRisk: int("stakeholderRisk"), // Missing decision makers
  competitiveRisk: int("competitiveRisk"), // Strong competitor presence
  budgetRisk: int("budgetRisk"), // Budget concerns detected
  timelineRisk: int("timelineRisk"), // Timeline slipping
  championRisk: int("championRisk"), // Champion left or weak
  technicalRisk: int("technicalRisk"), // Technical blockers

  // Signals
  positiveSignals: text("positiveSignals"), // JSON array
  negativeSignals: text("negativeSignals"), // JSON array
  riskExplanation: text("riskExplanation"), // AI-generated explanation
  recommendations: text("recommendations"), // JSON array of next best actions

  // Tracking
  previousRiskScore: int("previousRiskScore"),
  scoreChangeReason: text("scoreChangeReason"),

  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DealRiskScore = typeof dealRiskScores.$inferSelect;
export type InsertDealRiskScore = typeof dealRiskScores.$inferInsert;

// Next Best Actions - AI recommendations
export const dealNextActions = mysqlTable("deal_next_actions", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  userId: int("userId"), // Assigned rep

  actionType: mysqlEnum("actionType", [
    "call_contact", "send_email", "schedule_meeting", "send_proposal",
    "engage_decision_maker", "address_objection", "provide_reference",
    "schedule_demo", "send_case_study", "involve_executive",
    "negotiate_terms", "create_urgency", "re_engage_champion",
    "competitive_displacement", "technical_deep_dive", "roi_discussion"
  ]).notNull(),

  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  reasoning: text("reasoning"), // Why AI recommends this
  contactId: int("contactId"), // Which contact to engage

  suggestedScript: text("suggestedScript"), // AI-generated talk track
  suggestedEmail: text("suggestedEmail"), // AI-generated email draft

  dueDate: timestamp("dueDate"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "dismissed", "snoozed"]).default("pending"),
  completedAt: timestamp("completedAt"),
  completedBy: int("completedBy"),
  outcome: text("outcome"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DealNextAction = typeof dealNextActions.$inferSelect;
export type InsertDealNextAction = typeof dealNextActions.$inferInsert;

// ============================================
// MULTI-CHANNEL SEQUENCES
// ============================================

// Sequence Steps - Extended for multi-channel
export const sequenceChannelSteps = mysqlTable("sequence_channel_steps", {
  id: int("id").autoincrement().primaryKey(),
  sequenceId: int("sequenceId").notNull(),
  stepNumber: int("stepNumber").notNull(),

  channel: mysqlEnum("channel", ["email", "phone", "linkedin", "sms", "task", "wait", "condition"]).notNull(),

  // Email
  emailSubject: varchar("emailSubject", { length: 500 }),
  emailBody: text("emailBody"),
  emailTemplateId: int("emailTemplateId"),

  // Phone
  callScript: text("callScript"),
  voicemailScript: text("voicemailScript"),
  callObjective: varchar("callObjective", { length: 255 }),

  // LinkedIn
  linkedinAction: mysqlEnum("linkedinAction", ["connect", "message", "inmail", "view_profile", "engage_post"]),
  linkedinMessage: text("linkedinMessage"),

  // SMS
  smsMessage: varchar("smsMessage", { length: 160 }),

  // Task
  taskTitle: varchar("taskTitle", { length: 255 }),
  taskDescription: text("taskDescription"),
  taskAssignTo: mysqlEnum("taskAssignTo", ["owner", "specific_user", "round_robin"]),
  taskAssignUserId: int("taskAssignUserId"),

  // A/B Testing
  isAbTest: boolean("isAbTest").default(false),
  abVariant: varchar("abVariant", { length: 1 }), // A or B
  abTestId: int("abTestId"),

  // Timing
  delayDays: int("delayDays").default(0),
  delayHours: int("delayHours").default(0),
  delayMinutes: int("delayMinutes").default(0),
  sendWindow: text("sendWindow"), // JSON { start: "09:00", end: "17:00", timezone: "America/New_York" }
  sendDays: text("sendDays"), // JSON array ["monday", "tuesday", ...]

  // Conditions
  conditionType: mysqlEnum("conditionType", [
    "email_opened", "email_clicked", "email_replied", "call_connected",
    "linkedin_accepted", "meeting_booked", "deal_created", "tag_added",
    "custom_field", "time_elapsed"
  ]),
  conditionConfig: text("conditionConfig"), // JSON
  trueNextStep: int("trueNextStep"),
  falseNextStep: int("falseNextStep"),

  isActive: boolean("isActive").default(true),

  // Stats
  totalExecuted: int("totalExecuted").default(0),
  successCount: int("successCount").default(0),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SequenceChannelStep = typeof sequenceChannelSteps.$inferSelect;
export type InsertSequenceChannelStep = typeof sequenceChannelSteps.$inferInsert;

// A/B Tests for Sequences
export const sequenceAbTests = mysqlTable("sequence_ab_tests", {
  id: int("id").autoincrement().primaryKey(),
  sequenceId: int("sequenceId").notNull(),
  stepNumber: int("stepNumber").notNull(),

  testName: varchar("testName", { length: 255 }).notNull(),
  testType: mysqlEnum("testType", ["subject_line", "body", "send_time", "channel"]).notNull(),

  variantAContent: text("variantAContent"),
  variantBContent: text("variantBContent"),

  // Distribution
  variantASplit: int("variantASplit").default(50), // Percentage

  // Results
  variantASent: int("variantASent").default(0),
  variantBSent: int("variantBSent").default(0),
  variantAOpens: int("variantAOpens").default(0),
  variantBOpens: int("variantBOpens").default(0),
  variantAClicks: int("variantAClicks").default(0),
  variantBClicks: int("variantBClicks").default(0),
  variantAReplies: int("variantAReplies").default(0),
  variantBReplies: int("variantBReplies").default(0),
  variantAMeetings: int("variantAMeetings").default(0),
  variantBMeetings: int("variantBMeetings").default(0),

  // Winner
  winnerVariant: varchar("winnerVariant", { length: 1 }),
  winnerDeclaredAt: timestamp("winnerDeclaredAt"),
  autoSelectWinner: boolean("autoSelectWinner").default(true),
  minSampleSize: int("minSampleSize").default(100),

  status: mysqlEnum("status", ["running", "paused", "completed"]).default("running"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SequenceAbTest = typeof sequenceAbTests.$inferSelect;
export type InsertSequenceAbTest = typeof sequenceAbTests.$inferInsert;

// ============================================
// PIPELINE ANALYTICS & VELOCITY
// ============================================

// Pipeline Health Metrics
export const pipelineHealthMetrics = mysqlTable("pipeline_health_metrics", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: int("pipelineId").notNull(),
  userId: int("userId"), // If null, pipeline-wide metrics
  period: mysqlEnum("period", ["daily", "weekly", "monthly", "quarterly"]).default("daily"),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),

  // Coverage
  pipelineCoverage: decimal("pipelineCoverage", { precision: 10, scale: 2 }), // Pipeline / Quota ratio
  weightedPipeline: decimal("weightedPipeline", { precision: 15, scale: 2 }),
  totalQuota: decimal("totalQuota", { precision: 15, scale: 2 }),

  // Velocity
  avgDaysInPipeline: decimal("avgDaysInPipeline", { precision: 10, scale: 2 }),
  avgDaysPerStage: text("avgDaysPerStage"), // JSON { stage: days }
  velocityTrend: mysqlEnum("velocityTrend", ["improving", "stable", "declining"]),

  // Stage conversions
  stageConversions: text("stageConversions"), // JSON { "Discovery->Demo": 0.65, ... }
  historicalConversions: text("historicalConversions"), // For comparison

  // Deal flow
  dealsEntered: int("dealsEntered").default(0),
  dealsWon: int("dealsWon").default(0),
  dealsLost: int("dealsLost").default(0),
  dealsPushed: int("dealsPushed").default(0), // Close date moved
  dealsSlipped: int("dealsSlipped").default(0), // Stage regressed

  // Health scores
  overallHealthScore: int("overallHealthScore"), // 0-100
  coverageScore: int("coverageScore"),
  velocityScore: int("velocityScore"),
  conversionScore: int("conversionScore"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PipelineHealthMetric = typeof pipelineHealthMetrics.$inferSelect;
export type InsertPipelineHealthMetric = typeof pipelineHealthMetrics.$inferInsert;

// Deal Slippage Tracking
export const dealSlippageEvents = mysqlTable("deal_slippage_events", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),

  eventType: mysqlEnum("eventType", [
    "close_date_pushed", "stage_regressed", "amount_decreased",
    "probability_decreased", "went_dark", "champion_left", "competitor_entered"
  ]).notNull(),

  previousValue: text("previousValue"),
  newValue: text("newValue"),
  daysPushed: int("daysPushed"), // For close date changes
  amountChange: decimal("amountChange", { precision: 15, scale: 2 }),

  reason: text("reason"),
  detectedBy: mysqlEnum("detectedBy", ["system", "rep", "manager"]).default("system"),
  userId: int("userId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DealSlippageEvent = typeof dealSlippageEvents.$inferSelect;
export type InsertDealSlippageEvent = typeof dealSlippageEvents.$inferInsert;

// ============================================
// STAKEHOLDER & BUYING COMMITTEE MANAGEMENT
// ============================================

// Account Stakeholders (Buying Committee)
export const accountStakeholders = mysqlTable("account_stakeholders", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  dealId: int("dealId"),
  contactId: int("contactId").notNull(),

  role: mysqlEnum("role", [
    "decision_maker", "budget_holder", "champion", "influencer",
    "technical_evaluator", "end_user", "blocker", "coach",
    "executive_sponsor", "procurement", "legal", "unknown"
  ]).notNull(),

  influence: mysqlEnum("influence", ["high", "medium", "low"]).default("medium"),
  sentiment: mysqlEnum("sentiment", ["strong_advocate", "advocate", "neutral", "skeptic", "blocker"]).default("neutral"),
  engagement: mysqlEnum("engagement", ["high", "medium", "low", "none"]).default("none"),

  // Relationship mapping
  reportsTo: int("reportsTo"), // contactId
  influences: text("influences"), // JSON array of contactIds

  // Tracking
  lastEngagement: timestamp("lastEngagement"),
  totalTouchpoints: int("totalTouchpoints").default(0),

  // Insights
  priorities: text("priorities"), // JSON array
  concerns: text("concerns"), // JSON array
  personalNotes: text("personalNotes"),
  preferredContactMethod: mysqlEnum("preferredContactMethod", ["email", "phone", "linkedin", "in_person"]),

  // Verification
  isVerified: boolean("isVerified").default(false),
  verifiedBy: int("verifiedBy"),
  verifiedAt: timestamp("verifiedAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccountStakeholder = typeof accountStakeholders.$inferSelect;
export type InsertAccountStakeholder = typeof accountStakeholders.$inferInsert;

// Champion Tracking
export const championTracking = mysqlTable("champion_tracking", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  contactId: int("contactId").notNull(),

  championScore: int("championScore"), // 0-100

  // Champion indicators
  internalAdvocacy: int("internalAdvocacy"), // 0-100
  accessToDecisionMakers: int("accessToDecisionMakers"),
  responsiveness: int("responsiveness"),
  dealKnowledge: int("dealKnowledge"),
  proactiveEngagement: int("proactiveEngagement"),

  // Status
  status: mysqlEnum("status", ["active", "at_risk", "lost", "inactive"]).default("active"),
  riskReason: text("riskReason"),

  // Events
  lastPositiveSignal: timestamp("lastPositiveSignal"),
  lastNegativeSignal: timestamp("lastNegativeSignal"),

  notes: text("notes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChampionTracking = typeof championTracking.$inferSelect;
export type InsertChampionTracking = typeof championTracking.$inferInsert;

// ============================================
// ACCOUNT-BASED SELLING
// ============================================

// Account Health Scores
export const accountHealthScores = mysqlTable("account_health_scores", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),

  // Overall health
  healthScore: int("healthScore").notNull(), // 0-100
  healthTrend: mysqlEnum("healthTrend", ["improving", "stable", "declining"]),

  // Component scores
  engagementScore: int("engagementScore"),
  expansionPotential: int("expansionPotential"),
  revenueScore: int("revenueScore"),
  relationshipScore: int("relationshipScore"),
  riskScore: int("riskScore"),

  // Key metrics
  totalRevenue: decimal("totalRevenue", { precision: 15, scale: 2 }),
  openOpportunityValue: decimal("openOpportunityValue", { precision: 15, scale: 2 }),
  lastWonDealDate: timestamp("lastWonDealDate"),
  avgDealSize: decimal("avgDealSize", { precision: 15, scale: 2 }),

  // Engagement
  contactsEngaged: int("contactsEngaged"),
  totalContacts: int("totalContacts"),
  lastActivityDate: timestamp("lastActivityDate"),
  activeDays30: int("activeDays30"), // Days with activity in last 30

  // Multi-threading
  threadsActive: int("threadsActive"), // Number of active relationships
  executiveEngagement: boolean("executiveEngagement"),
  departmentsEngaged: int("departmentsEngaged"),

  // White space
  productsOwned: text("productsOwned"), // JSON array
  expansionProducts: text("expansionProducts"), // JSON array of upsell opportunities
  whitespaceValue: decimal("whitespaceValue", { precision: 15, scale: 2 }),

  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccountHealthScore = typeof accountHealthScores.$inferSelect;
export type InsertAccountHealthScore = typeof accountHealthScores.$inferInsert;

// Account Hierarchies
export const accountHierarchies = mysqlTable("account_hierarchies", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  parentAccountId: int("parentAccountId"),
  ultimateParentId: int("ultimateParentId"),

  hierarchyLevel: int("hierarchyLevel").default(0), // 0 = ultimate parent
  relationshipType: mysqlEnum("relationshipType", ["parent", "subsidiary", "division", "branch", "partner"]),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccountHierarchy = typeof accountHierarchies.$inferSelect;
export type InsertAccountHierarchy = typeof accountHierarchies.$inferInsert;

// ============================================
// REP ENABLEMENT - BATTLECARDS & CONTENT
// ============================================

// Battlecards for Competitive Selling
export const battlecards = mysqlTable("battlecards", {
  id: int("id").autoincrement().primaryKey(),
  competitorName: varchar("competitorName", { length: 255 }).notNull(),

  // Overview
  overview: text("overview"),
  websiteUrl: varchar("websiteUrl", { length: 512 }),
  founded: varchar("founded", { length: 10 }),
  headquarters: varchar("headquarters", { length: 255 }),
  employeeCount: varchar("employeeCount", { length: 50 }),
  funding: varchar("funding", { length: 100 }),

  // Positioning
  positioning: text("positioning"),
  targetMarket: text("targetMarket"),
  pricingModel: text("pricingModel"),
  pricingRange: varchar("pricingRange", { length: 100 }),

  // Comparison
  strengths: text("strengths"), // JSON array
  weaknesses: text("weaknesses"), // JSON array
  ourAdvantages: text("ourAdvantages"), // JSON array
  theirAdvantages: text("theirAdvantages"), // JSON array

  // Talk tracks
  discoveryQuestions: text("discoveryQuestions"), // JSON array
  objectionHandlers: text("objectionHandlers"), // JSON array of { objection, response }
  trapQuestions: text("trapQuestions"), // Questions to ask that expose competitor weakness
  landmines: text("landmines"), // Things to plant early in the deal

  // Win/Loss insights
  winRate: decimal("winRate", { precision: 5, scale: 2 }),
  totalDeals: int("totalDeals").default(0),
  dealsWon: int("dealsWon").default(0),
  dealsLost: int("dealsLost").default(0),
  avgDealSize: decimal("avgDealSize", { precision: 15, scale: 2 }),
  commonLossReasons: text("commonLossReasons"), // JSON array
  commonWinReasons: text("commonWinReasons"), // JSON array

  // Usage tracking
  viewCount: int("viewCount").default(0),
  lastViewedAt: timestamp("lastViewedAt"),
  lastUpdatedBy: int("lastUpdatedBy"),

  isActive: boolean("isActive").default(true),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Battlecard = typeof battlecards.$inferSelect;
export type InsertBattlecard = typeof battlecards.$inferInsert;

// Sales Content Library
export const salesContentLibrary = mysqlTable("sales_content_library", {
  id: int("id").autoincrement().primaryKey(),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  contentType: mysqlEnum("contentType", [
    "case_study", "one_pager", "presentation", "proposal_template",
    "demo_video", "roi_calculator", "whitepaper", "ebook",
    "testimonial", "reference_customer", "integration_guide",
    "pricing_sheet", "competitive_intel", "talk_track", "email_template"
  ]).notNull(),

  // File/Link
  fileUrl: text("fileUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  externalLink: text("externalLink"),

  // Categorization
  industry: varchar("industry", { length: 128 }),
  dealStage: varchar("dealStage", { length: 64 }), // When to use
  persona: varchar("persona", { length: 128 }), // Who it's for
  useCase: varchar("useCase", { length: 128 }),
  tags: text("tags"), // JSON array

  // Effectiveness
  usageCount: int("usageCount").default(0),
  shareCount: int("shareCount").default(0),
  viewCount: int("viewCount").default(0),
  avgEngagementTime: int("avgEngagementTime"), // Seconds
  conversionRate: decimal("conversionRate", { precision: 5, scale: 2 }), // When shared, % that move stage

  // Freshness
  lastReviewedAt: timestamp("lastReviewedAt"),
  reviewedBy: int("reviewedBy"),
  expiresAt: timestamp("expiresAt"),

  isActive: boolean("isActive").default(true),
  createdBy: int("createdBy").notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesContentLibrary = typeof salesContentLibrary.$inferSelect;
export type InsertSalesContentLibrary = typeof salesContentLibrary.$inferInsert;

// Guided Selling - Stage Requirements & Checklists
export const guidedSellingChecklists = mysqlTable("guided_selling_checklists", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: int("pipelineId").notNull(),
  stage: varchar("stage", { length: 64 }).notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),

  // Items
  items: text("items").notNull(), // JSON array of { id, text, required, helpText }

  // Requirements
  requiredForStageExit: boolean("requiredForStageExit").default(false),
  blockStageChange: boolean("blockStageChange").default(false),

  // Content links
  relatedContentIds: text("relatedContentIds"), // JSON array of content library IDs
  relatedBattlecardIds: text("relatedBattlecardIds"), // JSON array

  displayOrder: int("displayOrder").default(0),
  isActive: boolean("isActive").default(true),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GuidedSellingChecklist = typeof guidedSellingChecklists.$inferSelect;
export type InsertGuidedSellingChecklist = typeof guidedSellingChecklists.$inferInsert;

// Deal Checklist Completions
export const dealChecklistCompletions = mysqlTable("deal_checklist_completions", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  checklistId: int("checklistId").notNull(),
  itemId: varchar("itemId", { length: 64 }).notNull(),

  isCompleted: boolean("isCompleted").default(false),
  completedBy: int("completedBy"),
  completedAt: timestamp("completedAt"),
  notes: text("notes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DealChecklistCompletion = typeof dealChecklistCompletions.$inferSelect;
export type InsertDealChecklistCompletion = typeof dealChecklistCompletions.$inferInsert;

// ============================================
// ACTIVITY CAPTURE & SYNC
// ============================================

// Email Activity Tracking (Detailed)
export const emailActivityTracking = mysqlTable("email_activity_tracking", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId"),
  dealId: int("dealId"),
  userId: int("userId").notNull(),

  // Email details
  messageId: varchar("messageId", { length: 255 }),
  threadId: varchar("threadId", { length: 255 }),
  direction: mysqlEnum("direction", ["sent", "received"]).notNull(),

  fromEmail: varchar("fromEmail", { length: 320 }),
  toEmails: text("toEmails"), // JSON array
  ccEmails: text("ccEmails"), // JSON array
  subject: varchar("subject", { length: 500 }),
  bodyPreview: text("bodyPreview"),

  // Tracking
  sentAt: timestamp("sentAt"),
  openedAt: timestamp("openedAt"),
  openCount: int("openCount").default(0),
  clickedAt: timestamp("clickedAt"),
  clickCount: int("clickCount").default(0),
  repliedAt: timestamp("repliedAt"),
  bouncedAt: timestamp("bouncedAt"),
  bounceReason: text("bounceReason"),

  // Out of office detection
  isOutOfOffice: boolean("isOutOfOffice").default(false),
  oooReturnDate: timestamp("oooReturnDate"),

  // Sentiment (AI-analyzed)
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]),
  hasQuestion: boolean("hasQuestion").default(false),
  hasMeetingRequest: boolean("hasMeetingRequest").default(false),
  hasObjection: boolean("hasObjection").default(false),

  // Classification
  emailType: mysqlEnum("emailType", [
    "initial_outreach", "followup", "proposal", "negotiation",
    "contract", "intro", "nurture", "other"
  ]),

  // Source
  source: mysqlEnum("source", ["manual", "sequence", "campaign", "gmail_sync", "outlook_sync"]),
  sequenceEnrollmentId: int("sequenceEnrollmentId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailActivityTracking = typeof emailActivityTracking.$inferSelect;
export type InsertEmailActivityTracking = typeof emailActivityTracking.$inferInsert;

// Calendar Sync & Meeting Tracking
export const meetingTracking = mysqlTable("meeting_tracking", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId"),
  contactId: int("contactId"),
  userId: int("userId").notNull(),

  // Calendar details
  calendarEventId: varchar("calendarEventId", { length: 255 }),
  calendarProvider: mysqlEnum("calendarProvider", ["google", "outlook", "manual"]).default("manual"),

  meetingType: mysqlEnum("meetingType", [
    "discovery", "demo", "technical_deep_dive", "proposal_review",
    "negotiation", "contract_review", "kickoff", "qbr", "executive_alignment",
    "internal", "other"
  ]),

  title: varchar("title", { length: 255 }),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  videoConferenceLink: text("videoConferenceLink"),

  // Timing
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  duration: int("duration"), // Minutes
  timezone: varchar("timezone", { length: 64 }),

  // Attendees
  attendees: text("attendees"), // JSON array of { email, name, responseStatus }
  attendeeCount: int("attendeeCount"),
  externalAttendeeCount: int("externalAttendeeCount"),
  executivePresent: boolean("executivePresent").default(false),

  // Tracking
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled", "no_show", "rescheduled"]).default("scheduled"),
  outcome: mysqlEnum("outcome", ["positive", "neutral", "negative"]),
  nextSteps: text("nextSteps"), // JSON array

  // Notes & Recording
  notes: text("notes"),
  recordingUrl: text("recordingUrl"),
  callId: int("callId"), // Link to salesCalls if recorded

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MeetingTracking = typeof meetingTracking.$inferSelect;
export type InsertMeetingTracking = typeof meetingTracking.$inferInsert;

// LinkedIn Activity Tracking
export const linkedinActivityTracking = mysqlTable("linkedin_activity_tracking", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId"),
  dealId: int("dealId"),
  userId: int("userId").notNull(),

  linkedinProfileUrl: varchar("linkedinProfileUrl", { length: 512 }),

  activityType: mysqlEnum("activityType", [
    "profile_view", "connection_request_sent", "connection_accepted",
    "message_sent", "message_received", "inmail_sent", "inmail_replied",
    "post_liked", "post_commented", "post_shared"
  ]).notNull(),

  messageContent: text("messageContent"),

  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("completed"),
  completedAt: timestamp("completedAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LinkedinActivityTracking = typeof linkedinActivityTracking.$inferSelect;
export type InsertLinkedinActivityTracking = typeof linkedinActivityTracking.$inferInsert;

// ============================================
// SALES ENGAGEMENT SCORING
// ============================================

// Contact Engagement Scores
export const contactEngagementScores = mysqlTable("contact_engagement_scores", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),

  // Overall engagement
  engagementScore: int("engagementScore").notNull(), // 0-100
  engagementTrend: mysqlEnum("engagementTrend", ["hot", "warming", "stable", "cooling", "cold"]),

  // Last 30 days activity
  emailsOpened30d: int("emailsOpened30d").default(0),
  emailsClicked30d: int("emailsClicked30d").default(0),
  emailsReplied30d: int("emailsReplied30d").default(0),
  callsConnected30d: int("callsConnected30d").default(0),
  meetingsHeld30d: int("meetingsHeld30d").default(0),
  websiteVisits30d: int("websiteVisits30d").default(0),

  // Timing
  lastEngagementAt: timestamp("lastEngagementAt"),
  avgResponseTime: int("avgResponseTime"), // Hours
  bestContactTime: varchar("bestContactTime", { length: 32 }), // e.g., "Tuesday 2pm"

  // Status
  isEngaged: boolean("isEngaged").default(false),
  wentDarkAt: timestamp("wentDarkAt"),
  reEngagedAt: timestamp("reEngagedAt"),

  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactEngagementScore = typeof contactEngagementScores.$inferSelect;
export type InsertContactEngagementScore = typeof contactEngagementScores.$inferInsert;

// ============================================
// MEETING PREP & AI BRIEFS
// ============================================

// AI Meeting Prep Briefs
export const meetingPrepBriefs = mysqlTable("meeting_prep_briefs", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(),
  dealId: int("dealId"),
  userId: int("userId").notNull(),

  // Brief content (AI-generated)
  executiveSummary: text("executiveSummary"),
  accountOverview: text("accountOverview"),
  stakeholderInsights: text("stakeholderInsights"), // JSON array
  recentActivity: text("recentActivity"), // JSON array
  dealHistory: text("dealHistory"),
  competitiveIntel: text("competitiveIntel"),

  // Recommendations
  talkingPoints: text("talkingPoints"), // JSON array
  questionsToAsk: text("questionsToAsk"), // JSON array
  objectionsToExpect: text("objectionsToExpect"), // JSON array
  contentToShare: text("contentToShare"), // JSON array of content library IDs

  // Risk/Opportunity
  dealRisks: text("dealRisks"), // JSON array
  opportunities: text("opportunities"), // JSON array

  // News & Triggers
  companyNews: text("companyNews"), // JSON array
  industryNews: text("industryNews"), // JSON array

  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  viewedAt: timestamp("viewedAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MeetingPrepBrief = typeof meetingPrepBriefs.$inferSelect;
export type InsertMeetingPrepBrief = typeof meetingPrepBriefs.$inferInsert;

// ============================================
// AUDIT & OPERATIONS
// ============================================

// Sales Audit Log
export const salesAuditLog = mysqlTable("sales_audit_log", {
  id: int("id").autoincrement().primaryKey(),

  entityType: mysqlEnum("entityType", [
    "deal", "contact", "account", "sequence", "automation",
    "territory", "quota", "commission", "forecast"
  ]).notNull(),
  entityId: int("entityId").notNull(),

  action: mysqlEnum("action", [
    "created", "updated", "deleted", "stage_changed", "owner_changed",
    "amount_changed", "close_date_changed", "won", "lost", "reopened"
  ]).notNull(),

  changes: text("changes"), // JSON { field: { old, new } }

  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SalesAuditLog = typeof salesAuditLog.$inferSelect;
export type InsertSalesAuditLog = typeof salesAuditLog.$inferInsert;

// Assignment Rules for Round Robin
export const assignmentRules = mysqlTable("assignment_rules", {
  id: int("id").autoincrement().primaryKey(),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  ruleType: mysqlEnum("ruleType", ["round_robin", "weighted", "territory", "custom"]).notNull(),
  entityType: mysqlEnum("entityType", ["lead", "deal", "account"]).notNull(),

  // Rule configuration
  criteria: text("criteria"), // JSON conditions for when rule applies
  assignees: text("assignees"), // JSON array of { userId, weight, maxActive }
  fallbackUserId: int("fallbackUserId"),

  // Round robin state
  currentIndex: int("currentIndex").default(0),
  lastAssignedAt: timestamp("lastAssignedAt"),
  lastAssignedTo: int("lastAssignedTo"),

  // Limits
  maxDealsPerRep: int("maxDealsPerRep"),
  respectCapacity: boolean("respectCapacity").default(false),

  // Timing
  onlyDuringBusinessHours: boolean("onlyDuringBusinessHours").default(false),
  businessHoursStart: varchar("businessHoursStart", { length: 5 }), // "09:00"
  businessHoursEnd: varchar("businessHoursEnd", { length: 5 }), // "17:00"
  timezone: varchar("timezone", { length: 64 }),

  priority: int("priority").default(0),
  isActive: boolean("isActive").default(true),

  // Stats
  totalAssignments: int("totalAssignments").default(0),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AssignmentRule = typeof assignmentRules.$inferSelect;
export type InsertAssignmentRule = typeof assignmentRules.$inferInsert;

// Type exports for world-class tables
export type {
  SalesCall, InsertSalesCall,
  ConversationInsight, InsertConversationInsight,
  DealRiskScore, InsertDealRiskScore,
  DealNextAction, InsertDealNextAction,
  SequenceChannelStep, InsertSequenceChannelStep,
  SequenceAbTest, InsertSequenceAbTest,
  PipelineHealthMetric, InsertPipelineHealthMetric,
  DealSlippageEvent, InsertDealSlippageEvent,
  AccountStakeholder, InsertAccountStakeholder,
  ChampionTracking, InsertChampionTracking,
  AccountHealthScore, InsertAccountHealthScore,
  AccountHierarchy, InsertAccountHierarchy,
  Battlecard, InsertBattlecard,
  SalesContentLibrary, InsertSalesContentLibrary,
  GuidedSellingChecklist, InsertGuidedSellingChecklist,
  DealChecklistCompletion, InsertDealChecklistCompletion,
  EmailActivityTracking, InsertEmailActivityTracking,
  MeetingTracking, InsertMeetingTracking,
  LinkedinActivityTracking, InsertLinkedinActivityTracking,
  ContactEngagementScore, InsertContactEngagementScore,
  MeetingPrepBrief, InsertMeetingPrepBrief,
  SalesAuditLog, InsertSalesAuditLog,
  AssignmentRule, InsertAssignmentRule,
};

export type {
  SalesTerritory, InsertSalesTerritory,
  SalesQuota, InsertSalesQuota,
  CommissionPlan, InsertCommissionPlan,
  CommissionAssignment, InsertCommissionAssignment,
  CommissionTransaction, InsertCommissionTransaction,
  LeadScoringRule, InsertLeadScoringRule,
  LeadScoreHistory, InsertLeadScoreHistory,
  SalesAutomationRule, InsertSalesAutomationRule,
  SalesAutomationExecution, InsertSalesAutomationExecution,
  EmailSequence, InsertEmailSequence,
  EmailSequenceStep, InsertEmailSequenceStep,
  EmailSequenceEnrollment, InsertEmailSequenceEnrollment,
  EmailSequenceEvent, InsertEmailSequenceEvent,
  SalesActivity, InsertSalesActivity,
  DealStageHistory, InsertDealStageHistory,
  SalesForecast, InsertSalesForecast,
  SalesGoal, InsertSalesGoal,
  SalesPlaybook, InsertSalesPlaybook,
  DealPlaybookAssignment, InsertDealPlaybookAssignment,
  SalesCoachingNote, InsertSalesCoachingNote,
  SalesLeaderboardSnapshot, InsertSalesLeaderboardSnapshot,
  DealCompetitor, InsertDealCompetitor,
  SalesMetricsDaily, InsertSalesMetricsDaily,
};
