import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, bigint, uniqueIndex, serial, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import type { NoteParseResult, NoteAppliedItem } from "../shared/notes";

// ============================================
// USER & ACCESS CONTROL
// ============================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "finance", "ops", "legal", "exec", "sales", "copacker", "vendor", "contractor", "investor"]).default("user").notNull(),
  departmentId: int("departmentId"),
  // Multi-region: home legal entity + how wide this user can see.
  // regionScope defaults to "global" so existing users keep full visibility until real
  // entities are assigned; tighten the default to "entity" once the backfill is done.
  companyId: int("companyId").references((): AnyMySqlColumn => companies.id),
  regionScope: mysqlEnum("regionScope", ["entity", "region", "global"]).default("global").notNull(),
  avatarUrl: text("avatarUrl"),
  phone: varchar("phone", { length: 32 }),
  // For external users (copackers, vendors), link to their entity
  linkedVendorId: int("linkedVendorId"),
  linkedWarehouseId: int("linkedWarehouseId"),
  isActive: boolean("isActive").default(true).notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  invitedBy: int("invitedBy"),
  invitedAt: timestamp("invitedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Single-use auth tokens (email verification, password reset).
// Backed by the database so verification/reset flows work across multiple
// app instances.
export const authTokens = mysqlTable("authTokens", {
  token: varchar("token", { length: 128 }).primaryKey(),
  type: mysqlEnum("type", ["email_verification", "password_reset"]).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = typeof authTokens.$inferInsert;

// Local authentication credentials for email/password auth
export const localAuthCredentials = mysqlTable("localAuthCredentials", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  salt: varchar("salt", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LocalAuthCredential = typeof localAuthCredentials.$inferSelect;
export type InsertLocalAuthCredential = typeof localAuthCredentials.$inferInsert;


// Team invitations for onboarding new users
export const teamInvitations = mysqlTable("teamInvitations", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["user", "admin", "finance", "ops", "legal", "exec", "sales", "copacker", "vendor", "contractor", "investor"]).default("user").notNull(),
  inviteCode: varchar("inviteCode", { length: 64 }).notNull().unique(),
  invitedBy: int("invitedBy").notNull().references(() => users.id),
  linkedVendorId: int("linkedVendorId").references(() => vendors.id),
  linkedWarehouseId: int("linkedWarehouseId").references(() => warehouses.id),
  customPermissions: text("customPermissions"), // JSON array of permission keys
  status: mysqlEnum("status", ["pending", "accepted", "expired", "revoked"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  acceptedByUserId: int("acceptedByUserId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type InsertTeamInvitation = typeof teamInvitations.$inferInsert;

// User permissions for granular access control
export const userPermissions = mysqlTable("userPermissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  permission: varchar("permission", { length: 64 }).notNull(), // e.g., 'inventory.update', 'shipments.upload'
  grantedBy: int("grantedBy").notNull().references(() => users.id),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
});

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;

// Multi-entity access (STEP 3): a user may belong to several entities, each with a per-entity role.
// The permitted-entity set for scoping is the union of these rows' companies (expanded to
// descendants via entity_tree). Access to a parent (e.g. GLOBAL) reaches its children.
export const userEntityAccess = mysqlTable("user_entity_access", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  companyId: int("companyId").notNull().references((): AnyMySqlColumn => companies.id),
  role: mysqlEnum("role", ["user", "admin", "finance", "ops", "legal", "exec", "sales", "copacker", "vendor", "contractor", "investor"]).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userCompanyUnique: uniqueIndex("uq_user_entity_access_user_company").on(t.userId, t.companyId),
}));

export type UserEntityAccess = typeof userEntityAccess.$inferSelect;
export type InsertUserEntityAccess = typeof userEntityAccess.$inferInsert;

// Google OAuth tokens for Drive/Sheets access
export const googleOAuthTokens = mysqlTable("googleOAuthTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
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
  userId: int("userId").notNull().references(() => users.id),
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

// QuickBooks Chart of Accounts sync
export const quickbooksAccounts = mysqlTable("quickbooksAccounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  quickbooksAccountId: varchar("quickbooksAccountId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  accountType: varchar("accountType", { length: 64 }), // e.g., "Cost of Goods Sold", "Inventory", "Other Current Asset"
  accountSubType: varchar("accountSubType", { length: 64 }), // e.g., "SuppliesMaterialsCogs", "Inventory"
  classification: varchar("classification", { length: 64 }), // Asset, Liability, Equity, Revenue, Expense
  fullyQualifiedName: text("fullyQualifiedName"),
  active: boolean("active").default(true),
  currentBalance: decimal("currentBalance", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuickBooksAccount = typeof quickbooksAccounts.$inferSelect;
export type InsertQuickBooksAccount = typeof quickbooksAccounts.$inferInsert;

// QuickBooks account category mappings for COGS
export const quickbooksAccountMappings = mysqlTable("quickbooksAccountMappings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  mappingType: mysqlEnum("mappingType", [
    "cogs_product", // Cost of Goods Sold - Products
    "cogs_freight", // Cost of Goods Sold - Freight/Shipping
    "cogs_customs", // Cost of Goods Sold - Customs/Duties
    "inventory_asset", // Inventory Asset account
    "freight_expense", // Freight/Delivery Expense
    "income_sales", // Sales Income
    "expense_other" // Other expenses
  ]).notNull(),
  quickbooksAccountId: varchar("quickbooksAccountId", { length: 64 }).notNull(),
  erpCategoryName: varchar("erpCategoryName", { length: 255 }), // Optional ERP category name
  isDefault: boolean("isDefault").default(false),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuickBooksAccountMapping = typeof quickbooksAccountMappings.$inferSelect;
export type InsertQuickBooksAccountMapping = typeof quickbooksAccountMappings.$inferInsert;

// QuickBooks Items sync (Products/Services)
export const quickbooksItems = mysqlTable("quickbooksItems", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  quickbooksItemId: varchar("quickbooksItemId", { length: 64 }).notNull(),
  productId: int("productId"), // Link to ERP product
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 64 }),
  type: varchar("type", { length: 32 }), // Inventory, NonInventory, Service
  description: text("description"),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }),
  purchaseCost: decimal("purchaseCost", { precision: 15, scale: 2 }),
  quantityOnHand: decimal("quantityOnHand", { precision: 15, scale: 4 }),
  incomeAccountId: varchar("incomeAccountId", { length: 64 }),
  expenseAccountId: varchar("expenseAccountId", { length: 64 }),
  assetAccountId: varchar("assetAccountId", { length: 64 }),
  active: boolean("active").default(true),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuickBooksItem = typeof quickbooksItems.$inferSelect;
export type InsertQuickBooksItem = typeof quickbooksItems.$inferInsert;

// ============================================
// CORE ENTITIES
// ============================================

// Regions group one or more legal entities (companies) for multi-country operation
// and consolidated reporting. See docs/MULTI_REGION_PLAN.md.
export const regions = mysqlTable("regions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(), // natural key, e.g. "EMEA", "APAC", "US"
  name: varchar("name", { length: 128 }).notNull(),
  baseCurrency: varchar("baseCurrency", { length: 3 }).notNull().default("USD"),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Region = typeof regions.$inferSelect;
export type InsertRegion = typeof regions.$inferInsert;

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
  // Multi-region / multi-entity attributes (see docs/MULTI_REGION_PLAN.md)
  regionId: int("regionId").references(() => regions.id),
  functionalCurrency: varchar("functionalCurrency", { length: 3 }).notNull().default("USD"),
  locale: varchar("locale", { length: 10 }).notNull().default("en-US"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/New_York"),
  taxRegime: mysqlEnum("taxRegime", ["vat", "gst", "sales_tax", "none"]).default("none").notNull(),
  // Entity-tree attributes (multi-entity rollout STEP 1). `companies` IS the entity table:
  // the holding company + regional operating companies live here, linked by parentCompanyId.
  code: varchar("code", { length: 32 }).unique(),                    // stable key: 'GLOBAL','SA','US','ASIA','CO','IN'
  entityType: mysqlEnum("entityType", ["holdco", "opco", "jv"]).default("opco").notNull(),
  countryCode: varchar("countryCode", { length: 2 }),               // ISO 3166-1 alpha-2 (distinct from free-text `country`)
  ownershipPctOfParent: decimal("ownershipPctOfParent", { precision: 7, scale: 4 }), // parent's % of this entity
  status: mysqlEnum("status", ["active", "inactive", "pending"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
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
  companyId: int("companyId").references(() => companies.id),
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
  contactId: int("contactId").references(() => crmContacts.id, { onDelete: "set null" }), // FK to crm_contacts.id (set on auto-link by phone or manual picker)
  whatsappNumber: varchar("whatsappNumber", { length: 32 }), // Direct WhatsApp number for this vendor (overrides contact's)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  sku: varchar("sku", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  type: mysqlEnum("type", ["physical", "digital", "service"]).default("physical").notNull(),
  manufacturingStage: mysqlEnum("manufacturingStage", ["raw_material", "semi_finished_good", "finished_product"]).default("finished_product").notNull(),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  costPrice: decimal("costPrice", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  taxable: boolean("taxable").default(true),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["active", "inactive", "discontinued"]).default("active").notNull(),
  shopifyProductId: varchar("shopifyProductId", { length: 64 }),
  quickbooksItemId: varchar("quickbooksItemId", { length: 64 }),
  preferredVendorId: int("preferredVendorId").references(() => vendors.id), // Preferred vendor for auto-purchase orders
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// FINANCE MODULE
// ============================================

export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  subtype: varchar("subtype", { length: 64 }),
  description: text("description"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  isActive: boolean("isActive").default(true),
  parentAccountId: int("parentAccountId").references((): AnyMySqlColumn => accounts.id),
  quickbooksAccountId: varchar("quickbooksAccountId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  customerId: int("customerId").references(() => customers.id),
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
  createdBy: int("createdBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const invoiceItems = mysqlTable("invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => invoices.id),
  productId: int("productId").references(() => products.id),
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
  companyId: int("companyId").references(() => companies.id),
  paymentNumber: varchar("paymentNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["received", "made"]).notNull(),
  invoiceId: int("invoiceId").references(() => invoices.id),
  vendorId: int("vendorId").references(() => vendors.id),
  customerId: int("customerId").references(() => customers.id),
  accountId: int("accountId").references(() => accounts.id),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "check", "bank_transfer", "credit_card", "ach", "wire", "other"]).default("bank_transfer"),
  paymentDate: timestamp("paymentDate").notNull(),
  referenceNumber: varchar("referenceNumber", { length: 128 }),
  status: mysqlEnum("status", ["pending", "completed", "failed", "cancelled"]).default("pending").notNull(),
  purchaseOrderId: int("purchase_order_id"),
  notes: text("notes"),
  quickbooksPaymentId: varchar("quickbooksPaymentId", { length: 64 }),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  transactionNumber: varchar("transactionNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["journal", "invoice", "payment", "expense", "transfer", "adjustment"]).notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  date: timestamp("date").notNull(),
  description: text("description"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["draft", "posted", "void"]).default("draft").notNull(),
  createdBy: int("createdBy").references(() => users.id),
  postedBy: int("postedBy").references(() => users.id),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const transactionLines = mysqlTable("transaction_lines", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull().references(() => transactions.id),
  accountId: int("accountId").notNull().references(() => accounts.id),
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
  companyId: int("companyId").references(() => companies.id),
  orderNumber: varchar("orderNumber", { length: 64 }).notNull(),
  customerId: int("customerId").references(() => customers.id),
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
  invoiceId: int("invoiceId").references(() => invoices.id),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  productId: int("productId").references(() => products.id),
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
  companyId: int("companyId").references(() => companies.id),
  productId: int("productId").notNull().references(() => products.id),
  warehouseId: int("warehouseId").references(() => warehouses.id),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  reservedQuantity: decimal("reservedQuantity", { precision: 15, scale: 4 }).default("0"),
  reorderLevel: decimal("reorderLevel", { precision: 15, scale: 4 }),
  reorderQuantity: decimal("reorderQuantity", { precision: 15, scale: 4 }),
  lastCountDate: timestamp("lastCountDate"),
  lastCountQuantity: decimal("lastCountQuantity", { precision: 15, scale: 4 }),
  averageCost: decimal("averageCost", { precision: 15, scale: 4 }), // Average cost per unit for COGS calculation
  totalCostBasis: decimal("totalCostBasis", { precision: 15, scale: 2 }), // Total cost of inventory on hand
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const warehouses = mysqlTable("warehouses", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),
  type: mysqlEnum("type", ["warehouse", "store", "distribution", "copacker", "3pl", "factory"]).default("warehouse").notNull(),
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
  companyId: int("companyId").references(() => companies.id),
  transferNumber: varchar("transferNumber", { length: 64 }).notNull(),
  fromWarehouseId: int("fromWarehouseId").notNull().references(() => warehouses.id),
  toWarehouseId: int("toWarehouseId").notNull().references(() => warehouses.id),
  status: mysqlEnum("status", ["draft", "pending", "in_transit", "received", "cancelled"]).default("draft").notNull(),
  requestedDate: timestamp("requestedDate").notNull(),
  shippedDate: timestamp("shippedDate"),
  receivedDate: timestamp("receivedDate"),
  expectedArrival: timestamp("expectedArrival"),
  trackingNumber: varchar("trackingNumber", { length: 128 }),
  carrier: varchar("carrier", { length: 128 }),
  notes: text("notes"),
  requestedBy: int("requestedBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryTransfer = typeof inventoryTransfers.$inferSelect;
export type InsertInventoryTransfer = typeof inventoryTransfers.$inferInsert;

// Transfer line items
export const inventoryTransferItems = mysqlTable("inventory_transfer_items", {
  id: int("id").autoincrement().primaryKey(),
  transferId: int("transferId").notNull().references(() => inventoryTransfers.id),
  productId: int("productId").notNull().references(() => products.id),
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
  companyId: int("companyId").references(() => companies.id),
  batchNumber: varchar("batchNumber", { length: 64 }).notNull(),
  productId: int("productId").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "cancelled"]).default("planned").notNull(),
  startDate: timestamp("startDate"),
  completionDate: timestamp("completionDate"),
  warehouseId: int("warehouseId").references(() => warehouses.id),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  poNumber: varchar("poNumber", { length: 64 }).notNull(),
  vendorId: int("vendorId").notNull().references(() => vendors.id),
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
  createdBy: int("createdBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull().references(() => purchaseOrders.id),
  productId: int("productId").references(() => products.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  receivedQuantity: decimal("receivedQuantity", { precision: 15, scale: 4 }).default("0"),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const shipments = mysqlTable("shipments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  shipmentNumber: varchar("shipmentNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["inbound", "outbound"]).notNull(),
  orderId: int("orderId").references(() => orders.id),
  purchaseOrderId: int("purchaseOrderId").references(() => purchaseOrders.id),
  // Inbound shipments can carry a raw material — links the shipment to inventory
  // so that delivery moves stock from "in transit" to "received".
  rawMaterialId: int("rawMaterialId").references(() => rawMaterials.id),
  quantity: decimal("quantity", { precision: 15, scale: 4 }),
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
  companyId: int("companyId").references(() => companies.id),
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
  userId: int("userId").references(() => users.id),
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
  departmentId: int("departmentId").references(() => departments.id),
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
  employeeId: int("employeeId").notNull().references(() => employees.id),
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
  employeeId: int("employeeId").notNull().references(() => employees.id),
  paymentNumber: varchar("paymentNumber", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["salary", "bonus", "commission", "reimbursement", "other"]).default("salary").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentDate: timestamp("paymentDate").notNull(),
  payPeriodStart: timestamp("payPeriodStart"),
  payPeriodEnd: timestamp("payPeriodEnd"),
  paymentMethod: mysqlEnum("paymentMethod", ["check", "direct_deposit", "wire", "other"]).default("direct_deposit"),
  status: mysqlEnum("status", ["pending", "processed", "cancelled"]).default("pending").notNull(),
  grossAmount: decimal("grossAmount", { precision: 15, scale: 2 }),
  taxWithheld: decimal("taxWithheld", { precision: 15, scale: 2 }),
  otherDeductions: decimal("otherDeductions", { precision: 15, scale: 2 }),
  payslipUrl: text("payslipUrl"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// PTO balance per employee per leave type per year
export const ptoBalances = mysqlTable("pto_balances", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id),
  leaveType: mysqlEnum("leaveType", ["vacation", "sick", "personal", "parental", "bereavement", "unpaid", "other"]).notNull(),
  year: int("year").notNull(),
  accruedHours: decimal("accruedHours", { precision: 8, scale: 2 }).default("0").notNull(),
  usedHours: decimal("usedHours", { precision: 8, scale: 2 }).default("0").notNull(),
  pendingHours: decimal("pendingHours", { precision: 8, scale: 2 }).default("0").notNull(),
  carryOverHours: decimal("carryOverHours", { precision: 8, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  employeeLeaveYearIdx: uniqueIndex("pto_balances_employee_leave_year_idx").on(table.employeeId, table.leaveType, table.year),
}));
export const leaveRequests = mysqlTable("leave_requests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id),
  leaveType: mysqlEnum("leaveType", ["vacation", "sick", "personal", "parental", "bereavement", "unpaid", "other"]).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  hours: decimal("hours", { precision: 8, scale: 2 }).notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  approverId: int("approverId").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const onboardingTasks = mysqlTable("onboarding_tasks", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", ["paperwork", "training", "equipment", "access", "introduction", "acknowledgment", "other"]).default("other").notNull(),
  dueDate: timestamp("dueDate"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "skipped"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const employeeBenefits = mysqlTable("employee_benefits", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id),
  benefitType: mysqlEnum("benefitType", ["health", "dental", "vision", "retirement_401k", "life_insurance", "disability", "hsa", "fsa", "commuter", "other"]).notNull(),
  plan: varchar("plan", { length: 255 }),
  carrier: varchar("carrier", { length: 255 }),
  coverageLevel: mysqlEnum("coverageLevel", ["employee_only", "employee_spouse", "employee_children", "family", "waived"]),
  employeeContribution: decimal("employeeContribution", { precision: 15, scale: 2 }),
  employerContribution: decimal("employerContribution", { precision: 15, scale: 2 }),
  contributionFrequency: mysqlEnum("contributionFrequency", ["per_paycheck", "monthly", "annual"]).default("per_paycheck"),
  effectiveDate: timestamp("effectiveDate"),
  endDate: timestamp("endDate"),
  enrollmentStatus: mysqlEnum("enrollmentStatus", ["enrolled", "pending", "waived", "terminated"]).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const employeeEmergencyContacts = mysqlTable("employee_emergency_contacts", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id),
  name: varchar("name", { length: 255 }).notNull(),
  relationship: varchar("relationship", { length: 64 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  isPrimary: boolean("isPrimary").default(false).notNull(),
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
  contractId: int("contractId").notNull().references(() => contracts.id),
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
  contractId: int("contractId").references(() => contracts.id),
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
  type: mysqlEnum("type", ["contract", "invoice", "receipt", "report", "legal", "hr", "freight", "customs", "bol", "packing_list", "certificate", "po", "other"]).notNull(),
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
  archivedAt: timestamp("archivedAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const projectMilestones = mysqlTable("project_milestones", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
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
  projectId: int("projectId").notNull().references(() => projects.id),
  milestoneId: int("milestoneId").references(() => projectMilestones.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  assigneeId: int("assigneeId"),
  // Who owns execution: a human user or an AI agent. When "ai_agent", the
  // linked aiAgentTasks row carries approval/execution state.
  assigneeType: mysqlEnum("assigneeType", ["human", "ai_agent"]).default("human").notNull(),
  assigneeAgentTaskId: int("assigneeAgentTaskId"),
  status: mysqlEnum("status", ["todo", "in_progress", "review", "completed", "cancelled"]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  dueDate: timestamp("dueDate"),
  completedDate: timestamp("completedDate"),
  // Last time an outstanding-task reminder email was sent for this task. Used by
  // the daily task-reminder job to avoid re-emailing the assignee more than once
  // per run window. Cleared implicitly by comparing against a cooldown cutoff.
  reminderSentAt: timestamp("reminderSentAt"),
  estimatedHours: decimal("estimatedHours", { precision: 10, scale: 2 }),
  actualHours: decimal("actualHours", { precision: 10, scale: 2 }),
  // Lightfield-style CRM linkage + provenance
  accountId: int("accountId"),
  opportunityId: int("opportunityId"),
  sourceType: mysqlEnum("sourceType", ["manual", "email", "meeting", "ai_generated", "crm_deal"]).default("manual").notNull(),
  sourceRefType: varchar("sourceRefType", { length: 64 }),
  sourceRefId: int("sourceRefId"),
  // External string ID for sources whose identifier isn't a DB int — e.g.
  // RFC 822 Message-ID for emails, Fireflies recording URL for meetings.
  sourceExternalId: varchar("sourceExternalId", { length: 255 }),
  aiReasoning: text("aiReasoning"),
  aiConfidence: decimal("aiConfidence", { precision: 5, scale: 2 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = typeof projectTasks.$inferInsert;

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
  "data_room_view",
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
  type: mysqlEnum("type", ["quickbooks", "shopify", "stripe", "slack", "email", "webhook", "airtable"]).notNull(),
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
  companyId: int("companyId").references(() => companies.id),
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

// ── Thread Follow-Up workflow ──────────────────────────────────────────────
// One row per outbound "ask" that is awaiting a reply. A daily job scans for
// nextNudgeAt <= now and drives automated nudges. Behavior differs for active
// vendors (never drop; up to 4 nudges then hand to a human) vs. non-vendors
// (one nudge, then drop). See server/threadFollowUp.ts.
//
// Column-name note: the workflow spec names columns in snake_case
// (is_active_vendor, nudge_count, next_nudge_at, status, paused_until,
// last_inbound_at, last_outbound_at). The rest of this schema is camelCase, so
// the Drizzle/SQL column names below stay camelCase; the mapping is 1:1.
export const emailThreadFollowups = mysqlTable("email_thread_followups", {
  id: int("id").autoincrement().primaryKey(),
  threadId: varchar("threadId", { length: 255 }).notNull(), // correlation key for the email thread
  gmailThreadId: varchar("gmailThreadId", { length: 255 }), // Gmail thread id to reply within (true in-thread send)
  gmailMessageId: varchar("gmailMessageId", { length: 255 }), // Gmail message id of the latest message (In-Reply-To/References)
  subject: varchar("subject", { length: 500 }), // original subject; nudges reply in-thread, never a new subject
  contactEmail: varchar("contactEmail", { length: 320 }).notNull(), // who we are nudging
  contactName: varchar("contactName", { length: 255 }),
  country: varchar("country", { length: 64 }), // recipient country -> holiday calendar (US/IN/ZA/CO)
  timezone: varchar("timezone", { length: 64 }), // recipient IANA tz -> send window; overrides country default
  managerEmail: varchar("managerEmail", { length: 320 }), // alternate/manager contact for nudge 4
  vendorId: int("vendorId"), // linked vendor if matched from our records
  threadOwnerId: int("threadOwnerId"), // our user who owns the thread (cc'd on nudge 3; escalation task owner)
  relatedEntityType: varchar("relatedEntityType", { length: 50 }), // 'purchase_order' | 'deal' | 'task' | ...
  relatedEntityId: int("relatedEntityId"), // stop-condition: linked task/PO/deal closed or cancelled
  askSummary: varchar("askSummary", { length: 500 }), // one-line restatement of what we are waiting on
  holdingUp: varchar("holdingUp", { length: 500 }), // what the outstanding item is holding up (later nudges name it)
  isActiveVendor: boolean("isActiveVendor").default(false).notNull(), // looked up from vendor records, not the email
  nudgeCount: int("nudgeCount").default(0).notNull(), // automated emails sent so far (max 4)
  nextNudgeAt: timestamp("nextNudgeAt"), // when the daily job should next act; null = nothing scheduled
  status: mysqlEnum("status", ["active", "dropped_no_response", "escalated_to_human", "resolved"]).default("active").notNull(),
  pausedUntil: timestamp("pausedUntil"), // OOO: clock paused, resume on/after this date
  lastInboundAt: timestamp("lastInboundAt"), // last reply received from them
  lastOutboundAt: timestamp("lastOutboundAt"), // our last message (the original ask or a nudge) — cadence anchor
  lastNudgeAt: timestamp("lastNudgeAt"),
  optedOut: boolean("optedOut").default(false).notNull(), // they asked us not to follow up
  manualReplyAt: timestamp("manualReplyAt"), // a human on our side sent a manual reply
  escalatedTaskId: int("escalatedTaskId"), // project_tasks.id created on escalation
  resolvedReason: varchar("resolvedReason", { length: 64 }), // why the workflow stopped
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  threadIdIdx: uniqueIndex("email_thread_followups_threadId_idx").on(t.threadId),
}));

export type EmailThreadFollowup = typeof emailThreadFollowups.$inferSelect;
export type InsertEmailThreadFollowup = typeof emailThreadFollowups.$inferInsert;

// Structured, reviewable audit log for the Thread Follow-Up workflow.
// Every nudge sent, every nudge skipped (with reason), every drop and every
// escalation is recorded here so a week of dry-run output can be reviewed.
export const threadFollowupLogs = mysqlTable("thread_followup_logs", {
  id: int("id").autoincrement().primaryKey(),
  followupId: int("followupId"),
  threadId: varchar("threadId", { length: 255 }),
  action: mysqlEnum("action", [
    "enrolled", "nudge_sent", "nudge_skipped", "dropped", "escalated",
    "paused", "resumed", "resolved", "error",
  ]).notNull(),
  reason: varchar("reason", { length: 128 }), // e.g. 'outside_send_window', 'reply_received', 'paused_ooo'
  nudgeNumber: int("nudgeNumber"),
  dryRun: boolean("dryRun").default(false).notNull(),
  detail: json("detail"), // what was (or would be) sent: { to, cc, subject, bodyPreview, ... }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ThreadFollowupLog = typeof threadFollowupLogs.$inferSelect;
export type InsertThreadFollowupLog = typeof threadFollowupLogs.$inferInsert;

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
  companyId: int("companyId").references(() => companies.id),
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
  companyId: int("companyId").references(() => companies.id),
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
  companyId: int("companyId").references(() => companies.id),
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

// Standalone freight quotes (simplified, denormalized for quick quoting)
export const freightQuotesStandalone = mysqlTable("freight_quotes", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  shipmentId: int("shipmentId"),
  purchaseOrderId: int("purchaseOrderId"),
  carrierName: varchar("carrierName", { length: 255 }).notNull(),
  carrierEmail: varchar("carrierEmail", { length: 320 }),
  carrierPhone: varchar("carrierPhone", { length: 32 }),
  origin: varchar("origin", { length: 500 }).notNull(),
  destination: varchar("destination", { length: 500 }).notNull(),
  weight: decimal("weight", { precision: 12, scale: 2 }),
  dimensions: text("dimensions"),
  containerType: mysqlEnum("containerType", ["LTL", "FTL", "FCL", "LCL"]),
  incoterms: mysqlEnum("incoterms", ["FOB", "CIF", "EXW", "DDP", "DAP"]),
  quotedPrice: decimal("quotedPrice", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  transitDays: int("transitDays"),
  validUntil: timestamp("validUntil"),
  status: mysqlEnum("freight_quote_status", ["requested", "received", "selected", "expired", "declined"]).default("requested").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FreightQuoteStandalone = typeof freightQuotesStandalone.$inferSelect;
export type InsertFreightQuoteStandalone = typeof freightQuotesStandalone.$inferInsert;


// ============================================
// BILL OF MATERIALS (BOM) MODULE
// ============================================

// BOM header - defines a product's bill of materials
export const billOfMaterials = mysqlTable("billOfMaterials", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  productId: int("productId").notNull().references(() => products.id), // The finished product
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
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// BOM components - individual items that make up a product
export const bomComponents = mysqlTable("bomComponents", {
  id: int("id").autoincrement().primaryKey(),
  bomId: int("bomId").notNull().references(() => billOfMaterials.id), // Reference to billOfMaterials
  componentType: mysqlEnum("componentType", ["product", "raw_material", "packaging", "labor"]).default("raw_material").notNull(),
  productId: int("productId").references(() => products.id), // If component is another product (sub-assembly)
  rawMaterialId: int("rawMaterialId").references(() => rawMaterials.id), // If component is a raw material
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
  companyId: int("companyId").references(() => companies.id),
  sku: varchar("sku", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  unit: varchar("unit", { length: 32 }).default("EA").notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 4 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  minOrderQty: decimal("minOrderQty", { precision: 15, scale: 4 }),
  leadTimeDays: int("leadTimeDays").default(0),
  preferredVendorId: int("preferredVendorId").references(() => vendors.id),
  status: mysqlEnum("status", ["active", "inactive", "discontinued"]).default("active").notNull(),
  // Receiving tracking fields
  receivingStatus: mysqlEnum("receivingStatus", ["none", "ordered", "in_transit", "received", "inspected"]).default("none"),
  lastPoId: int("lastPoId").references(() => purchaseOrders.id), // Reference to most recent PO
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

// Recipe costing ingredients
export const recipeIngredients = mysqlTable("recipeIngredients", {
  id: int("id").autoincrement().primaryKey(),
  ownerCompanyId: int("ownerCompanyId").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  category: mysqlEnum("category", ["protein", "spice", "liquid", "produce", "packaging", "other"]).default("other").notNull(),
  unitOfMeasure: mysqlEnum("unitOfMeasure", ["g", "kg", "lb", "oz", "ml", "l", "each"]).default("g").notNull(),
  costPerUnit: decimal("costPerUnit", { precision: 12, scale: 4 }).default("0").notNull(),
  costUnit: mysqlEnum("costUnit", ["per_lb", "per_kg", "per_oz", "per_each"]).default("per_kg").notNull(),
  supplierId: int("supplierId").references(() => vendors.id),
  leadTimeDays: int("leadTimeDays"),
  moistureContent: decimal("moistureContent", { precision: 5, scale: 4 }),
  shelfLifeDays: int("shelfLifeDays"),
  isAllergen: boolean("isAllergen").default(false).notNull(),
  allergenType: varchar("allergenType", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ingredientCostHistory = mysqlTable("ingredientCostHistory", {
  id: int("id").autoincrement().primaryKey(),
  ingredientId: int("ingredientId").notNull().references(() => recipeIngredients.id),
  costPerUnit: decimal("costPerUnit", { precision: 12, scale: 4 }).notNull(),
  costUnit: mysqlEnum("costUnit", ["per_lb", "per_kg", "per_oz", "per_each"]).default("per_kg").notNull(),
  effectiveDate: timestamp("effectiveDate").defaultNow().notNull(),
  supplierId: int("supplierId").references(() => vendors.id),
  source: varchar("source", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const recipes = mysqlTable("recipes", {
  id: int("id").autoincrement().primaryKey(),
  ownerCompanyId: int("ownerCompanyId").references(() => companies.id),
  recipeId: varchar("recipeId", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["beef", "pork", "chicken", "seafood", "dairy", "blend", "other"]).default("other").notNull(),
  status: mysqlEnum("status", ["development", "production", "discontinued"]).default("development").notNull(),
  version: int("version").default(1).notNull(),
  isSubRecipe: boolean("isSubRecipe").default(false).notNull(),
  baseBatchGrams: decimal("baseBatchGrams", { precision: 12, scale: 2 }).default("0").notNull(),
  expectedYieldPct: decimal("expectedYieldPct", { precision: 5, scale: 4 }).default("1.0000").notNull(),
  hasMoistureVariants: boolean("hasMoistureVariants").default(false).notNull(),
  /** Linked BOM built from this recipe (sync via syncRecipeToBom). */
  bomId: int("bomId").references(() => billOfMaterials.id),
  /** Finished good this recipe produces when synced to a BOM. */
  outputProductId: int("outputProductId").references(() => products.id),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  recipeVersionIdx: uniqueIndex("recipes_recipe_version_idx").on(table.recipeId, table.version),
}));

export const recipeLines = mysqlTable("recipeLines", {
  id: int("id").autoincrement().primaryKey(),
  recipeRowId: int("recipeRowId").notNull().references(() => recipes.id),
  lineNumber: int("lineNumber").default(1).notNull(),
  ingredientId: int("ingredientId").references(() => recipeIngredients.id),
  subRecipeId: int("subRecipeId").references(() => recipes.id),
  quantityGrams: decimal("quantityGrams", { precision: 12, scale: 2 }).default("0").notNull(),
  quantityGramsDry: decimal("quantityGramsDry", { precision: 12, scale: 2 }),
  isProteinLine: boolean("isProteinLine").default(false).notNull(),
  isWaterLine: boolean("isWaterLine").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const recipeProcedures = mysqlTable("recipeProcedures", {
  id: int("id").autoincrement().primaryKey(),
  recipeRowId: int("recipeRowId").notNull().references(() => recipes.id),
  stepNumber: int("stepNumber").default(1).notNull(),
  instruction: text("instruction").notNull(),
  durationMinutes: int("durationMinutes"),
  temperatureF: int("temperatureF"),
  appliesTo: mysqlEnum("appliesTo", ["both", "dry_only", "wet_only"]).default("both").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const moistureProfiles = mysqlTable("moistureProfiles", {
  id: int("id").autoincrement().primaryKey(),
  ingredientId: int("ingredientId").notNull().references(() => recipeIngredients.id),
  profileName: varchar("profileName", { length: 50 }).notNull(),
  moistureContent: decimal("moistureContent", { precision: 5, scale: 4 }).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  testedDate: timestamp("testedDate"),
  coaReference: varchar("coaReference", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const batchCostSnapshots = mysqlTable("batchCostSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  recipeId: int("recipeId").notNull().references(() => recipes.id),
  snapshotDate: timestamp("snapshotDate").defaultNow().notNull(),
  formulationType: mysqlEnum("formulationType", ["wet", "dry"]).default("wet").notNull(),
  totalBatchGrams: decimal("totalBatchGrams", { precision: 12, scale: 2 }).notNull(),
  totalBatchCost: decimal("totalBatchCost", { precision: 12, scale: 4 }).notNull(),
  costPerGram: decimal("costPerGram", { precision: 12, scale: 6 }).notNull(),
  costPerLb: decimal("costPerLb", { precision: 12, scale: 4 }).notNull(),
  costPerKg: decimal("costPerKg", { precision: 12, scale: 4 }).notNull(),
  yieldAdjustedCostPerLb: decimal("yieldAdjustedCostPerLb", { precision: 12, scale: 4 }).notNull(),
  ingredientCosts: json("ingredientCosts"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// BOM version history for tracking changes
export const bomVersionHistory = mysqlTable("bomVersionHistory", {
  id: int("id").autoincrement().primaryKey(),
  bomId: int("bomId").notNull().references(() => billOfMaterials.id),
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
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type InsertRecipeIngredient = typeof recipeIngredients.$inferInsert;
export type IngredientCostHistory = typeof ingredientCostHistory.$inferSelect;
export type InsertIngredientCostHistory = typeof ingredientCostHistory.$inferInsert;

// Multi-vendor pricing for ingredients
export const ingredientVendors = mysqlTable("ingredientVendors", {
  id: int("id").autoincrement().primaryKey(),
  ingredientId: int("ingredientId").notNull().references(() => recipeIngredients.id),
  vendorId: int("vendorId").notNull().references(() => vendors.id),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 4 }),
  costUnit: mysqlEnum("costUnit", ["per_lb", "per_kg", "per_oz", "per_each"]).default("per_kg").notNull(),
  contractStartDate: timestamp("contractStartDate"),
  contractEndDate: timestamp("contractEndDate"),
  minimumOrderQty: decimal("minimumOrderQty", { precision: 15, scale: 4 }),
  leadTimeDays: int("leadTimeDays"),
  paymentTerms: varchar("paymentTerms", { length: 100 }),
  lastQuotedAt: timestamp("lastQuotedAt"),
  lastQuotedPrice: decimal("lastQuotedPrice", { precision: 12, scale: 4 }),
  quoteValidUntil: timestamp("quoteValidUntil"),
  status: mysqlEnum("status", ["active", "inactive", "pending_quote"]).default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ingredientVendorIdx: uniqueIndex("ingredientVendors_ingredient_vendor_idx").on(table.ingredientId, table.vendorId),
}));

export type IngredientVendor = typeof ingredientVendors.$inferSelect;
export type InsertIngredientVendor = typeof ingredientVendors.$inferInsert;

// Automated ingredient quote requests (bridges ingredients to vendorRfqs)
export const ingredientQuoteRequests = mysqlTable("ingredientQuoteRequests", {
  id: int("id").autoincrement().primaryKey(),
  ingredientId: int("ingredientId").notNull().references(() => recipeIngredients.id),
  vendorRfqId: int("vendorRfqId"),
  triggerType: mysqlEnum("triggerType", ["manual", "price_spike", "contract_expiry", "scheduled", "cost_review", "invoice_variance"]).notNull(),
  triggerDetails: text("triggerDetails"),
  currentCostPerUnit: decimal("currentCostPerUnit", { precision: 12, scale: 4 }),
  historicalAvgCost: decimal("historicalAvgCost", { precision: 12, scale: 4 }),
  targetVendorIds: text("targetVendorIds"),
  status: mysqlEnum("status", ["pending", "rfq_created", "quotes_received", "analyzed", "accepted", "cancelled"]).default("pending").notNull(),
  analysisResult: text("analysisResult"),
  acceptedQuoteId: int("acceptedQuoteId"),
  costUpdated: boolean("costUpdated").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IngredientQuoteRequest = typeof ingredientQuoteRequests.$inferSelect;
export type InsertIngredientQuoteRequest = typeof ingredientQuoteRequests.$inferInsert;

// Cost alerts for ingredients (price spikes, better prices, contract expiry, invoice variances)
export const ingredientCostAlerts = mysqlTable("ingredientCostAlerts", {
  id: int("id").autoincrement().primaryKey(),
  ingredientId: int("ingredientId").notNull().references(() => recipeIngredients.id),
  alertType: mysqlEnum("alertType", [
    "price_spike", "better_price_found", "contract_expiring",
    "quote_below_current", "periodic_review", "invoice_above_po",
  ]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("info").notNull(),
  message: text("message").notNull(),
  details: text("details"),
  quoteRequestId: int("quoteRequestId"),
  vendorQuoteId: int("vendorQuoteId"),
  isRead: boolean("isRead").default(false).notNull(),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IngredientCostAlert = typeof ingredientCostAlerts.$inferSelect;
export type InsertIngredientCostAlert = typeof ingredientCostAlerts.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = typeof recipes.$inferInsert;
export type RecipeLine = typeof recipeLines.$inferSelect;
export type InsertRecipeLine = typeof recipeLines.$inferInsert;
export type RecipeProcedure = typeof recipeProcedures.$inferSelect;
export type InsertRecipeProcedure = typeof recipeProcedures.$inferInsert;
export type MoistureProfile = typeof moistureProfiles.$inferSelect;
export type InsertMoistureProfile = typeof moistureProfiles.$inferInsert;
export type BatchCostSnapshot = typeof batchCostSnapshots.$inferSelect;
export type InsertBatchCostSnapshot = typeof batchCostSnapshots.$inferInsert;
export type BomVersionHistory = typeof bomVersionHistory.$inferSelect;
export type InsertBomVersionHistory = typeof bomVersionHistory.$inferInsert;

// Per-copacker recipe sharing. A recipe is visible in a copacker's portal only
// if a row exists here for their linked warehouse.
export const recipeCopackerShares = mysqlTable("recipe_copacker_shares", {
  id: int("id").autoincrement().primaryKey(),
  recipeId: int("recipeId").notNull().references(() => recipes.id),
  warehouseId: int("warehouseId").notNull().references(() => warehouses.id),
  shareIngredients: boolean("shareIngredients").default(true).notNull(),
  shareProcedures: boolean("shareProcedures").default(true).notNull(),
  notes: text("notes"),
  sharedBy: int("sharedBy").references(() => users.id),
  sharedAt: timestamp("sharedAt").defaultNow().notNull(),
}, (table) => ({
  recipeWarehouseIdx: uniqueIndex("recipe_copacker_shares_recipe_warehouse_idx").on(table.recipeId, table.warehouseId),
}));

export type RecipeCopackerShare = typeof recipeCopackerShares.$inferSelect;
export type InsertRecipeCopackerShare = typeof recipeCopackerShares.$inferInsert;

// Per-user recipe access grants. Recipes (and their formulations) are private:
// a recipe is only visible to the user who created it (the owner) and to users
// who have an explicit grant row here. There is no role-based bypass — even
// admins must be individually granted access to a recipe they did not create.
export const recipeAccessGrants = mysqlTable("recipe_access_grants", {
  id: int("id").autoincrement().primaryKey(),
  recipeId: int("recipeId").notNull().references(() => recipes.id),
  userId: int("userId").notNull().references(() => users.id),
  /** When true the grantee may edit the recipe; otherwise view-only. */
  canEdit: boolean("canEdit").default(false).notNull(),
  grantedBy: int("grantedBy").references(() => users.id),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
}, (table) => ({
  recipeUserIdx: uniqueIndex("recipe_access_grants_recipe_user_idx").on(table.recipeId, table.userId),
}));

export type RecipeAccessGrant = typeof recipeAccessGrants.$inferSelect;
export type InsertRecipeAccessGrant = typeof recipeAccessGrants.$inferInsert;

// ============================================
// COPACKER PORTAL
// ============================================

// Biweekly inventory update submissions from copackers
export const copackerInventoryUpdates = mysqlTable("copacker_inventory_updates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  warehouseId: int("warehouseId").notNull(),
  submittedBy: int("submittedBy").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  status: mysqlEnum("status", ["draft", "submitted", "reviewed", "approved", "rejected"]).default("draft").notNull(),
  notes: text("notes"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CopackerInventoryUpdate = typeof copackerInventoryUpdates.$inferSelect;
export type InsertCopackerInventoryUpdate = typeof copackerInventoryUpdates.$inferInsert;

// Line items within a biweekly inventory update
export const copackerInventoryUpdateItems = mysqlTable("copacker_inventory_update_items", {
  id: int("id").autoincrement().primaryKey(),
  updateId: int("updateId").notNull(),
  productId: int("productId").notNull(),
  previousQuantity: decimal("previousQuantity", { precision: 15, scale: 4 }),
  newQuantity: decimal("newQuantity", { precision: 15, scale: 4 }).notNull(),
  quantityReceived: decimal("quantityReceived", { precision: 15, scale: 4 }).default("0"),
  quantityShipped: decimal("quantityShipped", { precision: 15, scale: 4 }).default("0"),
  quantityDamaged: decimal("quantityDamaged", { precision: 15, scale: 4 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CopackerInventoryUpdateItem = typeof copackerInventoryUpdateItems.$inferSelect;
export type InsertCopackerInventoryUpdateItem = typeof copackerInventoryUpdateItems.$inferInsert;

// Invoices submitted by copackers for their services
export const copackerInvoices = mysqlTable("copacker_invoices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  warehouseId: int("warehouseId").notNull(),
  submittedBy: int("submittedBy").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  invoiceDate: timestamp("invoiceDate").notNull(),
  dueDate: timestamp("dueDate"),
  description: text("description"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["draft", "submitted", "under_review", "approved", "rejected", "paid"]).default("draft").notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CopackerInvoice = typeof copackerInvoices.$inferSelect;
export type InsertCopackerInvoice = typeof copackerInvoices.$inferInsert;

// Line items on copacker invoices
export const copackerInvoiceItems = mysqlTable("copacker_invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CopackerInvoiceItem = typeof copackerInvoiceItems.$inferSelect;
export type InsertCopackerInvoiceItem = typeof copackerInvoiceItems.$inferInsert;

// Shipping documents uploaded by copackers (BOL, packing lists, etc.)
export const copackerShippingDocuments = mysqlTable("copacker_shipping_documents", {
  id: int("id").autoincrement().primaryKey(),
  warehouseId: int("warehouseId").notNull(),
  shipmentId: int("shipmentId"),
  uploadedBy: int("uploadedBy").notNull(),
  documentType: mysqlEnum("documentType", [
    "bill_of_lading", "packing_list", "commercial_invoice", "proof_of_delivery",
    "weight_certificate", "inspection_report", "customs_declaration", "other"
  ]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 128 }),
  status: mysqlEnum("status", ["uploaded", "reviewed", "approved", "rejected"]).default("uploaded").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CopackerShippingDocument = typeof copackerShippingDocuments.$inferSelect;
export type InsertCopackerShippingDocument = typeof copackerShippingDocuments.$inferInsert;

// ============================================
// PRODUCTION & WORK ORDERS
// ============================================

// Work orders for production runs
export const workOrders = mysqlTable("workOrders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  workOrderNumber: varchar("workOrderNumber", { length: 64 }).notNull(),
  bomId: int("bomId").notNull().references(() => billOfMaterials.id),
  productId: int("productId").notNull().references(() => products.id),
  warehouseId: int("warehouseId").references(() => warehouses.id), // Production location
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
  // Equipment needed (JSON array: [{name, type, model}])
  equipmentNeeded: text("equipmentNeeded"),
  // Procedure / special instructions (markdown/text)
  procedure: text("procedure"),
  // Quality Control checklist (JSON array: [{check, spec, result, passed}])
  qcChecklist: text("qcChecklist"),
  // QC specs
  moistureContent: varchar("moistureContent", { length: 32 }),
  targetTemperature: varchar("targetTemperature", { length: 64 }),
  // Packaging specifications
  packagingType: varchar("packagingType", { length: 128 }),
  packagingSize: varchar("packagingSize", { length: 128 }),
  labelInfo: text("labelInfo"),
  storageInstructions: varchar("storageInstructions", { length: 256 }),
  // Sign-off
  productionManagerId: int("productionManagerId"),
  productionManagerSignedAt: timestamp("productionManagerSignedAt"),
  qcManagerId: int("qcManagerId"),
  qcManagerSignedAt: timestamp("qcManagerSignedAt"),
  // Department
  department: varchar("department", { length: 128 }).default("Production"),
  batchNumber: varchar("batchNumber", { length: 64 }),
  createdBy: int("createdBy").references(() => users.id),
  assignedTo: int("assignedTo").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Work order material requirements (auto-calculated from BOM)
export const workOrderMaterials = mysqlTable("workOrderMaterials", {
  id: int("id").autoincrement().primaryKey(),
  workOrderId: int("workOrderId").notNull().references(() => workOrders.id),
  rawMaterialId: int("rawMaterialId").references(() => rawMaterials.id),
  productId: int("productId").references(() => products.id), // For sub-assemblies
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
  companyId: int("companyId").references(() => companies.id),
  rawMaterialId: int("rawMaterialId").notNull().references(() => rawMaterials.id),
  warehouseId: int("warehouseId").notNull().references(() => warehouses.id),
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
  companyId: int("companyId").references(() => companies.id),
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
  companyId: int("companyId").references(() => companies.id),
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
  companyId: int("companyId").references(() => companies.id),
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
  companyId: int("companyId").references(() => companies.id),
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
  companyId: int("companyId").references(() => companies.id),
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

// COGS (Cost of Goods Sold) transaction tracking
export const cogsTransactions = mysqlTable("cogsTransactions", {
  id: int("id").autoincrement().primaryKey(),
  transactionNumber: varchar("transactionNumber", { length: 64 }).notNull(),
  salesOrderId: int("salesOrderId").notNull(),
  salesOrderLineId: int("salesOrderLineId").notNull(),
  productId: int("productId").notNull(),
  lotId: int("lotId"),
  warehouseId: int("warehouseId"),
  quantitySold: decimal("quantitySold", { precision: 15, scale: 4 }).notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 4 }).notNull(), // Cost per unit at time of sale
  productCost: decimal("productCost", { precision: 15, scale: 2 }).notNull(), // Base product cost
  freightCostAllocated: decimal("freightCostAllocated", { precision: 15, scale: 2 }).default("0"), // Allocated freight/delivery cost
  customsCostAllocated: decimal("customsCostAllocated", { precision: 15, scale: 2 }).default("0"), // Allocated customs/duties
  insuranceCostAllocated: decimal("insuranceCostAllocated", { precision: 15, scale: 2 }).default("0"), // Allocated insurance
  otherCostAllocated: decimal("otherCostAllocated", { precision: 15, scale: 2 }).default("0"), // Other allocated costs
  totalCOGS: decimal("totalCOGS", { precision: 15, scale: 2 }).notNull(), // Total COGS = productCost + all allocated costs
  revenueAmount: decimal("revenueAmount", { precision: 15, scale: 2 }).notNull(), // Revenue from this sale
  grossProfit: decimal("grossProfit", { precision: 15, scale: 2 }).notNull(), // Revenue - COGS
  costingMethod: mysqlEnum("costingMethod", ["fifo", "lifo", "average", "specific"]).default("fifo").notNull(),
  notes: text("notes"),
  transactionDate: timestamp("transactionDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CogsTransaction = typeof cogsTransactions.$inferSelect;
export type InsertCogsTransaction = typeof cogsTransactions.$inferInsert;

// Freight cost allocation to products
export const freightCostAllocations = mysqlTable("freightCostAllocations", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId"),
  shipmentId: int("shipmentId"),
  productId: int("productId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  freightCost: decimal("freightCost", { precision: 15, scale: 2 }).notNull(),
  customsDuties: decimal("customsDuties", { precision: 15, scale: 2 }).default("0"),
  insuranceCost: decimal("insuranceCost", { precision: 15, scale: 2 }).default("0"),
  handlingFees: decimal("handlingFees", { precision: 15, scale: 2 }).default("0"),
  totalAllocatedCost: decimal("totalAllocatedCost", { precision: 15, scale: 2 }).notNull(),
  allocationMethod: mysqlEnum("allocationMethod", ["weight", "volume", "quantity", "value", "manual"]).default("quantity").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FreightCostAllocation = typeof freightCostAllocations.$inferSelect;
export type InsertFreightCostAllocation = typeof freightCostAllocations.$inferInsert;

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
  companyId: int("companyId").references(() => companies.id),
  storeDomain: varchar("storeDomain", { length: 255 }).notNull().unique(), // mystore.myshopify.com
  storeName: varchar("storeName", { length: 255 }),
  accessToken: text("accessToken"), // Encrypted in production
  tokenExpiresAt: timestamp("tokenExpiresAt"), // When the access token expires
  clientId: varchar("clientId", { length: 255 }), // OAuth client ID for token refresh
  clientSecret: varchar("clientSecret", { length: 255 }), // OAuth client secret for token refresh
  apiVersion: varchar("apiVersion", { length: 16 }).default("2025-01"),
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
  // Shopify InventoryItem id for this variant. Inventory-level webhooks/REST
  // report inventory_item_id (NOT the variant id), so this is what inventory
  // sync matches against. Backfilled lazily from the Shopify API during sync.
  shopifyInventoryItemId: varchar("shopifyInventoryItemId", { length: 64 }),
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
  companyId: int("companyId").references(() => companies.id),
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
  totalCOGS: decimal("totalCOGS", { precision: 15, scale: 2 }), // Total Cost of Goods Sold for order
  grossProfit: decimal("grossProfit", { precision: 15, scale: 2 }), // Revenue - COGS
  grossProfitMargin: decimal("grossProfitMargin", { precision: 5, scale: 2 }), // (Gross Profit / Revenue) * 100
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
  salesOrderId: int("salesOrderId").notNull().references(() => salesOrders.id),
  productId: int("productId").notNull(),
  shopifyLineItemId: varchar("shopifyLineItemId", { length: 64 }),
  sku: varchar("sku", { length: 64 }),
  name: varchar("name", { length: 255 }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  fulfilledQuantity: decimal("fulfilledQuantity", { precision: 15, scale: 4 }).default("0"),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
  totalPrice: decimal("totalPrice", { precision: 15, scale: 2 }).notNull(),
  costOfGoodsSold: decimal("costOfGoodsSold", { precision: 15, scale: 2 }), // Total COGS for this line
  grossProfit: decimal("grossProfit", { precision: 15, scale: 2 }), // totalPrice - COGS
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
  companyId: int("companyId").references(() => companies.id),
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


// ============================================
// BACKGROUND TASKS (generic async job tracking)
// ============================================
// Long-running, user-initiated operations (e.g. Data Room ↔ Google Drive sync)
// run detached from the originating HTTP request and record their progress here.
// The client polls this table via a global provider so in-flight work is visible
// anywhere in the app and survives navigating away from the page that started it.
export const backgroundTasks = mysqlTable("background_tasks", {
  id: varchar("id", { length: 36 }).primaryKey(), // uuid, generated app-side
  userId: int("userId").notNull(),                // owner — tasks are scoped per user
  type: varchar("type", { length: 64 }).notNull(),// e.g. "data_room_drive_sync"
  title: varchar("title", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  status: mysqlEnum("status", ["queued", "running", "success", "error", "cancelled"]).default("queued").notNull(),
  progress: int("progress").default(0).notNull(),  // 0..100; indeterminate while total is 0
  processed: int("processed").default(0).notNull(),
  total: int("total").default(0).notNull(),
  message: varchar("message", { length: 500 }),    // latest human-readable status line
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  link: varchar("link", { length: 512 }),          // deep link to view the result
  result: json("result"),
  errorMessage: text("errorMessage"),
  cancelRequested: boolean("cancelRequested").default(false).notNull(),
  dismissedAt: timestamp("dismissedAt"),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BackgroundTask = typeof backgroundTasks.$inferSelect;
export type InsertBackgroundTask = typeof backgroundTasks.$inferInsert;


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
  companyId: int("companyId").references(() => companies.id),
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
  
  // Email capture gate
  requiresEmail: boolean("requiresEmail").default(false),

  // Customization
  logoUrl: varchar("logoUrl", { length: 512 }),
  brandColor: varchar("brandColor", { length: 7 }), // Hex color
  welcomeMessage: text("welcomeMessage"),

  // Custom branding
  brandingLogo: text("brandingLogo"),
  brandingColor: varchar("brandingColor", { length: 7 }), // hex color
  brandingCompanyName: varchar("brandingCompanyName", { length: 256 }),
  
  // Settings
  allowDownload: boolean("allowDownload").default(true).notNull(),
  allowPrint: boolean("allowPrint").default(true).notNull(),
  expiresAt: timestamp("expiresAt"),
  watermarkEnabled: boolean("watermarkEnabled").default(false).notNull(),
  watermarkText: varchar("watermarkText", { length: 255 }), // Custom watermark text, defaults to visitor email
  
  // Google Drive sync
  googleDriveFolderId: varchar("googleDriveFolderId", { length: 255 }),
  lastSyncedAt: timestamp("lastSyncedAt"),

  // Live current-financials page (investor-facing, JSON-driven, distinct from
  // the frozen projections snapshot). When enabled, the data room exposes
  // `/dr/:code/financials` with a trimmed set of metrics (cash, last-3-mo
  // revenue/burn, runway, AR total).
  showLiveFinancials: boolean("showLiveFinancials").default(false).notNull(),
  liveFinancialsIncludeAr: boolean("liveFinancialsIncludeAr").default(false).notNull(),

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

  // Role-wide visibility for logged-in app-role users (e.g. contractors).
  // JSON array of app roles that may see this folder without an individual
  // grant. null/empty = not visible to any role by default. Per-user grants
  // (contractorFolderGrants) layer on top of this.
  visibleToRoles: json("visibleToRoles"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomFolder = typeof dataRoomFolders.$inferSelect;
export type InsertDataRoomFolder = typeof dataRoomFolders.$inferInsert;

// Per-user data-room folder grants for logged-in app-role users (contractors).
// Unlike dataRoomInvitations (email/visitor based), these attach folder access
// directly to a users row. mode 'allow' grants the folder; 'restrict' hides a
// folder the user would otherwise see via visibleToRoles.
export const contractorFolderGrants = mysqlTable("contractor_folder_grants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  folderId: int("folderId").notNull(),
  mode: mysqlEnum("mode", ["allow", "restrict"]).default("allow").notNull(),
  grantedBy: int("grantedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userFolderIdx: uniqueIndex("contractor_folder_grants_user_folder_idx").on(table.userId, table.folderId),
}));

export type ContractorFolderGrant = typeof contractorFolderGrants.$inferSelect;
export type InsertContractorFolderGrant = typeof contractorFolderGrants.$inferInsert;

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

  // Engagement scoring
  engagementScore: int("engagementScore").default(0),
  pagesViewed: int("pagesViewed").default(0),
  
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

// Document Page Views - detailed page-level tracking
export const documentPageViews = mysqlTable("document_page_views", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  visitorId: int("visitorId").notNull(),
  viewSessionId: int("viewSessionId"), // Links to documentViews for session grouping
  linkId: int("linkId"),

  // Page details
  pageNumber: int("pageNumber").notNull(),
  pageLabel: varchar("pageLabel", { length: 100 }), // For named pages (e.g., "Executive Summary")

  // Time tracking (in milliseconds for precision)
  enterTime: timestamp("enterTime").defaultNow().notNull(),
  exitTime: timestamp("exitTime"),
  durationMs: int("durationMs").default(0), // Time spent on this page in milliseconds

  // Engagement signals
  scrollDepth: int("scrollDepth"), // 0-100 percentage of page scrolled
  mouseMovements: int("mouseMovements").default(0), // Number of mouse movements (engagement indicator)
  clicks: int("clicks").default(0), // Number of clicks on the page
  zoomLevel: int("zoomLevel").default(100), // Document zoom percentage

  // Context
  deviceType: varchar("deviceType", { length: 32 }), // desktop, mobile, tablet
  screenWidth: int("screenWidth"),
  screenHeight: int("screenHeight"),
  viewportWidth: int("viewportWidth"),
  viewportHeight: int("viewportHeight"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentPageView = typeof documentPageViews.$inferSelect;
export type InsertDocumentPageView = typeof documentPageViews.$inferInsert;

// Data Room Google Drive Sync Configuration
export const dataRoomDriveSyncConfig = mysqlTable("data_room_drive_sync_config", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull().unique(),

  // Google Drive folder configuration
  googleDriveFolderId: varchar("googleDriveFolderId", { length: 255 }).notNull(),
  googleDriveFolderName: varchar("googleDriveFolderName", { length: 255 }),
  googleDriveFolderUrl: varchar("googleDriveFolderUrl", { length: 512 }),

  // Sync settings
  syncEnabled: boolean("syncEnabled").default(true).notNull(),
  syncFrequencyMinutes: int("syncFrequencyMinutes").default(60), // Auto-sync interval
  syncMode: mysqlEnum("syncMode", ["one_way_import", "one_way_export", "bidirectional"]).default("one_way_import").notNull(),
  syncSubfolders: boolean("syncSubfolders").default(true).notNull(), // Include subfolders

  // File filters
  includeFileTypes: text("includeFileTypes"), // JSON array of extensions to include (null = all)
  excludeFileTypes: text("excludeFileTypes"), // JSON array of extensions to exclude
  maxFileSizeMb: int("maxFileSizeMb").default(100), // Max file size to sync

  // Mapping
  folderMapping: text("folderMapping"), // JSON mapping of Drive folder IDs to data room folder IDs

  // Sync status
  lastSyncAt: timestamp("lastSyncAt"),
  lastSyncStatus: mysqlEnum("lastSyncStatus", ["success", "partial", "failed", "in_progress"]),
  lastSyncError: text("lastSyncError"),
  lastSyncFilesAdded: int("lastSyncFilesAdded").default(0),
  lastSyncFilesUpdated: int("lastSyncFilesUpdated").default(0),
  lastSyncFilesRemoved: int("lastSyncFilesRemoved").default(0),

  // OAuth user for sync (which user's credentials to use)
  syncUserId: int("syncUserId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomDriveSyncConfig = typeof dataRoomDriveSyncConfig.$inferSelect;
export type InsertDataRoomDriveSyncConfig = typeof dataRoomDriveSyncConfig.$inferInsert;

// Data Room Drive Sync Logs - history of sync operations
export const dataRoomDriveSyncLogs = mysqlTable("data_room_drive_sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  syncConfigId: int("syncConfigId").notNull(),

  // Sync details
  syncType: mysqlEnum("syncType", ["manual", "scheduled", "webhook"]).notNull(),
  status: mysqlEnum("status", ["started", "in_progress", "completed", "failed", "cancelled"]).default("started").notNull(),

  // Results
  filesScanned: int("filesScanned").default(0),
  filesAdded: int("filesAdded").default(0),
  filesUpdated: int("filesUpdated").default(0),
  filesRemoved: int("filesRemoved").default(0),
  filesSkipped: int("filesSkipped").default(0),
  foldersCreated: int("foldersCreated").default(0),

  // Errors
  errors: text("errors"), // JSON array of error messages
  warnings: text("warnings"), // JSON array of warnings

  // Timing
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),

  // Triggered by
  triggeredBy: int("triggeredBy"), // User ID if manual

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DataRoomDriveSyncLog = typeof dataRoomDriveSyncLogs.$inferSelect;
export type InsertDataRoomDriveSyncLog = typeof dataRoomDriveSyncLogs.$inferInsert;

// Data Room Email Access Settings - manage who can access by email
export const dataRoomEmailAccessRules = mysqlTable("data_room_email_access_rules", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),

  // Rule type
  ruleType: mysqlEnum("ruleType", ["allow_email", "allow_domain", "block_email", "block_domain"]).notNull(),

  // Pattern to match
  emailPattern: varchar("emailPattern", { length: 320 }).notNull(), // Email or domain pattern

  // Permissions when matched
  allowDownload: boolean("allowDownload").default(true),
  allowPrint: boolean("allowPrint").default(true),
  maxViews: int("maxViews"), // null = unlimited
  expiresAt: timestamp("expiresAt"),

  // Auto-actions
  requireNdaSignature: boolean("requireNdaSignature").default(true),
  autoApprove: boolean("autoApprove").default(false), // Auto-approve matching visitors

  // Notifications
  notifyOnAccess: boolean("notifyOnAccess").default(true),
  notifyEmail: varchar("notifyEmail", { length: 320 }), // Where to send notifications

  isActive: boolean("isActive").default(true).notNull(),
  priority: int("priority").default(0), // Higher priority rules evaluated first

  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomEmailAccessRule = typeof dataRoomEmailAccessRules.$inferSelect;
export type InsertDataRoomEmailAccessRule = typeof dataRoomEmailAccessRules.$inferInsert;

// Data Room Visitor Sessions - detailed session tracking
export const dataRoomVisitorSessions = mysqlTable("data_room_visitor_sessions", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  visitorId: int("visitorId").notNull(),
  linkId: int("linkId"),

  // Session timing
  sessionStartAt: timestamp("sessionStartAt").defaultNow().notNull(),
  sessionEndAt: timestamp("sessionEndAt"),
  totalDurationMs: int("totalDurationMs").default(0),
  activeDurationMs: int("activeDurationMs").default(0), // Time with active engagement
  idleDurationMs: int("idleDurationMs").default(0), // Time idle

  // Session activity
  documentsViewed: int("documentsViewed").default(0),
  pagesViewed: int("pagesViewed").default(0),
  totalScrollDistance: int("totalScrollDistance").default(0), // Pixels scrolled
  totalClicks: int("totalClicks").default(0),

  // Downloads/prints during session
  downloadsCount: int("downloadsCount").default(0),
  printsCount: int("printsCount").default(0),

  // Device/browser info
  deviceType: varchar("deviceType", { length: 32 }),
  browser: varchar("browser", { length: 64 }),
  browserVersion: varchar("browserVersion", { length: 32 }),
  os: varchar("os", { length: 64 }),
  osVersion: varchar("osVersion", { length: 32 }),
  screenResolution: varchar("screenResolution", { length: 20 }),

  // Location (from IP)
  ipAddress: varchar("ipAddress", { length: 45 }),
  country: varchar("country", { length: 64 }),
  region: varchar("region", { length: 64 }),
  city: varchar("city", { length: 64 }),
  timezone: varchar("timezone", { length: 64 }),

  // Referrer
  referrer: varchar("referrer", { length: 512 }),
  utmSource: varchar("utmSource", { length: 128 }),
  utmMedium: varchar("utmMedium", { length: 128 }),
  utmCampaign: varchar("utmCampaign", { length: 128 }),

  // Session metadata
  sessionToken: varchar("sessionToken", { length: 128 }).unique(), // For tracking across page loads
  isActive: boolean("isActive").default(true).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomVisitorSession = typeof dataRoomVisitorSessions.$inferSelect;
export type InsertDataRoomVisitorSession = typeof dataRoomVisitorSessions.$inferInsert;

// ============================================
// DUE DILIGENCE TEMPLATES
// ============================================

export const dueDiligenceTemplates = mysqlTable("dueDiligenceTemplates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["fundraising", "ma", "full", "series_b"]).default("full").notNull(),
  isPublic: boolean("isPublic").default(false).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DueDiligenceTemplate = typeof dueDiligenceTemplates.$inferSelect;
export type InsertDueDiligenceTemplate = typeof dueDiligenceTemplates.$inferInsert;

export const dueDiligenceCategories = mysqlTable("dueDiligenceCategories", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DueDiligenceCategory = typeof dueDiligenceCategories.$inferSelect;
export type InsertDueDiligenceCategory = typeof dueDiligenceCategories.$inferInsert;

export const dueDiligenceItems = mysqlTable("dueDiligenceItems", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull(),
  categoryId: int("categoryId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  required: boolean("required").default(true).notNull(),
  requirement: mysqlEnum("requirement", ["required", "optional", "conditional"]).default("required").notNull(),
  matchKeywords: text("matchKeywords"),
  matchFileTypes: text("matchFileTypes"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DueDiligenceItem = typeof dueDiligenceItems.$inferSelect;
export type InsertDueDiligenceItem = typeof dueDiligenceItems.$inferInsert;

export const dataRoomChecklists = mysqlTable("dataRoomChecklists", {
  id: int("id").autoincrement().primaryKey(),
  dataRoomId: int("dataRoomId").notNull(),
  templateId: int("templateId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdBy: int("createdBy"),
  totalItems: int("totalItems").default(0).notNull(),
  completedItems: int("completedItems").default(0).notNull(),
  partialItems: int("partialItems").default(0).notNull(),
  missingItems: int("missingItems").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomChecklist = typeof dataRoomChecklists.$inferSelect;
export type InsertDataRoomChecklist = typeof dataRoomChecklists.$inferInsert;

export const dataRoomChecklistItems = mysqlTable("dataRoomChecklistItems", {
  id: int("id").autoincrement().primaryKey(),
  checklistId: int("checklistId").notNull(),
  dataRoomId: int("dataRoomId").notNull(),
  categoryName: varchar("categoryName", { length: 255 }),
  itemName: varchar("itemName", { length: 255 }).notNull().$default(() => ''),
  itemDescription: text("itemDescription"),
  requirement: mysqlEnum("requirement", ["required", "optional", "conditional"]).default("required").notNull(),
  status: mysqlEnum("status", ["missing", "pending", "uploaded", "approved", "rejected", "waived", "not_applicable", "complete", "partial"]).default("missing").notNull(),
  matchKeywords: text("matchKeywords"),
  matchFileTypes: text("matchFileTypes"),
  linkedDocumentId: int("linkedDocumentId"),
  linkedDocumentIds: text("linkedDocumentIds"),
  linkedDocumentCount: int("linkedDocumentCount").default(0),
  sortOrder: int("sortOrder").default(0),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DataRoomChecklistItem = typeof dataRoomChecklistItems.$inferSelect;
export type InsertDataRoomChecklistItem = typeof dataRoomChecklistItems.$inferInsert;

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
    "create_customer",
    "create_crm_deal",
    "ingredient_rfq",
    "invoice_price_review",
    "concierge_errand"
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
    "quality_check",
    "ingredient_requote",
    "invoice_price_check"
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
  companyId: int("companyId").references(() => companies.id),
  rfqNumber: varchar("rfqNumber", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "partially_received", "all_received", "awarded", "cancelled", "expired"]).default("draft").notNull(),
  
  // Material details
  rawMaterialId: int("rawMaterialId"),
  ingredientId: int("ingredientId").references(() => recipeIngredients.id),
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

  // Bid leveling
  levelingSummary: text("levelingSummary"), // AI award-recommendation narrative comparing leveled bids
  leveledAt: timestamp("leveledAt"),

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

  // Bid leveling (scope-normalized comparison)
  leveledTotalCost: decimal("leveledTotalCost", { precision: 15, scale: 2 }), // Normalized total cost adjusted to a common scope baseline
  leveledRank: int("leveledRank"), // 1 = best leveled value
  scopeDeviations: text("scopeDeviations"), // JSON array of { requirement, finding, severity }
  leveledNotes: text("leveledNotes"), // AI rationale for the leveling adjustments on this quote
  leveledAt: timestamp("leveledAt"),
  
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
  source: mysqlEnum("source", ["iphone_bump", "whatsapp", "linkedin_scan", "business_card", "website", "referral", "event", "cold_outreach", "import", "manual", "fireflies", "b2brocket"]).default("manual").notNull(),
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
}, (table) => ({
  // Schema-level uniqueness guarantees. Multiple NULLs are allowed under
  // MySQL's UNIQUE semantics, so contacts without an identifier are fine.
  // Run crm.contacts.autoMergeDuplicates before migration 0035 if the
  // deployment has existing duplicates.
  emailUniq: uniqueIndex("crm_contacts_email_uniq").on(table.email),
  phoneUniq: uniqueIndex("crm_contacts_phone_uniq").on(table.phone),
  whatsappUniq: uniqueIndex("crm_contacts_whatsapp_uniq").on(table.whatsappNumber),
  linkedinUniq: uniqueIndex("crm_contacts_linkedin_uniq").on(table.linkedinUrl),
}));

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
  contactId: int("contactId").notNull().references(() => crmContacts.id),

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
  companyId: int("companyId").references(() => companies.id),
  pipelineId: int("pipelineId").notNull().references(() => crmPipelines.id),
  contactId: int("contactId").notNull().references(() => crmContacts.id),

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
  companyId: int("companyId").references(() => companies.id),
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
// MARKETING — Social media management, scheduling, engagement, campaign ROI
// ============================================

// Connected social accounts (handle per platform). Credentials are held by the
// provider aggregator (Ayrshare profile) — we only store a reference.
export const socialAccounts = mysqlTable("social_accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  platform: mysqlEnum("platform", ["linkedin", "twitter", "facebook", "instagram", "tiktok", "youtube", "threads"]).notNull(),
  handle: varchar("handle", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  avatarUrl: text("avatarUrl"),
  provider: mysqlEnum("provider", ["ayrshare", "direct", "manual"]).default("ayrshare").notNull(),
  providerProfileKey: varchar("providerProfileKey", { length: 255 }),
  status: mysqlEnum("status", ["active", "disconnected", "error"]).default("active").notNull(),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertSocialAccount = typeof socialAccounts.$inferInsert;

// A marketing campaign groups posts and (optionally) paid spend for ROI.
export const marketingCampaigns = mysqlTable("marketing_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  goal: mysqlEnum("goal", ["awareness", "engagement", "leads", "conversions", "retention"]).default("engagement").notNull(),
  status: mysqlEnum("status", ["draft", "active", "paused", "completed", "archived"]).default("draft").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  budgetAmount: decimal("budgetAmount", { precision: 15, scale: 2 }),
  spendAmount: decimal("spendAmount", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  targetTags: text("targetTags"), // JSON array of CRM tag IDs
  utmSource: varchar("utmSource", { length: 128 }),
  utmMedium: varchar("utmMedium", { length: 128 }),
  utmCampaign: varchar("utmCampaign", { length: 128 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = typeof marketingCampaigns.$inferInsert;

// Scheduled or published social posts (one logical post may fan out to many
// platforms; we record one row per logical post and track per-platform external
// IDs on the post so engagement/metrics can be keyed back correctly).
export const marketingPosts = mysqlTable("marketing_posts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  campaignId: int("campaignId").references(() => marketingCampaigns.id),
  title: varchar("title", { length: 255 }),
  body: text("body").notNull(),
  mediaUrls: text("mediaUrls"), // JSON array of URLs
  platforms: text("platforms").notNull(), // JSON array of platform enum values
  accountIds: text("accountIds"), // JSON array of social_accounts.id
  status: mysqlEnum("status", ["draft", "scheduled", "queued", "posted", "failed", "cancelled"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  postedAt: timestamp("postedAt"),
  externalIds: text("externalIds"), // JSON object: { [platform]: { id, permalink } }
  failureReason: text("failureReason"),
  aiGenerated: boolean("aiGenerated").default(false),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingPost = typeof marketingPosts.$inferSelect;
export type InsertMarketingPost = typeof marketingPosts.$inferInsert;

// Inbound engagement — comments, likes, shares, mentions, DMs pulled from each
// platform. Sentiment scored async. Optional link to a CRM contact when the
// author handle can be matched.
export const marketingEngagements = mysqlTable("marketing_engagements", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").references(() => marketingPosts.id),
  platform: mysqlEnum("platform", ["linkedin", "twitter", "facebook", "instagram", "tiktok", "youtube", "threads"]).notNull(),
  externalId: varchar("externalId", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["like", "comment", "share", "mention", "dm", "reaction"]).notNull(),
  authorHandle: varchar("authorHandle", { length: 255 }),
  authorName: varchar("authorName", { length: 255 }),
  authorAvatarUrl: text("authorAvatarUrl"),
  body: text("body"),
  permalink: text("permalink"),
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative", "unknown"]).default("unknown"),
  contactId: int("contactId").references(() => crmContacts.id),
  repliedAt: timestamp("repliedAt"),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  occurredAt: timestamp("occurredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketingEngagement = typeof marketingEngagements.$inferSelect;
export type InsertMarketingEngagement = typeof marketingEngagements.$inferInsert;

// Time-series metrics per post per platform (impressions, reach, clicks, etc.)
export const marketingMetrics = mysqlTable("marketing_metrics", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull().references(() => marketingPosts.id),
  platform: mysqlEnum("platform", ["linkedin", "twitter", "facebook", "instagram", "tiktok", "youtube", "threads"]).notNull(),
  impressions: int("impressions").default(0),
  reach: int("reach").default(0),
  clicks: int("clicks").default(0),
  likes: int("likes").default(0),
  comments: int("comments").default(0),
  shares: int("shares").default(0),
  saves: int("saves").default(0),
  videoViews: int("videoViews").default(0),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type MarketingMetric = typeof marketingMetrics.$inferSelect;
export type InsertMarketingMetric = typeof marketingMetrics.$inferInsert;

// ============================================
// MARKETING — Influencer CRM (creator relationships, outreach, deliverables)
// ============================================

// Influencer / creator profile. May optionally be linked to a CRM contact when
// the same person already exists in the contact graph.
export const influencers = mysqlTable("influencers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  primaryHandle: varchar("primaryHandle", { length: 255 }),
  primaryPlatform: mysqlEnum("primaryPlatform", ["linkedin", "twitter", "facebook", "instagram", "tiktok", "youtube", "threads"]),
  // JSON map of { platform: { handle, url, followers } }
  handles: text("handles"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  agentName: varchar("agentName", { length: 255 }),
  agentEmail: varchar("agentEmail", { length: 320 }),
  websiteUrl: text("websiteUrl"),
  avatarUrl: text("avatarUrl"),
  // Reach & quality
  followerCount: int("followerCount").default(0),
  engagementRatePct: decimal("engagementRatePct", { precision: 6, scale: 3 }), // e.g. 3.475 for 3.475%
  avgViews: int("avgViews"),
  // Categorization
  tier: mysqlEnum("tier", ["nano", "micro", "mid", "macro", "mega"]),
  niche: varchar("niche", { length: 128 }),
  tags: text("tags"), // JSON array
  language: varchar("language", { length: 16 }),
  country: varchar("country", { length: 64 }),
  city: varchar("city", { length: 128 }),
  // Commercials
  rateCard: text("rateCard"), // JSON: { post: 500, story: 200, reel: 1500, ... }
  currency: varchar("currency", { length: 3 }).default("USD"),
  preferredPaymentMethod: varchar("preferredPaymentMethod", { length: 64 }),
  // Pipeline
  status: mysqlEnum("status", [
    "prospect",
    "contacted",
    "negotiating",
    "agreed",
    "active",
    "completed",
    "paused",
    "blacklisted",
  ]).default("prospect").notNull(),
  leadSource: mysqlEnum("leadSource", ["search", "inbound", "referral", "agency", "engagement_funnel", "import", "manual"]).default("manual"),
  lastOutreachAt: timestamp("lastOutreachAt"),
  notes: text("notes"),
  // Cross-links
  crmContactId: int("crmContactId").references(() => crmContacts.id),
  assignedTo: int("assignedTo"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Influencer = typeof influencers.$inferSelect;
export type InsertInfluencer = typeof influencers.$inferInsert;

// Many-to-many between influencers and marketing campaigns. One row per
// influencer's involvement in a single campaign, with the commercial terms
// captured at the participation level (not the influencer level) so the same
// creator can have different deals across campaigns.
export const influencerCampaignParticipations = mysqlTable("influencer_campaign_participations", {
  id: int("id").autoincrement().primaryKey(),
  influencerId: int("influencerId").notNull().references(() => influencers.id),
  campaignId: int("campaignId").notNull().references(() => marketingCampaigns.id),
  status: mysqlEnum("status", [
    "invited",
    "negotiating",
    "agreed",
    "in_progress",
    "completed",
    "cancelled",
  ]).default("invited").notNull(),
  agreedFee: decimal("agreedFee", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "invoiced", "paid", "refunded"]).default("pending"),
  productGifted: boolean("productGifted").default(false),
  briefUrl: text("briefUrl"),
  contractUrl: text("contractUrl"),
  trackingCode: varchar("trackingCode", { length: 64 }), // discount/UTM tag
  notes: text("notes"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InfluencerCampaignParticipation = typeof influencerCampaignParticipations.$inferSelect;
export type InsertInfluencerCampaignParticipation = typeof influencerCampaignParticipations.$inferInsert;

// Deliverables produced by an influencer for a campaign. May reference an
// existing marketing_post when the deliverable was scheduled through the hub,
// or stand alone (creator-published content we just track externally).
export const influencerDeliverables = mysqlTable("influencer_deliverables", {
  id: int("id").autoincrement().primaryKey(),
  participationId: int("participationId").notNull().references(() => influencerCampaignParticipations.id),
  type: mysqlEnum("type", ["post", "story", "reel", "video", "live", "blog", "podcast"]).notNull(),
  platform: mysqlEnum("platform", ["linkedin", "twitter", "facebook", "instagram", "tiktok", "youtube", "threads"]).notNull(),
  status: mysqlEnum("status", ["planned", "submitted", "approved", "revision_requested", "published", "rejected"]).default("planned").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  postUrl: text("postUrl"),
  marketingPostId: int("marketingPostId").references(() => marketingPosts.id),
  // Self-reported / scraped metrics
  impressions: int("impressions").default(0),
  views: int("views").default(0),
  likes: int("likes").default(0),
  comments: int("comments").default(0),
  shares: int("shares").default(0),
  saves: int("saves").default(0),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InfluencerDeliverable = typeof influencerDeliverables.$inferSelect;
export type InsertInfluencerDeliverable = typeof influencerDeliverables.$inferInsert;

// Outreach activity log — separate from generic CRM interactions because the
// fields are different (touchpoint, channel, response sentiment).
export const influencerOutreach = mysqlTable("influencer_outreach", {
  id: int("id").autoincrement().primaryKey(),
  influencerId: int("influencerId").notNull().references(() => influencers.id),
  campaignId: int("campaignId").references(() => marketingCampaigns.id),
  channel: mysqlEnum("channel", ["email", "dm", "phone", "in_person", "agent", "platform_message"]).notNull(),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
  subject: varchar("subject", { length: 255 }),
  body: text("body"),
  response: mysqlEnum("response", ["pending", "interested", "not_interested", "no_response", "negotiating"]).default("pending"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
  createdBy: int("createdBy"),
});

export type InfluencerOutreach = typeof influencerOutreach.$inferSelect;
export type InsertInfluencerOutreach = typeof influencerOutreach.$inferInsert;












// ============================================
// INVENTORY COSTING & COGS TRACKING MODULE
// ============================================

// Configuration for how each product should be costed (FIFO, LIFO, weighted average)
export const inventoryCostingConfig = mysqlTable("inventoryCostingConfig", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  productId: int("productId").notNull(),
  costingMethod: mysqlEnum("costingMethod", ["fifo", "lifo", "weighted_average"]).default("weighted_average").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  effectiveDate: timestamp("effectiveDate").defaultNow().notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryCostingConfig = typeof inventoryCostingConfig.$inferSelect;
export type InsertInventoryCostingConfig = typeof inventoryCostingConfig.$inferInsert;

// Inventory cost layers - tracks individual purchase lots for FIFO/LIFO
export const inventoryCostLayers = mysqlTable("inventoryCostLayers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId"),
  purchaseOrderId: int("purchaseOrderId"),
  lotId: int("lotId"),
  layerDate: timestamp("layerDate").notNull(),
  originalQuantity: decimal("originalQuantity", { precision: 15, scale: 4 }).notNull(),
  remainingQuantity: decimal("remainingQuantity", { precision: 15, scale: 4 }).notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 4 }).notNull(),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["active", "depleted", "adjusted"]).default("active").notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryCostLayer = typeof inventoryCostLayers.$inferSelect;
export type InsertInventoryCostLayer = typeof inventoryCostLayers.$inferInsert;

// COGS records - tracks cost of goods sold per sale/shipment
export const cogsRecords = mysqlTable("cogsRecords", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId"),
  orderId: int("orderId"),
  salesOrderLineId: int("salesOrderLineId"),
  costingMethod: mysqlEnum("costingMethod", ["fifo", "lifo", "weighted_average"]).notNull(),
  quantitySold: decimal("quantitySold", { precision: 15, scale: 4 }).notNull(),
  unitCogs: decimal("unitCogs", { precision: 15, scale: 4 }).notNull(),
  totalCogs: decimal("totalCogs", { precision: 15, scale: 2 }).notNull(),
  unitRevenue: decimal("unitRevenue", { precision: 15, scale: 2 }),
  totalRevenue: decimal("totalRevenue", { precision: 15, scale: 2 }),
  grossMargin: decimal("grossMargin", { precision: 15, scale: 2 }),
  grossMarginPercent: decimal("grossMarginPercent", { precision: 8, scale: 4 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  periodDate: timestamp("periodDate").notNull(),
  layerBreakdown: text("layerBreakdown"),
  notes: text("notes"),
  calculatedBy: int("calculatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CogsRecord = typeof cogsRecords.$inferSelect;
export type InsertCogsRecord = typeof cogsRecords.$inferInsert;

// COGS summary by period - aggregated for reporting
export const cogsPeriodSummary = mysqlTable("cogsPeriodSummary", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  productId: int("productId"),
  periodType: mysqlEnum("periodType", ["daily", "weekly", "monthly", "quarterly", "yearly"]).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  totalQuantitySold: decimal("totalQuantitySold", { precision: 15, scale: 4 }).notNull(),
  totalCogs: decimal("totalCogs", { precision: 15, scale: 2 }).notNull(),
  totalRevenue: decimal("totalRevenue", { precision: 15, scale: 2 }),
  averageUnitCogs: decimal("averageUnitCogs", { precision: 15, scale: 4 }),
  grossMargin: decimal("grossMargin", { precision: 15, scale: 2 }),
  grossMarginPercent: decimal("grossMarginPercent", { precision: 8, scale: 4 }),
  costingMethod: mysqlEnum("costingMethod", ["fifo", "lifo", "weighted_average"]),
  beginningInventoryValue: decimal("beginningInventoryValue", { precision: 15, scale: 2 }),
  purchasesValue: decimal("purchasesValue", { precision: 15, scale: 2 }),
  endingInventoryValue: decimal("endingInventoryValue", { precision: 15, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uniquePeriodSummary: uniqueIndex("idx_cogs_period_unique").on(
    table.companyId,
    table.productId,
    table.periodType,
    table.periodStart,
    table.periodEnd
  ),
}));

export type CogsPeriodSummary = typeof cogsPeriodSummary.$inferSelect;
export type InsertCogsPeriodSummary = typeof cogsPeriodSummary.$inferInsert;

// ============================================
// AUTOMATED VENDOR NEGOTIATIONS
// ============================================

export const vendorNegotiations = mysqlTable("vendorNegotiations", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  vendorId: int("vendorId").notNull(),
  negotiationNumber: varchar("negotiationNumber", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["price_reduction", "volume_discount", "payment_terms", "lead_time", "contract_renewal", "new_contract"]).notNull(),
  status: mysqlEnum("status", ["draft", "analyzing", "ready", "in_progress", "counter_offered", "accepted", "rejected", "expired"]).default("draft").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  productIds: text("productIds"),
  rawMaterialIds: text("rawMaterialIds"),
  currentUnitPrice: decimal("currentUnitPrice", { precision: 15, scale: 4 }),
  currentPaymentTerms: int("currentPaymentTerms"),
  currentLeadTimeDays: int("currentLeadTimeDays"),
  currentMinOrderAmount: decimal("currentMinOrderAmount", { precision: 15, scale: 2 }),
  currentAnnualVolume: decimal("currentAnnualVolume", { precision: 15, scale: 2 }),
  targetUnitPrice: decimal("targetUnitPrice", { precision: 15, scale: 4 }),
  targetPaymentTerms: int("targetPaymentTerms"),
  targetLeadTimeDays: int("targetLeadTimeDays"),
  targetMinOrderAmount: decimal("targetMinOrderAmount", { precision: 15, scale: 2 }),
  targetAnnualVolume: decimal("targetAnnualVolume", { precision: 15, scale: 2 }),
  agreedUnitPrice: decimal("agreedUnitPrice", { precision: 15, scale: 4 }),
  agreedPaymentTerms: int("agreedPaymentTerms"),
  agreedLeadTimeDays: int("agreedLeadTimeDays"),
  agreedMinOrderAmount: decimal("agreedMinOrderAmount", { precision: 15, scale: 2 }),
  agreedAnnualVolume: decimal("agreedAnnualVolume", { precision: 15, scale: 2 }),
  aiAnalysis: text("aiAnalysis"),
  aiStrategy: text("aiStrategy"),
  aiConfidenceScore: decimal("aiConfidenceScore", { precision: 5, scale: 2 }),
  estimatedSavings: decimal("estimatedSavings", { precision: 15, scale: 2 }),
  estimatedSavingsPercent: decimal("estimatedSavingsPercent", { precision: 8, scale: 4 }),
  lastEmailSentAt: timestamp("lastEmailSentAt"),
  lastResponseAt: timestamp("lastResponseAt"),
  negotiationRounds: int("negotiationRounds").default(0),
  maxRounds: int("maxRounds").default(5),
  expiresAt: timestamp("expiresAt"),
  completedAt: timestamp("completedAt"),
  initiatedBy: int("initiatedBy"),
  assignedTo: int("assignedTo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VendorNegotiation = typeof vendorNegotiations.$inferSelect;
export type InsertVendorNegotiation = typeof vendorNegotiations.$inferInsert;

export const negotiationRounds = mysqlTable("negotiationRounds", {
  id: int("id").autoincrement().primaryKey(),
  negotiationId: int("negotiationId").notNull(),
  roundNumber: int("roundNumber").notNull(),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).notNull(),
  messageType: mysqlEnum("messageType", ["initial_offer", "counter_offer", "acceptance", "rejection", "info_request", "final_offer"]).notNull(),
  proposedUnitPrice: decimal("proposedUnitPrice", { precision: 15, scale: 4 }),
  proposedPaymentTerms: int("proposedPaymentTerms"),
  proposedLeadTimeDays: int("proposedLeadTimeDays"),
  proposedMinOrderAmount: decimal("proposedMinOrderAmount", { precision: 15, scale: 2 }),
  proposedVolume: decimal("proposedVolume", { precision: 15, scale: 2 }),
  messageContent: text("messageContent"),
  aiGeneratedDraft: text("aiGeneratedDraft"),
  aiReasoning: text("aiReasoning"),
  sentAt: timestamp("sentAt"),
  receivedAt: timestamp("receivedAt"),
  sentBy: int("sentBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uniqueNegotiationRound: uniqueIndex("unique_negotiation_round").on(table.negotiationId, table.roundNumber),
}));

export type NegotiationRound = typeof negotiationRounds.$inferSelect;
export type InsertNegotiationRound = typeof negotiationRounds.$inferInsert;

export const vendorNegotiationProducts = mysqlTable("vendor_negotiation_products", {
  id: serial("id").primaryKey(),
  negotiationId: int("negotiation_id").notNull().references(() => vendorNegotiations.id),
  productId: int("product_id").references(() => products.id),
  rawMaterialId: int("raw_material_id").references(() => rawMaterials.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export type VendorNegotiationProduct = typeof vendorNegotiationProducts.$inferSelect;
export type InsertVendorNegotiationProduct = typeof vendorNegotiationProducts.$inferInsert;

// ============================================
// SAUDI INVESTMENT GRANT CHECKLIST
// ============================================

export const investmentGrantChecklists = mysqlTable("investment_grant_checklists", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["not_started", "in_progress", "completed", "on_hold"]).default("not_started").notNull(),
  totalCapex: decimal("totalCapex", { precision: 15, scale: 2 }),
  grantPercentage: decimal("grantPercentage", { precision: 5, scale: 2 }).default("35"),
  estimatedGrant: decimal("estimatedGrant", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("SAR"),
  startDate: timestamp("startDate"),
  targetCompletionDate: timestamp("targetCompletionDate"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InvestmentGrantChecklist = typeof investmentGrantChecklists.$inferSelect;
export type InsertInvestmentGrantChecklist = typeof investmentGrantChecklists.$inferInsert;

export const investmentGrantItems = mysqlTable("investment_grant_items", {
  id: int("id").autoincrement().primaryKey(),
  checklistId: int("checklistId").notNull(),
  category: mysqlEnum("category", [
    "entity_entry_setup",
    "project_definition",
    "capex_financials",
    "land_infrastructure",
    "jobs_localization",
    "incentive_application",
    "construction_equipment",
    "grant_disbursement",
  ]).notNull(),
  taskName: varchar("taskName", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["not_started", "in_progress", "completed", "blocked"]).default("not_started").notNull(),
  assigneeId: int("assigneeId"),
  startMonth: int("startMonth"),
  durationMonths: int("durationMonths"),
  completedDate: timestamp("completedDate"),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InvestmentGrantItem = typeof investmentGrantItems.$inferSelect;
export type InsertInvestmentGrantItem = typeof investmentGrantItems.$inferInsert;

// ============================================
// EDI (ELECTRONIC DATA INTERCHANGE) MODULE
// ============================================

// EDI Trading Partners - retail customers and their EDI configurations
export const ediTradingPartners = mysqlTable("edi_trading_partners", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  customerId: int("customerId"), // Link to existing customer record
  name: varchar("name", { length: 255 }).notNull(),
  partnerType: mysqlEnum("partnerType", ["retailer", "distributor", "wholesaler", "marketplace", "3pl"]).default("retailer").notNull(),
  // EDI identifiers
  isaId: varchar("isaId", { length: 15 }).notNull(), // ISA Interchange Sender/Receiver ID
  isaQualifier: varchar("isaQualifier", { length: 2 }).default("ZZ").notNull(), // ISA ID Qualifier (ZZ, 01, 08, etc.)
  gsId: varchar("gsId", { length: 15 }).notNull(), // GS Application Sender/Receiver Code
  // Connection settings
  connectionType: mysqlEnum("connectionType", ["as2", "sftp", "van", "api", "email"]).default("sftp").notNull(),
  connectionHost: varchar("connectionHost", { length: 512 }),
  connectionPort: int("connectionPort"),
  connectionUsername: varchar("connectionUsername", { length: 255 }),
  connectionPassword: text("connectionPassword"), // Encrypted
  connectionCertificate: text("connectionCertificate"),
  as2Id: varchar("as2Id", { length: 128 }),
  as2Url: varchar("as2Url", { length: 512 }),
  // Document capabilities
  supportedDocuments: text("supportedDocuments"), // JSON array of supported transaction set codes
  // Compliance requirements
  requiresFunctionalAck: boolean("requiresFunctionalAck").default(true),
  ackTimeoutHours: int("ackTimeoutHours").default(24),
  testMode: boolean("testMode").default(true), // Start in test mode
  // Contact info
  ediContactName: varchar("ediContactName", { length: 255 }),
  ediContactEmail: varchar("ediContactEmail", { length: 320 }),
  ediContactPhone: varchar("ediContactPhone", { length: 32 }),
  // Operational
  status: mysqlEnum("status", ["active", "inactive", "testing", "onboarding"]).default("onboarding").notNull(),
  notes: text("notes"),
  lastTransactionAt: timestamp("lastTransactionAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiTradingPartner = typeof ediTradingPartners.$inferSelect;
export type InsertEdiTradingPartner = typeof ediTradingPartners.$inferInsert;

// EDI Document Maps - mapping between EDI segments and internal fields
export const ediDocumentMaps = mysqlTable("edi_document_maps", {
  id: int("id").autoincrement().primaryKey(),
  tradingPartnerId: int("tradingPartnerId").notNull(),
  transactionSetCode: varchar("transactionSetCode", { length: 10 }).notNull(), // 850, 810, 856, 855, 997
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  version: varchar("version", { length: 20 }).default("004010").notNull(), // EDI version (e.g. 004010, 005010)
  mappingRules: text("mappingRules").notNull(), // JSON mapping configuration
  validationRules: text("validationRules"), // JSON validation rules
  transformTemplate: text("transformTemplate"), // Template for generating EDI output
  isActive: boolean("isActive").default(true),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiDocumentMap = typeof ediDocumentMaps.$inferSelect;
export type InsertEdiDocumentMap = typeof ediDocumentMaps.$inferInsert;

// EDI Transactions - individual EDI document exchange records
export const ediTransactions = mysqlTable("edi_transactions", {
  id: int("id").autoincrement().primaryKey(),
  tradingPartnerId: int("tradingPartnerId").notNull(),
  // Document identification
  transactionSetCode: varchar("transactionSetCode", { length: 10 }).notNull(), // 850, 810, 856, 855, 997
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  // ISA/GS/ST control numbers
  interchangeControlNumber: varchar("interchangeControlNumber", { length: 9 }),
  groupControlNumber: varchar("groupControlNumber", { length: 9 }),
  transactionSetControlNumber: varchar("transactionSetControlNumber", { length: 9 }),
  // Content
  rawContent: text("rawContent"), // Raw EDI content (X12 format)
  parsedData: text("parsedData"), // Parsed JSON representation
  // Linked ERP records
  orderId: int("orderId"),
  invoiceId: int("invoiceId"),
  shipmentId: int("shipmentId"),
  purchaseOrderNumber: varchar("purchaseOrderNumber", { length: 64 }),
  // Processing
  status: mysqlEnum("status", ["received", "parsing", "parsed", "validated", "processing", "processed", "error", "rejected", "acknowledged"]).default("received").notNull(),
  errorMessage: text("errorMessage"),
  errorDetails: text("errorDetails"), // JSON with detailed error info
  // Acknowledgment tracking
  ackRequired: boolean("ackRequired").default(false),
  ackStatus: mysqlEnum("ackStatus", ["pending", "sent", "received", "overdue"]),
  ackTransactionId: int("ackTransactionId"), // Link to the 997 acknowledgment
  ackSentAt: timestamp("ackSentAt"),
  ackReceivedAt: timestamp("ackReceivedAt"),
  // Timestamps
  processedAt: timestamp("processedAt"),
  processedBy: int("processedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiTransaction = typeof ediTransactions.$inferSelect;
export type InsertEdiTransaction = typeof ediTransactions.$inferInsert;

// EDI Transaction Items - line items within EDI transactions (PO lines, invoice lines, etc.)
export const ediTransactionItems = mysqlTable("edi_transaction_items", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  lineNumber: int("lineNumber").notNull(),
  // Product identification
  buyerPartNumber: varchar("buyerPartNumber", { length: 64 }),
  vendorPartNumber: varchar("vendorPartNumber", { length: 64 }),
  upc: varchar("upc", { length: 14 }),
  sku: varchar("sku", { length: 64 }),
  productId: int("productId"), // Mapped internal product
  description: text("description"),
  // Quantities and pricing
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitOfMeasure: varchar("unitOfMeasure", { length: 10 }).default("EA"), // EA, CS, LB, etc.
  unitPrice: decimal("unitPrice", { precision: 15, scale: 4 }),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }),
  // Retail-specific fields
  requestedShipDate: timestamp("requestedShipDate"),
  requestedDeliveryDate: timestamp("requestedDeliveryDate"),
  shipToLocationCode: varchar("shipToLocationCode", { length: 32 }),
  shipToName: varchar("shipToName", { length: 255 }),
  allowanceChargeAmount: decimal("allowanceChargeAmount", { precision: 15, scale: 2 }),
  allowanceChargeType: varchar("allowanceChargeType", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EdiTransactionItem = typeof ediTransactionItems.$inferSelect;
export type InsertEdiTransactionItem = typeof ediTransactionItems.$inferInsert;

// EDI Product Crosswalk - maps partner-specific product IDs to internal products
export const ediProductCrosswalks = mysqlTable("edi_product_crosswalks", {
  id: int("id").autoincrement().primaryKey(),
  tradingPartnerId: int("tradingPartnerId").notNull(),
  productId: int("productId").notNull(),
  buyerPartNumber: varchar("buyerPartNumber", { length: 64 }),
  vendorPartNumber: varchar("vendorPartNumber", { length: 64 }),
  upc: varchar("upc", { length: 14 }),
  buyerDescription: varchar("buyerDescription", { length: 255 }),
  unitOfMeasure: varchar("unitOfMeasure", { length: 10 }).default("EA"),
  packSize: int("packSize"),
  innerPackSize: int("innerPackSize"),
  caseUpc: varchar("caseUpc", { length: 14 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiProductCrosswalk = typeof ediProductCrosswalks.$inferSelect;
export type InsertEdiProductCrosswalk = typeof ediProductCrosswalks.$inferInsert;

// EDI Ship-To Locations - retailer store/DC locations for routing
export const ediShipToLocations = mysqlTable("edi_ship_to_locations", {
  id: int("id").autoincrement().primaryKey(),
  tradingPartnerId: int("tradingPartnerId").notNull(),
  locationCode: varchar("locationCode", { length: 32 }).notNull(), // Retailer's store/DC number
  locationType: mysqlEnum("locationType", ["store", "distribution_center", "warehouse", "cross_dock"]).default("store").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  postalCode: varchar("postalCode", { length: 20 }),
  country: varchar("country", { length: 64 }).default("US"),
  gln: varchar("gln", { length: 13 }), // Global Location Number
  duns: varchar("duns", { length: 9 }), // D-U-N-S Number
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  receivingHours: text("receivingHours"),
  specialInstructions: text("specialInstructions"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiShipToLocation = typeof ediShipToLocations.$inferSelect;
export type InsertEdiShipToLocation = typeof ediShipToLocations.$inferInsert;

// EDI Compliance Scorecards - track EDI compliance metrics per partner
export const ediComplianceScorecards = mysqlTable("edi_compliance_scorecards", {
  id: int("id").autoincrement().primaryKey(),
  tradingPartnerId: int("tradingPartnerId").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  // Metrics
  totalTransactions: int("totalTransactions").default(0),
  successfulTransactions: int("successfulTransactions").default(0),
  failedTransactions: int("failedTransactions").default(0),
  avgProcessingTimeSeconds: int("avgProcessingTimeSeconds"),
  onTimeAckPercentage: decimal("onTimeAckPercentage", { precision: 5, scale: 2 }),
  onTimeShipPercentage: decimal("onTimeShipPercentage", { precision: 5, scale: 2 }),
  fillRatePercentage: decimal("fillRatePercentage", { precision: 5, scale: 2 }),
  asnAccuracyPercentage: decimal("asnAccuracyPercentage", { precision: 5, scale: 2 }),
  chargebackCount: int("chargebackCount").default(0),
  chargebackAmount: decimal("chargebackAmount", { precision: 15, scale: 2 }).default("0"),
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiComplianceScorecard = typeof ediComplianceScorecards.$inferSelect;
export type InsertEdiComplianceScorecard = typeof ediComplianceScorecards.$inferInsert;

// EDI Control Numbers - sequential tracking per partner for ISA/GS/ST control numbers
export const ediControlNumbers = mysqlTable("edi_control_numbers", {
  id: int("id").autoincrement().primaryKey(),
  tradingPartnerId: int("tradingPartnerId").notNull(),
  controlNumberType: mysqlEnum("controlNumberType", ["isa", "gs", "st"]).notNull(),
  lastUsedNumber: int("lastUsedNumber").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiControlNumber = typeof ediControlNumbers.$inferSelect;
export type InsertEdiControlNumber = typeof ediControlNumbers.$inferInsert;

// EDI Settings - company-wide EDI configuration (our identifiers)
export const ediSettings = mysqlTable("edi_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  isaId: varchar("isaId", { length: 15 }).notNull(),
  isaQualifier: varchar("isaQualifier", { length: 2 }).default("ZZ").notNull(),
  gsApplicationCode: varchar("gsApplicationCode", { length: 15 }).notNull(),
  companyName: varchar("companyName", { length: 255 }),
  ackTimeoutMinutes: int("ackTimeoutMinutes").default(30),
  autoSend997: boolean("autoSend997").default(true),
  defaultTestMode: boolean("defaultTestMode").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EdiSettings = typeof ediSettings.$inferSelect;
export type InsertEdiSettings = typeof ediSettings.$inferInsert;

// ============================================
// FIREFLIES INTEGRATION
// ============================================

export const firefliesMeetings = mysqlTable("fireflies_meetings", {
  id: int("id").autoincrement().primaryKey(),
  firefliesId: varchar("firefliesId", { length: 128 }).notNull().unique(),
  title: varchar("title", { length: 500 }).notNull(),
  date: timestamp("date"),
  duration: int("duration"),
  organizerEmail: varchar("organizerEmail", { length: 320 }),
  organizerName: varchar("organizerName", { length: 255 }),
  participants: text("participants"),
  summary: text("summary"),
  shortSummary: text("shortSummary"),
  keywords: text("keywords"),
  topics: text("topics"),
  sentimentAnalysis: text("sentimentAnalysis"),
  transcriptUrl: text("transcriptUrl"),
  transcriptText: text("transcriptText"),
  actionItems: text("actionItems"),
  processingStatus: mysqlEnum("processingStatus", ["pending", "contacts_created", "tasks_created", "project_created", "fully_processed", "skipped", "error"]).default("pending").notNull(),
  processedAt: timestamp("processedAt"),
  processedBy: int("processedBy"),
  processingNotes: text("processingNotes"),
  autoCreatedProjectId: int("autoCreatedProjectId"),
  autoCreatedTaskCount: int("autoCreatedTaskCount").default(0),
  autoCreatedContactCount: int("autoCreatedContactCount").default(0),
  meetingSource: varchar("meetingSource", { length: 64 }),
  calendarEventId: varchar("calendarEventId", { length: 255 }),
  recordingUrl: text("recordingUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FirefliesMeeting = typeof firefliesMeetings.$inferSelect;
export type InsertFirefliesMeeting = typeof firefliesMeetings.$inferInsert;

export const firefliesActionItems = mysqlTable("fireflies_action_items", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(),
  firefliesMeetingId: varchar("firefliesMeetingId", { length: 128 }).notNull(),
  text: text("text").notNull(),
  assignee: varchar("assignee", { length: 255 }),
  assigneeEmail: varchar("assigneeEmail", { length: 320 }),
  dueDate: timestamp("dueDate"),
  projectTaskId: int("projectTaskId"),
  crmContactId: int("crmContactId"),
  status: mysqlEnum("status", ["pending", "converted_to_task", "skipped", "completed"]).default("pending").notNull(),
  convertedAt: timestamp("convertedAt"),
  convertedBy: int("convertedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FirefliesActionItem = typeof firefliesActionItems.$inferSelect;
export type InsertFirefliesActionItem = typeof firefliesActionItems.$inferInsert;

export const firefliesContactMappings = mysqlTable("fireflies_contact_mappings", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(),
  participantEmail: varchar("participantEmail", { length: 320 }).notNull(),
  participantName: varchar("participantName", { length: 255 }),
  crmContactId: int("crmContactId"),
  isNewContact: boolean("isNewContact").default(false),
  wasAutoCreated: boolean("wasAutoCreated").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FirefliesContactMapping = typeof firefliesContactMappings.$inferSelect;
export type InsertFirefliesContactMapping = typeof firefliesContactMappings.$inferInsert;
// ============================================
// FIREFLIES CONFIG
// ============================================

export const firefliesConfigs = mysqlTable("fireflies_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  apiKey: varchar("apiKey", { length: 512 }).notNull(),
  autoCreateContacts: boolean("autoCreateContacts").default(false),
  autoCreateTasks: boolean("autoCreateTasks").default(false),
  autoCreateProjects: boolean("autoCreateProjects").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FirefliesConfig = typeof firefliesConfigs.$inferSelect;
export type InsertFirefliesConfig = typeof firefliesConfigs.$inferInsert;
// ============================================
// TRANSACTIONAL EMAIL SYSTEM
// ============================================

export const transactionalEmailTemplates = mysqlTable("transactional_email_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: mysqlEnum("name", ["QUOTE", "PO", "SHIPMENT", "ALERT", "RFQ", "INVOICE", "PAYMENT_REMINDER", "WELCOME", "GENERAL"]).notNull(),
  providerTemplateId: varchar("providerTemplateId", { length: 128 }).notNull(),
  description: text("description"),
  variablesSchema: json("variablesSchema"),
  defaultSubject: varchar("defaultSubject", { length: 512 }),
  isActive: boolean("isActive").default(true),
  createdBy: int("createdBy"),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TransactionalEmailTemplate = typeof transactionalEmailTemplates.$inferSelect;
export type InsertTransactionalEmailTemplate = typeof transactionalEmailTemplates.$inferInsert;

export const emailMessages = mysqlTable("email_messages", {
  id: int("id").autoincrement().primaryKey(),
  toEmail: varchar("toEmail", { length: 320 }).notNull(),
  toName: varchar("toName", { length: 255 }),
  fromEmail: varchar("fromEmail", { length: 320 }),
  fromName: varchar("fromName", { length: 255 }),
  replyTo: varchar("replyTo", { length: 320 }),
  subject: varchar("subject", { length: 512 }).notNull(),
  templateName: mysqlEnum("templateName", ["QUOTE", "PO", "SHIPMENT", "ALERT", "RFQ", "INVOICE", "PAYMENT_REMINDER", "WELCOME", "GENERAL"]),
  payloadJson: json("payloadJson"),
  idempotencyKey: varchar("idempotencyKey", { length: 255 }),
  status: mysqlEnum("status", ["queued", "sending", "sent", "failed", "bounced", "delivered", "opened", "clicked"]).default("queued").notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  retryCount: int("retryCount").default(0),
  maxRetries: int("maxRetries").default(3),
  nextRetryAt: timestamp("nextRetryAt"),
  errorJson: json("errorJson"),
  relatedEntityType: varchar("relatedEntityType", { length: 64 }),
  relatedEntityId: int("relatedEntityId"),
  triggeredBy: int("triggeredBy"),
  aiGenerated: boolean("aiGenerated").default(false),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailMessage = typeof emailMessages.$inferSelect;
export type InsertEmailMessage = typeof emailMessages.$inferInsert;

export const emailEvents = mysqlTable("email_events", {
  id: int("id").autoincrement().primaryKey(),
  emailMessageId: int("emailMessageId"),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  providerEventType: varchar("providerEventType", { length: 64 }).notNull(),
  providerTimestamp: timestamp("providerTimestamp"),
  email: varchar("email", { length: 320 }),
  rawEventJson: json("rawEventJson"),
  reason: text("reason"),
  bounceType: varchar("bounceType", { length: 64 }),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailEvent = typeof emailEvents.$inferSelect;
export type InsertEmailEvent = typeof emailEvents.$inferInsert;

// ============================================
// AGENT RUN TRACKING
// ============================================

export const agentRuns = mysqlTable("agent_runs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  companyId: int("companyId"),
  goal: text("goal").notNull(),
  maxIterations: int("maxIterations").default(20).notNull(),
  context: text("context"),
  status: mysqlEnum("status", ["running", "completed", "failed", "max_iterations"]).default("running").notNull(),
  iterations: int("iterations").default(0).notNull(),
  summary: text("summary"),
  errorMessage: text("errorMessage"),
  totalTokensUsed: int("totalTokensUsed").default(0).notNull(),
  totalDurationMs: int("totalDurationMs"),
  toolCallCount: int("toolCallCount").default(0).notNull(),
  messageHistory: text("messageHistory"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;

export const agentRunSteps = mysqlTable("agent_run_steps", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull().references(() => agentRuns.id),
  iteration: int("iteration").notNull(),
  toolName: varchar("toolName", { length: 128 }),
  toolInput: text("toolInput"),
  toolResult: text("toolResult"),
  assistantMessage: text("assistantMessage"),
  stopReason: varchar("stopReason", { length: 64 }),
  tokensUsed: int("tokensUsed"),
  durationMs: int("durationMs"),
  isError: boolean("isError").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AgentRunStep = typeof agentRunSteps.$inferSelect;
export type InsertAgentRunStep = typeof agentRunSteps.$inferInsert;

export const agentCallLogs = mysqlTable("agent_call_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  contactType: varchar("contactType", { length: 32 }).notNull(),
  contactId: int("contactId").notNull(),
  contactName: varchar("contactName", { length: 255 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 32 }).notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).default("outbound").notNull(),
  status: mysqlEnum("status", ["initiated", "ringing", "in_progress", "completed", "failed", "no_answer"]).default("initiated").notNull(),
  purpose: text("purpose"),
  twilioCallSid: varchar("twilioCallSid", { length: 64 }),
  crmInteractionId: int("crmInteractionId"),
  duration: int("duration"),
  recordingUrl: text("recordingUrl"),
  transcript: text("transcript"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgentCallLog = typeof agentCallLogs.$inferSelect;
export type InsertAgentCallLog = typeof agentCallLogs.$inferInsert;

export const agentSmsLogs = mysqlTable("agent_sms_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  contactType: varchar("contactType", { length: 32 }).notNull(),
  contactId: int("contactId").notNull(),
  contactName: varchar("contactName", { length: 255 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 32 }).notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).default("outbound").notNull(),
  status: mysqlEnum("status", ["queued", "sending", "sent", "delivered", "undelivered", "failed", "received"]).default("queued").notNull(),
  body: text("body").notNull(),
  purpose: text("purpose"),
  twilioMessageSid: varchar("twilioMessageSid", { length: 64 }),
  errorCode: varchar("errorCode", { length: 32 }),
  errorMessage: text("errorMessage"),
  numSegments: int("numSegments"),
  crmInteractionId: int("crmInteractionId"),
  sentBy: int("sentBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgentSmsLog = typeof agentSmsLogs.$inferSelect;
export type InsertAgentSmsLog = typeof agentSmsLogs.$inferInsert;

// ============================================
// CRM INVESTORS & FUNDRAISING
// ============================================

export const investors = mysqlTable("investors", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  company: varchar("company", { length: 255 }),
  title: varchar("title", { length: 128 }),
  type: mysqlEnum("type", ["angel", "vc", "family_office", "strategic", "accelerator", "other"]).default("angel").notNull(),
  status: mysqlEnum("status", ["lead", "contacted", "interested", "committed", "invested", "passed"]).default("lead").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  linkedinUrl: text("linkedinUrl"),
  website: text("website"),
  source: varchar("source", { length: 128 }),
  notes: text("notes"),
  investedAt: timestamp("investedAt"),
  followUpDate: timestamp("followUpDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Investor = typeof investors.$inferSelect;
export type InsertInvestor = typeof investors.$inferInsert;

export const fundraisingCampaigns = mysqlTable("fundraising_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  targetAmount: decimal("targetAmount", { precision: 15, scale: 2 }),
  raisedAmount: decimal("raisedAmount", { precision: 15, scale: 2 }).default("0"),
  minimumInvestment: decimal("minimumInvestment", { precision: 15, scale: 2 }),
  valuation: decimal("valuation", { precision: 15, scale: 2 }),
  roundType: mysqlEnum("roundType", ["pre_seed", "seed", "series_a", "series_b", "series_c", "bridge", "other"]).default("seed").notNull(),
  equityOffered: decimal("equityOffered", { precision: 5, scale: 2 }),
  startDate: timestamp("startDate"),
  targetCloseDate: timestamp("targetCloseDate"),
  actualCloseDate: timestamp("actualCloseDate"),
  status: mysqlEnum("status", ["planning", "active", "paused", "closed", "cancelled"]).default("planning").notNull(),
  dataRoomId: int("dataRoomId"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FundraisingCampaign = typeof fundraisingCampaigns.$inferSelect;
export type InsertFundraisingCampaign = typeof fundraisingCampaigns.$inferInsert;

export const investorInvestments = mysqlTable("investor_investments", {
  id: int("id").autoincrement().primaryKey(),
  investorId: int("investorId").notNull().references(() => investors.id),
  campaignId: int("campaignId").references(() => fundraisingCampaigns.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("USD"),
  investedAt: timestamp("investedAt").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InvestorInvestment = typeof investorInvestments.$inferSelect;
export type InsertInvestorInvestment = typeof investorInvestments.$inferInsert;

export const fundraisingReminders = mysqlTable("fundraising_reminders", {
  id: int("id").autoincrement().primaryKey(),
  investorId: int("investorId").notNull().references(() => investors.id),
  title: varchar("title", { length: 255 }).notNull(),
  dueDate: timestamp("dueDate").notNull(),
  status: mysqlEnum("status", ["pending", "completed", "cancelled"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FundraisingReminder = typeof fundraisingReminders.$inferSelect;
export type InsertFundraisingReminder = typeof fundraisingReminders.$inferInsert;

// ============================================
// GRANT & BID APPLICATION SUBMITTER
// ============================================

// Grant/Bid application templates - reusable templates for different grant programs or procurement bids
export const grantBidTemplates = mysqlTable("grant_bid_templates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"]).notNull(),
  description: text("description"),
  // Template structure - JSON array of sections/fields
  sections: text("sections"), // JSON: [{name, fields: [{key, label, type, dataSource, required}]}]
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GrantBidTemplate = typeof grantBidTemplates.$inferSelect;
export type InsertGrantBidTemplate = typeof grantBidTemplates.$inferInsert;

// Grant/Bid applications - actual submissions
export const grantBidApplications = mysqlTable("grant_bid_applications", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  templateId: int("templateId"),
  projectId: int("projectId"), // Link to project
  // Application metadata
  applicationNumber: varchar("applicationNumber", { length: 64 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  type: mysqlEnum("type", ["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"]).notNull(),
  grantingOrganization: varchar("grantingOrganization", { length: 255 }),
  programName: varchar("programName", { length: 255 }),
  // Financials
  requestedAmount: decimal("requestedAmount", { precision: 15, scale: 2 }),
  matchingFunds: decimal("matchingFunds", { precision: 15, scale: 2 }),
  totalProjectCost: decimal("totalProjectCost", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  // Dates
  submissionDeadline: timestamp("submissionDeadline"),
  submittedAt: timestamp("submittedAt"),
  awardDate: timestamp("awardDate"),
  projectStartDate: timestamp("projectStartDate"),
  projectEndDate: timestamp("projectEndDate"),
  // Status tracking
  status: mysqlEnum("status", [
    "draft", "data_collection", "ai_generating", "review",
    "approved", "submitted", "under_review", "awarded",
    "rejected", "withdrawn"
  ]).default("draft").notNull(),
  // Populated form data (from ERP + AI)
  formData: text("formData"), // JSON: full form data object
  generatedNarrative: text("generatedNarrative"), // AI-generated narrative sections
  // Data sources used
  dataSourcesUsed: text("dataSourcesUsed"), // JSON: [{source, table, ids}]
  // Submission details
  submissionMethod: mysqlEnum("submissionMethod", ["web_form", "email", "portal", "pdf_upload", "api"]).default("pdf_upload"),
  submissionUrl: text("submissionUrl"),
  submissionConfirmation: varchar("submissionConfirmation", { length: 255 }),
  // Review & approval
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewNotes: text("reviewNotes"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  // Creator
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GrantBidApplication = typeof grantBidApplications.$inferSelect;
export type InsertGrantBidApplication = typeof grantBidApplications.$inferInsert;

// Grant/Bid application documents - attachments and generated documents
export const grantBidDocuments = mysqlTable("grant_bid_documents", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  documentType: mysqlEnum("documentType", [
    "cover_letter", "executive_summary", "budget_narrative", "financial_statement",
    "org_chart", "project_timeline", "letter_of_support", "tax_document",
    "certification", "capability_statement", "past_performance", "technical_proposal",
    "cost_proposal", "attachment", "generated_application"
  ]).notNull(),
  // Source - auto-pulled from ERP or manually uploaded
  source: mysqlEnum("source", ["auto_generated", "erp_export", "manual_upload"]).default("manual_upload").notNull(),
  sourceTable: varchar("sourceTable", { length: 64 }), // e.g., "invoices", "projects"
  sourceId: int("sourceId"),
  // Storage
  fileUrl: text("fileUrl"),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 128 }),
  // Content (for generated docs)
  content: text("content"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GrantBidDocument = typeof grantBidDocuments.$inferSelect;
export type InsertGrantBidDocument = typeof grantBidDocuments.$inferInsert;

// Grant/Bid field mappings - maps ERP data fields to application form fields
export const grantBidFieldMappings = mysqlTable("grant_bid_field_mappings", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull(),
  fieldKey: varchar("fieldKey", { length: 128 }).notNull(), // e.g., "org_name", "annual_revenue"
  fieldLabel: varchar("fieldLabel", { length: 255 }).notNull(),
  fieldType: mysqlEnum("fieldType", ["text", "number", "currency", "date", "textarea", "select", "file"]).default("text").notNull(),
  // Data source mapping
  dataSource: varchar("dataSource", { length: 64 }), // table name: "companies", "employees", etc.
  dataField: varchar("dataField", { length: 128 }), // field name: "legalName", "taxId"
  dataTransform: text("dataTransform"), // optional transform instruction for AI
  // Validation
  isRequired: boolean("isRequired").default(false),
  validationRule: varchar("validationRule", { length: 255 }),
  defaultValue: text("defaultValue"),
  sortOrder: int("sortOrder").default(0),
  section: varchar("section", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GrantBidFieldMapping = typeof grantBidFieldMappings.$inferSelect;
export type InsertGrantBidFieldMapping = typeof grantBidFieldMappings.$inferInsert;

// Grant/Bid submission log - tracks submission attempts and status changes
export const grantBidSubmissionLogs = mysqlTable("grant_bid_submission_logs", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  action: mysqlEnum("action", [
    "created", "data_collected", "narrative_generated", "document_attached",
    "submitted_for_review", "review_completed", "approved", "submission_attempted",
    "submission_succeeded", "submission_failed", "status_updated", "awarded", "rejected"
  ]).notNull(),
  details: text("details"),
  performedBy: int("performedBy"),
  performedAt: timestamp("performedAt").defaultNow().notNull(),
});

export type GrantBidSubmissionLog = typeof grantBidSubmissionLogs.$inferSelect;
export type InsertGrantBidSubmissionLog = typeof grantBidSubmissionLogs.$inferInsert;

// Grant/Bid opportunities - discovered grant programs, RFPs, and procurement bids to apply for
export const grantBidOpportunities = mysqlTable("grant_bid_opportunities", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  // Opportunity details
  title: varchar("title", { length: 500 }).notNull(),
  type: mysqlEnum("type", ["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"]).notNull(),
  organization: varchar("organization", { length: 255 }),
  programName: varchar("programName", { length: 255 }),
  description: text("description"),
  // Eligibility & requirements
  eligibilityCriteria: text("eligibilityCriteria"),
  requiredDocuments: text("requiredDocuments"), // JSON array
  // Financials
  fundingAmountMin: decimal("fundingAmountMin", { precision: 15, scale: 2 }),
  fundingAmountMax: decimal("fundingAmountMax", { precision: 15, scale: 2 }),
  matchingRequired: boolean("matchingRequired").default(false),
  matchingPercentage: decimal("matchingPercentage", { precision: 5, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  // Dates
  openDate: timestamp("openDate"),
  deadline: timestamp("deadline"),
  awardDate: timestamp("awardDate"),
  // Source
  sourceUrl: text("sourceUrl"),
  sourceType: mysqlEnum("sourceType", ["web_search", "manual", "api_feed", "email", "ai_recommended"]).default("web_search").notNull(),
  // Matching & relevance
  matchScore: int("matchScore"), // AI-computed relevance score 0-100
  matchReason: text("matchReason"), // Why this is a good match
  categories: text("categories"), // JSON array of category tags
  // Status
  status: mysqlEnum("status", ["discovered", "saved", "evaluating", "applying", "applied", "not_eligible", "expired", "dismissed"]).default("discovered").notNull(),
  applicationId: int("applicationId"), // Link to created application
  // Notes
  notes: text("notes"),
  savedBy: int("savedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GrantBidOpportunity = typeof grantBidOpportunities.$inferSelect;
export type InsertGrantBidOpportunity = typeof grantBidOpportunities.$inferInsert;

// Web form mappings - maps application data to specific web form fields for auto-filling
export const grantBidWebFormMappings = mysqlTable("grant_bid_web_form_mappings", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  // Target website
  portalName: varchar("portalName", { length: 255 }).notNull(), // e.g., "Grants.gov", "SAM.gov"
  portalUrl: text("portalUrl"),
  // Form field mappings - JSON array of {formFieldId, formFieldLabel, formFieldType, cssSelector, value, dataSourceKey}
  fieldMappings: text("fieldMappings"),
  // Auto-fill script - generated JavaScript that can be pasted into browser console or used by extension
  autoFillScript: text("autoFillScript"),
  // Status
  status: mysqlEnum("status", ["draft", "mapped", "tested", "submitted"]).default("draft").notNull(),
  lastFilledAt: timestamp("lastFilledAt"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GrantBidWebFormMapping = typeof grantBidWebFormMappings.$inferSelect;
export type InsertGrantBidWebFormMapping = typeof grantBidWebFormMappings.$inferInsert;

// ============================================
// CAP TABLE & EQUITY MANAGEMENT
// ============================================

export const shareClasses = mysqlTable("share_classes", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 128 }).notNull(), // "Common", "Series A Preferred", etc.
  type: mysqlEnum("type", ["common", "preferred", "convertible_note", "safe", "warrant", "option_pool"]).notNull(),
  authorizedShares: decimal("authorizedShares", { precision: 18, scale: 4 }),
  parValue: decimal("parValue", { precision: 18, scale: 6 }).default("0.0001"),
  pricePerShare: decimal("pricePerShare", { precision: 18, scale: 4 }),
  liquidationPreference: decimal("liquidationPreference", { precision: 10, scale: 4 }).default("1"),
  liquidationMultiple: decimal("liquidationMultiple", { precision: 10, scale: 4 }).default("1"),
  isParticipating: boolean("isParticipating").default(false),
  participationCap: decimal("participationCap", { precision: 10, scale: 4 }),
  conversionRatio: decimal("conversionRatio", { precision: 10, scale: 4 }).default("1"),
  votingRights: boolean("votingRights").default(true),
  dividendRate: decimal("dividendRate", { precision: 10, scale: 4 }),
  antidilutionProtection: mysqlEnum("antidilutionProtection", ["none", "broad_weighted_average", "narrow_weighted_average", "full_ratchet"]).default("none"),
  boardSeats: int("boardSeats").default(0),
  seniorityRank: int("seniorityRank").default(0), // Higher = more senior in liquidation
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ShareClass = typeof shareClasses.$inferSelect;
export type InsertShareClass = typeof shareClasses.$inferInsert;

export const stakeholders = mysqlTable("stakeholders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }),
  type: mysqlEnum("type", ["founder", "employee", "investor", "advisor", "board_member", "contractor"]).notNull(),
  title: varchar("title", { length: 128 }),
  relationship: varchar("relationship", { length: 128 }), // "Lead Investor", "Angel", etc.
  // Investor-portal entitlement tier. Drives which gated sections (board
  // materials, sensitive cap-table detail, etc.) are visible. Free tiers
  // for now since most investors fit cleanly into ordinary / major / board.
  tier: mysqlEnum("tier", ["ordinary", "major", "board"]).default("ordinary").notNull(),
  address: text("address"),
  // Mailing address for K-1s / paper communications. Distinct from `address`
  // (legal address) because some investors live at one place and want tax
  // documents sent to a different one (CPA, family office, etc.).
  mailingAddress: text("mailingAddress"),
  // Free-text "how to pay me" — wire instructions, ACH preference, etc.
  // Deliberately NOT a structured ACH field: storing actual routing /
  // account numbers needs an encrypted vault we don't have yet, and the
  // failure mode of leaking those is much worse than the inconvenience
  // of a free-text note describing the preference.
  paymentPreference: text("paymentPreference"),
  taxId: varchar("taxId", { length: 64 }),
  accreditedInvestor: boolean("accreditedInvestor").default(false),
  // When the investor last re-attested they're accredited. Used so the
  // portal can prompt for re-attestation after some interval (Reg D
  // typically wants annual re-confirmation for ongoing offerings).
  accreditedReAttestedAt: timestamp("accreditedReAttestedAt"),
  status: mysqlEnum("status", ["active", "inactive", "terminated", "departed"]).default("active"),
  terminationDate: timestamp("terminationDate"),
  notes: text("notes"),
  userId: int("userId"), // Link to ERP user if they have an account
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Stakeholder = typeof stakeholders.$inferSelect;
export type InsertStakeholder = typeof stakeholders.$inferInsert;

// Pro-rata / participation interest signaled by an existing investor in
// response to an open fundraising round. This is non-binding — it's a
// "I'd like to participate, please reach out" notice the IR team can
// follow up on, not a subscription document. Storing the indicated
// amount is optional; some investors signal interest without a number.
export const proRataIndications = mysqlTable("pro_rata_indications", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  stakeholderId: int("stakeholderId").notNull(),
  indicatedAmount: decimal("indicatedAmount", { precision: 18, scale: 2 }),
  notes: text("notes"),
  status: mysqlEnum("status", ["interested", "withdrawn", "converted"]).default("interested").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProRataIndication = typeof proRataIndications.$inferSelect;
export type InsertProRataIndication = typeof proRataIndications.$inferInsert;

// Per-stakeholder document locker. Used by the investor portal to surface
// executed agreements, K-1s, capital-call notices, distribution notices
// — anything tied to one investor rather than the company at large.
//
// Storage uses the project's `storagePut`/`storageGet` helpers (Forge
// proxy or S3 depending on env), so we keep the key + the durable URL.
export const stakeholderDocuments = mysqlTable("stakeholder_documents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  stakeholderId: int("stakeholderId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", [
    "agreement",        // SAFE / note / SPA — what the investor signed
    "side_letter",      // any individually-negotiated terms
    "k1",               // tax forms
    "capital_call",
    "distribution",
    "other",
  ]).default("other").notNull(),
  fileType: varchar("fileType", { length: 64 }),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: bigint("fileSize", { mode: "number" }),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }),
  uploadedBy: int("uploadedBy"), // user id, nullable so backfills don't break
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StakeholderDocument = typeof stakeholderDocuments.$inferSelect;
export type InsertStakeholderDocument = typeof stakeholderDocuments.$inferInsert;

export const equityGrants = mysqlTable("equity_grants", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  stakeholderId: int("stakeholderId").notNull(),
  shareClassId: int("shareClassId").notNull(),
  grantType: mysqlEnum("grantType", ["purchase", "option_iso", "option_nso", "rsu", "restricted_stock", "convertible_note", "safe", "warrant", "secondary"]).notNull(),
  grantDate: timestamp("grantDate").notNull(),
  shares: decimal("shares", { precision: 18, scale: 4 }).notNull(),
  pricePerShare: decimal("pricePerShare", { precision: 18, scale: 4 }).notNull(),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }),
  status: mysqlEnum("status", ["active", "partially_vested", "fully_vested", "exercised", "cancelled", "expired", "converted"]).default("active"),
  // Vesting
  vestingStartDate: timestamp("vestingStartDate"),
  vestingEndDate: timestamp("vestingEndDate"),
  vestingSchedule: mysqlEnum("vestingSchedule", ["none", "monthly", "quarterly", "annually", "custom"]).default("none"),
  cliffMonths: int("cliffMonths").default(0),
  totalVestingMonths: int("totalVestingMonths").default(0),
  accelerationOnChange: boolean("accelerationOnChange").default(false), // Single trigger
  doubleAcceleration: boolean("doubleAcceleration").default(false), // Double trigger
  sharesVested: decimal("sharesVested", { precision: 18, scale: 4 }).default("0"),
  sharesExercised: decimal("sharesExercised", { precision: 18, scale: 4 }).default("0"),
  // For options
  exercisePrice: decimal("exercisePrice", { precision: 18, scale: 4 }),
  expirationDate: timestamp("expirationDate"),
  earlyExercise: boolean("earlyExercise").default(false),
  // For convertible notes / SAFEs
  principalAmount: decimal("principalAmount", { precision: 18, scale: 2 }),
  interestRate: decimal("interestRate", { precision: 10, scale: 4 }),
  valuationCap: decimal("valuationCap", { precision: 18, scale: 2 }),
  discountRate: decimal("discountRate", { precision: 10, scale: 4 }),
  maturityDate: timestamp("maturityDate"),
  convertedToShareClassId: int("convertedToShareClassId"),
  conversionDate: timestamp("conversionDate"),
  // Certificate
  certificateNumber: varchar("certificateNumber", { length: 64 }),
  boardApprovalDate: timestamp("boardApprovalDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type EquityGrant = typeof equityGrants.$inferSelect;
export type InsertEquityGrant = typeof equityGrants.$inferInsert;

export const valuations409a = mysqlTable("valuations_409a", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  valuationDate: timestamp("valuationDate").notNull(),
  fairMarketValue: decimal("fairMarketValue", { precision: 18, scale: 4 }).notNull(), // Per share FMV
  totalValuation: decimal("totalValuation", { precision: 18, scale: 2 }),
  provider: varchar("provider", { length: 256 }), // "Carta 409A", "Eqvista", etc.
  methodology: varchar("methodology", { length: 128 }),
  status: mysqlEnum("status", ["draft", "pending", "approved", "expired"]).default("draft"),
  expirationDate: timestamp("expirationDate"),
  reportUrl: text("reportUrl"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Valuation409a = typeof valuations409a.$inferSelect;
export type InsertValuation409a = typeof valuations409a.$inferInsert;

export const equityTransactions = mysqlTable("equity_transactions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  grantId: int("grantId").notNull(),
  stakeholderId: int("stakeholderId").notNull(),
  type: mysqlEnum("type", ["grant", "vest", "exercise", "cancel", "expire", "convert", "transfer", "repurchase", "forfeit"]).notNull(),
  shares: decimal("shares", { precision: 18, scale: 4 }).notNull(),
  pricePerShare: decimal("pricePerShare", { precision: 18, scale: 4 }),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }),
  transactionDate: timestamp("transactionDate").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EquityTransaction = typeof equityTransactions.$inferSelect;
export type InsertEquityTransaction = typeof equityTransactions.$inferInsert;

// ============================================
// OFFER LETTERS
// ============================================

export const offerLetters = mysqlTable("offer_letters", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  stakeholderId: int("stakeholderId"),
  employeeId: int("employeeId"),
  candidateName: varchar("candidateName", { length: 256 }).notNull(),
  candidateEmail: varchar("candidateEmail", { length: 320 }),
  position: varchar("position", { length: 256 }).notNull(),
  department: varchar("department", { length: 128 }),
  startDate: timestamp("startDate"),
  salary: decimal("salary", { precision: 12, scale: 2 }),
  salaryPeriod: mysqlEnum("salaryPeriod", ["annual", "monthly", "hourly"]).default("annual"),
  bonus: decimal("bonus", { precision: 12, scale: 2 }),
  equityShares: decimal("equityShares", { precision: 18, scale: 4 }),
  equityType: varchar("equityType", { length: 64 }), // "ISO", "RSU", etc.
  vestingMonths: int("vestingMonths"),
  cliffMonths: int("cliffMonths"),
  benefits: text("benefits"), // JSON or markdown
  reportingTo: varchar("reportingTo", { length: 256 }),
  location: varchar("location", { length: 256 }),
  employmentType: mysqlEnum("employmentType", ["full_time", "part_time", "contract", "intern"]).default("full_time"),
  letterContent: text("letterContent"), // The generated letter HTML/markdown
  status: mysqlEnum("status", ["draft", "sent", "viewed", "accepted", "declined", "expired"]).default("draft"),
  sentAt: timestamp("sentAt"),
  viewedAt: timestamp("viewedAt"),
  respondedAt: timestamp("respondedAt"),
  expiresAt: timestamp("expiresAt"),
  signatureUrl: text("signatureUrl"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type OfferLetter = typeof offerLetters.$inferSelect;
export type InsertOfferLetter = typeof offerLetters.$inferInsert;

// ============================================
// EXERCISE REQUESTS
// ============================================

export const exerciseRequests = mysqlTable("exercise_requests", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  stakeholderId: int("stakeholderId").notNull(),
  grantId: int("grantId").notNull(),
  sharesToExercise: decimal("sharesToExercise", { precision: 18, scale: 4 }).notNull(),
  exercisePrice: decimal("exercisePrice", { precision: 18, scale: 4 }).notNull(),
  totalCost: decimal("totalCost", { precision: 18, scale: 2 }).notNull(),
  exerciseType: mysqlEnum("exerciseType", ["cash", "cashless", "net_exercise"]).default("cash"),
  status: mysqlEnum("status", ["pending", "approved", "completed", "denied", "cancelled"]).default("pending"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  completedAt: timestamp("completedAt"),
  denialReason: text("denialReason"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ExerciseRequest = typeof exerciseRequests.$inferSelect;
export type InsertExerciseRequest = typeof exerciseRequests.$inferInsert;

// ============================================
// BOARD APPROVALS & SIGNATURES
// ============================================

export const boardResolutions = mysqlTable("board_resolutions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  title: varchar("title", { length: 256 }).notNull(),
  type: mysqlEnum("type", ["equity_grant", "officer_appointment", "fundraising", "budget_approval", "contract", "policy_change", "compensation", "option_pool", "share_class", "other"]).notNull(),
  description: text("description"),
  documentUrl: text("documentUrl"),
  status: mysqlEnum("status", ["draft", "submitted", "under_review", "approved", "rejected", "signed", "archived"]).default("draft"),
  requiredSignatures: int("requiredSignatures").default(1),
  completedSignatures: int("completedSignatures").default(0),
  submittedAt: timestamp("submittedAt"),
  approvedAt: timestamp("approvedAt"),
  dueDate: timestamp("dueDate"),
  relatedEntityType: varchar("relatedEntityType", { length: 64 }),
  relatedEntityId: int("relatedEntityId"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const boardSignatures = mysqlTable("board_signatures", {
  id: int("id").autoincrement().primaryKey(),
  resolutionId: int("resolutionId").notNull(),
  signerId: int("signerId").notNull(),
  signerName: varchar("signerName", { length: 256 }).notNull(),
  signerEmail: varchar("signerEmail", { length: 320 }),
  signerRole: varchar("signerRole", { length: 128 }),
  status: mysqlEnum("status", ["pending", "signed", "declined"]).default("pending"),
  signedAt: timestamp("signedAt"),
  declinedAt: timestamp("declinedAt"),
  declineReason: text("declineReason"),
  signatureData: text("signatureData"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BoardResolution = typeof boardResolutions.$inferSelect;
export type InsertBoardResolution = typeof boardResolutions.$inferInsert;
export type BoardSignature = typeof boardSignatures.$inferSelect;
export type InsertBoardSignature = typeof boardSignatures.$inferInsert;

// ============================================
// INVESTOR COMMUNICATIONS HUB
// ============================================

export const investorUpdates = mysqlTable("investor_updates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  title: varchar("title", { length: 256 }).notNull(),
  period: varchar("period", { length: 64 }),
  type: mysqlEnum("type", ["quarterly", "monthly", "annual", "ad_hoc"]).default("quarterly"),
  content: text("content"),
  highlights: text("highlights"),
  asks: text("asks"),
  callsToAction: text("callsToAction"),
  status: mysqlEnum("status", ["draft", "review", "sent"]).default("draft"),
  sentAt: timestamp("sentAt"),
  sentTo: text("sentTo"),
  openCount: int("openCount").default(0),
  clickCount: int("clickCount").default(0),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type InvestorUpdate = typeof investorUpdates.$inferSelect;
export type InsertInvestorUpdate = typeof investorUpdates.$inferInsert;

// ============================================
// TEAM INVITATIONS (Email-based invite flow)
// ============================================

export const teamInvites = mysqlTable("team_invites", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 256 }),
  role: mysqlEnum("role", ["user", "admin", "finance", "ops", "legal", "exec", "sales", "copacker", "vendor", "contractor", "investor"]).default("user").notNull(),
  invitedBy: int("invitedBy").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  // When an admin invites an existing stakeholder (typically an investor)
  // to the portal, we remember which cap-table row to attach the new user
  // to once they accept. Nullable for ordinary team invites.
  linkedStakeholderId: int("linkedStakeholderId"),
  status: mysqlEnum("status", ["pending", "accepted", "expired", "cancelled"]).default("pending"),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamInvite = typeof teamInvites.$inferSelect;
export type InsertTeamInvite = typeof teamInvites.$inferInsert;

// ============================================
// TIME TRACKING
// ============================================

export const timeEntries = mysqlTable("time_entries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  taskDescription: varchar("taskDescription", { length: 512 }).notNull(),
  date: timestamp("date").notNull(),
  hours: decimal("hours", { precision: 8, scale: 2 }).notNull(),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  category: mysqlEnum("category", ["development", "design", "consulting", "management", "operations", "admin", "sales", "support", "other"]).default("other"),
  billable: boolean("billable").default(true),
  status: mysqlEnum("status", ["draft", "submitted", "approved", "invoiced", "paid"]).default("draft"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const timeInvoices = mysqlTable("time_invoices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  userId: int("userId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  totalHours: decimal("totalHours", { precision: 10, scale: 2 }).notNull(),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["draft", "submitted", "approved", "sent", "paid"]).default("draft"),
  submittedAt: timestamp("submittedAt"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  sentAt: timestamp("sentAt"),
  sentTo: varchar("sentTo", { length: 320 }),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = typeof timeEntries.$inferInsert;
export type TimeInvoice = typeof timeInvoices.$inferSelect;
export type InsertTimeInvoice = typeof timeInvoices.$inferInsert;

// ============================================
// MERCURY BANK TRANSACTIONS
// ============================================

export const bankTransactions = mysqlTable("bank_transactions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  externalId: varchar("externalId", { length: 128 }).unique(), // Mercury transaction ID
  accountName: varchar("accountName", { length: 256 }),
  accountId: varchar("accountId", { length: 128 }),
  date: timestamp("date").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["debit", "credit"]).notNull(),
  description: varchar("description", { length: 512 }),
  counterpartyName: varchar("counterpartyName", { length: 256 }),
  status: varchar("status", { length: 64 }),
  // AI categorization
  category: varchar("category", { length: 128 }),
  accountCode: varchar("accountCode", { length: 32 }),
  categorizationStatus: mysqlEnum("categorizationStatus", ["uncategorized", "ai_suggested", "confirmed", "manual"]).default("uncategorized"),
  aiConfidence: int("aiConfidence"),
  // Matching
  matchedInvoiceId: int("matchedInvoiceId"),
  matchedPurchaseOrderId: int("matchedPurchaseOrderId"),
  matchedVendorId: int("matchedVendorId"),
  matchedCustomerId: int("matchedCustomerId"),
  // Sync
  syncedToQuickbooks: boolean("syncedToQuickbooks").default(false),
  source: mysqlEnum("source", ["mercury", "quickbooks", "manual"]).default("mercury"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = typeof bankTransactions.$inferInsert;

// ============================================
// INVESTMENT COMMITMENTS (Investor Onboarding)
// ============================================

export const investmentCommitments = mysqlTable("investment_commitments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  dataRoomId: int("dataRoomId"),
  investorName: varchar("investorName", { length: 256 }).notNull(),
  investorEmail: varchar("investorEmail", { length: 320 }).notNull(),
  investorCompany: varchar("investorCompany", { length: 256 }),
  investorTitle: varchar("investorTitle", { length: 128 }),
  investmentAmount: decimal("investmentAmount", { precision: 18, scale: 2 }).notNull(),
  shareClassName: varchar("shareClassName", { length: 128 }),
  instrumentType: mysqlEnum("instrumentType", ["equity", "safe", "convertible_note", "warrant"]).default("safe"),
  valuationCap: decimal("valuationCap", { precision: 18, scale: 2 }),
  discountRate: decimal("discountRate", { precision: 10, scale: 4 }),
  notes: text("notes"),
  ndaSigned: boolean("ndaSigned").default(false),
  ndaSignedAt: timestamp("ndaSignedAt"),
  status: mysqlEnum("status", ["interested", "committed", "docs_sent", "signed", "funded", "completed", "declined"]).default("interested"),
  signedDocumentUrl: text("signedDocumentUrl"),
  fundedAt: timestamp("fundedAt"),
  addedToCapTable: boolean("addedToCapTable").default(false),
  stakeholderId: int("stakeholderId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type InvestmentCommitment = typeof investmentCommitments.$inferSelect;
export type InsertInvestmentCommitment = typeof investmentCommitments.$inferInsert;

// ============================================
// FINANCIAL MODEL (Imported from XLSX)
// ============================================

export const financialModel = mysqlTable("financial_model", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  sheetName: varchar("sheetName", { length: 128 }).notNull(),
  category: varchar("category", { length: 128 }),
  metricName: varchar("metricName", { length: 255 }).notNull(),
  year: int("year"),
  month: int("month"),
  projectedValue: decimal("projectedValue", { precision: 20, scale: 2 }),
  actualValue: decimal("actualValue", { precision: 20, scale: 2 }),
  unit: varchar("unit", { length: 32 }).default("USD"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FinancialModel = typeof financialModel.$inferSelect;
export type InsertFinancialModel = typeof financialModel.$inferInsert;

// ============================================
// KPI GOALS
// ============================================

export const kpiGoals = mysqlTable("kpi_goals", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  category: varchar("category", { length: 128 }).notNull(), // "P&L", "Cash", "Operations", "Growth", "HR"
  metricName: varchar("metricName", { length: 255 }).notNull(),
  year: int("year").notNull(),
  month: int("month"), // null = annual target
  targetValue: decimal("targetValue", { precision: 20, scale: 2 }).notNull(),
  actualValue: decimal("actualValue", { precision: 20, scale: 2 }),
  unit: varchar("unit", { length: 32 }).default("USD"),
  status: mysqlEnum("status", ["on_track", "at_risk", "behind", "exceeded", "not_started"]).default("not_started"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KpiGoal = typeof kpiGoals.$inferSelect;
export type InsertKpiGoal = typeof kpiGoals.$inferInsert;

// ============================================
// SUPPLY CHAIN WORKFLOW ENGINE
// ============================================

export const supplyChainWorkflows = mysqlTable("supplyChainWorkflows", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  workflowType: mysqlEnum("workflowType", ["demand_forecasting", "production_planning", "material_requirements", "procurement", "inventory_reorder", "inventory_transfer", "inventory_optimization", "work_order_generation", "production_scheduling", "freight_procurement", "shipment_tracking", "order_fulfillment", "supplier_management", "quality_inspection", "invoice_matching", "payment_processing", "exception_handling", "vendor_quote_procurement", "vendor_quote_analysis", "custom"]).notNull(),
  triggerType: mysqlEnum("triggerType", ["scheduled", "event", "threshold", "manual", "continuous"]).default("scheduled").notNull(),
  cronSchedule: varchar("cronSchedule", { length: 64 }),
  triggerEvents: text("triggerEvents"),
  thresholdConfig: text("thresholdConfig"),
  executionConfig: text("executionConfig"),
  maxConcurrentRuns: int("maxConcurrentRuns").default(1),
  timeoutMinutes: int("timeoutMinutes").default(60),
  retryAttempts: int("retryAttempts").default(3),
  retryDelayMinutes: int("retryDelayMinutes").default(5),
  requiresApproval: boolean("requiresApproval").default(false),
  autoApproveThreshold: decimal("autoApproveThreshold", { precision: 14, scale: 2 }),
  approvalRoles: text("approvalRoles"),
  escalationMinutes: int("escalationMinutes").default(60),
  escalationRoles: text("escalationRoles"),
  dependsOnWorkflows: text("dependsOnWorkflows"),
  isActive: boolean("isActive").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextScheduledRun: timestamp("nextScheduledRun"),
  successCount: int("successCount").default(0),
  failureCount: int("failureCount").default(0),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplyChainWorkflow = typeof supplyChainWorkflows.$inferSelect;
export type InsertSupplyChainWorkflow = typeof supplyChainWorkflows.$inferInsert;

export const workflowRuns = mysqlTable("workflowRuns", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  runNumber: varchar("runNumber", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["queued", "running", "awaiting_approval", "approved", "rejected", "completed", "failed", "cancelled", "timed_out"]).default("queued").notNull(),
  triggeredBy: mysqlEnum("triggeredBy", ["schedule", "event", "threshold", "manual", "dependency"]).notNull(),
  triggerData: text("triggerData"),
  triggeredByUserId: int("triggeredByUserId"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
  totalSteps: int("totalSteps").default(0),
  completedSteps: int("completedSteps").default(0),
  currentStepName: varchar("currentStepName", { length: 255 }),
  progressPercent: int("progressPercent").default(0),
  inputData: text("inputData"),
  outputData: text("outputData"),
  errorMessage: text("errorMessage"),
  errorDetails: text("errorDetails"),
  itemsProcessed: int("itemsProcessed").default(0),
  itemsSucceeded: int("itemsSucceeded").default(0),
  itemsFailed: int("itemsFailed").default(0),
  totalValue: decimal("totalValue", { precision: 14, scale: 2 }),
  attemptNumber: int("attemptNumber").default(1),
  parentRunId: int("parentRunId"),
  approvalRequestedAt: timestamp("approvalRequestedAt"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),
  escalatedAt: timestamp("escalatedAt"),
  escalatedTo: text("escalatedTo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = typeof workflowRuns.$inferInsert;

export const workflowSteps = mysqlTable("workflowSteps", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  stepNumber: int("stepNumber").notNull(),
  stepName: varchar("stepName", { length: 255 }).notNull(),
  stepType: mysqlEnum("stepType", ["data_fetch", "ai_analysis", "ai_decision", "calculation", "validation", "create_record", "update_record", "send_email", "send_notification", "api_call", "wait_approval", "condition_check", "loop_start", "loop_end", "parallel_start", "parallel_end", "subprocess"]).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped", "awaiting_input"]).default("pending").notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
  inputData: text("inputData"),
  outputData: text("outputData"),
  errorMessage: text("errorMessage"),
  aiPrompt: text("aiPrompt"),
  aiResponse: text("aiResponse"),
  aiConfidence: decimal("aiConfidence", { precision: 5, scale: 2 }),
  aiTokensUsed: int("aiTokensUsed"),
  createdEntityType: varchar("createdEntityType", { length: 64 }),
  createdEntityId: int("createdEntityId"),
  modifiedEntityType: varchar("modifiedEntityType", { length: 64 }),
  modifiedEntityId: int("modifiedEntityId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type InsertWorkflowStep = typeof workflowSteps.$inferInsert;

export const workflowApprovalQueue = mysqlTable("workflowApprovalQueue", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  approvalType: mysqlEnum("approvalType", ["purchase_order", "work_order", "inventory_transfer", "freight_booking", "payment", "price_change", "vendor_selection", "exception_override", "forecast_adjustment", "workflow_result"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  monetaryValue: decimal("monetaryValue", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  contextData: text("contextData"),
  aiRecommendation: text("aiRecommendation"),
  aiConfidence: decimal("aiConfidence", { precision: 5, scale: 2 }),
  riskAssessment: mysqlEnum("riskAssessment", ["low", "medium", "high", "critical"]).default("low"),
  relatedEntityType: varchar("relatedEntityType", { length: 64 }),
  relatedEntityId: int("relatedEntityId"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "auto_approved", "escalated", "expired"]).default("pending").notNull(),
  assignedToRoles: text("assignedToRoles"),
  assignedToUsers: text("assignedToUsers"),
  currentAssignee: int("currentAssignee"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  dueAt: timestamp("dueAt"),
  escalateAt: timestamp("escalateAt"),
  escalatedAt: timestamp("escalatedAt"),
  escalationLevel: int("escalationLevel").default(0),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNotes: text("resolutionNotes"),
  wasAutoApproved: boolean("wasAutoApproved").default(false),
  autoApprovalReason: varchar("autoApprovalReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowApproval = typeof workflowApprovalQueue.$inferSelect;
export type InsertWorkflowApproval = typeof workflowApprovalQueue.$inferInsert;

export const autonomousDecisions = mysqlTable("autonomousDecisions", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId"),
  stepId: int("stepId"),
  decisionType: mysqlEnum("decisionType", ["vendor_selection", "quantity_calculation", "timing_decision", "routing_decision", "pricing_acceptance", "exception_handling", "priority_assignment", "allocation_decision", "forecast_adjustment", "reorder_trigger", "approval_routing"]).notNull(),
  decisionContext: text("decisionContext"),
  optionsConsidered: text("optionsConsidered"),
  chosenOption: text("chosenOption"),
  aiReasoning: text("aiReasoning"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  estimatedImpact: text("estimatedImpact"),
  actualImpact: text("actualImpact"),
  wasOverridden: boolean("wasOverridden").default(false),
  overriddenBy: int("overriddenBy"),
  overrideReason: text("overrideReason"),
  feedbackScore: int("feedbackScore"),
  feedbackNotes: text("feedbackNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AutonomousDecision = typeof autonomousDecisions.$inferSelect;
export type InsertAutonomousDecision = typeof autonomousDecisions.$inferInsert;

export const supplyChainEvents = mysqlTable("supplyChainEvents", {
  id: int("id").autoincrement().primaryKey(),
  eventType: mysqlEnum("eventType", ["inventory_low", "inventory_critical", "inventory_excess", "inventory_expiring", "inventory_received", "inventory_adjustment", "order_created", "order_confirmed", "order_shipped", "order_delivered", "order_cancelled", "po_created", "po_sent", "po_confirmed", "po_shipped", "po_received", "po_discrepancy", "work_order_created", "production_started", "production_completed", "production_issue", "yield_variance", "quote_received", "price_change", "lead_time_change", "supplier_issue", "shipment_booked", "shipment_picked_up", "shipment_delayed", "shipment_delivered", "customs_hold", "quality_issue", "inspection_failed", "inspection_passed", "invoice_received", "payment_due", "payment_overdue", "forecast_generated", "demand_spike", "demand_drop", "workflow_completed", "workflow_failed", "approval_needed", "escalation_triggered"]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "error", "critical"]).default("info").notNull(),
  sourceSystem: varchar("sourceSystem", { length: 64 }),
  sourceEntityType: varchar("sourceEntityType", { length: 64 }),
  sourceEntityId: int("sourceEntityId"),
  eventData: text("eventData"),
  summary: varchar("summary", { length: 500 }),
  isProcessed: boolean("isProcessed").default(false),
  processedAt: timestamp("processedAt"),
  processedByWorkflowId: int("processedByWorkflowId"),
  processedByRunId: int("processedByRunId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupplyChainEvent = typeof supplyChainEvents.$inferSelect;
export type InsertSupplyChainEvent = typeof supplyChainEvents.$inferInsert;

export const workflowMetrics = mysqlTable("workflowMetrics", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  metricDate: timestamp("metricDate").notNull(),
  totalRuns: int("totalRuns").default(0),
  successfulRuns: int("successfulRuns").default(0),
  failedRuns: int("failedRuns").default(0),
  averageDurationMs: int("averageDurationMs"),
  maxDurationMs: int("maxDurationMs"),
  autoApprovedCount: int("autoApprovedCount").default(0),
  manualApprovedCount: int("manualApprovedCount").default(0),
  rejectedCount: int("rejectedCount").default(0),
  averageApprovalTimeMs: int("averageApprovalTimeMs"),
  escalationCount: int("escalationCount").default(0),
  itemsProcessed: int("itemsProcessed").default(0),
  totalValueProcessed: decimal("totalValueProcessed", { precision: 18, scale: 2 }),
  exceptionsHandled: int("exceptionsHandled").default(0),
  aiDecisionCount: int("aiDecisionCount").default(0),
  aiOverrideCount: int("aiOverrideCount").default(0),
  averageAiConfidence: decimal("averageAiConfidence", { precision: 5, scale: 2 }),
  totalTokensUsed: int("totalTokensUsed").default(0),
  estimatedTimeSavedMinutes: int("estimatedTimeSavedMinutes"),
  estimatedCostSavings: decimal("estimatedCostSavings", { precision: 14, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowMetric = typeof workflowMetrics.$inferSelect;
export type InsertWorkflowMetric = typeof workflowMetrics.$inferInsert;

export const approvalThresholds = mysqlTable("approvalThresholds", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  entityType: mysqlEnum("entityType", ["purchase_order", "work_order", "inventory_transfer", "freight_booking", "payment", "vendor_rfq", "price_override", "exception"]).notNull(),
  autoApproveMaxAmount: decimal("autoApproveMaxAmount", { precision: 14, scale: 2 }),
  level1MaxAmount: decimal("level1MaxAmount", { precision: 14, scale: 2 }),
  level2MaxAmount: decimal("level2MaxAmount", { precision: 14, scale: 2 }),
  level3MaxAmount: decimal("level3MaxAmount", { precision: 14, scale: 2 }),
  level1Roles: text("level1Roles"),
  level2Roles: text("level2Roles"),
  level3Roles: text("level3Roles"),
  execRoles: text("execRoles"),
  level1EscalationMinutes: int("level1EscalationMinutes").default(60),
  level2EscalationMinutes: int("level2EscalationMinutes").default(120),
  level3EscalationMinutes: int("level3EscalationMinutes").default(240),
  conditions: text("conditions"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApprovalThreshold = typeof approvalThresholds.$inferSelect;
export type InsertApprovalThreshold = typeof approvalThresholds.$inferInsert;

export const exceptionRules = mysqlTable("exceptionRules", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  exceptionType: mysqlEnum("exceptionType", ["quantity_mismatch", "price_variance", "quality_issue", "delivery_delay", "stockout", "overstock", "supplier_unavailable", "capacity_constraint", "forecast_deviation", "payment_issue", "documentation_missing", "customs_issue", "other"]).notNull(),
  matchConditions: text("matchConditions"),
  varianceThresholdPercent: decimal("varianceThresholdPercent", { precision: 5, scale: 2 }),
  resolutionStrategy: mysqlEnum("resolutionStrategy", ["auto_resolve", "ai_decide", "route_to_human", "escalate", "apply_default", "notify_and_continue", "halt_workflow"]).notNull(),
  autoResolutionAction: text("autoResolutionAction"),
  defaultAction: text("defaultAction"),
  notifyRoles: text("notifyRoles"),
  assignToRole: varchar("assignToRole", { length: 64 }),
  resolveWithinMinutes: int("resolveWithinMinutes").default(60),
  escalateAfterMinutes: int("escalateAfterMinutes").default(120),
  priority: int("priority").default(100),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExceptionRule = typeof exceptionRules.$inferSelect;
export type InsertExceptionRule = typeof exceptionRules.$inferInsert;

export const exceptionLog = mysqlTable("exceptionLog", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId"),
  stepId: int("stepId"),
  ruleId: int("ruleId"),
  exceptionType: varchar("exceptionType", { length: 64 }).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  exceptionData: text("exceptionData"),
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "escalated", "ignored"]).default("open").notNull(),
  resolutionType: mysqlEnum("resolutionType", ["auto_resolved", "ai_resolved", "human_resolved", "escalated_resolved", "ignored"]),
  resolutionAction: text("resolutionAction"),
  resolutionNotes: text("resolutionNotes"),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  financialImpact: decimal("financialImpact", { precision: 14, scale: 2 }),
  operationalImpact: varchar("operationalImpact", { length: 255 }),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  dueAt: timestamp("dueAt"),
  escalatedAt: timestamp("escalatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExceptionLogEntry = typeof exceptionLog.$inferSelect;
export type InsertExceptionLogEntry = typeof exceptionLog.$inferInsert;

export const workflowNotifications = mysqlTable("workflowNotifications", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId"),
  notificationType: mysqlEnum("notificationType", ["info", "warning", "error", "approval_needed", "approval_completed", "exception", "milestone", "completion"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),
  targetRoles: text("targetRoles"),
  targetUserIds: text("targetUserIds"),
  sendEmail: boolean("sendEmail").default(false),
  sendInApp: boolean("sendInApp").default(true),
  sendSlack: boolean("sendSlack").default(false),
  isRead: boolean("isRead").default(false),
  readBy: int("readBy"),
  readAt: timestamp("readAt"),
  actionUrl: varchar("actionUrl", { length: 500 }),
  actionLabel: varchar("actionLabel", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowNotification = typeof workflowNotifications.$inferSelect;
export type InsertWorkflowNotification = typeof workflowNotifications.$inferInsert;

// ============================================
// SUPPLIER PERFORMANCE
// ============================================

export const supplierPerformance = mysqlTable("supplierPerformance", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  metricMonth: varchar("metricMonth", { length: 7 }).notNull(),
  totalOrders: int("totalOrders").default(0),
  onTimeDeliveries: int("onTimeDeliveries").default(0),
  lateDeliveries: int("lateDeliveries").default(0),
  averageLeadTimeDays: decimal("averageLeadTimeDays", { precision: 8, scale: 2 }),
  leadTimeVarianceDays: decimal("leadTimeVarianceDays", { precision: 8, scale: 2 }),
  totalItemsReceived: int("totalItemsReceived").default(0),
  qualityPassCount: int("qualityPassCount").default(0),
  qualityFailCount: int("qualityFailCount").default(0),
  qualityPassRate: decimal("qualityPassRate", { precision: 5, scale: 2 }),
  quantityMatchCount: int("quantityMatchCount").default(0),
  quantityVarianceCount: int("quantityVarianceCount").default(0),
  totalSpend: decimal("totalSpend", { precision: 18, scale: 2 }),
  averagePriceVariancePercent: decimal("averagePriceVariancePercent", { precision: 6, scale: 2 }),
  averageResponseTimeHours: decimal("averageResponseTimeHours", { precision: 8, scale: 2 }),
  issuesReported: int("issuesReported").default(0),
  issuesResolved: int("issuesResolved").default(0),
  deliveryScore: decimal("deliveryScore", { precision: 5, scale: 2 }),
  qualityScore: decimal("qualityScore", { precision: 5, scale: 2 }),
  priceScore: decimal("priceScore", { precision: 5, scale: 2 }),
  responsiveScore: decimal("responsiveScore", { precision: 5, scale: 2 }),
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }),
  aiAssessment: text("aiAssessment"),
  recommendedActions: text("recommendedActions"),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high"]).default("low"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierPerformanceRecord = typeof supplierPerformance.$inferSelect;
export type InsertSupplierPerformanceRecord = typeof supplierPerformance.$inferInsert;

// ============================================
// CODE CAPABILITY (Claude Code Integration)
// ============================================

export const codeSnippets = mysqlTable("codeSnippets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  language: varchar("language", { length: 64 }).notNull().default("typescript"),
  code: text("code").notNull(),
  tags: text("tags"), // JSON array of tag strings
  isPublic: boolean("isPublic").default(false).notNull(),
  folderId: int("folderId"),
  version: int("version").default(1).notNull(),
  parentSnippetId: int("parentSnippetId"), // for version history
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CodeSnippet = typeof codeSnippets.$inferSelect;
export type InsertCodeSnippet = typeof codeSnippets.$inferInsert;

export const codeExecutions = mysqlTable("codeExecutions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  snippetId: int("snippetId").references(() => codeSnippets.id),
  language: varchar("language", { length: 64 }).notNull(),
  code: text("code").notNull(),
  output: text("output"),
  errorOutput: text("errorOutput"),
  exitCode: int("exitCode"),
  executionTimeMs: int("executionTimeMs"),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "timeout"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// R&D TAX CREDIT (IRC SECTION 41)
// ============================================

export const rdTaxCreditStudies = mysqlTable("rd_tax_credit_studies", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  taxYear: int("taxYear").notNull(),
  studyName: varchar("studyName", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "in_progress", "under_review", "filed", "amended"]).default("draft").notNull(),
  calculationMethod: mysqlEnum("calculationMethod", ["regular", "asc"]).default("asc").notNull(),
  // Qualified Research Expenses (QREs)
  totalWageQre: decimal("totalWageQre", { precision: 15, scale: 2 }).default("0"),
  totalSupplyQre: decimal("totalSupplyQre", { precision: 15, scale: 2 }).default("0"),
  totalContractQre: decimal("totalContractQre", { precision: 15, scale: 2 }).default("0"),
  totalQre: decimal("totalQre", { precision: 15, scale: 2 }).default("0"),
  // Base amount for Regular Credit method
  baseAmount: decimal("baseAmount", { precision: 15, scale: 2 }).default("0"),
  fixedBasePercentage: decimal("fixedBasePercentage", { precision: 10, scale: 6 }).default("0"),
  // ASC method: average QREs for prior 3 years
  priorYear1Qre: decimal("priorYear1Qre", { precision: 15, scale: 2 }).default("0"),
  priorYear2Qre: decimal("priorYear2Qre", { precision: 15, scale: 2 }).default("0"),
  priorYear3Qre: decimal("priorYear3Qre", { precision: 15, scale: 2 }).default("0"),
  averagePriorQre: decimal("averagePriorQre", { precision: 15, scale: 2 }).default("0"),
  // Calculated credit
  grossCredit: decimal("grossCredit", { precision: 15, scale: 2 }).default("0"),
  section280CReduction: decimal("section280CReduction", { precision: 15, scale: 2 }).default("0"),
  netCredit: decimal("netCredit", { precision: 15, scale: 2 }).default("0"),
  // Gross receipts for base period (Regular Credit)
  currentYearGrossReceipts: decimal("currentYearGrossReceipts", { precision: 15, scale: 2 }).default("0"),
  averageBasePeriodGrossReceipts: decimal("averageBasePeriodGrossReceipts", { precision: 15, scale: 2 }).default("0"),
  // Filing info
  filingDate: timestamp("filingDate"),
  formNumber: varchar("formNumber", { length: 20 }).default("6765"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RdTaxCreditStudy = typeof rdTaxCreditStudies.$inferSelect;
export type InsertRdTaxCreditStudy = typeof rdTaxCreditStudies.$inferInsert;

export const rdProjects = mysqlTable("rd_projects", {
  id: int("id").autoincrement().primaryKey(),
  studyId: int("studyId").notNull(),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  description: text("description"),
  businessComponent: varchar("businessComponent", { length: 255 }),
  // Four-Part Test documentation
  technologicalInNature: boolean("technologicalInNature").default(false),
  technologicalNatureNotes: text("technologicalNatureNotes"),
  eliminationOfUncertainty: boolean("eliminationOfUncertainty").default(false),
  eliminationOfUncertaintyNotes: text("eliminationOfUncertaintyNotes"),
  processOfExperimentation: boolean("processOfExperimentation").default(false),
  processOfExperimentationNotes: text("processOfExperimentationNotes"),
  permittedPurpose: boolean("permittedPurpose").default(false),
  permittedPurposeNotes: text("permittedPurposeNotes"),
  qualifies: boolean("qualifies").default(false),
  // Project financials
  totalProjectQre: decimal("totalProjectQre", { precision: 15, scale: 2 }).default("0"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  status: mysqlEnum("status", ["active", "completed", "excluded"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RdProject = typeof rdProjects.$inferSelect;
export type InsertRdProject = typeof rdProjects.$inferInsert;

export const rdExpenses = mysqlTable("rd_expenses", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  studyId: int("studyId").notNull(),
  category: mysqlEnum("category", ["wages", "supplies", "contract_research", "cloud_computing"]).notNull(),
  description: varchar("description", { length: 500 }),
  // Employee info (for wage QREs)
  employeeId: int("employeeId"),
  employeeName: varchar("employeeName", { length: 255 }),
  rdPercentage: decimal("rdPercentage", { precision: 5, scale: 2 }).default("100"),
  // Amounts
  grossAmount: decimal("grossAmount", { precision: 15, scale: 2 }).notNull(),
  qualifiedAmount: decimal("qualifiedAmount", { precision: 15, scale: 2 }).notNull(),
  // Contract research is 65% qualified
  contractResearchRate: decimal("contractResearchRate", { precision: 5, scale: 2 }).default("65"),
  vendorId: int("vendorId"),
  vendorName: varchar("vendorName", { length: 255 }),
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RdExpense = typeof rdExpenses.$inferSelect;
export type InsertRdExpense = typeof rdExpenses.$inferInsert;
export type CodeExecution = typeof codeExecutions.$inferSelect;
export type InsertCodeExecution = typeof codeExecutions.$inferInsert;

export const codeAiSessions = mysqlTable("codeAiSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  snippetId: int("snippetId").references(() => codeSnippets.id),
  action: mysqlEnum("action", ["generate", "explain", "debug", "refactor", "review", "test", "document", "optimize"]).notNull(),
  prompt: text("prompt").notNull(),
  inputCode: text("inputCode"),
  outputCode: text("outputCode"),
  explanation: text("explanation"),
  model: varchar("model", { length: 128 }),
  tokensUsed: int("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CodeAiSession = typeof codeAiSessions.$inferSelect;
export type InsertCodeAiSession = typeof codeAiSessions.$inferInsert;

// ============================================
// MARKETING — VIDEO ASSETS & SOCIAL POSTING
// ============================================

// One uploaded video, optionally with multiple orientation-specific cuts.
// Availability is determined by which of `horizontalUrl`, `verticalUrl`,
// and `squareUrl` are populated so the publisher can match each platform
// to its preferred orientation.
export const marketingVideos = mysqlTable("marketing_videos", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  // Storage URLs for each available cut. Null = that aspect ratio is not provided.
  horizontalUrl: text("horizontalUrl"),
  verticalUrl: text("verticalUrl"),
  squareUrl: text("squareUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  durationSec: int("durationSec"),
  // Comma-separated tags / hashtags reused across platforms.
  tags: text("tags"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingVideo = typeof marketingVideos.$inferSelect;
export type InsertMarketingVideo = typeof marketingVideos.$inferInsert;

// One row per (video, platform) attempt. The publisher writes one of these
// for each platform fan-out and updates `status`/`externalId` as the upload
// progresses.
export const socialPosts = mysqlTable("social_posts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  videoId: int("videoId").notNull(),
  platform: mysqlEnum("platform", [
    "tiktok",
    "youtube",
    "youtube_shorts",
    "instagram_reels",
    "instagram_feed",
  ]).notNull(),
  // Which cut was actually published — picked by the platform-fit selector.
  aspectRatio: mysqlEnum("aspectRatio", ["horizontal", "vertical", "square"]).notNull(),
  caption: text("caption"),
  hashtags: text("hashtags"),
  status: mysqlEnum("status", [
    "pending",
    "scheduled",
    "uploading",
    "published",
    "failed",
    "skipped",
  ]).default("pending").notNull(),
  // Skipped means the user requested this platform but no compatible cut was
  // available (e.g. TikTok with horizontal-only video). Stored so the UI can
  // explain the gap.
  skipReason: varchar("skipReason", { length: 256 }),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  externalId: varchar("externalId", { length: 256 }),
  externalUrl: text("externalUrl"),
  errorMessage: text("errorMessage"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = typeof socialPosts.$inferInsert;

// Per-company OAuth credentials for each social platform. Tokens are stored
// encrypted-at-rest at the DB level (existing infra); rotation handled by the
// platform-specific refresh helpers.
export const socialPlatformCredentials = mysqlTable("social_platform_credentials", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  platform: mysqlEnum("platform", ["tiktok", "youtube", "instagram"]).notNull(),
  accountHandle: varchar("accountHandle", { length: 256 }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  externalAccountId: varchar("externalAccountId", { length: 256 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocialPlatformCredential = typeof socialPlatformCredentials.$inferSelect;
export type InsertSocialPlatformCredential = typeof socialPlatformCredentials.$inferInsert;

// ============================================
// QUICK NOTES — Apple-Notes-style capture that an LLM parses
// into actionable items routed elsewhere (tasks, CRM, etc.)
// ============================================

export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["draft", "parsed", "applied", "discarded"]).default("draft").notNull(),
  // LLM-detected items.
  parsedItems: json("parsedItems").$type<NoteParseResult>(),
  // What we actually inserted on apply.
  appliedItems: json("appliedItems").$type<NoteAppliedItem[]>(),
  parseError: text("parseError"),
  parsedAt: timestamp("parsedAt"),
  appliedAt: timestamp("appliedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;

// ─── EMAIL SEQUENCES ──────────────────────────────────────────────────────────

export const emailSequences = mysqlTable("email_sequences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "active", "paused", "archived"]).default("draft").notNull(),
  totalContacts: int("totalContacts").default(0).notNull(),
  openRate: decimal("openRate", { precision: 5, scale: 2 }),
  replyRate: decimal("replyRate", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertEmailSequence = typeof emailSequences.$inferInsert;

export const emailSequenceSteps = mysqlTable("email_sequence_steps", {
  id: int("id").autoincrement().primaryKey(),
  sequenceId: int("sequenceId").notNull().references(() => emailSequences.id),
  stepOrder: int("stepOrder").notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  delayDays: int("delayDays").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailSequenceStep = typeof emailSequenceSteps.$inferSelect;
export type InsertEmailSequenceStep = typeof emailSequenceSteps.$inferInsert;

// ─── EMAIL CANNED RESPONSES ───────────────────────────────────────────────────

export const emailCannedResponses = mysqlTable("email_canned_responses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 50 }),
  category: varchar("category", { length: 100 }),
  usageCount: int("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailCannedResponse = typeof emailCannedResponses.$inferSelect;
export type InsertEmailCannedResponse = typeof emailCannedResponses.$inferInsert;

// ============================================
// PROJECT MANAGEMENT MODULE (Market × Function matrix)
// Tables prefixed `pm_` to namespace cleanly. Built for tracking
// international market expansion as a grid of (Market × Function) cells.
// See docs/pm-module.md for the full data model rationale.
// ============================================

export const pmMarkets = mysqlTable("pm_markets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  tier: int("tier").notNull().default(3),
  status: mysqlEnum("status", ["active", "planning", "watchlist", "paused"]).default("watchlist").notNull(),
  entityType: mysqlEnum("entity_type", ["jv", "owned", "copacker", "distributor"]).default("distributor").notNull(),
  partnerName: varchar("partnerName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PmMarket = typeof pmMarkets.$inferSelect;
export type InsertPmMarket = typeof pmMarkets.$inferInsert;

export const pmFunctions = mysqlTable("pm_functions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PmFunction = typeof pmFunctions.$inferSelect;
export type InsertPmFunction = typeof pmFunctions.$inferInsert;

export const pmPrograms = mysqlTable("pm_programs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  marketId: int("marketId").notNull().references(() => pmMarkets.id),
  description: text("description"),
  startDate: timestamp("startDate"),
  targetEndDate: timestamp("targetEndDate"),
  actualEndDate: timestamp("actualEndDate"),
  status: mysqlEnum("status", ["not_started", "in_progress", "blocked", "complete", "cancelled"]).default("not_started").notNull(),
  ownerUserId: int("ownerUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PmProgram = typeof pmPrograms.$inferSelect;
export type InsertPmProgram = typeof pmPrograms.$inferInsert;

export const pmProjects = mysqlTable("pm_projects", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  programId: int("programId").references(() => pmPrograms.id),
  // Denormalized market_id + function_id so matrix view can filter without joins.
  marketId: int("marketId").notNull().references(() => pmMarkets.id),
  functionId: int("functionId").notNull().references(() => pmFunctions.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  startDate: timestamp("startDate"),
  targetEndDate: timestamp("targetEndDate"),
  actualEndDate: timestamp("actualEndDate"),
  status: mysqlEnum("status", ["not_started", "in_progress", "blocked", "complete", "cancelled"]).default("not_started").notNull(),
  priority: mysqlEnum("priority", ["p0", "p1", "p2", "p3"]).default("p2").notNull(),
  ownerUserId: int("ownerUserId"),
  // Cash event triggers a push to financial_model when status -> complete.
  cashEventAmount: decimal("cashEventAmount", { precision: 18, scale: 2 }),
  cashEventType: mysqlEnum("cash_event_type", ["revenue", "capex", "opex", "funding"]),
  cashEventDate: timestamp("cashEventDate"),
  blockerReason: text("blockerReason"),
  blockedSince: timestamp("blockedSince"),
  atRisk: boolean("atRisk").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PmProject = typeof pmProjects.$inferSelect;
export type InsertPmProject = typeof pmProjects.$inferInsert;

export const pmTasks = mysqlTable("pm_tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  assigneeUserId: int("assigneeUserId"),
  status: mysqlEnum("status", ["todo", "in_progress", "blocked", "done"]).default("todo").notNull(),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  orderIndex: int("orderIndex").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PmTask = typeof pmTasks.$inferSelect;
export type InsertPmTask = typeof pmTasks.$inferInsert;

export const pmDependencies = mysqlTable("pm_dependencies", {
  id: int("id").autoincrement().primaryKey(),
  predecessorProjectId: int("predecessorProjectId").notNull().references((): AnyMySqlColumn => pmProjects.id),
  successorProjectId: int("successorProjectId").notNull().references((): AnyMySqlColumn => pmProjects.id),
  dependencyType: mysqlEnum("dependency_type", ["blocks", "related", "informs"]).default("blocks").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PmDependency = typeof pmDependencies.$inferSelect;
export type InsertPmDependency = typeof pmDependencies.$inferInsert;

export const pmMilestones = mysqlTable("pm_milestones", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id),
  name: varchar("name", { length: 255 }).notNull(),
  targetDate: timestamp("targetDate").notNull(),
  actualDate: timestamp("actualDate"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PmMilestone = typeof pmMilestones.$inferSelect;
export type InsertPmMilestone = typeof pmMilestones.$inferInsert;

// ============================================
// MULTI-TIER PRICE BOOK & REGIONAL SKUS
// ============================================

// Per-region, per-channel price book entries (e.g. SA Foodservice base, SA Retail wholesale, SA Retail MSRP).
// A product can have many price tiers across regions, channels, and effective windows.
export const productPriceTiers = mysqlTable("product_price_tiers", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id),
  region: varchar("region", { length: 8 }).notNull(), // ISO-3166-1 alpha-2 ("SA","IN","US","ZA","EU") or "GLOBAL"
  channel: mysqlEnum("channel", [
    "foodservice", "wholesale", "retail_msrp", "retail_dtc", "export", "institutional", "online", "other"
  ]).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  packSize: varchar("packSize", { length: 64 }), // "2 kg / 5 kg", "500 g"
  unitOfMeasure: varchar("unitOfMeasure", { length: 16 }).default("kg"), // kg, g, unit, case
  pricePerUnit: decimal("pricePerUnit", { precision: 15, scale: 4 }).notNull(),
  taxMode: mysqlEnum("taxMode", ["exclusive", "inclusive", "exempt"]).default("exclusive").notNull(),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }), // % VAT/GST
  minOrderQty: decimal("minOrderQty", { precision: 15, scale: 4 }),
  effectiveFrom: timestamp("effectiveFrom").notNull(),
  effectiveTo: timestamp("effectiveTo"), // null = open ended (current price)
  status: mysqlEnum("status", ["draft", "active", "superseded", "archived"]).default("active").notNull(),
  contractOnly: boolean("contractOnly").default(false), // e.g. "Contract pricing for 500 kg+ recurring"
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductPriceTier = typeof productPriceTiers.$inferSelect;
export type InsertProductPriceTier = typeof productPriceTiers.$inferInsert;

// Volume discount bands attached to a price tier (e.g. 25-99 kg = 0%, 100-249 = -5%).
export const productVolumeDiscounts = mysqlTable("product_volume_discounts", {
  id: int("id").autoincrement().primaryKey(),
  priceTierId: int("priceTierId").notNull().references(() => productPriceTiers.id),
  minQty: decimal("minQty", { precision: 15, scale: 4 }).notNull(),
  maxQty: decimal("maxQty", { precision: 15, scale: 4 }), // null = unbounded ("500 kg +")
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  discountAmount: decimal("discountAmount", { precision: 15, scale: 4 }), // flat per-unit alternative
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductVolumeDiscount = typeof productVolumeDiscounts.$inferSelect;
export type InsertProductVolumeDiscount = typeof productVolumeDiscounts.$inferInsert;

// Region-specific SKU variants linked to a parent product (e.g. SH-BWS-001-SA, SH-BWS-001-IN).
export const productRegionalSkus = mysqlTable("product_regional_skus", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id),
  region: varchar("region", { length: 8 }).notNull(),
  regionalSku: varchar("regionalSku", { length: 64 }).notNull(),
  barcode: varchar("barcode", { length: 32 }), // EAN-13, UPC, etc.
  barcodeType: mysqlEnum("barcodeType", ["ean13", "upc", "gtin14", "code128", "other"]),
  gs1Prefix: varchar("gs1Prefix", { length: 8 }), // e.g. "890" for India
  localName: varchar("localName", { length: 255 }),
  localDescription: text("localDescription"),
  packagingFormat: varchar("packagingFormat", { length: 128 }), // "200ml Tetra Pak", "500 g retort pouch"
  status: mysqlEnum("status", ["planned", "active", "discontinued"]).default("planned").notNull(),
  launchedAt: timestamp("launchedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductRegionalSku = typeof productRegionalSkus.$inferSelect;
export type InsertProductRegionalSku = typeof productRegionalSkus.$inferInsert;

// ============================================
// GOVERNMENT TENDERS (GeM, IRCTC, ICDS, CSD, AIIMS, state nutrition...)
// ============================================

export const governmentTenders = mysqlTable("government_tenders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  title: varchar("title", { length: 500 }).notNull(),
  portal: mysqlEnum("portal", [
    "gem", "irctc", "icds", "csd", "aiims", "state_nutrition", "state_hospital",
    "ministry_defense", "ministry_railways", "ministry_health", "ministry_food",
    "eu_ted", "us_sam_gov", "uk_contracts_finder", "other"
  ]).notNull(),
  customPortalName: varchar("customPortalName", { length: 255 }),
  category: mysqlEnum("category", [
    "food_supply", "defense_canteen", "midday_meal", "hospital_procurement",
    "railway_catering", "school_nutrition", "humanitarian_aid", "other"
  ]).default("food_supply").notNull(),
  solicitationNumber: varchar("solicitationNumber", { length: 128 }),
  agency: varchar("agency", { length: 255 }),
  country: varchar("country", { length: 8 }),
  state: varchar("state", { length: 64 }),
  // Dates
  publishedDate: timestamp("publishedDate"),
  submissionDeadline: timestamp("submissionDeadline"),
  bidOpeningDate: timestamp("bidOpeningDate"),
  awardDate: timestamp("awardDate"),
  contractStartDate: timestamp("contractStartDate"),
  contractEndDate: timestamp("contractEndDate"),
  // Financials
  estimatedValue: decimal("estimatedValue", { precision: 18, scale: 2 }),
  bidAmount: decimal("bidAmount", { precision: 18, scale: 2 }),
  awardedAmount: decimal("awardedAmount", { precision: 18, scale: 2 }),
  emdAmount: decimal("emdAmount", { precision: 15, scale: 2 }), // earnest money deposit
  emdRefundedAt: timestamp("emdRefundedAt"),
  currency: varchar("currency", { length: 3 }).default("INR"),
  // Status
  status: mysqlEnum("status", [
    "watching", "qualifying", "preparing", "submitted", "under_review",
    "shortlisted", "awarded", "lost", "withdrawn", "cancelled"
  ]).default("watching").notNull(),
  // Compliance
  classILocalSupplier: boolean("classILocalSupplier").default(false), // GeM Class I status
  fssaiRequired: boolean("fssaiRequired").default(false),
  bomRequired: boolean("bomRequired").default(false),
  bankGuaranteeRequired: boolean("bankGuaranteeRequired").default(false),
  // Contacts & links
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  portalUrl: text("portalUrl"),
  // Links
  projectId: int("projectId").references(() => projects.id),
  ownerId: int("ownerId").references(() => users.id),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GovernmentTender = typeof governmentTenders.$inferSelect;
export type InsertGovernmentTender = typeof governmentTenders.$inferInsert;

// ============================================
// REGULATORY LICENSE REGISTRY (FSSAI, DPIIT, EFSA Novel Food, FDA, USDA, ...)
// ============================================

export const regulatoryLicenses = mysqlTable("regulatory_licenses", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  licenseType: mysqlEnum("licenseType", [
    "fssai_central", "fssai_state", "fssai_basic",
    "dpiit_startup_india",
    "efsa_novel_food", "fic_1169_2011_label", "traces_nt", "eu_organic",
    "fda_food_facility", "fda_ffr", "usda_organic", "usda_amS",
    "haccp", "iso_22000", "brc", "sqf",
    "halal", "kosher", "non_gmo", "vegan_certified",
    "gst_registration", "iec_import_export", "rcmc",
    "pmksy_grant", "maharashtra_agro_grant", "karnataka_udyog_mitra",
    "trademark", "patent", "copyright",
    "other"
  ]).notNull(),
  customTypeName: varchar("customTypeName", { length: 255 }),
  country: varchar("country", { length: 8 }).notNull(),
  state: varchar("state", { length: 64 }),
  authority: varchar("authority", { length: 255 }), // issuing body name
  licenseNumber: varchar("licenseNumber", { length: 128 }),
  status: mysqlEnum("status", [
    "planned", "applied", "in_review", "issued", "active",
    "expiring_soon", "expired", "revoked", "renewed", "rejected", "withdrawn"
  ]).default("planned").notNull(),
  // Dates
  appliedDate: timestamp("appliedDate"),
  issuedDate: timestamp("issuedDate"),
  expirationDate: timestamp("expirationDate"),
  renewalDueDate: timestamp("renewalDueDate"),
  renewalReminderDays: int("renewalReminderDays").default(60),
  lastRenewedAt: timestamp("lastRenewedAt"),
  // Cost
  applicationFee: decimal("applicationFee", { precision: 15, scale: 2 }),
  annualFee: decimal("annualFee", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  // Coverage
  coversFacilityId: int("coversFacilityId").references(() => warehouses.id),
  coversProductIds: json("coversProductIds"), // optional JSON array of product ids
  // Contacts
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  portalUrl: text("portalUrl"),
  documentUrl: text("documentUrl"), // scan of the issued license
  // Ownership
  responsibleUserId: int("responsibleUserId").references(() => users.id),
  projectId: int("projectId").references(() => projects.id),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RegulatoryLicense = typeof regulatoryLicenses.$inferSelect;
export type InsertRegulatoryLicense = typeof regulatoryLicenses.$inferInsert;

// ============================================
// SUBSIDIARY FUNDRAISING ROUNDS
// (kept separate from parent capTable — for India JV, etc.)
// ============================================

export const subsidiaryFundraisingRounds = mysqlTable("subsidiary_fundraising_rounds", {
  id: int("id").autoincrement().primaryKey(),
  subsidiaryCompanyId: int("subsidiaryCompanyId").notNull().references(() => companies.id),
  parentCompanyId: int("parentCompanyId").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(), // "India Series Seed"
  roundType: mysqlEnum("roundType", [
    "pre_seed", "seed", "series_a", "series_b", "series_c",
    "bridge", "convertible_note", "safe", "debt", "grant", "strategic", "other"
  ]).notNull(),
  targetAmount: decimal("targetAmount", { precision: 18, scale: 2 }),
  raisedAmount: decimal("raisedAmount", { precision: 18, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  preMoneyValuation: decimal("preMoneyValuation", { precision: 18, scale: 2 }),
  postMoneyValuation: decimal("postMoneyValuation", { precision: 18, scale: 2 }),
  parentOwnershipPctBefore: decimal("parentOwnershipPctBefore", { precision: 6, scale: 3 }),
  parentOwnershipPctAfter: decimal("parentOwnershipPctAfter", { precision: 6, scale: 3 }),
  leadInvestorName: varchar("leadInvestorName", { length: 255 }),
  openedDate: timestamp("openedDate"),
  closedDate: timestamp("closedDate"),
  status: mysqlEnum("status", ["planning", "open", "closing", "closed", "cancelled"]).default("planning").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubsidiaryFundraisingRound = typeof subsidiaryFundraisingRounds.$inferSelect;
export type InsertSubsidiaryFundraisingRound = typeof subsidiaryFundraisingRounds.$inferInsert;

export const subsidiaryFundraisingInvestors = mysqlTable("subsidiary_fundraising_investors", {
  id: int("id").autoincrement().primaryKey(),
  roundId: int("roundId").notNull().references(() => subsidiaryFundraisingRounds.id),
  investorName: varchar("investorName", { length: 255 }).notNull(),
  investorType: mysqlEnum("investorType", [
    "individual", "angel", "vc", "pe", "corporate", "government", "family_office",
    "crowd", "strategic", "employee", "other"
  ]).default("individual").notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  country: varchar("country", { length: 8 }),
  commitmentAmount: decimal("commitmentAmount", { precision: 18, scale: 2 }),
  fundedAmount: decimal("fundedAmount", { precision: 18, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  ownershipPct: decimal("ownershipPct", { precision: 6, scale: 3 }),
  status: mysqlEnum("status", [
    "introduced", "in_diligence", "term_sheet", "committed",
    "wired", "closed", "declined", "lapsed"
  ]).default("introduced").notNull(),
  contactId: int("contactId").references(() => crmContacts.id),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubsidiaryFundraisingInvestor = typeof subsidiaryFundraisingInvestors.$inferSelect;
export type InsertSubsidiaryFundraisingInvestor = typeof subsidiaryFundraisingInvestors.$inferInsert;

// ============================================
// BRAND AMBASSADORS / INFLUENCERS / CHARACTERS
// (celebrity, athlete, animated character — pipeline + active partnerships)
// ============================================

export const brandAmbassadors = mysqlTable("brand_ambassadors", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", [
    "celebrity", "athlete", "influencer", "chef", "musician", "actor",
    "podcaster", "youtuber", "streamer", "model", "creator",
    "animated_character", "fictional_character", "mascot", "other"
  ]).notNull(),
  category: varchar("category", { length: 128 }), // "cricket", "bollywood", "olympic", "food", "fitness"
  country: varchar("country", { length: 8 }),
  region: varchar("region", { length: 64 }),
  // Reach
  socialHandles: json("socialHandles"), // { instagram, x, tiktok, youtube, ... }
  followerCount: bigint("followerCount", { mode: "number" }), // aggregate
  followerCountByPlatform: json("followerCountByPlatform"),
  estimatedReach: bigint("estimatedReach", { mode: "number" }),
  // Pipeline
  stage: mysqlEnum("stage", [
    "shortlist", "prospect", "contacted", "in_negotiation",
    "term_sheet", "signed", "active", "paused", "ended", "declined", "blacklisted"
  ]).default("prospect").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium"),
  // Representation
  agencyName: varchar("agencyName", { length: 255 }),
  agentName: varchar("agentName", { length: 255 }),
  agentEmail: varchar("agentEmail", { length: 320 }),
  agentPhone: varchar("agentPhone", { length: 32 }),
  // Deal
  campaignName: varchar("campaignName", { length: 255 }),
  contractStartDate: timestamp("contractStartDate"),
  contractEndDate: timestamp("contractEndDate"),
  contractValue: decimal("contractValue", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentTerms: varchar("paymentTerms", { length: 255 }),
  deliverables: text("deliverables"), // free text or JSON-encoded list
  exclusivity: text("exclusivity"),
  usageRights: text("usageRights"),
  // Links
  contactId: int("contactId").references(() => crmContacts.id),
  projectId: int("projectId").references(() => projects.id),
  ownerUserId: int("ownerUserId").references(() => users.id),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BrandAmbassador = typeof brandAmbassadors.$inferSelect;
export type InsertBrandAmbassador = typeof brandAmbassadors.$inferInsert;

// Ambassador activity log (touchpoints, deliverables shipped, posts published).
export const brandAmbassadorActivities = mysqlTable("brand_ambassador_activities", {
  id: int("id").autoincrement().primaryKey(),
  ambassadorId: int("ambassadorId").notNull().references(() => brandAmbassadors.id),
  activityType: mysqlEnum("activityType", [
    "outreach", "meeting", "call", "email", "proposal_sent",
    "contract_sent", "contract_signed", "content_published",
    "appearance", "shipment", "payment", "note"
  ]).notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  summary: varchar("summary", { length: 500 }),
  details: text("details"),
  postUrl: text("postUrl"),
  impressions: bigint("impressions", { mode: "number" }),
  engagements: bigint("engagements", { mode: "number" }),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BrandAmbassadorActivity = typeof brandAmbassadorActivities.$inferSelect;
export type InsertBrandAmbassadorActivity = typeof brandAmbassadorActivities.$inferInsert;

// ============================================
// OPS TOOLKIT
// Stackby-style capabilities layered on top of the fixed ERP schema:
//   1. savedViews          — grid/kanban/calendar/timeline configs per module
//   2. intakeForms (+subs) — self-serve intake forms that capture into the ERP
//   3. automationRules     — lightweight trigger -> condition -> action rules
//   4. savedReports        — saved pivot/report configurations
// These are team-shared (single-org) records; createdBy tracks authorship.
// See shared/opsToolkit.ts for the JSON-column shapes.
// ============================================

// Item 1 — saved views over an existing ERP module's records.
export const savedViews = mysqlTable("savedViews", {
  id: int("id").autoincrement().primaryKey(),
  module: varchar("module", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  viewType: mysqlEnum("viewType", ["grid", "kanban", "calendar", "timeline"]).default("grid").notNull(),
  // ViewConfig from shared/opsToolkit.ts
  config: json("config"),
  isShared: boolean("isShared").default(true).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedView = typeof savedViews.$inferSelect;
export type InsertSavedView = typeof savedViews.$inferInsert;

// Item 2 — intake form definitions.
export const intakeForms = mysqlTable("intakeForms", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  // FormField[] from shared/opsToolkit.ts
  fields: json("fields"),
  // Optional ERP module submissions are intended for (informational routing).
  targetModule: varchar("targetModule", { length: 64 }),
  isPublished: boolean("isPublished").default(false).notNull(),
  // When true, anonymous (unauthenticated) visitors may submit via the public link.
  isPublic: boolean("isPublic").default(false).notNull(),
  submitMessage: text("submitMessage"),
  // Comma-separated notification recipients emailed on each submission.
  notifyEmails: varchar("notifyEmails", { length: 500 }),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IntakeForm = typeof intakeForms.$inferSelect;
export type InsertIntakeForm = typeof intakeForms.$inferInsert;

// Item 2 — submissions captured by an intake form.
export const intakeFormSubmissions = mysqlTable("intakeFormSubmissions", {
  id: int("id").autoincrement().primaryKey(),
  formId: int("formId").notNull().references(() => intakeForms.id),
  // { [fieldId]: value } keyed by FormField.id
  data: json("data"),
  status: mysqlEnum("status", ["new", "reviewed", "archived"]).default("new").notNull(),
  submittedByUserId: int("submittedByUserId"),
  submittedByEmail: varchar("submittedByEmail", { length: 320 }),
  submittedByName: varchar("submittedByName", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IntakeFormSubmission = typeof intakeFormSubmissions.$inferSelect;
export type InsertIntakeFormSubmission = typeof intakeFormSubmissions.$inferInsert;

// Item 3 — automation rules (trigger -> conditions -> action).
export const automationRules = mysqlTable("automationRules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  module: varchar("module", { length: 64 }).notNull(),
  triggerType: mysqlEnum("triggerType", [
    "record_created", "record_updated", "field_changed", "form_submitted", "scheduled",
  ]).notNull(),
  // AutomationTriggerConfig from shared/opsToolkit.ts
  triggerConfig: json("triggerConfig"),
  // AutomationCondition[] from shared/opsToolkit.ts
  conditions: json("conditions"),
  actionType: mysqlEnum("actionType", ["send_email", "create_notification", "webhook"]).notNull(),
  // AutomationActionConfig from shared/opsToolkit.ts
  actionConfig: json("actionConfig"),
  isActive: boolean("isActive").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  runCount: int("runCount").default(0).notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = typeof automationRules.$inferInsert;

// Item 3 — per-execution log for automation rules.
export const automationRuns = mysqlTable("automationRuns", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull().references(() => automationRules.id),
  status: mysqlEnum("status", ["success", "failed", "skipped"]).notNull(),
  triggerContext: json("triggerContext"),
  result: text("result"),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AutomationRun = typeof automationRuns.$inferSelect;
export type InsertAutomationRun = typeof automationRuns.$inferInsert;

// Item 4 — saved pivot/report configurations.
export const savedReports = mysqlTable("savedReports", {
  id: int("id").autoincrement().primaryKey(),
  module: varchar("module", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  // PivotConfig from shared/opsToolkit.ts
  pivotConfig: json("pivotConfig"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedReport = typeof savedReports.$inferSelect;
export type InsertSavedReport = typeof savedReports.$inferInsert;

// ============================================
// RECRUITING CANDIDATES
// Server-backed candidate pipeline (previously local-only on the Recruiting
// page). Persisting these enables the Ops Toolkit views/reports over recruiting.
// ============================================
export const recruitingCandidates = mysqlTable("recruiting_candidates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  position: varchar("position", { length: 200 }),
  stage: mysqlEnum("stage", [
    "applied", "screening", "interview", "assessment", "offer", "hired", "rejected",
  ]).default("applied").notNull(),
  score: int("score"),
  resume: text("resume"),
  notes: text("notes"),
  source: varchar("source", { length: 64 }).default("other"),
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
  interviewDate: timestamp("interviewDate"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecruitingCandidate = typeof recruitingCandidates.$inferSelect;
export type InsertRecruitingCandidate = typeof recruitingCandidates.$inferInsert;
