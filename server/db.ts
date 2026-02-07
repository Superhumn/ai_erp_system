import { eq, desc, and, sql, gte, lte, lt, like, or, count, sum, isNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, companies, customers, vendors, products,
  accounts, invoices, invoiceItems, payments, transactions, transactionLines,
  orders, orderItems, inventory, warehouses, productionBatches,
  purchaseOrders, purchaseOrderItems, shipments,
  departments, employees, compensationHistory, employeePayments,
  contracts, contractKeyDates, disputes, documents,
  projects, projectMilestones, projectTasks,
  auditLogs, notifications, integrationConfigs, aiConversations, aiMessages,
  googleOAuthTokens, InsertGoogleOAuthToken,
  quickbooksOAuthTokens, InsertQuickBooksOAuthToken,
  freightCarriers, freightRfqs, freightQuotes, freightEmails,
  customsClearances, customsDocuments, freightBookings,
  inventoryTransfers, inventoryTransferItems,
  teamInvitations, userPermissions,
  billOfMaterials, bomComponents, rawMaterials, bomVersionHistory,
  workOrders, workOrderMaterials, rawMaterialInventory, rawMaterialTransactions,
  purchaseOrderRawMaterials, poReceivingRecords, poReceivingItems,
  demandForecasts, productionPlans, materialRequirements, suggestedPurchaseOrders, suggestedPoItems, forecastAccuracy,
  // New lot/batch tracking tables
  inventoryLots, inventoryBalances, inventoryTransactions, workOrderOutputs,
  // Alert system
  alerts, recommendations,
  // Shopify integration
  shopifyStores, webhookEvents, shopifySkuMappings, shopifyLocationMappings,
  // Sales orders and reservations
  salesOrders, salesOrderLines, inventoryReservations,
  // Inventory allocation
  inventoryAllocations, salesEvents,
  // Sync logs
  syncLogs,
  // Notification preferences
  notificationPreferences,
  // Reconciliation
  reconciliationRuns, reconciliationLines,
  // Email scanning
  inboundEmails, emailAttachments, parsedDocuments, parsedDocumentLineItems, autoReplyRules, sentEmails,
  // Data room
  dataRooms, dataRoomFolders, dataRoomDocuments, dataRoomLinks, dataRoomVisitors, documentViews, dataRoomInvitations,
  // NDA e-signatures
  ndaDocuments, ndaSignatures, ndaSignatureAuditLog,
  // IMAP credentials
  imapCredentials,
  // Email credentials and scheduled scans
  emailCredentials, scheduledEmailScans, emailScanLogs,
  // Recurring invoices
  recurringInvoices, recurringInvoiceItems, recurringInvoiceHistory,
  // Supplier portal
  supplierPortalSessions, supplierDocuments, supplierFreightInfo,
  // AI Agent system
  aiAgentTasks, aiAgentRules, aiAgentLogs, emailTemplates,
  // Vendor Quote Management
  vendorRfqs, vendorQuotes, vendorRfqEmails, vendorRfqInvitations,
  InsertCompany, InsertCustomer, InsertVendor, InsertProduct,
  InsertAccount, InsertInvoice, InsertPayment, InsertTransaction,
  InsertOrder, InsertInventory, InsertPurchaseOrder, InsertWarehouse,
  InsertEmployee, InsertContract, InsertDispute, InsertDocument,
  InsertProject, InsertAuditLog,
  InsertFreightCarrier, InsertFreightRfq, InsertFreightQuote, InsertFreightEmail,
  InsertCustomsClearance, InsertCustomsDocument, InsertFreightBooking,
  InsertInventoryTransfer, InsertInventoryTransferItem,
  InsertTeamInvitation, InsertUserPermission,
  InsertBillOfMaterials, InsertBomComponent, InsertRawMaterial, InsertBomVersionHistory,
  InsertWorkOrder, InsertWorkOrderMaterial, InsertRawMaterialInventory, InsertRawMaterialTransaction,
  InsertPurchaseOrderRawMaterial, InsertPoReceivingRecord, InsertPoReceivingItem,
  InsertDemandForecast, InsertProductionPlan, InsertMaterialRequirement, InsertSuggestedPurchaseOrder, InsertSuggestedPoItem, InsertForecastAccuracy,
  // New type imports
  InsertInventoryLot, InsertInventoryBalance, InsertInventoryTransaction, InsertWorkOrderOutput,
  InsertAlert, InsertRecommendation,
  InsertShopifyStore, InsertWebhookEvent, InsertShopifySkuMapping, InsertShopifyLocationMapping,
  InsertSalesOrder, InsertSalesOrderLine, InsertInventoryReservation,
  InsertInventoryAllocation, InsertSalesEvent,
  InsertReconciliationRun, InsertReconciliationLine,
  InsertInboundEmail, InsertEmailAttachment, InsertParsedDocument, InsertParsedDocumentLineItem,
  // Data room types
  InsertDataRoom, InsertDataRoomFolder, InsertDataRoomDocument, InsertDataRoomLink, InsertDataRoomVisitor, InsertDocumentView, InsertDataRoomInvitation,
  // NDA types
  InsertNdaDocument, InsertNdaSignature, InsertNdaSignatureAuditLog,
  InsertImapCredential,
  // AI Agent types
  InsertAiAgentTask, InsertAiAgentRule, InsertAiAgentLog, InsertEmailTemplate,
  // Vendor Quote types
  InsertVendorRfq, InsertVendorQuote, InsertVendorRfqEmail, InsertVendorRfqInvitation,
  // CRM types
  crmContacts, crmTags, crmContactTags, whatsappMessages, crmInteractions,
  crmPipelines, crmDeals, contactCaptures, crmEmailCampaigns, crmCampaignRecipients,
  InsertCrmContact, InsertCrmTag, InsertWhatsappMessage, InsertCrmInteraction,
  InsertCrmPipeline, InsertCrmDeal, InsertContactCapture, InsertCrmEmailCampaign, InsertCrmCampaignRecipient,
  // Fireflies integration
  firefliesMeetings, firefliesActionItems, firefliesContactMappings,
  InsertFirefliesMeeting, InsertFirefliesActionItem, InsertFirefliesContactMapping,
  // Copacker portal
  copackerInventoryUpdates, copackerInventoryUpdateItems, copackerInvoices, copackerInvoiceItems, copackerShippingDocuments,
  InsertCopackerInventoryUpdate, InsertCopackerInventoryUpdateItem, InsertCopackerInvoice, InsertCopackerInvoiceItem, InsertCopackerShippingDocument
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================
// USER MANAGEMENT
// ============================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: InsertUser['role']) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ============================================
// COMPANY MANAGEMENT
// ============================================

export async function getCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).orderBy(desc(companies.createdAt));
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0];
}

export async function createCompany(data: InsertCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(companies).values(data);
  return { id: result[0].insertId };
}

export async function updateCompany(id: number, data: Partial<InsertCompany>) {
  const db = await getDb();
  if (!db) return;
  await db.update(companies).set(data).where(eq(companies.id, id));
}

// ============================================
// CUSTOMER MANAGEMENT
// ============================================

export async function getCustomers(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(customers).where(eq(customers.companyId, companyId)).orderBy(desc(customers.createdAt));
  }
  return db.select().from(customers).orderBy(desc(customers.createdAt));
}

export async function getCustomerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return result[0];
}

export async function getCustomerByShopifyId(shopifyId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customers).where(eq(customers.shopifyCustomerId, shopifyId)).limit(1);
  return result[0];
}

export async function getCustomerByHubspotId(hubspotId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customers).where(eq(customers.hubspotContactId, hubspotId)).limit(1);
  return result[0];
}

export async function getCustomerByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  return result[0];
}

export async function createCustomer(data: InsertCustomer) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(customers).values(data);
  return { id: result[0].insertId };
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>) {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set(data).where(eq(customers.id, id));
}

export async function deleteCustomer(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(customers).where(eq(customers.id, id));
}

// ============================================
// VENDOR MANAGEMENT
// ============================================

export async function getVendors(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(vendors).where(eq(vendors.companyId, companyId)).orderBy(desc(vendors.createdAt));
  }
  return db.select().from(vendors).orderBy(desc(vendors.createdAt));
}

export async function getVendorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  return result[0];
}

export async function createVendor(data: InsertVendor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vendors).values(data);
  return { id: result[0].insertId };
}

export async function updateVendor(id: number, data: Partial<InsertVendor>) {
  const db = await getDb();
  if (!db) return;
  await db.update(vendors).set(data).where(eq(vendors.id, id));
}

export async function deleteVendor(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vendors).where(eq(vendors.id, id));
}

// ============================================
// PRODUCT MANAGEMENT
// ============================================

export async function getProducts(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(products).where(eq(products.companyId, companyId)).orderBy(desc(products.createdAt));
  }
  return db.select().from(products).orderBy(desc(products.createdAt));
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function getProductBySku(sku: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.sku, sku)).limit(1);
  return result[0];
}

export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(products).values(data);
  return { id: result[0].insertId };
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(products).where(eq(products.id, id));
}

// ============================================
// FINANCE - ACCOUNTS
// ============================================

export async function getAccounts(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(accounts.code);
  }
  return db.select().from(accounts).orderBy(accounts.code);
}

export async function getAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return result[0];
}

export async function createAccount(data: InsertAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(accounts).values(data);
  return { id: result[0].insertId };
}

export async function updateAccount(id: number, data: Partial<InsertAccount>) {
  const db = await getDb();
  if (!db) return;
  await db.update(accounts).set(data).where(eq(accounts.id, id));
}

// ============================================
// FINANCE - INVOICES
// ============================================

export async function getInvoices(filters?: { companyId?: number; status?: string; customerId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filters?.companyId) conditions.push(eq(invoices.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(invoices.status, filters.status as any));
  if (filters?.customerId) conditions.push(eq(invoices.customerId, filters.customerId));
  
  const baseQuery = db.select({
    id: invoices.id,
    companyId: invoices.companyId,
    invoiceNumber: invoices.invoiceNumber,
    customerId: invoices.customerId,
    type: invoices.type,
    status: invoices.status,
    issueDate: invoices.issueDate,
    dueDate: invoices.dueDate,
    subtotal: invoices.subtotal,
    taxAmount: invoices.taxAmount,
    discountAmount: invoices.discountAmount,
    totalAmount: invoices.totalAmount,
    paidAmount: invoices.paidAmount,
    currency: invoices.currency,
    notes: invoices.notes,
    terms: invoices.terms,
    createdAt: invoices.createdAt,
    customer: {
      id: customers.id,
      name: customers.name,
      email: customers.email,
    },
  }).from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id));
  
  if (conditions.length > 0) {
    return baseQuery.where(and(...conditions)).orderBy(desc(invoices.createdAt));
  }
  return baseQuery.orderBy(desc(invoices.createdAt));
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result[0];
}

export async function getInvoiceWithItems(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const invoiceResult = await db.select({
    id: invoices.id,
    companyId: invoices.companyId,
    invoiceNumber: invoices.invoiceNumber,
    customerId: invoices.customerId,
    type: invoices.type,
    status: invoices.status,
    issueDate: invoices.issueDate,
    dueDate: invoices.dueDate,
    subtotal: invoices.subtotal,
    taxAmount: invoices.taxAmount,
    discountAmount: invoices.discountAmount,
    totalAmount: invoices.totalAmount,
    paidAmount: invoices.paidAmount,
    currency: invoices.currency,
    notes: invoices.notes,
    terms: invoices.terms,
    createdAt: invoices.createdAt,
    customer: {
      id: customers.id,
      name: customers.name,
      email: customers.email,
    },
  }).from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id)).where(eq(invoices.id, id)).limit(1);
  
  const invoice = invoiceResult[0];
  if (!invoice) return undefined;
  
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  return { ...invoice, items };
}

export async function createInvoice(data: InsertInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoices).values(data);
  return { id: result[0].insertId };
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>) {
  const db = await getDb();
  if (!db) return;
  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

export async function createInvoiceItem(data: typeof invoiceItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoiceItems).values(data);
  return { id: result[0].insertId };
}

// ============================================
// FINANCE - PAYMENTS
// ============================================

export async function getPayments(filters?: { companyId?: number; type?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(payments.companyId, filters.companyId));
  if (filters?.type) conditions.push(eq(payments.type, filters.type as any));
  if (filters?.status) conditions.push(eq(payments.status, filters.status as any));
  
  if (conditions.length > 0) {
    return db.select().from(payments).where(and(...conditions)).orderBy(desc(payments.createdAt));
  }
  return db.select().from(payments).orderBy(desc(payments.createdAt));
}

export async function getPaymentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return result[0];
}

export async function createPayment(data: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(payments).values(data);
  return { id: result[0].insertId };
}

export async function updatePayment(id: number, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(payments).set(data).where(eq(payments.id, id));
}

// ============================================
// FINANCE - TRANSACTIONS
// ============================================

export async function getTransactions(filters?: { companyId?: number; type?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(transactions.companyId, filters.companyId));
  if (filters?.type) conditions.push(eq(transactions.type, filters.type as any));
  if (filters?.status) conditions.push(eq(transactions.status, filters.status as any));
  
  if (conditions.length > 0) {
    return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.date));
  }
  return db.select().from(transactions).orderBy(desc(transactions.date));
}

export async function createTransaction(data: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(transactions).values(data);
  return { id: result[0].insertId };
}

// ============================================
// SALES - ORDERS
// ============================================

export async function getOrders(filters?: { companyId?: number; status?: string; customerId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(orders.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(orders.status, filters.status as any));
  if (filters?.customerId) conditions.push(eq(orders.customerId, filters.customerId));
  
  if (conditions.length > 0) {
    return db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt));
  }
  return db.select().from(orders).orderBy(desc(orders.createdAt));
}

export async function getOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return result[0];
}

export async function getOrderWithItems(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const order = await getOrderById(id);
  if (!order) return undefined;
  
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { ...order, items };
}

export async function createOrder(data: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(orders).values(data);
  return { id: result[0].insertId };
}

export async function updateOrder(id: number, data: Partial<InsertOrder>) {
  const db = await getDb();
  if (!db) return;
  await db.update(orders).set(data).where(eq(orders.id, id));
}

export async function createOrderItem(data: typeof orderItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(orderItems).values(data);
  return { id: result[0].insertId };
}

// ============================================
// OPERATIONS - INVENTORY
// ============================================

export async function getInventory(filters?: { companyId?: number; warehouseId?: number; productId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(inventory.companyId, filters.companyId));
  if (filters?.warehouseId) conditions.push(eq(inventory.warehouseId, filters.warehouseId));
  if (filters?.productId) conditions.push(eq(inventory.productId, filters.productId));
  
  if (conditions.length > 0) {
    return db.select().from(inventory).where(and(...conditions)).orderBy(desc(inventory.updatedAt));
  }
  return db.select().from(inventory).orderBy(desc(inventory.updatedAt));
}

export async function createInventory(data: InsertInventory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventory).values(data);
  return { id: result[0].insertId };
}

export async function updateInventory(id: number, data: Partial<InsertInventory>) {
  const db = await getDb();
  if (!db) return;
  await db.update(inventory).set(data).where(eq(inventory.id, id));
}

export async function bulkUpdateInventory(
  ids: number[],
  data: {
    quantityAdjustment?: number;
    warehouseId?: number;
    reorderLevel?: string;
    reorderQuantity?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results: { id: number; success: boolean; error?: string }[] = [];

  for (const id of ids) {
    try {
      const updateData: Partial<InsertInventory> = {};

      // Handle quantity adjustment (add/subtract from current quantity)
      if (data.quantityAdjustment !== undefined) {
        const [current] = await db.select().from(inventory).where(eq(inventory.id, id)).limit(1);
        if (current) {
          const currentQty = parseFloat(current.quantity || '0');
          const newQty = Math.max(0, currentQty + data.quantityAdjustment);
          updateData.quantity = newQty.toString();
        }
      }

      // Handle warehouse change
      if (data.warehouseId !== undefined) {
        updateData.warehouseId = data.warehouseId;
      }

      // Handle reorder level update
      if (data.reorderLevel !== undefined) {
        updateData.reorderLevel = data.reorderLevel;
      }

      // Handle reorder quantity update
      if (data.reorderQuantity !== undefined) {
        updateData.reorderQuantity = data.reorderQuantity;
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(inventory).set(updateData).where(eq(inventory.id, id));
      }

      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, error: (error as Error).message });
    }
  }

  return results;
}

export async function getInventoryByIds(ids: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (ids.length === 0) return [];
  return db.select().from(inventory).where(inArray(inventory.id, ids));
}

// ============================================
// OPERATIONS - WAREHOUSES / LOCATIONS
// ============================================

export async function getWarehouses(filters?: { companyId?: number; type?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(warehouses);
  const conditions = [];
  
  if (filters?.companyId) {
    conditions.push(eq(warehouses.companyId, filters.companyId));
  }
  if (filters?.type) {
    conditions.push(eq(warehouses.type, filters.type as any));
  }
  if (filters?.status) {
    conditions.push(eq(warehouses.status, filters.status as any));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(warehouses.name);
}

export async function getWarehouseById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  return result[0] || null;
}

export async function createWarehouse(data: InsertWarehouse) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(warehouses).values(data);
  return { id: result[0].insertId };
}

export async function updateWarehouse(id: number, data: Partial<InsertWarehouse>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(warehouses).set(data).where(eq(warehouses.id, id));
  return { success: true };
}

export async function deleteWarehouse(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(warehouses).where(eq(warehouses.id, id));
  return { success: true };
}

// ============================================
// OPERATIONS - PRODUCTION BATCHES
// ============================================

export async function getProductionBatches(filters?: { companyId?: number; status?: string; productId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(productionBatches.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(productionBatches.status, filters.status as any));
  if (filters?.productId) conditions.push(eq(productionBatches.productId, filters.productId));
  
  if (conditions.length > 0) {
    return db.select().from(productionBatches).where(and(...conditions)).orderBy(desc(productionBatches.createdAt));
  }
  return db.select().from(productionBatches).orderBy(desc(productionBatches.createdAt));
}

export async function createProductionBatch(data: typeof productionBatches.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(productionBatches).values(data);
  return { id: result[0].insertId };
}

export async function updateProductionBatch(id: number, data: Partial<typeof productionBatches.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(productionBatches).set(data).where(eq(productionBatches.id, id));
}

// ============================================
// OPERATIONS - PURCHASE ORDERS
// ============================================

export async function getPurchaseOrders(filters?: { companyId?: number; status?: string; vendorId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(purchaseOrders.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(purchaseOrders.status, filters.status as any));
  if (filters?.vendorId) conditions.push(eq(purchaseOrders.vendorId, filters.vendorId));
  
  if (conditions.length > 0) {
    return db.select().from(purchaseOrders).where(and(...conditions)).orderBy(desc(purchaseOrders.createdAt));
  }
  return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
}

export async function getPurchaseOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  return result[0];
}

export async function getPurchaseOrderWithItems(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const po = await getPurchaseOrderById(id);
  if (!po) return undefined;
  
  const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
  return { ...po, items };
}

export async function createPurchaseOrder(data: InsertPurchaseOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(purchaseOrders).values(data);
  return { id: result[0].insertId };
}

export async function updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>) {
  const db = await getDb();
  if (!db) return;
  await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, id));
}

export async function createPurchaseOrderItem(data: typeof purchaseOrderItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(purchaseOrderItems).values(data);
  return { id: result[0].insertId };
}

// ============================================
// OPERATIONS - SHIPMENTS
// ============================================

export async function getShipments(filters?: { companyId?: number; status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(shipments.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(shipments.status, filters.status as any));
  if (filters?.type) conditions.push(eq(shipments.type, filters.type as any));
  
  if (conditions.length > 0) {
    return db.select().from(shipments).where(and(...conditions)).orderBy(desc(shipments.createdAt));
  }
  return db.select().from(shipments).orderBy(desc(shipments.createdAt));
}

export async function createShipment(data: typeof shipments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shipments).values(data);
  return { id: result[0].insertId };
}

export async function updateShipment(id: number, data: Partial<typeof shipments.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(shipments).set(data).where(eq(shipments.id, id));
}

// ============================================
// HR - DEPARTMENTS
// ============================================

export async function getDepartments(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(departments).where(eq(departments.companyId, companyId)).orderBy(departments.name);
  }
  return db.select().from(departments).orderBy(departments.name);
}

export async function createDepartment(data: typeof departments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(departments).values(data);
  return { id: result[0].insertId };
}

// ============================================
// HR - EMPLOYEES
// ============================================

export async function getEmployees(filters?: { companyId?: number; status?: string; departmentId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(employees.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(employees.status, filters.status as any));
  if (filters?.departmentId) conditions.push(eq(employees.departmentId, filters.departmentId));
  
  if (conditions.length > 0) {
    return db.select().from(employees).where(and(...conditions)).orderBy(employees.lastName);
  }
  return db.select().from(employees).orderBy(employees.lastName);
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0];
}

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employees).values(data);
  return { id: result[0].insertId };
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) return;
  await db.update(employees).set(data).where(eq(employees.id, id));
}

export async function deleteEmployee(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(employees).where(eq(employees.id, id));
}

// ============================================
// HR - COMPENSATION
// ============================================

export async function getCompensationHistory(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(compensationHistory).where(eq(compensationHistory.employeeId, employeeId)).orderBy(desc(compensationHistory.effectiveDate));
}

export async function createCompensationRecord(data: typeof compensationHistory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(compensationHistory).values(data);
  return { id: result[0].insertId };
}

// ============================================
// HR - EMPLOYEE PAYMENTS
// ============================================

export async function getEmployeePayments(filters?: { companyId?: number; employeeId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(employeePayments.companyId, filters.companyId));
  if (filters?.employeeId) conditions.push(eq(employeePayments.employeeId, filters.employeeId));
  if (filters?.status) conditions.push(eq(employeePayments.status, filters.status as any));
  
  if (conditions.length > 0) {
    return db.select().from(employeePayments).where(and(...conditions)).orderBy(desc(employeePayments.paymentDate));
  }
  return db.select().from(employeePayments).orderBy(desc(employeePayments.paymentDate));
}

export async function createEmployeePayment(data: typeof employeePayments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employeePayments).values(data);
  return { id: result[0].insertId };
}

// ============================================
// LEGAL - CONTRACTS
// ============================================

export async function getContracts(filters?: { companyId?: number; status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(contracts.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(contracts.status, filters.status as any));
  if (filters?.type) conditions.push(eq(contracts.type, filters.type as any));
  
  if (conditions.length > 0) {
    return db.select().from(contracts).where(and(...conditions)).orderBy(desc(contracts.createdAt));
  }
  return db.select().from(contracts).orderBy(desc(contracts.createdAt));
}

export async function getContractById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return result[0];
}

export async function getContractWithKeyDates(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const contract = await getContractById(id);
  if (!contract) return undefined;
  
  const keyDates = await db.select().from(contractKeyDates).where(eq(contractKeyDates.contractId, id)).orderBy(contractKeyDates.date);
  return { ...contract, keyDates };
}

export async function createContract(data: InsertContract) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contracts).values(data);
  return { id: result[0].insertId };
}

export async function updateContract(id: number, data: Partial<InsertContract>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contracts).set(data).where(eq(contracts.id, id));
}

export async function createContractKeyDate(data: typeof contractKeyDates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contractKeyDates).values(data);
  return { id: result[0].insertId };
}

// ============================================
// LEGAL - DISPUTES
// ============================================

export async function getDisputes(filters?: { companyId?: number; status?: string; priority?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(disputes.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(disputes.status, filters.status as any));
  if (filters?.priority) conditions.push(eq(disputes.priority, filters.priority as any));
  
  if (conditions.length > 0) {
    return db.select().from(disputes).where(and(...conditions)).orderBy(desc(disputes.createdAt));
  }
  return db.select().from(disputes).orderBy(desc(disputes.createdAt));
}

export async function getDisputeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  return result[0];
}

export async function createDispute(data: InsertDispute) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(disputes).values(data);
  return { id: result[0].insertId };
}

export async function updateDispute(id: number, data: Partial<InsertDispute>) {
  const db = await getDb();
  if (!db) return;
  await db.update(disputes).set(data).where(eq(disputes.id, id));
}

// ============================================
// LEGAL - DOCUMENTS
// ============================================

export async function getDocuments(filters?: { companyId?: number; type?: string; referenceType?: string; referenceId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(documents.companyId, filters.companyId));
  if (filters?.type) conditions.push(eq(documents.type, filters.type as any));
  if (filters?.referenceType) conditions.push(eq(documents.referenceType, filters.referenceType));
  if (filters?.referenceId) conditions.push(eq(documents.referenceId, filters.referenceId));
  
  if (conditions.length > 0) {
    return db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
  }
  return db.select().from(documents).orderBy(desc(documents.createdAt));
}

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data);
  return { id: result[0].insertId };
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(documents).where(eq(documents.id, id));
}

// ============================================
// PROJECTS
// ============================================

