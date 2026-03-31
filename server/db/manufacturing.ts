import { eq, and, or, desc, sql, count } from "drizzle-orm";
import {
  billOfMaterials, InsertBillOfMaterials, bomComponents, InsertBomComponent,
  rawMaterials, InsertRawMaterial, bomVersionHistory, InsertBomVersionHistory,
  workOrders, InsertWorkOrder, workOrderMaterials, InsertWorkOrderMaterial,
  rawMaterialInventory, InsertRawMaterialInventory, rawMaterialTransactions, InsertRawMaterialTransaction,
  purchaseOrderRawMaterials,
  demandForecasts, InsertDemandForecast, productionPlans, InsertProductionPlan,
  materialRequirements, InsertMaterialRequirement,
  suggestedPurchaseOrders, InsertSuggestedPurchaseOrder, suggestedPoItems, InsertSuggestedPoItem,
  forecastAccuracy, InsertForecastAccuracy,
  purchaseOrderItems, purchaseOrders, products,
} from "../../drizzle/schema";
import { getDb } from "./connection";

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
  await db.delete(bomComponents).where(eq(bomComponents.bomId, id));
  await db.delete(bomVersionHistory).where(eq(bomVersionHistory.bomId, id));
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
    .where(or(eq(rawMaterials.name, name), eq(rawMaterials.sku, sku)))
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
    id: workOrders.id, companyId: workOrders.companyId,
    workOrderNumber: workOrders.workOrderNumber, bomId: workOrders.bomId,
    productId: workOrders.productId, warehouseId: workOrders.warehouseId,
    quantity: workOrders.quantity, completedQuantity: workOrders.completedQuantity,
    unit: workOrders.unit, status: workOrders.status, priority: workOrders.priority,
    scheduledStartDate: workOrders.scheduledStartDate, scheduledEndDate: workOrders.scheduledEndDate,
    actualStartDate: workOrders.actualStartDate, actualEndDate: workOrders.actualEndDate,
    notes: workOrders.notes, createdBy: workOrders.createdBy, assignedTo: workOrders.assignedTo,
    createdAt: workOrders.createdAt, updatedAt: workOrders.updatedAt,
    productName: products.name, productSku: products.sku,
  })
    .from(workOrders)
    .leftJoin(products, eq(workOrders.productId, products.id))
    .orderBy(desc(workOrders.createdAt));
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
    .where(and(eq(rawMaterialInventory.rawMaterialId, rawMaterialId), eq(rawMaterialInventory.warehouseId, warehouseId)))
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
      rawMaterialId, warehouseId, unit: data.unit || 'EA', ...data,
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

import { poReceivingRecords, InsertPoReceivingRecord, poReceivingItems, InsertPoReceivingItem, shipments } from "../../drizzle/schema";

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

