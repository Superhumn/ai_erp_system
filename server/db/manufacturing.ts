import { eq, and, or, desc, sql, count } from "drizzle-orm";
import {
  billOfMaterials, InsertBillOfMaterials, bomComponents, InsertBomComponent,
  rawMaterials, InsertRawMaterial, bomVersionHistory, InsertBomVersionHistory,
  workOrders, InsertWorkOrder, workOrderMaterials, InsertWorkOrderMaterial,
  rawMaterialInventory, InsertRawMaterialInventory, rawMaterialTransactions, InsertRawMaterialTransaction,
  purchaseOrderRawMaterials,
  recipeIngredients, InsertRecipeIngredient, ingredientCostHistory, InsertIngredientCostHistory,
  recipes, InsertRecipe, recipeLines, InsertRecipeLine, recipeProcedures, InsertRecipeProcedure,
  batchCostSnapshots, InsertBatchCostSnapshot,
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
  const conditions = [];
  if (filters?.productId) {
    conditions.push(eq(billOfMaterials.productId, filters.productId));
  }
  if (filters?.status) {
    conditions.push(eq(billOfMaterials.status, filters.status as any));
  }
  const query = db.select().from(billOfMaterials).orderBy(desc(billOfMaterials.updatedAt));
  if (conditions.length > 0) {
    return query.where(and(...conditions));
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
  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(rawMaterials.status, filters.status as any));
  }
  if (filters?.category) {
    conditions.push(eq(rawMaterials.category, filters.category));
  }
  const query = db.select().from(rawMaterials).orderBy(rawMaterials.name);
  if (conditions.length > 0) {
    return query.where(and(...conditions));
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
  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(workOrders.status, filters.status as any));
  }
  if (filters?.warehouseId) {
    conditions.push(eq(workOrders.warehouseId, filters.warehouseId));
  }
  let query = db.select({
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
    .leftJoin(products, eq(workOrders.productId, products.id));
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  const result = await query.orderBy(desc(workOrders.createdAt));
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
  const conditions = [];
  if (filters?.rawMaterialId) {
    conditions.push(eq(rawMaterialInventory.rawMaterialId, filters.rawMaterialId));
  }
  if (filters?.warehouseId) {
    conditions.push(eq(rawMaterialInventory.warehouseId, filters.warehouseId));
  }
  const query = db.select().from(rawMaterialInventory);
  if (conditions.length > 0) {
    return query.where(and(...conditions));
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
  return db.transaction(async (tx) => {
    const recResult = await tx.insert(poReceivingRecords).values({
      purchaseOrderId, shipmentId, receivedDate: new Date(), receivedBy, warehouseId,
    });
    const receivingId = recResult[0].insertId;

    for (const item of items) {
      await tx.insert(poReceivingItems).values({
        receivingRecordId: receivingId, purchaseOrderItemId: item.purchaseOrderItemId,
        rawMaterialId: item.rawMaterialId, productId: item.productId,
        receivedQuantity: item.quantity.toString(), unit: item.unit,
        lotNumber: item.lotNumber, expirationDate: item.expirationDate, condition: 'good',
      });
      if (item.rawMaterialId) {
        const invResult = await tx.select().from(rawMaterialInventory)
          .where(and(eq(rawMaterialInventory.rawMaterialId, item.rawMaterialId), eq(rawMaterialInventory.warehouseId, warehouseId)))
          .limit(1);
        const currentInv = invResult[0];
        const currentQty = parseFloat(currentInv?.quantity?.toString() || '0');
        const newQty = currentQty + item.quantity;
        const invData = {
          quantity: newQty.toFixed(4), availableQuantity: newQty.toFixed(4),
          unit: item.unit, lastReceivedDate: new Date(),
          lotNumber: item.lotNumber, expirationDate: item.expirationDate,
        };
        if (currentInv) {
          await tx.update(rawMaterialInventory).set(invData).where(eq(rawMaterialInventory.id, currentInv.id));
        } else {
          await tx.insert(rawMaterialInventory).values({
            rawMaterialId: item.rawMaterialId, warehouseId, ...invData,
          });
        }
        await tx.insert(rawMaterialTransactions).values({
          rawMaterialId: item.rawMaterialId, warehouseId, transactionType: 'receive',
          quantity: item.quantity.toFixed(4), previousQuantity: currentQty.toFixed(4),
          newQuantity: newQty.toFixed(4), unit: item.unit,
          referenceType: 'purchase_order', referenceId: purchaseOrderId,
          lotNumber: item.lotNumber, performedBy: receivedBy,
        });
      }
      const poItem = await tx.select().from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId)).limit(1);
      if (poItem[0]) {
        const prevReceived = parseFloat(poItem[0].receivedQuantity?.toString() || '0');
        await tx.update(purchaseOrderItems)
          .set({ receivedQuantity: (prevReceived + item.quantity).toFixed(4) })
          .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId));
      }
    }
    const poItems = await tx.select().from(purchaseOrderItems)
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
      await tx.update(purchaseOrders).set({ status: 'received', receivedDate: new Date() })
        .where(eq(purchaseOrders.id, purchaseOrderId));
    } else if (anyReceived) {
      await tx.update(purchaseOrders).set({ status: 'partial' })
        .where(eq(purchaseOrders.id, purchaseOrderId));
    }
    let shipmentToUpdate = shipmentId;
    if (!shipmentToUpdate) {
      const linkedShipment = await tx.select().from(shipments)
        .where(eq(shipments.purchaseOrderId, purchaseOrderId)).limit(1);
      if (linkedShipment[0]) { shipmentToUpdate = linkedShipment[0].id; }
    }
    if (shipmentToUpdate) {
      if (allReceived) {
        await tx.update(shipments).set({ status: 'delivered', deliveryDate: new Date() })
          .where(eq(shipments.id, shipmentToUpdate));
      } else if (anyReceived) {
        const currentShipment = await tx.select().from(shipments)
          .where(eq(shipments.id, shipmentToUpdate)).limit(1);
        if (currentShipment[0]?.status === 'pending') {
          await tx.update(shipments).set({ status: 'in_transit' })
            .where(eq(shipments.id, shipmentToUpdate));
        }
      }
    }
    return { id: receivingId };
  });
}