export async function getProjects(filters?: { companyId?: number; status?: string; ownerId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(projects.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(projects.status, filters.status as any));
  if (filters?.ownerId) conditions.push(eq(projects.ownerId, filters.ownerId));
  
  if (conditions.length > 0) {
    return db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.createdAt));
  }
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function getProjectWithDetails(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const project = await getProjectById(id);
  if (!project) return undefined;
  
  const milestones = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, id)).orderBy(projectMilestones.dueDate);
  const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, id)).orderBy(desc(projectTasks.createdAt));
  
  return { ...project, milestones, tasks };
}

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values(data);
  return { id: result[0].insertId };
}

export async function updateProject(id: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) return;
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function createProjectMilestone(data: typeof projectMilestones.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projectMilestones).values(data);
  return { id: result[0].insertId };
}

export async function updateProjectMilestone(id: number, data: Partial<typeof projectMilestones.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(projectMilestones).set(data).where(eq(projectMilestones.id, id));
}

export async function createProjectTask(data: typeof projectTasks.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projectTasks).values(data);
  return { id: result[0].insertId };
}

export async function updateProjectTask(id: number, data: Partial<typeof projectTasks.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(projectTasks).set(data).where(eq(projectTasks.id, id));
}

export async function getProjectTasks(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId)).orderBy(desc(projectTasks.createdAt));
}

// ============================================
// AUDIT LOGS
// ============================================

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data);
}

export async function getAuditLogs(filters?: { companyId?: number; entityType?: string; entityId?: number; userId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(auditLogs.companyId, filters.companyId));
  if (filters?.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  if (filters?.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
  if (filters?.userId) conditions.push(eq(auditLogs.userId, filters.userId));
  
  if (conditions.length > 0) {
    return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(100);
  }
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
}

// Old notification functions removed - see enhanced versions at end of file

// ============================================
// INTEGRATIONS
// ============================================

export async function getIntegrationConfigs(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(integrationConfigs).where(eq(integrationConfigs.companyId, companyId));
  }
  return db.select().from(integrationConfigs);
}

export async function createIntegrationConfig(data: typeof integrationConfigs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(integrationConfigs).values(data);
  return { id: result[0].insertId };
}

export async function updateIntegrationConfig(id: number, data: Partial<typeof integrationConfigs.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(integrationConfigs).set(data).where(eq(integrationConfigs.id, id));
}

// ============================================
// AI CONVERSATIONS
// ============================================

export async function getAiConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiConversations).where(eq(aiConversations.userId, userId)).orderBy(desc(aiConversations.updatedAt));
}

export async function getAiConversationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
  return result[0];
}

export async function createAiConversation(data: typeof aiConversations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiConversations).values(data);
  return { id: result[0].insertId };
}

export async function getAiMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(aiMessages.createdAt);
}

export async function createAiMessage(data: typeof aiMessages.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiMessages).values(data);
  return { id: result[0].insertId };
}

export async function updateAiConversation(id: number, data: Partial<typeof aiConversations.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiConversations).set(data).where(eq(aiConversations.id, id));
}

// ============================================
// DASHBOARD METRICS
// ============================================

export async function getDashboardMetrics() {
  const db = await getDb();
  if (!db) return null;
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Get counts
  const [customerCount] = await db.select({ count: count() }).from(customers);
  const [vendorCount] = await db.select({ count: count() }).from(vendors);
  const [productCount] = await db.select({ count: count() }).from(products);
  const [employeeCount] = await db.select({ count: count() }).from(employees).where(eq(employees.status, 'active'));
  const [projectCount] = await db.select({ count: count() }).from(projects).where(eq(projects.status, 'active'));
  const [contractCount] = await db.select({ count: count() }).from(contracts).where(eq(contracts.status, 'active'));
  
  // Get financial summaries
  const [invoiceTotal] = await db.select({ 
    total: sum(invoices.totalAmount),
    paid: sum(invoices.paidAmount)
  }).from(invoices).where(eq(invoices.status, 'paid'));
  
  const [orderTotal] = await db.select({ 
    total: sum(orders.totalAmount)
  }).from(orders).where(gte(orders.orderDate, thirtyDaysAgo));
  
  // Get pending items
  const [pendingInvoices] = await db.select({ count: count() }).from(invoices).where(or(eq(invoices.status, 'sent'), eq(invoices.status, 'overdue')));
  const [pendingPOs] = await db.select({ count: count() }).from(purchaseOrders).where(or(eq(purchaseOrders.status, 'sent'), eq(purchaseOrders.status, 'confirmed')));
  const [openDisputes] = await db.select({ count: count() }).from(disputes).where(eq(disputes.status, 'open'));
  
  return {
    customers: customerCount?.count || 0,
    vendors: vendorCount?.count || 0,
    products: productCount?.count || 0,
    activeEmployees: employeeCount?.count || 0,
    activeProjects: projectCount?.count || 0,
    activeContracts: contractCount?.count || 0,
    revenueThisMonth: orderTotal?.total || 0,
    invoicesPaid: invoiceTotal?.paid || 0,
    pendingInvoices: pendingInvoices?.count || 0,
    pendingPurchaseOrders: pendingPOs?.count || 0,
    openDisputes: openDisputes?.count || 0,
  };
}

// ============================================
// SEARCH
// ============================================

export async function globalSearch(query: string) {
  const db = await getDb();
  if (!db) return { customers: [], vendors: [], products: [], employees: [], contracts: [], projects: [] };
  
  const searchPattern = `%${query}%`;
  
  const [customerResults, vendorResults, productResults, employeeResults, contractResults, projectResults] = await Promise.all([
    db.select().from(customers).where(or(like(customers.name, searchPattern), like(customers.email, searchPattern))).limit(5),
    db.select().from(vendors).where(or(like(vendors.name, searchPattern), like(vendors.contactName, searchPattern))).limit(5),
    db.select().from(products).where(or(like(products.name, searchPattern), like(products.sku, searchPattern))).limit(5),
    db.select().from(employees).where(or(like(employees.firstName, searchPattern), like(employees.lastName, searchPattern), like(employees.email, searchPattern))).limit(5),
    db.select().from(contracts).where(or(like(contracts.title, searchPattern), like(contracts.contractNumber, searchPattern))).limit(5),
    db.select().from(projects).where(or(like(projects.name, searchPattern), like(projects.projectNumber, searchPattern))).limit(5),
  ]);
  
  return {
    customers: customerResults,
    vendors: vendorResults,
    products: productResults,
    employees: employeeResults,
    contracts: contractResults,
    projects: projectResults,
  };
}

// ============================================
// GOOGLE OAUTH TOKENS
// ============================================

export async function getGoogleOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(googleOAuthTokens).where(eq(googleOAuthTokens.userId, userId)).limit(1);
  return result[0];
}

export async function upsertGoogleOAuthToken(data: InsertGoogleOAuthToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if token exists for this user
  const existing = await getGoogleOAuthToken(data.userId);
  
  if (existing) {
    // Update existing token
    await db.update(googleOAuthTokens)
      .set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || existing.refreshToken,
        expiresAt: data.expiresAt,
        scope: data.scope,
        googleEmail: data.googleEmail,
      })
      .where(eq(googleOAuthTokens.userId, data.userId));
    return { id: existing.id };
  } else {
    // Insert new token
    const result = await db.insert(googleOAuthTokens).values(data);
    return { id: result[0].insertId };
  }
}

export async function deleteGoogleOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(googleOAuthTokens).where(eq(googleOAuthTokens.userId, userId));
}

// QuickBooks OAuth token management
export async function getQuickBooksOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(quickbooksOAuthTokens).where(eq(quickbooksOAuthTokens.userId, userId)).limit(1);
  return result[0];
}

export async function upsertQuickBooksOAuthToken(data: InsertQuickBooksOAuthToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if token exists for this user
  const existing = await getQuickBooksOAuthToken(data.userId);
  
  if (existing) {
    // Update existing token
    // Note: QuickBooks always returns a new refresh token on token refresh
    await db.update(quickbooksOAuthTokens)
      .set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? existing.refreshToken, // Use existing only if new one not provided
        expiresAt: data.expiresAt,
        scope: data.scope,
        realmId: data.realmId,
      })
      .where(eq(quickbooksOAuthTokens.userId, data.userId));
    return { id: existing.id };
  } else {
    // Insert new token
    const result = await db.insert(quickbooksOAuthTokens).values(data);
    return { id: result[0].insertId };
  }
}

export async function deleteQuickBooksOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(quickbooksOAuthTokens).where(eq(quickbooksOAuthTokens.userId, userId));
}

// ============================================
// FREIGHT CARRIERS
// ============================================

export async function getFreightCarriers(filters?: { type?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(freightCarriers);
  const conditions = [];
  
  if (filters?.type) {
    conditions.push(eq(freightCarriers.type, filters.type as any));
  }
  if (filters?.isActive !== undefined) {
    conditions.push(eq(freightCarriers.isActive, filters.isActive));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(freightCarriers.isPreferred), freightCarriers.name);
}

export async function getFreightCarrierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(freightCarriers).where(eq(freightCarriers.id, id)).limit(1);
  return result[0];
}

export async function createFreightCarrier(data: InsertFreightCarrier) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(freightCarriers).values(data);
  return { id: result[0].insertId };
}

export async function updateFreightCarrier(id: number, data: Partial<InsertFreightCarrier>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(freightCarriers).set(data).where(eq(freightCarriers.id, id));
  return { success: true };
}

// ============================================
// FREIGHT RFQs
// ============================================

export async function getFreightRfqs(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(freightRfqs);
  
  if (filters?.status) {
    query = query.where(eq(freightRfqs.status, filters.status as any)) as any;
  }
  
  return query.orderBy(desc(freightRfqs.createdAt));
}

export async function getFreightRfqById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(freightRfqs).where(eq(freightRfqs.id, id)).limit(1);
  return result[0];
}

export async function createFreightRfq(data: Omit<InsertFreightRfq, 'rfqNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Generate RFQ number
  const countResult = await db.select({ count: count() }).from(freightRfqs);
  const rfqCount = countResult[0]?.count || 0;
  const rfqNumber = `RFQ-${new Date().getFullYear()}-${String(rfqCount + 1).padStart(5, '0')}`;
  
  const result = await db.insert(freightRfqs).values({ ...data, rfqNumber } as InsertFreightRfq);
  return { id: result[0].insertId, rfqNumber };
}

export async function updateFreightRfq(id: number, data: Partial<InsertFreightRfq>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(freightRfqs).set(data).where(eq(freightRfqs.id, id));
  return { success: true };
}

// ============================================
// FREIGHT QUOTES
// ============================================

export async function getFreightQuotes(rfqId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(freightQuotes);
  
  if (rfqId) {
    query = query.where(eq(freightQuotes.rfqId, rfqId)) as any;
  }
  
  return query.orderBy(freightQuotes.totalCost);
}

export async function getFreightQuoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(freightQuotes).where(eq(freightQuotes.id, id)).limit(1);
  return result[0];
}

export async function createFreightQuote(data: InsertFreightQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(freightQuotes).values(data);
  return { id: result[0].insertId };
}

export async function updateFreightQuote(id: number, data: Partial<InsertFreightQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(freightQuotes).set(data).where(eq(freightQuotes.id, id));
  return { success: true };
}

// ============================================
// FREIGHT EMAILS
// ============================================

export async function getFreightEmails(filters?: { rfqId?: number; carrierId?: number; direction?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(freightEmails);
  const conditions = [];
  
  if (filters?.rfqId) {
    conditions.push(eq(freightEmails.rfqId, filters.rfqId));
  }
  if (filters?.carrierId) {
    conditions.push(eq(freightEmails.carrierId, filters.carrierId));
  }
  if (filters?.direction) {
    conditions.push(eq(freightEmails.direction, filters.direction as any));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(freightEmails.createdAt));
}

export async function createFreightEmail(data: InsertFreightEmail) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(freightEmails).values(data);
  return { id: result[0].insertId };
}

export async function updateFreightEmail(id: number, data: Partial<InsertFreightEmail>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(freightEmails).set(data).where(eq(freightEmails.id, id));
  return { success: true };
}

// ============================================
// CUSTOMS CLEARANCES
// ============================================

export async function getCustomsClearances(filters?: { status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(customsClearances);
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(customsClearances.status, filters.status as any));
  }
  if (filters?.type) {
    conditions.push(eq(customsClearances.type, filters.type as any));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(customsClearances.createdAt));
}

export async function getCustomsClearanceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customsClearances).where(eq(customsClearances.id, id)).limit(1);
  return result[0];
}

export async function createCustomsClearance(data: Omit<InsertCustomsClearance, 'clearanceNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Generate clearance number
  const countResult = await db.select({ count: count() }).from(customsClearances);
  const clearanceCount = countResult[0]?.count || 0;
  const clearanceNumber = `CC-${new Date().getFullYear()}-${String(clearanceCount + 1).padStart(5, '0')}`;
  
  const result = await db.insert(customsClearances).values({ ...data, clearanceNumber } as InsertCustomsClearance);
  return { id: result[0].insertId, clearanceNumber };
}

export async function updateCustomsClearance(id: number, data: Partial<InsertCustomsClearance>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(customsClearances).set(data).where(eq(customsClearances.id, id));
  return { success: true };
}

// ============================================
// CUSTOMS DOCUMENTS
// ============================================

export async function getCustomsDocuments(clearanceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customsDocuments).where(eq(customsDocuments.clearanceId, clearanceId)).orderBy(customsDocuments.documentType);
}

export async function createCustomsDocument(data: InsertCustomsDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(customsDocuments).values(data);
  return { id: result[0].insertId };
}

export async function updateCustomsDocument(id: number, data: Partial<InsertCustomsDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(customsDocuments).set(data).where(eq(customsDocuments.id, id));
  return { success: true };
}

// ============================================
// FREIGHT BOOKINGS
// ============================================

export async function getFreightBookings(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const bookings = await db.select()
    .from(freightBookings)
    .leftJoin(freightQuotes, eq(freightBookings.quoteId, freightQuotes.id))
    .leftJoin(freightCarriers, eq(freightBookings.carrierId, freightCarriers.id))
    .where(filters?.status ? eq(freightBookings.status, filters.status as any) : undefined)
    .orderBy(desc(freightBookings.createdAt));
  
  return bookings.map(row => ({
    ...row.freightBookings,
    quote: row.freightQuotes,
    carrier: row.freightCarriers,
  }));
}

export async function getFreightBookingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(freightBookings).where(eq(freightBookings.id, id)).limit(1);
  return result[0];
}

export async function createFreightBooking(data: Omit<InsertFreightBooking, 'bookingNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Generate booking number
  const countResult = await db.select({ count: count() }).from(freightBookings);
  const bookingCount = countResult[0]?.count || 0;
  const bookingNumber = `BK-${new Date().getFullYear()}-${String(bookingCount + 1).padStart(5, '0')}`;
  
  const result = await db.insert(freightBookings).values({ ...data, bookingNumber } as InsertFreightBooking);
  return { id: result[0].insertId, bookingNumber };
}

export async function updateFreightBooking(id: number, data: Partial<InsertFreightBooking>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(freightBookings).set(data).where(eq(freightBookings.id, id));
  return { success: true };
}

// ============================================
// FREIGHT ANALYTICS
// ============================================

export async function getFreightDashboardStats() {
  const db = await getDb();
  if (!db) return {
    activeRfqs: 0,
    pendingQuotes: 0,
    activeBookings: 0,
    pendingClearances: 0,
    totalCarriers: 0,
  };
  
  const [rfqCount] = await db.select({ count: count() }).from(freightRfqs).where(
    or(eq(freightRfqs.status, 'sent'), eq(freightRfqs.status, 'awaiting_quotes'))
  );
  
  const [quoteCount] = await db.select({ count: count() }).from(freightQuotes).where(
    eq(freightQuotes.status, 'pending')
  );
  
  const [bookingCount] = await db.select({ count: count() }).from(freightBookings).where(
    or(eq(freightBookings.status, 'pending'), eq(freightBookings.status, 'confirmed'), eq(freightBookings.status, 'in_transit'))
  );
  
  const [clearanceCount] = await db.select({ count: count() }).from(customsClearances).where(
    or(
      eq(customsClearances.status, 'pending_documents'),
      eq(customsClearances.status, 'documents_submitted'),
      eq(customsClearances.status, 'under_review')
    )
  );
  
  const [carrierCount] = await db.select({ count: count() }).from(freightCarriers).where(
    eq(freightCarriers.isActive, true)
  );
  
  return {
    activeRfqs: rfqCount?.count || 0,
    pendingQuotes: quoteCount?.count || 0,
    activeBookings: bookingCount?.count || 0,
    pendingClearances: clearanceCount?.count || 0,
    totalCarriers: carrierCount?.count || 0,
  };
}


// ============================================
// INVENTORY BY LOCATION
// ============================================

export async function getInventoryByLocation(warehouseId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  if (warehouseId) {
    return db.select().from(inventory).where(eq(inventory.warehouseId, warehouseId)).orderBy(desc(inventory.updatedAt));
  }
  return db.select().from(inventory).orderBy(desc(inventory.updatedAt));
}

export async function getConsolidatedInventory() {
  const db = await getDb();
  if (!db) return [];
  
  // Get inventory grouped by product with location breakdown
  const result = await db.select({
    productId: inventory.productId,
    warehouseId: inventory.warehouseId,
    quantity: inventory.quantity,
    reservedQuantity: inventory.reservedQuantity,
  }).from(inventory);
  
  return result;
}

export async function getInventoryByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(inventory).where(eq(inventory.productId, productId));
}

export async function getInventoryByProductId(productId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inventory).where(eq(inventory.productId, productId)).limit(1);
  return result[0];
}

export async function updateInventoryQuantity(productId: number, warehouseId: number, quantityChange: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if inventory record exists
  const existing = await db.select().from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.warehouseId, warehouseId)))
    .limit(1);
  
  if (existing.length > 0) {
    const currentQty = parseFloat(existing[0].quantity as string) || 0;
    const newQty = currentQty + quantityChange;
    await db.update(inventory)
      .set({ quantity: newQty.toString() })
      .where(and(eq(inventory.productId, productId), eq(inventory.warehouseId, warehouseId)));
  } else {
    await db.insert(inventory).values({
      productId,
      warehouseId,
      quantity: quantityChange.toString(),
    });
  }
  
  return { success: true };
}

// ============================================
// INVENTORY TRANSFERS
// ============================================

export async function getInventoryTransfers(filters?: { status?: string; fromWarehouseId?: number; toWarehouseId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(inventoryTransfers);
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(inventoryTransfers.status, filters.status as any));
  }
  if (filters?.fromWarehouseId) {
    conditions.push(eq(inventoryTransfers.fromWarehouseId, filters.fromWarehouseId));
  }
  if (filters?.toWarehouseId) {
    conditions.push(eq(inventoryTransfers.toWarehouseId, filters.toWarehouseId));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(inventoryTransfers.createdAt));
}

export async function getTransferById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, id)).limit(1);
  return result[0] || null;
}

export async function getTransferItems(transferId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventoryTransferItems).where(eq(inventoryTransferItems.transferId, transferId));
}

