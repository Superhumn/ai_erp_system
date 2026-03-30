import { eq, and, or, desc, gte, like, sum, count } from "drizzle-orm";
import {
  orders, InsertOrder, orderItems,
  customers, InsertCustomer,
  salesOrders, InsertSalesOrder, salesOrderLines, InsertSalesOrderLine,
  inventoryReservations, InsertInventoryReservation,
  inventoryAllocations, InsertInventoryAllocation,
  salesEvents, InsertSalesEvent,
  vendors, products, employees, contracts, projects, invoices, purchaseOrders, disputes,
} from "../../drizzle/schema";
import { getDb } from "./connection";

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