export async function consumeWorkOrderMaterials(workOrderId: number, performedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) throw new Error("Work order not found");
  const whId = workOrder.warehouseId || 0;

  await db.transaction(async (tx) => {
    const materials = await tx.select().from(workOrderMaterials)
      .where(eq(workOrderMaterials.workOrderId, workOrderId));

    for (const mat of materials) {
      if (!mat.rawMaterialId) continue;
      const requiredQty = parseFloat(mat.requiredQuantity?.toString() || '0');
      const invResult = await tx.select().from(rawMaterialInventory)
        .where(and(eq(rawMaterialInventory.rawMaterialId, mat.rawMaterialId), eq(rawMaterialInventory.warehouseId, whId)))
        .limit(1);
      const inv = invResult[0];
      if (!inv) {
        await tx.update(workOrderMaterials).set({ status: 'shortage' })
          .where(eq(workOrderMaterials.id, mat.id));
        continue;
      }
      const currentQty = parseFloat(inv.quantity?.toString() || '0');
      const consumeQty = Math.min(requiredQty, currentQty);
      const newQty = currentQty - consumeQty;
      await tx.update(rawMaterialInventory).set({
        quantity: newQty.toFixed(4), availableQuantity: newQty.toFixed(4),
      }).where(eq(rawMaterialInventory.id, inv.id));
      await tx.insert(rawMaterialTransactions).values({
        rawMaterialId: mat.rawMaterialId, warehouseId: whId,
        transactionType: 'consume', quantity: (-consumeQty).toFixed(4),
        previousQuantity: currentQty.toFixed(4), newQuantity: newQty.toFixed(4),
        unit: mat.unit, referenceType: 'work_order', referenceId: workOrderId, performedBy,
      });
      await tx.update(workOrderMaterials).set({
        consumedQuantity: consumeQty.toFixed(4),
        status: consumeQty >= requiredQty ? 'consumed' : 'partial',
      }).where(eq(workOrderMaterials.id, mat.id));
    }

    const updatedMaterials = await tx.select().from(workOrderMaterials)
      .where(eq(workOrderMaterials.workOrderId, workOrderId));
    const allFullyConsumed = updatedMaterials.every(
      m => m.status === 'consumed' || !m.rawMaterialId
    );
    const hasShortageOrPartial = updatedMaterials.some(
      m => m.status === 'shortage' || m.status === 'partial'
    );

    if (allFullyConsumed) {
      await tx.update(workOrders).set({ status: 'completed', actualEndDate: new Date() })
        .where(eq(workOrders.id, workOrderId));
    } else if (hasShortageOrPartial) {
      await tx.update(workOrders).set({ status: 'in_progress' })
        .where(eq(workOrders.id, workOrderId));
    }
  });
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