export async function createTransfer(data: Omit<InsertInventoryTransfer, 'transferNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Generate transfer number
  const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`;
  
  const result = await db.insert(inventoryTransfers).values({
    ...data,
    transferNumber,
  });
  
  return { id: result[0].insertId, transferNumber };
}

export async function addTransferItem(data: InsertInventoryTransferItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventoryTransferItems).values(data);
  return { id: result[0].insertId };
}

export async function updateTransfer(id: number, data: Partial<InsertInventoryTransfer>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inventoryTransfers).set(data).where(eq(inventoryTransfers.id, id));
  return { success: true };
}

export async function updateTransferItem(id: number, data: Partial<InsertInventoryTransferItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inventoryTransferItems).set(data).where(eq(inventoryTransferItems.id, id));
  return { success: true };
}

export async function processTransferShipment(transferId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get transfer and items
  const transfer = await getTransferById(transferId);
  if (!transfer) throw new Error("Transfer not found");
  
  const items = await getTransferItems(transferId);
  
  // Deduct from source warehouse
  for (const item of items) {
    const qty = parseFloat(item.requestedQuantity as string) || 0;
    await updateInventoryQuantity(item.productId, transfer.fromWarehouseId, -qty);
  }
  
  // Update transfer status
  await updateTransfer(transferId, {
    status: 'in_transit',
    shippedDate: new Date(),
  });
  
  // Update items with shipped quantity
  for (const item of items) {
    await updateTransferItem(item.id, {
      shippedQuantity: item.requestedQuantity,
    });
  }
  
  return { success: true };
}

export async function processTransferReceipt(transferId: number, receivedItems: { itemId: number; receivedQuantity: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get transfer
  const transfer = await getTransferById(transferId);
  if (!transfer) throw new Error("Transfer not found");
  
  // Add to destination warehouse
  for (const received of receivedItems) {
    const item = await db.select().from(inventoryTransferItems).where(eq(inventoryTransferItems.id, received.itemId)).limit(1);
    if (item[0]) {
      await updateInventoryQuantity(item[0].productId, transfer.toWarehouseId, received.receivedQuantity);
      await updateTransferItem(received.itemId, {
        receivedQuantity: received.receivedQuantity.toString(),
      });
    }
  }
  
  // Update transfer status
  await updateTransfer(transferId, {
    status: 'received',
    receivedDate: new Date(),
  });
  
  return { success: true };
}

export async function getLocationInventorySummary() {
  const db = await getDb();
  if (!db) return [];
  
  // Get all warehouses with their inventory counts
  const warehouseList = await db.select().from(warehouses).where(eq(warehouses.status, 'active'));
  
  const summaries = [];
  for (const wh of warehouseList) {
    const invItems = await db.select({
      totalProducts: count(),
      totalQuantity: sum(inventory.quantity),
    }).from(inventory).where(eq(inventory.warehouseId, wh.id));
    
    summaries.push({
      warehouse: wh,
      totalProducts: invItems[0]?.totalProducts || 0,
      totalQuantity: parseFloat(invItems[0]?.totalQuantity as string || '0'),
    });
  }
  
  return summaries;
}


// ============================================
// TEAM & PERMISSION MANAGEMENT
// ============================================

// Default permissions by role
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'], // All permissions
  finance: [
    'accounts.*', 'invoices.*', 'payments.*', 'transactions.*',
    'customers.read', 'vendors.read', 'reports.finance'
  ],
  ops: [
    'products.*', 'inventory.*', 'orders.*', 'purchase_orders.*',
    'shipments.*', 'warehouses.*', 'vendors.*', 'transfers.*'
  ],
  legal: [
    'contracts.*', 'disputes.*', 'documents.*',
    'customers.read', 'vendors.read', 'employees.read'
  ],
  exec: [
    'dashboard.*', 'reports.*', 'ai.*',
    'customers.read', 'vendors.read', 'employees.read',
    'invoices.read', 'orders.read', 'projects.read'
  ],
  copacker: [
    'inventory.read', 'inventory.update',
    'shipments.read', 'shipments.upload_documents',
    'warehouses.read_own'
  ],
  vendor: [
    'purchase_orders.read_own', 'purchase_orders.update_status',
    'shipments.read_own', 'shipments.upload_documents',
    'invoices.read_own'
  ],
  contractor: [
    'projects.read_assigned', 'projects.update_assigned',
    'documents.read_own', 'documents.upload'
  ],
  user: [
    'dashboard.read', 'ai.query'
  ]
};

export async function getTeamMembers() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getTeamMemberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateTeamMember(id: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(users).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
}

export async function deactivateTeamMember(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(users).set({
    isActive: false,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
}

export async function reactivateTeamMember(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(users).set({
    isActive: true,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
}

// Team Invitations
export async function createTeamInvitation(data: Omit<InsertTeamInvitation, 'inviteCode'>) {
  const db = await getDb();
  if (!db) return null;
  
  const inviteCode = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  
  const result = await db.insert(teamInvitations).values({
    ...data,
    inviteCode,
  });
  
  return { id: result[0].insertId, inviteCode };
}

export async function getTeamInvitations() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(teamInvitations).orderBy(desc(teamInvitations.createdAt));
}

export async function getTeamInvitationByCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(teamInvitations)
    .where(eq(teamInvitations.inviteCode, inviteCode))
    .limit(1);
  return result[0];
}

export async function acceptTeamInvitation(inviteCode: string, userId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };
  
  const invitation = await getTeamInvitationByCode(inviteCode);
  if (!invitation) {
    return { success: false, error: 'Invalid invitation code' };
  }
  
  if (invitation.status !== 'pending') {
    return { success: false, error: 'Invitation is no longer valid' };
  }
  
  if (new Date(invitation.expiresAt) < new Date()) {
    await db.update(teamInvitations).set({ status: 'expired' })
      .where(eq(teamInvitations.id, invitation.id));
    return { success: false, error: 'Invitation has expired' };
  }
  
  // Update invitation
  await db.update(teamInvitations).set({
    status: 'accepted',
    acceptedAt: new Date(),
    acceptedByUserId: userId,
  }).where(eq(teamInvitations.id, invitation.id));
  
  // Update user with role and linked entities
  await db.update(users).set({
    role: invitation.role,
    linkedVendorId: invitation.linkedVendorId,
    linkedWarehouseId: invitation.linkedWarehouseId,
    invitedBy: invitation.invitedBy,
    invitedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  
  // Add custom permissions if specified
  if (invitation.customPermissions) {
    const permissions = JSON.parse(invitation.customPermissions) as string[];
    for (const permission of permissions) {
      await db.insert(userPermissions).values({
        userId,
        permission,
        grantedBy: invitation.invitedBy,
      });
    }
  }
  
  return { success: true, role: invitation.role };
}

export async function revokeTeamInvitation(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(teamInvitations).set({ status: 'revoked' })
    .where(eq(teamInvitations.id, id));
}

// User Permissions
export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
}

export async function addUserPermission(userId: number, permission: string, grantedBy: number) {
  const db = await getDb();
  if (!db) return;
  
  // Check if permission already exists
  const existing = await db.select().from(userPermissions)
    .where(and(
      eq(userPermissions.userId, userId),
      eq(userPermissions.permission, permission)
    )).limit(1);
  
  if (existing.length === 0) {
    await db.insert(userPermissions).values({
      userId,
      permission,
      grantedBy,
    });
  }
}

export async function removeUserPermission(userId: number, permission: string) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(userPermissions).where(and(
    eq(userPermissions.userId, userId),
    eq(userPermissions.permission, permission)
  ));
}

export async function setUserPermissions(userId: number, permissions: string[], grantedBy: number) {
  const db = await getDb();
  if (!db) return;
  
  // Remove all existing permissions
  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  
  // Add new permissions
  for (const permission of permissions) {
    await db.insert(userPermissions).values({
      userId,
      permission,
      grantedBy,
    });
  }
}

// Check if user has a specific permission
export async function userHasPermission(userId: number, requiredPermission: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  // Get user role
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0]) return false;
  
  const role = user[0].role;
  
  // Admin has all permissions
  if (role === 'admin') return true;
  
  // Check role-based permissions
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  
  // Check for wildcard match
  for (const perm of rolePermissions) {
    if (perm === '*') return true;
    if (perm === requiredPermission) return true;
    
    // Check module wildcard (e.g., 'inventory.*' matches 'inventory.update')
    if (perm.endsWith('.*')) {
      const module = perm.slice(0, -2);
      if (requiredPermission.startsWith(module + '.')) return true;
    }
  }
  
  // Check custom permissions
  const customPerms = await getUserPermissions(userId);
  for (const perm of customPerms) {
    if (perm.permission === requiredPermission) return true;
    if (perm.permission === '*') return true;
    if (perm.permission.endsWith('.*')) {
      const module = perm.permission.slice(0, -2);
      if (requiredPermission.startsWith(module + '.')) return true;
    }
  }
  
  return false;
}

// Get all effective permissions for a user
export async function getUserEffectivePermissions(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0]) return [];
  
  const role = user[0].role;
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  const customPerms = await getUserPermissions(userId);
  
  const allPerms = new Set<string>([
    ...rolePerms,
    ...customPerms.map(p => p.permission)
  ]);
  
  return Array.from(allPerms);
}

// Get inventory for a specific warehouse (for copackers)
export async function getInventoryByWarehouse(warehouseId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select({
    inventory: inventory,
    product: products,
  })
    .from(inventory)
    .leftJoin(products, eq(inventory.productId, products.id))
    .where(eq(inventory.warehouseId, warehouseId));
}

// Update inventory quantity by ID (for copackers)
export async function updateInventoryQuantityById(
  inventoryId: number,
  quantity: number,
  userId: number,
  notes?: string
) {
  const db = await getDb();
  if (!db) return;
  
  const existing = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
  if (!existing[0]) return;
  
  const oldQuantity = existing[0].quantity;
  
  await db.update(inventory).set({
    quantity: quantity.toString(),
    updatedAt: new Date(),
  }).where(eq(inventory.id, inventoryId));
  
  // Create audit log
  await createAuditLog({
    entityType: 'inventory',
    entityId: inventoryId,
    action: 'update',
    userId,
    oldValues: { quantity: oldQuantity },
    newValues: { quantity, notes },
  });
}


// ============================================
// BILL OF MATERIALS (BOM) FUNCTIONS
// ============================================

export async function getBillOfMaterials(filters?: { productId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(billOfMaterials).orderBy(desc(billOfMaterials.updatedAt));
  
  if (filters?.productId) {
    query = query.where(eq(billOfMaterials.productId, filters.productId)) as typeof query;
  }
  if (filters?.status) {
    query = query.where(eq(billOfMaterials.status, filters.status as any)) as typeof query;
  }
  
  return query;
}

export async function getBomById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(billOfMaterials).where(eq(billOfMaterials.id, id)).limit(1);
  return result[0];
}

export async function createBom(data: Omit<InsertBillOfMaterials, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(billOfMaterials).values(data);
  return { id: result[0].insertId };
}

export async function updateBom(id: number, data: Partial<InsertBillOfMaterials>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(billOfMaterials).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(billOfMaterials.id, id));
}

export async function deleteBom(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete components first
  await db.delete(bomComponents).where(eq(bomComponents.bomId, id));
  // Delete version history
  await db.delete(bomVersionHistory).where(eq(bomVersionHistory.bomId, id));
  // Delete BOM
  await db.delete(billOfMaterials).where(eq(billOfMaterials.id, id));
}

// BOM Components
export async function getBomComponents(bomId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(bomComponents)
    .where(eq(bomComponents.bomId, bomId))
    .orderBy(bomComponents.sortOrder);
}

export async function createBomComponent(data: Omit<InsertBomComponent, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(bomComponents).values(data);
  return { id: result[0].insertId };
}

export async function updateBomComponent(id: number, data: Partial<InsertBomComponent>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bomComponents).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(bomComponents.id, id));
}

export async function deleteBomComponent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(bomComponents).where(eq(bomComponents.id, id));
}

// Raw Materials
export async function getRawMaterials(filters?: { status?: string; category?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(rawMaterials).orderBy(rawMaterials.name);
  
  if (filters?.status) {
    query = query.where(eq(rawMaterials.status, filters.status as any)) as typeof query;
  }
  if (filters?.category) {
    query = query.where(eq(rawMaterials.category, filters.category)) as typeof query;
  }
  
  return query;
}

export async function getRawMaterialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).limit(1);
  return result[0];
}

export async function getRawMaterialByNameOrSku(name: string, sku: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(rawMaterials)
    .where(or(
      eq(rawMaterials.name, name),
      eq(rawMaterials.sku, sku)
    ))
    .limit(1);
  return result[0];
}

export async function createPurchaseOrderRawMaterialLink(data: {
  purchaseOrderItemId: number;
  rawMaterialId: number;
  orderedQuantity: string;
  unit: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(purchaseOrderRawMaterials).values({
    purchaseOrderItemId: data.purchaseOrderItemId,
    rawMaterialId: data.rawMaterialId,
    orderedQuantity: data.orderedQuantity,
    receivedQuantity: '0',
    unit: data.unit,
    status: 'ordered',
  }).$returningId();

  return { id: result[0].id };
}

export async function createRawMaterial(data: Omit<InsertRawMaterial, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(rawMaterials).values(data);
  return { id: result[0].insertId };
}

export async function updateRawMaterial(id: number, data: Partial<InsertRawMaterial>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(rawMaterials).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(rawMaterials.id, id));
}

export async function deleteRawMaterial(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(rawMaterials).where(eq(rawMaterials.id, id));
}

// BOM Version History
export async function getBomVersionHistory(bomId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(bomVersionHistory)
    .where(eq(bomVersionHistory.bomId, bomId))
    .orderBy(desc(bomVersionHistory.createdAt));
}

export async function createBomVersionHistory(data: Omit<InsertBomVersionHistory, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(bomVersionHistory).values(data);
  return { id: result[0].insertId };
}

// Calculate BOM costs
export async function calculateBomCosts(bomId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const components = await getBomComponents(bomId);
  const bom = await getBomById(bomId);
  if (!bom) return null;
  
  let totalMaterialCost = 0;
  for (const comp of components) {
    const qty = parseFloat(comp.quantity?.toString() || '0');
    const unitCost = parseFloat(comp.unitCost?.toString() || '0');
    const wastage = parseFloat(comp.wastagePercent?.toString() || '0') / 100;
    const compCost = qty * unitCost * (1 + wastage);
    totalMaterialCost += compCost;
    
    // Update component total cost
    await updateBomComponent(comp.id, { totalCost: compCost.toFixed(2) });
  }
  
  const laborCost = parseFloat(bom.laborCost?.toString() || '0');
  const overheadCost = parseFloat(bom.overheadCost?.toString() || '0');
  const totalCost = totalMaterialCost + laborCost + overheadCost;
  
  await updateBom(bomId, {
    totalMaterialCost: totalMaterialCost.toFixed(2),
    totalCost: totalCost.toFixed(2),
  });
  
  return { totalMaterialCost, laborCost, overheadCost, totalCost };
}


// ============================================
// WORK ORDERS
// ============================================

export async function getWorkOrders(filters?: { status?: string; warehouseId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    id: workOrders.id,
    companyId: workOrders.companyId,
    workOrderNumber: workOrders.workOrderNumber,
    bomId: workOrders.bomId,
    productId: workOrders.productId,
    warehouseId: workOrders.warehouseId,
    quantity: workOrders.quantity,
    completedQuantity: workOrders.completedQuantity,
    unit: workOrders.unit,
    status: workOrders.status,
    priority: workOrders.priority,
    scheduledStartDate: workOrders.scheduledStartDate,
    scheduledEndDate: workOrders.scheduledEndDate,
    actualStartDate: workOrders.actualStartDate,
    actualEndDate: workOrders.actualEndDate,
    notes: workOrders.notes,
    createdBy: workOrders.createdBy,
    assignedTo: workOrders.assignedTo,
    createdAt: workOrders.createdAt,
    updatedAt: workOrders.updatedAt,
    productName: products.name,
    productSku: products.sku,
  })
    .from(workOrders)
    .leftJoin(products, eq(workOrders.productId, products.id))
    .orderBy(desc(workOrders.createdAt));
  
  // Transform to include nested product object for compatibility
  return result.map(row => ({
    ...row,
    product: row.productName ? { name: row.productName, sku: row.productSku } : null,
  }));
}

export async function getWorkOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
  return result[0];
}

export async function createWorkOrder(data: Omit<InsertWorkOrder, 'workOrderNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workOrderNumber = `WO-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.insert(workOrders).values({ ...data, workOrderNumber });
  return { id: result[0].insertId, workOrderNumber };
}

export async function updateWorkOrder(id: number, data: Partial<InsertWorkOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workOrders).set(data).where(eq(workOrders.id, id));
}

// ============================================
// WORK ORDER MATERIALS
// ============================================

export async function getWorkOrderMaterials(workOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workOrderMaterials).where(eq(workOrderMaterials.workOrderId, workOrderId));
}

export async function createWorkOrderMaterial(data: InsertWorkOrderMaterial) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workOrderMaterials).values(data);
  return { id: result[0].insertId };
}

export async function updateWorkOrderMaterial(id: number, data: Partial<InsertWorkOrderMaterial>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workOrderMaterials).set(data).where(eq(workOrderMaterials.id, id));
}

// Generate materials from BOM for a work order
export async function generateWorkOrderMaterialsFromBom(workOrderId: number, bomId: number, quantity: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const components = await getBomComponents(bomId);
  const bom = await getBomById(bomId);
  if (!bom) throw new Error("BOM not found");
  
  const batchSize = parseFloat(bom.batchSize?.toString() || '1');
  const multiplier = quantity / batchSize;
  
  for (const comp of components) {
    const compQty = parseFloat(comp.quantity?.toString() || '0');
    const wastage = parseFloat(comp.wastagePercent?.toString() || '0') / 100;
    const requiredQty = compQty * multiplier * (1 + wastage);
    
    await createWorkOrderMaterial({
      workOrderId,
      rawMaterialId: comp.rawMaterialId,
      productId: comp.productId,
      name: comp.name,
      requiredQuantity: requiredQty.toFixed(4),
      unit: comp.unit,
      status: 'pending',
    });
  }
}

// ============================================
// RAW MATERIAL INVENTORY
// ============================================

export async function getRawMaterialInventory(filters?: { rawMaterialId?: number; warehouseId?: number }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(rawMaterialInventory);
  if (filters?.rawMaterialId) {
    query = query.where(eq(rawMaterialInventory.rawMaterialId, filters.rawMaterialId)) as typeof query;
  }
  if (filters?.warehouseId) {
    query = query.where(eq(rawMaterialInventory.warehouseId, filters.warehouseId)) as typeof query;
  }
  return query;
}

export async function getRawMaterialInventoryByLocation(rawMaterialId: number, warehouseId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rawMaterialInventory)
    .where(and(
      eq(rawMaterialInventory.rawMaterialId, rawMaterialId),
      eq(rawMaterialInventory.warehouseId, warehouseId)
    ))
    .limit(1);
  return result[0];
}

export async function upsertRawMaterialInventory(rawMaterialId: number, warehouseId: number, data: Partial<InsertRawMaterialInventory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getRawMaterialInventoryByLocation(rawMaterialId, warehouseId);
  if (existing) {
    await db.update(rawMaterialInventory).set(data).where(eq(rawMaterialInventory.id, existing.id));
    return { id: existing.id };
  } else {
    const result = await db.insert(rawMaterialInventory).values({
      rawMaterialId,
      warehouseId,
      unit: data.unit || 'EA',
      ...data,
    });
    return { id: result[0].insertId };
  }
}

// ============================================
// RAW MATERIAL TRANSACTIONS
// ============================================

export async function createRawMaterialTransaction(data: InsertRawMaterialTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(rawMaterialTransactions).values(data);
  return { id: result[0].insertId };
}

export async function getRawMaterialTransactions(rawMaterialId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(rawMaterialTransactions)
    .where(eq(rawMaterialTransactions.rawMaterialId, rawMaterialId))
    .orderBy(desc(rawMaterialTransactions.createdAt))
    .limit(limit);
}

// ============================================
// PO RECEIVING
// ============================================

export async function createPoReceivingRecord(data: InsertPoReceivingRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(poReceivingRecords).values(data);
  return { id: result[0].insertId };
}

export async function getPoReceivingRecords(purchaseOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(poReceivingRecords)
    .where(eq(poReceivingRecords.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(poReceivingRecords.receivedDate));
}

export async function createPoReceivingItem(data: InsertPoReceivingItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(poReceivingItems).values(data);
  return { id: result[0].insertId };
}

export async function getPoReceivingItems(receivingRecordId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(poReceivingItems)
    .where(eq(poReceivingItems.receivingRecordId, receivingRecordId));
}

// Receive PO items and update raw material inventory
export async function receivePurchaseOrderItems(
  purchaseOrderId: number,
  warehouseId: number,
  items: Array<{ purchaseOrderItemId: number; rawMaterialId?: number; productId?: number; quantity: number; unit: string; lotNumber?: string; expirationDate?: Date }>,
  receivedBy?: number,
  shipmentId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Create receiving record
  const receiving = await createPoReceivingRecord({
    purchaseOrderId,
    shipmentId,
    receivedDate: new Date(),
    receivedBy,
    warehouseId,
  });
  
  for (const item of items) {
    // Create receiving item record
    await createPoReceivingItem({
      receivingRecordId: receiving.id,
      purchaseOrderItemId: item.purchaseOrderItemId,
      rawMaterialId: item.rawMaterialId,
      productId: item.productId,
      receivedQuantity: item.quantity.toString(),
      unit: item.unit,
      lotNumber: item.lotNumber,
      expirationDate: item.expirationDate,
      condition: 'good',
    });
    
    // Update raw material inventory if it's a raw material
    if (item.rawMaterialId) {
      const currentInv = await getRawMaterialInventoryByLocation(item.rawMaterialId, warehouseId);
      const currentQty = parseFloat(currentInv?.quantity?.toString() || '0');
      const newQty = currentQty + item.quantity;
      
      await upsertRawMaterialInventory(item.rawMaterialId, warehouseId, {
        quantity: newQty.toFixed(4),
        availableQuantity: newQty.toFixed(4),
        unit: item.unit,
        lastReceivedDate: new Date(),
        lotNumber: item.lotNumber,
        expirationDate: item.expirationDate,
      });
      
      // Create transaction record
      await createRawMaterialTransaction({
        rawMaterialId: item.rawMaterialId,
        warehouseId,
        transactionType: 'receive',
        quantity: item.quantity.toFixed(4),
        previousQuantity: currentQty.toFixed(4),
        newQuantity: newQty.toFixed(4),
        unit: item.unit,
        referenceType: 'purchase_order',
        referenceId: purchaseOrderId,
        lotNumber: item.lotNumber,
        performedBy: receivedBy,
      });
    }
    
    // Update PO item received quantity
    const poItem = await db.select().from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId)).limit(1);
    if (poItem[0]) {
      const prevReceived = parseFloat(poItem[0].receivedQuantity?.toString() || '0');
      await db.update(purchaseOrderItems)
        .set({ receivedQuantity: (prevReceived + item.quantity).toFixed(4) })
        .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId));
    }
  }
  
  // Check if PO is fully received and update status
  const poItems = await db.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
  
  let allReceived = true;
  let anyReceived = false;
  for (const poi of poItems) {
    const ordered = parseFloat(poi.quantity?.toString() || '0');
    const received = parseFloat(poi.receivedQuantity?.toString() || '0');
    if (received >= ordered) {
      anyReceived = true;
    } else if (received > 0) {
      anyReceived = true;
      allReceived = false;
    } else {
      allReceived = false;
    }
  }
  
  if (allReceived) {
    await db.update(purchaseOrders).set({ status: 'received', receivedDate: new Date() })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  } else if (anyReceived) {
    await db.update(purchaseOrders).set({ status: 'partial' })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  // Update linked shipment status
  let shipmentToUpdate = shipmentId;
  if (!shipmentToUpdate) {
    // Find shipment linked to this PO
    const linkedShipment = await db.select()
      .from(shipments)
      .where(eq(shipments.purchaseOrderId, purchaseOrderId))
      .limit(1);
    if (linkedShipment[0]) {
      shipmentToUpdate = linkedShipment[0].id;
    }
  }

  if (shipmentToUpdate) {
    if (allReceived) {
      // Mark shipment as delivered
      await db.update(shipments)
        .set({
          status: 'delivered',
          deliveryDate: new Date(),
        })
        .where(eq(shipments.id, shipmentToUpdate));
    } else if (anyReceived) {
      // Shipment is in progress (partial delivery)
      const currentShipment = await db.select().from(shipments)
        .where(eq(shipments.id, shipmentToUpdate)).limit(1);
      if (currentShipment[0]?.status === 'pending') {
        await db.update(shipments)
          .set({ status: 'in_transit' })
          .where(eq(shipments.id, shipmentToUpdate));
      }
    }
  }

  return receiving;
}

// Consume materials for a work order
export async function consumeWorkOrderMaterials(workOrderId: number, performedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) throw new Error("Work order not found");
  
  const materials = await getWorkOrderMaterials(workOrderId);
  
  for (const mat of materials) {
    if (!mat.rawMaterialId) continue;
    
    const requiredQty = parseFloat(mat.requiredQuantity?.toString() || '0');
    const inv = await getRawMaterialInventoryByLocation(mat.rawMaterialId, workOrder.warehouseId || 0);
    
    if (!inv) {
      await updateWorkOrderMaterial(mat.id, { status: 'shortage' });
      continue;
    }
    
    const currentQty = parseFloat(inv.quantity?.toString() || '0');
    const consumeQty = Math.min(requiredQty, currentQty);
    const newQty = currentQty - consumeQty;
    
    // Update inventory
    await upsertRawMaterialInventory(mat.rawMaterialId, workOrder.warehouseId || 0, {
      quantity: newQty.toFixed(4),
      availableQuantity: newQty.toFixed(4),
    });
    
    // Create transaction
    await createRawMaterialTransaction({
      rawMaterialId: mat.rawMaterialId,
      warehouseId: workOrder.warehouseId || 0,
      transactionType: 'consume',
      quantity: (-consumeQty).toFixed(4),
      previousQuantity: currentQty.toFixed(4),
      newQuantity: newQty.toFixed(4),
      unit: mat.unit,
      referenceType: 'work_order',
      referenceId: workOrderId,
      performedBy,
    });
    
    // Update material status
    await updateWorkOrderMaterial(mat.id, {
      consumedQuantity: consumeQty.toFixed(4),
      status: consumeQty >= requiredQty ? 'consumed' : 'partial',
    });
  }
  
  // Update work order status
  await updateWorkOrder(workOrderId, { status: 'completed', actualEndDate: new Date() });
}


// Get purchase order items
export async function getPurchaseOrderItems(purchaseOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
}


// ============================================
// AI PRODUCTION FORECASTING
// ============================================

// Generate forecast number
function generateForecastNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `FC-${dateStr}-${random}`;
}

// Generate production plan number
function generatePlanNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PP-${dateStr}-${random}`;
}

// Generate suggested PO number
function generateSuggestedPoNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SPO-${dateStr}-${random}`;
}

// Demand Forecasts
export async function getDemandForecasts(filters?: { status?: string; productId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.status) conditions.push(eq(demandForecasts.status, filters.status as any));
  if (filters?.productId) conditions.push(eq(demandForecasts.productId, filters.productId));
  
  return db.select().from(demandForecasts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(demandForecasts.createdAt));
}

export async function getDemandForecastById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(demandForecasts).where(eq(demandForecasts.id, id)).limit(1);
  return result[0];
}

export async function createDemandForecast(data: Omit<InsertDemandForecast, 'forecastNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const forecastNumber = generateForecastNumber();
  const result = await db.insert(demandForecasts).values({ ...data, forecastNumber }).$returningId();
  return { id: result[0].id, forecastNumber };
}

export async function updateDemandForecast(id: number, data: Partial<InsertDemandForecast>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(demandForecasts).set(data).where(eq(demandForecasts.id, id));
}

// Production Plans
export async function getProductionPlans(filters?: { status?: string; productId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.status) conditions.push(eq(productionPlans.status, filters.status as any));
  if (filters?.productId) conditions.push(eq(productionPlans.productId, filters.productId));
  
  return db.select().from(productionPlans)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(productionPlans.createdAt));
}

export async function getProductionPlanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(productionPlans).where(eq(productionPlans.id, id)).limit(1);
  return result[0];
}

export async function createProductionPlan(data: Omit<InsertProductionPlan, 'planNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const planNumber = generatePlanNumber();
  const result = await db.insert(productionPlans).values({ ...data, planNumber }).$returningId();
  return { id: result[0].id, planNumber };
}

export async function updateProductionPlan(id: number, data: Partial<InsertProductionPlan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(productionPlans).set(data).where(eq(productionPlans.id, id));
}

// Material Requirements
export async function getMaterialRequirements(productionPlanId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(materialRequirements)
    .where(eq(materialRequirements.productionPlanId, productionPlanId));
}

export async function createMaterialRequirement(data: InsertMaterialRequirement) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(materialRequirements).values(data).$returningId();
  return { id: result[0].id };
}

export async function updateMaterialRequirement(id: number, data: Partial<InsertMaterialRequirement>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(materialRequirements).set(data).where(eq(materialRequirements.id, id));
}

// Suggested Purchase Orders
export async function getSuggestedPurchaseOrders(filters?: { status?: string; vendorId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.status) conditions.push(eq(suggestedPurchaseOrders.status, filters.status as any));
  if (filters?.vendorId) conditions.push(eq(suggestedPurchaseOrders.vendorId, filters.vendorId));
  
  return db.select().from(suggestedPurchaseOrders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(suggestedPurchaseOrders.priorityScore), desc(suggestedPurchaseOrders.createdAt));
}

export async function getSuggestedPurchaseOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(suggestedPurchaseOrders).where(eq(suggestedPurchaseOrders.id, id)).limit(1);
  return result[0];
}

export async function createSuggestedPurchaseOrder(data: Omit<InsertSuggestedPurchaseOrder, 'suggestedPoNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const suggestedPoNumber = generateSuggestedPoNumber();
  const result = await db.insert(suggestedPurchaseOrders).values({ ...data, suggestedPoNumber }).$returningId();
  return { id: result[0].id, suggestedPoNumber };
}

export async function updateSuggestedPurchaseOrder(id: number, data: Partial<InsertSuggestedPurchaseOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(suggestedPurchaseOrders).set(data).where(eq(suggestedPurchaseOrders.id, id));
}