export async function receivePurchaseOrderItems(
  purchaseOrderId: number,
  warehouseId: number,
  items: Array<{ purchaseOrderItemId: number; rawMaterialId?: number; productId?: number; quantity: number; unit: string; lotNumber?: string; expirationDate?: Date }>,
  receivedBy?: number,
  shipmentId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const receiving = await createPoReceivingRecord({ purchaseOrderId, shipmentId, receivedDate: new Date(), receivedBy, warehouseId });
  for (const item of items) {
    await createPoReceivingItem({
      receivingRecordId: receiving.id, purchaseOrderItemId: item.purchaseOrderItemId,
      rawMaterialId: item.rawMaterialId, productId: item.productId,
      receivedQuantity: item.quantity.toString(), unit: item.unit,
      lotNumber: item.lotNumber, expirationDate: item.expirationDate, condition: 'good',
    });
    if (item.rawMaterialId) {
      const currentInv = await getRawMaterialInventoryByLocation(item.rawMaterialId, warehouseId);
      const currentQty = parseFloat(currentInv?.quantity?.toString() || '0');
      const newQty = currentQty + item.quantity;
      await upsertRawMaterialInventory(item.rawMaterialId, warehouseId, {
        quantity: newQty.toFixed(4), availableQuantity: newQty.toFixed(4),
        unit: item.unit, lastReceivedDate: new Date(),
        lotNumber: item.lotNumber, expirationDate: item.expirationDate,
      });
      await createRawMaterialTransaction({
        rawMaterialId: item.rawMaterialId, warehouseId, transactionType: 'receive',
        quantity: item.quantity.toFixed(4), previousQuantity: currentQty.toFixed(4),
        newQuantity: newQty.toFixed(4), unit: item.unit,
        referenceType: 'purchase_order', referenceId: purchaseOrderId,
        lotNumber: item.lotNumber, performedBy: receivedBy,
      });
    }
    const poItem = await db.select().from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId)).limit(1);
    if (poItem[0]) {
      const prevReceived = parseFloat(poItem[0].receivedQuantity?.toString() || '0');
      await db.update(purchaseOrderItems)
        .set({ receivedQuantity: (prevReceived + item.quantity).toFixed(4) })
        .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId));
    }
  }
  const poItems = await db.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
  let allReceived = true;
  let anyReceived = false;
  for (const poi of poItems) {
    const ordered = parseFloat(poi.quantity?.toString() || '0');
    const received = parseFloat(poi.receivedQuantity?.toString() || '0');
    if (received >= ordered) { anyReceived = true; }
    else if (received > 0) { anyReceived = true; allReceived = false; }
    else { allReceived = false; }
  }
  if (allReceived) {
    await db.update(purchaseOrders).set({ status: 'received', receivedDate: new Date() })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  } else if (anyReceived) {
    await db.update(purchaseOrders).set({ status: 'partial' })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }
  let shipmentToUpdate = shipmentId;
  if (!shipmentToUpdate) {
    const linkedShipment = await db.select().from(shipments)
      .where(eq(shipments.purchaseOrderId, purchaseOrderId)).limit(1);
    if (linkedShipment[0]) { shipmentToUpdate = linkedShipment[0].id; }
  }
  if (shipmentToUpdate) {
    if (allReceived) {
      await db.update(shipments).set({ status: 'delivered', deliveryDate: new Date() })
        .where(eq(shipments.id, shipmentToUpdate));
    } else if (anyReceived) {
      const currentShipment = await db.select().from(shipments)
        .where(eq(shipments.id, shipmentToUpdate)).limit(1);
      if (currentShipment[0]?.status === 'pending') {
        await db.update(shipments).set({ status: 'in_transit' })
          .where(eq(shipments.id, shipmentToUpdate));
      }
    }
  }
  return receiving;
}

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
    if (!inv) { await updateWorkOrderMaterial(mat.id, { status: 'shortage' }); continue; }
    const currentQty = parseFloat(inv.quantity?.toString() || '0');
    const consumeQty = Math.min(requiredQty, currentQty);
    const newQty = currentQty - consumeQty;
    await upsertRawMaterialInventory(mat.rawMaterialId, workOrder.warehouseId || 0, {
      quantity: newQty.toFixed(4), availableQuantity: newQty.toFixed(4),
    });
    await createRawMaterialTransaction({
      rawMaterialId: mat.rawMaterialId, warehouseId: workOrder.warehouseId || 0,
      transactionType: 'consume', quantity: (-consumeQty).toFixed(4),
      previousQuantity: currentQty.toFixed(4), newQuantity: newQty.toFixed(4),
      unit: mat.unit, referenceType: 'work_order', referenceId: workOrderId, performedBy,
    });
    await updateWorkOrderMaterial(mat.id, {
      consumedQuantity: consumeQty.toFixed(4),
      status: consumeQty >= requiredQty ? 'consumed' : 'partial',
    });
  }
  await updateWorkOrder(workOrderId, { status: 'completed', actualEndDate: new Date() });
}

// ============================================
// AI PRODUCTION FORECASTING
// ============================================

function generateForecastNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `FC-${dateStr}-${random}`;
}

function generatePlanNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PP-${dateStr}-${random}`;
}

function generateSuggestedPoNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SPO-${dateStr}-${random}`;
}

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

export async function getForecastAccuracyHistory(productId?: number, limit?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(forecastAccuracy).orderBy(desc(forecastAccuracy.calculatedAt));
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

export async function convertSuggestedPoToActualPo(suggestedPoId: number, approvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const suggestedPo = await getSuggestedPurchaseOrderById(suggestedPoId);
  if (!suggestedPo) throw new Error("Suggested PO not found");
  const items = await getSuggestedPoItems(suggestedPoId);
  let subtotal = 0;
  for (const item of items) {
    subtotal += parseFloat(item.totalAmount?.toString() || '0');
  }
  const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const poResult = await db.insert(purchaseOrders).values({
    poNumber, vendorId: suggestedPo.vendorId, orderDate: new Date(),
    expectedDate: suggestedPo.requiredByDate || undefined,
    subtotal: subtotal.toFixed(2), totalAmount: subtotal.toFixed(2),
    currency: suggestedPo.currency || 'USD', status: 'draft',
    createdBy: approvedBy, approvedBy, approvedAt: new Date(),
  }).$returningId();
  const poId = poResult[0].id;
  for (const item of items) {
    await db.insert(purchaseOrderItems).values({
      purchaseOrderId: poId, productId: item.productId || undefined,
      description: item.description || '', quantity: item.quantity?.toString() || '0',
      unitPrice: item.unitPrice?.toString() || '0', totalAmount: item.totalAmount?.toString() || '0',
    });
  }
  await updateSuggestedPurchaseOrder(suggestedPoId, {
    status: 'converted', convertedPoId: poId, approvedBy, approvedAt: new Date(),
  });
  for (const item of items) {
    if (item.materialRequirementId) {
      await updateMaterialRequirement(item.materialRequirementId, {
        status: 'po_generated', generatedPoId: poId,
      });
    }
  }
  return { poId, poNumber };
}

// ============================================
// RAW MATERIALS - GET ALL
// ============================================

export async function getAllRawMaterials() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(rawMaterials).orderBy(rawMaterials.name);
}
