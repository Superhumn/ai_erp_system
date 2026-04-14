import { eq, and, or, desc, sql, count, sum, like, inArray, gte, lte } from "drizzle-orm";
import {
  vendors, InsertVendor, purchaseOrders, InsertPurchaseOrder, purchaseOrderItems,
  shipments, purchaseOrderRawMaterials,
  supplierPortalSessions, supplierDocuments, supplierFreightInfo,
  vendorRfqs, InsertVendorRfq, vendorQuotes, InsertVendorQuote,
  vendorRfqEmails, InsertVendorRfqEmail, vendorRfqInvitations, InsertVendorRfqInvitation,
  products, rawMaterials,
  vendorNegotiations, InsertVendorNegotiation,
  negotiationRounds, InsertNegotiationRound,
} from "../../drizzle/schema";
import { getDb } from "./connection";

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

export async function getVendorByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(vendors).where(
    sql`LOWER(${vendors.name}) = LOWER(${name}) OR LOWER(${vendors.name}) LIKE LOWER(${`%${name}%`})`
  ).limit(1);
  return result[0] || null;
}

// Find vendor by email domain or name match
export async function findVendorByEmailOrName(email?: string, name?: string) {
  const db = await getDb();
  if (!db) return null;

  if (email) {
    const byEmail = await db.select().from(vendors).where(eq(vendors.email, email));
    if (byEmail.length > 0) return byEmail[0];

    const domain = email.split("@")[1];
    if (domain) {
      const byDomain = await db.select().from(vendors).where(
        sql`${vendors.email} LIKE ${`%@${domain}`}`
      );
      if (byDomain.length > 0) return byDomain[0];
    }
  }

  if (name) {
    const byName = await db.select().from(vendors).where(eq(vendors.name, name));
    if (byName.length > 0) return byName[0];

    const byPartialName = await db.select().from(vendors).where(
      sql`LOWER(${vendors.name}) LIKE ${`%${name.toLowerCase()}%`}`
    );
    if (byPartialName.length > 0) return byPartialName[0];
  }

  return null;
}

// Get vendor for a raw material (preferred or first available)
export async function getPreferredVendorForMaterial(rawMaterialId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const rm = await db.select().from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId)).limit(1);
  if (!rm[0]) return undefined;

  if (rm[0].description) {
    const vendor = await db.select().from(vendors)
      .where(like(vendors.name, `%${rm[0].description.split(' ')[0]}%`))
      .limit(1);
    if (vendor[0]) return vendor[0];
  }

  const anyVendor = await db.select().from(vendors)
    .where(eq(vendors.status, 'active'))
    .limit(1);
  return anyVendor[0];
}

// ============================================
// PURCHASE ORDERS
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

export async function getPurchaseOrderItems(purchaseOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
}

export async function updatePurchaseOrderItem(id: number, data: Partial<typeof purchaseOrderItems.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(purchaseOrderItems).set(data).where(eq(purchaseOrderItems.id, id));
  return { success: true };
}