// Suggested PO Items
export async function getSuggestedPoItems(suggestedPoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suggestedPoItems).where(eq(suggestedPoItems.suggestedPoId, suggestedPoId));
}

export async function createSuggestedPoItem(data: InsertSuggestedPoItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(suggestedPoItems).values(data).$returningId();
  return { id: result[0].id };
}

// Forecast Accuracy
export async function getForecastAccuracyHistory(productId?: number, limit?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const query = db.select().from(forecastAccuracy)
    .orderBy(desc(forecastAccuracy.calculatedAt));
  
  if (productId) {
    return query.where(eq(forecastAccuracy.productId, productId)).limit(limit || 50);
  }
  return query.limit(limit || 50);
}

export async function createForecastAccuracyRecord(data: InsertForecastAccuracy) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(forecastAccuracy).values(data).$returningId();
  return { id: result[0].id };
}

// Get historical sales data for forecasting
export async function getHistoricalSalesData(productId?: number, months?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const monthsBack = months || 12;
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - monthsBack);
  
  const conditions = [gte(orders.orderDate, startDate)];
  if (productId) {
    conditions.push(eq(orderItems.productId, productId));
  }
  
  // Get order items with dates
  const result = await db.select({
    productId: orderItems.productId,
    quantity: orderItems.quantity,
    orderDate: orders.orderDate,
    totalAmount: orderItems.totalAmount,
  })
  .from(orderItems)
  .innerJoin(orders, eq(orderItems.orderId, orders.id))
  .where(and(...conditions))
  .orderBy(orders.orderDate);
  
  return result;
}

// Get pending POs for a raw material (on order but not received)
export async function getPendingOrdersForMaterial(rawMaterialId: number) {
  const db = await getDb();
  if (!db) return [];

  // First check purchaseOrderRawMaterials for explicit links
  const linkedPOs = await db.select({
    poId: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    quantity: purchaseOrderRawMaterials.orderedQuantity,
    receivedQuantity: purchaseOrderRawMaterials.receivedQuantity,
    expectedDate: purchaseOrders.expectedDate,
    shipmentId: shipments.id,
    shipmentStatus: shipments.status,
  })
  .from(purchaseOrderRawMaterials)
  .innerJoin(purchaseOrderItems, eq(purchaseOrderRawMaterials.purchaseOrderItemId, purchaseOrderItems.id))
  .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
  .leftJoin(shipments, eq(shipments.purchaseOrderId, purchaseOrders.id))
  .where(and(
    eq(purchaseOrderRawMaterials.rawMaterialId, rawMaterialId),
    or(
      eq(purchaseOrders.status, 'sent'),
      eq(purchaseOrders.status, 'confirmed'),
      eq(purchaseOrders.status, 'partial')
    ),
    or(
      eq(purchaseOrderRawMaterials.status, 'ordered'),
      eq(purchaseOrderRawMaterials.status, 'partial')
    )
  ));

  // Also check PO items linked to products that match raw material by name
  const rm = await getRawMaterialById(rawMaterialId);
  if (rm) {
    const productMatches = await db.select({
      poId: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      quantity: purchaseOrderItems.quantity,
      receivedQuantity: purchaseOrderItems.receivedQuantity,
      expectedDate: purchaseOrders.expectedDate,
      shipmentId: shipments.id,
      shipmentStatus: shipments.status,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
    .innerJoin(products, eq(purchaseOrderItems.productId, products.id))
    .leftJoin(shipments, eq(shipments.purchaseOrderId, purchaseOrders.id))
    .where(and(
      or(
        eq(products.name, rm.name),
        eq(products.sku, rm.sku || '')
      ),
      or(
        eq(purchaseOrders.status, 'sent'),
        eq(purchaseOrders.status, 'confirmed'),
        eq(purchaseOrders.status, 'partial')
      )
    ));

    // Combine results, avoiding duplicates
    const allPOs = [...linkedPOs];
    for (const po of productMatches) {
      if (!allPOs.find(p => p.poId === po.poId && p.quantity === po.quantity)) {
        allPOs.push(po);
      }
    }
    return allPOs;
  }

  return linkedPOs;
}

// Get all pending/inbound inventory from POs (for InventoryHub display)
export async function getPendingInventoryFromPOs() {
  const db = await getDb();
  if (!db) return [];

  // Get all pending PO items with shipment info
  const pendingItems = await db.select({
    purchaseOrderId: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    poStatus: purchaseOrders.status,
    vendorId: purchaseOrders.vendorId,
    expectedDate: purchaseOrders.expectedDate,
    poItemId: purchaseOrderItems.id,
    productId: purchaseOrderItems.productId,
    description: purchaseOrderItems.description,
    orderedQuantity: purchaseOrderItems.quantity,
    receivedQuantity: purchaseOrderItems.receivedQuantity,
    shipmentId: shipments.id,
    shipmentNumber: shipments.shipmentNumber,
    shipmentStatus: shipments.status,
    trackingNumber: shipments.trackingNumber,
    carrier: shipments.carrier,
    shipDate: shipments.shipDate,
    deliveryDate: shipments.deliveryDate,
  })
  .from(purchaseOrderItems)
  .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
  .leftJoin(shipments, eq(shipments.purchaseOrderId, purchaseOrders.id))
  .where(
    or(
      eq(purchaseOrders.status, 'sent'),
      eq(purchaseOrders.status, 'confirmed'),
      eq(purchaseOrders.status, 'partial')
    )
  );

  // Enhance with raw material info if linked
  const enhancedItems = [];
  for (const item of pendingItems) {
    const orderedQty = parseFloat(item.orderedQuantity?.toString() || '0');
    const receivedQty = parseFloat(item.receivedQuantity?.toString() || '0');
    const pendingQty = orderedQty - receivedQty;

    if (pendingQty <= 0) continue;

    // Check for raw material link
    const rmLink = await db.select()
      .from(purchaseOrderRawMaterials)
      .where(eq(purchaseOrderRawMaterials.purchaseOrderItemId, item.poItemId))
      .limit(1);

    let rawMaterialId = rmLink[0]?.rawMaterialId;
    let rawMaterialName = null;

    // If no explicit link, try matching by product
    if (!rawMaterialId && item.productId) {
      const product = await getProductById(item.productId);
      if (product) {
        const rm = await db.select().from(rawMaterials)
          .where(or(
            eq(rawMaterials.name, product.name),
            eq(rawMaterials.sku, product.sku || '')
          ))
          .limit(1);
        if (rm[0]) {
          rawMaterialId = rm[0].id;
          rawMaterialName = rm[0].name;
        }
      }
    } else if (rawMaterialId) {
      const rm = await getRawMaterialById(rawMaterialId);
      rawMaterialName = rm?.name;
    }

    enhancedItems.push({
      ...item,
      rawMaterialId,
      rawMaterialName,
      pendingQuantity: pendingQty,
      status: item.shipmentStatus === 'in_transit' ? 'in_transit' :
              item.shipmentStatus === 'delivered' ? 'arrived' : 'on_order',
    });
  }

  return enhancedItems;
}

// Get inbound shipments from POs
export async function getInboundShipmentsFromPOs() {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    shipmentId: shipments.id,
    shipmentNumber: shipments.shipmentNumber,
    status: shipments.status,
    carrier: shipments.carrier,
    trackingNumber: shipments.trackingNumber,
    shipDate: shipments.shipDate,
    deliveryDate: shipments.deliveryDate,
    purchaseOrderId: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    poStatus: purchaseOrders.status,
    vendorId: purchaseOrders.vendorId,
    expectedDate: purchaseOrders.expectedDate,
  })
  .from(shipments)
  .innerJoin(purchaseOrders, eq(shipments.purchaseOrderId, purchaseOrders.id))
  .where(and(
    eq(shipments.type, 'inbound'),
    or(
      eq(shipments.status, 'pending'),
      eq(shipments.status, 'in_transit')
    )
  ))
  .orderBy(desc(shipments.createdAt));
}

// Convert suggested PO to actual PO
export async function convertSuggestedPoToActualPo(suggestedPoId: number, approvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const suggestedPo = await getSuggestedPurchaseOrderById(suggestedPoId);
  if (!suggestedPo) throw new Error("Suggested PO not found");
  
  const items = await getSuggestedPoItems(suggestedPoId);
  
  // Calculate totals
  let subtotal = 0;
  for (const item of items) {
    subtotal += parseFloat(item.totalAmount?.toString() || '0');
  }
  
  // Create actual PO
  const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const poResult = await db.insert(purchaseOrders).values({
    poNumber,
    vendorId: suggestedPo.vendorId,
    orderDate: new Date(),
    expectedDate: suggestedPo.requiredByDate || undefined,
    subtotal: subtotal.toFixed(2),
    totalAmount: subtotal.toFixed(2),
    currency: suggestedPo.currency || 'USD',
    status: 'draft',
    createdBy: approvedBy,
    approvedBy,
    approvedAt: new Date(),
  }).$returningId();
  
  const poId = poResult[0].id;
  
  // Create PO items
  for (const item of items) {
    await db.insert(purchaseOrderItems).values({
      purchaseOrderId: poId,
      productId: item.productId || undefined,
      description: item.description || '',
      quantity: item.quantity?.toString() || '0',
      unitPrice: item.unitPrice?.toString() || '0',
      totalAmount: item.totalAmount?.toString() || '0',
    });
  }
  
  // Update suggested PO status
  await updateSuggestedPurchaseOrder(suggestedPoId, {
    status: 'converted',
    convertedPoId: poId,
    approvedBy,
    approvedAt: new Date(),
  });
  
  // Update material requirements
  for (const item of items) {
    if (item.materialRequirementId) {
      await updateMaterialRequirement(item.materialRequirementId, {
        status: 'po_generated',
        generatedPoId: poId,
      });
    }
  }
  
  return { poId, poNumber };
}

// Get all products with their BOMs for forecasting
export async function getProductsWithBoms() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    product: products,
    bom: billOfMaterials,
  })
  .from(products)
  .leftJoin(billOfMaterials, eq(billOfMaterials.productId, products.id));
  
  return result;
}

// Get vendor for a raw material (preferred or first available)
export async function getPreferredVendorForMaterial(rawMaterialId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  // Get the raw material
  const rm = await db.select().from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId)).limit(1);
  if (!rm[0]) return undefined;
  
  // Get vendor from description field (may contain supplier info) or find one that has supplied this before
  if (rm[0].description) {
    const vendor = await db.select().from(vendors)
      .where(like(vendors.name, `%${rm[0].description.split(' ')[0]}%`))
      .limit(1);
    if (vendor[0]) return vendor[0];
  }
  
  // Return first active vendor as fallback
  const anyVendor = await db.select().from(vendors)
    .where(eq(vendors.status, 'active'))
    .limit(1);
  return anyVendor[0];
}


// ============================================
// LOT/BATCH TRACKING
// ============================================

export async function createInventoryLot(data: Omit<InsertInventoryLot, 'lotCode'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const lotCode = `LOT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const result = await db.insert(inventoryLots).values({ ...data, lotCode });
  return { id: result[0].insertId, lotCode };
}

export async function getInventoryLots(filters?: { productId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.productId) conditions.push(eq(inventoryLots.productId, filters.productId));
  if (filters?.status) conditions.push(eq(inventoryLots.status, filters.status as any));
  return db.select().from(inventoryLots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryLots.createdAt));
}

export async function getInventoryLotById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inventoryLots).where(eq(inventoryLots.id, id)).limit(1);
  return result[0];
}

export async function updateInventoryLot(id: number, data: Partial<InsertInventoryLot>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inventoryLots).set(data).where(eq(inventoryLots.id, id));
}

// Inventory Balances (lot-level)
export async function getInventoryBalances(filters?: { lotId?: number; productId?: number; warehouseId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.lotId) conditions.push(eq(inventoryBalances.lotId, filters.lotId));
  if (filters?.productId) conditions.push(eq(inventoryBalances.productId, filters.productId));
  if (filters?.warehouseId) conditions.push(eq(inventoryBalances.warehouseId, filters.warehouseId));
  if (filters?.status) conditions.push(eq(inventoryBalances.status, filters.status as any));
  return db.select().from(inventoryBalances)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryBalances.updatedAt));
}

export async function upsertInventoryBalance(lotId: number, productId: number, warehouseId: number, status: string, quantity: number, unit: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(inventoryBalances)
    .where(and(
      eq(inventoryBalances.lotId, lotId),
      eq(inventoryBalances.warehouseId, warehouseId),
      eq(inventoryBalances.status, status as any)
    ))
    .limit(1);
  
  if (existing[0]) {
    await db.update(inventoryBalances)
      .set({ quantity: quantity.toString(), updatedAt: new Date() })
      .where(eq(inventoryBalances.id, existing[0].id));
    return { id: existing[0].id };
  } else {
    const result = await db.insert(inventoryBalances).values({
      lotId,
      productId,
      warehouseId,
      status: status as any,
      quantity: quantity.toString(),
      unit
    });
    return { id: result[0].insertId };
  }
}

export async function updateInventoryBalanceQuantity(id: number, quantityChange: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const balance = await db.select().from(inventoryBalances).where(eq(inventoryBalances.id, id)).limit(1);
  if (!balance[0]) throw new Error("Balance not found");
  
  const newQty = parseFloat(balance[0].quantity) + quantityChange;
  await db.update(inventoryBalances)
    .set({ quantity: newQty.toString(), updatedAt: new Date() })
    .where(eq(inventoryBalances.id, id));
  return { newQuantity: newQty };
}

// Inventory Transactions (ledger)
export async function createInventoryTransaction(data: Omit<InsertInventoryTransaction, 'transactionNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const transactionNumber = `TXN-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.insert(inventoryTransactions).values({ ...data, transactionNumber });
  return { id: result[0].insertId, transactionNumber };
}

export async function getInventoryTransactionHistory(filters?: { productId?: number; lotId?: number; warehouseId?: number; type?: string }, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.productId) conditions.push(eq(inventoryTransactions.productId, filters.productId));
  if (filters?.lotId) conditions.push(eq(inventoryTransactions.lotId, filters.lotId));
  if (filters?.warehouseId) conditions.push(or(
    eq(inventoryTransactions.fromWarehouseId, filters.warehouseId),
    eq(inventoryTransactions.toWarehouseId, filters.warehouseId)
  ));
  if (filters?.type) conditions.push(eq(inventoryTransactions.transactionType, filters.type as any));
  
  return db.select().from(inventoryTransactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryTransactions.performedAt))
    .limit(limit);
}

// Reserve inventory (available -> reserved)
export async function reserveInventory(lotId: number, productId: number, warehouseId: number, quantity: number, referenceType: string, referenceId: number, performedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get available balance
  const available = await db.select().from(inventoryBalances)
    .where(and(
      eq(inventoryBalances.lotId, lotId),
      eq(inventoryBalances.warehouseId, warehouseId),
      eq(inventoryBalances.status, 'available')
    ))
    .limit(1);
  
  if (!available[0] || parseFloat(available[0].quantity) < quantity) {
    throw new Error("Insufficient available inventory");
  }
  
  const previousBalance = parseFloat(available[0].quantity);
  const newAvailable = previousBalance - quantity;
  
  // Decrease available
  await db.update(inventoryBalances)
    .set({ quantity: newAvailable.toString(), updatedAt: new Date() })
    .where(eq(inventoryBalances.id, available[0].id));
  
  // Increase reserved
  await upsertInventoryBalance(lotId, productId, warehouseId, 'reserved', quantity, available[0].unit);
  
  // Create transaction
  await createInventoryTransaction({
    transactionType: 'reserve',
    lotId,
    productId,
    fromWarehouseId: warehouseId,
    toWarehouseId: warehouseId,
    fromStatus: 'available',
    toStatus: 'reserved',
    quantity: quantity.toString(),
    unit: available[0].unit,
    previousBalance: previousBalance.toString(),
    newBalance: newAvailable.toString(),
    referenceType,
    referenceId,
    performedBy
  });
  
  return { success: true };
}

// Release reservation (reserved -> available)
export async function releaseReservation(lotId: number, productId: number, warehouseId: number, quantity: number, referenceType: string, referenceId: number, performedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get reserved balance
  const reserved = await db.select().from(inventoryBalances)
    .where(and(
      eq(inventoryBalances.lotId, lotId),
      eq(inventoryBalances.warehouseId, warehouseId),
      eq(inventoryBalances.status, 'reserved')
    ))
    .limit(1);
  
  if (!reserved[0] || parseFloat(reserved[0].quantity) < quantity) {
    throw new Error("Insufficient reserved inventory");
  }
  
  const previousReserved = parseFloat(reserved[0].quantity);
  const newReserved = previousReserved - quantity;
  
  // Decrease reserved
  await db.update(inventoryBalances)
    .set({ quantity: newReserved.toString(), updatedAt: new Date() })
    .where(eq(inventoryBalances.id, reserved[0].id));
  
  // Get or create available balance
  const available = await db.select().from(inventoryBalances)
    .where(and(
      eq(inventoryBalances.lotId, lotId),
      eq(inventoryBalances.warehouseId, warehouseId),
      eq(inventoryBalances.status, 'available')
    ))
    .limit(1);
  
  const previousAvailable = available[0] ? parseFloat(available[0].quantity) : 0;
  const newAvailable = previousAvailable + quantity;
  
  await upsertInventoryBalance(lotId, productId, warehouseId, 'available', newAvailable, reserved[0].unit);
  
  // Create transaction
  await createInventoryTransaction({
    transactionType: 'release',
    lotId,
    productId,
    fromWarehouseId: warehouseId,
    toWarehouseId: warehouseId,
    fromStatus: 'reserved',
    toStatus: 'available',
    quantity: quantity.toString(),
    unit: reserved[0].unit,
    previousBalance: previousReserved.toString(),
    newBalance: newReserved.toString(),
    referenceType,
    referenceId,
    performedBy
  });
  
  return { success: true };
}

// Ship inventory (reserved -> 0, decreases on_hand)
export async function shipInventory(lotId: number, productId: number, warehouseId: number, quantity: number, referenceType: string, referenceId: number, performedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get reserved balance
  const reserved = await db.select().from(inventoryBalances)
    .where(and(
      eq(inventoryBalances.lotId, lotId),
      eq(inventoryBalances.warehouseId, warehouseId),
      eq(inventoryBalances.status, 'reserved')
    ))
    .limit(1);
  
  if (!reserved[0] || parseFloat(reserved[0].quantity) < quantity) {
    throw new Error("Insufficient reserved inventory to ship");
  }
  
  const previousReserved = parseFloat(reserved[0].quantity);
  const newReserved = previousReserved - quantity;
  
  // Decrease reserved
  await db.update(inventoryBalances)
    .set({ quantity: newReserved.toString(), updatedAt: new Date() })
    .where(eq(inventoryBalances.id, reserved[0].id));
  
  // Create transaction
  await createInventoryTransaction({
    transactionType: 'ship',
    lotId,
    productId,
    fromWarehouseId: warehouseId,
    fromStatus: 'reserved',
    quantity: quantity.toString(),
    unit: reserved[0].unit,
    previousBalance: previousReserved.toString(),
    newBalance: newReserved.toString(),
    referenceType,
    referenceId,
    performedBy
  });
  
  return { success: true };
}

// ============================================
// WORK ORDER OUTPUTS
// ============================================

export async function createWorkOrderOutput(workOrderId: number, productId: number, quantity: number, warehouseId: number, yieldPercent?: number, performedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Create a new lot for the output
  const { id: lotId, lotCode } = await createInventoryLot({
    productId,
    productType: 'finished',
    sourceType: 'production',
    sourceReferenceId: workOrderId,
    status: 'active',
    manufactureDate: new Date()
  });
  
  // Create the work order output record
  const result = await db.insert(workOrderOutputs).values({
    workOrderId,
    lotId,
    productId,
    quantity: quantity.toString(),
    yieldPercent: yieldPercent?.toString(),
    warehouseId,
    producedBy: performedBy
  });
  
  // Create inventory balance for the new lot
  await upsertInventoryBalance(lotId, productId, warehouseId, 'available', quantity, 'EA');
  
  // Create inventory transaction
  await createInventoryTransaction({
    transactionType: 'receive',
    lotId,
    productId,
    toWarehouseId: warehouseId,
    toStatus: 'available',
    quantity: quantity.toString(),
    unit: 'EA',
    newBalance: quantity.toString(),
    referenceType: 'work_order',
    referenceId: workOrderId,
    performedBy,
    reason: 'Production output'
  });
  
  return { id: result[0].insertId, lotId, lotCode };
}

export async function getWorkOrderOutputs(workOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workOrderOutputs)
    .where(eq(workOrderOutputs.workOrderId, workOrderId))
    .orderBy(desc(workOrderOutputs.producedAt));
}

// ============================================
// ALERT SYSTEM
// ============================================

export async function createAlert(data: Omit<InsertAlert, 'alertNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const alertNumber = `ALT-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.insert(alerts).values({ ...data, alertNumber });
  return { id: result[0].insertId, alertNumber };
}

export async function getAlerts(filters?: { type?: string; status?: string; severity?: string; assignedTo?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.type) conditions.push(eq(alerts.type, filters.type as any));
  if (filters?.status) conditions.push(eq(alerts.status, filters.status as any));
  if (filters?.severity) conditions.push(eq(alerts.severity, filters.severity as any));
  if (filters?.assignedTo) conditions.push(eq(alerts.assignedTo, filters.assignedTo));
  
  return db.select().from(alerts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(alerts.createdAt));
}

export async function getAlertById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return result[0];
}

export async function updateAlert(id: number, data: Partial<InsertAlert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set(data).where(eq(alerts.id, id));
}

export async function acknowledgeAlert(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({
    status: 'acknowledged',
    acknowledgedBy: userId,
    acknowledgedAt: new Date()
  }).where(eq(alerts.id, id));
}

export async function resolveAlert(id: number, userId: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({
    status: 'resolved',
    resolvedBy: userId,
    resolvedAt: new Date(),
    resolutionNotes: notes
  }).where(eq(alerts.id, id));
}

// Generate low stock alerts
export async function generateLowStockAlerts() {
  const db = await getDb();
  if (!db) return [];
  
  // Check raw materials below reorder point
  const lowStockMaterials = await db.select().from(rawMaterialInventory)
    .where(sql`${rawMaterialInventory.quantity} <= ${rawMaterialInventory.reorderPoint}`);
  
  const createdAlerts: number[] = [];
  
  for (const material of lowStockMaterials) {
    // Check if alert already exists
    const existing = await db.select().from(alerts)
      .where(and(
        eq(alerts.type, 'low_stock'),
        eq(alerts.entityType, 'raw_material'),
        eq(alerts.entityId, material.rawMaterialId),
        eq(alerts.status, 'open')
      ))
      .limit(1);
    
    if (!existing[0]) {
      const rawMat = await getRawMaterialById(material.rawMaterialId);
      const { id } = await createAlert({
        type: 'low_stock',
        severity: parseFloat(material.quantity) === 0 ? 'critical' : 'warning',
        title: `Low stock: ${rawMat?.name || 'Unknown material'}`,
        description: `Current quantity (${material.quantity}) is at or below reorder point (${material.reorderPoint})`,
        entityType: 'raw_material',
        entityId: material.rawMaterialId,
        thresholdValue: material.reorderPoint || '0',
        actualValue: material.quantity,
        autoGenerated: true
      });
      createdAlerts.push(id);
    }
  }
  
  return createdAlerts;
}

// Recommendations
export async function createRecommendation(data: InsertRecommendation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recommendations).values(data);
  return { id: result[0].insertId };
}

export async function getRecommendations(filters?: { status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(recommendations.status, filters.status as any));
  if (filters?.type) conditions.push(eq(recommendations.type, filters.type as any));
  
  return db.select().from(recommendations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recommendations.createdAt));
}

export async function approveRecommendation(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(recommendations).set({
    status: 'approved',
    approvedBy: userId,
    approvedAt: new Date()
  }).where(eq(recommendations.id, id));
}

export async function rejectRecommendation(id: number, userId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(recommendations).set({
    status: 'rejected',
    rejectedBy: userId,
    rejectedAt: new Date(),
    rejectionReason: reason
  }).where(eq(recommendations.id, id));
}

// ============================================
// SHOPIFY INTEGRATION
// ============================================

export async function getShopifyStores() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shopifyStores).orderBy(shopifyStores.storeName);
}

export async function getShopifyStoreById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shopifyStores).where(eq(shopifyStores.id, id)).limit(1);
  return result[0];
}

export async function getShopifyStoreByDomain(domain: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shopifyStores).where(eq(shopifyStores.storeDomain, domain)).limit(1);
  return result[0];
}

export async function createShopifyStore(data: InsertShopifyStore) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shopifyStores).values(data);
  return { id: result[0].insertId };
}

export async function updateShopifyStore(id: number, data: Partial<InsertShopifyStore>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shopifyStores).set(data).where(eq(shopifyStores.id, id));
}

