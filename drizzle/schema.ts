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

export const quickbooksOAuthTokens = mysqlTable("quickbooksOAuthTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  tokenType: varchar("tokenType", { length: 32 }).default("Bearer"),
  expiresAt: timestamp("expiresAt"),
  realmId: varchar("realmId", { length: 64 }), // QuickBooks company ID
  scope: text("scope"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuickBooksOAuthToken = typeof quickbooksOAuthTokens.$inferSelect;
export type InsertQuickBooksOAuthToken = typeof quickbooksOAuthTokens.$inferInsert;

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
// AUTONOMOUS SUPPLY CHAIN WORKFLOW SYSTEM
// ============================================

// Supply chain workflow definitions - configurable workflow templates
export const supplyChainWorkflows = mysqlTable("supplyChainWorkflows", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  workflowType: mysqlEnum("workflowType", [
    "demand_forecasting",
    "production_planning",
    "material_requirements",
    "procurement",
    "inventory_reorder",
    "inventory_transfer",
    "inventory_optimization",
    "work_order_generation",
    "production_scheduling",
    "freight_procurement",
    "shipment_tracking",
    "order_fulfillment",
    "supplier_management",
    "quality_inspection",
    "invoice_matching",
    "payment_processing",
    "exception_handling",
    "custom"
  ]).notNull(),

  // Workflow configuration
  triggerType: mysqlEnum("triggerType", [
    "scheduled",      // Run on schedule (cron)
    "event",          // Triggered by specific events
    "threshold",      // Triggered when metrics cross thresholds
    "manual",         // Only run when manually triggered
    "continuous"      // Always running, processing as items arrive
  ]).default("scheduled").notNull(),

  cronSchedule: varchar("cronSchedule", { length: 64 }), // e.g., "0 6 * * *" for 6am daily
  triggerEvents: text("triggerEvents"), // JSON array of event types that trigger this
  thresholdConfig: text("thresholdConfig"), // JSON with threshold conditions

  // Execution configuration
  executionConfig: text("executionConfig"), // JSON with execution parameters
  maxConcurrentRuns: int("maxConcurrentRuns").default(1),
  timeoutMinutes: int("timeoutMinutes").default(60),
  retryAttempts: int("retryAttempts").default(3),
  retryDelayMinutes: int("retryDelayMinutes").default(5),

  // Approval configuration
  requiresApproval: boolean("requiresApproval").default(false),
  autoApproveThreshold: decimal("autoApproveThreshold", { precision: 14, scale: 2 }), // Auto-approve under this amount
  approvalRoles: text("approvalRoles"), // JSON array of roles that can approve
  escalationMinutes: int("escalationMinutes").default(60), // Escalate after X minutes without approval
  escalationRoles: text("escalationRoles"), // JSON array of escalation targets

  // Dependencies
  dependsOnWorkflows: text("dependsOnWorkflows"), // JSON array of workflow IDs that must complete first

  // State
  isActive: boolean("isActive").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextScheduledRun: timestamp("nextScheduledRun"),
  successCount: int("successCount").default(0),
  failureCount: int("failureCount").default(0),

  // Audit
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplyChainWorkflow = typeof supplyChainWorkflows.$inferSelect;
export type InsertSupplyChainWorkflow = typeof supplyChainWorkflows.$inferInsert;

// Workflow execution runs - tracks each execution of a workflow
export const workflowRuns = mysqlTable("workflowRuns", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  runNumber: varchar("runNumber", { length: 64 }).notNull(), // e.g., "WF-RUN-20240115-001"

  status: mysqlEnum("status", [
    "queued",
    "running",
    "awaiting_approval",
    "approved",
    "rejected",
    "completed",
    "failed",
    "cancelled",
    "timed_out"
  ]).default("queued").notNull(),

  // Trigger info
  triggeredBy: mysqlEnum("triggeredBy", ["schedule", "event", "threshold", "manual", "dependency"]).notNull(),
  triggerData: text("triggerData"), // JSON with trigger context
  triggeredByUserId: int("triggeredByUserId"),

  // Execution details
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),

  // Progress tracking
  totalSteps: int("totalSteps").default(0),
  completedSteps: int("completedSteps").default(0),
  currentStepName: varchar("currentStepName", { length: 255 }),
  progressPercent: int("progressPercent").default(0),

  // Results
  inputData: text("inputData"), // JSON with input parameters
  outputData: text("outputData"), // JSON with results
  errorMessage: text("errorMessage"),
  errorDetails: text("errorDetails"), // JSON with full error info

  // Metrics produced
  itemsProcessed: int("itemsProcessed").default(0),
  itemsSucceeded: int("itemsSucceeded").default(0),
  itemsFailed: int("itemsFailed").default(0),
  totalValue: decimal("totalValue", { precision: 14, scale: 2 }), // Total monetary value affected

  // Retry info
  attemptNumber: int("attemptNumber").default(1),
  parentRunId: int("parentRunId"), // If this is a retry, link to original

  // Approval tracking
  approvalRequestedAt: timestamp("approvalRequestedAt"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),
  escalatedAt: timestamp("escalatedAt"),
  escalatedTo: text("escalatedTo"), // JSON array of user IDs

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = typeof workflowRuns.$inferInsert;

// Workflow steps - individual steps within a workflow run
export const workflowSteps = mysqlTable("workflowSteps", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  stepNumber: int("stepNumber").notNull(),
  stepName: varchar("stepName", { length: 255 }).notNull(),
  stepType: mysqlEnum("stepType", [
    "data_fetch",
    "ai_analysis",
    "ai_decision",
    "calculation",
    "validation",
    "create_record",
    "update_record",
    "send_email",
    "send_notification",
    "api_call",
    "wait_approval",
    "condition_check",
    "loop_start",
    "loop_end",
    "parallel_start",
    "parallel_end",
    "subprocess"
  ]).notNull(),

  status: mysqlEnum("status", [
    "pending",
    "running",
    "completed",
    "failed",
    "skipped",
    "awaiting_input"
  ]).default("pending").notNull(),

  // Execution details
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),

  // Data
  inputData: text("inputData"), // JSON
  outputData: text("outputData"), // JSON
  errorMessage: text("errorMessage"),

  // AI-specific fields
  aiPrompt: text("aiPrompt"),
  aiResponse: text("aiResponse"),
  aiConfidence: decimal("aiConfidence", { precision: 5, scale: 2 }),
  aiTokensUsed: int("aiTokensUsed"),

  // Related entities created/modified
  createdEntityType: varchar("createdEntityType", { length: 64 }),
  createdEntityId: int("createdEntityId"),
  modifiedEntityType: varchar("modifiedEntityType", { length: 64 }),
  modifiedEntityId: int("modifiedEntityId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type InsertWorkflowStep = typeof workflowSteps.$inferInsert;

// Workflow approval queue - items pending approval
export const workflowApprovalQueue = mysqlTable("workflowApprovalQueue", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),

  approvalType: mysqlEnum("approvalType", [
    "purchase_order",
    "work_order",
    "inventory_transfer",
    "freight_booking",
    "payment",
    "price_change",
    "vendor_selection",
    "exception_override",
    "forecast_adjustment",
    "workflow_result"
  ]).notNull(),

  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),

  // Financial info
  monetaryValue: decimal("monetaryValue", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),

  // Context
  contextData: text("contextData"), // JSON with all relevant context
  aiRecommendation: text("aiRecommendation"), // AI's explanation and recommendation
  aiConfidence: decimal("aiConfidence", { precision: 5, scale: 2 }),
  riskAssessment: mysqlEnum("riskAssessment", ["low", "medium", "high", "critical"]).default("low"),

  // Related entities
  relatedEntityType: varchar("relatedEntityType", { length: 64 }),
  relatedEntityId: int("relatedEntityId"),

  // Approval status
  status: mysqlEnum("status", [
    "pending",
    "approved",
    "rejected",
    "auto_approved",
    "escalated",
    "expired"
  ]).default("pending").notNull(),

  // Routing
  assignedToRoles: text("assignedToRoles"), // JSON array of roles
  assignedToUsers: text("assignedToUsers"), // JSON array of specific user IDs
  currentAssignee: int("currentAssignee"),

  // Timeline
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  dueAt: timestamp("dueAt"),
  escalateAt: timestamp("escalateAt"),
  escalatedAt: timestamp("escalatedAt"),
  escalationLevel: int("escalationLevel").default(0),

  // Resolution
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNotes: text("resolutionNotes"),

  // Auto-approval tracking
  wasAutoApproved: boolean("wasAutoApproved").default(false),
  autoApprovalReason: varchar("autoApprovalReason", { length: 255 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowApprovalQueue = typeof workflowApprovalQueue.$inferSelect;
export type InsertWorkflowApprovalQueue = typeof workflowApprovalQueue.$inferInsert;

// Autonomous decisions log - every AI decision for auditability
export const autonomousDecisions = mysqlTable("autonomousDecisions", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId"),
  stepId: int("stepId"),

  decisionType: mysqlEnum("decisionType", [
    "vendor_selection",
    "quantity_calculation",
    "timing_decision",
    "routing_decision",
    "pricing_acceptance",
    "exception_handling",
    "priority_assignment",
    "allocation_decision",
    "forecast_adjustment",
    "reorder_trigger",
    "approval_routing"
  ]).notNull(),

  decisionContext: text("decisionContext"), // JSON with all input data
  optionsConsidered: text("optionsConsidered"), // JSON array of options evaluated
  chosenOption: text("chosenOption"), // JSON of selected option
  aiReasoning: text("aiReasoning"), // Full explanation from AI
  confidence: decimal("confidence", { precision: 5, scale: 2 }),

  // Impact tracking
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  estimatedImpact: text("estimatedImpact"), // JSON with impact metrics
  actualImpact: text("actualImpact"), // JSON filled in later

  // Learning
  wasOverridden: boolean("wasOverridden").default(false),
  overriddenBy: int("overriddenBy"),
  overrideReason: text("overrideReason"),
  feedbackScore: int("feedbackScore"), // -2 to +2 rating
  feedbackNotes: text("feedbackNotes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AutonomousDecision = typeof autonomousDecisions.$inferSelect;
export type InsertAutonomousDecision = typeof autonomousDecisions.$inferInsert;

// Supply chain events - real-time event stream for triggering workflows
export const supplyChainEvents = mysqlTable("supplyChainEvents", {
  id: int("id").autoincrement().primaryKey(),

  eventType: mysqlEnum("eventType", [
    // Inventory events
    "inventory_low",
    "inventory_critical",
    "inventory_excess",
    "inventory_expiring",
    "inventory_received",
    "inventory_adjustment",
    // Order events
    "order_created",
    "order_confirmed",
    "order_shipped",
    "order_delivered",
    "order_cancelled",
    // Purchase events
    "po_created",
    "po_sent",
    "po_confirmed",
    "po_shipped",
    "po_received",
    "po_discrepancy",
    // Production events
    "work_order_created",
    "production_started",
    "production_completed",
    "production_issue",
    "yield_variance",
    // Supplier events
    "quote_received",
    "price_change",
    "lead_time_change",
    "supplier_issue",
    // Freight events
    "shipment_booked",
    "shipment_picked_up",
    "shipment_delayed",
    "shipment_delivered",
    "customs_hold",
    // Quality events
    "quality_issue",
    "inspection_failed",
    "inspection_passed",
    // Financial events
    "invoice_received",
    "payment_due",
    "payment_overdue",
    // Forecast events
    "forecast_generated",
    "demand_spike",
    "demand_drop",
    // System events
    "workflow_completed",
    "workflow_failed",
    "approval_needed",
    "escalation_triggered"
  ]).notNull(),

  severity: mysqlEnum("severity", ["info", "warning", "error", "critical"]).default("info").notNull(),

  // Event source
  sourceSystem: varchar("sourceSystem", { length: 64 }), // e.g., "inventory", "orders", "production"
  sourceEntityType: varchar("sourceEntityType", { length: 64 }),
  sourceEntityId: int("sourceEntityId"),

  // Event data
  eventData: text("eventData"), // JSON with full event details
  summary: varchar("summary", { length: 500 }),

  // Processing status
  isProcessed: boolean("isProcessed").default(false),
  processedAt: timestamp("processedAt"),
  processedByWorkflowId: int("processedByWorkflowId"),
  processedByRunId: int("processedByRunId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupplyChainEvent = typeof supplyChainEvents.$inferSelect;
export type InsertSupplyChainEvent = typeof supplyChainEvents.$inferInsert;

// Workflow metrics - aggregated performance metrics
export const workflowMetrics = mysqlTable("workflowMetrics", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  metricDate: timestamp("metricDate").notNull(), // Date for this metric row

  // Execution metrics
  totalRuns: int("totalRuns").default(0),
  successfulRuns: int("successfulRuns").default(0),
  failedRuns: int("failedRuns").default(0),
  averageDurationMs: int("averageDurationMs"),
  maxDurationMs: int("maxDurationMs"),

  // Approval metrics
  autoApprovedCount: int("autoApprovedCount").default(0),
  manualApprovedCount: int("manualApprovedCount").default(0),
  rejectedCount: int("rejectedCount").default(0),
  averageApprovalTimeMs: int("averageApprovalTimeMs"),
  escalationCount: int("escalationCount").default(0),

  // Volume metrics
  itemsProcessed: int("itemsProcessed").default(0),
  totalValueProcessed: decimal("totalValueProcessed", { precision: 18, scale: 2 }),
  exceptionsHandled: int("exceptionsHandled").default(0),

  // AI metrics
  aiDecisionCount: int("aiDecisionCount").default(0),
  aiOverrideCount: int("aiOverrideCount").default(0),
  averageAiConfidence: decimal("averageAiConfidence", { precision: 5, scale: 2 }),
  totalTokensUsed: int("totalTokensUsed").default(0),

  // Cost savings estimate
  estimatedTimeSavedMinutes: int("estimatedTimeSavedMinutes"),
  estimatedCostSavings: decimal("estimatedCostSavings", { precision: 14, scale: 2 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowMetric = typeof workflowMetrics.$inferSelect;
export type InsertWorkflowMetric = typeof workflowMetrics.$inferInsert;

// Approval thresholds - configurable approval rules
export const approvalThresholds = mysqlTable("approvalThresholds", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),

  entityType: mysqlEnum("entityType", [
    "purchase_order",
    "work_order",
    "inventory_transfer",
    "freight_booking",
    "payment",
    "vendor_rfq",
    "price_override",
    "exception"
  ]).notNull(),

  // Threshold levels
  autoApproveMaxAmount: decimal("autoApproveMaxAmount", { precision: 14, scale: 2 }),
  level1MaxAmount: decimal("level1MaxAmount", { precision: 14, scale: 2 }), // Ops manager
  level2MaxAmount: decimal("level2MaxAmount", { precision: 14, scale: 2 }), // Director
  level3MaxAmount: decimal("level3MaxAmount", { precision: 14, scale: 2 }), // VP
  // Above level3 requires exec approval

  // Role mappings
  level1Roles: text("level1Roles"), // JSON array
  level2Roles: text("level2Roles"), // JSON array
  level3Roles: text("level3Roles"), // JSON array
  execRoles: text("execRoles"), // JSON array

  // Timing
  level1EscalationMinutes: int("level1EscalationMinutes").default(60),
  level2EscalationMinutes: int("level2EscalationMinutes").default(120),
  level3EscalationMinutes: int("level3EscalationMinutes").default(240),

  // Conditions
  conditions: text("conditions"), // JSON with additional conditions (vendor, category, etc.)

  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApprovalThreshold = typeof approvalThresholds.$inferSelect;
export type InsertApprovalThreshold = typeof approvalThresholds.$inferInsert;

// Exception handling rules - how to handle common exceptions
export const exceptionRules = mysqlTable("exceptionRules", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  exceptionType: mysqlEnum("exceptionType", [
    "quantity_mismatch",
    "price_variance",
    "quality_issue",
    "delivery_delay",
    "stockout",
    "overstock",
    "supplier_unavailable",
    "capacity_constraint",
    "forecast_deviation",
    "payment_issue",
    "documentation_missing",
    "customs_issue",
    "other"
  ]).notNull(),

  // Matching conditions
  matchConditions: text("matchConditions"), // JSON with conditions to match
  varianceThresholdPercent: decimal("varianceThresholdPercent", { precision: 5, scale: 2 }), // For price/qty variance

  // Resolution strategy
  resolutionStrategy: mysqlEnum("resolutionStrategy", [
    "auto_resolve",        // System resolves automatically
    "ai_decide",           // Let AI decide best resolution
    "route_to_human",      // Always require human decision
    "escalate",            // Immediately escalate
    "apply_default",       // Apply default action
    "notify_and_continue", // Notify but continue workflow
    "halt_workflow"        // Stop workflow execution
  ]).notNull(),

  // Auto-resolution config
  autoResolutionAction: text("autoResolutionAction"), // JSON with action details
  defaultAction: text("defaultAction"), // JSON with fallback action

  // Routing
  notifyRoles: text("notifyRoles"), // JSON array of roles to notify
  assignToRole: varchar("assignToRole", { length: 64 }),

  // Timing
  resolveWithinMinutes: int("resolveWithinMinutes").default(60),
  escalateAfterMinutes: int("escalateAfterMinutes").default(120),

  priority: int("priority").default(100), // Lower = higher priority for rule matching
  isActive: boolean("isActive").default(true).notNull(),

  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExceptionRule = typeof exceptionRules.$inferSelect;
export type InsertExceptionRule = typeof exceptionRules.$inferInsert;

// Exception log - tracked exceptions and their resolutions
export const exceptionLog = mysqlTable("exceptionLog", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId"),
  stepId: int("stepId"),
  ruleId: int("ruleId"), // Which exception rule matched

  exceptionType: varchar("exceptionType", { length: 64 }).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),

  // Exception details
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  exceptionData: text("exceptionData"), // JSON with full context

  // Related entities
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),

  // Resolution
  status: mysqlEnum("status", [
    "open",
    "in_progress",
    "resolved",
    "escalated",
    "ignored"
  ]).default("open").notNull(),

  resolutionType: mysqlEnum("resolutionType", [
    "auto_resolved",
    "ai_resolved",
    "human_resolved",
    "escalated_resolved",
    "ignored"
  ]),

  resolutionAction: text("resolutionAction"), // JSON with what was done
  resolutionNotes: text("resolutionNotes"),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),

  // Impact
  financialImpact: decimal("financialImpact", { precision: 14, scale: 2 }),
  operationalImpact: varchar("operationalImpact", { length: 255 }),

  // Timing
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  dueAt: timestamp("dueAt"),
  escalatedAt: timestamp("escalatedAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExceptionLogEntry = typeof exceptionLog.$inferSelect;
export type InsertExceptionLogEntry = typeof exceptionLog.$inferInsert;

// Supplier performance scores - for autonomous vendor selection
export const supplierPerformance = mysqlTable("supplierPerformance", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  metricMonth: varchar("metricMonth", { length: 7 }).notNull(), // YYYY-MM

  // Delivery metrics
  totalOrders: int("totalOrders").default(0),
  onTimeDeliveries: int("onTimeDeliveries").default(0),
  lateDeliveries: int("lateDeliveries").default(0),
  averageLeadTimeDays: decimal("averageLeadTimeDays", { precision: 8, scale: 2 }),
  leadTimeVarianceDays: decimal("leadTimeVarianceDays", { precision: 8, scale: 2 }),

  // Quality metrics
  totalItemsReceived: int("totalItemsReceived").default(0),
  qualityPassCount: int("qualityPassCount").default(0),
  qualityFailCount: int("qualityFailCount").default(0),
  qualityPassRate: decimal("qualityPassRate", { precision: 5, scale: 2 }),

  // Quantity accuracy
  quantityMatchCount: int("quantityMatchCount").default(0),
  quantityVarianceCount: int("quantityVarianceCount").default(0),

  // Pricing
  totalSpend: decimal("totalSpend", { precision: 18, scale: 2 }),
  averagePriceVariancePercent: decimal("averagePriceVariancePercent", { precision: 6, scale: 2 }),

  // Communication
  averageResponseTimeHours: decimal("averageResponseTimeHours", { precision: 8, scale: 2 }),
  issuesReported: int("issuesReported").default(0),
  issuesResolved: int("issuesResolved").default(0),

  // Composite scores (0-100)
  deliveryScore: decimal("deliveryScore", { precision: 5, scale: 2 }),
  qualityScore: decimal("qualityScore", { precision: 5, scale: 2 }),
  priceScore: decimal("priceScore", { precision: 5, scale: 2 }),
  responsiveScore: decimal("responsiveScore", { precision: 5, scale: 2 }),
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }),

  // AI recommendations
  aiAssessment: text("aiAssessment"),
  recommendedActions: text("recommendedActions"), // JSON array
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high"]).default("low"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierPerformanceEntry = typeof supplierPerformance.$inferSelect;
export type InsertSupplierPerformanceEntry = typeof supplierPerformance.$inferInsert;

// Workflow notifications - notifications generated by workflows
export const workflowNotifications = mysqlTable("workflowNotifications", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId"),

  notificationType: mysqlEnum("notificationType", [
    "info",
    "warning",
    "error",
    "approval_needed",
    "approval_completed",
    "exception",
    "milestone",
    "completion"
  ]).notNull(),

  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),

  // Routing
  targetRoles: text("targetRoles"), // JSON array
  targetUserIds: text("targetUserIds"), // JSON array

  // Channels
  sendEmail: boolean("sendEmail").default(false),
  sendInApp: boolean("sendInApp").default(true),
  sendSlack: boolean("sendSlack").default(false),

  // Status
  isRead: boolean("isRead").default(false),
  readBy: int("readBy"),
  readAt: timestamp("readAt"),

  // Link to action
  actionUrl: varchar("actionUrl", { length: 500 }),
  actionLabel: varchar("actionLabel", { length: 100 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowNotification = typeof workflowNotifications.$inferSelect;
export type InsertWorkflowNotification = typeof workflowNotifications.$inferInsert;