export async function findPurchaseOrderByNumber(poNumber: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(purchaseOrders).where(
    sql`${purchaseOrders.poNumber} = ${poNumber} OR ${purchaseOrders.poNumber} LIKE ${`%${poNumber}%`}`
  );
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

// ============================================
// SHIPMENTS
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

export async function getShipmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
  return result[0];
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

export async function findShipmentByTracking(trackingNumber: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(shipments).where(
    eq(shipments.trackingNumber, trackingNumber)
  );
  return result[0] || null;
}

// Get pending POs for a raw material
export async function getPendingOrdersForMaterial(rawMaterialId: number) {
  const db = await getDb();
  if (!db) return [];

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

  const { getRawMaterialById } = await import("./manufacturing");
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

// Get all pending/inbound inventory from POs
export async function getPendingInventoryFromPOs() {
  const db = await getDb();
  if (!db) return [];

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

  const { getProductById } = await import("./operations");

  const enhancedItems = [];
  for (const item of pendingItems) {
    const orderedQty = parseFloat(item.orderedQuantity?.toString() || '0');
    const receivedQty = parseFloat(item.receivedQuantity?.toString() || '0');
    const pendingQty = orderedQty - receivedQty;

    if (pendingQty <= 0) continue;

    const rmLink = await db.select()
      .from(purchaseOrderRawMaterials)
      .where(eq(purchaseOrderRawMaterials.purchaseOrderItemId, item.poItemId))
      .limit(1);

    let rawMaterialId = rmLink[0]?.rawMaterialId;
    let rawMaterialName = null;

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
      const { getRawMaterialById } = await import("./manufacturing");
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
  .orderBy(desc(shipments.createdAt))
  .limit(200);
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
// VENDOR QUOTE MANAGEMENT (RFQ System)
// ============================================

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

export async function generateVendorRfqNumber() {
  const db = await getDb();
  if (!db) return `RFQ-${Date.now()}`;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(vendorRfqs);
  const cnt = result[0]?.count || 0;
  return `RFQ-${String(cnt + 1).padStart(6, '0')}`;
}

// ============================================
// VENDOR NEGOTIATIONS
// ============================================

export async function createVendorNegotiation(data: InsertVendorNegotiation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vendorNegotiations).values(data);
  return { id: result[0].insertId };
}

export async function getVendorNegotiations(filters?: { vendorId?: number; status?: string; type?: string; companyId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.vendorId) conditions.push(eq(vendorNegotiations.vendorId, filters.vendorId));
  if (filters?.status) conditions.push(eq(vendorNegotiations.status, filters.status as any));
  if (filters?.type) conditions.push(eq(vendorNegotiations.type, filters.type as any));
  if (filters?.companyId) conditions.push(eq(vendorNegotiations.companyId, filters.companyId));
  if (conditions.length > 0) {
    return db.select().from(vendorNegotiations).where(and(...conditions)).orderBy(desc(vendorNegotiations.updatedAt));
  }
  return db.select().from(vendorNegotiations).orderBy(desc(vendorNegotiations.updatedAt));
}

export async function getVendorNegotiationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vendorNegotiations).where(eq(vendorNegotiations.id, id)).limit(1);
  return result[0];
}

export async function getVendorNegotiationStats(companyId?: number) {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, accepted: 0, totalSavings: "0" };

  const conditions: any[] = [];
  if (companyId) conditions.push(eq(vendorNegotiations.companyId, companyId));

  const [stats] = await db.select({
    total: count(),
    active: sum(sql`CASE WHEN status IN ('in_progress', 'counter_offered', 'ready') THEN 1 ELSE 0 END`),
    accepted: sum(sql`CASE WHEN status = 'accepted' THEN 1 ELSE 0 END`),
    totalSavings: sum(vendorNegotiations.estimatedSavings),
  }).from(vendorNegotiations).where(conditions.length > 0 ? and(...conditions) : undefined);

  return {
    total: Number(stats?.total ?? 0),
    active: Number(stats?.active ?? 0),
    accepted: Number(stats?.accepted ?? 0),
    totalSavings: String(stats?.totalSavings ?? "0"),
  };
}

export async function getVendorSpendingHistory(vendorId: number, months = 12) {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  return db.select({
    totalAmount: sum(purchaseOrders.totalAmount),
    orderCount: count(),
  }).from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.vendorId, vendorId),
      gte(purchaseOrders.createdAt, startDate)
    ))
    .groupBy(sql`YEAR(${purchaseOrders.createdAt}), MONTH(${purchaseOrders.createdAt})`)
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function updateVendorNegotiation(id: number, data: Partial<InsertVendorNegotiation>) {
  const db = await getDb();
  if (!db) return;
  await db.update(vendorNegotiations).set(data).where(eq(vendorNegotiations.id, id));
}

// ============================================
// NEGOTIATION ROUNDS
// ============================================

export async function createNegotiationRound(data: InsertNegotiationRound) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(negotiationRounds).values(data);
  return { id: result[0].insertId };
}

export async function getNegotiationRounds(negotiationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(negotiationRounds)
    .where(eq(negotiationRounds.negotiationId, negotiationId))
    .orderBy(negotiationRounds.roundNumber);
}

export async function getNextRoundNumber(negotiationId: number) {
  const db = await getDb();
  if (!db) return 1;
  const [result] = await db.select({ maxRound: sql<number>`MAX(${negotiationRounds.roundNumber})` })
    .from(negotiationRounds)
    .where(eq(negotiationRounds.negotiationId, negotiationId));
  return (result?.maxRound || 0) + 1;
}