export async function upsertShopifyStore(storeDomain: string, data: Partial<InsertShopifyStore>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getShopifyStoreByDomain(storeDomain);
  if (existing) {
    await updateShopifyStore(existing.id, data);
    return { id: existing.id };
  } else {
    // Ensure storeDomain is included in the create payload
    const createData: InsertShopifyStore = {
      ...data,
      storeDomain,
    } as InsertShopifyStore;
    return createShopifyStore(createData);
  }
}

// Webhook Events
export async function createWebhookEvent(data: InsertWebhookEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(webhookEvents).values(data);
  return { id: result[0].insertId };
}

export async function getWebhookEventByIdempotencyKey(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(webhookEvents).where(eq(webhookEvents.idempotencyKey, key)).limit(1);
  return result[0];
}

export async function updateWebhookEvent(id: number, data: Partial<InsertWebhookEvent>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(webhookEvents).set(data).where(eq(webhookEvents.id, id));
}

// SKU Mappings
export async function getShopifySkuMappings(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shopifySkuMappings).where(eq(shopifySkuMappings.storeId, storeId));
}

export async function createShopifySkuMapping(data: InsertShopifySkuMapping) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shopifySkuMappings).values(data);
  return { id: result[0].insertId };
}

export async function getProductByShopifySku(storeId: number, shopifyVariantId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const mapping = await db.select().from(shopifySkuMappings)
    .where(and(
      eq(shopifySkuMappings.storeId, storeId),
      eq(shopifySkuMappings.shopifyVariantId, shopifyVariantId),
      eq(shopifySkuMappings.isActive, true)
    ))
    .limit(1);
  
  if (!mapping[0]) return undefined;
  return getProductById(mapping[0].productId);
}

// Location Mappings
export async function getShopifyLocationMappings(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shopifyLocationMappings).where(eq(shopifyLocationMappings.storeId, storeId));
}

export async function createShopifyLocationMapping(data: InsertShopifyLocationMapping) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shopifyLocationMappings).values(data);
  return { id: result[0].insertId };
}

export async function getWarehouseByShopifyLocation(storeId: number, shopifyLocationId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const mapping = await db.select().from(shopifyLocationMappings)
    .where(and(
      eq(shopifyLocationMappings.storeId, storeId),
      eq(shopifyLocationMappings.shopifyLocationId, shopifyLocationId),
      eq(shopifyLocationMappings.isActive, true)
    ))
    .limit(1);
  
  if (!mapping[0]) return undefined;
  return getWarehouseById(mapping[0].warehouseId);
}

// ============================================
// SALES ORDERS & RESERVATIONS
// ============================================

export async function createSalesOrder(data: Omit<InsertSalesOrder, 'orderNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.insert(salesOrders).values({ ...data, orderNumber });
  return { id: result[0].insertId, orderNumber };
}

export async function getSalesOrders(filters?: { status?: string; source?: string; customerId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(salesOrders.status, filters.status as any));
  if (filters?.source) conditions.push(eq(salesOrders.source, filters.source as any));
  if (filters?.customerId) conditions.push(eq(salesOrders.customerId, filters.customerId));
  
  return db.select().from(salesOrders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(salesOrders.orderDate));
}

export async function getSalesOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1);
  return result[0];
}

export async function getSalesOrderByShopifyId(shopifyOrderId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(salesOrders).where(eq(salesOrders.shopifyOrderId, shopifyOrderId)).limit(1);
  return result[0];
}

export async function updateSalesOrder(id: number, data: Partial<InsertSalesOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(salesOrders).set(data).where(eq(salesOrders.id, id));
}

export async function createSalesOrderLine(data: InsertSalesOrderLine) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(salesOrderLines).values(data);
  return { id: result[0].insertId };
}

export async function getSalesOrderLines(salesOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(salesOrderLines).where(eq(salesOrderLines.salesOrderId, salesOrderId));
}

// Inventory Reservations
export async function createInventoryReservation(data: InsertInventoryReservation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventoryReservations).values(data);
  return { id: result[0].insertId };
}

export async function getInventoryReservations(salesOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventoryReservations).where(eq(inventoryReservations.salesOrderId, salesOrderId));
}

export async function updateInventoryReservation(id: number, data: Partial<InsertInventoryReservation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inventoryReservations).set(data).where(eq(inventoryReservations.id, id));
}

// ============================================
// INVENTORY ALLOCATION
// ============================================

export async function createInventoryAllocation(data: InsertInventoryAllocation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventoryAllocations).values(data);
  return { id: result[0].insertId };
}

export async function getInventoryAllocations(filters?: { channel?: string; productId?: number; storeId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.channel) conditions.push(eq(inventoryAllocations.channel, filters.channel as any));
  if (filters?.productId) conditions.push(eq(inventoryAllocations.productId, filters.productId));
  if (filters?.storeId) conditions.push(eq(inventoryAllocations.storeId, filters.storeId));
  
  return db.select().from(inventoryAllocations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryAllocations.updatedAt));
}

export async function updateInventoryAllocation(id: number, data: Partial<InsertInventoryAllocation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inventoryAllocations).set(data).where(eq(inventoryAllocations.id, id));
}

// Sales Events
export async function createSalesEvent(data: InsertSalesEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(salesEvents).values(data);
  return { id: result[0].insertId };
}

export async function getSalesEvents(filters?: { source?: string; salesOrderId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.source) conditions.push(eq(salesEvents.source, filters.source as any));
  if (filters?.salesOrderId) conditions.push(eq(salesEvents.salesOrderId, filters.salesOrderId));
  
  return db.select().from(salesEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(salesEvents.processedAt));
}

// ============================================
// INVENTORY RECONCILIATION
// ============================================

export async function createReconciliationRun(data: Omit<InsertReconciliationRun, 'runNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const runNumber = `REC-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.insert(reconciliationRuns).values({ ...data, runNumber });
  return { id: result[0].insertId, runNumber };
}

export async function getReconciliationRuns(filters?: { status?: string; channel?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(reconciliationRuns.status, filters.status as any));
  if (filters?.channel) conditions.push(eq(reconciliationRuns.channel, filters.channel as any));
  
  return db.select().from(reconciliationRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reconciliationRuns.startedAt));
}

export async function getReconciliationRunById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reconciliationRuns).where(eq(reconciliationRuns.id, id)).limit(1);
  return result[0];
}

export async function updateReconciliationRun(id: number, data: Partial<InsertReconciliationRun>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reconciliationRuns).set(data).where(eq(reconciliationRuns.id, id));
}

export async function createReconciliationLine(data: InsertReconciliationLine) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reconciliationLines).values(data);
  return { id: result[0].insertId };
}

export async function getReconciliationLines(runId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reconciliationLines)
    .where(eq(reconciliationLines.runId, runId))
    .orderBy(reconciliationLines.status);
}

// Run reconciliation for a channel
export async function runInventoryReconciliation(channel: 'shopify' | 'amazon' | 'all', storeId?: number, initiatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Create reconciliation run
  const { id: runId, runNumber } = await createReconciliationRun({
    type: 'manual',
    channel,
    storeId,
    status: 'running',
    initiatedBy
  });
  
  try {
    // Get all allocations for this channel
    const allocations = await getInventoryAllocations({ 
      channel: channel === 'all' ? undefined : channel,
      storeId 
    });
    
    let totalSkus = 0;
    let passedSkus = 0;
    let warningSkus = 0;
    let criticalSkus = 0;
    
    for (const allocation of allocations) {
      totalSkus++;
      
      const erpQty = parseFloat(allocation.remainingQuantity);
      const channelQty = allocation.channelReportedQuantity ? parseFloat(allocation.channelReportedQuantity) : 0;
      const delta = erpQty - channelQty;
      const variancePercent = erpQty > 0 ? Math.abs(delta / erpQty * 100) : (channelQty > 0 ? 100 : 0);
      
      // Determine status based on thresholds
      let status: 'pass' | 'warning' | 'critical' = 'pass';
      if (Math.abs(delta) <= 1 || variancePercent <= 0.5) {
        status = 'pass';
        passedSkus++;
      } else if (variancePercent > 3) {
        status = 'critical';
        criticalSkus++;
      } else {
        status = 'warning';
        warningSkus++;
      }
      
      // Get product SKU
      const product = await getProductById(allocation.productId);
      
      await createReconciliationLine({
        runId,
        productId: allocation.productId,
        sku: product?.sku,
        warehouseId: allocation.warehouseId,
        erpQuantity: erpQty.toString(),
        channelQuantity: channelQty.toString(),
        deltaQuantity: delta.toString(),
        variancePercent: variancePercent.toString(),
        status
      });
    }
    
    // Update run with results
    await updateReconciliationRun(runId, {
      status: 'completed',
      completedAt: new Date(),
      totalSkus,
      passedSkus,
      warningSkus,
      criticalSkus
    });
    
    // Create alerts for critical variances
    if (criticalSkus > 0) {
      await createAlert({
        type: 'reconciliation_variance',
        severity: 'critical',
        title: `Inventory reconciliation found ${criticalSkus} critical variances`,
        description: `Reconciliation run ${runNumber} completed with ${criticalSkus} SKUs having variance > 3%`,
        entityType: 'reconciliation_run',
        entityId: runId,
        autoGenerated: true
      });
    }
    
    return { runId, runNumber, totalSkus, passedSkus, warningSkus, criticalSkus };
  } catch (error) {
    await updateReconciliationRun(runId, {
      status: 'failed',
      completedAt: new Date(),
      notes: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Get available inventory (not reserved) for a product
export async function getAvailableInventoryByProduct(productId: number) {
  const db = await getDb();
  if (!db) return { available: 0, reserved: 0, total: 0 };
  
  const balances = await db.select({
    status: inventoryBalances.status,
    totalQty: sum(inventoryBalances.quantity)
  })
    .from(inventoryBalances)
    .where(eq(inventoryBalances.productId, productId))
    .groupBy(inventoryBalances.status);
  
  let available = 0;
  let reserved = 0;
  
  for (const b of balances) {
    if (b.status === 'available') available = parseFloat(b.totalQty || '0');
    if (b.status === 'reserved') reserved = parseFloat(b.totalQty || '0');
  }
  
  return { available, reserved, total: available + reserved };
}


// ============================================
// SYNC LOGS
// ============================================

export async function createSyncLog(data: {
  integration: string;
  action: string;
  status: 'success' | 'error' | 'warning' | 'pending';
  details?: string;
  recordsProcessed?: number;
  recordsFailed?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(syncLogs).values({
    integration: data.integration,
    action: data.action,
    status: data.status,
    details: data.details || null,
    recordsProcessed: data.recordsProcessed || null,
    recordsFailed: data.recordsFailed || null,
    errorMessage: data.errorMessage || null,
    metadata: data.metadata || null,
  });
  return { id: result.insertId };
}

export async function getSyncHistory(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select()
    .from(syncLogs)
    .orderBy(desc(syncLogs.createdAt))
    .limit(limit);
}

export async function clearSyncHistory() {
  const db = await getDb();
  if (!db) return;
  await db.delete(syncLogs);
}


// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

export type NotificationType = 
  | "shipping_update" | "inventory_low" | "inventory_received" | "inventory_adjustment"
  | "po_approved" | "po_shipped" | "po_received" | "po_fulfilled"
  | "work_order_started" | "work_order_completed" | "work_order_shortage"
  | "sales_order_new" | "sales_order_shipped" | "sales_order_delivered"
  | "alert" | "system" | "info" | "warning" | "error" | "success" | "reminder";

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  severity?: "info" | "warning" | "critical";
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    severity: input.severity || "info",
    link: input.link,
    metadata: input.metadata,
    isRead: false,
  });
  
  return result.insertId;
}

export async function createNotificationsForAllUsers(
  input: Omit<CreateNotificationInput, "userId">,
  userIds: number[]
) {
  const db = await getDb();
  if (!db || userIds.length === 0) return [];
  
  const notificationValues = userIds.map(userId => ({
    userId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    severity: input.severity || "info" as const,
    link: input.link,
    metadata: input.metadata,
    isRead: false,
  }));
  
  await db.insert(notifications).values(notificationValues);
  return notificationValues.length;
}

export async function getUserNotifications(userId: number, options?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(notifications.userId, userId)];
  if (options?.unreadOnly) {
    conditions.push(eq(notifications.isRead, false));
  }
  
  return db.select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    ));
  
  return result?.count || 0;
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId)
    ));
  
  return true;
}

export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    ));
  
  return true;
}

export async function deleteNotification(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(notifications)
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId)
    ));
  
  return true;
}

export async function deleteOldNotifications(daysOld: number = 30) {
  const db = await getDb();
  if (!db) return 0;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const [result] = await db.delete(notifications)
    .where(lt(notifications.createdAt, cutoffDate));
  
  return result.affectedRows || 0;
}

// Notification preferences
export async function getUserNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
}

export async function updateNotificationPreference(
  userId: number,
  notificationType: string,
  settings: { inApp?: boolean; email?: boolean; push?: boolean }
) {
  const db = await getDb();
  if (!db) return false;
  
  // Check if preference exists
  const existing = await db.select()
    .from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.notificationType, notificationType)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    await db.update(notificationPreferences)
      .set(settings)
      .where(and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.notificationType, notificationType)
      ));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      notificationType,
      inApp: settings.inApp ?? true,
      email: settings.email ?? false,
      push: settings.push ?? false,
    });
  }
  
  return true;
}

// Helper to check if user should receive notification
export async function shouldNotifyUser(userId: number, notificationType: string, channel: "inApp" | "email" | "push") {
  const db = await getDb();
  if (!db) return channel === "inApp"; // Default to in-app only
  
  const [pref] = await db.select()
    .from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.notificationType, notificationType)
    ))
    .limit(1);
  
  if (!pref) return channel === "inApp"; // Default to in-app only
  
  return pref[channel] ?? false;
}

// Bulk notification creation for events
export async function notifyUsersOfEvent(
  event: {
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: number;
    severity?: "info" | "warning" | "critical";
    link?: string;
    metadata?: Record<string, unknown>;
  },
  userIds: number[]
) {
  const db = await getDb();
  if (!db || userIds.length === 0) return { inApp: 0, email: 0 };
  
  let inAppCount = 0;
  let emailCount = 0;
  
  for (const userId of userIds) {
    const shouldInApp = await shouldNotifyUser(userId, event.type, "inApp");
    const shouldEmail = await shouldNotifyUser(userId, event.type, "email");
    
    if (shouldInApp) {
      await createNotification({ ...event, userId });
      inAppCount++;
    }
    
    // Email notifications would be handled here with SendGrid
    if (shouldEmail) {
      emailCount++;
      // TODO: Send email notification via SendGrid
    }
  }
  
  return { inApp: inAppCount, email: emailCount };
}


// ============================================
// EMAIL SCANNING & DOCUMENT PARSING
// ============================================

export async function createInboundEmail(input: InsertInboundEmail) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(inboundEmails).values(input);
  return { id: result[0].insertId };
}

export async function getInboundEmails(options?: {
  status?: string;
  category?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (options?.status) {
    conditions.push(eq(inboundEmails.parsingStatus, options.status as any));
  }
  
  if (options?.category) {
    conditions.push(eq(inboundEmails.category, options.category as any));
  }
  
  if (options?.priority) {
    conditions.push(eq(inboundEmails.priority, options.priority as any));
  }
  
  let query = db.select().from(inboundEmails);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);
}

export async function getInboundEmailById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(inboundEmails).where(eq(inboundEmails.id, id));
  return result[0] || null;
}

export async function updateInboundEmailStatus(
  id: number,
  status: "pending" | "processing" | "parsed" | "failed" | "reviewed" | "archived",
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updates: any = { parsingStatus: status };
  if (status === "parsed") {
    updates.parsedAt = new Date();
  }
  if (errorMessage) {
    updates.errorMessage = errorMessage;
  }
  
  await db.update(inboundEmails).set(updates).where(eq(inboundEmails.id, id));
}

export async function deleteInboundEmail(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete related documents first
  await db.delete(parsedDocuments).where(eq(parsedDocuments.emailId, id));
  // Delete related attachments
  await db.delete(emailAttachments).where(eq(emailAttachments.emailId, id));
  // Delete the email
  await db.delete(inboundEmails).where(eq(inboundEmails.id, id));
}

export async function createEmailAttachment(input: InsertEmailAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(emailAttachments).values(input);
  return { id: result[0].insertId };
}

export async function getEmailAttachments(emailId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(emailAttachments).where(eq(emailAttachments.emailId, emailId));
}

export async function updateAttachmentProcessed(id: number, extractedText?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(emailAttachments).set({
    isProcessed: true,
    extractedText: extractedText || null
  }).where(eq(emailAttachments.id, id));
}

// Auto-reply rules
export async function getAutoReplyRules(options?: { isEnabled?: boolean; category?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (options?.isEnabled !== undefined) {
    conditions.push(eq(autoReplyRules.isEnabled, options.isEnabled));
  }
  if (options?.category) {
    conditions.push(eq(autoReplyRules.category, options.category as any));
  }
  
  let query = db.select().from(autoReplyRules);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  return query.orderBy(desc(autoReplyRules.priority));
}

export async function getAutoReplyRuleById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(autoReplyRules).where(eq(autoReplyRules.id, id));
  return result[0] || null;
}

export async function createAutoReplyRule(input: {
  name: string;
  category: string;
  replyTemplate: string;
  senderPattern?: string;
  subjectPattern?: string;
  bodyKeywords?: string[];
  minConfidence?: string;
  replySubjectPrefix?: string;
  tone?: string;
  includeOriginal?: boolean;
  delayMinutes?: number;
  autoSend?: boolean;
  createTask?: boolean;
  notifyOwner?: boolean;
  priority?: number;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(autoReplyRules).values({
    ...input,
    category: input.category as any,
    tone: (input.tone || 'professional') as any,
    bodyKeywords: input.bodyKeywords ? JSON.stringify(input.bodyKeywords) : null,
  } as any);
  return { id: result[0].insertId };
}

export async function updateAutoReplyRule(id: number, updates: {
  name?: string;
  category?: string;
  isEnabled?: boolean;
  priority?: number;
  senderPattern?: string;
  subjectPattern?: string;
  bodyKeywords?: string[];
  minConfidence?: string;
  replyTemplate?: string;
  replySubjectPrefix?: string;
  tone?: string;
  includeOriginal?: boolean;
  delayMinutes?: number;
  autoSend?: boolean;
  createTask?: boolean;
  notifyOwner?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = { ...updates };
  if (updates.bodyKeywords) {
    updateData.bodyKeywords = JSON.stringify(updates.bodyKeywords);
  }
  
  await db.update(autoReplyRules).set(updateData).where(eq(autoReplyRules.id, id));
}

export async function deleteAutoReplyRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(autoReplyRules).where(eq(autoReplyRules.id, id));
}

export async function incrementAutoReplyRuleTriggered(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(autoReplyRules).set({
    timesTriggered: sql`${autoReplyRules.timesTriggered} + 1`,
    lastTriggeredAt: new Date(),
  }).where(eq(autoReplyRules.id, id));
}

// Sent emails tracking
export async function getSentEmails(options?: {
  relatedEntityType?: string;
  relatedEntityId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (options?.relatedEntityType) {
    conditions.push(eq(sentEmails.relatedEntityType, options.relatedEntityType));
  }
  if (options?.relatedEntityId) {
    conditions.push(eq(sentEmails.relatedEntityId, options.relatedEntityId));
  }
  if (options?.status) {
    conditions.push(eq(sentEmails.status, options.status as any));
  }
  
  let query = db.select().from(sentEmails);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  return query.orderBy(desc(sentEmails.createdAt)).limit(options?.limit || 100);
}

export async function getSentEmailById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sentEmails).where(eq(sentEmails.id, id));
  return result[0] || null;
}

export async function createSentEmail(input: {
  inboundEmailId?: number;
  relatedEntityType?: string;
  relatedEntityId?: number;
  toEmail: string;
  toName?: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  status?: string;
  sentBy?: number;
  aiGenerated?: boolean;
  aiTaskId?: number;
  threadId?: string;
  metadata?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(sentEmails).values({
    ...input,
    status: (input.status || 'queued') as any,
  } as any);
  return { id: result[0].insertId };
}

export async function updateSentEmailStatus(id: number, status: string, errorMessage?: string, messageId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updates: any = { status };
  if (status === 'sent') {
    updates.sentAt = new Date();
  } else if (status === 'delivered') {
    updates.deliveredAt = new Date();
  }
  if (errorMessage) updates.errorMessage = errorMessage;
  if (messageId) updates.messageId = messageId;
  
  await db.update(sentEmails).set(updates).where(eq(sentEmails.id, id));
}

export async function getEmailThread(threadId: string) {
  const db = await getDb();
  if (!db) return { inbound: [], outbound: [] };
  
  const inbound = await db.select().from(inboundEmails)
    .where(sql`JSON_EXTRACT(metadata, '$.threadId') = ${threadId}`)
    .orderBy(desc(inboundEmails.receivedAt));
  
  const outbound = await db.select().from(sentEmails)
    .where(eq(sentEmails.threadId, threadId))
    .orderBy(desc(sentEmails.createdAt));
  
  return { inbound, outbound };
}

export async function createParsedDocument(input: InsertParsedDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(parsedDocuments).values(input);
  return { id: result[0].insertId };
}

export async function getParsedDocuments(options?: {
  emailId?: number;
  documentType?: string;
  isReviewed?: boolean;
  isApproved?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (options?.emailId) {
    conditions.push(eq(parsedDocuments.emailId, options.emailId));
  }
  
  if (options?.documentType) {
    conditions.push(eq(parsedDocuments.documentType, options.documentType as any));
  }
  
  if (options?.isReviewed !== undefined) {
    conditions.push(eq(parsedDocuments.isReviewed, options.isReviewed));
  }
  
  if (options?.isApproved !== undefined) {
    conditions.push(eq(parsedDocuments.isApproved, options.isApproved));
  }
  
  let query = db.select().from(parsedDocuments);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(parsedDocuments.createdAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);
}

export async function getParsedDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(parsedDocuments).where(eq(parsedDocuments.id, id));
  return result[0] || null;
}

export async function updateParsedDocument(id: number, updates: Partial<InsertParsedDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set(updates).where(eq(parsedDocuments.id, id));
}

export async function approveParsedDocument(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({
    isReviewed: true,
    isApproved: true,
    reviewedBy: userId,
    reviewedAt: new Date()
  }).where(eq(parsedDocuments.id, id));
}

export async function rejectParsedDocument(id: number, userId: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({
    isReviewed: true,
    isApproved: false,
    reviewedBy: userId,
    reviewedAt: new Date(),
    notes: notes || null
  }).where(eq(parsedDocuments.id, id));
}

export async function createParsedDocumentLineItem(input: InsertParsedDocumentLineItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(parsedDocumentLineItems).values(input);
  return { id: result[0].insertId };
}

export async function getParsedDocumentLineItems(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(parsedDocumentLineItems)
    .where(eq(parsedDocumentLineItems.documentId, documentId))
    .orderBy(parsedDocumentLineItems.lineNumber);
}

export async function linkParsedDocumentToVendor(documentId: number, vendorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ vendorId }).where(eq(parsedDocuments.id, documentId));
}

export async function linkParsedDocumentToPO(documentId: number, purchaseOrderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ purchaseOrderId }).where(eq(parsedDocuments.id, documentId));
}

export async function linkParsedDocumentToShipment(documentId: number, shipmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ shipmentId }).where(eq(parsedDocuments.id, documentId));
}

export async function setCreatedTransaction(documentId: number, transactionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ createdTransactionId: transactionId }).where(eq(parsedDocuments.id, documentId));
}

export async function setCreatedVendor(documentId: number, vendorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ createdVendorId: vendorId, vendorId }).where(eq(parsedDocuments.id, documentId));
}

// Find vendor by email domain or name match
export async function findVendorByEmailOrName(email?: string, name?: string) {
  const db = await getDb();
  if (!db) return null;
  
  if (email) {
    // Try to match by email
    const byEmail = await db.select().from(vendors).where(eq(vendors.email, email));
    if (byEmail.length > 0) return byEmail[0];
    
    // Try to match by email domain
    const domain = email.split("@")[1];
    if (domain) {
      const byDomain = await db.select().from(vendors).where(
        sql`${vendors.email} LIKE ${`%@${domain}`}`
      );
      if (byDomain.length > 0) return byDomain[0];
    }
  }
  
  if (name) {
    // Try exact match first
    const byName = await db.select().from(vendors).where(eq(vendors.name, name));
    if (byName.length > 0) return byName[0];
    
    // Try partial match
    const byPartialName = await db.select().from(vendors).where(
      sql`LOWER(${vendors.name}) LIKE ${`%${name.toLowerCase()}%`}`
    );
    if (byPartialName.length > 0) return byPartialName[0];
  }
  
  return null;
}