const GRAMS_PER_LB = 453.592;
const GRAMS_PER_KG = 1000;
const GRAMS_PER_OZ = 28.3495;

function toPerGram(costPerUnit: number, costUnit: string): number {
  switch (costUnit) {
    case "per_lb":
      return costPerUnit / GRAMS_PER_LB;
    case "per_kg":
      return costPerUnit / GRAMS_PER_KG;
    case "per_oz":
      return costPerUnit / GRAMS_PER_OZ;
    default:
      return costPerUnit / GRAMS_PER_KG;
  }
}

/**
 * Calculate the cost for an ingredient line.
 * For weight-based units (per_lb, per_kg, per_oz), `quantity` is grams.
 * For per_each, `quantity` is item count (stored in quantityGrams by convention).
 */
function ingredientLineCost(quantity: number, costPerUnit: number, costUnit: string): number {
  if (costUnit === "per_each") {
    return quantity * costPerUnit;
  }
  return quantity * toPerGram(costPerUnit, costUnit);
}

type RecipeCostLine = {
  lineId: number;
  lineNumber: number;
  grams: number;
  cost: number;
  ingredient?: {
    id: number;
    name: string;
    sku: string;
  };
  subRecipe?: {
    id: number;
    name: string;
    recipeId: string;
  };
};

async function computeSubRecipeCost(
  recipeId: number,
  quantityGrams: number,
  formulation: "wet" | "dry",
  visitedIds: Set<number> = new Set(),
): Promise<{ total: number; breakdown: RecipeCostLine[] }> {
  if (visitedIds.has(recipeId)) {
    throw new Error(`Cyclic sub-recipe reference detected: recipe ${recipeId} is already an ancestor in this cost tree`);
  }
  if (visitedIds.size > 50) {
    throw new Error(`Sub-recipe nesting too deep (>${visitedIds.size} levels) when processing recipe ${recipeId}`);
  }
  const visited = new Set(visitedIds);
  visited.add(recipeId);

  const subRecipe = await getRecipeById(recipeId);
  if (!subRecipe) return { total: 0, breakdown: [] };
  const lines = await getRecipeLines(recipeId);
  const scaleFactor = parseFloat(subRecipe.baseBatchGrams?.toString() || "1") > 0
    ? quantityGrams / parseFloat(subRecipe.baseBatchGrams.toString())
    : 1;
  const breakdown: RecipeCostLine[] = [];

  for (const line of lines) {
    const wetGrams = parseFloat(line.quantityGrams?.toString() || "0");
    const dryGrams = parseFloat(line.quantityGramsDry?.toString() || "0");
    const baseGrams = formulation === "dry" && dryGrams > 0 ? dryGrams : wetGrams;
    const grams = baseGrams * scaleFactor;
    if (line.subRecipeId) {
      const nested = await computeSubRecipeCost(line.subRecipeId, grams, formulation, visited);
      breakdown.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        grams,
        cost: nested.total,
      });
      continue;
    }
    if (!line.ingredientId) continue;
    const ingredient = await getIngredientById(line.ingredientId);
    if (!ingredient) continue;
    const unitCost = parseFloat(ingredient.costPerUnit?.toString() || "0");
    const costUnit = ingredient.costUnit || "per_kg";
    const cost = ingredientLineCost(grams, unitCost, costUnit);
    breakdown.push({
      lineId: line.id,
      lineNumber: line.lineNumber,
      grams,
      cost,
      ingredient: { id: ingredient.id, name: ingredient.name, sku: ingredient.sku },
    });
  }

  const total = breakdown.reduce((sum, b) => sum + b.cost, 0);
  return { total, breakdown };
}

export async function getIngredients(filters?: { category?: string; active?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.category) conditions.push(eq(recipeIngredients.category, filters.category as any));
  if (typeof filters?.active === "boolean") conditions.push(eq(recipeIngredients.isActive, filters.active));
  const query = db.select().from(recipeIngredients).orderBy(recipeIngredients.name);
  return conditions.length > 0 ? query.where(and(...conditions)) : query;
}

export async function getIngredientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(recipeIngredients).where(eq(recipeIngredients.id, id)).limit(1);
  return result[0];
}

