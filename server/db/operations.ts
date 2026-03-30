import { eq, and, or, desc, sql, count, sum, inArray, like } from "drizzle-orm";
import {
  products, InsertProduct, inventory, InsertInventory,
  warehouses, InsertWarehouse, productionBatches,
  inventoryTransfers, InsertInventoryTransfer, inventoryTransferItems, InsertInventoryTransferItem,
  purchaseOrders, purchaseOrderItems,
  inventoryLots, InsertInventoryLot, inventoryBalances, InsertInventoryBalance,
  inventoryTransactions, InsertInventoryTransaction, workOrderOutputs, InsertWorkOrderOutput,
  shopifyStores, InsertShopifyStore, webhookEvents, InsertWebhookEvent,
  shopifySkuMappings, InsertShopifySkuMapping, shopifyLocationMappings, InsertShopifyLocationMapping,
  vendors,
} from "../../drizzle/schema";
import { getDb } from "./connection";

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

      if (data.quantityAdjustment !== undefined) {
        const [current] = await db.select().from(inventory).where(eq(inventory.id, id)).limit(1);
        if (current) {
          const currentQty = parseFloat(current.quantity || '0');
          const newQty = Math.max(0, currentQty + data.quantityAdjustment);
          updateData.quantity = newQty.toString();
        }
      }

      if (data.warehouseId !== undefined) {
        updateData.warehouseId = data.warehouseId;
      }

      if (data.reorderLevel !== undefined) {
        updateData.reorderLevel = data.reorderLevel;
      }

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

  if (filters?.companyId) conditions.push(eq(warehouses.companyId, filters.companyId));
  if (filters?.type) conditions.push(eq(warehouses.type, filters.type as any));
  if (filters?.status) conditions.push(eq(warehouses.status, filters.status as any));

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

  // Note: createAuditLog is imported at the call site level in the original code
  // The cross-domain call is preserved as-is
  const { createAuditLog } = await import("./system");
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
// INVENTORY TRANSFERS
// ============================================

export async function getInventoryTransfers(filters?: { status?: string; fromWarehouseId?: number; toWarehouseId?: number }) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(inventoryTransfers);
  const conditions = [];

  if (filters?.status) conditions.push(eq(inventoryTransfers.status, filters.status as any));
  if (filters?.fromWarehouseId) conditions.push(eq(inventoryTransfers.fromWarehouseId, filters.fromWarehouseId));
  if (filters?.toWarehouseId) conditions.push(eq(inventoryTransfers.toWarehouseId, filters.toWarehouseId));

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

  const transfer = await getTransferById(transferId);
  if (!transfer) throw new Error("Transfer not found");

  const items = await getTransferItems(transferId);

  for (const item of items) {
    const qty = parseFloat(item.requestedQuantity as string) || 0;
    await updateInventoryQuantity(item.productId, transfer.fromWarehouseId, -qty);
  }

  await updateTransfer(transferId, {
    status: 'in_transit',
    shippedDate: new Date(),
  });

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

  const transfer = await getTransferById(transferId);
  if (!transfer) throw new Error("Transfer not found");

  for (const received of receivedItems) {
    const item = await db.select().from(inventoryTransferItems).where(eq(inventoryTransferItems.id, received.itemId)).limit(1);
    if (item[0]) {
      await updateInventoryQuantity(item[0].productId, transfer.toWarehouseId, received.receivedQuantity);
      await updateTransferItem(received.itemId, {
        receivedQuantity: received.receivedQuantity.toString(),
      });
    }
  }

  await updateTransfer(transferId, {
    status: 'received',
    receivedDate: new Date(),
  });

  return { success: true };
}

export async function getLocationInventorySummary() {
  const db = await getDb();
  if (!db) return [];

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

  await db.update(inventoryBalances)
    .set({ quantity: newAvailable.toString(), updatedAt: new Date() })
    .where(eq(inventoryBalances.id, available[0].id));

  await upsertInventoryBalance(lotId, productId, warehouseId, 'reserved', quantity, available[0].unit);

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

  await db.update(inventoryBalances)
    .set({ quantity: newReserved.toString(), updatedAt: new Date() })
    .where(eq(inventoryBalances.id, reserved[0].id));

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

  await db.update(inventoryBalances)
    .set({ quantity: newReserved.toString(), updatedAt: new Date() })
    .where(eq(inventoryBalances.id, reserved[0].id));

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

  const { id: lotId, lotCode } = await createInventoryLot({
    productId,
    productType: 'finished',
    sourceType: 'production',
    sourceReferenceId: workOrderId,
    status: 'active',
    manufactureDate: new Date()
  });

  const result = await db.insert(workOrderOutputs).values({
    workOrderId,
    lotId,
    productId,
    quantity: quantity.toString(),
    yieldPercent: yieldPercent?.toString(),
    warehouseId,
    producedBy: performedBy
  });

  await upsertInventoryBalance(lotId, productId, warehouseId, 'available', quantity, 'EA');

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

// Get all products with their BOMs for forecasting
export async function getProductsWithBoms() {
  const db = await getDb();
  if (!db) return [];

  const { billOfMaterials } = await import("../../drizzle/schema");

  const result = await db.select({
    product: products,
    bom: billOfMaterials,
  })
  .from(products)
  .leftJoin(billOfMaterials, eq(billOfMaterials.productId, products.id));

  return result;
}
export async function checkAndTriggerLowStockPurchaseOrder(
  inventoryId: number,
  userId: number
): Promise<{ triggered: boolean; purchaseOrderId?: number; alertId?: number; reason?: string }> {
  const { createAlert } = await import("./system");
  const { createPurchaseOrder, createPurchaseOrderItem } = await import("./procurement");
  const { createAuditLog } = await import("./system");
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
export async function runInventoryReconciliation(channel: 'shopify' | 'amazon' | 'all', storeId?: number, initiatedBy?: number) {
  const { createReconciliationRun, updateReconciliationRun, createReconciliationLine } = await import("./finance");
  const { getInventoryAllocations } = await import("./sales");
  const { createAlert } = await import("./system");
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