// Find PO by number
export async function findPurchaseOrderByNumber(poNumber: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(purchaseOrders).where(
    sql`${purchaseOrders.poNumber} = ${poNumber} OR ${purchaseOrders.poNumber} LIKE ${`%${poNumber}%`}`
  );
  return result[0] || null;
}

// Find shipment by tracking number
export async function findShipmentByTracking(trackingNumber: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(shipments).where(
    eq(shipments.trackingNumber, trackingNumber)
  );
  return result[0] || null;
}

// Get email scanning statistics
export async function getEmailScanningStats() {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, parsed: 0, failed: 0, documents: 0 };
  
  const emails = await db.select({
    status: inboundEmails.parsingStatus,
    count: sql<number>`COUNT(*)`
  }).from(inboundEmails).groupBy(inboundEmails.parsingStatus);
  
  const docCount = await db.select({
    count: sql<number>`COUNT(*)`
  }).from(parsedDocuments);
  
  const stats = {
    total: 0,
    pending: 0,
    processing: 0,
    parsed: 0,
    failed: 0,
    reviewed: 0,
    documents: Number(docCount[0]?.count) || 0
  };
  
  for (const row of emails) {
    stats.total += Number(row.count);
    if (row.status === "pending") stats.pending = Number(row.count);
    if (row.status === "processing") stats.processing = Number(row.count);
    if (row.status === "parsed") stats.parsed = Number(row.count);
    if (row.status === "failed") stats.failed = Number(row.count);
    if (row.status === "reviewed") stats.reviewed = Number(row.count);
  }
  
  return stats;
}

// Update email categorization
export async function updateEmailCategorization(
  emailId: number,
  categorization: {
    category: string;
    categoryConfidence: string;
    categoryKeywords: string[];
    suggestedAction: string | null;
    priority: string;
    subcategory: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(inboundEmails).set({
    category: categorization.category as any,
    categoryConfidence: categorization.categoryConfidence,
    categoryKeywords: categorization.categoryKeywords,
    suggestedAction: categorization.suggestedAction,
    priority: categorization.priority as any,
    subcategory: categorization.subcategory,
  }).where(eq(inboundEmails.id, emailId));
}

// Get email category statistics
export async function getEmailCategoryStats() {
  const db = await getDb();
  if (!db) return { categories: [], priorities: [] };
  
  const categoryStats = await db.select({
    category: inboundEmails.category,
    count: sql<number>`COUNT(*)`
  }).from(inboundEmails).groupBy(inboundEmails.category);
  
  const priorityStats = await db.select({
    priority: inboundEmails.priority,
    count: sql<number>`COUNT(*)`
  }).from(inboundEmails).groupBy(inboundEmails.priority);
  
  return {
    categories: categoryStats.map(row => ({
      category: row.category || "general",
      count: Number(row.count)
    })),
    priorities: priorityStats.map(row => ({
      priority: row.priority || "medium",
      count: Number(row.count)
    }))
  };
}

// Find inbound email by message ID
export async function findInboundEmailByMessageId(messageId: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(inboundEmails)
    .where(eq(inboundEmails.messageId, messageId))
    .limit(1);
  
  return result[0] || null;
}

// Get uncategorized emails (category is null or 'general' with low confidence)
export async function getUncategorizedEmails(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(inboundEmails)
    .where(
      or(
        isNull(inboundEmails.category),
        and(
          eq(inboundEmails.category, "general"),
          or(
            isNull(inboundEmails.categoryConfidence),
            sql`CAST(${inboundEmails.categoryConfidence} AS DECIMAL) < 60`
          )
        )
      )
    )
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(limit);
  
  return result;
}


// ============================================
// DATA ROOM MANAGEMENT
// ============================================

// Data Rooms
export async function createDataRoom(data: InsertDataRoom) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRooms).values(data);
  return { id: result[0].insertId };
}

export async function getDataRooms(ownerId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  if (ownerId) {
    return db.select().from(dataRooms).where(eq(dataRooms.ownerId, ownerId)).orderBy(desc(dataRooms.createdAt));
  }
  return db.select().from(dataRooms).orderBy(desc(dataRooms.createdAt));
}

export async function getDataRoomById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRooms).where(eq(dataRooms.id, id)).limit(1);
  return result[0] || null;
}

export async function getDataRoomBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRooms).where(eq(dataRooms.slug, slug)).limit(1);
  return result[0] || null;
}

export async function updateDataRoom(id: number, data: Partial<InsertDataRoom>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRooms).set(data).where(eq(dataRooms.id, id));
}

export async function deleteDataRoom(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRooms).where(eq(dataRooms.id, id));
}

// Data Room Folders
export async function createDataRoomFolder(data: InsertDataRoomFolder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomFolders).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomFolders(dataRoomId: number, parentId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  
  if (parentId === null) {
    return db.select().from(dataRoomFolders)
      .where(and(eq(dataRoomFolders.dataRoomId, dataRoomId), isNull(dataRoomFolders.parentId)))
      .orderBy(dataRoomFolders.sortOrder, dataRoomFolders.name);
  } else if (parentId !== undefined) {
    return db.select().from(dataRoomFolders)
      .where(and(eq(dataRoomFolders.dataRoomId, dataRoomId), eq(dataRoomFolders.parentId, parentId)))
      .orderBy(dataRoomFolders.sortOrder, dataRoomFolders.name);
  }
  
  return db.select().from(dataRoomFolders)
    .where(eq(dataRoomFolders.dataRoomId, dataRoomId))
    .orderBy(dataRoomFolders.sortOrder, dataRoomFolders.name);
}

export async function getDataRoomFolderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomFolders).where(eq(dataRoomFolders.id, id)).limit(1);
  return result[0] || null;
}

export async function updateDataRoomFolder(id: number, data: Partial<InsertDataRoomFolder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomFolders).set(data).where(eq(dataRoomFolders.id, id));
}

export async function deleteDataRoomFolder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomFolders).where(eq(dataRoomFolders.id, id));
}

// Data Room Documents
export async function createDataRoomDocument(data: InsertDataRoomDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomDocuments).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomDocuments(dataRoomId: number, folderId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  
  if (folderId === null) {
    return db.select().from(dataRoomDocuments)
      .where(and(eq(dataRoomDocuments.dataRoomId, dataRoomId), isNull(dataRoomDocuments.folderId)))
      .orderBy(dataRoomDocuments.sortOrder, dataRoomDocuments.name);
  } else if (folderId !== undefined) {
    return db.select().from(dataRoomDocuments)
      .where(and(eq(dataRoomDocuments.dataRoomId, dataRoomId), eq(dataRoomDocuments.folderId, folderId)))
      .orderBy(dataRoomDocuments.sortOrder, dataRoomDocuments.name);
  }
  
  return db.select().from(dataRoomDocuments)
    .where(eq(dataRoomDocuments.dataRoomId, dataRoomId))
    .orderBy(dataRoomDocuments.sortOrder, dataRoomDocuments.name);
}

export async function getDataRoomDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomDocuments).where(eq(dataRoomDocuments.id, id)).limit(1);
  return result[0] || null;
}

export async function updateDataRoomDocument(id: number, data: Partial<InsertDataRoomDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomDocuments).set(data).where(eq(dataRoomDocuments.id, id));
}

export async function deleteDataRoomDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomDocuments).where(eq(dataRoomDocuments.id, id));
}

// Data Room Links
export async function createDataRoomLink(data: InsertDataRoomLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomLinks).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomLinks(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomLinks)
    .where(eq(dataRoomLinks.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomLinks.createdAt));
}

export async function getDataRoomLinkByCode(linkCode: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomLinks).where(eq(dataRoomLinks.linkCode, linkCode)).limit(1);
  return result[0] || null;
}

export async function updateDataRoomLink(id: number, data: Partial<InsertDataRoomLink>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomLinks).set(data).where(eq(dataRoomLinks.id, id));
}

export async function incrementLinkViewCount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomLinks)
    .set({ viewCount: sql`${dataRoomLinks.viewCount} + 1` })
    .where(eq(dataRoomLinks.id, id));
}

export async function deleteDataRoomLink(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomLinks).where(eq(dataRoomLinks.id, id));
}

// Data Room Visitors
export async function createDataRoomVisitor(data: InsertDataRoomVisitor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomVisitors).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomVisitors(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomVisitors)
    .where(eq(dataRoomVisitors.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomVisitors.lastViewedAt));
}

export async function getVisitorByEmail(dataRoomId: number, email: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomVisitors)
    .where(and(eq(dataRoomVisitors.dataRoomId, dataRoomId), eq(dataRoomVisitors.email, email)))
    .limit(1);
  return result[0] || null;
}

export async function updateDataRoomVisitor(id: number, data: Partial<InsertDataRoomVisitor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomVisitors).set(data).where(eq(dataRoomVisitors.id, id));
}

// Document Views
export async function createDocumentView(data: InsertDocumentView) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documentViews).values(data);
  return { id: result[0].insertId };
}

export async function getDocumentViews(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentViews)
    .where(eq(documentViews.documentId, documentId))
    .orderBy(desc(documentViews.startedAt));
}

export async function getVisitorDocumentViews(visitorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentViews)
    .where(eq(documentViews.visitorId, visitorId))
    .orderBy(desc(documentViews.startedAt));
}

export async function updateDocumentView(id: number, data: Partial<InsertDocumentView>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentViews).set(data).where(eq(documentViews.id, id));
}

// Data Room Invitations
export async function createDataRoomInvitation(data: InsertDataRoomInvitation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomInvitations).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomInvitations(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomInvitations)
    .where(eq(dataRoomInvitations.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomInvitations.createdAt));
}

export async function getInvitationByCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomInvitations)
    .where(eq(dataRoomInvitations.inviteCode, inviteCode))
    .limit(1);
  return result[0] || null;
}

export async function updateDataRoomInvitation(id: number, data: Partial<InsertDataRoomInvitation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomInvitations).set(data).where(eq(dataRoomInvitations.id, id));
}

// ============================================
// IMAP CREDENTIALS MANAGEMENT
// ============================================

export async function createImapCredential(data: InsertImapCredential) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(imapCredentials).values(data);
  return { id: result[0].insertId };
}

export async function getImapCredentials(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(imapCredentials)
    .where(eq(imapCredentials.userId, userId))
    .orderBy(desc(imapCredentials.createdAt));
}

export async function getImapCredentialById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(imapCredentials).where(eq(imapCredentials.id, id)).limit(1);
  return result[0] || null;
}

export async function getActivePollingCredentials() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(imapCredentials)
    .where(and(eq(imapCredentials.isActive, true), eq(imapCredentials.pollingEnabled, true)));
}

export async function updateImapCredential(id: number, data: Partial<InsertImapCredential>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(imapCredentials).set(data).where(eq(imapCredentials.id, id));
}

export async function deleteImapCredential(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(imapCredentials).where(eq(imapCredentials.id, id));
}


// ============================================
// DATA ROOM ANALYTICS
// ============================================

export async function getDataRoomAnalytics(dataRoomId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get total visitors
  const visitors = await db.select().from(dataRoomVisitors).where(eq(dataRoomVisitors.dataRoomId, dataRoomId));
  
  // Get total document views
  const documents = await db.select().from(dataRoomDocuments).where(eq(dataRoomDocuments.dataRoomId, dataRoomId));
  const documentIds = documents.map(d => d.id);
  
  let totalViews = 0;
  let totalTimeSpent = 0;
  let viewsByDocument: Record<number, number> = {};
  
  if (documentIds.length > 0) {
    const views = await db.select().from(documentViews).where(inArray(documentViews.documentId, documentIds));
    totalViews = views.length;
    totalTimeSpent = views.reduce((sum, v) => sum + (v.duration || 0), 0);
    
    for (const view of views) {
      viewsByDocument[view.documentId] = (viewsByDocument[view.documentId] || 0) + 1;
    }
  }

  // Get links
  const links = await db.select().from(dataRoomLinks).where(eq(dataRoomLinks.dataRoomId, dataRoomId));
  const totalLinkViews = links.reduce((sum, l) => sum + l.viewCount, 0);

  return {
    totalVisitors: visitors.length,
    totalDocumentViews: totalViews,
    totalTimeSpent,
    totalLinks: links.length,
    totalLinkViews,
    viewsByDocument,
    recentVisitors: visitors.slice(0, 10),
  };
}

export async function getDocumentAnalytics(documentId: number) {
  const db = await getDb();
  if (!db) return null;

  const views = await db.select().from(documentViews).where(eq(documentViews.documentId, documentId)).orderBy(desc(documentViews.startedAt));
  
  const totalViews = views.length;
  const uniqueVisitors = new Set(views.map(v => v.visitorId)).size;
  const totalTimeSpent = views.reduce((sum, v) => sum + (v.duration || 0), 0);
  const avgTimeSpent = totalViews > 0 ? totalTimeSpent / totalViews : 0;
  const downloads = views.filter(v => v.downloaded).length;

  return {
    totalViews,
    uniqueVisitors,
    totalTimeSpent,
    avgTimeSpent,
    downloads,
    recentViews: views.slice(0, 20),
  };
}

export async function getVisitorTimeline(visitorId: number) {
  const db = await getDb();
  if (!db) return [];

  const views = await db.select({
    view: documentViews,
    document: dataRoomDocuments,
  })
  .from(documentViews)
  .leftJoin(dataRoomDocuments, eq(documentViews.documentId, dataRoomDocuments.id))
  .where(eq(documentViews.visitorId, visitorId))
  .orderBy(desc(documentViews.startedAt));

  return views.map(v => ({
    ...v.view,
    documentName: v.document?.name || 'Unknown',
    documentType: v.document?.fileType || 'unknown',
  }));
}


// ============================================
// EMAIL CREDENTIALS & SCHEDULED SCANNING
// ============================================

export async function getEmailCredentials(userId?: number, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(emailCredentials);
  const conditions = [];
  
  if (userId) conditions.push(eq(emailCredentials.userId, userId));
  if (companyId) conditions.push(eq(emailCredentials.companyId, companyId));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  
  return query.orderBy(desc(emailCredentials.createdAt));
}

export async function getEmailCredentialById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(emailCredentials).where(eq(emailCredentials.id, id));
  return result || null;
}

export async function createEmailCredential(data: {
  userId: number;
  companyId?: number;
  name: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'custom';
  email: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUsername?: string;
  imapPassword?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scanFolder?: string;
  scanUnreadOnly?: boolean;
  markAsRead?: boolean;
  maxEmailsPerScan?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(emailCredentials).values(data);
  return { id: result.insertId };
}

export async function updateEmailCredential(id: number, data: Partial<{
  name: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scanFolder: string;
  scanUnreadOnly: boolean;
  markAsRead: boolean;
  maxEmailsPerScan: number;
  isActive: boolean;
  lastScanAt: Date;
  lastScanStatus: 'success' | 'failed' | 'partial';
  lastScanError: string | null;
  emailsScanned: number;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(emailCredentials).set(data).where(eq(emailCredentials.id, id));
}

export async function deleteEmailCredential(id: number) {
  const db = await getDb();
  if (!db) return;
  
  // Delete associated scheduled scans first
  await db.delete(scheduledEmailScans).where(eq(scheduledEmailScans.credentialId, id));
  await db.delete(emailScanLogs).where(eq(emailScanLogs.credentialId, id));
  await db.delete(emailCredentials).where(eq(emailCredentials.id, id));
}

// Scheduled Scans
export async function getScheduledScans(credentialId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(scheduledEmailScans);
  if (credentialId) {
    query = query.where(eq(scheduledEmailScans.credentialId, credentialId)) as typeof query;
  }
  
  return query.orderBy(desc(scheduledEmailScans.createdAt));
}

export async function createScheduledScan(data: {
  credentialId: number;
  companyId?: number;
  intervalMinutes?: number;
  isEnabled?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const nextRunAt = new Date(Date.now() + (data.intervalMinutes || 15) * 60 * 1000);
  
  const [result] = await db.insert(scheduledEmailScans).values({
    ...data,
    nextRunAt,
  });
  return { id: result.insertId };
}

export async function updateScheduledScan(id: number, data: Partial<{
  isEnabled: boolean;
  intervalMinutes: number;
  lastRunAt: Date;
  nextRunAt: Date;
  lastRunStatus: 'success' | 'failed' | 'running';
  lastRunError: string | null;
  lastRunEmailsFound: number;
  totalRuns: number;
  totalEmailsProcessed: number;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(scheduledEmailScans).set(data).where(eq(scheduledEmailScans.id, id));
}

export async function deleteScheduledScan(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(scheduledEmailScans).where(eq(scheduledEmailScans.id, id));
}

export async function getDueScheduledScans() {
  const db = await getDb();
  if (!db) return [];
  
  const now = new Date();
  return db.select({
    scan: scheduledEmailScans,
    credential: emailCredentials,
  })
  .from(scheduledEmailScans)
  .leftJoin(emailCredentials, eq(scheduledEmailScans.credentialId, emailCredentials.id))
  .where(and(
    eq(scheduledEmailScans.isEnabled, true),
    lte(scheduledEmailScans.nextRunAt, now)
  ));
}

// Scan Logs
export async function createScanLog(data: {
  credentialId: number;
  scheduledScanId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(emailScanLogs).values(data);
  return { id: result.insertId };
}

export async function updateScanLog(id: number, data: Partial<{
  completedAt: Date;
  status: 'running' | 'success' | 'failed' | 'partial';
  emailsFound: number;
  emailsProcessed: number;
  emailsCategorized: number;
  errorMessage: string | null;
  details: string;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(emailScanLogs).set(data).where(eq(emailScanLogs.id, id));
}

export async function getScanLogs(credentialId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(emailScanLogs)
    .where(eq(emailScanLogs.credentialId, credentialId))
    .orderBy(desc(emailScanLogs.startedAt))
    .limit(limit);
}


// Update email attachment with OCR results
export async function updateEmailAttachment(id: number, data: Partial<{
  extractedText: string;
  metadata: any;
  isProcessed: boolean;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(emailAttachments).set(data).where(eq(emailAttachments.id, id));
}


// Update email category
export async function updateEmailCategory(id: number, data: {
  category: 'receipt' | 'purchase_order' | 'invoice' | 'shipping_confirmation' | 'freight_quote' | 'delivery_notification' | 'order_confirmation' | 'payment_confirmation' | 'general';
  categoryConfidence?: string;
  priority?: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(inboundEmails).set(data).where(eq(inboundEmails.id, id));
}


// ============================================
// NDA E-SIGNATURES
// ============================================

// NDA Documents
export async function getNdaDocuments(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(ndaDocuments)
    .where(eq(ndaDocuments.dataRoomId, dataRoomId))
    .orderBy(desc(ndaDocuments.createdAt));
}

export async function getActiveNdaDocument(dataRoomId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaDocuments)
    .where(and(
      eq(ndaDocuments.dataRoomId, dataRoomId),
      eq(ndaDocuments.isActive, true)
    ))
    .orderBy(desc(ndaDocuments.createdAt))
    .limit(1);
  
  return result || null;
}

export async function getNdaDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaDocuments).where(eq(ndaDocuments.id, id));
  return result || null;
}

export async function createNdaDocument(data: {
  dataRoomId: number;
  name: string;
  version?: string;
  storageKey: string;
  storageUrl: string;
  mimeType?: string;
  fileSize?: number;
  pageCount?: number;
  requiresSignature?: boolean;
  allowTypedSignature?: boolean;
  allowDrawnSignature?: boolean;
  uploadedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Deactivate previous NDA documents for this data room
  await db.update(ndaDocuments)
    .set({ isActive: false })
    .where(eq(ndaDocuments.dataRoomId, data.dataRoomId));
  
  const [result] = await db.insert(ndaDocuments).values({
    ...data,
    isActive: true,
  });
  return { id: result.insertId };
}

export async function updateNdaDocument(id: number, data: Partial<{
  name: string;
  version: string;
  isActive: boolean;
  requiresSignature: boolean;
  allowTypedSignature: boolean;
  allowDrawnSignature: boolean;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(ndaDocuments).set(data).where(eq(ndaDocuments.id, id));
}

export async function deleteNdaDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(ndaDocuments).where(eq(ndaDocuments.id, id));
}

// NDA Signatures
export async function getNdaSignatures(dataRoomId: number, options?: { visitorId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(ndaSignatures.dataRoomId, dataRoomId)];
  if (options?.visitorId) conditions.push(eq(ndaSignatures.visitorId, options.visitorId));
  if (options?.status) conditions.push(eq(ndaSignatures.status, options.status as any));
  
  return db.select().from(ndaSignatures)
    .where(and(...conditions))
    .orderBy(desc(ndaSignatures.signedAt));
}

export async function getNdaSignatureById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaSignatures).where(eq(ndaSignatures.id, id));
  return result || null;
}

export async function getVisitorNdaSignature(dataRoomId: number, visitorEmail: string) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaSignatures)
    .where(and(
      eq(ndaSignatures.dataRoomId, dataRoomId),
      eq(ndaSignatures.signerEmail, visitorEmail),
      eq(ndaSignatures.status, 'signed')
    ))
    .orderBy(desc(ndaSignatures.signedAt))
    .limit(1);
  
  return result || null;
}

export async function createNdaSignature(data: {
  ndaDocumentId: number;
  dataRoomId: number;
  visitorId?: number;
  linkId?: number;
  signerName: string;
  signerEmail: string;
  signerTitle?: string;
  signerCompany?: string;
  signatureType: 'typed' | 'drawn';
  signatureData: string;
  signatureImageUrl?: string;
  signedDocumentKey?: string;
  signedDocumentUrl?: string;
  ipAddress: string;
  userAgent?: string;
  agreementText?: string;
  consentCheckbox?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(ndaSignatures).values({
    ...data,
    status: 'signed',
  });
  return { id: result.insertId };
}

export async function updateNdaSignature(id: number, data: Partial<{
  signedDocumentKey: string;
  signedDocumentUrl: string;
  status: 'pending' | 'signed' | 'revoked' | 'expired';
  revokedAt: Date;
  revokedReason: string;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(ndaSignatures).set(data).where(eq(ndaSignatures.id, id));
}

// NDA Audit Log
export async function createNdaAuditLog(data: {
  signatureId: number;
  action: 'viewed_nda' | 'started_signing' | 'completed_signature' | 'downloaded_signed_copy' | 'signature_revoked' | 'access_granted' | 'access_denied';
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(ndaSignatureAuditLog).values(data);
  return { id: result.insertId };
}

export async function getNdaAuditLogs(signatureId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(ndaSignatureAuditLog)
    .where(eq(ndaSignatureAuditLog.signatureId, signatureId))
    .orderBy(desc(ndaSignatureAuditLog.createdAt));
}


// ============================================
// ENHANCED DATA ROOM ACCESS CONTROL
// ============================================

// Get visitor by ID
export async function getDataRoomVisitorById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [visitor] = await db.select().from(dataRoomVisitors).where(eq(dataRoomVisitors.id, id));
  return visitor || null;
}

// Get invitation by email for a data room
export async function getDataRoomInvitationByEmail(dataRoomId: number, email: string) {
  const db = await getDb();
  if (!db) return null;
  const [invitation] = await db.select().from(dataRoomInvitations)
    .where(and(
      eq(dataRoomInvitations.dataRoomId, dataRoomId),
      eq(dataRoomInvitations.email, email.toLowerCase())
    ));
  return invitation || null;
}

// Block a visitor
export async function blockDataRoomVisitor(id: number, reason?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'blocked',
    blockedAt: new Date(),
    blockedReason: reason,
  }).where(eq(dataRoomVisitors.id, id));
}

// Unblock a visitor
export async function unblockDataRoomVisitor(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'active',
    blockedAt: null,
    blockedReason: null,
  }).where(eq(dataRoomVisitors.id, id));
}

// Revoke visitor access
export async function revokeDataRoomVisitorAccess(id: number, reason?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'revoked',
    revokedAt: new Date(),
    revokedReason: reason,
  }).where(eq(dataRoomVisitors.id, id));
}

// Restore visitor access
export async function restoreDataRoomVisitorAccess(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'active',
    revokedAt: null,
    revokedReason: null,
  }).where(eq(dataRoomVisitors.id, id));
}

// Update invitation permissions
export async function updateDataRoomInvitationPermissions(id: number, data: {
  allowedFolderIds?: number[] | null;
  allowedDocumentIds?: number[] | null;
  restrictedFolderIds?: number[] | null;
  restrictedDocumentIds?: number[] | null;
  allowDownload?: boolean;
  allowPrint?: boolean;
  role?: 'viewer' | 'editor' | 'admin';
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomInvitations).set(data).where(eq(dataRoomInvitations.id, id));
}

// Link visitor to their NDA signature
export async function linkVisitorToNdaSignature(visitorId: number, signatureId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    ndaSignatureId: signatureId,
  }).where(eq(dataRoomVisitors.id, visitorId));
}

// Get visitor by email for a data room
export async function getDataRoomVisitorByEmail(dataRoomId: number, email: string) {
  const db = await getDb();
  if (!db) return null;
  const [visitor] = await db.select().from(dataRoomVisitors)
    .where(and(
      eq(dataRoomVisitors.dataRoomId, dataRoomId),
      eq(dataRoomVisitors.email, email.toLowerCase())
    ));
  return visitor || null;
}