export async function getIngredientCostHistory(ingredientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingredientCostHistory)
    .where(eq(ingredientCostHistory.ingredientId, ingredientId))
    .orderBy(desc(ingredientCostHistory.effectiveDate));
}

export async function createIngredient(data: Omit<InsertRecipeIngredient, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recipeIngredients).values(data).$returningId();
  return { id: result[0].id };
}

export async function updateIngredient(id: number, data: Partial<InsertRecipeIngredient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(recipeIngredients).set({ ...data, updatedAt: new Date() }).where(eq(recipeIngredients.id, id));
}

export async function addIngredientCostEntry(data: Omit<InsertIngredientCostHistory, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ingredientCostHistory).values(data).$returningId();
  await updateIngredient(data.ingredientId, {
    costPerUnit: data.costPerUnit,
    costUnit: data.costUnit,
    supplierId: data.supplierId,
  });
  return { id: result[0].id };
}

export async function getRecipes(filters?: { category?: string; status?: string; isSubRecipe?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.category) conditions.push(eq(recipes.category, filters.category as any));
  if (filters?.status) conditions.push(eq(recipes.status, filters.status as any));
  if (typeof filters?.isSubRecipe === "boolean") conditions.push(eq(recipes.isSubRecipe, filters.isSubRecipe));
  const query = db.select().from(recipes).orderBy(desc(recipes.updatedAt));
  return conditions.length > 0 ? query.where(and(...conditions)) : query;
}

export async function getRecipeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  return result[0];
}

export async function getRecipeLines(recipeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(recipeLines).where(eq(recipeLines.recipeRowId, recipeId)).orderBy(recipeLines.lineNumber);
}

export async function getRecipeProcedures(recipeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(recipeProcedures).where(eq(recipeProcedures.recipeRowId, recipeId)).orderBy(recipeProcedures.stepNumber);
}

export async function createRecipe(data: Omit<InsertRecipe, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recipes).values(data).$returningId();
  return { id: result[0].id };
}

export async function updateRecipe(id: number, data: Partial<InsertRecipe>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(recipes).set({ ...data, updatedAt: new Date() }).where(eq(recipes.id, id));
}

export async function getRecipeLineById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(recipeLines).where(eq(recipeLines.id, id)).limit(1);
  return result[0];
}

/**
 * Detect whether adding `subRecipeId` as a sub-recipe of `parentRecipeId`
 * would introduce a cycle in the recipe graph.
 */
export async function detectSubRecipeCycle(parentRecipeId: number, subRecipeId: number): Promise<boolean> {
  if (subRecipeId === parentRecipeId) return true;
  const visited = new Set<number>();
  const stack = [subRecipeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === parentRecipeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const lines = await getRecipeLines(current);
    for (const line of lines) {
      if (line.subRecipeId) {
        stack.push(line.subRecipeId);
      }
    }
  }
  return false;
}

export async function createRecipeLine(
  data: Omit<InsertRecipeLine, "id" | "createdAt" | "updatedAt">,
  opts?: { skipCycleCheck?: boolean },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.subRecipeId && !opts?.skipCycleCheck) {
    const isCyclic = await detectSubRecipeCycle(data.recipeRowId, data.subRecipeId);
    if (isCyclic) {
      throw new Error(`Adding sub-recipe ${data.subRecipeId} to recipe ${data.recipeRowId} would create a cyclic reference`);
    }
  }
  const result = await db.insert(recipeLines).values(data).$returningId();
  return { id: result[0].id };
}

export async function updateRecipeLine(id: number, data: Partial<InsertRecipeLine>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.subRecipeId) {
    const existing = await getRecipeLineById(id);
    if (existing) {
      const isCyclic = await detectSubRecipeCycle(existing.recipeRowId, data.subRecipeId);
      if (isCyclic) {
        throw new Error(`Updating line ${id} with sub-recipe ${data.subRecipeId} would create a cyclic reference`);
      }
    }
  }
  await db.update(recipeLines).set({ ...data, updatedAt: new Date() }).where(eq(recipeLines.id, id));
}

export async function deleteRecipeLine(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(recipeLines).where(eq(recipeLines.id, id));
}

export async function reorderRecipeLines(recipeId: number, lineIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (let idx = 0; idx < lineIds.length; idx++) {
    await db.update(recipeLines).set({ lineNumber: idx + 1 }).where(eq(recipeLines.id, lineIds[idx]));
  }
  await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, recipeId));
}