// Check if email is invited to data room
export async function isEmailInvitedToDataRoom(dataRoomId: number, email: string): Promise<boolean> {
  const invitation = await getDataRoomInvitationByEmail(dataRoomId, email);
  return invitation !== null && (invitation.status === 'pending' || invitation.status === 'accepted');
}


// ============================================
// RECURRING INVOICES
// ============================================

export async function getRecurringInvoices(filters?: { companyId?: number; customerId?: number; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(recurringInvoices.companyId, filters.companyId));
  if (filters?.customerId) conditions.push(eq(recurringInvoices.customerId, filters.customerId));
  if (filters?.isActive !== undefined) conditions.push(eq(recurringInvoices.isActive, filters.isActive));
  
  const baseQuery = db.select({
    id: recurringInvoices.id,
    companyId: recurringInvoices.companyId,
    customerId: recurringInvoices.customerId,
    templateName: recurringInvoices.templateName,
    description: recurringInvoices.description,
    frequency: recurringInvoices.frequency,
    dayOfWeek: recurringInvoices.dayOfWeek,
    dayOfMonth: recurringInvoices.dayOfMonth,
    startDate: recurringInvoices.startDate,
    endDate: recurringInvoices.endDate,
    nextGenerationDate: recurringInvoices.nextGenerationDate,
    currency: recurringInvoices.currency,
    subtotal: recurringInvoices.subtotal,
    taxAmount: recurringInvoices.taxAmount,
    discountAmount: recurringInvoices.discountAmount,
    totalAmount: recurringInvoices.totalAmount,
    autoSend: recurringInvoices.autoSend,
    daysUntilDue: recurringInvoices.daysUntilDue,
    isActive: recurringInvoices.isActive,
    lastGeneratedAt: recurringInvoices.lastGeneratedAt,
    generationCount: recurringInvoices.generationCount,
    createdAt: recurringInvoices.createdAt,
    customer: {
      id: customers.id,
      name: customers.name,
      email: customers.email,
    },
  }).from(recurringInvoices).leftJoin(customers, eq(recurringInvoices.customerId, customers.id));
  
  if (conditions.length > 0) {
    return baseQuery.where(and(...conditions)).orderBy(desc(recurringInvoices.nextGenerationDate));
  }
  return baseQuery.orderBy(desc(recurringInvoices.nextGenerationDate));
}

export async function getRecurringInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(recurringInvoices).where(eq(recurringInvoices.id, id)).limit(1);
  return result[0];
}

export async function getRecurringInvoiceWithItems(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const invoice = await getRecurringInvoiceById(id);
  if (!invoice) return undefined;
  
  const items = await db.select().from(recurringInvoiceItems).where(eq(recurringInvoiceItems.recurringInvoiceId, id));
  return { ...invoice, items };
}

export async function createRecurringInvoice(data: typeof recurringInvoices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recurringInvoices).values(data);
  return { id: result[0].insertId };
}

export async function updateRecurringInvoice(id: number, data: Partial<typeof recurringInvoices.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(recurringInvoices).set(data).where(eq(recurringInvoices.id, id));
}

export async function createRecurringInvoiceItem(data: typeof recurringInvoiceItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recurringInvoiceItems).values(data);
  return { id: result[0].insertId };
}

export async function deleteRecurringInvoiceItems(recurringInvoiceId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(recurringInvoiceItems).where(eq(recurringInvoiceItems.recurringInvoiceId, recurringInvoiceId));
}

export async function getRecurringInvoicesDueForGeneration() {
  const db = await getDb();
  if (!db) return [];
  
  const now = new Date();
  return db.select()
    .from(recurringInvoices)
    .where(and(
      eq(recurringInvoices.isActive, true),
      lte(recurringInvoices.nextGenerationDate, now)
    ))
    .orderBy(recurringInvoices.nextGenerationDate);
}

export async function createRecurringInvoiceHistory(data: typeof recurringInvoiceHistory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recurringInvoiceHistory).values(data);
  return { id: result[0].insertId };
}

export async function getRecurringInvoiceHistory(recurringInvoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(recurringInvoiceHistory)
    .where(eq(recurringInvoiceHistory.recurringInvoiceId, recurringInvoiceId))
    .orderBy(desc(recurringInvoiceHistory.generatedAt));
}


// ============================================
// SUPPLIER PORTAL
// ============================================

export async function createSupplierPortalSession(data: {
  token: string;
  purchaseOrderId: number;
  vendorId: number;
  vendorEmail?: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(supplierPortalSessions).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getSupplierPortalSession(token: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(supplierPortalSessions).where(eq(supplierPortalSessions.token, token));
  return result[0] || null;
}

export async function updateSupplierPortalSession(id: number, data: Partial<{ status: string; completedAt: Date }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(supplierPortalSessions).set(data as any).where(eq(supplierPortalSessions.id, id));
}

export async function createSupplierDocument(data: {
  portalSessionId: number;
  purchaseOrderId: number;
  vendorId: number;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(supplierDocuments).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getSupplierDocuments(filters?: { purchaseOrderId?: number; vendorId?: number; portalSessionId?: number }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(supplierDocuments);
  const conditions = [];
  if (filters?.purchaseOrderId) conditions.push(eq(supplierDocuments.purchaseOrderId, filters.purchaseOrderId));
  if (filters?.vendorId) conditions.push(eq(supplierDocuments.vendorId, filters.vendorId));
  if (filters?.portalSessionId) conditions.push(eq(supplierDocuments.portalSessionId, filters.portalSessionId));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(supplierDocuments.createdAt));
}

export async function updateSupplierDocument(id: number, data: Partial<{
  status: string;
  reviewedBy: number;
  reviewedAt: Date;
  reviewNotes: string;
  extractedData: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(supplierDocuments).set(data as any).where(eq(supplierDocuments.id, id));
}

export async function createSupplierFreightInfo(data: {
  portalSessionId: number;
  purchaseOrderId: number;
  vendorId: number;
  totalPackages?: number;
  totalGrossWeight?: string;
  totalNetWeight?: string;
  weightUnit?: string;
  totalVolume?: string;
  volumeUnit?: string;
  packageDimensions?: string;
  hsCodes?: string;
  preferredShipDate?: Date;
  preferredCarrier?: string;
  incoterms?: string;
  specialInstructions?: string;
  hasDangerousGoods?: boolean;
  dangerousGoodsClass?: string;
  unNumber?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(supplierFreightInfo).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getSupplierFreightInfo(purchaseOrderId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(supplierFreightInfo).where(eq(supplierFreightInfo.purchaseOrderId, purchaseOrderId));
  return result[0] || null;
}

export async function updateSupplierFreightInfo(id: number, data: Partial<{
  totalPackages: number;
  totalGrossWeight: string;
  totalNetWeight: string;
  totalVolume: string;
  packageDimensions: string;
  hsCodes: string;
  preferredShipDate: Date;
  preferredCarrier: string;
  incoterms: string;
  specialInstructions: string;
  hasDangerousGoods: boolean;
  dangerousGoodsClass: string;
  unNumber: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(supplierFreightInfo).set(data as any).where(eq(supplierFreightInfo.id, id));
}


// ============================================
// AI AGENT SYSTEM
// ============================================

export async function createAiAgentTask(data: InsertAiAgentTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiAgentTasks).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getAiAgentTasks(filters?: { 
  status?: string; 
  taskType?: string; 
  priority?: string;
  requiresApproval?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(aiAgentTasks);
  const conditions = [];
  if (filters?.status) conditions.push(eq(aiAgentTasks.status, filters.status as any));
  if (filters?.taskType) conditions.push(eq(aiAgentTasks.taskType, filters.taskType as any));
  if (filters?.priority) conditions.push(eq(aiAgentTasks.priority, filters.priority as any));
  if (filters?.requiresApproval !== undefined) conditions.push(eq(aiAgentTasks.requiresApproval, filters.requiresApproval));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(aiAgentTasks.createdAt));
}

export async function getAiAgentTaskById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, id));
  return result[0] || null;
}

export async function updateAiAgentTask(id: number, data: Partial<{
  status: string;
  approvedBy: number;
  approvedAt: Date;
  rejectedBy: number;
  rejectedAt: Date;
  rejectionReason: string;
  executedAt: Date;
  executionResult: string;
  errorMessage: string;
  retryCount: number;
  taskData: string;
  aiReasoning: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(aiAgentTasks).set(data as any).where(eq(aiAgentTasks.id, id));
}

export async function getPendingApprovalTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "pending_approval"))
    .orderBy(desc(aiAgentTasks.priority), desc(aiAgentTasks.createdAt));
}

export async function createAiAgentRule(data: InsertAiAgentRule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiAgentRules).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getAiAgentRules(filters?: { ruleType?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(aiAgentRules);
  const conditions = [];
  if (filters?.ruleType) conditions.push(eq(aiAgentRules.ruleType, filters.ruleType as any));
  if (filters?.isActive !== undefined) conditions.push(eq(aiAgentRules.isActive, filters.isActive));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(aiAgentRules.createdAt));
}

export async function updateAiAgentRule(id: number, data: Partial<{
  name: string;
  description: string;
  triggerCondition: string;
  actionConfig: string;
  requiresApproval: boolean;
  autoApproveThreshold: string;
  notifyUsers: string;
  isActive: boolean;
  lastTriggeredAt: Date;
  triggerCount: number;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(aiAgentRules).set(data as any).where(eq(aiAgentRules.id, id));
}

export async function createAiAgentLog(data: InsertAiAgentLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiAgentLogs).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getAiAgentLogs(filters?: { taskId?: number; ruleId?: number; status?: string }, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(aiAgentLogs);
  const conditions = [];
  if (filters?.taskId) conditions.push(eq(aiAgentLogs.taskId, filters.taskId));
  if (filters?.ruleId) conditions.push(eq(aiAgentLogs.ruleId, filters.ruleId));
  if (filters?.status) conditions.push(eq(aiAgentLogs.status, filters.status as any));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(aiAgentLogs.createdAt)).limit(limit);
}

export async function createEmailTemplate(data: InsertEmailTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailTemplates).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getEmailTemplates(filters?: { templateType?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(emailTemplates);
  const conditions = [];
  if (filters?.templateType) conditions.push(eq(emailTemplates.templateType, filters.templateType as any));
  if (filters?.isActive !== undefined) conditions.push(eq(emailTemplates.isActive, filters.isActive));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(emailTemplates.createdAt));
}

export async function getDefaultEmailTemplate(templateType: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(emailTemplates)
    .where(and(
      eq(emailTemplates.templateType, templateType as any),
      eq(emailTemplates.isDefault, true),
      eq(emailTemplates.isActive, true)
    ));
  return result[0] || null;
}

export async function updateEmailTemplate(id: number, data: Partial<{
  name: string;
  subject: string;
  bodyTemplate: string;
  isDefault: boolean;
  isActive: boolean;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailTemplates).set(data as any).where(eq(emailTemplates.id, id));
}


// ============================================
// VENDOR QUOTE MANAGEMENT (RFQ System)
// ============================================

// Vendor RFQs
export async function createVendorRfq(data: InsertVendorRfq) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vendorRfqs).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getVendorRfqs(filters?: { status?: string; rawMaterialId?: number; createdById?: number }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(vendorRfqs);
  const conditions = [];
  if (filters?.status) conditions.push(eq(vendorRfqs.status, filters.status as any));
  if (filters?.rawMaterialId) conditions.push(eq(vendorRfqs.rawMaterialId, filters.rawMaterialId));
  if (filters?.createdById) conditions.push(eq(vendorRfqs.createdById, filters.createdById));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(vendorRfqs.createdAt));
}

export async function getVendorRfqById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(vendorRfqs).where(eq(vendorRfqs.id, id));
  return result[0] || null;
}

export async function updateVendorRfq(id: number, data: Partial<InsertVendorRfq>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(vendorRfqs).set(data as any).where(eq(vendorRfqs.id, id));
}

// Vendor Quotes
export async function createVendorQuote(data: InsertVendorQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vendorQuotes).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getVendorQuotes(filters?: { rfqId?: number; vendorId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(vendorQuotes);
  const conditions = [];
  if (filters?.rfqId) conditions.push(eq(vendorQuotes.rfqId, filters.rfqId));
  if (filters?.vendorId) conditions.push(eq(vendorQuotes.vendorId, filters.vendorId));
  if (filters?.status) conditions.push(eq(vendorQuotes.status, filters.status as any));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(vendorQuotes.createdAt));
}

export async function getVendorQuoteById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(vendorQuotes).where(eq(vendorQuotes.id, id));
  return result[0] || null;
}

export async function updateVendorQuote(id: number, data: Partial<InsertVendorQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(vendorQuotes).set(data as any).where(eq(vendorQuotes.id, id));
}

export async function getVendorQuotesWithVendorInfo(rfqId: number) {
  const db = await getDb();
  if (!db) return [];
  const quotes = await db.select().from(vendorQuotes).where(eq(vendorQuotes.rfqId, rfqId)).orderBy(vendorQuotes.overallRank);
  const vendorIds = Array.from(new Set(quotes.map(q => q.vendorId)));
  const vendorList = vendorIds.length > 0 ? await db.select().from(vendors).where(inArray(vendors.id, vendorIds)) : [];
  const vendorMap = new Map(vendorList.map(v => [v.id, v]));
  return quotes.map(q => ({ ...q, vendor: vendorMap.get(q.vendorId) || null }));
}

// Vendor RFQ Emails
export async function createVendorRfqEmail(data: InsertVendorRfqEmail) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vendorRfqEmails).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getVendorRfqEmails(filters?: { rfqId?: number; vendorId?: number; direction?: string }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(vendorRfqEmails);
  const conditions = [];
  if (filters?.rfqId) conditions.push(eq(vendorRfqEmails.rfqId, filters.rfqId));
  if (filters?.vendorId) conditions.push(eq(vendorRfqEmails.vendorId, filters.vendorId));
  if (filters?.direction) conditions.push(eq(vendorRfqEmails.direction, filters.direction as any));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(vendorRfqEmails.createdAt));
}

export async function updateVendorRfqEmail(id: number, data: Partial<InsertVendorRfqEmail>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(vendorRfqEmails).set(data as any).where(eq(vendorRfqEmails.id, id));
}

// Vendor RFQ Invitations
export async function createVendorRfqInvitation(data: InsertVendorRfqInvitation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vendorRfqInvitations).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getVendorRfqInvitations(rfqId: number) {
  const db = await getDb();
  if (!db) return [];
  const invitations = await db.select().from(vendorRfqInvitations).where(eq(vendorRfqInvitations.rfqId, rfqId));
  const vendorIds = Array.from(new Set(invitations.map(i => i.vendorId)));
  const vendorList = vendorIds.length > 0 ? await db.select().from(vendors).where(inArray(vendors.id, vendorIds)) : [];
  const vendorMap = new Map(vendorList.map(v => [v.id, v]));
  return invitations.map(i => ({ ...i, vendor: vendorMap.get(i.vendorId) || null }));
}

export async function updateVendorRfqInvitation(id: number, data: Partial<InsertVendorRfqInvitation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(vendorRfqInvitations).set(data as any).where(eq(vendorRfqInvitations.id, id));
}

// Helper: Get best quote for an RFQ
export async function getBestVendorQuote(rfqId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(vendorQuotes)
    .where(and(
      eq(vendorQuotes.rfqId, rfqId),
      eq(vendorQuotes.status, "received")
    ))
    .orderBy(vendorQuotes.overallRank)
    .limit(1);
  return result[0] || null;
}

// Helper: Generate RFQ number
export async function generateVendorRfqNumber() {
  const db = await getDb();
  if (!db) return `RFQ-${Date.now()}`;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(vendorRfqs);
  const count = result[0]?.count || 0;
  return `RFQ-${String(count + 1).padStart(6, '0')}`;
}


// ============================================
// DOCUMENT IMPORT HELPERS
// ============================================

export async function getVendorByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(vendors).where(
    sql`LOWER(${vendors.name}) = LOWER(${name}) OR LOWER(${vendors.name}) LIKE LOWER(${`%${name}%`})`
  ).limit(1);
  return result[0] || null;
}

export async function getPurchaseOrderByNumber(poNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(purchaseOrders).where(
    sql`${purchaseOrders.poNumber} = ${poNumber} OR ${purchaseOrders.poNumber} LIKE ${`%${poNumber}%`}`
  ).limit(1);
  return result[0] || null;
}

export async function updatePurchaseOrderFreight(poId: number, freightCost: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(purchaseOrders).set({ 
    freightCost,
    updatedAt: Date.now()
  } as any).where(eq(purchaseOrders.id, poId));
}

// Freight history table functions
export interface FreightHistoryData {
  invoiceNumber: string;
  carrierId: number;
  invoiceDate: number;
  shipmentDate?: number;
  deliveryDate?: number;
  origin?: string;
  destination?: string;
  trackingNumber?: string;
  weight?: string;
  dimensions?: string;
  freightCharges: string;
  fuelSurcharge?: string;
  accessorialCharges?: string;
  totalAmount: string;
  currency?: string;
  relatedPoId?: number;
  notes?: string;
  createdBy: number;
}

// Note: freightHistory table needs to be created in schema
// For now, we'll store freight data in a JSON field or create records in freightBookings
export async function createFreightHistory(data: FreightHistoryData) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Store as a freight booking with invoice data
  const result = await db.insert(freightBookings).values({
    rfqId: 0, // No RFQ for imported invoices
    quoteId: 0, // No quote for imported invoices
    carrierId: data.carrierId,
    status: "completed",
    bookingDate: data.invoiceDate,
    pickupDate: data.shipmentDate,
    deliveryDate: data.deliveryDate,
    totalCost: data.totalAmount,
    trackingNumber: data.trackingNumber,
    notes: JSON.stringify({
      invoiceNumber: data.invoiceNumber,
      origin: data.origin,
      destination: data.destination,
      weight: data.weight,
      dimensions: data.dimensions,
      freightCharges: data.freightCharges,
      fuelSurcharge: data.fuelSurcharge,
      accessorialCharges: data.accessorialCharges,
      currency: data.currency,
      relatedPoId: data.relatedPoId,
      importedInvoice: true
    }),
    createdBy: data.createdBy
  } as any);
  
  return result[0].insertId;
}

// Document import log
export interface DocumentImportLog {
  filename: string;
  documentType: string;
  status: "success" | "failed" | "partial";
  createdRecords: string; // JSON
  updatedRecords: string; // JSON
  warnings: string; // JSON
  error?: string;
  importedBy: number;
  importedAt: number;
}

// For now, store import logs in audit_logs
export async function createDocumentImportLog(data: DocumentImportLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(auditLogs).values({
    userId: data.importedBy,
    action: "create", // Use 'create' as the action type
    entityType: `document_import_${data.documentType}`,
    entityId: 0,
    entityName: data.filename,
    newValues: {
      filename: data.filename,
      status: data.status,
      createdRecords: JSON.parse(data.createdRecords),
      updatedRecords: JSON.parse(data.updatedRecords),
      warnings: JSON.parse(data.warnings),
      error: data.error
    }
  });
}

export async function getDocumentImportLogs(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(auditLogs)
    .where(sql`${auditLogs.entityType} LIKE 'document_import_%'`)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  
  return result.map(log => {
    const importData = (log.newValues as any) || {};
    return {
      id: log.id,
      fileName: importData.fileName || log.entityName || 'Unknown',
      documentType: log.entityType?.replace('document_import_', '') || 'unknown',
      status: importData.status || (log.action === 'create' ? 'completed' : 'pending'),
      recordsCreated: importData.recordsCreated || 0,
      recordsUpdated: importData.recordsUpdated || 0,
      createdAt: log.createdAt,
      importData,
    };
  });
}

// ============================================
// CRM MODULE - Contacts, Messaging & Tracking
// ============================================

// --- CRM CONTACTS ---

export async function getCrmContacts(filters?: {
  contactType?: string;
  status?: string;
  source?: string;
  pipelineStage?: string;
  assignedTo?: number;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.contactType) {
    conditions.push(eq(crmContacts.contactType, filters.contactType as any));
  }
  if (filters?.status) {
    conditions.push(eq(crmContacts.status, filters.status as any));
  }
  if (filters?.source) {
    conditions.push(eq(crmContacts.source, filters.source as any));
  }
  if (filters?.pipelineStage) {
    conditions.push(eq(crmContacts.pipelineStage, filters.pipelineStage as any));
  }
  if (filters?.assignedTo) {
    conditions.push(eq(crmContacts.assignedTo, filters.assignedTo));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(crmContacts.fullName, `%${filters.search}%`),
        like(crmContacts.email, `%${filters.search}%`),
        like(crmContacts.organization, `%${filters.search}%`),
        like(crmContacts.phone, `%${filters.search}%`)
      )
    );
  }

  let query = db.select().from(crmContacts);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmContacts.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getCrmContactById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  return result[0];
}

export async function getCrmContactByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmContacts).where(eq(crmContacts.email, email)).limit(1);
  return result[0];
}

export async function createCrmContact(data: InsertCrmContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmContacts).values(data);
  return result[0].insertId;
}

export async function updateCrmContact(id: number, data: Partial<InsertCrmContact>) {
  const db = await getDb();
  if (!db) return;
  await db.update(crmContacts).set(data).where(eq(crmContacts.id, id));
}

export async function deleteCrmContact(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmContacts).where(eq(crmContacts.id, id));
}

export async function getCrmContactStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalContacts] = await db.select({ count: count() }).from(crmContacts);
  const [leadCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "lead"));
  const [prospectCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "prospect"));
  const [customerCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "customer"));
  const [investorCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "investor"));
  const [donorCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "donor"));

  return {
    total: totalContacts?.count || 0,
    leads: leadCount?.count || 0,
    prospects: prospectCount?.count || 0,
    customers: customerCount?.count || 0,
    investors: investorCount?.count || 0,
    donors: donorCount?.count || 0,
  };
}

// --- CRM TAGS ---

export async function getCrmTags(category?: string) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(crmTags);
  if (category) {
    query = query.where(eq(crmTags.category, category as any)) as any;
  }
  return query.orderBy(crmTags.name);
}

export async function createCrmTag(data: InsertCrmTag) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmTags).values(data);
  return result[0].insertId;
}

export async function deleteCrmTag(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmContactTags).where(eq(crmContactTags.tagId, id));
  await db.delete(crmTags).where(eq(crmTags.id, id));
}

export async function addTagToContact(contactId: number, tagId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(crmContactTags).values({ contactId, tagId });
}

export async function removeTagFromContact(contactId: number, tagId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmContactTags).where(
    and(eq(crmContactTags.contactId, contactId), eq(crmContactTags.tagId, tagId))
  );
}

export async function getContactTags(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({ tag: crmTags })
    .from(crmContactTags)
    .innerJoin(crmTags, eq(crmContactTags.tagId, crmTags.id))
    .where(eq(crmContactTags.contactId, contactId));
  return result.map(r => r.tag);
}

// --- WHATSAPP MESSAGES ---

export async function getWhatsappMessages(filters?: {
  contactId?: number;
  whatsappNumber?: string;
  direction?: string;
  conversationId?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.contactId) {
    conditions.push(eq(whatsappMessages.contactId, filters.contactId));
  }
  if (filters?.whatsappNumber) {
    conditions.push(eq(whatsappMessages.whatsappNumber, filters.whatsappNumber));
  }
  if (filters?.direction) {
    conditions.push(eq(whatsappMessages.direction, filters.direction as any));
  }
  if (filters?.conversationId) {
    conditions.push(eq(whatsappMessages.conversationId, filters.conversationId));
  }

  let query = db.select().from(whatsappMessages);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getWhatsappConversations(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  // Get latest message per conversation
  const result = await db.select().from(whatsappMessages)
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit * 2);

  // Group by conversation
  const conversations = new Map<string, typeof result[0]>();
  for (const msg of result) {
    const key = msg.conversationId || msg.whatsappNumber;
    if (!conversations.has(key)) {
      conversations.set(key, msg);
    }
  }

  return Array.from(conversations.values()).slice(0, limit);
}

export async function createWhatsappMessage(data: InsertWhatsappMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(whatsappMessages).values(data);
  return result[0].insertId;
}

export async function updateWhatsappMessageStatus(
  id: number,
  status: string,
  timestamp?: Date
) {
  const db = await getDb();
  if (!db) return;

  const updates: Record<string, any> = { status };
  if (status === "sent" && timestamp) updates.sentAt = timestamp;
  if (status === "delivered" && timestamp) updates.deliveredAt = timestamp;
  if (status === "read" && timestamp) updates.readAt = timestamp;

  await db.update(whatsappMessages).set(updates).where(eq(whatsappMessages.id, id));
}

// --- CRM INTERACTIONS ---

export async function getCrmInteractions(filters?: {
  contactId?: number;
  channel?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.contactId) {
    conditions.push(eq(crmInteractions.contactId, filters.contactId));
  }
  if (filters?.channel) {
    conditions.push(eq(crmInteractions.channel, filters.channel as any));
  }

  let query = db.select().from(crmInteractions);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmInteractions.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function createCrmInteraction(data: InsertCrmInteraction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(crmInteractions).values(data);

  // Update contact's interaction count and last contacted timestamp
  await db.update(crmContacts)
    .set({
      totalInteractions: sql`${crmContacts.totalInteractions} + 1`,
      lastContactedAt: new Date(),
    })
    .where(eq(crmContacts.id, data.contactId));

  return result[0].insertId;
}

export async function getContactTimeline(contactId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  // Get all interactions for timeline
  const interactions = await db.select().from(crmInteractions)
    .where(eq(crmInteractions.contactId, contactId))
    .orderBy(desc(crmInteractions.createdAt))
    .limit(limit);

  return interactions;
}

// --- CRM PIPELINES ---

export async function getCrmPipelines(type?: string) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(crmPipelines).where(eq(crmPipelines.isActive, true));
  if (type) {
    query = query.where(eq(crmPipelines.type, type as any)) as any;
  }

  return query.orderBy(crmPipelines.name);
}

export async function getCrmPipelineById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmPipelines).where(eq(crmPipelines.id, id)).limit(1);
  return result[0];
}

export async function createCrmPipeline(data: InsertCrmPipeline) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmPipelines).values(data);
  return result[0].insertId;
}

export async function updateCrmPipeline(id: number, data: Partial<InsertCrmPipeline>) {
  const db = await getDb();
  if (!db) return;
  await db.update(crmPipelines).set(data).where(eq(crmPipelines.id, id));
}

// --- CRM DEALS ---

export async function getCrmDeals(filters?: {
  pipelineId?: number;
  contactId?: number;
  stage?: string;
  status?: string;
  assignedTo?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.pipelineId) {
    conditions.push(eq(crmDeals.pipelineId, filters.pipelineId));
  }
  if (filters?.contactId) {
    conditions.push(eq(crmDeals.contactId, filters.contactId));
  }
  if (filters?.stage) {
    conditions.push(eq(crmDeals.stage, filters.stage));
  }
  if (filters?.status) {
    conditions.push(eq(crmDeals.status, filters.status as any));
  }
  if (filters?.assignedTo) {
    conditions.push(eq(crmDeals.assignedTo, filters.assignedTo));
  }

  let query = db.select().from(crmDeals);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmDeals.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getCrmDealById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
  return result[0];
}

export async function createCrmDeal(data: InsertCrmDeal) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmDeals).values(data);
  return result[0].insertId;
}

export async function updateCrmDeal(id: number, data: Partial<InsertCrmDeal>) {
  const db = await getDb();
  if (!db) return;

  // Handle won/lost status changes
  if (data.status === "won" && !data.wonAt) {
    data.wonAt = new Date();
  }
  if (data.status === "lost" && !data.lostAt) {
    data.lostAt = new Date();
  }

  await db.update(crmDeals).set(data).where(eq(crmDeals.id, id));
}

export async function deleteCrmDeal(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmDeals).where(eq(crmDeals.id, id));
}

export async function getCrmDealStats(pipelineId?: number) {
  const db = await getDb();
  if (!db) return null;

  const baseCondition = pipelineId ? eq(crmDeals.pipelineId, pipelineId) : undefined;

  const [totalDeals] = await db.select({ count: count() }).from(crmDeals).where(baseCondition);
  const [openDeals] = await db.select({ count: count(), totalValue: sum(crmDeals.amount) })
    .from(crmDeals)
    .where(baseCondition ? and(baseCondition, eq(crmDeals.status, "open")) : eq(crmDeals.status, "open"));
  const [wonDeals] = await db.select({ count: count(), totalValue: sum(crmDeals.amount) })
    .from(crmDeals)
    .where(baseCondition ? and(baseCondition, eq(crmDeals.status, "won")) : eq(crmDeals.status, "won"));
  const [lostDeals] = await db.select({ count: count() })
    .from(crmDeals)
    .where(baseCondition ? and(baseCondition, eq(crmDeals.status, "lost")) : eq(crmDeals.status, "lost"));

  return {
    total: totalDeals?.count || 0,
    open: openDeals?.count || 0,
    openValue: openDeals?.totalValue || 0,
    won: wonDeals?.count || 0,
    wonValue: wonDeals?.totalValue || 0,
    lost: lostDeals?.count || 0,
  };
}

// --- CONTACT CAPTURES ---

export async function getContactCaptures(filters?: {
  status?: string;
  captureMethod?: string;
  capturedBy?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(contactCaptures.status, filters.status as any));
  }
  if (filters?.captureMethod) {
    conditions.push(eq(contactCaptures.captureMethod, filters.captureMethod as any));
  }
  if (filters?.capturedBy) {
    conditions.push(eq(contactCaptures.capturedBy, filters.capturedBy));
  }

  let query = db.select().from(contactCaptures);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(contactCaptures.capturedAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getContactCaptureById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contactCaptures).where(eq(contactCaptures.id, id)).limit(1);
  return result[0];
}

export async function createContactCapture(data: InsertContactCapture) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contactCaptures).values(data);
  return result[0].insertId;
}

export async function updateContactCapture(id: number, data: Partial<InsertContactCapture>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contactCaptures).set(data).where(eq(contactCaptures.id, id));
}

// Parse vCard data and create/update contact
export async function processVCardCapture(captureId: number, vcardData: string, capturedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Parse vCard data
  const parsedData = parseVCard(vcardData);

  // Check for existing contact by email or phone
  let existingContact = null;
  if (parsedData.email) {
    existingContact = await getCrmContactByEmail(parsedData.email);
  }

  let contactId: number;

  if (existingContact) {
    // Update existing contact
    await updateCrmContact(existingContact.id, {
      ...parsedData,
      updatedAt: new Date(),
    });
    contactId = existingContact.id;

    // Mark capture as merged
    await updateContactCapture(captureId, {
      contactId,
      status: "merged",
      parsedData: JSON.stringify(parsedData),
    });
  } else {
    // Create new contact
    contactId = await createCrmContact({
      ...parsedData,
      source: "iphone_bump",
      capturedBy,
      captureData: JSON.stringify({ vcardData, captureId }),
    });

    // Mark capture as contact_created
    await updateContactCapture(captureId, {
      contactId,
      status: "contact_created",
      parsedData: JSON.stringify(parsedData),
    });
  }

  return contactId;
}

// Parse LinkedIn profile data and create/update contact
export async function processLinkedInCapture(
  captureId: number,
  linkedinData: {
    profileUrl: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    company?: string;
    email?: string;
  },
  capturedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const parsedData: Partial<InsertCrmContact> = {
    firstName: linkedinData.firstName || linkedinData.name?.split(" ")[0] || "Unknown",
    lastName: linkedinData.lastName || linkedinData.name?.split(" ").slice(1).join(" ") || "",
    fullName: linkedinData.name || `${linkedinData.firstName || ""} ${linkedinData.lastName || ""}`.trim() || "Unknown",
    linkedinUrl: linkedinData.profileUrl,
    jobTitle: linkedinData.headline,
    organization: linkedinData.company,
    email: linkedinData.email,
  };

  // Check for existing contact by LinkedIn URL or email
  let existingContact = null;
  if (linkedinData.email) {
    existingContact = await getCrmContactByEmail(linkedinData.email);
  }
  if (!existingContact && linkedinData.profileUrl) {
    const result = await db.select().from(crmContacts)
      .where(eq(crmContacts.linkedinUrl, linkedinData.profileUrl))
      .limit(1);
    existingContact = result[0];
  }

  let contactId: number;

  if (existingContact) {
    await updateCrmContact(existingContact.id, parsedData);
    contactId = existingContact.id;

    await updateContactCapture(captureId, {
      contactId,
      status: "merged",
      parsedData: JSON.stringify(parsedData),
    });
  } else {
    contactId = await createCrmContact({
      ...parsedData,
      source: "linkedin_scan",
      capturedBy,
      captureData: JSON.stringify({ linkedinData, captureId }),
    } as InsertCrmContact);

    await updateContactCapture(captureId, {
      contactId,
      status: "contact_created",
      parsedData: JSON.stringify(parsedData),
    });
  }

  return contactId;
}

// --- EMAIL CAMPAIGNS ---

export async function getCrmEmailCampaigns(filters?: {
  status?: string;
  type?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(crmEmailCampaigns.status, filters.status as any));
  }
  if (filters?.type) {
    conditions.push(eq(crmEmailCampaigns.type, filters.type as any));
  }

  let query = db.select().from(crmEmailCampaigns);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmEmailCampaigns.createdAt))
    .limit(filters?.limit || 50);
}

export async function createCrmEmailCampaign(data: InsertCrmEmailCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmEmailCampaigns).values(data);
  return result[0].insertId;
}

export async function updateCrmEmailCampaign(id: number, data: Partial<InsertCrmEmailCampaign>) {
  const db = await getDb();
  if (!db) return;
  await db.update(crmEmailCampaigns).set(data).where(eq(crmEmailCampaigns.id, id));
}

// --- HELPER FUNCTIONS ---

function parseVCard(vcardData: string): Partial<InsertCrmContact> {
  const lines = vcardData.split(/\r?\n/);
  const result: Partial<InsertCrmContact> = {};

  for (const line of lines) {
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();

    if (!key || !value) continue;

    const keyLower = key.toLowerCase().split(";")[0];

    switch (keyLower) {
      case "fn":
        result.fullName = value;
        break;
      case "n":
        const nameParts = value.split(";");
        result.lastName = nameParts[0] || "";
        result.firstName = nameParts[1] || "";
        if (!result.fullName) {
          result.fullName = `${result.firstName} ${result.lastName}`.trim();
        }
        break;
      case "email":
        result.email = value;
        break;
      case "tel":
        if (key.toLowerCase().includes("cell") || key.toLowerCase().includes("mobile")) {
          result.phone = value;
          result.whatsappNumber = value.replace(/[^+\d]/g, "");
        } else if (!result.phone) {
          result.phone = value;
        }
        break;
      case "org":
        result.organization = value;
        break;
      case "title":
        result.jobTitle = value;
        break;
      case "adr":
        const addrParts = value.split(";");
        result.address = addrParts[2] || "";
        result.city = addrParts[3] || "";
        result.state = addrParts[4] || "";
        result.postalCode = addrParts[5] || "";
        result.country = addrParts[6] || "";
        break;
      case "url":
        if (value.includes("linkedin.com")) {
          result.linkedinUrl = value;
        }
        break;
      case "note":
        result.notes = value;
        break;
    }
  }

  // Ensure required fields
  if (!result.firstName) {
    result.firstName = result.fullName?.split(" ")[0] || "Unknown";
  }
  if (!result.fullName) {
    result.fullName = `${result.firstName || ""} ${result.lastName || ""}`.trim() || "Unknown";
  }

  return result;
}

// Get unified messaging history (emails + WhatsApp) for a contact
export async function getUnifiedMessagingHistory(contactId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  const contact = await getCrmContactById(contactId);
  if (!contact) return [];

  // Get WhatsApp messages
  const whatsappMsgs = await getWhatsappMessages({
    contactId,
    limit,
  });

  // Get sent emails to this contact
  const emailConditions = [];
  if (contact.email) {
    emailConditions.push(eq(sentEmails.toEmail, contact.email));
  }

  let emails: typeof sentEmails.$inferSelect[] = [];
  if (emailConditions.length > 0) {
    emails = await db.select().from(sentEmails)
      .where(or(...emailConditions))
      .orderBy(desc(sentEmails.createdAt))
      .limit(limit);
  }

  // Combine and sort by date
  const combined = [
    ...whatsappMsgs.map(m => ({
      type: "whatsapp" as const,
      id: m.id,
      direction: m.direction,
      content: m.content,
      status: m.status,
      timestamp: m.createdAt,
      data: m,
    })),
    ...emails.map(e => ({
      type: "email" as const,
      id: e.id,
      direction: "outbound" as const,
      content: e.bodyText || e.subject,
      status: e.status,
      timestamp: e.createdAt,
      data: e,
    })),
  ].sort((a, b) => {
    const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return dateB - dateA;
  });

  return combined.slice(0, limit);
}

// ============================================
// COPACKER INVENTORY AUTO-PURCHASE
// ============================================

// Get inventory by ID with product and vendor details
export async function getInventoryByIdWithDetails(inventoryId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select({
    inventory: inventory,
    product: products,
    vendor: vendors,
  })
    .from(inventory)
    .leftJoin(products, eq(inventory.productId, products.id))
    .leftJoin(vendors, eq(products.preferredVendorId, vendors.id))
    .where(eq(inventory.id, inventoryId))
    .limit(1);

  return result[0] || null;
}

// Check if inventory is below reorder level and trigger auto-purchase order
export async function checkAndTriggerLowStockPurchaseOrder(
  inventoryId: number,
  userId: number
): Promise<{ triggered: boolean; purchaseOrderId?: number; alertId?: number; reason?: string }> {
  const db = await getDb();
  if (!db) return { triggered: false, reason: "Database not available" };

  // Get inventory with product and vendor details
  const inventoryData = await getInventoryByIdWithDetails(inventoryId);
  if (!inventoryData || !inventoryData.inventory) {
    return { triggered: false, reason: "Inventory record not found" };
  }

  const inv = inventoryData.inventory;
  const product = inventoryData.product;
  const vendor = inventoryData.vendor;

  // Check if reorderLevel is set
  if (!inv.reorderLevel) {
    return { triggered: false, reason: "No reorder level set for this inventory" };
  }

  const currentQty = parseFloat(inv.quantity as string) || 0;
  const reorderLevel = parseFloat(inv.reorderLevel as string) || 0;
  const reorderQty = parseFloat(inv.reorderQuantity as string) || 0;

  // Check if quantity is at or below reorder level
  if (currentQty > reorderLevel) {
    return { triggered: false, reason: "Stock level is above reorder threshold" };
  }

  // Check if there's already an open/pending PO for this product
  const existingPO = await db.select().from(purchaseOrders)
    .innerJoin(purchaseOrderItems, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
    .where(and(
      eq(purchaseOrderItems.productId, inv.productId),
      or(
        eq(purchaseOrders.status, 'draft'),
        eq(purchaseOrders.status, 'sent'),
        eq(purchaseOrders.status, 'confirmed'),
        eq(purchaseOrders.status, 'partial')
      )
    ))
    .limit(1);

  if (existingPO.length > 0) {
    return { triggered: false, reason: "An open purchase order already exists for this product" };
  }

  const productName = product?.name || `Product ID: ${inv.productId}`;
  const productCost = product?.costPrice ? parseFloat(product.costPrice as string) : 0;

  // If no preferred vendor, create an alert instead
  if (!product?.preferredVendorId || !vendor) {
    const { id: alertId } = await createAlert({
      type: 'low_stock',
      severity: currentQty === 0 ? 'critical' : 'warning',
      title: `Low stock: ${productName} - No vendor assigned`,
      description: `Current quantity (${currentQty}) is at or below reorder level (${reorderLevel}). Cannot auto-generate purchase order because no preferred vendor is assigned to this product. Please assign a vendor and create a purchase order manually.`,
      entityType: 'inventory',
      entityId: inventoryId,
      thresholdValue: inv.reorderLevel,
      actualValue: inv.quantity,
      autoGenerated: true
    });

    return {
      triggered: false,
      alertId,
      reason: "No preferred vendor assigned - alert created for manual action"
    };
  }

  // Calculate order quantity
  const orderQty = reorderQty > 0 ? reorderQty : Math.max(reorderLevel - currentQty, 1);
  const unitPrice = productCost > 0 ? productCost : (product?.unitPrice ? parseFloat(product.unitPrice as string) : 0);
  const totalAmount = orderQty * unitPrice;

  // Generate PO number
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const poNumber = `PO-${year}${month}-${random}`;

  // Create the purchase order
  const poResult = await createPurchaseOrder({
    vendorId: product.preferredVendorId,
    poNumber,
    status: 'draft',
    orderDate: new Date(),
    subtotal: totalAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    currency: 'USD',
    notes: `Auto-generated purchase order due to low stock. Inventory ID: ${inventoryId}. Current stock: ${currentQty}, Reorder level: ${reorderLevel}.`,
    createdBy: userId,
  });

  // Create PO line item
  await createPurchaseOrderItem({
    purchaseOrderId: poResult.id,
    productId: inv.productId,
    description: productName,
    quantity: orderQty.toString(),
    unitPrice: unitPrice.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  });

  // Create audit log for the auto-PO
  await createAuditLog({
    entityType: 'purchaseOrder',
    entityId: poResult.id,
    action: 'create',
    userId,
    newValues: {
      poNumber,
      vendorId: product.preferredVendorId,
      autoGenerated: true,
      triggerReason: 'low_stock',
      inventoryId,
      currentQuantity: currentQty,
      reorderLevel,
      orderQuantity: orderQty,
    },
  });

  // Create alert for visibility
  await createAlert({
    type: 'low_stock',
    severity: currentQty === 0 ? 'critical' : 'warning',
    title: `Low stock: ${productName} - Auto PO created`,
    description: `Current quantity (${currentQty}) is at or below reorder level (${reorderLevel}). Purchase order ${poNumber} has been automatically created for ${orderQty} units from ${vendor.name}.`,
    entityType: 'purchaseOrder',
    entityId: poResult.id,
    thresholdValue: inv.reorderLevel,
    actualValue: inv.quantity,
    autoGenerated: true,
    status: 'acknowledged', // Mark as acknowledged since action was taken
  });

  return {
    triggered: true,
    purchaseOrderId: poResult.id,
    reason: `Auto-generated PO ${poNumber} for ${orderQty} units`
  };
}

// ============================================
// FIREFLIES INTEGRATION
// ============================================

export async function getFirefliesMeetings(filters?: {
  processingStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.processingStatus) {
    conditions.push(eq(firefliesMeetings.processingStatus, filters.processingStatus as any));
  }

  let query = db.select().from(firefliesMeetings);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(firefliesMeetings.date))
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);
}

export async function getFirefliesMeetingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(firefliesMeetings).where(eq(firefliesMeetings.id, id)).limit(1);
  return result[0];
}

export async function getFirefliesMeetingByFirefliesId(firefliesId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(firefliesMeetings).where(eq(firefliesMeetings.firefliesId, firefliesId)).limit(1);
  return result[0];
}

export async function createFirefliesMeeting(data: InsertFirefliesMeeting) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(firefliesMeetings).values(data);
  return { id: result[0].insertId };
}

export async function updateFirefliesMeeting(id: number, data: Partial<InsertFirefliesMeeting>) {
  const db = await getDb();
  if (!db) return;
  await db.update(firefliesMeetings).set(data).where(eq(firefliesMeetings.id, id));
}

export async function getFirefliesActionItems(meetingId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(firefliesActionItems)
    .where(eq(firefliesActionItems.meetingId, meetingId))
    .orderBy(firefliesActionItems.id);
}

export async function getFirefliesActionItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(firefliesActionItems).where(eq(firefliesActionItems.id, id)).limit(1);
  return result[0];
}

export async function createFirefliesActionItem(data: InsertFirefliesActionItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(firefliesActionItems).values(data);
  return { id: result[0].insertId };
}

export async function updateFirefliesActionItem(id: number, data: Partial<InsertFirefliesActionItem>) {
  const db = await getDb();
  if (!db) return;
  await db.update(firefliesActionItems).set(data).where(eq(firefliesActionItems.id, id));
}

export async function getFirefliesContactMappings(meetingId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(firefliesContactMappings)
    .where(eq(firefliesContactMappings.meetingId, meetingId))
    .orderBy(firefliesContactMappings.id);
}

export async function createFirefliesContactMapping(data: InsertFirefliesContactMapping) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(firefliesContactMappings).values(data);
  return { id: result[0].insertId };
}

export async function getFirefliesMeetingStats() {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, processed: 0, contactsCreated: 0, tasksCreated: 0 };

  const allMeetings = await db.select().from(firefliesMeetings);
  const total = allMeetings.length;
  const pending = allMeetings.filter(m => m.processingStatus === 'pending').length;
  const processed = allMeetings.filter(m => ['fully_processed', 'contacts_created', 'tasks_created', 'project_created'].includes(m.processingStatus)).length;
  const contactsCreated = allMeetings.reduce((sum, m) => sum + (m.autoCreatedContactCount || 0), 0);
  const tasksCreated = allMeetings.reduce((sum, m) => sum + (m.autoCreatedTaskCount || 0), 0);

  return { total, pending, processed, contactsCreated, tasksCreated };
}

// ============================================
// COPACKER PORTAL
// ============================================

// --- Inventory Updates ---

export async function getCopackerInventoryUpdates(warehouseId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (warehouseId) conditions.push(eq(copackerInventoryUpdates.warehouseId, warehouseId));

  const result = conditions.length
    ? await db.select().from(copackerInventoryUpdates).where(and(...conditions)).orderBy(desc(copackerInventoryUpdates.createdAt))
    : await db.select().from(copackerInventoryUpdates).orderBy(desc(copackerInventoryUpdates.createdAt));

  return result;
}

export async function getCopackerInventoryUpdateById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(copackerInventoryUpdates).where(eq(copackerInventoryUpdates.id, id)).limit(1);
  return rows[0] || null;
}

export async function createCopackerInventoryUpdate(data: InsertCopackerInventoryUpdate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(copackerInventoryUpdates).values(data);
  return { id: result[0].insertId };
}

export async function updateCopackerInventoryUpdate(id: number, data: Partial<InsertCopackerInventoryUpdate>) {
  const db = await getDb();
  if (!db) return;
  await db.update(copackerInventoryUpdates).set(data).where(eq(copackerInventoryUpdates.id, id));
}

export async function getCopackerInventoryUpdateItems(updateId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    item: copackerInventoryUpdateItems,
    product: products,
  })
    .from(copackerInventoryUpdateItems)
    .leftJoin(products, eq(copackerInventoryUpdateItems.productId, products.id))
    .where(eq(copackerInventoryUpdateItems.updateId, updateId))
    .orderBy(copackerInventoryUpdateItems.id);
}

export async function createCopackerInventoryUpdateItem(data: InsertCopackerInventoryUpdateItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(copackerInventoryUpdateItems).values(data);
  return { id: result[0].insertId };
}

export async function deleteCopackerInventoryUpdateItems(updateId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(copackerInventoryUpdateItems).where(eq(copackerInventoryUpdateItems.updateId, updateId));
}

// --- Copacker Invoices ---

export async function getCopackerInvoices(warehouseId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (warehouseId) conditions.push(eq(copackerInvoices.warehouseId, warehouseId));

  const result = conditions.length
    ? await db.select().from(copackerInvoices).where(and(...conditions)).orderBy(desc(copackerInvoices.createdAt))
    : await db.select().from(copackerInvoices).orderBy(desc(copackerInvoices.createdAt));

  return result;
}

export async function getCopackerInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(copackerInvoices).where(eq(copackerInvoices.id, id)).limit(1);
  return rows[0] || null;
}

export async function createCopackerInvoice(data: InsertCopackerInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(copackerInvoices).values(data);
  return { id: result[0].insertId };
}

export async function updateCopackerInvoice(id: number, data: Partial<InsertCopackerInvoice>) {
  const db = await getDb();
  if (!db) return;
  await db.update(copackerInvoices).set(data).where(eq(copackerInvoices.id, id));
}

export async function getCopackerInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(copackerInvoiceItems).where(eq(copackerInvoiceItems.invoiceId, invoiceId)).orderBy(copackerInvoiceItems.id);
}

export async function createCopackerInvoiceItem(data: InsertCopackerInvoiceItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(copackerInvoiceItems).values(data);
  return { id: result[0].insertId };
}

export async function deleteCopackerInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(copackerInvoiceItems).where(eq(copackerInvoiceItems.invoiceId, invoiceId));
}

// --- Copacker Shipping Documents ---

export async function getCopackerShippingDocuments(warehouseId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (warehouseId) conditions.push(eq(copackerShippingDocuments.warehouseId, warehouseId));

  const result = conditions.length
    ? await db.select().from(copackerShippingDocuments).where(and(...conditions)).orderBy(desc(copackerShippingDocuments.createdAt))
    : await db.select().from(copackerShippingDocuments).orderBy(desc(copackerShippingDocuments.createdAt));

  return result;
}

export async function createCopackerShippingDocument(data: InsertCopackerShippingDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(copackerShippingDocuments).values(data);
  return { id: result[0].insertId };
}

export async function updateCopackerShippingDocument(id: number, data: Partial<InsertCopackerShippingDocument>) {
  const db = await getDb();
  if (!db) return;
  await db.update(copackerShippingDocuments).set(data).where(eq(copackerShippingDocuments.id, id));
}