export async function createRecipeProcedure(data: Omit<InsertRecipeProcedure, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recipeProcedures).values(data).$returningId();
  return { id: result[0].id };
}

export async function calculateRecipeBatchCost(input: {
  recipeId: number;
  formulation: "wet" | "dry";
  batchGrams?: number;
  scaleFactor?: number;
  targetLbs?: number;
}) {
  const recipe = await getRecipeById(input.recipeId);
  if (!recipe) return null;

  const baseBatch = parseFloat(recipe.baseBatchGrams?.toString() || "0");
  const targetFromLbs = input.targetLbs ? input.targetLbs * GRAMS_PER_LB : undefined;
  const requestedBatch = targetFromLbs || input.batchGrams || (input.scaleFactor ? baseBatch * input.scaleFactor : baseBatch);
  const effectiveScale = baseBatch > 0 ? requestedBatch / baseBatch : 1;
  const visitedIds = new Set<number>([input.recipeId]);
  const lines = await getRecipeLines(input.recipeId);
  const resultLines: RecipeCostLine[] = [];
  const subRecipeCosts: Array<{ recipe: string; grams: number; cost: number; lineCosts: RecipeCostLine[] }> = [];
  const perEachLineIds = new Set<number>();

  for (const line of lines) {
    const wetGrams = parseFloat(line.quantityGrams?.toString() || "0");
    const dryGrams = parseFloat(line.quantityGramsDry?.toString() || "0");
    const baseGrams = input.formulation === "dry" && dryGrams > 0 ? dryGrams : wetGrams;
    const grams = baseGrams * effectiveScale;
    if (line.subRecipeId) {
      const nested = await computeSubRecipeCost(line.subRecipeId, grams, input.formulation, visitedIds);
      const subRecipe = await getRecipeById(line.subRecipeId);
      subRecipeCosts.push({
        recipe: subRecipe?.name || `Sub-recipe ${line.subRecipeId}`,
        grams,
        cost: nested.total,
        lineCosts: nested.breakdown,
      });
      resultLines.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        grams,
        cost: nested.total,
        subRecipe: subRecipe ? { id: subRecipe.id, name: subRecipe.name, recipeId: subRecipe.recipeId } : undefined,
      });
      continue;
    }
    if (!line.ingredientId) continue;
    const ingredient = await getIngredientById(line.ingredientId);
    if (!ingredient) continue;
    const costUnit = ingredient.costUnit || "per_kg";
    const cost = ingredientLineCost(grams, parseFloat(ingredient.costPerUnit?.toString() || "0"), costUnit);
    if (costUnit === "per_each") {
      perEachLineIds.add(line.id);
    }
    resultLines.push({
      lineId: line.id,
      lineNumber: line.lineNumber,
      grams,
      cost,
      ingredient: { id: ingredient.id, name: ingredient.name, sku: ingredient.sku },
    });
  }

  const totalCost = resultLines.reduce((sum, l) => sum + l.cost, 0);
  // Exclude per_each lines from gram totals — their quantity is item count, not weight
  const totalGrams = resultLines.reduce((sum, l) => perEachLineIds.has(l.lineId) ? sum : sum + l.grams, 0);
  const yieldPct = parseFloat(recipe.expectedYieldPct?.toString() || "1");
  const yieldGrams = totalGrams * yieldPct;
  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    formulation: input.formulation,
    totalBatchGrams: totalGrams,
    totalCost,
    costPerGram: totalGrams > 0 ? totalCost / totalGrams : 0,
    costPerLb: totalGrams > 0 ? totalCost / (totalGrams / GRAMS_PER_LB) : 0,
    costPerKg: totalGrams > 0 ? totalCost / (totalGrams / GRAMS_PER_KG) : 0,
    yieldAdjustedCostPerLb: yieldGrams > 0 ? totalCost / (yieldGrams / GRAMS_PER_LB) : 0,
    lines: resultLines.map((l) => ({ ...l, pctOfTotal: totalCost > 0 ? l.cost / totalCost : 0 })),
    subRecipeCosts,
  };
}

export async function saveBatchCostSnapshot(data: Omit<InsertBatchCostSnapshot, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(batchCostSnapshots).values(data).$returningId();
  return { id: result[0].id };
}

export async function getRecipeCostHistory(recipeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(batchCostSnapshots)
    .where(eq(batchCostSnapshots.recipeId, recipeId))
    .orderBy(desc(batchCostSnapshots.snapshotDate));
}
